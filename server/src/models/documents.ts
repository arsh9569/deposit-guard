import mongoose, { model, Schema, Types } from 'mongoose';

export interface DocumentRecord {
  institutionId: Types.ObjectId;
  instrumentId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  originalFileName: string;
  storageKey: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  purpose: 'fdr_instrument' | 'renewal_evidence' | 'release_evidence' | 'other';
  malwareScanStatus: 'pending' | 'clean' | 'quarantined' | 'failed';
  retentionState: 'active' | 'held' | 'pending_deletion' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<DocumentRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    instrumentId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, immutable: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    originalFileName: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, required: true, unique: true, select: false, immutable: true },
    contentType: { type: String, required: true, trim: true, maxlength: 120 },
    byteLength: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/i, immutable: true },
    purpose: {
      type: String,
      enum: ['fdr_instrument', 'renewal_evidence', 'release_evidence', 'other'],
      required: true,
    },
    malwareScanStatus: {
      type: String,
      enum: ['pending', 'clean', 'quarantined', 'failed'],
      required: true,
      default: 'pending',
    },
    retentionState: {
      type: String,
      enum: ['active', 'held', 'pending_deletion', 'deleted'],
      required: true,
      default: 'active',
    },
  },
  { timestamps: true, strict: 'throw' },
);

documentSchema.index(
  { institutionId: 1, instrumentId: 1, createdAt: -1 },
  { name: 'document_institution_instrument' },
);
documentSchema.index(
  { institutionId: 1, malwareScanStatus: 1 },
  { name: 'document_institution_scan_status' },
);

export const DocumentModel =
  mongoose.models.Document ?? model<DocumentRecord>('Document', documentSchema);
