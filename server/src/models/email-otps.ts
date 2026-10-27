import { Schema, model } from 'mongoose';

const emailOtpSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    resendAfter: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailOtpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 86400 },
);

export const EmailOtp = model('EmailOtp', emailOtpSchema);