import './test-env.ts';

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.ts';
import { deleteMealLog, restoreMealLog } from '../src/services/log-service.ts';
import { purgeExpiredMealLogs } from '../src/jobs/log-cleanup.ts';

const prismaAny = prisma;

const originalTransaction = prismaAny.$transaction;
const originalFindFirst = prismaAny.mealLog.findFirst;
const originalUpdate = prismaAny.mealLog.update;
const originalDeleteTokens = prismaAny.logShareToken.deleteMany;
const originalUpdateFavorites = prismaAny.favoriteMeal.updateMany;
const originalDeleteMany = prismaAny.mealLog.deleteMany;

test.afterEach(() => {
  prismaAny.$transaction = originalTransaction;
  prismaAny.mealLog.findFirst = originalFindFirst;
  prismaAny.mealLog.update = originalUpdate;
  prismaAny.logShareToken.deleteMany = originalDeleteTokens;
  prismaAny.favoriteMeal.updateMany = originalUpdateFavorites;
  prismaAny.mealLog.deleteMany = originalDeleteMany;
});

test('deleteMealLog performs a soft delete and clears related references', async () => {
  let deletedTokensInput = null;
  let clearedFavoritesInput = null;
  let updatedData = null;

  prismaAny.$transaction = async (fn) =>
    fn({
      mealLog: {
        findFirst: async () => ({ id: 'log-1' }),
        update: async ({ data }) => {
          updatedData = data;
          return { id: 'log-1', deletedAt: data.deletedAt };
        },
      },
      logShareToken: {
        deleteMany: async (args) => {
          deletedTokensInput = args;
        },
      },
      favoriteMeal: {
        updateMany: async (args) => {
          clearedFavoritesInput = args;
          return { count: 1 };
        },
      },
    });

  const result = await deleteMealLog('log-1', 42);

  assert.ok(result.deletedAt instanceof Date);
  assert.deepEqual(deletedTokensInput, { where: { mealLogId: 'log-1' } });
  assert.deepEqual(clearedFavoritesInput, {
    where: { userId: 42, sourceMealLogId: 'log-1' },
    data: { sourceMealLogId: null },
  });
  assert.ok(updatedData && updatedData.deletedAt instanceof Date);
});

test('restoreMealLog clears deletedAt flag', async () => {
  const deletedAt = new Date('2025-01-01T00:00:00Z');
  let updateInput = null;

  prismaAny.mealLog.findFirst = async () => ({ id: 'log-2', deletedAt });
  prismaAny.mealLog.update = async ({ data }) => {
    updateInput = data;
    return { id: 'log-2', deletedAt: data.deletedAt };
  };

  const result = await restoreMealLog('log-2', 99);

  assert.equal(result.deletedAt, null);
  assert.equal(updateInput.deletedAt, null);
  assert.ok(updateInput.updatedAt instanceof Date);
});

test('purgeExpiredMealLogs deletes soft-deleted and expired free logs', async () => {
  const calls = [];

  prismaAny.premiumGrant.findMany = async () => [];

  prismaAny.mealLog.deleteMany = async (args) => {
    calls.push(args);
    return { count: calls.length };
  };

  const referenceDate = new Date('2025-02-01T00:00:00Z');
  const result = await purgeExpiredMealLogs(referenceDate);

  assert.equal(result.softDeleted, 1);
  assert.equal(result.freeExpired, 2);
  assert.equal(result.premiumExpired, 3);
  
  // First call: soft deleted logs
  assert.deepEqual(calls[0], {
    where: {
      deletedAt: {
        not: null,
        lt: new Date('2025-01-02T00:00:00.000Z'),
      },
    },
  });
  
  // Second call: free user expired logs
  assert.deepEqual(calls[1], {
    where: {
      deletedAt: null,
      createdAt: { lt: new Date('2025-01-02T00:00:00.000Z') },
      userId: { notIn: [] },
    },
  });
  
  // Third call: premium user expired logs (90 days)
  assert.deepEqual(calls[2], {
    where: {
      deletedAt: null,
      createdAt: { lt: new Date('2024-11-03T00:00:00.000Z') },
      userId: { in: [] },
    },
  });
});
