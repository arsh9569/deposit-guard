import mongoose, { model, Schema, Types } from 'mongoose';

export interface AuditLogRecord {
  scope: 'institution' | 'platform';
  institutionId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorRoleSnapshot?: string[];
  action: string;
  targetType: string;
  targetId?: Types.ObjectId;
  requestId: string;
  reason?: string;
  beforeHash?: string;
  afterHash?: string;
  metadataRedacted: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
}

const auditSchema = new Schema<AuditLogRecord>(
  {
    scope: { type: String, enum: ['institution', 'platform'], required: true, immutable: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', immutable: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    actorRoleSnapshot: { type: [String], default: [], immutable: true },
    action: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
    targetType: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    targetId: { type: Schema.Types.ObjectId, immutable: true },
    requestId: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    reason: { type: String, trim: true, maxlength: 4000, immutable: true },
    beforeHash: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true },
    afterHash: { type: String, match: /^[a-f0-9]{64}$/i, immutable: true },
    metadataRedacted: { type: Schema.Types.Mixed, required: true, default: {}, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);
auditSchema.pre('validate', function () {
  if (this.scope === 'institution' && !this.institutionId) {
    this.invalidate('institutionId', 'institution-scoped audit events require institutionId');
  }
});
auditSchema.index({ institutionId: 1, occurredAt: -1 }, { name: 'audit_institution_timeline' });
auditSchema.index(
  { targetType: 1, targetId: 1, occurredAt: -1 },
  { name: 'audit_target_timeline' },
);
auditSchema.index({ actorId: 1, occurredAt: -1 }, { name: 'audit_actor_timeline' });

export const AuditLogModel =
  mongoose.models.AuditLog ?? model<AuditLogRecord>('AuditLog', auditSchema);
