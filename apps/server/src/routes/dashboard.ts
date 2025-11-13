import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { getDashboardSummary, getDashboardTargetsForUser } from '../services/dashboard-service.js';
import { getCalorieTrend } from '../services/calorie-trend-service.js';

type DashboardPeriod = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'custom';

const querySchema = z.object({
  period: z.enum(['today', 'yesterday', 'thisWeek', 'lastWeek', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional(),
});

const calorieQuerySchema = z.object({
  range: z.coerce
    .number()
    .optional()
    .refine((value) => value == null || value === 7 || value === 30, 'range must be either 7 or 30'),
  mode: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard/summary', requireAuth, async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);

    const summary = await getDashboardSummary({
      userId: req.session.userId!,
      period: query.period as DashboardPeriod,
      from: query.from,
      to: query.to,
    });

    res.status(StatusCodes.OK).json({ ok: true, summary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: error.message });
    }
    if (error instanceof Error && error.message.includes('period')) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

dashboardRouter.get('/dashboard/targets', requireAuth, async (req, res, next) => {
  try {
    const targets = await getDashboardTargetsForUser(req.session.userId!);
    res.status(StatusCodes.OK).json({ ok: true, targets });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.put('/dashboard/targets', requireAuth, (_req, res) => {
  res
    .status(StatusCodes.NOT_IMPLEMENTED)
    .json({ ok: false, error: 'カスタム目標の編集には現在対応していません。' });
});

dashboardRouter.get('/calories', requireAuth, async (req, res, next) => {
  try {
    const query = calorieQuerySchema.parse(req.query);
    const locale = resolveLocale(req.query.locale, req.headers['accept-language']);
    const mode = query.mode ?? (query.range === 30 ? 'monthly' : query.range === 7 ? 'weekly' : 'daily');
    const payload = await getCalorieTrend({
      userId: req.session.userId!,
      mode,
      locale,
    });
    res.status(StatusCodes.OK).json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

function resolveLocale(queryLocale?: unknown, headerLocale?: string | string[]) {
  if (typeof queryLocale === 'string' && queryLocale.trim().length > 0) {
    return queryLocale;
  }
  if (typeof headerLocale === 'string' && headerLocale.length > 0) {
    return headerLocale.split(',')[0] ?? 'ja-JP';
  }
  if (Array.isArray(headerLocale) && headerLocale.length > 0) {
    return headerLocale[0];
  }
  return 'ja-JP';
}
