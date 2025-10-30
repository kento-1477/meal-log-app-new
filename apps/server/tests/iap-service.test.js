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
const originalGrantFindFirst = prismaAny.premiumGrant.findFirst;
const originalGrantFindMany = prismaAny.premiumGrant.findMany;
const originalGrantCreate = prismaAny.premiumGrant.create;

test.afterEach(() => {
  prismaAny.iapReceipt.findUnique = originalReceiptFindUnique;
  prismaAny.$transaction = originalTransaction;
  prismaAny.user.update = originalUserUpdate;
  prismaAny.user.findUnique = originalUserFindUnique;
  prismaAny.aiUsageCounter.findUnique = originalCounterFindUnique;
  prismaAny.premiumGrant.findFirst = originalGrantFindFirst;
  prismaAny.premiumGrant.findMany = originalGrantFindMany;
  prismaAny.premiumGrant.create = originalGrantCreate;
});

test('processIapPurchase grants credits in test mode', async () => {
  prismaAny.iapReceipt.findUnique = async () => null;

  let createdReceipt = null;
  prismaAny.$transaction = async (fn) =>
    fn({
      iapReceipt: {
        create: async ({ data }) => {
          createdReceipt = data;
          return { ...data, id: 1 };
        },
      },
      user: {
        update: async () => ({ aiCredits: 150 }),
      },
      premiumGrant: {
        create: async () => ({}),
      },
    });

  prismaAny.user.findUnique = async () => ({ aiCredits: 150 });
  prismaAny.aiUsageCounter.findUnique = async () => ({ count: 0 });
  prismaAny.premiumGrant.findFirst = async () => null;
  prismaAny.premiumGrant.findMany = async () => [];

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
  assert.equal(result.premiumStatus.isPremium, false);
  assert.equal(result.premiumStatus.grants.length, 0);
});

test('processIapPurchase grants premium days for premium product', async () => {
  prismaAny.iapReceipt.findUnique = async () => null;

  const grants = [];
  let userUpdateCalled = 0;
  let createdReceipt = null;
  let grantPayload = null;

  prismaAny.$transaction = async (fn) =>
    fn({
      iapReceipt: {
        create: async ({ data }) => {
          createdReceipt = data;
          return { ...data, id: 2 };
        },
      },
      user: {
        update: async () => {
          userUpdateCalled += 1;
          return { aiCredits: 0 };
        },
      },
      premiumGrant: {
        create: async ({ data }) => {
          grantPayload = data;
          grants.push({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            referralId: null,
          });
          return data;
        },
      },
    });

  prismaAny.user.findUnique = async () => ({ aiCredits: 0 });
  prismaAny.aiUsageCounter.findUnique = async () => ({ count: 0 });
  prismaAny.premiumGrant.findFirst = async () => (grants.length ? grants[grants.length - 1] : null);
  prismaAny.premiumGrant.findMany = async () => grants;

  const receiptPayload = {
    transactionId: 'txn-premium-1',
    productId: 'com.meallog.premium.annual',
    quantity: 1,
    purchaseDate: new Date().toISOString(),
    environment: 'sandbox',
  };

  const request = {
    userId: 99,
    platform: 'APP_STORE',
    productId: 'com.meallog.premium.annual',
    transactionId: 'txn-premium-1',
    receiptData: Buffer.from(JSON.stringify(receiptPayload)).toString('base64'),
    environment: 'sandbox',
  };

  const result = await processIapPurchase(request);

  assert.equal(result.creditsGranted, 0);
  assert.equal(userUpdateCalled, 0);
  assert.ok(createdReceipt);
  assert.equal(createdReceipt.productId, 'com.meallog.premium.annual');
  assert.equal(grantPayload?.days, 365);
  assert.equal(result.premiumStatus.isPremium, true);
  assert.equal(result.premiumStatus.grants.length, 1);
  assert.equal(result.premiumStatus.grants[0].source, 'PURCHASE');
});
