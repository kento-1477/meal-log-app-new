import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IapPurchaseRequestSchema } from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import { processIapPurchase } from '../services/iap-service.js';

export const iapRouter = Router();

iapRouter.post('/iap/purchase', requireAuth, async (req, res, next) => {
  try {
    const payload = IapPurchaseRequestSchema.parse(req.body);
    const result = await processIapPurchase({ ...payload, userId: req.session.userId! });
    res
      .status(StatusCodes.OK)
      .json({ ok: true, creditsGranted: result.creditsGranted, usage: result.usage, premiumStatus: result.premiumStatus });
  } catch (error) {
    next(error);
  }
});
