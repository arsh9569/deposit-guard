import { Router } from 'express';
import { Types, type HydratedDocument, type Model } from 'mongoose';
import { auditWriter } from '../auth/audit-writer.js';
import type { AuditWriter } from '../auth/types.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireInstitutionRole } from '../middleware/authorization.js';
import { DocumentModel, type DocumentRecord } from '../models/documents.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { NotificationModel, type NotificationRecord } from '../models/notifications.js';
import { ReleaseRequestModel, type ReleaseRequestRecord } from '../models/release-requests.js';
import { RenewalRecordModel, type RenewalRecord } from '../models/renewal-records.js';
import { WorkflowPolicyModel, type WorkflowPolicyRecord } from '../models/workflow-policies.js';
import type { RenewalStatus } from '../models/domain.js';
import {
  releaseRequestSchema, releaseTransitionSchema, renewalRequestSchema,
  renewalTransitionSchema, workflowPolicyUpdateSchema, notificationReadCommandSchema,
} from '../validators/model-schemas.js';
import { generateMaturityNotifications, findOverdueCases, retryNotificationDelivery, type NotificationDelivery } from '../services/maturity-monitoring.js';
import { assertReplacementLink, transitionRelease, transitionRenewal } from '../services/workflow-transitions.js';
import { idempotentReleaseReplay, isValidIdempotencyKey, releaseRequestFingerprint } from '../services/release-idempotency.js';

const fdrs = FdrModel as Model<FdrRecord>;
type FdrDocument = HydratedDocument<FdrRecord>;
async function findFdr(filter: Record<string, unknown>): Promise<FdrDocument | null> {
  return await fdrs.findOne(filter) as unknown as FdrDocument | null;
}
const documents = DocumentModel as Model<DocumentRecord>;
const renewals = RenewalRecordModel as Model<RenewalRecord>;
const releases = ReleaseRequestModel as Model<ReleaseRequestRecord>;
const policies = WorkflowPolicyModel as Model<WorkflowPolicyRecord>;
const notifications = NotificationModel as Model<NotificationRecord>;
const operators = ['institution_admin', 'institution_operator'] as const;
const reviewers = ['institution_admin', 'official_reviewer'] as const;
const management = ['institution_admin'] as const;
const allInstitutionRoles = ['institution_admin', 'institution_operator', 'official_reviewer', 'auditor'] as const;
const routeParam = (req: import('express').Request, name: string) => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};

export interface InstitutionWorkflowDependencies {
  audit?: AuditWriter;
  notificationDelivery?: NotificationDelivery;
  now?: () => Date;
}

