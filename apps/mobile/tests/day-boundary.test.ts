import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { resolveDailyDashboardPeriod, resolveLogicalDay } from '../src/utils/dayBoundary.ts';

test('resolveLogicalDay treats 02:00 as previous day with 4am boundary', () => {
  const now = DateTime.fromISO('2026-02-08T02:00:00+09:00', { zone: 'Asia/Tokyo' });
  const day = resolveLogicalDay(now, 4);
  assert.equal(day.toISODate(), '2026-02-07');
});

test('resolveLogicalDay treats 05:00 as current day with 4am boundary', () => {
  const now = DateTime.fromISO('2026-02-08T05:00:00+09:00', { zone: 'Asia/Tokyo' });
  const day = resolveLogicalDay(now, 4);
  assert.equal(day.toISODate(), '2026-02-08');
});

test('resolveDailyDashboardPeriod returns yesterday before 4am', () => {
  const now = DateTime.fromISO('2026-02-08T02:30:00+09:00', { zone: 'Asia/Tokyo' });
  assert.equal(resolveDailyDashboardPeriod(now, 4), 'yesterday');
});

test('resolveDailyDashboardPeriod returns today after 4am', () => {
  const now = DateTime.fromISO('2026-02-08T07:30:00+09:00', { zone: 'Asia/Tokyo' });
  assert.equal(resolveDailyDashboardPeriod(now, 4), 'today');
});
