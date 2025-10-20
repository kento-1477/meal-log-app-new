
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
    const logs = await prisma.mealLog.findMany({
      where: { userId: 1 },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(JSON.stringify(logs, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
