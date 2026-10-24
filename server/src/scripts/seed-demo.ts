import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types, type FilterQuery, type Model, type QueryOptions, type UpdateQuery } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword } from '../auth/passwords.js';
import { AuditLogModel, DocumentModel, FdrModel, InstitutionModel, NotificationModel, OcrExtractionModel, ReleaseRequestModel, RenewalRecordModel, UserModel, VerificationAttemptModel, WorkflowPolicyModel } from '../models/index.js';
import type { AuditLogRecord } from '../models/audit-logs.js';
import { maturityDedupeKey } from '../services/maturity-monitoring.js';
import { createDemoFdrPdf } from '../demo/fixtures.js';

if (env.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production.');
const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword) throw new Error('Set DEMO_PASSWORD to a local-only password before seeding.');

const id = (value: string) => new Types.ObjectId(value.padStart(24, '0'));
const seedUpsert = (model: Model<Record<string, unknown>>, filter: Record<string, unknown>, update: Record<string, unknown>, options: QueryOptions = {}) =>
  model.findOneAndUpdate(filter as FilterQuery<Record<string, unknown>>, update as UpdateQuery<Record<string, unknown>>, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, ...options });
const institutionId = id('d600000000000000000001');
const operatorId = id('d600000000000000000002');
const reviewerId = id('d600000000000000000003');
const scenarioReviewerId = id('d600000000000000000004');
const demoIds = {
  valid: id('d600000000000000000101'), mismatch: id('d600000000000000000101'), maturity: id('d600000000000000000103'),
  predecessor: id('d600000000000000000104'), replacement: id('d600000000000000000105'), release: id('d600000000000000000106'),
  match: id('d600000000000000000107'), simulatedMismatch: id('d600000000000000000108'),
  notFound: id('d600000000000000000109'), unavailable: id('d600000000000000000110'),
};
const documentIds = { valid: id('d600000000000000000201'), mismatch: id('d600000000000000000202'), release: id('d600000000000000000203') };
const extractionIds = { mismatch: id('d600000000000000000301') };
const releaseId = id('d600000000000000000401');
const renewalId = id('d600000000000000000402');
const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
try {
  await connectDatabase();
  await seedUpsert(InstitutionModel as unknown as Model<Record<string, unknown>>, { _id: institutionId }, { $set: { name: 'Northbridge Institute of Technology', shortName: 'Northbridge Institute', externalReference: 'DEMO-NORTHBRIDGE-001', status: 'active', timezone: 'Asia/Kolkata', configuredRules: [] } });
  const passwordHash = await hashPassword(demoPassword);
  await seedUpsert(UserModel as unknown as Model<Record<string, unknown>>, { _id: operatorId }, { $set: { authSubject: 'demo:northbridge:operator', email: 'operator@northbridge.example', displayName: 'Aarav Mehta', status: 'active', passwordHash, memberships: [{ institutionId, roles: ['institution_operator'], active: true }] } });
  await seedUpsert(UserModel as unknown as Model<Record<string, unknown>>, { _id: reviewerId }, { $set: { authSubject: 'demo:northbridge:reviewer', email: 'reviewer@depositguard.example', displayName: 'Priya Nair', status: 'active', passwordHash, memberships: [{ institutionId, roles: ['official_reviewer'], active: true }] } });
  await seedUpsert(UserModel as unknown as Model<Record<string, unknown>>, { _id: scenarioReviewerId }, { $set: { authSubject: 'demo:northbridge:scenario-6-reviewer', email: 'scenario6.reviewer@northbridge.example', displayName: 'Scenario 6 Test Reviewer', status: 'active', passwordHash, memberships: [{ institutionId, roles: ['official_reviewer'], active: true }] } });

  const specs = [
    ['valid', 'FDR-2026-018', 'INSTR-018', 'State Bank of India', '2500000.00', -296, 21, 'submitted', 'pending', 'active'],
    ['maturity', 'FDR-2026-003', 'INSTR-003', 'ICICI Bank', '1250000.00', -180, 12, 'accepted', 'approved', 'active'],
    ['predecessor', 'FDR-2024-106', 'INSTR-106', 'Canara Bank', '3200000.00', -750, -12, 'accepted', 'approved', 'superseded'],
    ['replacement', 'FDR-2025-042', 'INSTR-042', 'HDFC Bank', '3200000.00', -365, 46, 'submitted', 'pending', 'active'],
    ['release', 'FDR-2024-220', 'INSTR-220', 'Canara Bank', '1800000.00', -700, -5, 'accepted', 'approved', 'matured'],
    ['match', 'FDR-2026-021', 'INSTR-021', 'Punjab National Bank', '900000.00', -120, 180, 'accepted', 'approved', 'active'],
    ['simulatedMismatch', 'FDR-2026-022', 'INSTR-022', 'Union Bank of India', '1100000.00', -110, 240, 'accepted', 'approved', 'active'],
    ['notFound', 'FDR-2026-023', 'INSTR-023', 'Bank of Baroda', '700000.00', -100, 210, 'accepted', 'approved', 'active'],
    ['unavailable', 'FDR-2026-024', 'INSTR-024', 'Indian Bank', '600000.00', -90, 270, 'accepted', 'approved', 'active'],
  ] as const;
  for (const [key, reference, instrumentNumber, bankName, amount, issueOffset, maturityOffset, submissionStatus, reviewStatus, instrumentState] of specs) {
    const recordId = demoIds[key];
    const docs = key === 'valid' ? [documentIds.valid, documentIds.mismatch] : key === 'release' ? [documentIds.release] : [];
    const fields = { reference, instrumentNumber, bankName, branchName: 'Main Branch', holderName: 'Northbridge Institute of Technology', principalAmount: Types.Decimal128.fromString(amount), currency: 'INR', issueDate: day(issueOffset), maturityDate: day(maturityOffset), documentIds: docs, supersededByInstrumentIds: key === 'predecessor' ? [demoIds.replacement] : [], ...(key === 'replacement' ? { supersedesInstrumentId: demoIds.predecessor, sourceRenewalId: renewalId } : {}), dataRevision: 1, submissionStatus, ocrStatus: key === 'valid' ? 'complete' : 'not_requested', reviewStatus, verificationStatus: 'not_requested', instrumentState, complianceState: maturityOffset < 0 ? 'overdue_action' : maturityOffset <= 30 ? 'upcoming_action' : 'current', createdBy: operatorId };
    await seedUpsert(FdrModel as unknown as Model<Record<string, unknown>>, { _id: recordId }, { $set: { institutionId, ...fields } });
  }

  const storageRoot = path.resolve(process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), '.private-documents'));
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  const docs = [
    { _id: documentIds.valid, instrumentId: demoIds.valid, ref: 'FDR-2026-018', amount: '2500000.00', maturity: day(21), bank: 'State Bank of India' },
    { _id: documentIds.mismatch, instrumentId: demoIds.mismatch, ref: 'FDR-2026-018', amount: '2450000.00', maturity: day(21), bank: 'State Bank of India' },
    { _id: documentIds.release, instrumentId: demoIds.release, ref: 'FDR-2024-220', amount: '1800000.00', maturity: day(-5), bank: 'Canara Bank' },
  ];
  for (const doc of docs) {
    const bytes = createDemoFdrPdf(doc.ref, doc.amount, doc.maturity.toISOString().slice(0, 10), doc.bank);
    const storageKey = `demo-${doc._id.toString()}.pdf`;
    await writeFile(path.join(storageRoot, storageKey), bytes, { mode: 0o600 });
    await seedUpsert(DocumentModel as unknown as Model<Record<string, unknown>>, { _id: doc._id }, { $set: { institutionId, instrumentId: doc.instrumentId, uploadedBy: operatorId, originalFileName: `${doc.ref}.pdf`, storageKey, contentType: 'application/pdf', byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose: doc._id.equals(documentIds.release) ? 'release_evidence' : 'fdr_instrument', malwareScanStatus: 'clean', retentionState: 'active' } });
  }
  const rawMismatch = { text: 'FDR Reference: FDR-2026-018\nBank Name: State Bank of India\nPrincipal Amount: INR 2450000.00', fields: { principalAmount: { value: '2450000.00', confidence: 0.96 } } };
  await seedUpsert(OcrExtractionModel as unknown as Model<Record<string, unknown>>, { _id: extractionIds.mismatch }, { $set: { institutionId, documentId: documentIds.mismatch, instrumentId: demoIds.mismatch, provider: 'deterministic-demo-pdf-text', providerVersion: '1', status: 'complete', fields: [{ fieldName: 'reference', value: 'FDR-2026-018', confidence: 0.99 }, { fieldName: 'bankName', value: 'State Bank of India', confidence: 0.97 }, { fieldName: 'principalAmount', value: '2450000.00', confidence: 0.96 }, { fieldName: 'issueDate', value: day(-296).toISOString().slice(0, 10), confidence: 0.95 }, { fieldName: 'maturityDate', value: day(21).toISOString().slice(0, 10), confidence: 0.95 }], rawResult: rawMismatch, completedAt: new Date() } });

  await seedUpsert(RenewalRecordModel as unknown as Model<Record<string, unknown>>, { _id: renewalId }, { $set: { institutionId, sourceInstrumentId: demoIds.predecessor, replacementInstrumentId: demoIds.replacement, requestedBy: operatorId, kind: 'replacement', status: 'submitted', reason: 'Synthetic replacement demonstration', supportingDocumentIds: [], history: [{ from: 'pending', to: 'submitted', actorId: operatorId, reason: 'Seeded demonstration replacement', at: new Date() }] } });
  await seedUpsert(ReleaseRequestModel as unknown as Model<Record<string, unknown>>, { _id: releaseId }, { $set: { institutionId, instrumentId: demoIds.release, requestedBy: operatorId, requestType: 'matured_refund', reason: 'Synthetic refund demonstration', supportingDocumentIds: [documentIds.release], status: 'under_review', scrutinyObservations: ['Maturity confirmation attached; authorization pending.'], history: [{ status: 'requested', actorId: operatorId, reason: 'Seeded request', at: new Date() }, { status: 'under_review', actorId: reviewerId, reason: 'Scrutiny started', at: new Date() }] } });
  for (const [key, recordId, status] of [['match', demoIds.match, 'match'], ['mismatch', demoIds.simulatedMismatch, 'mismatch']] as const) {
    await seedUpsert(VerificationAttemptModel as unknown as Model<Record<string, unknown>>, { _id: id(key === 'match' ? 'd600000000000000000501' : 'd600000000000000000502') }, { $set: { institutionId, instrumentId: recordId, requestedBy: operatorId, adapter: 'depositguard-deterministic-mock', mode: 'simulated', status, attemptReference: `SIM-${key.toUpperCase()}-2026`, idempotencyKey: `demo-${key}-2026`, responseSummary: `Deterministic simulated ${key}. Not bank confirmed.`, requestedAt: new Date(), completedAt: new Date() } });
  }
  await seedUpsert(WorkflowPolicyModel as unknown as Model<Record<string, unknown>>, { institutionId }, { $set: { maturityReminderDays: [30, 14, 7, 1], dashboardMaturityWindowDays: 30, notificationMaxAttempts: 4, notificationRetryBaseMinutes: 15, releaseEvidenceRequired: true, requireReplacementForRenewalCompletion: true, updatedBy: operatorId } });
  const dedupeKey = maturityDedupeKey(demoIds.maturity.toString(), day(12), 12, 14);
  await seedUpsert(NotificationModel as unknown as Model<Record<string, unknown>>, { institutionId, recipientId: operatorId, dedupeKey }, { $set: { kind: 'maturity_reminder', title: 'FDR maturity approaching', message: 'FDR-2026-003 matures in 12 days.', resourceType: 'fdr', resourceId: demoIds.maturity, deliveryStatus: 'delivered', deliveryAttempts: 1, deliveredAt: new Date(), state: 'unread' } });
  const eventIds = ['d600000000000000000601', 'd600000000000000000602', 'd600000000000000000603', 'd600000000000000000604'];
  await AuditLogModel.deleteMany({ requestId: /^demo-seed-v1:/, institutionId });
  const events: Array<[string, string, Types.ObjectId, string]> = [
    ['fdr.submitted', 'fdr', demoIds.valid, 'Synthetic FDR submitted for official review'],
    ['review.correction_requested', 'fdr', demoIds.mismatch, 'Principal amount differs from the pretested document extraction'],
    ['verification.attempted', 'fdr', demoIds.match, 'Simulated mock result only; not bank confirmed'],
    ['release_request.created', 'release_request', releaseId, 'Release/refund request is awaiting authorization'],
  ];
  await AuditLogModel.insertMany(events.map(([action, targetType, targetId, reason], index) => { const occurredAt = new Date(Date.now() - (events.length - index) * 60_000); return { _id: id(eventIds[index]!), scope: 'institution' as const, institutionId, actorId: index === 1 ? reviewerId : operatorId, actorRoleSnapshot: [index === 1 ? 'official_reviewer' : 'institution_operator'], action, targetType, targetId, requestId: `demo-seed-v1:${index}`, reason, metadataRedacted: { synthetic: true }, occurredAt, createdAt: occurredAt }; }));
  const provisionedAt = new Date();
  await (AuditLogModel as Model<AuditLogRecord>).create({ scope: 'institution', institutionId, action: 'demo.test_account.provisioned', targetType: 'user', targetId: scenarioReviewerId, requestId: 'demo-seed-v1:scenario-6-reviewer', reason: 'Synthetic official reviewer created for release/refund workflow testing', metadataRedacted: { roles: ['official_reviewer'], synthetic: true }, occurredAt: provisionedAt, createdAt: provisionedAt });
  console.info('Seeded deterministic DepositGuard demo data.');
  console.info('Institution: DEMO-NORTHBRIDGE-001');
  console.info('Operator: operator@northbridge.example');
  console.info('Official reviewer: reviewer@depositguard.example');
  console.info('Scenario reviewer: scenario6.reviewer@northbridge.example');
  console.info('Password: the value supplied in DEMO_PASSWORD');
  console.info(`Private PDF fixtures: ${docs.length}; institution FDR scenarios: 7`);
} finally {
  await (await import('mongoose')).default.disconnect();
}
