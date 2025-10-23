import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    aiCredits?: number;
    locale?: string;
    timezone?: string;
  }
}
