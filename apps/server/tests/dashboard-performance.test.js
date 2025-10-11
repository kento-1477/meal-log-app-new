process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-1234567890';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/testdb';

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
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
  Settings.now = undefined;
});

test('dashboard summary resolves under 300ms for 4-week window with 5000 logs', async () => {
  const start = DateTime.fromISO('2025-01-01T00:00:00', { zone: 'Asia/Tokyo' });
  const logs = generateLogs(start, 28, 180);

  Settings.now = () => start.plus({ days: 7 }).toMillis();

  prismaAny.mealLog.findMany = async () => logs;
  prismaAny.mealLog.aggregate = async () => ({
    _sum: logs.reduce(
      (acc, log) => {
        acc.calories += log.calories;
        acc.proteinG += log.proteinG;
        acc.fatG += log.fatG;
        acc.carbsG += log.carbsG;
        return acc;
      },
      { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
    ),
  });

  const t0 = performance.now();
  const summary = await getDashboardSummary({ userId: 42, period: 'thisWeek' });
  const elapsed = performance.now() - t0;

  assert.ok(summary.calories.daily.length >= 7);
  assert.ok(elapsed < 300, `expected <300ms but was ${elapsed.toFixed(2)}ms`);
});

function generateLogs(start, days, perDay) {
  const entries = [];

  for (let day = 0; day < days; day += 1) {
    for (let i = 0; i < perDay; i += 1) {
      const dt = start.plus({ days: day, minutes: i * 5 });
      entries.push({
        createdAt: dt.toUTC().toJSDate(),
        calories: 500 + (i % 3) * 50,
        proteinG: 30 + (i % 5),
        fatG: 15 + (i % 4),
        carbsG: 60 + (i % 6),
        mealPeriod: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'][i % 4],
      });
    }
  }

  return entries;
}
