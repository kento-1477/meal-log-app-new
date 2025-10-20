import { DateTime, Settings } from 'luxon';
import { prisma } from '../db/prisma.js';
import { DASHBOARD_TIMEZONE } from '../config/dashboard.js';

export interface UserStreak {
  current: number;
  longest: number;
  lastLoggedAt: string | null;
}

export async function getUserStreak(userId: number): Promise<UserStreak> {
  const logs = await prisma.mealLog.findMany({
    where: { userId, deletedAt: null },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!logs.length) {
    return { current: 0, longest: 0, lastLoggedAt: null };
  }

  const timezone = DASHBOARD_TIMEZONE;
  const uniqueDays: DateTime[] = [];
  let lastKey: string | null = null;
  for (const log of logs) {
    const day = DateTime.fromJSDate(log.createdAt, { zone: 'utc' }).setZone(timezone).startOf('day');
    const key = day.toISODate();
    if (key !== lastKey) {
      uniqueDays.push(day);
      lastKey = key;
    }
  }

  if (!uniqueDays.length) {
    return { current: 0, longest: 0, lastLoggedAt: null };
  }

  const lastLoggedAt = uniqueDays[0].toISO();

  const longest = calculateLongestStreak(uniqueDays);
  const current = calculateCurrentStreak(uniqueDays, timezone);

  return { current, longest, lastLoggedAt };
}

function calculateLongestStreak(days: DateTime[]) {
  let longest = 0;
  let run = 0;
  let prev: DateTime | null = null;

  for (const day of days) {
    if (!prev) {
      run = 1;
    } else {
      const diff = Math.round(prev.diff(day, 'days').days);
      run = diff === 1 ? run + 1 : 1;
    }
    prev = day;
    if (run > longest) {
      longest = run;
    }
  }

  return longest;
}

function calculateCurrentStreak(days: DateTime[], timezone: string) {
  const now = DateTime.fromMillis(Settings.now(), { zone: timezone }).startOf('day');
  let expected = now;
  let streak = 0;

  for (const day of days) {
    const diff = Math.round(expected.diff(day, 'days').days);

    if (diff === 0) {
      streak += 1;
      expected = expected.minus({ days: 1 });
      continue;
    }

    if (streak === 0 && diff === 1) {
      // No entry today, but yesterday is present -> streak 1
      streak = 1;
      expected = day.minus({ days: 1 });
      continue;
    }

    break;
  }

  return streak;
}
