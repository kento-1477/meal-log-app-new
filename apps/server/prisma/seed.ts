import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('password123');
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {
      plan: 'STANDARD',
    },
    create: {
      email: 'demo@example.com',
      username: 'Demo User',
      passwordHash,
      plan: 'STANDARD',
    },
  });

  console.log('Seeded user', user.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
