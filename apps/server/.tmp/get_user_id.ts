
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'demo@example.com' },
      select: { id: true },
    });
    if (user) {
      console.log(JSON.stringify(user));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
