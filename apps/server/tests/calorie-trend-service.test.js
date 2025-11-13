import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { buildCalorieTrend } from '../src/services/calorie-trend-service.js';

const timezone = 'Asia/Tokyo';
const startInclusive = DateTime.fromISO('2025-11-01', { zone: timezone }).startOf('day');
const endExclusiveWeek = startInclusive.plus({ days: 7 });

const logs = [
  {
    createdAt: DateTime.fromISO('2025-11-01T08:00:00', { zone: timezone }).toJSDate(),
    calories: 500,
  },
  {
    createdAt: DateTime.fromISO('2025-11-02T12:00:00', { zone: timezone }).toJSDate(),
    calories: 800,
  },
  {
    createdAt: DateTime.fromISO('2025-11-02T18:30:00', { zone: timezone }).toJSDate(),
    calories: 300,
  },
];

test('buildCalorieTrend fills gaps and formats labels', () => {
  const result = buildCalorieTrend({
    logs,
    timezone,
    locale: 'ja-JP',
    startInclusive,
    endExclusive: endExclusiveWeek,
  });

  assert.equal(result.points.length, 7);
  assert.equal(result.points[0].date, '2025-11-01');
  assert.equal(result.points[0].value, 500);
  assert.equal(result.points[1].value, 1100);
  assert.ok(result.points[0].label.includes('11/1'));
  assert.ok(!result.points[0].label.includes('null'));
  assert.equal(result.target, 2200);
  assert.equal(result.points[2].value, 0);
});

test('buildCalorieTrend ignores invalid timestamps and uses provided span length', () => {
  const brokenLogs = [
    ...logs,
    {
      createdAt: new Date('invalid'),
      calories: 1000,
    },
  ];

  const result = buildCalorieTrend({
    logs: brokenLogs,
    timezone,
    locale: 'en-US',
    startInclusive,
    endExclusive: startInclusive.plus({ days: 3 }),
  });

  assert.equal(result.points.length, 3);
  assert.match(result.points[0].label, /\(Sat\)/);
  assert.equal(result.points[2].value, 0);
});

test('buildCalorieTrend spans entire month when requested', () => {
  const start = DateTime.fromISO('2025-02-01', { zone: timezone }).startOf('day');
  const endExclusive = start.plus({ months: 1 });
  const result = buildCalorieTrend({
    logs: [],
    timezone,
    locale: 'ja-JP',
    startInclusive: start,
    endExclusive,
  });

  assert.equal(result.points.length, 28);
  assert.equal(result.points[0].date, '2025-02-01');
  assert.equal(result.points.at(-1)?.date, '2025-02-28');
});
