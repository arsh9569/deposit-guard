import mongoose, { model, Schema, Types } from 'mongoose';
import { ocrJobStatuses, type OcrJobStatus } from './domain.js';

export interface ExtractedField {
  fieldName: string;
  value: string;
  confidence: number;
  pageNumber?: number;
  sourceText?: string;
}

export interface OcrExtractionRecord {
  institutionId: Types.ObjectId;
  documentId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  provider: string;
  providerVersion?: string;
  status: OcrJobStatus;
  fields: ExtractedField[];
  failureCode?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OcrCorrectionRecord {
  institutionId: Types.ObjectId;
  extractionId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  fieldName: string;
  originalValue: string;
  correctedValue: string;
  correctedBy: Types.ObjectId;
  reason?: string;
  createdAt: Date;
}

const extractedFieldSchema = new Schema<ExtractedField>(
  {
    fieldName: { type: String, required: true, trim: true },
    value: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    pageNumber: { type: Number, min: 1 },
    sourceText: { type: String },
  },
  { _id: false, strict: 'throw' },
);

const extractionSchema = new Schema<OcrExtractionRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, immutable: true },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    provider: { type: String, required: true, trim: true, immutable: true },
    providerVersion: { type: String, trim: true, immutable: true },
    status: { type: String, enum: ocrJobStatuses, required: true, default: 'queued' },
    fields: { type: [extractedFieldSchema], default: [] },
    failureCode: { type: String, trim: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);
extractionSchema.index(
  { institutionId: 1, documentId: 1, createdAt: -1 },
  { name: 'ocr_institution_document_history' },
);
extractionSchema.index(
  { institutionId: 1, status: 1, createdAt: -1 },
  { name: 'ocr_institution_status' },
);

const correctionSchema = new Schema<OcrCorrectionRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    extractionId: {
      type: Schema.Types.ObjectId,
      ref: 'OcrExtraction',
      required: true,
      immutable: true,
    },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    fieldName: { type: String, required: true, trim: true, immutable: true },
    originalValue: { type: String, required: true, immutable: true },
    correctedValue: { type: String, required: true, immutable: true },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    reason: { type: String, trim: true, maxlength: 2000, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' },
);
correctionSchema.index(
  { institutionId: 1, extractionId: 1, createdAt: 1 },
  { name: 'ocr_correction_history' },
);

export const OcrExtractionModel =
  mongoose.models.OcrExtraction ?? model<OcrExtractionRecord>('OcrExtraction', extractionSchema);
export const OcrCorrectionModel =
  mongoose.models.OcrCorrection ?? model<OcrCorrectionRecord>('OcrCorrection', correctionSchema);
