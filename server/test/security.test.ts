import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import type { AuditWriter, AuthRepository, AuthUser } from '../src/auth/types.js';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import type { InstitutionRole } from '../src/models/domain.js';
import { createAuthenticationMiddleware } from '../src/middleware/authentication.js';
import { requireInstitutionRole } from '../src/middleware/authorization.js';
import { csrfProtection } from '../src/middleware/csrf.js';
import { requestIdMiddleware } from '../src/middleware/request-id.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { privateDocumentFilter } from '../src/services/fdr-document-processing.js';

const institutionA = '64b000000000000000000001';
const institutionB = '64b000000000000000000002';
const userAId = '64b000000000000000000010';
const userBId = '64b000000000000000000020';
const password = 'synthetic-test-password-42';
const passwordHash = await bcrypt.hash(password, 4);
const noOpAudit: AuditWriter = { async write() {} };

function makeUser(id: string, institutionId: string, roles: InstitutionRole[]): AuthUser {
  return {
    _id: id,
    email: `${id.slice(-2)}@example.test`,
    displayName: 'Synthetic Test User',
    status: 'active',
    passwordHash,
    memberships: [{ institutionId, roles, active: true }],
  };
}

const users = [
  makeUser(userAId, institutionA, ['institution_operator']),
  makeUser(userBId, institutionB, ['official_reviewer']),
];

function makeRepository(): AuthRepository {
  return {
    async findByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.find((user) => String(user._id) === id) ?? null;
    },
    async updateLastLogin() {},
    async updateDisplayName(id, displayName) {
      const user = users.find((candidate) => String(candidate._id) === id);
      if (!user) return null;
      user.displayName = displayName;
      return user;
    },
  };
}

function makeApp(ttlMs = 60_000) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    session({
      secret: 'test-only-session-secret-not-for-deployment',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'strict', secure: false, maxAge: ttlMs },
    }),
  );
  app.use('/api', csrfProtection);
  app.use('/api/auth', createAuthRouter(makeRepository(), noOpAudit, ttlMs, false));
  const authenticate = createAuthenticationMiddleware(makeRepository());
  app.get(
    '/api/institutions/:institutionId/data',
    authenticate,
    requireInstitutionRole(['institution_operator', 'institution_admin'], noOpAudit),
    (req, res) => res.json({ institutionId: req.institutionScope?.institutionId }),
  );
  app.post(
    '/api/institutions/:institutionId/approve',
    authenticate,
    requireInstitutionRole(['official_reviewer'], noOpAudit),
    (req, res) => res.status(204).end(),
  );
  app.get(
    '/api/institutions/:institutionId/documents/:documentId',
    authenticate,
    requireInstitutionRole(['institution_operator', 'institution_admin'], noOpAudit),
    (req, res) => {
      const documentId = Array.isArray(req.params.documentId) ? req.params.documentId[0]! : req.params.documentId!;
      res.json(privateDocumentFilter(documentId, req.institutionScope!.institutionId));
    },
  );
  return app;
}

test('password helper enforces its baseline and verifies a one-way bcrypt hash', async () => {
  await assert.rejects(hashPassword('short'));
  const encoded = await hashPassword('secure-synthetic-password-2026');
  assert.notEqual(encoded, 'secure-synthetic-password-2026');
  assert.equal(await verifyPassword('secure-synthetic-password-2026', encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
});

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string
) {
  const csrf = await agent.get('/api/auth/csrf');

  const response = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ email, password });

  assert.equal(
    response.status,
    200,
    `Login failed: ${JSON.stringify(response.body)}`
  );

  return response;
}

test('unauthenticated request is denied', async () => {
  const response = await request(makeApp()).get(`/api/institutions/${institutionA}/data`);
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
});

test('cross-institution access is denied even when caller supplies another institution ID', async () => {
  const agent = request.agent(makeApp());
  await login(agent, users[0]!.email);
  const response = await agent.get(`/api/institutions/${institutionB}/data`);
  assert.equal(response.status, 404);
});

test('institution operator cannot retrieve a document by substituting another tenant ID', async () => {
  const agent = request.agent(makeApp());
  await login(agent, users[0]!.email);
  const response = await agent.get(`/api/institutions/${institutionB}/documents/64b000000000000000000099`);
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Institution not found' });
});

