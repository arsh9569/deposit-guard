import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Error as MongooseError, Types } from 'mongoose';
import { AuditLogModel } from '../src/models/audit-logs.js';
import { DocumentModel } from '../src/models/documents.js';
import { FdrModel } from '../src/models/fdrs.js';
import { InstitutionModel } from '../src/models/institutions.js';
import { NotificationModel } from '../src/models/notifications.js';
import { OcrCorrectionModel, OcrExtractionModel } from '../src/models/ocr-extractions.js';
import { ReleaseRequestModel } from '../src/models/release-requests.js';
import { RenewalRecordModel } from '../src/models/renewal-records.js';
import { ReviewActionModel } from '../src/models/review-actions.js';
import { institutionScopedFilter } from '../src/models/tenant-scope.js';
import { UserModel } from '../src/models/users.js';
import { VerificationAttemptModel } from '../src/models/verification-attempts.js';
import {
  documentUploadIntentSchema,
  fdrCreateSchema,
  fdrUpdateSchema,
  ocrProviderResultSchema,
  releaseRequestSchema,
  reviewActionSchema,
  verificationAdapterResultSchema,
  verificationRequestSchema,
  workflowPolicyUpdateSchema,
  workflowActionSchema,
} from '../src/validators/model-schemas.js';

const institutionId = new Types.ObjectId();
const userId = new Types.ObjectId();
const instrumentId = new Types.ObjectId();
const sampleFdr = {
  reference: 'FIN-2026-001',
  instrumentNumber: 'FDR-001-ABC',
  bankName: 'Example Bank',
  branchName: 'Central',
  holderName: 'Synthetic Institute',
  principalAmount: '250000.50',
  currency: 'INR',
  issueDate: '2026-01-01',
  maturityDate: '2027-01-01',
};

test('FDR create accepts valid fields and rejects invalid amounts and dates', () => {
  assert.equal(fdrCreateSchema.safeParse(sampleFdr).success, true);
  assert.equal(fdrCreateSchema.safeParse({ ...sampleFdr, principalAmount: '0' }).success, false);
  assert.equal(
    fdrCreateSchema.safeParse({ ...sampleFdr, principalAmount: '1.999' }).success,
    false,
  );
  assert.equal(
    fdrCreateSchema.safeParse({ ...sampleFdr, maturityDate: '2025-12-31' }).success,
    false,
  );
  assert.equal(fdrCreateSchema.safeParse({ ...sampleFdr, issueDate: '2026-02-30' }).success, false);
});

test('client FDR DTOs reject tenant scope and protected status fields', () => {
  assert.equal(
    fdrCreateSchema.safeParse({ ...sampleFdr, institutionId: institutionId.toString() }).success,
    false,
  );
  assert.equal(
    fdrCreateSchema.safeParse({ ...sampleFdr, reviewStatus: 'approved' }).success,
    false,
  );
  assert.equal(fdrUpdateSchema.safeParse({ reviewStatus: 'approved' }).success, false);
  assert.equal(
    fdrUpdateSchema.safeParse({ institutionId: institutionId.toString() }).success,
    false,
  );
});

test('upload intent cannot set private storage metadata or malware scan state', () => {
  const valid = {
    instrumentId: instrumentId.toString(),
    originalFileName: 'sample.pdf',
    contentType: 'application/pdf',
    byteLength: 1024,
    purpose: 'fdr_instrument',
  };
  assert.equal(documentUploadIntentSchema.safeParse(valid).success, true);
  assert.equal(
    documentUploadIntentSchema.safeParse({ ...valid, storageKey: 'public/file.pdf' }).success,
    false,
  );
  assert.equal(
    documentUploadIntentSchema.safeParse({ ...valid, malwareScanStatus: 'clean' }).success,
    false,
  );
});

test('review and verification commands reject clients setting actor, provider, mode, and state', () => {
  const review = {
    instrumentId: instrumentId.toString(),
    decision: 'approve',
    reason: 'Reviewed supporting record',
    basedOnRevision: 1,
  };
  assert.equal(reviewActionSchema.safeParse(review).success, true);
  assert.equal(
    reviewActionSchema.safeParse({ ...review, reviewerId: userId.toString() }).success,
    false,
  );
  assert.equal(
    reviewActionSchema.safeParse({ ...review, reviewStatus: 'approved' }).success,
    false,
  );
  assert.equal(reviewActionSchema.safeParse({ ...review, reason: ' ' }).success, false);

  const verification = { instrumentId: instrumentId.toString() };
  assert.equal(verificationRequestSchema.safeParse(verification).success, true);
  assert.equal(
    verificationRequestSchema.safeParse({ ...verification, mode: 'live' }).success,
    false,
  );
  assert.equal(
    verificationRequestSchema.safeParse({ ...verification, status: 'match' }).success,
    false,
  );
  assert.equal(
    verificationRequestSchema.safeParse({ ...verification, provider: 'bank' }).success,
    false,
  );
});

