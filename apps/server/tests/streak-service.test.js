import './test-env.ts';

import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime, Settings } from 'luxon';
import { prisma } from '../src/db/prisma.ts';
import { getUserStreak } from '../src/services/streak-service.ts';

const prismaAny = prisma;
const originalFindMany = prismaAny.mealLog.findMany;

const TOKYO = 'Asia/Tokyo';

test.afterEach(() => {
  prismaAny.mealLog.findMany = originalFindMany;
  Settings.now = Date.now;
});

test('streak returns zeros when no logs', async () => {
  stubFindMany([]);
  const streak = await getUserStreak(1);
  assert.deepEqual(streak, { current: 0, longest: 0, lastLoggedAt: null });
});

test('streak counts consecutive days including today', async () => {
  Settings.now = () => Date.UTC(2025, 0, 10, 0, 0, 0);
  const logs = [
    logAt('2025-01-10T08:30:00'),
    logAt('2025-01-09T12:00:00'),
    logAt('2025-01-08T07:45:00'),
    logAt('2025-01-05T20:00:00'),
  ];
  stubFindMany(logs);

  const streak = await getUserStreak(1);
  assert.equal(streak.current, 3);
  assert.equal(streak.longest, 3);
  assert.ok(streak.lastLoggedAt?.startsWith('2025-01-10'));
});

test('streak handles gap and longest run', async () => {
  Settings.now = () => Date.UTC(2025, 1, 1, 0, 0, 0);
  const logs = [
    logAt('2025-01-31T08:30:00'),
    logAt('2025-01-29T18:15:00'),
    logAt('2025-01-28T07:10:00'),
    logAt('2025-01-27T19:00:00'),
    logAt('2025-01-23T08:00:00'),
  ];
  stubFindMany(logs);

  const streak = await getUserStreak(1);
  assert.equal(streak.current, 1); // no entry on Feb 1, so streak is 1 day (Jan 31)
  assert.equal(streak.longest, 3);
});

function stubFindMany(logs) {
  prismaAny.mealLog.findMany = async () => logs;
}

function logAt(iso) {
  return { createdAt: DateTime.fromISO(iso, { zone: TOKYO }).toJSDate() };
}
