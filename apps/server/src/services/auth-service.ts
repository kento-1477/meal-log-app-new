import argon2 from 'argon2';
import { StatusCodes } from 'http-status-codes';
import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export async function registerUser(params: { email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) {
    logger.warn({ email: params.email }, 'register attempt with existing email');
    throw Object.assign(new Error('登録手続きを完了できませんでした。入力内容をご確認ください。'), {
      statusCode: StatusCodes.BAD_REQUEST,
      expose: true,
    });
  }

  const passwordHash = await argon2.hash(params.password);
  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
    },
  });

  return serializeUser(user);
}

export async function authenticateUser(params: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: params.email } });
  if (!user) {
    throw Object.assign(new Error('メールアドレスまたはパスワードが正しくありません'), {
      statusCode: 401,
      expose: true,
    });
  }

  let valid = false;
  try {
    valid = await argon2.verify(user.passwordHash, params.password);
  } catch (error) {
    // e.g. bcrypt hashes saved before migration will fail argon2.verify
    logger.warn({ err: error, userId: user.id }, 'Failed to verify password hash; treating as invalid credentials');
    valid = false;
  }

  if (!valid) {
    throw Object.assign(new Error('メールアドレスまたはパスワードが正しくありません'), {
      statusCode: 401,
      expose: true,
    });
  }

  return serializeUser(user);
}

export async function findUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  return serializeUser(user);
}

export async function upsertAppleUser(params: { sub: string; email: string | null }) {
  const existingBySub = await prisma.user.findUnique({ where: { appleSub: params.sub } });
  if (existingBySub) {
    return serializeUser(existingBySub);
  }

  if (!params.email) {
    throw Object.assign(new Error('Appleからメールアドレスを取得できませんでした。最初のログインではメール共有を許可してください。'), {
      statusCode: StatusCodes.BAD_REQUEST,
      expose: true,
    });
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email: params.email } });
  if (existingByEmail) {
    if (existingByEmail.appleSub && existingByEmail.appleSub !== params.sub) {
      throw Object.assign(new Error('このメールアドレスは別のAppleアカウントに紐づいています'), {
        statusCode: 409,
        expose: true,
      });
    }
    const updated = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        appleSub: params.sub,
        appleEmail: params.email,
        appleLinkedAt: new Date(),
      },
    });
    return serializeUser(updated);
  }

  const placeholderPassword = await argon2.hash(randomUUID());
  const created = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash: placeholderPassword,
      appleSub: params.sub,
      appleEmail: params.email,
      appleLinkedAt: new Date(),
    },
  });

  return serializeUser(created);
}

export async function linkAppleAccount(userId: number, params: { sub: string; email?: string }) {
  const existingBySub = await prisma.user.findUnique({ where: { appleSub: params.sub } });
  if (existingBySub && existingBySub.id !== userId) {
    throw Object.assign(new Error('このAppleアカウントは別のユーザーに紐づいています'), {
      statusCode: 409,
      expose: true,
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      appleSub: params.sub,
      appleEmail: params.email ?? undefined,
      appleLinkedAt: new Date(),
    },
  });

  return serializeUser(updated);
}

function serializeUser(user: {
  id: number;
  email: string;
  username: string | null;
  aiCredits: number;
  appleSub?: string | null;
  appleEmail?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    aiCredits: user.aiCredits,
    appleLinked: Boolean(user.appleSub),
    appleEmail: user.appleEmail ?? null,
  };
}