test('role escalation in login request is rejected and cannot grant permissions', async () => {
  const agent = request.agent(makeApp());
  const csrf = await agent.get('/api/auth/csrf');
  const loginResponse = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ email: users[0]!.email, password, role: 'official_reviewer' });
  assert.equal(loginResponse.status, 400);
  const protectedResponse = await agent
    .post(`/api/institutions/${institutionA}/approve`)
    .set('x-csrf-token', csrf.body.csrfToken as string);
  assert.equal(protectedResponse.status, 401);
});

test('unauthorized approval is denied to institution operator', async () => {
  const agent = request.agent(makeApp());
  await login(agent, users[0]!.email);
  const csrf = await agent.get('/api/auth/csrf');
  const response = await agent
    .post(`/api/institutions/${institutionA}/approve`)
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ action: 'approve', reason: 'Synthetic review' });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Insufficient permissions' });
});

test('unauthorized institution reviewer cannot retrieve private FDR documents', async () => {
  const agent = request.agent(makeApp());
  await login(agent, users[1]!.email);
  const response = await agent.get(`/api/institutions/${institutionB}/documents/64b000000000000000000099`);
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Insufficient permissions' });
});

test('session expiration results in unauthenticated response', async () => {
  const agent = request.agent(makeApp(1000));

  await login(agent, users[0]!.email);

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const response = await agent.get('/api/auth/me');

  assert.equal(response.status, 401);
});

test('CSRF token is required for state-changing requests', async () => {
  const response = await request(makeApp()).post('/api/auth/login').send({
    email: users[0]!.email,
    password,
  });
  assert.equal(response.status, 403);
});

test('production secure session cookies are issued only when the trusted TLS proxy is configured', async () => {
  const createCookieApp = (trustProxyHops: number) => {
    const app = express();
    app.set('trust proxy', trustProxyHops);
    app.use(
      session({
        name: '__Host-depositguard.sid',
        secret: 'test-only-session-secret-not-for-deployment',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: true, sameSite: 'strict', path: '/' },
      }),
    );
    app.get('/api/auth/csrf', (req, res) => {
      req.session.csrfToken = 'synthetic-csrf-token';
      res.json({ csrfToken: req.session.csrfToken });
    });
    return app;
  };

  const forwardedRequest = (app: express.Express) =>
    request(app).get('/api/auth/csrf').set('x-forwarded-proto', 'https');
  const untrusted = await forwardedRequest(createCookieApp(0)).expect(200);
  assert.equal(untrusted.headers['set-cookie'], undefined);

  const trusted = await forwardedRequest(createCookieApp(1)).expect(200);
  assert.match(trusted.headers['set-cookie']?.[0] ?? '', /__Host-depositguard\.sid=.*; Path=\/; HttpOnly; Secure; SameSite=Strict/);
});

test('unknown and wrong-password login attempts return the same generic response', async () => {
  const app = makeApp();
  const firstAgent = request.agent(app);
  const firstCsrf = await firstAgent.get('/api/auth/csrf');
  const wrong = await firstAgent
    .post('/api/auth/login')
    .set('x-csrf-token', firstCsrf.body.csrfToken as string)
    .send({ email: users[0]!.email, password: 'wrong' });
  const secondAgent = request.agent(app);
  const secondCsrf = await secondAgent.get('/api/auth/csrf');
  const unknown = await secondAgent
    .post('/api/auth/login')
    .set('x-csrf-token', secondCsrf.body.csrfToken as string)
    .send({ email: 'unknown@example.test', password: 'wrong' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.deepEqual(wrong.body, { error: 'Invalid email or password' });
});

test('login rate limit blocks attempts after the configured threshold', async () => {
  const agent = request.agent(makeApp());
  const csrf = await agent.get('/api/auth/csrf');
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const response = await agent.post('/api/auth/login')
      .set('x-csrf-token', csrf.body.csrfToken as string)
      .send({ email: users[0]!.email, password: 'incorrect-password' });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
  assert.equal(statuses[8], 429);
});

test('session identifier is rotated at login and server role is returned from membership only', async () => {
  const agent = request.agent(makeApp());
  const csrf = await agent.get('/api/auth/csrf');
  const beforeCookie = csrf.headers['set-cookie']?.[0];
  const loginResponse = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ email: users[0]!.email, password });
  const afterCookie = loginResponse.headers['set-cookie']?.[0];
  assert.equal(loginResponse.status, 200);
  assert.notEqual(beforeCookie?.split(';')[0], afterCookie?.split(';')[0]);
  assert.deepEqual(loginResponse.body.user.memberships[0].roles, ['institution_operator']);
});
