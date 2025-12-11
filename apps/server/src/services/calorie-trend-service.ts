import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { DASHBOARD_TARGETS, DASHBOARD_TIMEZONE } from '../config/dashboard.js';
import { getDashboardTargetsForUser } from './dashboard-service.js';

type CalorieTrendMode = 'daily' | 'weekly' | 'monthly';

interface CalorieTrendParams {
  userId: number;
  mode: CalorieTrendMode;
  locale?: string;
}

interface CalorieTrendPoint {
  date: string;
  label: string;
  value: number;
}

export async function getCalorieTrend({ userId, mode, locale }: CalorieTrendParams) {
  const timezone = DASHBOARD_TIMEZONE;
  const now = DateTime.now().setZone(timezone);

  const { startInclusive, endExclusive } = resolveRangeBounds(now, mode);

  const logs = await prisma.mealLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: startInclusive.toJSDate(),
        lt: endExclusive.toJSDate(),
      },
      deletedAt: null,
    },
    select: {
      createdAt: true,
      calories: true,
    },
  });

  const dailyTargets = await getDashboardTargetsForUser(userId);

  return buildCalorieTrend({
    logs,
    timezone,
    locale,
    startInclusive,
    endExclusive,
    dailyTargets,
  });
}

export function buildCalorieTrend({
  logs,
  timezone,
  locale,
  startInclusive,
  endExclusive,
  dailyTargets,
}: {
  logs: Array<{ createdAt: Date; calories: number }>;
  timezone: string;
  locale?: string;
  startInclusive: DateTime;
  endExclusive: DateTime;
  dailyTargets?: {
    calories: number;
  };
}) {
  const bucket = new Map<string, number>();

  for (const log of logs) {
    const dt = DateTime.fromJSDate(log.createdAt, { zone: timezone });
    if (!dt.isValid) {
      continue;
    }
    const key = dt.startOf('day').toISODate();
    if (!key) {
      continue;
    }
    bucket.set(key, (bucket.get(key) ?? 0) + (log.calories ?? 0));
  }

  const points: CalorieTrendPoint[] = [];
  const totalDays = Math.max(1, Math.round(endExclusive.diff(startInclusive, 'days').days));
  for (let offset = 0; offset < totalDays; offset += 1) {
    const current = startInclusive.plus({ days: offset });
    const key = current.toISODate() ?? current.toFormat('yyyy-MM-dd');
    const value = Math.round(bucket.get(key) ?? 0);
    points.push({
      date: key,
      label: formatLabel(current, locale),
      value,
    });
  }

  return {
    target: dailyTargets?.calories ?? DASHBOARD_TARGETS.calories.value,
    points,
  };
}

function resolveRangeBounds(now: DateTime, mode: CalorieTrendMode) {
  const base = now;
  switch (mode) {
    case 'daily':
    case 'weekly': {
      // 今日から6日前〜今日（7日間）
      const endExclusive = base.plus({ days: 1 }).startOf('day');
      const startInclusive = endExclusive.minus({ days: 7 });
      return { startInclusive, endExclusive };
    }
    case 'monthly':
    default: {
      const startInclusive = base.startOf('month');
      const endExclusive = startInclusive.plus({ months: 1 });
      return { startInclusive, endExclusive };
    }
  }
}

function formatLabel(dateTime: DateTime, locale?: string) {
  const targetLocale = locale ?? 'ja-JP';
  const timeZone = dateTime.zoneName ?? 'UTC';
  const jsDate = dateTime.toJSDate();
  const monthDayFormatter = new Intl.DateTimeFormat(targetLocale, { month: 'numeric', day: 'numeric', timeZone });
  const weekdayFormatter = new Intl.DateTimeFormat(targetLocale, { weekday: 'short', timeZone });
  const monthDay = monthDayFormatter.format(jsDate);
  const weekday = weekdayFormatter.format(jsDate);
  return `${monthDay} (${weekday})`;
}
