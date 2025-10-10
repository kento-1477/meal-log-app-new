import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      ok: false,
      authenticated: false,
      error: 'unauthorized',
    });
  }
  return next();
}
