import mongoose, { model, Schema, Types } from 'mongoose';
import {
  verificationModes,
  verificationAttemptStatuses,
  type VerificationMode,
  type VerificationAttemptStatus,
} from './domain.js';

export interface VerificationAttemptRecord {
  institutionId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  adapter: string;
  mode: VerificationMode;
  status: VerificationAttemptStatus;
  attemptReference: string;
  idempotencyKey: string;
  responseSummary?: string;
  responseEvidenceRef?: string;
  failureCode?: string;
  requestedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationSchema = new Schema<VerificationAttemptRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    adapter: { type: String, required: true, trim: true, immutable: true },
    mode: { type: String, enum: verificationModes, required: true, immutable: true },
    status: { type: String, enum: verificationAttemptStatuses, required: true, default: 'queued' },
    attemptReference: { type: String, required: true, trim: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, immutable: true },
    responseSummary: { type: String, maxlength: 4000 },
    responseEvidenceRef: { type: String, trim: true },
    failureCode: { type: String, trim: true },
    requestedAt: { type: Date, required: true, default: Date.now, immutable: true },
    completedAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);
verificationSchema.index(
  { institutionId: 1, instrumentId: 1, requestedAt: -1 },
  { name: 'verification_instrument_history' },
);
verificationSchema.index(
  { institutionId: 1, status: 1, requestedAt: -1 },
  { name: 'verification_institution_status' },
);
verificationSchema.index(
  { institutionId: 1, adapter: 1, idempotencyKey: 1 },
  { unique: true, name: 'verification_institution_adapter_idempotency' },
);

export const VerificationAttemptModel =
  mongoose.models.VerificationAttempt ??
  model<VerificationAttemptRecord>('VerificationAttempt', verificationSchema);
