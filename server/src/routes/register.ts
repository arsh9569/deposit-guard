import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { UserModel } from '../models/users.js';
import { hashPassword, newPasswordSchema } from '../auth/passwords.js';
import mongoose from 'mongoose';
import { StudentProfileModel } from '../models/student-profiles.js';
import { InstitutionRegistrationModel } from '../models/institution-registrations.js';
import { InstitutionModel } from '../models/institutions.js';
export const registerRouter = Router();

const registerSchema = z.object({
  type: z.enum(['student', 'institution']),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  password: newPasswordSchema,
  phone: z.string().regex(/^\d{10}$/),
  enrollment: z.string().trim().optional(),
  course: z.string().trim().optional(),
  institutionName: z.string().trim().optional(),
  institutionId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  approvalNumber: z.string().trim().optional(),
  representative: z.string().trim().optional(),
});

registerRouter.post(
  '/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid registration details' });
        return;
      }

      const { type, name, password } = parsed.data;
      const email = parsed.data.email.toLowerCase();
      let verifiedInstitutionId: Types.ObjectId | undefined;

if (type === 'student' && parsed.data.institutionId) {
  const institution = await InstitutionModel.findOne({
    _id: parsed.data.institutionId,
    status: 'active',
  }).select('_id name');

  if (!institution) {
    res.status(400).json({
      error: 'Selected institution is not available.',
    });
    return;
  }

  verifiedInstitutionId = institution._id;
}

      // Registration must use the same session that verified the OTP.
const verifiedEmail = req.session.signupVerifiedEmail;
const verifiedAt = req.session.signupVerifiedAt;

if (
  verifiedEmail !== email ||
  !verifiedAt ||
  Date.now() - verifiedAt > 5 * 60 * 1000 ||
  verifiedAt > Date.now()
) {
  res.status(403).json({
    error: 'Email verification expired. Please verify your email again.',
  });
  return;
}

      const existingUser = await UserModel.exists({ email });

      if (existingUser) {
        res.status(409).json({
          error: 'An account with this email already exists.',
        });
        return;
      }

      const passwordHash = await hashPassword(password);

if (type === 'student') {
  if (
    !parsed.data.enrollment?.trim() ||
    !parsed.data.course?.trim() ||
    !parsed.data.institutionName?.trim()
  ) {
    res.status(400).json({ error: 'Student details are required.' });
    return;
  }
} else {
  if (
    !parsed.data.institutionName?.trim() ||
    !parsed.data.approvalNumber?.trim() ||
    !parsed.data.representative?.trim()
  ) {
    res.status(400).json({ error: 'Institution details are required.' });
    return;
  }
}

try {
  await mongoose.connection.transaction(async (session) => {
    const [user] = await UserModel.create(
      [{
        authSubject: `local:${randomUUID()}`,
        email,
        displayName: name,
        accountType: type,
        passwordHash,
        status: type === 'student' ? 'active' : 'invited',
        memberships: [],
      }],
      { session },
    );
    if (!user) {
  throw new Error('User creation failed');
}

    if (type === 'student') {
      await StudentProfileModel.create(
        [{
          userId: user._id,
          phone: parsed.data.phone,
          enrollment: parsed.data.enrollment,
          course: parsed.data.course,
          institutionName: parsed.data.institutionName,
        }],
        { session },
      );
    } else {
      await InstitutionRegistrationModel.create(
        [{
          userId: user._id,
          institutionName: parsed.data.institutionName,
          email,
          phone: parsed.data.phone,
          approvalNumber: parsed.data.approvalNumber,
          representative: parsed.data.representative,
          status: 'pending',
        }],
        { session },
      );
    }
  });
} catch (error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  ) {
    res.status(409).json({
      error: 'An account with this email already exists.',
    });
    return;
  }
  throw error;
}

      delete req.session.signupVerifiedEmail;
delete req.session.signupVerifiedAt;

await new Promise<void>((resolve, reject) => {
  req.session.save((error) => {
    if (error) reject(error);
    else resolve();
  });
});

      res.status(201).json({
        message:
          type === 'student'
            ? 'Account created successfully. You can now sign in.'
            : 'Registration received. Institution approval is pending.',
      });
    } catch (error) {
      next(error);
    }
  },
);
