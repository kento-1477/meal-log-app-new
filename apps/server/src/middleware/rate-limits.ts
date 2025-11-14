import rateLimit from 'express-rate-limit';
import { env } from '../env.js';

const isTest = env.NODE_ENV === 'test';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: '短時間に多数のリクエストが送信されました。しばらくしてから再度お試しください。',
  },
});

export const logIngestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 120 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'AI 処理のリクエストが多すぎます。少し時間を空けてから再実行してください。',
  },
});
