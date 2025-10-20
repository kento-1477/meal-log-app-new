import './test-env.ts';

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.ts';
import { processIapPurchase } from '../src/services/iap-service.ts';

const prismaAny = prisma;

const originalReceiptFindUnique = prismaAny.iapReceipt.findUnique;
const originalTransaction = prismaAny.$transaction;
const originalUserUpdate = prismaAny.user.update;
const originalUserFindUnique = prismaAny.user.findUnique;
const originalCounterFindUnique = prismaAny.aiUsageCounter.findUnique;

test.afterEach(() => {
  prismaAny.iapReceipt.findUnique = originalReceiptFindUnique;
  prismaAny.$transaction = originalTransaction;
  prismaAny.user.update = originalUserUpdate;
  prismaAny.user.findUnique = originalUserFindUnique;
  prismaAny.aiUsageCounter.findUnique = originalCounterFindUnique;
});

test('processIapPurchase grants credits in test mode', async () => {
  prismaAny.iapReceipt.findUnique = async () => null;

  let createdReceipt = null;
  prismaAny.$transaction = async (fn) =>
    fn({
      iapReceipt: {
        create: async ({ data }) => {
          createdReceipt = data;
          return data;
        },
      },
      user: {
        update: async () => ({ aiCredits: 150 }),
      },
    });

  prismaAny.user.findUnique = async () => ({ plan: 'FREE', aiCredits: 150 });
  prismaAny.aiUsageCounter.findUnique = async () => ({ count: 0 });

  const receiptPayload = {
    transactionId: 'txn-123',
    productId: 'com.meallog.credits.100',
    quantity: 1,
    purchaseDate: new Date().toISOString(),
    environment: 'sandbox',
  };

  const request = {
    userId: 55,
    platform: 'APP_STORE',
    productId: 'com.meallog.credits.100',
    transactionId: 'txn-123',
    receiptData: Buffer.from(JSON.stringify(receiptPayload)).toString('base64'),
    environment: 'sandbox',
  };

  const result = await processIapPurchase(request);

  assert.equal(result.creditsGranted, 100);
  assert.equal(result.usage.credits, 150);
  assert.equal(result.usage.plan, 'FREE');
  assert.equal(typeof result.usage.remaining, 'number');
  assert.equal(createdReceipt.platform, 'APP_STORE');
  assert.ok(createdReceipt);
  assert.equal(createdReceipt.userId, 55);
  assert.equal(createdReceipt.creditsGranted, 100);
});
