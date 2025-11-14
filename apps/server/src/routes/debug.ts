import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { analyzeMealWithGemini } from '../services/gemini-service.js';
import { requireAuth } from '../middleware/require-auth.js';
import { env } from '../env.js';
import {
  evaluateAiUsage,
  recordAiUsage,
  buildUsageLimitError,
} from '../services/ai-usage-service.js';

export const debugRouter = Router();

debugRouter.get('/ai', requireAuth, async (req, res, next) => {
  if (!env.GEMINI_API_KEY) {
    return res.status(StatusCodes.OK).json({
      ok: false,
      attempts: [],
      pingLatencyMs: null,
      message: 'API key not configured',
    });
  }

  try {
    const usageStatus = await evaluateAiUsage(req.session.userId!);
    if (!usageStatus.allowed) {
      throw buildUsageLimitError(usageStatus);
    }
    const started = Date.now();
    const result = await analyzeMealWithGemini({ message: 'ping meal of steamed rice and grilled chicken (debug)' });
    const latency = Date.now() - started;
    const usage = await recordAiUsage({
      userId: req.session.userId!,
      usageDate: usageStatus.usageDate,
      consumeCredit: usageStatus.consumeCredit,
    });
    res.status(StatusCodes.OK).json({
      ok: true,
      attempts: result.attemptReports,
      activeModel: result.meta.model,
      pingLatencyMs: latency,
      usage,
    });
  } catch (error) {
    next(error);
  }
});

debugRouter.get('/ai/analyze', requireAuth, async (req, res, next) => {
  try {
    const usageStatus = await evaluateAiUsage(req.session.userId!);
    if (!usageStatus.allowed) {
      throw buildUsageLimitError(usageStatus);
    }
    const text = String(req.query.text ?? 'カレーライス');
    const result = await analyzeMealWithGemini({ message: text });
    const usage = await recordAiUsage({
      userId: req.session.userId!,
      usageDate: usageStatus.usageDate,
      consumeCredit: usageStatus.consumeCredit,
    });
    res.status(StatusCodes.OK).json({
      ok: true,
      text,
      result: {
        ...result.response,
        meta: {
          ...(result.response.meta ?? {}),
          fallback_model_used: result.meta.model !== 'models/gemini-2.5-flash',
        },
      },
      usage,
    });
  } catch (error) {
    next(error);
  }
});
