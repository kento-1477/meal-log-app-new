import './test-env.ts';

import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { MealPeriod } from '@prisma/client';
import { prisma } from '../src/db/prisma.ts';
import { getLogsForExport } from '../src/services/log-share-service.ts';

const prismaAny = prisma;
const originalFindMany = prismaAny.mealLog.findMany;

test.afterEach(() => {
  prismaAny.mealLog.findMany = originalFindMany;
});

test('getLogsForExport returns records within day range ordered ascending', async () => {
  const base = DateTime.fromISO('2025-03-10T12:00:00Z');
  const startOfDay = base.startOf('day').toJSDate();
  const endOfDay = base.plus({ days: 1 }).startOf('day').toJSDate();

  const sample = [
    {
      id: 'a',
      userId: 1,
      foodItem: 'おにぎり',
      calories: 350,
      proteinG: 8,
      fatG: 4,
      carbsG: 70,
      mealPeriod: MealPeriod.BREAKFAST,
      createdAt: DateTime.fromJSDate(startOfDay).plus({ hours: 7 }).toJSDate(),
    },
    {
      id: 'b',
      userId: 1,
      foodItem: '定食',
      calories: 720,
      proteinG: 32,
      fatG: 18,
      carbsG: 95,
      mealPeriod: MealPeriod.LUNCH,
      createdAt: DateTime.fromJSDate(startOfDay).plus({ hours: 13 }).toJSDate(),
    },
    {
      id: 'c',
      userId: 1,
      foodItem: '前日夕食',
      calories: 600,
      proteinG: 25,
      fatG: 20,
      carbsG: 65,
      mealPeriod: MealPeriod.DINNER,
      createdAt: DateTime.fromJSDate(startOfDay).minus({ hours: 5 }).toJSDate(),
    },
    {
      id: 'd',
      userId: 2,
      foodItem: '他ユーザー',
      calories: 500,
      proteinG: 20,
      fatG: 15,
      carbsG: 55,
      mealPeriod: MealPeriod.LUNCH,
      createdAt: DateTime.fromJSDate(startOfDay).plus({ hours: 10 }).toJSDate(),
    },
  ];

  let capturedWhere = null;
  prismaAny.mealLog.findMany = async (args) => {
    capturedWhere = args.where;
    assert.deepEqual(args.orderBy, { createdAt: 'asc' });

    return sample.filter((item) =>
      item.userId === args.where.userId &&
      item.createdAt >= args.where.createdAt.gte &&
      item.createdAt < args.where.createdAt.lt,
    );
  };

  const result = await getLogsForExport(1, { range: 'day', anchor: base.toISO() ?? undefined });

  assert.ok(capturedWhere);
  assert.equal(capturedWhere?.userId, 1);
  assert.equal(Date.parse(result.from), capturedWhere?.createdAt.gte.getTime());
  assert.equal(Date.parse(result.to), capturedWhere?.createdAt.lt.getTime());

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 'a');
  assert.equal(result.items[1].id, 'b');
  assert.equal(result.items[0].mealPeriod, MealPeriod.BREAKFAST);
  assert.equal(result.items[0].foodItem, 'おにぎり');
  assert.equal(result.items[0].proteinG, 8);
  assert.ok(result.from.startsWith('2025-03-10'));
  assert.ok(result.to.startsWith('2025-03-11'));
});
