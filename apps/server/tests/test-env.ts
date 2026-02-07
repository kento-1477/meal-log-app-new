import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const testDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(testDir, '..');

// Load local env files when present so test runs are consistent across shells.
const envCandidates = [
  '.env.test.local',
  '.env.test',
  '.env.local',
  '.env'
];

for (const envFile of envCandidates) {
  const envPath = resolve(serverRoot, envFile);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

process.env.NODE_ENV ??= 'test';
process.env.SESSION_SECRET ??= '__TEST_SESSION_SECRET__';
process.env.PORT ??= '4100';

if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
  throw new Error('Set DATABASE_URL or TEST_DATABASE_URL before running tests.');
}

process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
process.env.IAP_TEST_MODE ??= 'true';
process.env.IAP_OFFLINE_VERIFICATION ??= 'true';
