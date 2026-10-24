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
import { createAuthRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';

export interface AppDependencies {
  repository?: AuthRepository;
  audit?: AuditWriter;
  sessionStore?: Store;
  sessionSecret?: string;
  sessionTtlMs?: number;
  production?: boolean;
}

export function createApp(dependencies: AppDependencies = {}) {
  const production = dependencies.production ?? env.NODE_ENV === 'production';
  const sessionTtlMs = dependencies.sessionTtlMs ?? env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', production ? env.TRUST_PROXY_HOPS : false);
  app.use(requestIdMiddleware);
  app.use(
    cors({ origin: env.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'OPTIONS'] }),
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
  app.use('/api/health', healthRouter);
  app.use(
    '/api/auth',
    createAuthRouter(
      dependencies.repository ?? userRepository,
      dependencies.audit ?? auditWriter,
      sessionTtlMs,
      production,
    ),
  );
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      // Do not disclose internals, session contents, or credentials in error responses.
      void _next;
      console.error('Request failed', error);
      response.status(500).json({ error: 'Internal server error' });
    },
  );
  return app;
}

export const app = createApp();
