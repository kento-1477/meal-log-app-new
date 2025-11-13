import { PrismaClient, MealPeriod } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();
const TARGET_EMAIL = 'demo@example.com';
const DAYS = 30;

const meals = [
  { period: MealPeriod.BREAKFAST, name: 'ヨーグルトとフルーツ', kcal: 420, protein: 20, fat: 12, carbs: 55, hour: 8 },
  { period: MealPeriod.LUNCH, name: 'サラダチキンボウル', kcal: 540, protein: 38, fat: 15, carbs: 60, hour: 12 },
  { period: MealPeriod.DINNER, name: '鮭の塩焼き定食', kcal: 680, protein: 32, fat: 22, carbs: 75, hour: 19 },
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) throw new Error(`User ${TARGET_EMAIL} not found`);

  const today = DateTime.now().setZone('Asia/Tokyo').startOf('day');

  for (let dayOffset = 0; dayOffset < DAYS; dayOffset += 1) {
    const baseDate = today.minus({ days: dayOffset });
    for (const meal of meals) {
      const createdAt = baseDate.set({ hour: meal.hour });
      await prisma.mealLog.create({
        data: {
          userId: user.id,
          mealPeriod: meal.period,
          foodItem: `${meal.name} (${createdAt.toFormat('MM/dd')})`,
          calories: meal.kcal + Math.round((Math.random() - 0.5) * 80),
          proteinG: meal.protein,
          fatG: meal.fat,
          carbsG: meal.carbs,
          createdAt: createdAt.toJSDate(),
        },
      });
    }
  }

  console.log(`Seeded ${DAYS} days of logs for ${TARGET_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
