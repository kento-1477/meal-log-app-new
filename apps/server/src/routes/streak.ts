import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { requireAuth } from '../middleware/require-auth.js';
import { getUserStreak } from '../services/streak-service.js';

export const streakRouter = Router();

streakRouter.get('/streak', requireAuth, async (req, res, next) => {
  try {
    const streak = await getUserStreak(req.session.userId!);
    res.status(StatusCodes.OK).json({ ok: true, streak });
  } catch (error) {
    next(error);
  }
});
