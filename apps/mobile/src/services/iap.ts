import { Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';
import {
  IAP_CREDIT_PRODUCT_ID,
  IAP_PREMIUM_PRODUCT_ID,
  IAP_PREMIUM_MONTHLY_PRODUCT_ID,
  type IapPurchaseRequest,
  type IapPurchaseResponse,
} from '@meal-log/shared';
import { submitIapPurchase } from '@/services/api';

type SubmitPurchaseFn = typeof submitIapPurchase;

let submitPurchase: SubmitPurchaseFn = submitIapPurchase;

export function __setSubmitIapPurchaseImplementation(fn?: SubmitPurchaseFn) {
  submitPurchase = fn ?? submitIapPurchase;
}

export const CREDIT_PRODUCT_ID = IAP_CREDIT_PRODUCT_ID;
export const PREMIUM_PRODUCT_ID = IAP_PREMIUM_PRODUCT_ID;
export const PREMIUM_MONTHLY_PRODUCT_ID = IAP_PREMIUM_MONTHLY_PRODUCT_ID;
export const IAP_UNSUPPORTED_ERROR = 'iap.unsupportedPlatform';

export interface IapProductDetails {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmount: number;
  currencyCode: string;
}

export interface PurchaseResult {
  productId: string;
  response: IapPurchaseResponse;
}

type PurchaseError = Error & { code?: string };

export interface RestorePurchaseEntry {
  productId: string;
  response: IapPurchaseResponse;
}

export interface RestorePurchasesResult {
  restored: RestorePurchaseEntry[];
}

export async function fetchIapProducts(productIds: string[]): Promise<IapProductDetails[]> {
  ensureIosSupport();
  console.log('[IAP] fetchIapProducts called with:', productIds);
  return withIapConnection(async () => {
    console.log('[IAP] Connected to store, fetching products...');
    try {
      const response = await InAppPurchases.getProductsAsync(productIds);
      console.log('[IAP] getProductsAsync response:', JSON.stringify(response, null, 2));

      // expo-in-app-purchases returns { responseCode, results } object
      const products = response?.results ?? response ?? [];

      if (!Array.isArray(products)) {
        console.error('[IAP] Products is not an array:', typeof products, products);
        return [];
      }

      console.log('[IAP] Products received:', products.length, products.map((p: any) => p.productId));
      return products.map((product: any) => ({
        productId: product.productId,
        title: product.title,
        description: product.description,
        price: product.price,
        priceAmount:
          typeof product.priceAmountMicros === 'number' ? product.priceAmountMicros / 1_000_000 : 0,
        currencyCode: product.priceCurrencyCode ?? 'JPY',
      }));
    } catch (error) {
      console.error('[IAP] Error fetching products:', error);
      throw error;
    }
  });
}

export type PremiumPlanType = 'yearly' | 'monthly';

export async function purchasePremiumPlan(plan: PremiumPlanType = 'yearly'): Promise<PurchaseResult> {
  const productId = plan === 'monthly' ? PREMIUM_MONTHLY_PRODUCT_ID : PREMIUM_PRODUCT_ID;
  return purchaseProduct(productId);
}

export async function purchaseCreditPack(): Promise<PurchaseResult> {
  return purchaseProduct(CREDIT_PRODUCT_ID);
}

export async function restorePurchases(productIds: string[] = [PREMIUM_PRODUCT_ID]): Promise<RestorePurchasesResult> {
  ensureIosSupport();

  return withIapConnection(async () => {
    const targetIds = new Set(productIds);
    let subscription: { remove: () => void } | null = null;
    let settled = false;

    try {
      const result = await new Promise<RestorePurchasesResult>((resolve, reject) => {
        subscription = InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
          if (settled) {
            return;
          }

          try {
            if (responseCode === InAppPurchases.IAPResponseCode.OK) {
              const restored: RestorePurchaseEntry[] = [];
              if (results?.length) {
                for (const purchase of results) {
                  const productId = purchase.productId ?? null;
                  const isTarget = productId ? targetIds.has(productId) : false;

                  if (isTarget && productId) {
                    const request = buildRequestPayload(purchase, productId);
                    const apiResponse = await submitPurchase(request);
                    restored.push({ productId, response: apiResponse });
                  }

                  if (!purchase.acknowledged) {
                    await InAppPurchases.finishTransactionAsync(purchase, true);
                  }
                }
              }

              settled = true;
              resolve({ restored });
              return;
            }

            if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
              settled = true;
              reject(Object.assign(new Error('Restore cancelled'), { code: 'iap.cancelled' } as PurchaseError));
              return;
            }

            settled = true;
            reject(
              Object.assign(new Error(`Restore failed with code ${responseCode}`), {
                code: errorCode ?? 'iap.restoreFailed',
              } as PurchaseError),
            );
          } catch (error) {
            settled = true;
            reject(error);
          }
        });

        const restoreFn = (InAppPurchases as Record<string, unknown>)['restorePurchasesAsync'] as
          | (() => Promise<void>)
          | undefined;
        if (typeof restoreFn === 'function') {
          restoreFn.call(InAppPurchases).catch((error: unknown) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          });
          return;
        }

        InAppPurchases.getPurchaseHistoryAsync({ productIds: productIds.length ? productIds : undefined, forceRefresh: true })
          .then(async (history) => {
            if (settled) {
              return;
            }
            try {
              const restored: RestorePurchaseEntry[] = [];
              for (const purchase of history) {
                const productId = purchase.productId ?? null;
                if (!productId || !targetIds.has(productId)) {
                  continue;
                }
                const request = buildRequestPayload(purchase as any, productId);
                const apiResponse = await submitPurchase(request);
                restored.push({ productId, response: apiResponse });
              }
              settled = true;
              resolve({ restored });
            } catch (error) {
              settled = true;
              reject(error);
            }
          })
          .catch((error) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          });
      });

      return result;
    } finally {
      if (subscription) {
        subscription.remove();
      }
    }
  });
}

