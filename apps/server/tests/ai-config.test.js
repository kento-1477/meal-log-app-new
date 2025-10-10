import assert from 'node:assert/strict';
import test from 'node:test';
import { AiTimeoutConfigSchema } from '@meal-log/shared';

test('AI timeout config schema provides sane defaults', () => {
  const defaults = AiTimeoutConfigSchema.parse({});
  assert.equal(defaults.AI_ATTEMPT_TIMEOUT_MS, 25000);
  assert.equal(defaults.AI_TOTAL_TIMEOUT_MS, 35000);
  assert.equal(defaults.AI_HEDGE_DELAY_MS, 5000);
  assert.equal(defaults.AI_MAX_ATTEMPTS, 2);
});

test('AI timeout config validation rejects invalid max attempts', () => {
  const invalidConfig = { AI_MAX_ATTEMPTS: 999 };
  assert.throws(() => AiTimeoutConfigSchema.parse(invalidConfig));
});
