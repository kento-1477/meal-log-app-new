import '../test-env.ts';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/db/prisma.ts';
import { createApp } from '../../src/app.ts';

const app = createApp();
const server = app.listen(0);
const address = server.address();
const baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : 'http://127.0.0.1:4100';
let sessionCookie = '';
let dbAvailable = true;

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
  try {
    await prisma.$executeRawUnsafe('TRUNCATE "PremiumGrant" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE "IapReceipt" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE "AiUsageCounter" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');

    const registerResponse = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'iap-tester@example.com',
        password: 'password123',
        username: 'Iap Tester',
      }),
    });

    assert.equal(registerResponse.status, 201);
    sessionCookie = '';
  } catch (error) {
    dbAvailable = false;
    console.warn('Skipping IAP integration test: database unavailable', (error as Error).message);
  }
});

after(async () => {
  server.close();
  if (dbAvailable) {
    await prisma.$disconnect();
  }
});

test('iap purchase grants premium and usage update', async (t) => {
  if (!dbAvailable) {
    t.skip('database not available');
    return;
  }
  await login();

  const baseReceipt = {
    transactionId: 'txn-integration-1',
    productId: 'com.meallog.premium.annual',
    quantity: 1,
    purchaseDate: new Date().toISOString(),
    environment: 'sandbox',
  } as const;

  const payload = {
    platform: 'APP_STORE',
    productId: baseReceipt.productId,
    transactionId: baseReceipt.transactionId,
    receiptData: Buffer.from(JSON.stringify(baseReceipt)).toString('base64'),
    environment: 'sandbox',
    quantity: baseReceipt.quantity,
  } satisfies Record<string, unknown>;

  const firstPurchase = await fetchWithSession('/api/iap/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(firstPurchase.response.status, 200);
  const body = firstPurchase.body as any;
  assert.equal(body.ok, true);
  assert.equal(body.premiumStatus.isPremium, true);
  assert.equal(body.premiumStatus.source, 'PURCHASE');
  assert.equal(typeof body.premiumStatus.daysRemaining, 'number');
  assert.equal(body.creditsGranted, 0);
  assert.equal(body.usage.plan, 'PREMIUM');

  const grants = await prisma.premiumGrant.findMany();
  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.source, 'PURCHASE');

  const secondPurchase = await fetchWithSession('/api/iap/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(secondPurchase.response.status, 200);
  const secondBody = secondPurchase.body as any;
  assert.equal(secondBody.creditsGranted, 0);
  assert.equal(secondBody.premiumStatus.isPremium, true);
  assert.equal(secondBody.premiumStatus.grants.length, 1);
});

test('rejects forged receipts', async (t) => {
  if (!dbAvailable) {
    t.skip('database not available');
    return;
  }
  await login();

  const mismatchedReceipt = {
    transactionId: 'txn-forged',
    productId: 'com.attacker.fake',
    quantity: 1,
    purchaseDate: new Date().toISOString(),
  };

  const { response, body } = await fetchWithSession('/api/iap/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'APP_STORE',
      productId: 'com.meallog.premium.annual',
      transactionId: 'txn-legit',
      receiptData: Buffer.from(JSON.stringify(mismatchedReceipt)).toString('base64'),
    }),
  });

  assert.equal(response.status, 400);
  assert.equal((body as any)?.ok, false);
});

async function login() {
  if (!dbAvailable) {
    throw new Error('database not available');
  }
  const result = await fetchWithSession('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'iap-tester@example.com', password: 'password123' }),
  });
  assert.equal(result.response.status, 200);
}
