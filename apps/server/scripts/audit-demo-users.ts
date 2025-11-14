import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoUsers = await prisma.user.findMany({
    where: { email: { contains: 'demo@' } },
    select: { id: true, email: true, createdAt: true },
  });

  if (!demoUsers.length) {
    console.log('No demo-like accounts detected.');
    return;
  }

  console.log('Demo-like accounts:');
  for (const user of demoUsers) {
    console.log(`- ${user.id} :: ${user.email} (created ${user.createdAt.toISOString()})`);
  }
}

main()
  .catch((error) => {
    console.error('Audit failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
