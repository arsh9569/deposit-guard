import { randomInt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { EmailOtp } from '../models/email-otps.js';
import { sendOtpEmail } from '../services/otp-mailer.js';
import { env } from '../config/env.js';

const router = Router();

const otpSchema = z.object({
  email: z.string().trim().email().max(254),
});

const verifySchema = otpSchema.extend({
  otp: z.string().regex(/^\d{6}$/),
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.post('/send', limiter, async (req, res, next) => {
  try {
    const parsed = otpSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const now = new Date();

    const existing = await EmailOtp.findOne({ email });

    if (existing && existing.resendAfter > now) {
      res.status(429).json({
        error: 'Please wait before requesting another OTP',
      });
      return;
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(32).toString('hex');

    const otpHash =
      salt +
      ':' +
      createHmac('sha256', env.SESSION_SECRET)
        .update(`${email}:${salt}:${otp}`)
        .digest('hex');

    await EmailOtp.findOneAndUpdate(
      { email },
      {
        $set: {
          otpHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          resendAfter: new Date(Date.now() + 60 * 1000),
          attempts: 0,
          verifiedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    await sendOtpEmail(email, otp);

    res.json({
      message: 'OTP sent successfully',
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify', limiter, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid verification request' });
      return;
    }

    const email = parsed.data.email.toLowerCase();

    const record = await EmailOtp.findOne({ email });

    if (
      !record ||
      record.expiresAt <= new Date() ||
      record.attempts >= 5 ||
      record.verifiedAt
    ) {
      res.status(400).json({ error: 'Invalid or expired OTP' });
      return;
    }

    const [salt, storedHash] = record.otpHash.split(':');

    if (!salt || !storedHash || !/^[a-f0-9]{64}$/.test(storedHash)) {
      res.status(400).json({ error: 'Invalid or expired OTP' });
      return;
    }

    const enteredHash = createHmac('sha256', env.SESSION_SECRET)
      .update(`${email}:${salt}:${parsed.data.otp}`)
      .digest();

    const matches = timingSafeEqual(
      enteredHash,
      Buffer.from(storedHash, 'hex'),
    );

    if (!matches) {
      await EmailOtp.updateOne(
        { _id: record._id, verifiedAt: null },
        { $inc: { attempts: 1 } },
      );

      res.status(400).json({ error: 'Invalid or expired OTP' });
      return;
    }

    const verification = await EmailOtp.updateOne(
  {
    _id: record._id,
    verifiedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 5 },
  },
  {
    $set: { verifiedAt: new Date() },
  },
);

if (verification.modifiedCount !== 1) {
  res.status(400).json({ error: 'Invalid or expired OTP' });
  return;
}

req.session.signupVerifiedEmail = email;
req.session.signupVerifiedAt = Date.now();

await new Promise<void>((resolve, reject) => {
  req.session.save((error) => {
    if (error) reject(error);
    else resolve();
  });
});

res.json({ verified: true });
  } catch (error) {
    next(error);
  }
});

export const otpRouter = router;