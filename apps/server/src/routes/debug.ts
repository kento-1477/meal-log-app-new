import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { analyzeMealWithGemini } from '../services/gemini-service.js';
import { requireAuth } from '../middleware/require-auth.js';
import { env } from '../env.js';

export const debugRouter = Router();

debugRouter.get('/ai', requireAuth, async (_req, res, next) => {
  if (!env.GEMINI_API_KEY) {
    return res.status(StatusCodes.OK).json({
      ok: false,
      key_tail: 'mock',
      attempts: [],
      pingLatencyMs: null,
      message: 'API key not configured',
    });
  }

  try {
    const started = Date.now();
    const result = await analyzeMealWithGemini({ message: 'ping meal of steamed rice and grilled chicken (debug)' });
    const latency = Date.now() - started;
    res.status(StatusCodes.OK).json({
      ok: true,
      key_tail: env.GEMINI_API_KEY.slice(-5),
      attempts: result.attemptReports,
      activeModel: result.meta.model,
      pingLatencyMs: latency,
    });
  } catch (error) {
    const err = error as Error;
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      ok: false,
      key_tail: env.GEMINI_API_KEY.slice(-5),
      attempts: [],
      pingLatencyMs: null,
      error: err.message,
    });
  }
});

debugRouter.get('/ai/analyze', requireAuth, async (req, res, next) => {
  try {
    const text = String(req.query.text ?? 'カレーライス');
    const result = await analyzeMealWithGemini({ message: text });
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
    });
  } catch (error) {
    const err = error as Error;
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ ok: false, message: err.message });
  }
});
