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

async function fetchWithSession(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (sessionCookie) {
    headers.set('Cookie', sessionCookie);
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie;
  }

  let body: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { response, body } as const;
}

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "FavoriteMealItem" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "FavoriteMeal" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "MealLog" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "IngestRequest" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');

  const passwordHash = await argon2.hash('password123');
  await prisma.user.create({
    data: {
      email: 'favorites@example.com',
      username: 'Favorite Tester',
      passwordHash,
    },
  });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('favorites CRUD flow', async () => {
  await login();

  const createPayload = {
    name: '焼き鮭定食',
    notes: '朝食によく食べる組み合わせ',
    totals: { kcal: 620, protein_g: 32, fat_g: 18, carbs_g: 70 },
    items: [
      {
        name: '焼き鮭',
        grams: 120,
        calories: 250,
        protein_g: 25,
        fat_g: 12,
        carbs_g: 0,
      },
      {
        name: '味噌汁',
        grams: 200,
        calories: 90,
        protein_g: 6,
        fat_g: 3,
        carbs_g: 10,
      },
    ],
  };

  const created = await fetchWithSession('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  assert.equal(created.response.status, 201);
  const createdBody = created.body as any;
  assert.equal(createdBody.ok, true);
  assert.equal(createdBody.item.name, '焼き鮭定食');
  assert.equal(createdBody.item.items.length, 2);

  const list = await fetchWithSession('/api/favorites');
  assert.equal(list.response.status, 200);
  const listBody = list.body as any;
  assert.equal(Array.isArray(listBody.items), true);
  assert.equal(listBody.items.length, 1);

  const favoriteId = createdBody.item.id as number;

  const update = await fetchWithSession(`/api/favorites/${favoriteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notes: '休日の朝食セット',
      items: [
        {
          name: '焼き鮭',
          grams: 130,
          calories: 260,
          protein_g: 26,
          fat_g: 13,
          carbs_g: 0,
        },
      ],
    }),
  });

  assert.equal(update.response.status, 200);
  const updateBody = update.body as any;
  assert.equal(updateBody.item.notes, '休日の朝食セット');
  assert.equal(updateBody.item.items.length, 1);

  const detail = await fetchWithSession(`/api/favorites/${favoriteId}`);
  assert.equal(detail.response.status, 200);
  const detailBody = detail.body as any;
  assert.equal(detailBody.item.id, favoriteId);

  const remove = await fetchWithSession(`/api/favorites/${favoriteId}`, {
    method: 'DELETE',
  });
  assert.equal(remove.response.status, 204);

  const listAfterDelete = await fetchWithSession('/api/favorites');
  const listAfterDeleteBody = listAfterDelete.body as any;
  assert.equal(listAfterDeleteBody.items.length, 0);
});

test('favorite can be logged without AI', async () => {
  await login();

  const createPayload = {
    name: 'オートミールセット',
    notes: null,
    totals: { kcal: 500, protein_g: 30, fat_g: 12, carbs_g: 60 },
    items: [
      {
        name: 'オートミール',
        grams: 70,
        calories: 260,
        protein_g: 9,
        fat_g: 5,
        carbs_g: 40,
      },
    ],
  };

  const created = await fetchWithSession('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  const favoriteId = (created.body as any).item.id as number;

  const logged = await fetchWithSession(`/api/favorites/${favoriteId}/log`, {
    method: 'POST',
  });

  assert.equal(logged.response.status, 201);
  const logBody = logged.body as any;
  assert.equal(logBody.dish, 'オートミールセット');
  assert.equal(logBody.totals.kcal, 500);
  assert.equal(Array.isArray(logBody.items), true);
  assert.equal(logBody.items.length, 1);
});

async function login() {
  const result = await fetchWithSession('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'favorites@example.com', password: 'password123' }),
  });
  assert.equal(result.response.status, 200);
}
