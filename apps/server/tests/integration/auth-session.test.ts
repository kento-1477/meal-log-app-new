import '../test-env.ts';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/db/prisma.ts';
import { createApp } from '../../src/app.ts';

const app = createApp();
const server = app.listen(0);
const address = server.address();
const baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : 'http://127.0.0.1:4200';

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "Session" CASCADE');
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('register regenerates session id', async () => {
  const forgedSid = 's%3Aattacker-session';
  const response = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `connect.sid=${forgedSid}`,
    },
    body: JSON.stringify({ email: 'regen@example.com', password: 'password123' }),
  });

  assert.equal(response.status, 201);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected Set-Cookie header');
  assert.ok(!setCookie!.includes(forgedSid), 'session id must be regenerated');
});

test('login regenerates session id', async () => {
  await fetch(`${baseUrl}/api/logout`, { method: 'POST' }).catch(() => undefined);

  const forgedSid = 's%3Aforced-login';
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `connect.sid=${forgedSid}`,
    },
    body: JSON.stringify({ email: 'regen@example.com', password: 'password123' }),
  });

  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected Set-Cookie header');
  assert.ok(!setCookie!.includes(forgedSid), 'session id must be regenerated');
});
