import '../test-env.ts';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { prisma } from '../../src/db/prisma.ts';
import { createApp } from '../../src/app.ts';

process.env.USER_PLAN_OVERRIDE = 'STANDARD';

const app = createApp();
const server = app.listen(0);
const address = server.address();
const baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : 'http://127.0.0.1:4100';
let sessionCookie = '';

async function fetchWithSession(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (sessionCookie) {
    headers.set('Cookie', sessionCookie);
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie;
  }

  let body;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { response, body };
}

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "AiUsageCounter" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "MealLog" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "LogShareToken" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "FavoriteMealItem" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "FavoriteMeal" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  const passwordHash = await argon2.hash('password123');
  await prisma.user.create({
    data: {
      email: 'demo@example.com',
      username: 'Demo',
      passwordHash,
    },
  });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('log ingestion persists and appears in listing', async () => {
  await loginAsDemo();

  const form = new FormData();
  form.append('message', 'テストのサラダ 200kcal');
  form.append('timezone', 'Asia/Tokyo');

  const ingest = await fetchWithSession('/log', {
    method: 'POST',
    body: form,
  });
  assert.equal(ingest.response.status, 200);
  assert.equal(ingest.body.ok, true);

  const logs = await fetchWithSession('/api/logs');
  assert.equal(logs.response.status, 200);
  assert.equal(Array.isArray(logs.body.items), true);
  assert.equal(logs.body.items.length >= 1, true);
});

test('meal period updates append history entries and details include time history', async () => {
  await loginAsDemo();
  await prisma.mealLog.deleteMany();

  const form = new FormData();
  form.append('message', '朝のオムレツ 400kcal');
  form.append('timezone', 'Asia/Tokyo');

  const ingest = await fetchWithSession('/log', {
    method: 'POST',
    body: form,
  });

  assert.equal(ingest.response.status, 200);
  const logId = ingest.body.logId as string;

  const initialHistory = await prisma.mealLogPeriodHistory.findMany({ where: { mealLogId: logId } });
  assert.equal(initialHistory.length, 1);
  assert.equal(initialHistory[0]?.source, 'auto');

  const patch = await fetchWithSession(`/api/log/${logId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meal_period: 'dinner' }),
  });

  assert.equal(patch.response.status, 200);
  const detail = patch.body.item;
  assert.ok(Array.isArray(detail.time_history));
  assert.equal(detail.time_history.length, 2);
  assert.equal(detail.time_history[0]?.source, 'manual');

  const history = await prisma.mealLogPeriodHistory.findMany({ where: { mealLogId: logId }, orderBy: { createdAt: 'desc' } });
  assert.equal(history.length, 2);
  assert.equal(history[0]?.source, 'manual');
});

test('logs range filter respects timezone windows', async () => {
  await loginAsDemo();
  await prisma.mealLog.deleteMany();

  const tz = 'America/Los_Angeles';
  const form = new FormData();
  form.append('message', 'チキンサラダ 450kcal');
  form.append('timezone', tz);

  const ingest = await fetchWithSession('/log', {
    method: 'POST',
    body: form,
    headers: { 'X-Timezone': tz },
  });

  assert.equal(ingest.response.status, 200);
  const logId = ingest.body.logId as string;

  await prisma.mealLog.update({
    where: { id: logId },
    data: { createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
  });

  const todayLogs = await fetchWithSession('/api/logs?range=today', {
    headers: { 'X-Timezone': tz },
  });
  assert.equal(todayLogs.response.status, 200);
  assert.equal(todayLogs.body.items.length, 0);

  const twoWeeksLogs = await fetchWithSession('/api/logs?range=twoWeeks', {
    headers: { 'X-Timezone': tz },
  });
  assert.equal(twoWeeksLogs.response.status, 200);
  assert.equal(twoWeeksLogs.body.items.length, 1);
  assert.equal(twoWeeksLogs.body.items[0]?.id, logId);
});

test('delete and restore keep period history intact', async () => {
  await loginAsDemo();
  await prisma.mealLog.deleteMany();

  const form = new FormData();
  form.append('message', '夜のパスタ 600kcal');
  form.append('timezone', 'Europe/Paris');

  const ingest = await fetchWithSession('/log', {
    method: 'POST',
    body: form,
  });

  assert.equal(ingest.response.status, 200);
  const logId = ingest.body.logId as string;

  const del = await fetchWithSession(`/api/log/${logId}`, { method: 'DELETE' });
  assert.equal(del.response.status, 200);

  const restore = await fetchWithSession(`/api/log/${logId}/restore`, { method: 'POST' });
  assert.equal(restore.response.status, 200);

  const detail = await fetchWithSession(`/api/log/${logId}`);
  assert.equal(detail.response.status, 200);
  assert.ok(Array.isArray(detail.body.item.time_history));
  assert.equal(detail.body.item.time_history.length >= 1, true);
});

test('streak endpoint returns streak data', async () => {
  await loginAsDemo();
  const streak = await fetchWithSession('/api/streak');
  assert.equal(streak.response.status, 200);
  assert.equal(streak.body.ok, true);
  assert.equal(typeof streak.body.streak.current, 'number');
});

async function loginAsDemo() {
  const result = await fetchWithSession('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@example.com', password: 'password123' }),
  });
  assert.equal(result.response.status, 200);
}