async function purchaseProduct(productId: string): Promise<PurchaseResult> {
  ensureIosSupport();

  return withIapConnection(async () => {
    await InAppPurchases.getProductsAsync([productId]);

    let settled = false;

    try {
      const response = await new Promise<IapPurchaseResponse>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          reject(Object.assign(new Error('Purchase timed out'), { code: 'iap.timeout' } as PurchaseError));
        }, 90_000);

        let historyFallbackId: ReturnType<typeof setTimeout> | null = null;

        const settleSuccess = (apiResponse: IapPurchaseResponse) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          if (historyFallbackId) {
            clearTimeout(historyFallbackId);
          }
          resolve(apiResponse);
        };

        const settleError = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          if (historyFallbackId) {
            clearTimeout(historyFallbackId);
          }
          reject(error);
        };

        const processPurchase = async (purchase: InAppPurchases.InAppPurchase) => {
          const request = buildRequestPayload(purchase, productId);
          const apiResponse = await submitPurchase(request);
          await InAppPurchases.finishTransactionAsync(purchase, true);
          settleSuccess(apiResponse);
        };

        const processPurchaseHistory = async () => {
          const history = await InAppPurchases.getPurchaseHistoryAsync();
          const responseCode = (history as any)?.responseCode;
          const purchases = (history as any)?.results ?? history ?? [];

          if (responseCode != null && responseCode !== InAppPurchases.IAPResponseCode.OK) {
            throw Object.assign(new Error('Purchase history returned error'), { code: 'iap.historyError' } as PurchaseError);
          }

          if (!Array.isArray(purchases) || purchases.length === 0) {
            throw Object.assign(new Error('Purchase history is empty'), { code: 'iap.historyEmpty' } as PurchaseError);
          }

          const matching = purchases.filter((purchase: any) => purchase?.productId === productId);
          const candidate =
            matching.sort((a: any, b: any) => Number(b?.purchaseTime ?? 0) - Number(a?.purchaseTime ?? 0))[0] ??
            purchases[0];

          await processPurchase(candidate);
        };

        InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
          if (settled) {
            return;
          }

          try {
            if (responseCode === InAppPurchases.IAPResponseCode.OK && results?.length) {
              const matchingProduct = results.filter((purchase) => purchase.productId === productId);
              const candidate =
                matchingProduct.find((purchase) => !purchase.acknowledged) ??
                matchingProduct[0] ??
                results.find((purchase) => !purchase.acknowledged) ??
                results[0];

              await processPurchase(candidate);
              return;
            }

            if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
              settleError(Object.assign(new Error('Purchase cancelled'), { code: 'iap.cancelled' } as PurchaseError));
              return;
            }

            settleError(
              Object.assign(new Error(`Purchase failed with code ${responseCode}`), {
                code: errorCode ?? 'iap.error',
              } as PurchaseError),
            );
          } catch (error) {
            settleError(error);
          }
        });

        InAppPurchases.purchaseItemAsync(productId)
          .then(() => {
            // Some StoreKit flows (e.g. already subscribed) may resolve the purchase promise without
            // emitting a purchase-updated event. Fallback to purchase history to reconcile.
            historyFallbackId = setTimeout(() => {
              if (settled) {
                return;
              }
              processPurchaseHistory().catch(settleError);
            }, 1_500);
          })
          .catch(settleError);
      });

      return { productId, response };
    } finally {
    }
  });
}

