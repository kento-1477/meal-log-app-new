import '../test-env.ts';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { prisma } from '../../src/db/prisma.ts';
import { createApp } from '../../src/app.ts';

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
  await prisma.$executeRawUnsafe('TRUNCATE "MealLog" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "LogShareToken" CASCADE');
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
