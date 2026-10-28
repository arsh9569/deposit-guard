import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Types, type Model } from 'mongoose';
import { auditWriter } from '../auth/audit-writer.js';
import type { AuditWriter } from '../auth/types.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireInstitutionPermission } from '../middleware/authorization.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { VerificationAttemptModel, type VerificationAttemptRecord } from '../models/verification-attempts.js';
import { verificationRequestSchema } from '../validators/model-schemas.js';
import { deterministicMockVerificationProvider, verificationDisplayLabel, type VerificationProvider } from '../services/verification-provider.js';

const fdrs = FdrModel as Model<FdrRecord>;
const attempts = VerificationAttemptModel as Model<VerificationAttemptRecord>;

export function createVerificationRouter(dependencies: { provider?: VerificationProvider; audit?: AuditWriter; now?: () => Date } = {}) {
  const router = Router({ mergeParams: true });
  const provider = dependencies.provider ?? deterministicMockVerificationProvider;
  const audit = dependencies.audit ?? auditWriter;
  const now = dependencies.now ?? (() => new Date());
  router.use(requireAuthentication);

  router.get('/instruments', requireInstitutionPermission('verification:read'), async (req, res, next) => {
    try {
      const institutionId = new Types.ObjectId(req.institutionScope!.institutionId);
      // Draft uploads may not have extracted fields yet. Filter before applying
      // the limit so incomplete drafts cannot hide available instruments.
      const records = await fdrs.find({ institutionId, reference: { $type: 'string', $ne: '' }, bankName: { $type: 'string', $ne: '' }, principalAmount: { $type: 'decimal' } }).sort({ reference: 1 }).limit(200).select('_id reference bankName principalAmount').lean().exec();
      res.json({ instruments: records.map((record) => ({ id: String(record._id), reference: record.reference, bankName: record.bankName, principalAmount: record.principalAmount.toString() })) });
    } catch (error) { next(error); }
  });

  router.get('/attempts', requireInstitutionPermission('verification:read'), async (req, res, next) => {
    try {
      const institutionId = new Types.ObjectId(req.institutionScope!.institutionId);
      const records = await attempts.find({ institutionId }).sort({ requestedAt: -1 }).limit(200).lean().exec();
      res.json({ attempts: records.map((record) => ({
        id: String(record._id), instrumentId: String(record.instrumentId), mode: record.mode,
        provider: record.adapter, status: record.status, label: verificationDisplayLabel(record.mode, record.status),
        attemptReference: record.attemptReference, responseSummary: record.responseSummary,
        failureCode: record.failureCode, requestedAt: record.requestedAt, completedAt: record.completedAt,
      })) });
    } catch (error) { next(error); }
  });

  router.post('/attempts', requireInstitutionPermission('verification:run'), async (req, res, next) => {
    try {
      const parsed = verificationRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid verification request', issues: parsed.error.issues }); return; }
      const institutionId = new Types.ObjectId(req.institutionScope!.institutionId);
      const instrument = await fdrs.findOne({ _id: parsed.data.instrumentId, institutionId }).exec();
      if (!instrument) { res.status(404).json({ error: 'Instrument not found' }); return; }
      if (!instrument.reference || !instrument.bankName || !instrument.principalAmount || !instrument.holderName) {
        res.status(409).json({ error: 'Complete the instrument details before requesting verification.' });
        return;
      }
      const timestamp = now();
      const result = await provider.verify({ reference: instrument.reference, bankName: instrument.bankName, principalAmount: instrument.principalAmount.toString(), holderName: instrument.holderName });
      const attempt = await attempts.create({
        institutionId, instrumentId: instrument._id, requestedBy: req.authUser!._id,
        adapter: provider.identity, mode: provider.mode, status: result.status,
        attemptReference: `${provider.mode === 'simulated' ? 'SIM' : 'LIVE'}-${randomUUID()}`,
        idempotencyKey: randomUUID(), responseSummary: result.responseSummary,
        failureCode: result.failureCode, requestedAt: timestamp, completedAt: timestamp,
      });
      await audit.write({
        action: 'verification.attempted', institutionId: institutionId.toString(),
        actorId: String(req.authUser!._id), actorRoleSnapshot: req.institutionScope!.roles,
        targetType: 'verification_attempt', targetId: String(attempt._id),
        reason: parsed.data.reason ?? 'Verification attempt initiated', requestId: req.requestId,
        metadataRedacted: { mode: provider.mode, provider: provider.identity, status: result.status, instrumentId: String(instrument._id) },
      });
      res.status(201).json({ attempt: {
        id: String(attempt._id), instrumentId: String(attempt.instrumentId), mode: attempt.mode,
        provider: attempt.adapter, status: attempt.status, label: verificationDisplayLabel(attempt.mode, attempt.status),
        attemptReference: attempt.attemptReference, responseSummary: attempt.responseSummary,
        failureCode: attempt.failureCode, requestedAt: attempt.requestedAt, completedAt: attempt.completedAt,
      } });
      // Simulated outcomes never modify Fdr.verificationStatus or any genuine verification state.
    } catch (error) { next(error); }
  });

  return router;
}
