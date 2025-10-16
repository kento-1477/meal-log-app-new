import 'express-session';
import type { UserPlan } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userPlan?: UserPlan;
    aiCredits?: number;
  }
}
