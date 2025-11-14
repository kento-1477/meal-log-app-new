process.env.NODE_ENV ??= 'test';
process.env.SESSION_SECRET ??= '__TEST_SESSION_SECRET__';
process.env.PORT ??= '4100';

if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
  throw new Error('Set DATABASE_URL or TEST_DATABASE_URL before running tests.');
}

process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
process.env.IAP_TEST_MODE ??= 'true';
process.env.IAP_OFFLINE_VERIFICATION ??= 'true';
