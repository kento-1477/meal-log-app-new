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
});

const TimeoutEnvSchema = AiTimeoutConfigSchema.partial();

const merged = BaseEnvSchema.merge(TimeoutEnvSchema);

export type AppEnv = z.infer<typeof merged>;

export const env: AppEnv = merged.parse(process.env);

export const timeoutConfig = AiTimeoutConfigSchema.parse({
  AI_ATTEMPT_TIMEOUT_MS: env.AI_ATTEMPT_TIMEOUT_MS,
  AI_TOTAL_TIMEOUT_MS: env.AI_TOTAL_TIMEOUT_MS,
  AI_HEDGE_DELAY_MS: env.AI_HEDGE_DELAY_MS,
  AI_MAX_ATTEMPTS: env.AI_MAX_ATTEMPTS,
});
