import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { csrfProtection, csrfTokenHandler } from '../src/middleware/csrf.js';
import { apiErrorHandler } from '../src/middleware/api-error.js';
import { createOtpRouter } from '../src/routes/otp.js';
import { createRegisterRouter } from '../src/routes/register.js';
import type { OtpRecord } from '../src/routes/otp.js';
import { sendOtpEmail } from '../src/services/otp-mailer.js';
import type { SendMailOptions, Transporter } from 'nodemailer';

function createMemoryOtpStore() {
  const records = new Map<string, OtpRecord>();
  const store = {
    async findByEmail(email: string) {
      return records.get(email) ?? null;
    },
    async save(email: string, otpHash: string, now: Date) {
      records.set(email, {
        id: email,
        otpHash,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        resendAfter: new Date(now.getTime() + 60 * 1000),
        attempts: 0,
        verifiedAt: null,
      });
    },
    async incrementAttempts(id: string) {
      const record = records.get(id);
      if (record && !record.verifiedAt) record.attempts += 1;
    },
    async markVerified(id: string, now: Date) {
      const record = records.get(id);
      if (
        !record ||
        record.verifiedAt ||
        record.expiresAt <= now ||
        record.attempts >= 5
      ) {
        return false;
      }
      record.verifiedAt = now;
      return true;
    },
  };
  return { records, store };
}

function createAuthTestApp(
  store: ReturnType<typeof createMemoryOtpStore>['store'],
  deliverOtp: (email: string, otp: string) => Promise<void>,
  registerStore: {
    activeInstitutionExists(institutionId: string): Promise<boolean>;
    userExists(email: string): Promise<boolean>;
    createAccount(data: {
      type: 'student' | 'institution';
      name: string;
      email: string;
      phone: string;
      passwordHash: string;
      enrollment?: string;
      course?: string;
      institutionName?: string;
      approvalNumber?: string;
      representative?: string;
    }): Promise<void>;
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'synthetic-test-session-secret-with-sufficient-length',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'strict', secure: false },
    }),
  );
  app.use('/api', csrfProtection);
  app.get('/api/auth/csrf', csrfTokenHandler);
  app.use('/api/auth/otp', createOtpRouter({ store, deliverOtp }));
  app.use('/api/auth/register', createRegisterRouter({ store: registerStore }));
  app.use(apiErrorHandler);
  return app;
}

const noAccountStore = {
  async activeInstitutionExists() {
    return false;
  },
  async userExists() {
    return false;
  },
  async createAccount() {},
};

test('OTP mailer builds and submits the verification email through its transport', async () => {
  const sentMessages: SendMailOptions[] = [];
  const transport: Pick<Transporter, 'sendMail'> = {
    async sendMail(message) {
      sentMessages.push(message);
      return { messageId: 'synthetic-message-id' };
    },
  };

  await sendOtpEmail('recipient@example.test', '042917', {
    smtpUser: 'sender@example.test',
    smtpPassword: 'synthetic-test-password',
    transport,
  });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]?.to, 'recipient@example.test');
  assert.equal(sentMessages[0]?.from, '"NidhiKosh" <sender@example.test>');
  assert.match(sentMessages[0]?.text ?? '', /042917/);
  assert.match(sentMessages[0]?.text ?? '', /expires in 5 minutes/i);
  assert.match(sentMessages[0]?.html ?? '', /042917/);
});

test('OTP send uses a session-bound CSRF token, stores only a hash, and invokes email delivery', async () => {
  const { records, store } = createMemoryOtpStore();
  const deliveries: { email: string; otp: string }[] = [];
  const app = createAuthTestApp(
    store,
    async (email, otp) => {
      deliveries.push({ email, otp });
    },
    noAccountStore,
  );
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf').expect(200);
  assert.match(csrf.headers['set-cookie']?.[0] ?? '', /HttpOnly/);

  const sent = await agent
    .post('/api/auth/otp/send')
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ email: '  Test.User@example.test  ' })
    .expect(200);

  assert.deepEqual(sent.body, {
    message: 'OTP sent successfully',
    expiresInSeconds: 300,
    resendAfterSeconds: 60,
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.email, 'test.user@example.test');
  assert.match(deliveries[0]?.otp ?? '', /^\d{6}$/);
  const saved = records.get('test.user@example.test');
  assert.ok(saved);
  assert.notEqual(saved.otpHash, deliveries[0]?.otp);
  assert.match(saved.otpHash, /^[a-f0-9]{64}:[a-f0-9]{64}$/);

  await agent
    .post('/api/auth/otp/send')
    .set('x-csrf-token', csrf.body.csrfToken as string)
    .send({ email: 'test.user@example.test' })
    .expect(429);
  assert.equal(deliveries.length, 1);
});

