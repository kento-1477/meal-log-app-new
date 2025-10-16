import './test-env.ts';

import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { prisma } from '../src/db/prisma.ts';
import {
  evaluateAiUsage,
  recordAiUsage,
  buildUsageLimitError,
} from '../src/services/ai-usage-service.ts';

const prismaAny = prisma;
const originalUserFindUnique = prismaAny.user.findUnique;
const originalCounterFindUnique = prismaAny.aiUsageCounter.findUnique;
const originalCounterUpsert = prismaAny.aiUsageCounter.upsert;
const originalUserUpdate = prismaAny.user.update;
const originalTransaction = prismaAny.$transaction;

test.afterEach(() => {
  prismaAny.user.findUnique = originalUserFindUnique;
  prismaAny.aiUsageCounter.findUnique = originalCounterFindUnique;
  prismaAny.aiUsageCounter.upsert = originalCounterUpsert;
  prismaAny.user.update = originalUserUpdate;
  prismaAny.$transaction = originalTransaction;
});

test('evaluateAiUsage reports remaining allowance for free plan', async () => {
  prismaAny.user.findUnique = async () => ({ plan: 'FREE', aiCredits: 0 });
  prismaAny.aiUsageCounter.findUnique = async () => ({ count: 1 });

  const status = await evaluateAiUsage(1);
  assert.equal(status.limit, 3);
  assert.equal(status.used, 1);
  assert.equal(status.remaining, 2);
  assert.equal(status.allowed, true);
  assert.equal(status.consumeCredit, false);
});

test('evaluateAiUsage allows credit consumption when limit reached', async () => {
  prismaAny.user.findUnique = async () => ({ plan: 'FREE', aiCredits: 5 });
  prismaAny.aiUsageCounter.findUnique = async () => ({ count: 3 });

  const status = await evaluateAiUsage(42);
  assert.equal(status.allowed, true);
  assert.equal(status.consumeCredit, true);
  assert.equal(status.remaining, 0);
  assert.equal(status.credits, 5);
});

test('recordAiUsage increments counters and decrements credits when needed', async () => {
  const usageDate = DateTime.fromISO('2025-05-01T00:00:00Z').toJSDate();
  prismaAny.$transaction = async (fn) =>
    fn({
      user: {
        findUnique: async () => ({ plan: 'STANDARD', aiCredits: 2 }),
        update: async () => ({ aiCredits: 1 }),
      },
      aiUsageCounter: {
        upsert: async () => ({ count: 21 }),
      },
    });

  const summary = await recordAiUsage({ userId: 99, usageDate, consumeCredit: true });
  assert.equal(summary.plan, 'STANDARD');
  assert.equal(summary.limit, 20);
  assert.equal(summary.used, 21);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.credits, 1);
  assert.equal(summary.consumedCredit, true);
  assert.ok(summary.resetsAt.startsWith('2025-05-02'));
});

test('buildUsageLimitError exposes data payload', () => {
  const now = DateTime.fromISO('2025-06-01T03:00:00+09:00');
  const status = {
    allowed: false,
    plan: 'FREE',
    limit: 3,
    used: 3,
    remaining: 0,
    credits: 0,
    consumeCredit: false,
    usageDate: now.startOf('day').toJSDate(),
  };
  const error = buildUsageLimitError(status);
  assert.equal(error.statusCode, 429);
  assert.equal(error.code, 'AI_USAGE_LIMIT');
  assert.equal(error.data.limit, 3);
  assert.ok(error.data.resetsAt.startsWith('2025-06-02'));
  assert.equal(error.expose, true);
});
