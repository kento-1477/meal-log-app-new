import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { DateTime } from 'luxon';
import { IapPlatform } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { resolvePremiumDaysForProduct } from '@meal-log/shared';

const APP_STORE_JWKS_URL = new URL('https://api.storekit.itunes.apple.com/in-app-purchase/v1/jwsPublicKeys');
const APP_STORE_SANDBOX_JWKS_URL = new URL('https://api.storekit-sandbox.itunes.apple.com/in-app-purchase/v1/jwsPublicKeys');

const APP_STORE_JWKS = {
  PRODUCTION: createRemoteJWKSet(APP_STORE_JWKS_URL),
  SANDBOX: createRemoteJWKSet(APP_STORE_SANDBOX_JWKS_URL),
};

type AppStoreEnvironment = 'PRODUCTION' | 'SANDBOX';

type AppStoreNotificationPayload = {
  notificationType?: string;
  subtype?: string | null;
  environment?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
  version?: string;
  signedDate?: number;
};

type AppStoreTransactionInfo = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: number | string;
  expiresDate?: number | string;
  revocationDate?: number | string;
  quantity?: number | string;
  environment?: string;
  bundleId?: string;
};

export async function processAppStoreNotification(signedPayload: string) {
  const allowUnverified = env.IAP_OFFLINE_VERIFICATION;
  const decodedNotification = decodeJwt(signedPayload) as AppStoreNotificationPayload;
  const environment =
    resolveEnvironment(decodedNotification.environment ?? decodedNotification.data?.environment) ?? 'PRODUCTION';
  const notification = await verifySignedPayload<AppStoreNotificationPayload>(
    signedPayload,
    environment,
    allowUnverified,
  );

  const bundleId = notification.data?.bundleId ?? null;
  if (env.APP_STORE_BUNDLE_ID && bundleId && bundleId !== env.APP_STORE_BUNDLE_ID) {
    logger.warn({ bundleId }, 'IAP notification ignored (bundle mismatch)');
    return { handled: false, reason: 'bundle_mismatch' } as const;
  }

  const signedTransactionInfo = notification.data?.signedTransactionInfo;
  if (!signedTransactionInfo) {
    logger.info(
      { notificationType: notification.notificationType, subtype: notification.subtype },
      'IAP notification ignored (no transaction info)',
    );
    return { handled: false, reason: 'missing_transaction' } as const;
  }

  const transactionInfo = await verifySignedPayload<AppStoreTransactionInfo>(
    signedTransactionInfo,
    environment,
    allowUnverified,
  );

  const productId = transactionInfo.productId;
  if (!productId || resolvePremiumDaysForProduct(productId) === null) {
    logger.info({ productId }, 'IAP notification ignored (unsupported product)');
    return { handled: false, reason: 'unsupported_product' } as const;
  }

  const transactionId = readString(transactionInfo as Record<string, unknown>, ['transactionId', 'transaction_id']);
  if (!transactionId) {
    logger.warn('IAP notification ignored (missing transactionId)');
    return { handled: false, reason: 'missing_transaction_id' } as const;
  }

  const originalTransactionId =
    readString(transactionInfo as Record<string, unknown>, ['originalTransactionId', 'original_transaction_id']) ??
    transactionId;

  const purchaseDate =
    resolveDate(readMs(transactionInfo as Record<string, unknown>, ['purchaseDate', 'purchase_date_ms'])) ??
    new Date();
  const expiresDate = resolveDate(readMs(transactionInfo as Record<string, unknown>, ['expiresDate', 'expires_date_ms']));
  const revocationDate = resolveDate(readMs(transactionInfo as Record<string, unknown>, ['revocationDate', 'revocation_date_ms']));
  const quantity = resolveQuantity(transactionInfo.quantity);
  const environmentLabel = resolveEnvironment(transactionInfo.environment) ?? environment;

  const userId = await resolveUserId(originalTransactionId, transactionId);
  if (!userId) {
    logger.warn(
      { transactionId, originalTransactionId, productId },
      'IAP notification ignored (user not found)',
    );
    return { handled: false, reason: 'unknown_user' } as const;
  }

  const endDate = resolveEndDate(purchaseDate, expiresDate, revocationDate);

  await prisma.$transaction(async (tx) => {
    const existingReceipt = await tx.iapReceipt.findUnique({ where: { transactionId } });
    let receiptId = existingReceipt?.id ?? null;

    if (!existingReceipt) {
      const created = await tx.iapReceipt.create({
        data: {
          userId,
          platform: IapPlatform.APP_STORE,
          productId,
          transactionId,
          originalTransactionId,
          environment: environmentLabel,
          quantity,
          creditsGranted: 0,
          status: revocationDate ? 'REVOKED' : 'VERIFIED',
          purchasedAt: purchaseDate,
          payload: transactionInfo as any,
        },
      });
      receiptId = created.id;
    } else if (!existingReceipt.originalTransactionId && originalTransactionId) {
      await tx.iapReceipt.update({
        where: { id: existingReceipt.id },
        data: {
          originalTransactionId,
          status: revocationDate ? 'REVOKED' : existingReceipt.status,
        },
      });
      receiptId = existingReceipt.id;
    }

    if (!receiptId || !endDate) {
      return;
    }

    const existingGrant = await tx.premiumGrant.findFirst({
      where: { iapReceiptId: receiptId },
      orderBy: { endDate: 'desc' },
    });

    const days = resolveGrantDays(purchaseDate, endDate);
    if (days <= 0) {
      return;
    }

    if (!existingGrant) {
      await tx.premiumGrant.create({
        data: {
          userId,
          source: 'PURCHASE',
          days,
          startDate: purchaseDate,
          endDate,
          iapReceiptId: receiptId,
        },
      });
      return;
    }

    if (endDate < existingGrant.endDate) {
      await tx.premiumGrant.update({
        where: { id: existingGrant.id },
        data: {
          endDate,
          days: resolveGrantDays(existingGrant.startDate, endDate),
        },
      });
    }
  });

  logger.info(
    {
      transactionId,
      originalTransactionId,
      productId,
      notificationType: notification.notificationType,
    },
    'IAP notification processed',
  );

  return { handled: true } as const;
}

