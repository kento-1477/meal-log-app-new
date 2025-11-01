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
  await prisma.$executeRawUnsafe('TRUNCATE "UserProfile" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');

  const registerResponse = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'profile@example.com',
      password: 'password123',
      username: 'Profile Tester',
    }),
  });

  assert.equal(registerResponse.status, 201);
  sessionCookie = '';
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('profile get returns defaults and create/upsert persists onboarding fields', async () => {
  await login();

  const initial = await fetchWithSession('/api/profile');
  assert.equal(initial.response.status, 200);
  const initialBody = initial.body as any;
  assert.equal(initialBody.ok, true);
  assert.deepEqual(initialBody.profile.goals, []);
  assert.equal(initialBody.profile.apple_health_linked, false);
  assert.equal(initialBody.profile.questionnaire_completed_at, null);

  const payload = {
    display_name: 'Meal Tester',
    gender: 'FEMALE',
    birthdate: '1995-01-01T00:00:00.000Z',
    height_cm: 172,
    unit_preference: 'METRIC',
    marketing_source: 'instagram',
    goals: ['WEIGHT_LOSS', 'STRESS_MANAGEMENT'],
    target_calories: 1800,
    target_protein_g: 120,
    target_fat_g: 60,
    target_carbs_g: 190,
    body_weight_kg: 70,
    current_weight_kg: 70,
    target_weight_kg: 62,
    plan_intensity: 'STANDARD',
    target_date: '2025-06-01T00:00:00.000Z',
    activity_level: 'MODERATE',
    apple_health_linked: false,
    questionnaire_completed_at: '2025-01-01T00:00:00.000Z',
    language: 'ja-JP',
  } as const;

  const updated = await fetchWithSession('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(updated.response.status, 200);
  const updatedBody = updated.body as any;
  assert.equal(updatedBody.ok, true);
  assert.equal(updatedBody.profile.display_name, payload.display_name);
  assert.equal(updatedBody.profile.gender, payload.gender);
  assert.equal(updatedBody.profile.height_cm, payload.height_cm);
  assert.deepEqual(updatedBody.profile.goals, payload.goals);
  assert.equal(updatedBody.profile.plan_intensity, payload.plan_intensity);
  assert.equal(updatedBody.profile.questionnaire_completed_at, payload.questionnaire_completed_at);

  const session = await fetchWithSession('/api/session');
  assert.equal(session.response.status, 200);
  const sessionBody = session.body as any;
  assert.equal(sessionBody.authenticated, true);
  assert.equal(sessionBody.onboarding.completed, true);
  assert.equal(sessionBody.onboarding.completed_at, payload.questionnaire_completed_at);
});

async function login() {
  const result = await fetchWithSession('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile@example.com', password: 'password123' }),
  });
  assert.equal(result.response.status, 200);
}
