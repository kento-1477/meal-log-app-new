import { Router } from 'express';
import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import { SlotSelectionRequestSchema } from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import { processMealLog, chooseSlot } from '../services/log-service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const logRouter = Router();

logRouter.post('/log', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const message = (req.body?.message ?? '').trim();
    if (!message && !req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: 'message is required' });
    }

    const idempotencyKey = (req.get('Idempotency-Key') ?? undefined) as string | undefined;
    const result = await processMealLog({
      userId: req.session.userId!,
      message,
      file: req.file ?? undefined,
      idempotencyKey,
    });

    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AggregateError' || err.message?.includes('AI_TIMEOUT')) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        ok: false,
        success: false,
        error: err.message ?? 'AI timeout',
      });
    }
    next(error);
  }
});

logRouter.post('/log/choose-slot', requireAuth, async (req, res, next) => {
  try {
    const body = SlotSelectionRequestSchema.parse(req.body);
    const updated = await chooseSlot(body, req.session.userId!);
    res.status(StatusCodes.OK).json({ ok: true, item: updated });
  } catch (error) {
    next(error);
  }
});