test('trusted adapter schemas validate their own results without mixing state domains', () => {
  const ocrResult = {
    documentId: new Types.ObjectId().toString(),
    instrumentId: instrumentId.toString(),
    provider: 'sample-ocr-adapter',
    status: 'complete',
    fields: [{ fieldName: 'principalAmount', value: '250000.50', confidence: 0.92, pageNumber: 1 }],
  };
  assert.equal(ocrProviderResultSchema.safeParse(ocrResult).success, true);
  assert.equal(
    ocrProviderResultSchema.safeParse({
      ...ocrResult,
      fields: [{ ...ocrResult.fields[0], confidence: 92 }],
    }).success,
    false,
  );
  assert.equal(
    ocrProviderResultSchema.safeParse({ ...ocrResult, reviewStatus: 'approved' }).success,
    false,
  );
  assert.equal(
    verificationAdapterResultSchema.safeParse({ attemptReference: 'SIM-001', status: 'match' })
      .success,
    true,
  );
  assert.equal(
    verificationAdapterResultSchema.safeParse({
      attemptReference: 'SIM-001',
      status: 'match',
      ocrStatus: 'complete',
    }).success,
    false,
  );
});

test('release request requires supporting evidence and completion requires separate evidence', () => {
  const request = {
    instrumentId: instrumentId.toString(),
    requestType: 'matured_refund',
    reason: 'Instrument reached its recorded maturity date',
    supportingDocumentIds: [new Types.ObjectId().toString()],
  };
  assert.equal(releaseRequestSchema.safeParse(request).success, true);
  assert.equal(
    releaseRequestSchema.safeParse({ ...request, supportingDocumentIds: [] }).success,
    true,
  );
  assert.equal(
    workflowActionSchema.safeParse({ action: 'record_completion', reason: 'Processed' }).success,
    false,
  );
  assert.equal(
    workflowActionSchema.safeParse({
      action: 'record_completion',
      reason: 'Evidence received',
      completionEvidenceRef: 'DEMO-REF-01',
    }).success,
    true,
  );
});

test('institution workflow policy thresholds and evidence requirements are configurable', () => {
  const policy = {
    maturityReminderDays: [],
    dashboardMaturityWindowDays: 45,
    notificationMaxAttempts: 7,
    notificationRetryBaseMinutes: 30,
    releaseEvidenceRequired: false,
    requireReplacementForRenewalCompletion: true,
  };
  assert.deepEqual(workflowPolicyUpdateSchema.safeParse(policy).data, policy);
  assert.equal(workflowPolicyUpdateSchema.safeParse({ ...policy, maturityReminderDays: [-1] }).success, false);
});

test('Mongoose FDR validation checks required references, amount and date order', async () => {
  const valid = new FdrModel({
    institutionId,
    reference: 'FIN-2026-001',
    instrumentNumber: 'FDR-001-ABC',
    bankName: 'Example Bank',
    branchName: 'Central',
    holderName: 'Synthetic Institute',
    principalAmount: Types.Decimal128.fromString('250000.50'),
    currency: 'INR',
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    maturityDate: new Date('2027-01-01T00:00:00.000Z'),
    createdBy: userId,
  });
  await valid.validate();
  assert.equal(valid.reviewStatus, 'not_reviewed');
  assert.equal(valid.verificationStatus, 'not_requested');
  assert.equal(valid.ocrStatus, 'not_requested');

  const invalid = new FdrModel({
    ...valid.toObject(),
    maturityDate: new Date('2025-12-31T00:00:00.000Z'),
  });
  await assert.rejects(invalid.validate(), (error: unknown) => {
    assert.ok(error instanceof MongooseError.ValidationError);
    assert.ok(error.errors.maturityDate);
    return true;
  });
});

