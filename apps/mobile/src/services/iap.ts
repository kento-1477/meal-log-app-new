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
  localizedPrice?: string;
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
  return withIapConnection(async () => {
    const products = await InAppPurchases.getProductsAsync(productIds);
    return products.map((product) => ({
      productId: product.productId,
      title: product.title,
      description: product.description,
      price: product.price,
      priceAmount: product.priceAmount ?? 0,
      currencyCode: product.currencyCode ?? 'JPY',
      localizedPrice: product.localizedPrice,
    }));
  });
}

export async function purchasePremiumPlan(): Promise<PurchaseResult> {
  return purchaseProduct(PREMIUM_PRODUCT_ID);
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

    let subscription: { remove: () => void } | null = null;
    let settled = false;

    try {
      const response = await new Promise<IapPurchaseResponse>((resolve, reject) => {
        subscription = InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
          if (settled) {
            return;
          }

          try {
            if (responseCode === InAppPurchases.IAPResponseCode.OK && results?.length) {
              for (const purchase of results) {
                if (purchase.acknowledged) {
                  continue;
                }
                const request = buildRequestPayload(purchase, productId);
                const apiResponse = await submitPurchase(request);
                await InAppPurchases.finishTransactionAsync(purchase, true);
                settled = true;
                resolve(apiResponse);
                return;
              }
              return;
            }

            if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
              settled = true;
              reject(Object.assign(new Error('Purchase cancelled'), { code: 'iap.cancelled' } as PurchaseError));
              return;
            }

            settled = true;
            reject(
              Object.assign(new Error(`Purchase failed with code ${responseCode}`), {
                code: errorCode ?? 'iap.error',
              } as PurchaseError),
            );
          } catch (error) {
            settled = true;
            reject(error);
          }
        });

        InAppPurchases.purchaseItemAsync(productId).catch((error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        });
      });

      return { productId, response };
    } finally {
      if (subscription) {
        subscription.remove();
      }
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
  const transactionId = purchase.transactionId ?? purchase.originalTransactionIdentifier ?? `${Date.now()}`;
  const quantity = typeof purchase.quantity === 'number' && purchase.quantity > 0 ? purchase.quantity : 1;
  const productId = purchase.productId ?? fallbackProductId;
  const receiptData = purchase.transactionReceipt ??
    encodeTestReceipt({
      transactionId,
      productId,
      quantity,
    });

  return {
    platform: 'APP_STORE',
    productId,
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
