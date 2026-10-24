import mongoose, { model, Schema, Types } from 'mongoose';

export interface WorkflowPolicyRecord {
  institutionId: Types.ObjectId;
  maturityReminderDays: number[];
  dashboardMaturityWindowDays: number;
  notificationMaxAttempts: number;
  notificationRetryBaseMinutes: number;
  releaseEvidenceRequired: boolean;
  requireReplacementForRenewalCompletion: boolean;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const workflowPolicySchema = new Schema<WorkflowPolicyRecord>({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true, immutable: true },
  // An empty array disables pre-maturity reminders until an institution configures its own thresholds.
  maturityReminderDays: { type: [Number], default: [], validate: { validator: (days: number[]) => days.every((n) => Number.isInteger(n) && n >= 0 && n <= 3650) } },
  dashboardMaturityWindowDays: { type: Number, min: 0, max: 3650, default: 30 },
  notificationMaxAttempts: { type: Number, min: 1, max: 20, default: 5 },
  notificationRetryBaseMinutes: { type: Number, min: 1, max: 10080, default: 15 },
  releaseEvidenceRequired: { type: Boolean, default: true },
  requireReplacementForRenewalCompletion: { type: Boolean, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });

export const WorkflowPolicyModel = mongoose.models.WorkflowPolicy ?? model<WorkflowPolicyRecord>('WorkflowPolicy', workflowPolicySchema);
