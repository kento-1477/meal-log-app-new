import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';

export const onboardingRouter = Router();

const OnboardingEventSchema = z.object({
  eventName: z.enum(['onboarding.step_viewed', 'onboarding.step_completed', 'onboarding.completed']),
  step: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1),
  metadata: z.record(z.unknown()).nullable().optional(),
});

onboardingRouter.post('/onboarding/events', (req, res, next) => {
  try {
    const payload = OnboardingEventSchema.parse(req.body);
    if (env.NODE_ENV !== 'production') {
      logger.info(
        { event: payload.eventName, step: payload.step ?? null, sessionId: payload.sessionId },
        'onboarding event',
      );
    }
    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
