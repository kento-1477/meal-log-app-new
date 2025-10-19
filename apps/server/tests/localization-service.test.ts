import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeminiNutritionResponse } from '@meal-log/shared';
import { maybeTranslateNutritionResponse } from '../src/services/localization-service.js';
import { env } from '../src/env.js';

const baseResponse: GeminiNutritionResponse = {
  dish: 'Sample Meal',
  confidence: 0.85,
  totals: {
    kcal: 520,
    protein_g: 32,
    fat_g: 18,
    carbs_g: 62,
  },
  items: [
    { name: 'Chicken Breast', grams: 150 },
    { name: 'Rice', grams: 180 },
  ],
  warnings: [],
  landing_type: null,
  meta: {
    model: 'mock',
  },
};

const ORIGINAL_STRATEGY = env.AI_TRANSLATION_STRATEGY;

test.after(() => {
  // Restore original strategy after all tests
  Object.assign(env, { AI_TRANSLATION_STRATEGY: ORIGINAL_STRATEGY });
});

test('maybeTranslateNutritionResponse returns clone when strategy=copy', async () => {
  Object.assign(env, { AI_TRANSLATION_STRATEGY: 'copy' });
  const translated = await maybeTranslateNutritionResponse(baseResponse, 'ja-JP');
  assert.ok(translated);
  assert.notStrictEqual(translated, baseResponse);
  assert.equal(translated?.dish, baseResponse.dish);
  assert.notStrictEqual(translated?.items[0], baseResponse.items[0], 'items should be deeply cloned');
});

test('maybeTranslateNutritionResponse returns null when strategy=none', async () => {
  Object.assign(env, { AI_TRANSLATION_STRATEGY: 'none' });
  const result = await maybeTranslateNutritionResponse(baseResponse, 'ja-JP');
  assert.equal(result, null);
});