test('release model refuses completion without separately recorded evidence and actor', async () => {
  const request = new ReleaseRequestModel({
    institutionId,
    instrumentId,
    requestedBy: userId,
    requestType: 'matured_refund',
    reason: 'Synthetic test request',
    supportingDocumentIds: [new Types.ObjectId()],
    status: 'completed',
  });
  await assert.rejects(request.validate(), (error: unknown) => {
    assert.ok(error instanceof MongooseError.ValidationError);
    assert.ok(error.errors.completionEvidenceRef);
    return true;
  });

  const noEvidence = new ReleaseRequestModel({
    institutionId,
    instrumentId,
    requestedBy: userId,
    requestType: 'matured_refund',
    reason: 'Synthetic test request',
    supportingDocumentIds: [],
    status: 'requested',
  });
  await noEvidence.validate();
});

test('review and audit history schemas mark provenance fields immutable', () => {
  assert.equal(ReviewActionModel.schema.path('decision')?.options.immutable, true);
  assert.equal(ReviewActionModel.schema.path('reason')?.options.immutable, true);
  assert.equal(VerificationAttemptModel.schema.path('attemptReference')?.options.immutable, true);
  assert.equal(AuditLogModel.schema.path('action')?.options.immutable, true);
  assert.equal(AuditLogModel.schema.path('metadataRedacted')?.options.immutable, true);
  assert.equal(OcrExtractionModel.schema.path('provider')?.options.immutable, true);
  assert.equal(OcrExtractionModel.schema.path('rawResult')?.options.immutable, true);
  assert.equal(OcrCorrectionModel.schema.path('correctedValue')?.options.immutable, true);
});

test('institution tenant filter is an outer AND boundary and validates its trusted id', () => {
  const filter = institutionScopedFilter(institutionId, {
    $or: [{ reviewStatus: 'pending' }, { verificationStatus: 'failed' }],
  });
  assert.equal(Array.isArray(filter.$and), true);
  assert.equal(filter.$and?.[0]?.institutionId?.toString(), institutionId.toString());
  assert.throws(() => institutionScopedFilter('not-an-object-id'), TypeError);
});

test('requested domain models expose institution and workflow indexes', () => {
  const assertIndex = (schema: typeof FdrModel.schema, expected: string[]) => {
    const paths = schema.indexes().map(([keys]) => Object.keys(keys).join(','));
    for (const path of expected) assert.ok(paths.includes(path), `expected index ${path}`);
  };
  assertIndex(FdrModel.schema, [
    'institutionId,reference',
    'institutionId,maturityDate',
    'institutionId,reviewStatus,createdAt',
    'institutionId,verificationStatus,updatedAt',
  ]);
  assert.ok(DocumentModel.schema.path('instrumentId'));
  assert.ok(ReleaseRequestModel.schema.path('idempotencyKey'));
  const releaseIdempotencyIndex = ReleaseRequestModel.schema.indexes().find(([keys]) => Object.keys(keys).join(',') === 'institutionId,requestedBy,idempotencyKey');
  assert.equal(releaseIdempotencyIndex?.[1].unique, true);
  assert.deepEqual(releaseIdempotencyIndex?.[1].partialFilterExpression, { idempotencyKey: { $type: 'string' } });
  assert.ok(RenewalRecordModel.schema.path('sourceInstrumentId'));
  assert.ok(RenewalRecordModel.schema.path('replacementInstrumentId'));
  assert.ok(UserModel.schema.path('memberships'));
});

test('required fields exist on each persistence model', () => {
  assert.equal(UserModel.schema.path('authSubject')?.isRequired, true);
  assert.equal(UserModel.schema.path('email')?.isRequired, true);
  assert.equal(InstitutionModel.schema.path('externalReference')?.isRequired, true);
  assert.equal(FdrModel.schema.path('principalAmount')?.isRequired, true);
  assert.equal(DocumentModel.schema.path('storageKey')?.isRequired, true);
  assert.equal(OcrExtractionModel.schema.path('provider')?.isRequired, true);
  assert.equal(OcrCorrectionModel.schema.path('correctedBy')?.isRequired, true);
  assert.equal(VerificationAttemptModel.schema.path('attemptReference')?.isRequired, true);
  assert.equal(ReviewActionModel.schema.path('reason')?.isRequired, true);
  assert.equal(RenewalRecordModel.schema.path('sourceInstrumentId')?.isRequired, true);
  assert.equal(ReleaseRequestModel.schema.path('supportingDocumentIds')?.isRequired, true);
  assert.equal(NotificationModel.schema.path('recipientId')?.isRequired, true);
  assert.equal(AuditLogModel.schema.path('requestId')?.isRequired, true);
});
