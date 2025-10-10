import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../logger.js';

interface AppError extends Error {
  statusCode?: number;
  expose?: boolean;
}

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;

  logger.error(
    {
      errName: err.name,
      errMessage: err.message,
      statusCode,
      errCode: (err as any).code,
      errCause: (err as any).cause,
      stack: err.stack,
    },
    'Unhandled error',
  );

  if (res.headersSent) {
    return res.end();
  }

  res.status(statusCode).json({
    ok: false,
    success: false,
    error: err.expose ? err.message : 'AI fallback disabled (internal_error)',
  });
}