function ensureIosSupport() {
  if (Platform.OS !== 'ios') {
    const error = new Error('IAP is not supported on this platform') as PurchaseError;
    error.code = IAP_UNSUPPORTED_ERROR;
    throw error;
  }
}

async function withIapConnection<T>(operation: () => Promise<T>): Promise<T> {
  await InAppPurchases.connectAsync();
  try {
    return await operation();
  } finally {
    await InAppPurchases.disconnectAsync();
  }
}

function buildRequestPayload(purchase: InAppPurchases.InAppPurchase, fallbackProductId: string): IapPurchaseRequest {
  const transactionId = purchase.orderId || purchase.originalOrderId || `${Date.now()}`;
  const productId = purchase.productId ?? fallbackProductId;
  const receiptData = purchase.transactionReceipt ??
    encodeTestReceipt({
      transactionId,
      productId,
      quantity: 1,
    });

  const payload: IapPurchaseRequest = {
    platform: 'APP_STORE',
    productId,
    transactionId,
    receiptData,
  };

  if (__DEV__) {
    payload.environment = 'sandbox';
  }

  return payload;
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

/**
 * Debug function to check IAP product availability
 * Call this from paywall screen to see detailed logs
 */
export async function debugIAP() {
  const productIds = [
    PREMIUM_PRODUCT_ID,       // com.meallog.premium.annual
    PREMIUM_MONTHLY_PRODUCT_ID, // com.meallog.premium.monthly
  ];

  console.log('========================================');
  console.log('[IAP DEBUG] Starting IAP debug check...');
  console.log('[IAP DEBUG] Product IDs to query:', productIds);
  console.log('========================================');

  try {
    if (Platform.OS !== 'ios') {
      console.log('[IAP DEBUG] ERROR: Not iOS platform');
      return;
    }

    console.log('[IAP DEBUG] Connecting to App Store...');
    const connectResult = await InAppPurchases.connectAsync();
    console.log('[IAP DEBUG] Connect result =', connectResult);

    console.log('[IAP DEBUG] Fetching products...');
    const response = await InAppPurchases.getProductsAsync(productIds);
    const products = (response as any)?.results ?? response ?? [];

    console.log('========================================');
    console.log('[IAP DEBUG] responseCode =', (response as any)?.responseCode);
    console.log('[IAP DEBUG] Products count =', Array.isArray(products) ? products.length : 0);
    console.log('========================================');

    if (!Array.isArray(products) || products.length === 0) {
      console.log('[IAP DEBUG] ⚠️ NO PRODUCTS RETURNED!');
      console.log('[IAP DEBUG] Possible causes:');
      console.log('[IAP DEBUG] 1. Products not in "Ready to Submit" status in App Store Connect');
      console.log('[IAP DEBUG] 2. Bundle ID mismatch');
      console.log('[IAP DEBUG] 3. Paid Applications Agreement not signed');
      console.log('[IAP DEBUG] 4. Sandbox environment issue');
    } else {
      products.forEach((p, idx) => {
        console.log(`[IAP DEBUG] --- Product ${idx + 1} ---`);
        console.log('[IAP DEBUG] productId =', p.productId);
        console.log('[IAP DEBUG] title =', p.title);
        console.log('[IAP DEBUG] description =', p.description);
        console.log('[IAP DEBUG] price =', p.price);
        console.log('[IAP DEBUG] priceAmountMicros =', p.priceAmountMicros);
        console.log('[IAP DEBUG] priceCurrencyCode =', p.priceCurrencyCode);
        console.log('[IAP DEBUG] subscriptionPeriod =', p.subscriptionPeriod);
      });
    }

    await InAppPurchases.disconnectAsync();
    console.log('[IAP DEBUG] Disconnected from App Store');
    console.log('========================================');
  } catch (e) {
    console.log('[IAP DEBUG] ❌ ERROR:', e);
    console.log('========================================');
  }
}
