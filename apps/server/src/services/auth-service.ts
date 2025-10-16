import argon2 from 'argon2';
import { prisma } from '../db/prisma.js';
import type { UserPlan } from '@prisma/client';

export async function registerUser(params: { email: string; password: string; username?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) {
    throw Object.assign(new Error('Email already in use'), { statusCode: 409, expose: true });
  }

  const passwordHash = await argon2.hash(params.password);
  const user = await prisma.user.create({
    data: {
      email: params.email,
      username: params.username ?? null,
      passwordHash,
    },
  });

  return serializeUser(user);
}

export async function authenticateUser(params: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: params.email } });
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, expose: true });
  }

  const valid = await argon2.verify(user.passwordHash, params.password);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, expose: true });
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
