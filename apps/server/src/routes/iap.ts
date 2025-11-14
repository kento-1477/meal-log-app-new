import { Router, type Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IapPurchaseRequestSchema } from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import { processIapPurchase } from '../services/iap-service.js';
import { env } from '../env.js';

export const iapRouter = Router();

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
