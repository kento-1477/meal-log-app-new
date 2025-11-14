import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const shouldSeedDemo = process.env.SEED_DEMO_USER === 'true' || process.env.NODE_ENV === 'development';
  if (!shouldSeedDemo) {
    console.log('[seed] Skipping demo user creation (SEED_DEMO_USER not enabled)');
    return;
  }

  const plainPassword =
    process.env.DEMO_USER_PASSWORD && process.env.DEMO_USER_PASSWORD.length >= 12
      ? process.env.DEMO_USER_PASSWORD
      : randomBytes(18).toString('base64url');
  const passwordHash = await argon2.hash(plainPassword);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {
      passwordHash,
    },
    create: {
      email: 'demo@example.com',
      username: 'Demo User',
      passwordHash,
    },
  });

  console.log(`[seed] Demo user ready (${user.email}) with password: ${plainPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
