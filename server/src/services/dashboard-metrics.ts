export interface DashboardInstrument {
  _id: unknown;
  reference: string;
  bankName: string;
  principalAmount: { toString(): string };
  maturityDate: Date;
  instrumentState: string;
  reviewStatus: string;
}
export interface DashboardRenewal { status: string }
export interface DashboardRelease { status: string }

export function utcDay(date: Date) { return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()); }
export function calculateDashboardMetrics(
  instruments: DashboardInstrument[],
  renewals: DashboardRenewal[],
  releases: DashboardRelease[],
  now: Date,
  windowDays: number,
) {
  const today = utcDay(now);
  const fdrs = instruments.map((record) => ({
    instrumentId: String(record._id), reference: record.reference, bankName: record.bankName,
    amount: record.principalAmount.toString(), maturityDate: record.maturityDate,
    daysToMaturity: Math.floor((utcDay(record.maturityDate) - today) / 86_400_000),
    instrumentState: record.instrumentState, reviewStatus: record.reviewStatus,
  }));
  const active = fdrs.filter((record) => ['active', 'matured'].includes(record.instrumentState));
  const inWindow = active.filter((record) => record.daysToMaturity >= 0 && record.daysToMaturity <= windowDays);
  const overdue = active.filter((record) => record.daysToMaturity < 0);
  const openRenewals = new Set(['pending', 'requested', 'submitted', 'under_review', 'more_information_required', 'approved', 'in_progress']);
  const openReleases = new Set(['requested', 'under_review', 'more_information_required', 'approved', 'in_progress']);
  return {
    totalFdrs: instruments.length,
    pendingReview: instruments.filter((record) => record.reviewStatus === 'pending').length,
    expiringWithinWindow: inWindow.length,
    matured: overdue.length,
    overdueCases: overdue.length,
    pendingRenewals: renewals.filter((record) => openRenewals.has(record.status)).length,
    pendingReleaseRequests: releases.filter((record) => openReleases.has(record.status)).length,
    maturityQueue: [...overdue, ...inWindow].sort((left, right) => left.daysToMaturity - right.daysToMaturity).slice(0, 8),
  };
}
