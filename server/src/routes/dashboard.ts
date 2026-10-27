import { Router } from 'express';
import { Types, type Model } from 'mongoose';
import { requireAuthentication } from '../middleware/authentication.js';
import { AuditLogModel, type AuditLogRecord } from '../models/audit-logs.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { ReleaseRequestModel, type ReleaseRequestRecord } from '../models/release-requests.js';
import { RenewalRecordModel, type RenewalRecord } from '../models/renewal-records.js';
import { WorkflowPolicyModel, type WorkflowPolicyRecord } from '../models/workflow-policies.js';
import { objectIdSchema } from '../validators/model-schemas.js';
import { calculateDashboardMetrics } from '../services/dashboard-metrics.js';
import { hasInstitutionPermission } from '../auth/rbac.js';

const fdrs = FdrModel as Model<FdrRecord>;
const renewals = RenewalRecordModel as Model<RenewalRecord>;
const releases = ReleaseRequestModel as Model<ReleaseRequestRecord>;
const policies = WorkflowPolicyModel as Model<WorkflowPolicyRecord>;
const audits = AuditLogModel as Model<AuditLogRecord>;
const openRenewalStatuses = ['pending', 'requested', 'submitted', 'under_review', 'more_information_required', 'approved', 'in_progress'];
const openReleaseStatuses = ['requested', 'under_review', 'more_information_required', 'approved', 'in_progress'];

export const dashboardRouter = Router();
dashboardRouter.use(requireAuthentication);
dashboardRouter.get('/', async (req, res, next) => {
  try {
    const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
    if (requested && !objectIdSchema.safeParse(requested).success) { res.status(400).json({ error: 'Invalid institution' }); return; }
    const membership = req.authUser!.memberships.find((item) => item.active && (!requested || String(item.institutionId) === requested));
    if (!membership) { res.status(404).json({ error: 'Institution not found' }); return; }
    const allowed = hasInstitutionPermission(membership.roles, 'dashboard:read');
    if (!allowed) { res.status(403).json({ error: 'Insufficient permissions' }); return; }
    const institutionId = new Types.ObjectId(membership.institutionId);
    const policy = await policies.findOne({ institutionId }).lean().exec();
    const windowDays = policy?.dashboardMaturityWindowDays ?? 30;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowEnd = new Date(today.getTime() + (windowDays + 1) * 86_400_000);
    const activeStates = { $in: ['active', 'matured'] };
    const [totalFdrs, pendingReview, expiringWithinWindow, matured, pendingRenewals, pendingReleaseRequests, queueRecords, activity] = await Promise.all([
      fdrs.countDocuments({ institutionId }),
      fdrs.countDocuments({ institutionId, reviewStatus: 'pending' }),
      fdrs.countDocuments({ institutionId, instrumentState: activeStates, maturityDate: { $gte: today, $lt: windowEnd } }),
      fdrs.countDocuments({ institutionId, instrumentState: activeStates, maturityDate: { $lt: today } }),
      renewals.countDocuments({ institutionId, status: { $in: openRenewalStatuses } }),
      releases.countDocuments({ institutionId, status: { $in: openReleaseStatuses } }),
      fdrs.find({ institutionId, instrumentState: activeStates, maturityDate: { $lt: windowEnd } }).sort({ maturityDate: 1 }).limit(8).select('_id reference bankName principalAmount maturityDate instrumentState reviewStatus').lean().exec(),
      audits.find({ institutionId }).sort({ occurredAt: -1 }).limit(5).select('action targetType targetId reason occurredAt actorId').lean().exec(),
    ]);
    const queueMetrics = calculateDashboardMetrics(queueRecords, [], [], now, windowDays);
    res.json({
      institutionId: String(institutionId), displayName: req.authUser!.displayName,
      windowDays, metrics: { totalFdrs, pendingReview, expiringWithinWindow, matured, overdueCases: matured, pendingRenewals, pendingReleaseRequests, maturityQueue: queueMetrics.maturityQueue },
      recentActivity: activity.map((item) => ({ action: item.action, targetType: item.targetType, targetId: item.targetId ? String(item.targetId) : undefined, reason: item.reason, occurredAt: item.occurredAt, actorId: item.actorId ? String(item.actorId) : undefined })),
    });
  } catch (error) { next(error); }
});
