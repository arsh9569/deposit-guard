import mongoose, { model, Schema, Types } from 'mongoose';
import { institutionRoles, type InstitutionRole } from './domain.js';

export interface UserMembership {
  institutionId: Types.ObjectId;
  roles: InstitutionRole[];
  active: boolean;
}

export interface UserRecord {
  authSubject: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  status: 'active' | 'suspended' | 'invited';
  memberships: UserMembership[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<UserMembership>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    roles: { type: [String], enum: institutionRoles, required: true, default: [] },
    active: { type: Boolean, required: true, default: true },
  },
  { _id: false, strict: 'throw' },
);

const userSchema = new Schema<UserRecord>(
  {
    authSubject: { type: String, required: true, trim: true, immutable: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    // Argon2id/bcrypt encoded value. Never expose this field in API responses.
    passwordHash: { type: String, select: false },
    status: {
      type: String,
      enum: ['active', 'suspended', 'invited'],
      required: true,
      default: 'invited',
    },
    memberships: { type: [membershipSchema], default: [] },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);

userSchema.index({ authSubject: 1 }, { unique: true, name: 'user_auth_subject_unique' });
userSchema.index({ email: 1 }, { unique: true, name: 'user_email_unique' });
userSchema.index({ 'memberships.institutionId': 1, status: 1 }, { name: 'user_membership_lookup' });

export const UserModel = mongoose.models.User ?? model<UserRecord>('User', userSchema);
