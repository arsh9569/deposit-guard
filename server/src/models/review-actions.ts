import mongoose, { model, Schema, Types } from 'mongoose';

export type ReviewDecision = 'approve' | 'reject' | 'request_correction';

export interface ReviewActionRecord {
  institutionId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  decision: ReviewDecision;
  reason: string;
  observations: string[];
  basedOnRevision: number;
  extractionId?: Types.ObjectId;
  createdAt: Date;
}

const reviewActionSchema = new Schema<ReviewActionRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    decision: {
      type: String,
      enum: ['approve', 'reject', 'request_correction'],
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4000,
      immutable: true,
    },
    observations: { type: [String], default: [], immutable: true },
    basedOnRevision: { type: Number, required: true, min: 1, immutable: true },
    extractionId: { type: Schema.Types.ObjectId, ref: 'OcrExtraction', immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);
reviewActionSchema.index(
  { institutionId: 1, instrumentId: 1, createdAt: -1 },
  { name: 'review_instrument_history' },
);
reviewActionSchema.index(
  { institutionId: 1, reviewerId: 1, createdAt: -1 },
  { name: 'review_reviewer_history' },
);

export const ReviewActionModel =
  mongoose.models.ReviewAction ?? model<ReviewActionRecord>('ReviewAction', reviewActionSchema);