export function createInstitutionWorkflowRouter(dependencies: InstitutionWorkflowDependencies = {}) {
  const router = Router({ mergeParams: true });
  const audit = dependencies.audit ?? auditWriter;
  const now = dependencies.now ?? (() => new Date());
  // Notifications are durable in-app inbox entries. External channels can replace this adapter later.
  const delivery = dependencies.notificationDelivery ?? { async deliver() {} };
  router.use(requireAuthentication);
  const institution = (req: import('express').Request) => new Types.ObjectId(req.institutionScope!.institutionId);
  const auditAction = async (req: import('express').Request, action: string, targetType: string, targetId: string, reason: string, metadataRedacted: Record<string, unknown> = {}) => {
    await audit.write({ action, institutionId: req.institutionScope!.institutionId, actorId: String(req.authUser!._id), actorRoleSnapshot: req.institutionScope!.roles, targetType, targetId, reason, requestId: req.requestId, metadataRedacted });
  };
  const verifyDocuments = async (ids: string[], institutionId: Types.ObjectId) => {
    if (!ids.length) return true;
    const count = await documents.countDocuments({ _id: { $in: ids }, institutionId, retentionState: 'active' });
    return count === ids.length;
  };

  router.get('/notifications', requireInstitutionRole(allInstitutionRoles), async (req, res, next) => {
    try {
      const items = await notifications.find({ institutionId: institution(req), recipientId: req.authUser!._id }).sort({ createdAt: -1 }).limit(100).lean().exec();
      res.json({ notifications: items });
    } catch (error) { next(error); }
  });
  router.post('/notifications/read', requireInstitutionRole(allInstitutionRoles), async (req, res, next) => {
    try {
      const parsed = notificationReadCommandSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid notification read request', issues: parsed.error.issues }); return; }
      const result = await notifications.updateMany({ institutionId: institution(req), recipientId: req.authUser!._id, _id: { $in: parsed.data.notificationIds }, state: 'unread' }, { $set: { state: 'read', readAt: now() } });
      res.json({ markedRead: result.modifiedCount });
    } catch (error) { next(error); }
  });

  router.get('/maturity/policy', requireInstitutionRole([...management]), async (req, res, next) => {
    try { res.json({ policy: await policies.findOne({ institutionId: institution(req) }).lean().exec() }); }
    catch (error) { next(error); }
  });
  router.put('/maturity/policy', requireInstitutionRole([...management]), async (req, res, next) => {
    try {
      const parsed = workflowPolicyUpdateSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid workflow policy', issues: parsed.error.issues }); return; }
      const policy = await policies.findOneAndUpdate(
        { institutionId: institution(req) },
        { $set: { ...parsed.data, updatedBy: req.authUser!._id }, $setOnInsert: { institutionId: institution(req) } },
        { upsert: true, new: true, runValidators: true },
      );
      await auditAction(req, 'workflow.policy.updated', 'workflow_policy', String(policy!._id), 'Institution workflow policy updated', { reminderDays: parsed.data.maturityReminderDays, releaseEvidenceRequired: parsed.data.releaseEvidenceRequired });
      res.json({ policy });
    } catch (error) { next(error); }
  });
  router.get('/maturity/cases', requireInstitutionRole([...operators, ...reviewers]), async (req, res, next) => {
    try {
      const current = now(); const today = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
      const records = await fdrs.find({ institutionId: institution(req), instrumentState: { $in: ['active', 'matured'] }, maturityDate: { $lt: today } }).select('_id maturityDate').lean().exec();
      res.json({ asOf: today, overdueCases: findOverdueCases(records, current) });
    } catch (error) { next(error); }
  });
  router.post('/maturity/run', requireInstitutionRole([...management]), async (req, res, next) => {
    try {
      const current = now();
      const generated = await generateMaturityNotifications(institution(req).toString(), current, audit, req.requestId, String(req.authUser!._id));
      const policy = await policies.findOne({ institutionId: institution(req) }).lean().exec();
      const deliveryResult = await retryNotificationDelivery(institution(req).toString(), current, policy, delivery);
      await auditAction(req, 'maturity.monitoring.run', 'institution', institution(req).toString(), 'Maturity monitoring completed', { notificationsCreated: generated.created, ...deliveryResult });
      res.json({ asOf: current, ...generated, delivery: deliveryResult });
    } catch (error) { next(error); }
  });

  router.post('/renewals', requireInstitutionRole([...operators]), async (req, res, next) => {
    try {
      const parsed = renewalRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid renewal request', issues: parsed.error.issues }); return; }
      const tenant = institution(req);
      const source = await findFdr({ _id: parsed.data.sourceInstrumentId, institutionId: tenant });
      if (!source) { res.status(404).json({ error: 'Source instrument not found' }); return; }
      if (!(await verifyDocuments(parsed.data.supportingDocumentIds, tenant))) { res.status(400).json({ error: 'Supporting evidence is unavailable in this institution' }); return; }
      let replacement: FdrDocument | null = null;
      if (parsed.data.replacementInstrumentId) {
        replacement = await findFdr({ _id: parsed.data.replacementInstrumentId, institutionId: tenant });
        if (!replacement) { res.status(404).json({ error: 'Replacement instrument not found' }); return; }
        try { assertReplacementLink(String(source._id), source.supersededByInstrumentIds.map(String), String(replacement._id), replacement.supersedesInstrumentId ? String(replacement.supersedesInstrumentId) : undefined); }
        catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
      }
      const record = await renewals.create({ institutionId: tenant, sourceInstrumentId: source._id, replacementInstrumentId: replacement?._id, requestedBy: req.authUser!._id, kind: parsed.data.kind, status: 'pending', reason: parsed.data.reason, supportingDocumentIds: parsed.data.supportingDocumentIds, history: [{ to: 'pending', actorId: req.authUser!._id, reason: parsed.data.reason, at: now() }] });
      if (replacement) {
        replacement.supersedesInstrumentId = source._id; await replacement.save();
        if (!source.supersededByInstrumentIds.some((id) => String(id) === String(replacement!._id))) source.supersededByInstrumentIds.push(replacement._id);
        await source.save();
      }
      await auditAction(req, 'renewal.created', 'renewal', String(record._id), parsed.data.reason, { kind: parsed.data.kind, sourceInstrumentId: String(source._id), replacementInstrumentId: replacement ? String(replacement._id) : undefined });
      res.status(201).json({ id: record.id, status: record.status, replacementInstrumentId: record.replacementInstrumentId });
    } catch (error) { next(error); }
  });
  router.get('/renewals', requireInstitutionRole([...operators, ...reviewers]), async (req, res, next) => {
    try {
      const items = await renewals.find({ institutionId: institution(req) }).sort({ createdAt: -1 }).limit(200).lean().exec();
      res.json({ renewals: items });
    } catch (error) { next(error); }
  });
  router.post('/renewals/:renewalId/transition', requireInstitutionRole([...operators, ...reviewers]), async (req, res, next) => {
    try {
      const parsed = renewalTransitionSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid renewal transition', issues: parsed.error.issues }); return; }
      const renewalId = routeParam(req, 'renewalId');
      if (!renewalId || !Types.ObjectId.isValid(renewalId)) { res.status(404).json({ error: 'Renewal not found' }); return; }
      const record = await renewals.findOne({ _id: renewalId, institutionId: institution(req) });
      if (!record) { res.status(404).json({ error: 'Renewal not found' }); return; }
      const status = transitionRenewal(record.status, parsed.data.action, req.institutionScope!.roles);
      const policy = await policies.findOne({ institutionId: institution(req) }).lean().exec();
      if (status === 'completed' && policy?.requireReplacementForRenewalCompletion) {
        if (!record.replacementInstrumentId) { res.status(400).json({ error: 'Policy requires a replacement instrument before completion' }); return; }
        const replacement = await findFdr({ _id: record.replacementInstrumentId, institutionId: institution(req), submissionStatus: 'accepted' });
        if (!replacement) { res.status(400).json({ error: 'Replacement instrument must be accepted before completion' }); return; }
      }
      if (parsed.data.replacementInstrumentId) {
        const source = await findFdr({ _id: record.sourceInstrumentId, institutionId: institution(req) });
        const replacement = await findFdr({ _id: parsed.data.replacementInstrumentId, institutionId: institution(req) });
        if (!source || !replacement) { res.status(404).json({ error: 'Replacement instrument not found' }); return; }
        try { assertReplacementLink(String(source._id), source.supersededByInstrumentIds.map(String), String(replacement._id), replacement.supersedesInstrumentId ? String(replacement.supersedesInstrumentId) : undefined); }
        catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
        replacement.supersedesInstrumentId = source._id; await replacement.save();
        if (!source.supersededByInstrumentIds.some((id) => String(id) === String(replacement._id))) { source.supersededByInstrumentIds.push(replacement._id); await source.save(); }
        record.replacementInstrumentId = replacement._id;
      }
      if (status === 'completed' && record.replacementInstrumentId) {
        const source = await findFdr({ _id: record.sourceInstrumentId, institutionId: institution(req) });
        if (source) { source.instrumentState = 'superseded'; await source.save(); }
      }
      record.history.push({ from: record.status, to: status, actorId: req.authUser!._id as Types.ObjectId, reason: parsed.data.reason, at: now() });
      const from = record.status; record.status = status as RenewalStatus; await record.save();
      await auditAction(req, `renewal.${parsed.data.action}`, 'renewal', String(record._id), parsed.data.reason, { from, to: status, replacementInstrumentId: record.replacementInstrumentId ? String(record.replacementInstrumentId) : undefined });
      res.json({ id: record.id, status: record.status });
    } catch (error) { if (error instanceof Error && (error.message.startsWith('Transition ') || error.message.startsWith('Insufficient permissions'))) { res.status(error.message.startsWith('Insufficient') ? 403 : 409).json({ error: error.message }); return; } next(error); }
  });

  router.post('/release-requests', requireInstitutionRole([...operators]), async (req, res, next) => {
    try {
      const parsed = releaseRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid release/refund request', issues: parsed.error.issues }); return; }
      const idempotencyKey = req.get('Idempotency-Key')?.trim();
      if (!isValidIdempotencyKey(idempotencyKey)) { res.status(400).json({ error: 'A valid Idempotency-Key header is required' }); return; }
      const tenant = institution(req); const policy = await policies.findOne({ institutionId: tenant }).lean().exec();
      const requestFingerprint = releaseRequestFingerprint({ ...parsed.data, supportingDocumentIds: parsed.data.supportingDocumentIds });
      const existing = await releases.findOne({ institutionId: tenant, requestedBy: req.authUser!._id, idempotencyKey }).exec();
      if (existing) {
        if (idempotentReleaseReplay(existing.requestFingerprint, requestFingerprint) === 'conflict') { res.status(409).json({ error: 'Idempotency-Key was already used for a different request' }); return; }
        res.status(200).json({ id: existing.id, status: existing.status, financialTransferInitiated: false, replayed: true });
        return;
      }
      if (policy?.releaseEvidenceRequired !== false && parsed.data.supportingDocumentIds.length === 0) { res.status(400).json({ error: 'Institution policy requires supporting evidence' }); return; }
      if (!(await verifyDocuments(parsed.data.supportingDocumentIds, tenant))) { res.status(400).json({ error: 'Supporting evidence is unavailable in this institution' }); return; }
      const instrument = await fdrs.findOne({ _id: parsed.data.instrumentId, institutionId: tenant });
      if (!instrument) { res.status(404).json({ error: 'Instrument not found' }); return; }
      let record: HydratedDocument<ReleaseRequestRecord>;
      try {
        record = await releases.create({ ...parsed.data, institutionId: tenant, requestedBy: req.authUser!._id, idempotencyKey, requestFingerprint, status: 'requested', history: [{ status: 'requested', actorId: req.authUser!._id, reason: parsed.data.reason, at: now() }] });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
        const raced = await releases.findOne({ institutionId: tenant, requestedBy: req.authUser!._id, idempotencyKey }).exec();
        if (!raced) throw error;
        if (idempotentReleaseReplay(raced.requestFingerprint, requestFingerprint) === 'conflict') { res.status(409).json({ error: 'Idempotency-Key was already used for a different request' }); return; }
        res.status(200).json({ id: raced.id, status: raced.status, financialTransferInitiated: false, replayed: true });
        return;
      }
      await auditAction(req, 'release_request.created', 'release_request', String(record._id), parsed.data.reason, { requestType: parsed.data.requestType, instrumentId: String(instrument._id), supportingDocumentCount: parsed.data.supportingDocumentIds.length });
      res.status(201).json({ id: record.id, status: record.status, financialTransferInitiated: false });
    } catch (error) { next(error); }
  });
  router.get('/release-requests', requireInstitutionRole([...operators, ...reviewers]), async (req, res, next) => {
    try {
      const items = await releases.find({ institutionId: institution(req) }).sort({ createdAt: -1 }).limit(200).lean().exec();
      res.json({ requests: items, financialTransfersInitiated: false });
    } catch (error) { next(error); }
  });
  router.post('/release-requests/:requestId/transition', requireInstitutionRole([...operators, ...reviewers]), async (req, res, next) => {
    try {
      const parsed = releaseTransitionSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid release/refund transition', issues: parsed.error.issues }); return; }
      const requestId = routeParam(req, 'requestId');
      if (!requestId || !Types.ObjectId.isValid(requestId)) { res.status(404).json({ error: 'Release/refund request not found' }); return; }
      const record = await releases.findOne({ _id: requestId, institutionId: institution(req) });
      if (!record) { res.status(404).json({ error: 'Release/refund request not found' }); return; }
      const status = transitionRelease(record.status, parsed.data.action, req.institutionScope!.roles);
      if (parsed.data.action === 'approve') { record.approvedBy = req.authUser!._id as Types.ObjectId; record.approvalReason = parsed.data.reason; }
      if (parsed.data.action === 'complete') {
        if (!parsed.data.completionEvidenceRef) { res.status(400).json({ error: 'Completion requires separate evidence' }); return; }
        record.completionEvidenceRef = parsed.data.completionEvidenceRef; record.completedBy = req.authUser!._id as Types.ObjectId; record.completedAt = now();
      }
      if (parsed.data.observations.length) record.scrutinyObservations.push(...parsed.data.observations);
      record.history.push({ status, actorId: req.authUser!._id as Types.ObjectId, reason: parsed.data.reason, at: now() });
      record.status = status as ReleaseRequestRecord['status']; await record.save();
      await auditAction(req, `release_request.${parsed.data.action}`, 'release_request', String(record._id), parsed.data.reason, { status, observations: parsed.data.observations.length, completionEvidenceRecorded: Boolean(record.completionEvidenceRef), financialTransferInitiated: false });
      res.json({ id: record.id, status: record.status, completionEvidenceRef: record.completionEvidenceRef, financialTransferInitiated: false });
    } catch (error) { if (error instanceof Error && (error.message.startsWith('Transition ') || error.message.startsWith('Insufficient permissions'))) { res.status(error.message.startsWith('Insufficient') ? 403 : 409).json({ error: error.message }); return; } next(error); }
  });
  return router;
}
