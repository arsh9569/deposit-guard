import mongoose, { Schema, type Model, Types } from 'mongoose';

export interface InstitutionRegistrationRecord {
  userId: Types.ObjectId;
  institutionName: string;
  email: string;
  phone: string;
  approvalNumber: string;
  representative: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const institutionRegistrationSchema =
  new Schema<InstitutionRegistrationRecord>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
      },
      institutionName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
        match: /^\d{10}$/,
      },
      approvalNumber: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      representative: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        required: true,
        default: 'pending',
      },
    },
    { timestamps: true, strict: 'throw' },
  );

export const InstitutionRegistrationModel:
  Model<InstitutionRegistrationRecord> =
    (mongoose.models.InstitutionRegistration as
  | Model<InstitutionRegistrationRecord>
  | undefined) ??
mongoose.model<InstitutionRegistrationRecord>(
  'InstitutionRegistration',
  institutionRegistrationSchema,
);