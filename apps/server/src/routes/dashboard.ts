import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { getDashboardSummary } from '../services/dashboard-service.js';
import { getDefaultTargets } from '../services/dashboard-builder.js';

type DashboardPeriod = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'custom';

const querySchema = z.object({
  period: z.enum(['today', 'yesterday', 'thisWeek', 'lastWeek', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional(),
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

dashboardRouter.get('/dashboard/targets', requireAuth, (_req, res) => {
  res.status(StatusCodes.OK).json({ ok: true, targets: getDefaultTargets() });
});

dashboardRouter.put('/dashboard/targets', requireAuth, (_req, res) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ ok: false, error: 'Custom targets not yet supported' });
});
