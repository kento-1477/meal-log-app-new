import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  IAPResponseCode,
  __emit,
  __reset as resetIapStub,
  __setImplementation,
} from 'expo-in-app-purchases';
import {
  __setSubmitIapPurchaseImplementation,
  purchasePremiumPlan,
  PREMIUM_PRODUCT_ID,
  restorePurchases,
} from '@/services/iap';

// React Native globals expected by IAP service
(globalThis as any).__DEV__ = false;

const baseResponse = {
  ok: true as const,
  creditsGranted: 0,
  usage: {
    plan: 'PREMIUM' as const,
    limit: 60,
    used: 0,
    remaining: 60,
    credits: 0,
    consumedCredit: false,
    resetsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  premiumStatus: {
    isPremium: true,
    source: 'PURCHASE' as const,
    daysRemaining: 365,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    grants: [
      {
        source: 'PURCHASE' as const,
        days: 365,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  },
};

test.afterEach(() => {
  __setSubmitIapPurchaseImplementation();
  mock.restoreAll();
  resetIapStub();
});

test('purchasePremiumPlan resolves with server response', async () => {
  __setImplementation('purchaseItemAsync', async () => {
    queueMicrotask(() => {
      __emit({
        responseCode: IAPResponseCode.OK,
        results: [
          {
            productId: PREMIUM_PRODUCT_ID,
            transactionId: 'txn-premium-1',
            originalTransactionIdentifier: 'orig-premium-1',
            acknowledged: false,
            quantity: 1,
            transactionReceipt: 'receipt-premium',
          },
        ],
      });
    });
  });

  let submitCallCount = 0;
  const submitStub = async () => {
    submitCallCount += 1;
    return baseResponse;
  };
  __setSubmitIapPurchaseImplementation(submitStub);

  const result = await purchasePremiumPlan();

  assert.equal(result.productId, PREMIUM_PRODUCT_ID);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.premiumStatus.isPremium, true);
  assert.equal(submitCallCount, 1);
});

test('purchasePremiumPlan rejects when user cancels', async () => {
  __setImplementation('purchaseItemAsync', async () => {
    queueMicrotask(() => {
      __emit({ responseCode: IAPResponseCode.USER_CANCELED, results: [] });
    });
  });

  await assert.rejects(purchasePremiumPlan(), (error: any) => error?.code === 'iap.cancelled');
});

test('restorePurchases returns restored premium entries', async () => {
  __setImplementation('restorePurchasesAsync', async () => {
    queueMicrotask(() => {
      __emit({
        responseCode: IAPResponseCode.OK,
        results: [
          {
            productId: PREMIUM_PRODUCT_ID,
            transactionId: 'txn-premium-restore',
            originalTransactionIdentifier: 'orig-premium-restore',
            acknowledged: false,
            quantity: 1,
            transactionReceipt: 'receipt-premium-restore',
          },
        ],
      });
    });
  });

  let submitCallCount = 0;
  const submitStub = async () => {
    submitCallCount += 1;
    return baseResponse;
  };
  __setSubmitIapPurchaseImplementation(submitStub);

  const result = await restorePurchases([PREMIUM_PRODUCT_ID]);

  assert.equal(result.restored.length, 1);
  assert.equal(result.restored[0].productId, PREMIUM_PRODUCT_ID);
  assert.equal(result.restored[0].response.premiumStatus.isPremium, true);
  assert.equal(submitCallCount, 1);
});
