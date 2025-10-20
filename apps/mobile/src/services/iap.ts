import { Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';
import type { IapPurchaseRequest, IapPurchaseResponse } from '@meal-log/shared';
import { submitIapPurchase } from '@/services/api';

const CREDIT_PRODUCT_ID = 'com.meallog.credits.100';
export const IAP_UNSUPPORTED_ERROR = 'iap.unsupportedPlatform';

interface PurchaseResult {
  response: IapPurchaseResponse;
}

export async function purchaseCreditPack(): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    const error = new Error('IAP is not supported on this platform');
    (error as any).code = IAP_UNSUPPORTED_ERROR;
    throw error;
  }

  await InAppPurchases.connectAsync();
  let subscription: { remove: () => void } | null = null;
  let settled = false;

  try {
    await InAppPurchases.getProductsAsync([CREDIT_PRODUCT_ID]);

    const response = await new Promise<IapPurchaseResponse>((resolve, reject) => {
      subscription = InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
        if (settled) {
          return;
        }
        try {
          if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
            for (const purchase of results) {
              if (purchase.acknowledged) {
                continue;
              }
              const request = buildRequestPayload(purchase);
              const apiResponse = await submitIapPurchase(request);
              await InAppPurchases.finishTransactionAsync(purchase, true);
              settled = true;
              resolve(apiResponse);
              return;
            }
            return;
          }

          if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
            settled = true;
            reject(Object.assign(new Error('Purchase cancelled'), { code: 'iap.cancelled' }));
            return;
          }

          settled = true;
          reject(Object.assign(new Error(`Purchase failed with code ${responseCode}`), { code: errorCode ?? 'iap.error' }));
        } catch (error) {
          settled = true;
          reject(error);
        }
      });

      InAppPurchases.purchaseItemAsync(CREDIT_PRODUCT_ID).catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      });
    });

    return { response };
  } finally {
    if (subscription) {
      subscription.remove();
    }
    await InAppPurchases.disconnectAsync();
  }
}

function buildRequestPayload(purchase: InAppPurchases.InAppPurchase): IapPurchaseRequest {
  const transactionId = purchase.transactionId ?? purchase.originalTransactionIdentifier ?? `${Date.now()}`;
  const quantity = typeof purchase.quantity === 'number' && purchase.quantity > 0 ? purchase.quantity : 1;
  const receiptData = purchase.transactionReceipt ?? encodeTestReceipt({
    transactionId,
    productId: purchase.productId,
    quantity,
  });

  return {
    platform: 'APP_STORE',
    productId: purchase.productId ?? CREDIT_PRODUCT_ID,
    transactionId,
    receiptData,
    quantity,
    environment: __DEV__ ? 'sandbox' : 'production',
  };
}

function encodeTestReceipt(payload: { transactionId: string; productId: string; quantity: number }) {
  return encodeToBase64(
    JSON.stringify({
      transactionId: payload.transactionId,
      productId: payload.productId,
      quantity: payload.quantity,
      purchaseDate: new Date().toISOString(),
      environment: __DEV__ ? 'sandbox' : 'production',
    }),
  );
}

function encodeToBase64(value: string) {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value);
  }
  const bufferCtor = (globalThis as any).Buffer;
  if (typeof bufferCtor?.from === 'function') {
    return bufferCtor.from(value, 'utf8').toString('base64');
  }
  throw new Error('Base64 encoding is not supported in this environment');
}
