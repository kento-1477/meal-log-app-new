import session from 'express-session';
import type { PrismaClient } from '@prisma/client';

interface PrismaSessionStoreOptions {
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function computeExpiration(sess: session.SessionData, fallbackTtl: number) {
  const cookieExpiry = sess.cookie?.expires ? new Date(sess.cookie.expires) : null;
  if (cookieExpiry && Number.isFinite(cookieExpiry.getTime())) {
    return cookieExpiry;
  }
  return new Date(Date.now() + fallbackTtl);
}

export class PrismaSessionStore extends session.Store {
  private readonly ttlMs: number;

  constructor(private readonly prisma: PrismaClient, options: PrismaSessionStoreOptions = {}) {
    super();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  override async get(
    sid: string,
    callback: (err: unknown, session?: session.SessionData | null) => void,
  ): Promise<void> {
    try {
      const record = await this.prisma.session.findUnique({ where: { sid } });
      if (!record) {
        callback(null, null);
        return;
      }
      if (record.expiresAt.getTime() <= Date.now()) {
        await this.destroy(sid, () => undefined);
        callback(null, null);
        return;
      }
      const data = JSON.parse(record.data) as session.SessionData;
      callback(null, data);
    } catch (error) {
      callback(error);
    }
  }

  override async set(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: unknown) => void,
  ): Promise<void> {
    try {
      const expiresAt = computeExpiration(sess, this.ttlMs);
      await this.prisma.session.upsert({
        where: { sid },
        update: {
          data: JSON.stringify(sess),
          expiresAt,
        },
        create: {
          sid,
          data: JSON.stringify(sess),
          expiresAt,
        },
      });
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override async destroy(sid: string, callback?: (err?: unknown) => void): Promise<void> {
    try {
      await this.prisma.session.deleteMany({ where: { sid } });
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override async touch(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: unknown) => void,
  ): Promise<void> {
    try {
      const expiresAt = computeExpiration(sess, this.ttlMs);
      await this.prisma.session.updateMany({
        where: { sid },
        data: { expiresAt },
      });
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
