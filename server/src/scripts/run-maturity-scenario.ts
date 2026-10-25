import mongoose, { Types, type Model } from 'mongoose';
import { auditWriter } from '../auth/audit-writer.js';
import { connectDatabase } from '../config/database.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { InstitutionModel, type InstitutionRecord } from '../models/institutions.js';
import { NotificationModel, type NotificationRecord } from '../models/notifications.js';
import { UserModel, type UserRecord } from '../models/users.js';
import { WorkflowPolicyModel, type WorkflowPolicyRecord } from '../models/workflow-policies.js';
import { generateMaturityNotifications } from '../services/maturity-monitoring.js';

const fdrs = FdrModel as Model<FdrRecord>;
const institutions = InstitutionModel as Model<InstitutionRecord>;
const notifications = NotificationModel as Model<NotificationRecord>;
const users = UserModel as Model<UserRecord>;
const policies = WorkflowPolicyModel as Model<WorkflowPolicyRecord>;

await connectDatabase();
try {
  const institution = await institutions.findOne({ externalReference: 'DEMO-NORTHBRIDGE-001' }).exec();
  const operator = await users.findOne({ email: 'operator@northbridge.example' }).exec();
  if (!institution || !operator) throw new Error('Seed the local Northbridge demo institution before running this scenario.');
  const policy = await policies.findOne({ institutionId: institution._id }).lean().exec();
  const reminderDays = policy?.maturityReminderDays ?? [];
  if (![30, 7, 1].every((offset) => reminderDays.includes(offset))) {
    throw new Error('Configure reminder offsets 30, 7, and 1 days for this test scenario.');
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const maturityFor = (offset: number) => new Date(today.getTime() + offset * 86_400_000);
  const cases = [
    { reference: 'FDR-SCENARIO-4-30D', offset: 30 },
    { reference: 'FDR-SCENARIO-4-7D', offset: 7 },
    { reference: 'FDR-SCENARIO-4-1D', offset: 1 },
    { reference: 'FDR-SCENARIO-4-YESTERDAY', offset: -1 },
  ];
  const instrumentIds: Types.ObjectId[] = [];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index]!;
    const instrumentId = new Types.ObjectId(`${'0'.repeat(20)}${String(index + 1).padStart(4, '0')}`);
    instrumentIds.push(instrumentId);
    await fdrs.findOneAndUpdate({ _id: instrumentId }, { $set: {
      institutionId: institution._id, reference: item.reference, instrumentNumber: item.reference,
      bankName: 'Synthetic Scenario Bank', branchName: 'Synthetic Test Branch', holderName: 'Northbridge Synthetic Institute',
      principalAmount: Types.Decimal128.fromString('250000.00'), currency: 'INR',
      issueDate: new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate())),
      maturityDate: maturityFor(item.offset), documentIds: [], supersededByInstrumentIds: [], dataRevision: 1,
      submissionStatus: 'accepted', ocrStatus: 'not_requested', reviewStatus: 'approved',
      verificationStatus: 'not_requested', instrumentState: 'active',
      complianceState: item.offset < 0 ? 'overdue_action' : 'upcoming_action', createdBy: operator._id,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
  }

  const firstRun = await generateMaturityNotifications(institution._id.toString(), now, auditWriter, 'scenario-4-run-1', operator._id.toString());
  const secondRun = await generateMaturityNotifications(institution._id.toString(), now, auditWriter, 'scenario-4-run-2', operator._id.toString());
  const scenarioNotifications = await notifications.find({
    institutionId: institution._id, resourceId: { $in: instrumentIds },
    kind: { $in: ['maturity_reminder', 'maturity_overdue'] },
  }).sort({ message: 1 }).lean().exec();
  const uniqueKeys = new Set(scenarioNotifications.map((notification) => notification.dedupeKey));
  const expectedMessages = cases.map(({ reference, offset }) => offset < 0
    ? `${reference} passed its maturity date 1 day(s) ago.`
    : `${reference} matures in ${offset} day(s).`);
  const actualMessages = scenarioNotifications.map((notification) => notification.message);
  if (firstRun.created !== 4 || secondRun.created !== 0 || scenarioNotifications.length !== 4 || uniqueKeys.size !== 4 || expectedMessages.some((message) => !actualMessages.includes(message))) {
    throw new Error('Maturity scenario failed its reminder or idempotency assertions.');
  }
  console.info(JSON.stringify({
    reminderDays, firstRunCreated: firstRun.created, retryCreated: secondRun.created,
    notifications: scenarioNotifications.map(({ message, kind, dedupeKey }) => ({ message, kind, dedupeKey })),
    uniqueDedupeKeys: uniqueKeys.size,
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
