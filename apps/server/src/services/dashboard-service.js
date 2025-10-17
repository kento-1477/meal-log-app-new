import { DateTime } from 'luxon';
import { prisma } from '../db/prisma.js';
import { DASHBOARD_CACHE_TTL_MS, DASHBOARD_TIMEZONE } from '../config/dashboard.js';
import { TTLCache } from '../utils/ttl-cache.js';
import { buildDashboardSummary as buildSummary } from './dashboard-builder.js';

const cache = new TTLCache();

export async function getDashboardSummary({ userId, period, from, to }) {
  const timezone = DASHBOARD_TIMEZONE;
  const { range, cacheKey } = resolveRange(period, timezone, from, to, userId);

  const cached = cache.get(cacheKey);
  if (cached) {
    return withMetadata(cached, timezone);
  }

  const logs = await prisma.mealLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: range.fromDate.toJSDate(),
        lt: range.toDate.toJSDate(),
      },
    },
    select: {
      createdAt: true,
      calories: true,
      proteinG: true,
      fatG: true,
      carbsG: true,
      mealPeriod: true,
    },
  });

  const todayTotals = await fetchTodayTotals(userId, timezone);
  const summary = buildSummary({ logs, range, timezone, todayTotals });
  const withMeta = withMetadata(summary, timezone);
  cache.set(cacheKey, withMeta, DASHBOARD_CACHE_TTL_MS);
  return withMeta;
}

export function invalidateDashboardCacheForUser() {
  cache.clear();
}

function fetchTodayTotals(userId, timezone) {
  const { fromDate, toDate } = resolveSingleDayRange('today', timezone);
  return prisma.mealLog
    .aggregate({
      _sum: {
        calories: true,
        proteinG: true,
        fatG: true,
        carbsG: true,
      },
      where: {
        userId,
        createdAt: {
          gte: fromDate.toJSDate(),
          lt: toDate.toJSDate(),
        },
      },
    })
    .then((result) => ({
      calories: result._sum.calories ?? 0,
      protein_g: result._sum.proteinG ?? 0,
      fat_g: result._sum.fatG ?? 0,
      carbs_g: result._sum.carbsG ?? 0,
    }));
}

function resolveRange(period, timezone, from, to, userId) {
  switch (period) {
    case 'today':
    case 'yesterday':
      return {
        range: resolveSingleDayRange(period, timezone),
        cacheKey: buildCacheKey(userId, period),
      };
    case 'thisWeek':
    case 'lastWeek':
      return {
        range: resolveWeekRange(period, timezone),
        cacheKey: buildCacheKey(userId, period),
      };
    case 'custom': {
      if (!from || !to) {
        throw new Error('カスタム期間には from/to の指定が必要です');
      }
      const fromDate = DateTime.fromISO(from, { zone: timezone }).startOf('day');
      const toDate = DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day');
      if (!fromDate.isValid || !toDate.isValid) {
        throw new Error('from/to の日付形式が正しくありません');
      }
      if (toDate <= fromDate) {
        throw new Error('終了日は開始日より後の日付を指定してください');
      }
      if (toDate.diff(fromDate, 'days').days > 31) {
        throw new Error('カスタム期間は31日以内で指定してください');
      }
      return {
        range: { fromDate, toDate, period },
        cacheKey: buildCacheKey(userId, `${fromDate.toISODate()}_${toDate.toISODate()}`),
      };
    }
    default:
      throw new Error(`未対応の期間指定です: ${period}`);
  }
}

function resolveSingleDayRange(period, timezone) {
  const now = DateTime.now().setZone(timezone);
  const base = period === 'today' ? now : now.minus({ days: 1 });
  return {
    fromDate: base.startOf('day'),
    toDate: base.plus({ days: 1 }).startOf('day'),
    period,
  };
}

function resolveWeekRange(period, timezone) {
  const now = DateTime.now().setZone(timezone);
  const startOfThisWeek = now.startOf('week');
  const fromDate = period === 'thisWeek' ? startOfThisWeek : startOfThisWeek.minus({ weeks: 1 });
  const toDate = fromDate.plus({ weeks: 1 });
  return {
    fromDate,
    toDate,
    period,
  };
}

function buildCacheKey(userId, period) {
  return `dashboard:${userId ?? 'anon'}:${period}`;
}

function withMetadata(summary, timezone) {
  return {
    ...summary,
    metadata: {
      generatedAt: DateTime.now().setZone(timezone).toISO(),
    },
  };
}
