import { Types, type Model } from 'mongoose';
import { NotificationModel, type NotificationRecord } from '../models/notifications.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { UserModel, type UserRecord } from '../models/users.js';
import { WorkflowPolicyModel, type WorkflowPolicyRecord } from '../models/workflow-policies.js';
import type { AuditWriter } from '../auth/types.js';

const fdrs = FdrModel as Model<FdrRecord>;
const notifications = NotificationModel as Model<NotificationRecord>;
const policies = WorkflowPolicyModel as Model<WorkflowPolicyRecord>;
const users = UserModel as Model<UserRecord>;
export type MaturityCase = { instrumentId: string; maturityDate: Date; daysOverdue: number };

export function utcDayNumber(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000;
}
export function daysUntilMaturity(maturity: Date, now: Date) {
  return utcDayNumber(maturity) - utcDayNumber(now);
}
export function maturityDedupeKey(instrumentId: string, maturity: Date, daysUntil: number, reminderOffset = daysUntil) {
  const maturityDate = new Date(Date.UTC(maturity.getUTCFullYear(), maturity.getUTCMonth(), maturity.getUTCDate())).toISOString().slice(0, 10);
  const cycle = daysUntil < 0 ? 'overdue' : `before-${reminderOffset}`;
  return `maturity:${instrumentId}:${maturityDate}:${cycle}`;
}
export function findOverdueCases(records: Array<{ _id: unknown; maturityDate: Date }>, now: Date): MaturityCase[] {
  return records.filter((record) => daysUntilMaturity(record.maturityDate, now) < 0).map((record) => ({
    instrumentId: String(record._id), maturityDate: record.maturityDate,
    daysOverdue: -daysUntilMaturity(record.maturityDate, now),
  }));
}
export function notificationRetryPlan(attempts: number, maxAttempts: number, baseMinutes: number, now: Date) {
  if (attempts >= maxAttempts) return { deliveryStatus: 'failed' as const, nextAttemptAt: undefined };
  return { deliveryStatus: 'retrying' as const, nextAttemptAt: new Date(now.getTime() + baseMinutes * 60_000 * 2 ** (attempts - 1)) };
}
export interface MaturityNotificationCandidate {
  instrumentId: string;
  kind: 'maturity_reminder' | 'maturity_overdue';
  dedupeKey: string;
  title: string;
  message: string;
}
export function buildMaturityNotificationCandidates(
  instruments: Array<{ _id: unknown; reference: string; maturityDate: Date }>,
  reminderDays: number[],
  now: Date,
): MaturityNotificationCandidate[] {
  const candidates: MaturityNotificationCandidate[] = [];
  for (const instrument of instruments) {
    const dueIn = daysUntilMaturity(instrument.maturityDate, now);
    const overdue = dueIn < 0;
    const offsets: Array<number | undefined> = overdue ? [undefined] : reminderDays.includes(dueIn) ? [dueIn] : [];
    for (const offset of offsets) {
      candidates.push({
        instrumentId: String(instrument._id),
        kind: overdue ? 'maturity_overdue' : 'maturity_reminder',
        dedupeKey: maturityDedupeKey(String(instrument._id), instrument.maturityDate, dueIn, offset),
        title: overdue ? 'FDR maturity overdue' : 'FDR maturity reminder',
        message: overdue ? `${instrument.reference} passed its maturity date ${-dueIn} day(s) ago.` : `${instrument.reference} matures in ${dueIn} day(s).`,
      });
    }
  }
  return candidates;
}

export async function generateMaturityNotifications(institutionId: string, now: Date, audit: AuditWriter, requestId: string, actorId: string) {
  const institution = new Types.ObjectId(institutionId);
  const policy = await policies.findOne({ institutionId: institution }).lean().exec();
  const reminderDays = policy?.maturityReminderDays ?? [];
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  const upper = new Date(end.getTime() + Math.max(0, ...reminderDays) * 86_400_000);
  const instruments = await fdrs.find({ institutionId: institution, instrumentState: { $in: ['active', 'matured'] }, maturityDate: { $lt: upper } }).select('_id reference maturityDate').lean().exec();
  const activeUsers = await users.find({ status: 'active', 'memberships.institutionId': institution }).select('_id memberships').lean().exec();
  const recipients = activeUsers.filter((user) => user.memberships.some((membership) => membership.active && String(membership.institutionId) === institutionId && membership.roles.some((role) => role === 'institution_admin' || role === 'institution_operator')));
  let created = 0;
  const candidates = buildMaturityNotificationCandidates(instruments, reminderDays, now);
  for (const candidate of candidates) {
      for (const recipient of recipients) {
        let result;
        try {
          result = await notifications.updateOne(
            { institutionId: institution, recipientId: recipient._id, dedupeKey: candidate.dedupeKey },
            { $setOnInsert: { institutionId: institution, recipientId: recipient._id, dedupeKey: candidate.dedupeKey, kind: candidate.kind, title: candidate.title, message: candidate.message, resourceType: 'Fdr', resourceId: new Types.ObjectId(candidate.instrumentId), state: 'unread', deliveryStatus: 'pending', deliveryAttempts: 0 } },
            { upsert: true },
          );
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000) continue;
          throw error;
        }
        if (result.upsertedCount) {
          created += 1;
          await audit.write({ action: 'maturity.notification.created', institutionId, actorId, requestId, targetType: 'notification', targetId: String(result.upsertedId), metadataRedacted: { kind: candidate.kind, resourceId: candidate.instrumentId, recipientId: String(recipient._id), dedupeKey: candidate.dedupeKey } });
        }
      }
  }
  return { created };
}

export interface NotificationDelivery {
  deliver(notification: NotificationRecord): Promise<void>;
}
export async function retryNotificationDelivery(institutionId: string, now: Date, policy: WorkflowPolicyRecord | null, delivery: NotificationDelivery, limit = 100) {
  const maxAttempts = policy?.notificationMaxAttempts ?? 5;
  const baseMinutes = policy?.notificationRetryBaseMinutes ?? 15;
  const queue = await notifications.find({ institutionId: new Types.ObjectId(institutionId), deliveryStatus: { $in: ['pending', 'retrying'] }, $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] }).sort({ createdAt: 1 }).limit(limit).exec();
  let delivered = 0; let retried = 0; let failed = 0;
  for (const item of queue) {
    item.deliveryAttempts += 1; item.lastAttemptAt = now;
    try { await delivery.deliver(item); item.deliveryStatus = 'delivered'; item.deliveredAt = now; item.nextAttemptAt = undefined; item.lastDeliveryError = undefined; delivered += 1; }
    catch (error) {
      item.lastDeliveryError = error instanceof Error ? error.message.slice(0, 500) : 'delivery_failed';
      const retry = notificationRetryPlan(item.deliveryAttempts, maxAttempts, baseMinutes, now);
      item.deliveryStatus = retry.deliveryStatus; item.nextAttemptAt = retry.nextAttemptAt;
      if (retry.deliveryStatus === 'failed') failed += 1; else retried += 1;
    }
    await item.save();
  }
  return { delivered, retried, failed };
}
