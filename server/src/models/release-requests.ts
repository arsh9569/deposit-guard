import mongoose, { model, Schema, Types } from 'mongoose';
import { workflowStates, type WorkflowState } from './domain.js';

export type ReleaseRequestType = 'security_release' | 'matured_refund' | 'partial_release';

export interface ReleaseRequestRecord {
  institutionId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  requestType: ReleaseRequestType;
  reason: string;
  supportingDocumentIds: Types.ObjectId[];
  status: WorkflowState;
  scrutinyObservations: string[];
  approvedBy?: Types.ObjectId;
  approvalReason?: string;
  completionEvidenceRef?: string;
  completedBy?: Types.ObjectId;
  completedAt?: Date;
  history: { status: WorkflowState; actorId: Types.ObjectId; reason: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const releaseEventSchema = new Schema<ReleaseRequestRecord['history'][number]>(
  {
    status: { type: String, enum: workflowStates, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
  },
  { _id: false, strict: 'throw' },
);

const releaseSchema = new Schema<ReleaseRequestRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    requestType: {
      type: String,
      enum: ['security_release', 'matured_refund', 'partial_release'],
      required: true,
      immutable: true,
    },
    reason: { type: String, required: true, trim: true, maxlength: 4000 },
    supportingDocumentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
      required: true,
      validate: {
        validator: (documentIds: Types.ObjectId[]) => documentIds.length > 0,
        message: 'At least one supporting document is required',
      },
    },
    status: { type: String, enum: workflowStates, required: true, default: 'requested' },
    scrutinyObservations: { type: [String], default: [] },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvalReason: { type: String, trim: true, maxlength: 4000 },
    completionEvidenceRef: { type: String, trim: true, maxlength: 500 },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    history: { type: [releaseEventSchema], default: [] },
  },
  { timestamps: true, strict: 'throw' },
);
releaseSchema.pre('validate', function () {
  if (
    this.status === 'completed' &&
    (!this.completionEvidenceRef || !this.completedBy || !this.completedAt)
  ) {
    this.invalidate(
      'completionEvidenceRef',
      'completion requires separate evidence, actor, and timestamp',
    );
  }
  if (this.status === 'approved' && (!this.approvedBy || !this.approvalReason)) {
    this.invalidate('approvedBy', 'approval requires an authorized actor and reason');
  }
});
releaseSchema.index(
  { institutionId: 1, status: 1, createdAt: -1 },
  { name: 'release_institution_status' },
);
releaseSchema.index(
  { institutionId: 1, instrumentId: 1, createdAt: -1 },
  { name: 'release_instrument_history' },
);

export const ReleaseRequestModel =
  mongoose.models.ReleaseRequest ?? model<ReleaseRequestRecord>('ReleaseRequest', releaseSchema);
