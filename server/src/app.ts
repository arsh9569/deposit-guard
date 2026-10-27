import MongoStore from 'connect-mongo';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import type { Store } from 'express-session';
import { auditWriter } from './auth/audit-writer.js';
import { userRepository } from './auth/repository.js';
import type { AuditWriter, AuthRepository } from './auth/types.js';
import { env } from './config/env.js';
import { csrfProtection } from './middleware/csrf.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { registerRouter } from './routes/register.js';
import { createAuthRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createFdrSubmissionRouter } from './routes/fdr-submissions.js';
import { createStudentLinkingRouter } from './routes/student-linking.js';
import { studentPortalRouter } from './routes/student-portal.js';
import type { DocumentExtractor } from './services/fdr-document-processing.js';
import { createInstitutionWorkflowRouter } from './routes/institution-workflows.js';
import type { NotificationDelivery } from './services/maturity-monitoring.js';
import { dashboardRouter } from './routes/dashboard.js';
import { apiErrorHandler } from './middleware/api-error.js';
import { createVerificationRouter } from './routes/verification.js';
import { otpRouter } from './routes/otp.js';

export interface AppDependencies {
  repository?: AuthRepository;
  audit?: AuditWriter;
  sessionStore?: Store;
  sessionSecret?: string;
  sessionTtlMs?: number;
  production?: boolean;
  documentExtractor?: DocumentExtractor;
  notificationDelivery?: NotificationDelivery;
}

export function createApp(dependencies: AppDependencies = {}) {
  const production = dependencies.production ?? env.NODE_ENV === 'production';
  const sessionTtlMs = dependencies.sessionTtlMs ?? env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', production ? env.TRUST_PROXY_HOPS : false);
  app.use(requestIdMiddleware);
  app.use(
    cors({ origin: env.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'] }),
  );
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(
    session({
      name: production ? '__Host-depositguard.sid' : 'depositguard.sid',
      secret: dependencies.sessionSecret ?? env.SESSION_SECRET,
      store:
        dependencies.sessionStore ??
        MongoStore.create({
          mongoUrl: env.MONGODB_URI,
          collectionName: 'server_sessions',
          ttl: Math.floor(sessionTtlMs / 1000),
          autoRemove: 'native',
        }),
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: '/',
        maxAge: sessionTtlMs,
      },
    }),
  );
  app.use('/api', csrfProtection);
  app.use('/api/auth/register', registerRouter);
  app.use('/api/auth/otp', otpRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/institutions/:institutionId/fdr', createFdrSubmissionRouter(dependencies.documentExtractor));
  app.use('/api/institutions/:institutionId/student-linking', createStudentLinkingRouter());
  app.use('/api/student', studentPortalRouter);
  app.use('/api/institutions/:institutionId/verification', createVerificationRouter({ audit: dependencies.audit }));
  app.use('/api/institutions/:institutionId/workflows', createInstitutionWorkflowRouter({ audit: dependencies.audit, notificationDelivery: dependencies.notificationDelivery }));
  app.use(
    '/api/auth',
    createAuthRouter(
      dependencies.repository ?? userRepository,
      dependencies.audit ?? auditWriter,
      sessionTtlMs,
      production,
    ),
  );
  app.use(apiErrorHandler);
  return app;
}

export const app = createApp();
