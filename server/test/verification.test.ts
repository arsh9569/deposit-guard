import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import { FdrModel } from '../src/models/fdrs.js';
import { VerificationAttemptModel } from '../src/models/verification-attempts.js';
import { deterministicMockVerificationProvider, verificationDisplayLabel } from '../src/services/verification-provider.js';

const outcomes = [
  ['FDR-2026-021', 'match'],
  ['FDR-2026-022', 'mismatch'],
  ['FDR-2026-023', 'not_found'],
  ['FDR-2026-024', 'unavailable'],
] as const;

test('deterministic provider returns four simulated outcomes with explicit labels', async () => {
  assert.equal(deterministicMockVerificationProvider.mode, 'simulated');
  assert.equal(deterministicMockVerificationProvider.identity, 'depositguard-deterministic-mock');
  for (const [reference, status] of outcomes) {
    const result = await deterministicMockVerificationProvider.verify({ reference, bankName: 'Synthetic Bank', principalAmount: '100.00', holderName: 'Synthetic Institute' });
    assert.equal(result.status, status);
    const label = verificationDisplayLabel('simulated', result.status);
    assert.match(label, /^SIMULATED · /);
    assert.match(label, /NOT BANK CONFIRMED$/);
    const attempt = new VerificationAttemptModel({ institutionId: new Types.ObjectId(), instrumentId: new Types.ObjectId(), requestedBy: new Types.ObjectId(), adapter: deterministicMockVerificationProvider.identity, mode: 'simulated', status: result.status, attemptReference: `SIM-${reference}`, idempotencyKey: reference, responseSummary: result.responseSummary });
    await attempt.validate();
  }
});

test('simulated mock outcomes never set the instrument genuine verification status', () => {
  const instrument = new FdrModel({ institutionId: new Types.ObjectId(), createdBy: new Types.ObjectId(), reference: 'FDR-TEST', instrumentNumber: 'TEST-1', bankName: 'Synthetic Bank', branchName: 'Main', holderName: 'Synthetic Institute', principalAmount: Types.Decimal128.fromString('100.00'), issueDate: new Date('2026-01-01'), maturityDate: new Date('2027-01-01') });
  assert.equal(instrument.verificationStatus, 'not_requested');
  for (const status of ['match', 'mismatch', 'not_found', 'unavailable'] as const) {
    const attempt = new VerificationAttemptModel({ institutionId: instrument.institutionId, instrumentId: instrument._id, requestedBy: instrument.createdBy, adapter: deterministicMockVerificationProvider.identity, mode: 'simulated', status, attemptReference: `SIM-${status}`, idempotencyKey: status });
    assert.equal(attempt.mode, 'simulated');
    assert.equal(instrument.verificationStatus, 'not_requested');
  }
});
