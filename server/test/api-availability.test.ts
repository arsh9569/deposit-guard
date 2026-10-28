import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { auditWriter } from '../src/auth/audit-writer.js';
import { userRepository } from '../src/auth/repository.js';
import { FdrModel } from '../src/models/fdrs.js';
import { createVerificationRouter } from '../src/routes/verification.js';
import { createAssistantRouter } from '../src/routes/assistant.js';
import { env } from '../src/config/env.js';

const institutionId = '64b000000000000000000001';
const audit = { async write() {} };

test('verification filters incomplete drafts, serializes decimal values, and enforces membership', async (t) => {
  t.mock.method(auditWriter, 'write', async () => {});
  let roles = ['institution_operator'];
  t.mock.method(userRepository, 'findById', async () => ({
    _id: '64b000000000000000000010',
    status: 'active',
    memberships: roles.length ? [{ institutionId, roles, active: true }] : [],
  }));
  let empty = false;
  t.mock.method(FdrModel, 'find', (filter: Record<string, unknown>) => {
    assert.equal(String(filter.institutionId), institutionId);
    assert.deepEqual(filter.principalAmount, { $type: 'decimal' });
    assert.deepEqual(filter.reference, { $type: 'string', $ne: '' });
    const chain = {
      sort() {
        return chain;
      },
      limit() {
        return chain;
      },
      select() {
        return chain;
      },
      lean() {
        return chain;
      },
      async exec() {
        return empty
          ? []
          : [
              {
                _id: new Types.ObjectId(),
                reference: 'FDR-2026-021',
                bankName: 'Fixture Bank',
                principalAmount: Types.Decimal128.fromString('100.00'),
              },
            ];
      },
    };
    return chain;
  });
  const app = express();
  app.use((req, _res, next) => {
    req.session = { userId: '64b000000000000000000010' } as typeof req.session;
    next();
  });
  app.use('/api/institutions/:institutionId/verification', createVerificationRouter({ audit }));
  const path = `/api/institutions/${institutionId}/verification/instruments`;
  for (const role of ['institution_operator', 'institution_admin']) {
    roles = [role];
    const result = await request(app).get(path).expect(200);
    assert.equal(result.body.instruments[0].principalAmount, '100.00');
  }
  empty = true;
  assert.deepEqual((await request(app).get(path).expect(200)).body, { instruments: [] });
  await request(app)
    .get('/api/institutions/64b000000000000000000002/verification/instruments')
    .expect(404);
  roles = [];
  await request(app).get(path).expect(404);
});

test('assistant reports missing configuration, provider failures, and real replies without fallback', async (t) => {
  t.mock.method(userRepository, 'findById', async () => ({
    _id: 'test-user',
    status: 'active',
    memberships: [],
  }));
  const body = { currentScreen: 'verification', messages: [{ role: 'user', content: 'Help' }] };
  for (const scenario of [
    'missing',
    'ok',
    'unauthorized',
    'unavailable',
    'empty',
    'network',
  ] as const) {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (scenario === 'network') throw new Error('sensitive upstream data');
      return new Response(
        JSON.stringify(
          scenario === 'ok'
            ? { choices: [{ message: { content: 'A real provider reply' } }] }
            : { error: { message: 'sensitive upstream data' } },
        ),
        { status: scenario === 'unauthorized' ? 401 : scenario === 'unavailable' ? 503 : 200 },
      );
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: 'test-user' } as typeof req.session;
      next();
    });
    app.use(
      createAssistantRouter(
        {
          ...env,
          OPENAI_API_KEY: scenario === 'missing' ? '' : 'test-secret',
          OPENAI_MODEL: 'test-model',
        },
        fakeFetch,
      ),
    );
    const result = await request(app)
      .post('/chat')
      .send(body)
      .expect(
        scenario === 'ok'
          ? 200
          : ['missing', 'unavailable', 'network'].includes(scenario)
            ? 503
            : 502,
      );
    assert.equal(calls, scenario === 'missing' ? 0 : 1);
    assert.doesNotMatch(JSON.stringify(result.body), /test-secret|sensitive upstream data/);
    if (scenario === 'ok') assert.equal(result.body.answer, 'A real provider reply');
  }
});
