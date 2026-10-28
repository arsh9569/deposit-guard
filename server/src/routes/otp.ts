import { randomInt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { EmailOtp } from '../models/email-otps.js';
import { sendOtpEmail } from '../services/otp-mailer.js';
import { env } from '../config/env.js';

export interface OtpRecord {
  id: string;
  otpHash: string;
  expiresAt: Date;
  resendAfter: Date;
  attempts: number;
  verifiedAt: Date | null;
}

interface OtpStore {
  findByEmail(email: string): Promise<OtpRecord | null>;
  save(email: string, otpHash: string, now: Date): Promise<void>;
  discard(email: string, otpHash: string): Promise<void>;
  incrementAttempts(id: string): Promise<void>;
  markVerified(id: string, now: Date): Promise<boolean>;
}

interface OtpRouterDependencies {
  store?: OtpStore;
  deliverOtp?: typeof sendOtpEmail;
}

const databaseOtpStore: OtpStore = {
  async findByEmail(email) {
    const record = await EmailOtp.findOne({ email }).maxTimeMS(5_000);
    if (!record) return null;
    return {
      id: String(record._id),
      otpHash: record.otpHash,
      expiresAt: record.expiresAt,
      resendAfter: record.resendAfter,
      attempts: record.attempts,
      verifiedAt: record.verifiedAt ?? null,
    };
  },
  async save(email, otpHash, now) {
    await EmailOtp.findOneAndUpdate(
      { email },
      {
        $set: {
          otpHash,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
          resendAfter: new Date(now.getTime() + 60 * 1000),
          attempts: 0,
          verifiedAt: null,
        },
      },
      { upsert: true, new: true, maxTimeMS: 5_000 },
    );
  },
  async discard(email, otpHash) {
    await EmailOtp.deleteOne({ email, otpHash }, { maxTimeMS: 5_000 });
  },
  async incrementAttempts(id) {
    await EmailOtp.updateOne(
      { _id: id, verifiedAt: null },
      { $inc: { attempts: 1 } },
      { maxTimeMS: 5_000 },
    );
  },
  async markVerified(id, now) {
    const result = await EmailOtp.updateOne(
      {
        _id: id,
        verifiedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: 5 },
      },
      { $set: { verifiedAt: now } },
      { maxTimeMS: 5_000 },
    );
    return result.modifiedCount === 1;
  },
};

const otpSchema = z.object({
  email: z.string().trim().email().max(254),
});

const verifySchema = otpSchema.extend({
  otp: z.string().regex(/^\d{6}$/),
});

export function createOtpRouter(dependencies: OtpRouterDependencies = {}): Router {
  const router = Router();
  const store = dependencies.store ?? databaseOtpStore;
  const deliverOtp = dependencies.deliverOtp ?? sendOtpEmail;
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
      const existing = await store.findByEmail(email);

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

      await store.save(email, otpHash, now);
      try {
        await deliverOtp(email, otp);
      } catch (error) {
        await store.discard(email, otpHash);
        console.error(
          JSON.stringify({
            event: 'otp_delivery_failed',
            requestId: req.requestId,
            errorType:
              error instanceof Error ? error.constructor.name : 'UnknownError',
          }),
        );
        res.status(503).json({
          error: 'Verification email could not be sent. Please try again shortly.',
        });
        return;
      }

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
      const record = await store.findByEmail(email);

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
        await store.incrementAttempts(record.id);
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
      }

      const verifiedAt = new Date();
      if (!(await store.markVerified(record.id, verifiedAt))) {
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
      }

      req.session.signupVerifiedEmail = email;
      req.session.signupVerifiedAt = verifiedAt.getTime();

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

  return router;
}

export const otpRouter = createOtpRouter();