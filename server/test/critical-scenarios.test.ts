import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { AuditLogModel } from '../src/models/audit-logs.js';
import { FdrModel } from '../src/models/fdrs.js';
import { ReleaseRequestModel } from '../src/models/release-requests.js';
import { VerificationAttemptModel } from '../src/models/verification-attempts.js';
import { compareExtractedValues, noProviderExtractor } from '../src/services/fdr-document-processing.js';
import { auditAppendSchema, fdrCreateSchema } from '../src/validators/model-schemas.js';
import { apiErrorHandler } from '../src/middleware/api-error.js';
import { healthRouter } from '../src/routes/health.js';

const institutionId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const validFdr = {
  reference: 'TEST-FDR-001', instrumentNumber: 'INSTRUMENT-001', bankName: 'Synthetic Bank',
  branchName: 'Main Branch', holderName: 'Synthetic Institute', principalAmount: '125000.00',
  currency: 'INR', issueDate: '2026-01-01', maturityDate: '2027-01-01',
};

test('valid institution FDR draft validates and can enter submitted/pending-review state', async () => {
  const parsed = fdrCreateSchema.safeParse(validFdr);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const draft = new FdrModel({ ...parsed.data, institutionId, createdBy: actorId, principalAmount: Types.Decimal128.fromString(parsed.data.principalAmount) });
  await draft.validate();
  assert.equal(draft.submissionStatus, 'draft');
  draft.submissionStatus = 'submitted';
  draft.reviewStatus = 'pending';
  await draft.validate();
  assert.equal(draft.submissionStatus, 'submitted');
  assert.equal(draft.reviewStatus, 'pending');
});

test('incorrect OCR amount is identified as a discrepancy while failed OCR leaves manual fields valid', async () => {
  const discrepancies = compareExtractedValues(
    { principalAmount: { value: '120,000.00', confidence: 0.88 } },
    { principalAmount: validFdr.principalAmount },
  );
  assert.deepEqual(discrepancies, ['principalAmount']);
  await assert.rejects(noProviderExtractor.runOcr(Buffer.from('synthetic image'), 'image/png'), /not configured/);
  assert.equal(fdrCreateSchema.safeParse(validFdr).success, true);
});

test('simulated match attempt retains simulated mode instead of claiming genuine verification', async () => {
  const attempt = new VerificationAttemptModel({
    institutionId, instrumentId: new Types.ObjectId(), requestedBy: actorId,
    adapter: 'depositguard-deterministic-mock', mode: 'simulated', status: 'match',
    attemptReference: 'SIM-TEST-001', idempotencyKey: 'sim-test-1',
  });
  await attempt.validate();
  assert.equal(attempt.status, 'match');
  assert.equal(attempt.mode, 'simulated');
});

test('replacement relationship preserves the previous instrument document history', async () => {
  const oldDocumentId = new Types.ObjectId();
  const old = new FdrModel({ ...validFdr, institutionId, createdBy: actorId, principalAmount: Types.Decimal128.fromString(validFdr.principalAmount), documentIds: [oldDocumentId] });
  const replacement = new FdrModel({ ...validFdr, reference: 'TEST-FDR-002', instrumentNumber: 'INSTRUMENT-002', institutionId, createdBy: actorId, principalAmount: Types.Decimal128.fromString(validFdr.principalAmount) });
  replacement.supersedesInstrumentId = old._id;
  old.supersededByInstrumentIds.push(replacement._id);
  assert.deepEqual(old.documentIds.map(String), [String(oldDocumentId)]);
  assert.equal(String(replacement.supersedesInstrumentId), String(old._id));
  assert.equal(String(old.supersededByInstrumentIds[0]), String(replacement._id));
});

test('release approval is not completion, and completion requires separate evidence', async () => {
  const approval = new ReleaseRequestModel({
    institutionId, instrumentId: new Types.ObjectId(), requestedBy: actorId,
    requestType: 'matured_refund', reason: 'Synthetic request', supportingDocumentIds: [new Types.ObjectId()],
    status: 'approved', approvedBy: actorId, approvalReason: 'Authorized review',
  });
  await approval.validate();
  assert.equal(approval.status, 'approved');
  assert.equal(approval.completionEvidenceRef, undefined);
  assert.equal(approval.completedAt, undefined);
  approval.status = 'completed';
  await assert.rejects(approval.validate(), /completion requires separate evidence/);
});

test('audit history fields are immutable and unknown mutation fields are rejected', () => {
  const event = AuditLogModel.hydrate({
    _id: new Types.ObjectId(), scope: 'institution', institutionId,
    action: 'fdr.submitted', targetType: 'fdr', targetId: new Types.ObjectId(),
    requestId: 'test-request', metadataRedacted: { status: 'submitted' }, occurredAt: new Date(),
  });
  event.action = 'fdr.approved';
  assert.equal(event.action, 'fdr.submitted');
  assert.throws(() => new AuditLogModel({
    scope: 'institution', institutionId, action: 'tamper', targetType: 'audit',
    requestId: 'test-request', metadataRedacted: {}, forgedHistory: true,
  }), /forgedHistory|StrictModeError/);
  const append = { scope: 'institution', institutionId: institutionId.toString(), action: 'fdr.submitted', targetType: 'fdr', requestId: 'test-request' };
  assert.equal(auditAppendSchema.safeParse(append).success, true);
  assert.equal(auditAppendSchema.safeParse({ ...append, auditId: new Types.ObjectId().toString(), overwrite: true }).success, false);
});

test('malformed JSON returns 400 and oversized JSON returns 413 without parser details', async () => {
  const app = express();
  app.use(express.json({ limit: '32b' }));
  app.post('/request', (_req, res) => res.sendStatus(204));
  app.use(apiErrorHandler);
  const malformed = await request(app).post('/request').set('content-type', 'application/json').send('{bad');
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { error: 'Malformed request' });
  const oversized = await request(app).post('/request').send({ value: 'x'.repeat(100) });
  assert.equal(oversized.status, 413);
  assert.deepEqual(oversized.body, { error: 'Request body too large' });
});

test('unexpected errors return generic details and omit exception content from logs', async () => {
  const app = express();
  app.use((req, _res, next) => { req.requestId = 'security-log-test'; next(); });
  app.get('/failure', (_req, _res, next) => next(new Error('mongodb+srv://user:password@host/db?token=secret')));
  app.use(apiErrorHandler);
  const captured: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  try {
    const response = await request(app).get('/failure');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: 'Internal server error' });
  } finally {
    console.error = original;
  }
  assert.match(captured.join('\n'), /security-log-test/);
  assert.doesNotMatch(captured.join('\n'), /password|token=secret|mongodb\+srv/);
});

test('health endpoint reports a database outage as not ready', { skip: mongoose.connection.readyState !== 0 }, async () => {
  const app = express(); app.use('/health', healthRouter);
  const response = await request(app).get('/health');
  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'not_ready');
  assert.equal(response.body.database, 'disconnected');
});