test('OTP rejects invalid, expired, and reused codes and permits registration once', async () => {
  const { records, store } = createMemoryOtpStore();
  const deliveries: { email: string; otp: string }[] = [];
  const createdAccounts: {
    type: 'student' | 'institution';
    email: string;
    passwordHash: string;
  }[] = [];
  const registerStore = {
    async activeInstitutionExists() {
      return false;
    },
    async userExists() {
      return false;
    },
    async createAccount(data: {
      type: 'student' | 'institution';
      email: string;
      passwordHash: string;
    }) {
      createdAccounts.push(data);
    },
  };
  const app = createAuthTestApp(
    store,
    async (email, otp) => {
      deliveries.push({ email, otp });
    },
    registerStore,
  );
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken = csrf.body.csrfToken as string;
  const email = 'student@example.test';

  await agent
    .post('/api/auth/otp/send')
    .set('x-csrf-token', csrfToken)
    .send({ email })
    .expect(200);
  const deliveredOtp = deliveries[0]!.otp;
  const wrongOtp = deliveredOtp === '000000' ? '000001' : '000000';

  await agent
    .post('/api/auth/otp/verify')
    .set('x-csrf-token', csrfToken)
    .send({ email, otp: wrongOtp })
    .expect(400);
  assert.equal(records.get(email)?.attempts, 1);

  const verified = await agent
    .post('/api/auth/otp/verify')
    .set('x-csrf-token', csrfToken)
    .send({ email, otp: deliveredOtp })
    .expect(200);
  assert.deepEqual(verified.body, { verified: true });

  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrfToken)
    .send({
      type: 'student',
      name: 'Test Student',
      email,
      phone: '1234567890',
      password: 'Synthetic-Password-42!',
      enrollment: 'TEST-001',
      course: 'Engineering',
      institutionName: 'Test Institute',
    })
    .expect(201, {
      message: 'Account created successfully. You can now sign in.',
    });
  assert.equal(createdAccounts.length, 1);
  assert.equal(createdAccounts[0]?.email, email);
  assert.notEqual(createdAccounts[0]?.passwordHash, 'Synthetic-Password-42!');

  await agent
    .post('/api/auth/otp/verify')
    .set('x-csrf-token', csrfToken)
    .send({ email, otp: deliveredOtp })
    .expect(400);
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrfToken)
    .send({
      type: 'student',
      name: 'Test Student',
      email,
      phone: '1234567890',
      password: 'Synthetic-Password-42!',
      enrollment: 'TEST-001',
      course: 'Engineering',
      institutionName: 'Test Institute',
    })
    .expect(403);

  const expiredEmail = 'expired@example.test';
  await agent
    .post('/api/auth/otp/send')
    .set('x-csrf-token', csrfToken)
    .send({ email: expiredEmail })
    .expect(200);
  records.get(expiredEmail)!.expiresAt = new Date(Date.now() - 1);
  await agent
    .post('/api/auth/otp/verify')
    .set('x-csrf-token', csrfToken)
    .send({ email: expiredEmail, otp: deliveries[1]!.otp })
    .expect(400);

  const lockedEmail = 'locked@example.test';
  const lockedApp = createAuthTestApp(store, async (email, otp) => {
    deliveries.push({ email, otp });
  }, registerStore);
  const lockedAgent = request.agent(lockedApp);
  const lockedCsrf = await lockedAgent.get('/api/auth/csrf').expect(200);
  const lockedCsrfToken = lockedCsrf.body.csrfToken as string;
  await lockedAgent
    .post('/api/auth/otp/send')
    .set('x-csrf-token', lockedCsrfToken)
    .send({ email: lockedEmail })
    .expect(200);
  const lockedOtp = deliveries[2]!.otp;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await lockedAgent
      .post('/api/auth/otp/verify')
      .set('x-csrf-token', lockedCsrfToken)
      .send({
        email: lockedEmail,
        otp: lockedOtp === '000000' ? '000001' : '000000',
      })
      .expect(400);
  }
  assert.equal(records.get(lockedEmail)?.attempts, 5);
  await lockedAgent
    .post('/api/auth/otp/verify')
    .set('x-csrf-token', lockedCsrfToken)
    .send({ email: lockedEmail, otp: lockedOtp })
    .expect(400);
});

test('OTP verification requires CSRF and rejects requests without the session token', async () => {
  const { store } = createMemoryOtpStore();
  const app = createAuthTestApp(store, async () => {}, noAccountStore);
  await request(app)
    .post('/api/auth/otp/send')
    .send({ email: 'test@example.test' })
    .expect(403, { error: 'CSRF validation failed' });
});