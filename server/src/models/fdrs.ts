import mongoose, { model, Schema, Types } from 'mongoose';
import {
  complianceStates,
  instrumentStates,
  instrumentSubmissionStatuses,
  ocrStatuses,
  reviewStatuses,
  verificationStatuses,
  type ComplianceState,
  type InstrumentState,
  type InstrumentSubmissionStatus,
  type OcrStatus,
  type ReviewStatus,
  type VerificationStatus,
} from './domain.js';

export interface FdrRecord {
  institutionId: Types.ObjectId;
  reference: string;
  instrumentNumber: string;
  bankName: string;
  branchName: string;
  holderName: string;
  accountReferenceEncrypted?: string;
  principalAmount: Types.Decimal128;
  currency: string;
  issueDate: Date;
  maturityDate: Date;
  validUntil?: Date;
  documentIds: Types.ObjectId[];
  sourceRenewalId?: Types.ObjectId;
  supersedesInstrumentId?: Types.ObjectId;
  supersededByInstrumentIds: Types.ObjectId[];
  dataRevision: number;
  submissionStatus: InstrumentSubmissionStatus;
  ocrStatus: OcrStatus;
  reviewStatus: ReviewStatus;
  verificationStatus: VerificationStatus;
  instrumentState: InstrumentState;
  complianceState: ComplianceState;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fdrSchema = new Schema<FdrRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    reference: { type: String, required: function () { return this.submissionStatus !== 'draft'; }, trim: true, maxlength: 80 },
    instrumentNumber: { type: String, required: function () { return this.submissionStatus !== 'draft'; }, trim: true, maxlength: 120 },
    bankName: { type: String, required: function () { return this.submissionStatus !== 'draft'; }, trim: true, maxlength: 160 },
    branchName: { type: String, required: function () { return this.submissionStatus !== 'draft'; }, trim: true, maxlength: 160 },
    holderName: { type: String, required: function () { return this.submissionStatus !== 'draft'; }, trim: true, maxlength: 240 },
    accountReferenceEncrypted: { type: String, select: false },
    principalAmount: {
      type: Schema.Types.Decimal128,
      required: function () { return this.submissionStatus !== 'draft'; },
      validate: {
        validator: (amount: Types.Decimal128) =>
          /^\d{1,16}(\.\d{1,2})?$/.test(amount.toString()) &&
          !/^0+(\.0+)?$/.test(amount.toString()),
        message: 'principalAmount must be a positive decimal with at most two fractional digits',
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
      default: 'INR',
    },
    issueDate: { type: Date, required: function (this: FdrRecord): boolean { return this.submissionStatus !== 'draft'; } },
    maturityDate: { type: Date, required: function (this: FdrRecord): boolean { return this.submissionStatus !== 'draft'; } },
    validUntil: { type: Date },
    documentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    sourceRenewalId: { type: Schema.Types.ObjectId, ref: 'RenewalRecord', immutable: true },
    supersedesInstrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr' },
    supersededByInstrumentIds: [{ type: Schema.Types.ObjectId, ref: 'Fdr' }],
    dataRevision: { type: Number, required: true, min: 1, default: 1 },
    submissionStatus: {
      type: String,
      enum: instrumentSubmissionStatuses,
      required: true,
      default: 'draft',
    },
    ocrStatus: { type: String, enum: ocrStatuses, required: true, default: 'not_requested' },
    reviewStatus: { type: String, enum: reviewStatuses, required: true, default: 'not_reviewed' },
    verificationStatus: {
      type: String,
      enum: verificationStatuses,
      required: true,
      default: 'not_requested',
    },
    instrumentState: { type: String, enum: instrumentStates, required: true, default: 'active' },
    complianceState: { type: String, enum: complianceStates, required: true, default: 'current' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true, strict: 'throw' },
);

fdrSchema.pre('validate', function () {
  if (this.issueDate && this.maturityDate && this.maturityDate <= this.issueDate) {
    this.invalidate('maturityDate', 'maturityDate must be later than issueDate');
  }
  if (this.validUntil && this.maturityDate && this.validUntil < this.maturityDate) {
    this.invalidate('validUntil', 'validUntil cannot be earlier than maturityDate');
  }
});

fdrSchema.index(
  { institutionId: 1, reference: 1 },
  { unique: true, name: 'fdr_institution_reference_unique', partialFilterExpression: { reference: { $type: 'string' } } },
);
fdrSchema.index({ institutionId: 1, maturityDate: 1 }, { name: 'fdr_institution_maturity' });
fdrSchema.index(
  { institutionId: 1, reviewStatus: 1, createdAt: -1 },
  { name: 'fdr_institution_review_status' },
);
fdrSchema.index(
  { institutionId: 1, verificationStatus: 1, updatedAt: -1 },
  { name: 'fdr_institution_verification_status' },
);
fdrSchema.index(
  { institutionId: 1, instrumentState: 1, maturityDate: 1 },
  { name: 'fdr_institution_state_maturity' },
);

export const FdrModel = mongoose.models.Fdr ?? model<FdrRecord>('Fdr', fdrSchema);
