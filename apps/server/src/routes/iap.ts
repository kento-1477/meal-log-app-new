import { Router, type Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IapPurchaseRequestSchema } from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import { processIapPurchase } from '../services/iap-service.js';
import { processAppStoreNotification } from '../services/iap-notification-service.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

export const iapRouter = Router();

iapRouter.post('/iap/notifications', async (req, res) => {
  const signedPayload = typeof req.body?.signedPayload === 'string' ? req.body.signedPayload : null;
  if (!signedPayload) {
    res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: 'signedPayload is required' });
    return;
  }

  try {
    const result = await processAppStoreNotification(signedPayload);
    res.status(StatusCodes.OK).json({ ok: true, ...result });
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    logger.warn({ err }, 'Failed to process IAP notification');
    res.status(statusCode).json({ ok: false, error: err.message ?? 'Failed to process notification' });
  }
});

iapRouter.post('/iap/purchase', requireAuth, async (req, res, next) => {
  try {
    ensureIapTestModeAuthorized(req);
    const payload = IapPurchaseRequestSchema.parse(req.body);
    const result = await processIapPurchase({ ...payload, userId: req.session.userId! });
    res
      .status(StatusCodes.OK)
      .json({ ok: true, creditsGranted: result.creditsGranted, usage: result.usage, premiumStatus: result.premiumStatus });
  } catch (error) {
    next(error);
  }
});

function ensureIapTestModeAuthorized(req: Request) {
  if (!env.IAP_TEST_MODE) {
    return;
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return;
  }
  const token = env.IAP_TEST_MODE_TOKEN;
  const header = req.get('x-iap-test-mode');
  if (!token || header !== token) {
    const err = new Error('IAP test mode requires explicit admin authorization');
    Object.assign(err, { statusCode: StatusCodes.FORBIDDEN, expose: true });
    throw err;
  }
}
