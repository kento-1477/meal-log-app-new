import { config } from 'dotenv';
import { z } from 'zod';
import { AiTimeoutConfigSchema } from '@meal-log/shared';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local' });
config();

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  SESSION_SECRET: z.string().min(10),
  DATABASE_URL: z.string(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_FORCE_IPV4: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  AI_TRANSLATION_STRATEGY: z.enum(['ai', 'copy', 'none']).default('ai').optional(),
  TRUST_PROXY: z.string().optional(),
  APP_STORE_SHARED_SECRET: z.string().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT: z.string().optional(),
  IAP_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  IAP_TEST_MODE_TOKEN: z.string().optional(),
  IAP_OFFLINE_VERIFICATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const TimeoutEnvSchema = AiTimeoutConfigSchema.partial();

const merged = BaseEnvSchema.merge(TimeoutEnvSchema);

export type AppEnv = z.infer<typeof merged>;

export const env: AppEnv = merged.parse(process.env);

if (env.NODE_ENV === 'production' && env.IAP_TEST_MODE) {
  throw new Error('IAP_TEST_MODE must be false in production deployments');
}
if (env.NODE_ENV === 'production' && env.IAP_OFFLINE_VERIFICATION) {
  throw new Error('IAP_OFFLINE_VERIFICATION cannot be enabled in production');
}

export const timeoutConfig = AiTimeoutConfigSchema.parse({
  AI_ATTEMPT_TIMEOUT_MS: env.AI_ATTEMPT_TIMEOUT_MS,
  AI_TOTAL_TIMEOUT_MS: env.AI_TOTAL_TIMEOUT_MS,
  AI_HEDGE_DELAY_MS: env.AI_HEDGE_DELAY_MS,
  AI_MAX_ATTEMPTS: env.AI_MAX_ATTEMPTS,
});
