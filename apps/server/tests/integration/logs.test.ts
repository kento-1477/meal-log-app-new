process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.PORT ??= '4100';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/meal_log_test';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import argon2 from 'argon2';
import { prisma } from '../../dist/db/prisma.js';
import { createApp } from '../../src/app.js';

const app = createApp();
const server = app.listen(0);
const request = supertest(server);

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
  const agent = request.agent(server);

  const login = await agent
    .post('/api/login')
    .send({ email: 'demo@example.com', password: 'password123' })
    .expect(200);
  assert.equal(login.body.user.email, 'demo@example.com');

  const ingest = await agent
    .post('/log')
    .field('message', 'テストのサラダ 200kcal')
    .expect(200);
  assert.ok(ingest.body.ok);

  const logs = await agent.get('/api/logs').expect(200);
  assert.equal(logs.body.items.length >= 1, true);
});

test('streak endpoint returns streak data', async () => {
  const agent = request.agent(server);
  await agent
    .post('/api/login')
    .send({ email: 'demo@example.com', password: 'password123' })
    .expect(200);

  const response = await agent.get('/api/streak').expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.streak.current, 'number');
});