async function verifySignedPayload<T>(
  signedPayload: string,
  environment: AppStoreEnvironment,
  allowUnverified: boolean,
): Promise<T> {
  if (allowUnverified) {
    return decodeJwt(signedPayload) as T;
  }
  const jwks = APP_STORE_JWKS[environment];
  const { payload } = await jwtVerify(signedPayload, jwks);
  return payload as T;
}

function resolveEnvironment(value?: string | null): AppStoreEnvironment | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized.includes('SANDBOX')) return 'SANDBOX';
  if (normalized.includes('PROD')) return 'PRODUCTION';
  return null;
}

function readString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function readMs(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function resolveDate(value: number | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveQuantity(value?: number | string | null) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function resolveGrantDays(startDate: Date, endDate: Date) {
  const diffDays = DateTime.fromJSDate(endDate).diff(DateTime.fromJSDate(startDate), 'days').days;
  return Math.max(0, Math.ceil(diffDays));
}

function resolveEndDate(purchaseDate: Date, expiresDate: Date | null, revocationDate: Date | null) {
  if (!expiresDate) return null;
  if (revocationDate && revocationDate.getTime() > 0 && revocationDate < expiresDate) {
    return revocationDate;
  }
  if (expiresDate < purchaseDate) {
    return null;
  }
  return expiresDate;
}

async function resolveUserId(originalTransactionId: string, transactionId: string) {
  const receipt = await prisma.iapReceipt.findFirst({
    where: {
      OR: [
        { originalTransactionId },
        { transactionId: originalTransactionId },
        { transactionId },
      ],
    },
    select: { userId: true },
  });
  return receipt?.userId ?? null;
}
