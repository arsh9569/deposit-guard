import mongoose, { model, Schema, Types } from 'mongoose';
import { renewalStatuses, type RenewalStatus } from './domain.js';

export type RenewalKind = 'renewal' | 'replacement';

export interface RenewalRecord {
  institutionId: Types.ObjectId;
  sourceInstrumentId: Types.ObjectId;
  replacementInstrumentId?: Types.ObjectId;
  requestedBy: Types.ObjectId;
  kind: RenewalKind;
  status: RenewalStatus;
  reason: string;
  supportingDocumentIds: Types.ObjectId[];
  history: {
    from?: RenewalStatus;
    to: RenewalStatus;
    actorId: Types.ObjectId;
    reason: string;
    at: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const renewalEventSchema = new Schema<RenewalRecord['history'][number]>(
  {
    from: { type: String, enum: renewalStatuses },
    to: { type: String, enum: renewalStatuses, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
  },
  { _id: false, strict: 'throw' },
);

const renewalSchema = new Schema<RenewalRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    sourceInstrumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Fdr',
      required: true,
      immutable: true,
    },
    replacementInstrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr' },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    kind: { type: String, enum: ['renewal', 'replacement'], required: true, immutable: true },
    status: { type: String, enum: renewalStatuses, required: true, default: 'pending' },
    reason: { type: String, required: true, trim: true, maxlength: 4000 },
    supportingDocumentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    history: { type: [renewalEventSchema], default: [] },
  },
  { timestamps: true, strict: 'throw' },
);
renewalSchema.index(
  { institutionId: 1, status: 1, createdAt: -1 },
  { name: 'renewal_institution_status' },
);
renewalSchema.index(
  { institutionId: 1, sourceInstrumentId: 1, createdAt: -1 },
  { name: 'renewal_source_history' },
);
renewalSchema.index(
  { institutionId: 1, replacementInstrumentId: 1 },
  { name: 'renewal_replacement_lookup', sparse: true },
);

export const RenewalRecordModel =
  mongoose.models.RenewalRecord ?? model<RenewalRecord>('RenewalRecord', renewalSchema);
