import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMaturityNotificationCandidates, findOverdueCases, maturityDedupeKey, daysUntilMaturity, notificationRetryPlan } from '../src/services/maturity-monitoring.js';
import { assertReplacementLink, transitionRelease, transitionRenewal } from '../src/services/workflow-transitions.js';
import { idempotentReleaseReplay, isValidIdempotencyKey, releaseRequestFingerprint } from '../src/services/release-idempotency.js';
import type { InstitutionRole } from '../src/models/domain.js';

const operator: InstitutionRole[] = ['institution_operator'];
const reviewer: InstitutionRole[] = ['official_reviewer'];
const now = new Date('2026-06-10T18:30:00.000Z');

test('maturity day boundary uses UTC calendar days and does not call the maturity day overdue', () => {
  const cases = findOverdueCases([
    { _id: 'today', maturityDate: new Date('2026-06-10T00:00:00.000Z') },
    { _id: 'yesterday', maturityDate: new Date('2026-06-09T23:59:59.000Z') },
    { _id: 'tomorrow', maturityDate: new Date('2026-06-11T00:00:00.000Z') },
  ], now);
  assert.deepEqual(cases.map((item) => [item.instrumentId, item.daysOverdue]), [['yesterday', 1]]);
  assert.equal(daysUntilMaturity(new Date('2026-06-11T00:00:00Z'), now), 1);
});

test('maturity notification idempotency keys are stable per reminder and overdue cycle', () => {
  const maturity = new Date('2026-07-01T00:00:00Z');
  assert.equal(maturityDedupeKey('fdr1', maturity, -1), maturityDedupeKey('fdr1', maturity, -30));
  assert.equal(maturityDedupeKey('fdr1', maturity, 7, 30), maturityDedupeKey('fdr1', maturity, 2, 30));
  assert.notEqual(maturityDedupeKey('fdr1', maturity, 7, 30), maturityDedupeKey('fdr1', maturity, 7, 7));
});

test('scheduler retries generate the same reminder key and do not create a second logical notice', () => {
  const instrument = { _id: 'fdr-1', reference: 'FDR-SYN-1', maturityDate: new Date('2026-06-17T00:00:00.000Z') };
  const firstRun = buildMaturityNotificationCandidates([instrument], [7, 1], now);
  const retryRun = buildMaturityNotificationCandidates([instrument], [7, 1], now);
  assert.equal(firstRun.length, 1);
  assert.equal(firstRun[0]?.kind, 'maturity_reminder');
  assert.equal(firstRun[0]?.message, 'FDR-SYN-1 matures in 7 day(s).');
  assert.deepEqual(retryRun.map((item) => item.dedupeKey), firstRun.map((item) => item.dedupeKey));
  assert.equal(new Set([...firstRun, ...retryRun].map((item) => item.dedupeKey)).size, 1);
});

test('configured maturity offsets create one reminder on 30, 7, and 1 days and one overdue notice', () => {
  const addDays = (offset: number) => new Date(Date.UTC(2026, 5, 10 + offset));
  const candidates = buildMaturityNotificationCandidates([
    { _id: 'fdr-30', reference: 'FDR-30', maturityDate: addDays(30) },
    { _id: 'fdr-7', reference: 'FDR-7', maturityDate: addDays(7) },
    { _id: 'fdr-1', reference: 'FDR-1', maturityDate: addDays(1) },
    { _id: 'fdr-overdue', reference: 'FDR-OVERDUE', maturityDate: addDays(-1) },
  ], [30, 14, 7, 1], new Date('2026-06-10T18:30:00.000Z'));
  assert.deepEqual(candidates.map(({ instrumentId, kind, message }) => [instrumentId, kind, message]), [
    ['fdr-30', 'maturity_reminder', 'FDR-30 matures in 30 day(s).'],
    ['fdr-7', 'maturity_reminder', 'FDR-7 matures in 7 day(s).'],
    ['fdr-1', 'maturity_reminder', 'FDR-1 matures in 1 day(s).'],
    ['fdr-overdue', 'maturity_overdue', 'FDR-OVERDUE passed its maturity date 1 day(s) ago.'],
  ]);
  assert.equal(new Set(candidates.map(({ dedupeKey }) => dedupeKey)).size, 4);
});

test('notification failures receive exponential retry times and stop at configured maximum', () => {
  const first = notificationRetryPlan(1, 4, 10, now);
  assert.equal(first.deliveryStatus, 'retrying');
  assert.equal(first.nextAttemptAt?.getTime(), now.getTime() + 10 * 60_000);
  const third = notificationRetryPlan(3, 4, 10, now);
  assert.equal(third.nextAttemptAt?.getTime(), now.getTime() + 40 * 60_000);
  assert.deepEqual(notificationRetryPlan(4, 4, 10, now), { deliveryStatus: 'failed', nextAttemptAt: undefined });
});

test('operator cannot approve a renewal or release/refund transition', () => {
  assert.throws(() => transitionRenewal('submitted', 'approve', operator), /Insufficient permissions/);
  assert.throws(() => transitionRelease('under_review', 'approve', operator), /Insufficient permissions/);
  assert.throws(() => transitionRelease('approved', 'complete', reviewer), /Insufficient permissions/);
});

test('renewal stages allow submission by an operator and approval by an authorized reviewer', () => {
  assert.equal(transitionRenewal('pending', 'submit', operator), 'submitted');
  assert.equal(transitionRenewal('submitted', 'approve', reviewer), 'approved');
  assert.equal(transitionRenewal('approved', 'complete', operator), 'completed');
  assert.throws(() => transitionRenewal('completed', 'submit', operator), /not allowed/);
});

test('replacement linking accepts a valid source and rejects cycles or a second replacement', () => {
  assert.doesNotThrow(() => assertReplacementLink('old-fdr', [], 'new-fdr'));
  assert.throws(() => assertReplacementLink('old-fdr', ['other-new'], 'new-fdr'), /different replacement/);
  assert.throws(() => assertReplacementLink('old-fdr', [], 'old-fdr'), /cannot link/);
  assert.throws(() => assertReplacementLink('old-fdr', [], 'new-fdr', 'another-source'), /cannot link/);
});

test('release/refund approval and completion are separate authorized transitions', () => {
  assert.equal(transitionRelease('requested', 'start_scrutiny', reviewer), 'under_review');
  assert.equal(transitionRelease('under_review', 'approve', reviewer), 'approved');
  assert.throws(() => transitionRelease('approved', 'approve', reviewer), /not allowed/);
  assert.equal(transitionRelease('approved', 'complete', operator), 'completed');
  assert.throws(() => transitionRelease('requested', 'complete', operator), /not allowed/);
});

test('release/refund retries replay only the identical request and conflict on payload changes', () => {
  const first = releaseRequestFingerprint({ instrumentId: 'fdr-1', requestType: 'matured_refund', reason: 'Refund', supportingDocumentIds: ['doc-a', 'doc-b'] });
  const retry = releaseRequestFingerprint({ instrumentId: 'fdr-1', requestType: 'matured_refund', reason: ' Refund ', supportingDocumentIds: ['doc-b', 'doc-a'] });
  const changed = releaseRequestFingerprint({ instrumentId: 'fdr-1', requestType: 'matured_refund', reason: 'Different request', supportingDocumentIds: ['doc-a', 'doc-b'] });
  assert.equal(isValidIdempotencyKey('scenario-6-request-0001'), true);
  assert.equal(isValidIdempotencyKey('short'), false);
  assert.equal(idempotentReleaseReplay(first, retry), 'replay');
  assert.equal(idempotentReleaseReplay(first, changed), 'conflict');
});
