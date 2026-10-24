import mongoose, { model, Schema, Types } from 'mongoose';

export interface ConfiguredRule {
  ruleKey: string;
  value: string;
  unit?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  version: number;
  sourceDescription: string;
  assumptionLabel?: string;
  approvedBy?: Types.ObjectId;
}

export interface InstitutionRecord {
  name: string;
  shortName: string;
  externalReference: string;
  status: 'active' | 'suspended' | 'pending';
  timezone: string;
  configuredRules: ConfiguredRule[];
  createdAt: Date;
  updatedAt: Date;
}

const configuredRuleSchema = new Schema<ConfiguredRule>(
  {
    ruleKey: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    version: { type: Number, required: true, min: 1 },
    sourceDescription: { type: String, required: true, trim: true },
    assumptionLabel: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true, strict: 'throw' },
);

const institutionSchema = new Schema<InstitutionRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 240 },
    shortName: { type: String, required: true, trim: true, maxlength: 100 },
    externalReference: { type: String, required: true, trim: true, immutable: true },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending'],
      required: true,
      default: 'pending',
    },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    configuredRules: { type: [configuredRuleSchema], default: [] },
  },
  { timestamps: true, strict: 'throw' },
);

institutionSchema.index(
  { externalReference: 1 },
  { unique: true, name: 'institution_external_reference_unique' },
);
institutionSchema.index({ status: 1, name: 1 }, { name: 'institution_status_name' });

export const InstitutionModel =
  mongoose.models.Institution ?? model<InstitutionRecord>('Institution', institutionSchema);
