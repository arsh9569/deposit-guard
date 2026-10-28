import { StudentProfileModel } from '../models/student-profiles.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRepository, AuditWriter } from '../auth/types.js';
import { verifyPassword } from '../auth/passwords.js';
import { createAuthenticationMiddleware } from '../middleware/authentication.js';
import { csrfTokenHandler } from '../middleware/csrf.js';
import { loginSchema, profileSchema } from '../validators/auth-schemas.js';


const genericLoginError = { error: 'Invalid email or password' };

export function createAuthRouter(
  repository: AuthRepository,
  audit: AuditWriter,
  sessionTtlMs = 8 * 60 * 60 * 1000,
  production = false,
): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const authentication = createAuthenticationMiddleware(repository);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });

  router.get('/csrf', csrfTokenHandler);
  router.post('/login', loginLimiter, async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid request' });
      return;
    }
    try {
      const user = await repository.findByEmail(parsed.data.email);
      const matches = await verifyPassword(parsed.data.password, user?.passwordHash);
      if (!user || user.status !== 'active' || !matches || !user.passwordHash) {
        await audit.write({
          action: 'authentication.login.failed',
          requestId: request.requestId,
          metadataRedacted: { reason: 'invalid_credentials' },
        });
        response.status(401).json(genericLoginError);
        return;
      }

      await new Promise<void>((resolve, reject) =>
        request.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      request.session.userId = String(user._id);
      request.session.cookie.maxAge = sessionTtlMs;
      await repository.updateLastLogin(String(user._id), new Date());
      await audit.write({
        action: 'authentication.login.succeeded',
        actorId: String(user._id),
        requestId: request.requestId,
      });
      await new Promise<void>((resolve, reject) =>
        request.session.save((error) => (error ? reject(error) : resolve())),
      );
      response.json({ user: await publicUser(user) });
    } catch (error) {
      if (request.session.userId) {
        request.session.destroy(() => undefined);
      }
      next(error);
    }
  });

  router.get('/me', authentication, async (request, response, next) => {
    try { response.json({ user: await publicUser(request.authUser!) }); }
    catch (error) { next(error); }
  });

  router.patch('/profile', authentication, async (request, response, next) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Username must be between 2 and 80 characters.' });
      return;
    }
    try {
      const user = await repository.updateDisplayName(String(request.authUser!._id), parsed.data.displayName);
      if (!user) {
        response.status(401).json({ error: 'Authentication required' });
        return;
      }
      await audit.write({
        action: 'authentication.profile.updated',
        actorId: String(user._id),
        requestId: request.requestId,
        metadataRedacted: { field: 'displayName' },
      });
      response.json({ user: await publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (request, response, next) => {
    try {
      if (request.session.userId) {
        await audit.write({
          action: 'authentication.logout',
          actorId: request.session.userId,
          requestId: request.requestId,
        });
      }
      request.session.destroy((error) => {
        if (error) return next(error);
        response.clearCookie(production ? '__Host-depositguard.sid' : 'depositguard.sid', {
          httpOnly: true,
          secure: production,
          sameSite: 'strict',
          path: '/',
        });
        response.status(204).end();
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/student-profile', authentication, async (request, response, next) => {
  try {
    const user = request.authUser!;

    const profile = await StudentProfileModel.findOne({
      userId: user._id,
    }).lean();

    if (!profile) {
      response.status(404).json({ error: 'Student profile not found' });
      return;
    }

    response.json({
      profile: {
        name: user.displayName,
        email: user.email,
        phone: profile.phone,
        enrollment: profile.enrollment,
        course: profile.course,
        institutionName: profile.institutionName,
      },
    });
  } catch (error) {
    next(error);
  }
});

  return router;
}

async function publicUser(
  user: NonNullable<Awaited<ReturnType<AuthRepository['findById']>>>
) {
  let accountType = user.accountType;

  if (!accountType && user.memberships.length === 0) {
    const studentProfile = await StudentProfileModel.exists({
      userId: user._id,
    });

    if (studentProfile) {
      accountType = 'student';
    }
  }

  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    accountType,
    status: user.status,
    memberships: user.memberships
      .filter((membership) => membership.active)
      .map((membership) => ({
        institutionId: String(membership.institutionId),
        roles: membership.roles,
      })),
  };
}

  
