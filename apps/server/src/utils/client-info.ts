import type { Request } from 'express';

export function getClientIp(req: Request): string {
  const fromExpress = req.ip;
  if (typeof fromExpress === 'string' && fromExpress.trim()) {
    return fromExpress;
  }
  const fromSocket = req.socket?.remoteAddress;
  if (typeof fromSocket === 'string' && fromSocket.trim()) {
    return fromSocket;
  }
  return 'unknown';
}

export function getClientUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.trim() ? ua : 'unknown';
}
