import argon2 from 'argon2';
import { StatusCodes } from 'http-status-codes';
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

  const valid = await argon2.verify(user.passwordHash, params.password);
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

function serializeUser(user: {
  id: number;
  email: string;
  username: string | null;
  aiCredits: number;
}) {
  return {
    id: user.id,
    email: user.email,
    aiCredits: user.aiCredits,
  };
}
