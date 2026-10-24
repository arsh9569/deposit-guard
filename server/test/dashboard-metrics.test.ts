import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDashboardMetrics } from '../src/services/dashboard-metrics.js';

const now = new Date('2026-10-24T18:30:00.000Z');
const atDay = (days: number) => new Date(Date.UTC(2026, 9, 24 + days));
const records = [
  { _id: '1', reference: 'FDR-A', bankName: 'Bank A', principalAmount: { toString: () => '2500000.00' }, maturityDate: atDay(21), instrumentState: 'active', reviewStatus: 'pending' },
  { _id: '2', reference: 'FDR-B', bankName: 'Bank B', principalAmount: { toString: () => '1800000.00' }, maturityDate: atDay(30), instrumentState: 'active', reviewStatus: 'pending' },
  { _id: '3', reference: 'FDR-C', bankName: 'Bank C', principalAmount: { toString: () => '3200000.00' }, maturityDate: atDay(-12), instrumentState: 'active', reviewStatus: 'approved' },
  { _id: '4', reference: 'FDR-D', bankName: 'Bank D', principalAmount: { toString: () => '1250000.00' }, maturityDate: atDay(31), instrumentState: 'active', reviewStatus: 'not_reviewed' },
];

test('dashboard metrics match known synthetic instruments and include the maturity window boundary', () => {
  const metrics = calculateDashboardMetrics(records, [{ status: 'pending' }, { status: 'approved' }, { status: 'completed' }], [{ status: 'requested' }, { status: 'denied' }], now, 30);
  assert.equal(metrics.totalFdrs, 4);
  assert.equal(metrics.pendingReview, 2);
  assert.equal(metrics.expiringWithinWindow, 2);
  assert.equal(metrics.matured, 1);
  assert.equal(metrics.overdueCases, 1);
  assert.equal(metrics.pendingRenewals, 2);
  assert.equal(metrics.pendingReleaseRequests, 1);
  assert.deepEqual(metrics.maturityQueue.map((item) => item.reference), ['FDR-C', 'FDR-A', 'FDR-B']);
  assert.equal(metrics.maturityQueue.find((item) => item.reference === 'FDR-B')?.daysToMaturity, 30);
});

test('dashboard excludes superseded and already released instruments from maturity counts', () => {
  const metrics = calculateDashboardMetrics([
    ...records,
    { ...records[0]!, _id: '5', reference: 'FDR-OLD', instrumentState: 'superseded' },
    { ...records[2]!, _id: '6', reference: 'FDR-RELEASED', instrumentState: 'released' },
  ], [], [], now, 30);
  assert.equal(metrics.totalFdrs, 6);
  assert.equal(metrics.expiringWithinWindow, 2);
  assert.equal(metrics.matured, 1);
});
