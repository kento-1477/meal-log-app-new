import argon2 from 'argon2';
import { prisma } from '../db/prisma.js';
import type { UserPlan } from '@prisma/client';

const PLAN_OVERRIDE: UserPlan | null = process.env.NODE_ENV !== 'production' ? 'STANDARD' : null;

export async function registerUser(params: { email: string; password: string; username?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) {
    throw Object.assign(new Error('このメールアドレスは既に登録されています'), {
      statusCode: 409,
      expose: true,
    });
  }

  const passwordHash = await argon2.hash(params.password);
  const user = await prisma.user.create({
    data: {
      email: params.email,
      username: params.username ?? null,
      passwordHash,
    },
  });

  return serializeUser(withPlanOverride(user));
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

  return serializeUser(withPlanOverride(user));
}

export async function findUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  return serializeUser(withPlanOverride(user));
}

function serializeUser(user: {
  id: number;
  email: string;
  username: string | null;
  plan: UserPlan;
  aiCredits: number;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    plan: user.plan,
    aiCredits: user.aiCredits,
  };
}

function withPlanOverride(user: {
  id: number;
  email: string;
  username: string | null;
  plan: UserPlan;
  aiCredits: number;
}) {
  if (!PLAN_OVERRIDE) {
    return user;
  }
  if (user.plan === PLAN_OVERRIDE) {
    return user;
  }
  return {
    ...user,
    plan: PLAN_OVERRIDE,
  };
}
