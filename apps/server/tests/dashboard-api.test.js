process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-1234567890';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/testdb';

import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime, Settings } from 'luxon';
import { prisma } from '../dist/db/prisma.js';
import { getDashboardSummary, invalidateDashboardCacheForUser } from '../src/services/dashboard-service.js';

const prismaAny = prisma;
const originalFindMany = prismaAny.mealLog.findMany;
const originalAggregate = prismaAny.mealLog.aggregate;

test.afterEach(() => {
  prismaAny.mealLog.findMany = originalFindMany;
  prismaAny.mealLog.aggregate = originalAggregate;
  invalidateDashboardCacheForUser();
  Settings.now = Date.now;
});

test('summary endpoint returns 401 when session is missing', async () => {
  const response = await invokeSummaryEndpoint({ session: undefined, query: { period: 'thisWeek' } });
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, 'unauthorized');
});

test('summary endpoint returns dashboard payload when authenticated', async () => {
  const logs = [
    createLog('2025-01-06T01:30:00+09:00', 450, 30, 12, 40, 'BREAKFAST'),
    createLog('2025-01-07T12:10:00+09:00', 700, 42, 18, 68, 'LUNCH'),
    createLog('2025-01-08T20:45:00+09:00', 820, 55, 25, 75, 'DINNER'),
  ];

  stubPrisma(logs);

  const response = await invokeSummaryEndpoint({ session: { userId: 99 }, query: { period: 'thisWeek' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.summary.period, 'thisWeek');
  assert.equal(response.body.summary.calories.daily.length, 7);
});

test('summary endpoint respects timezone boundaries around midnight', async () => {
  Settings.now = () => Date.parse('2025-01-02T03:00:00Z');

  const logs = [
    createLog('2025-01-01T23:59:00+09:00', 400, 25, 10, 35, 'DINNER'),
    createLog('2025-01-02T00:05:00+09:00', 350, 22, 9, 30, 'BREAKFAST'),
  ];

  stubPrisma(logs);

  const response = await invokeSummaryEndpoint({ session: { userId: 99 }, query: { period: 'today' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.calories.daily[0].total, 350);
  assert.equal(response.body.summary.macros.total.calories, 350);
});

async function invokeSummaryEndpoint({ session, query }) {
  if (!session?.userId) {
    return { status: 401, body: { ok: false, error: 'unauthorized' } };
  }

  try {
    const summary = await getDashboardSummary({
      userId: session.userId,
      period: (query.period ?? 'today'),
      from: query.from,
      to: query.to,
    });
    return { status: 200, body: { ok: true, summary } };
  } catch (error) {
    return {
      status: 400,
      body: { ok: false, error: error instanceof Error ? error.message : 'unknown' },
    };
  }
}

function stubPrisma(logs) {
  prismaAny.mealLog.findMany = async (args) => {
    if (!args?.where?.createdAt) {
      return logs;
    }
    const { gte, lt } = args.where.createdAt;
    return logs.filter((log) => (
      (!gte || log.createdAt >= gte) && (!lt || log.createdAt < lt)
    ));
  };

  prismaAny.mealLog.aggregate = async (args) => {
    const { gte, lt } = args?.where?.createdAt ?? {};
    const filtered = logs.filter((log) => (
      (!gte || log.createdAt >= gte) && (!lt || log.createdAt < lt)
    ));
    return {
      _sum: filtered.reduce(
        (acc, log) => {
          acc.calories += log.calories;
          acc.proteinG += log.proteinG;
          acc.fatG += log.fatG;
          acc.carbsG += log.carbsG;
          return acc;
        },
        { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
      ),
    };
  };
}

function createLog(dateIso, calories, protein, fat, carbs, mealPeriod) {
  const dt = DateTime.fromISO(dateIso, { setZone: true }).setZone('UTC');
  return {
    createdAt: dt.toJSDate(),
    calories,
    proteinG: protein,
    fatG: fat,
    carbsG: carbs,
    mealPeriod,
  };
}
