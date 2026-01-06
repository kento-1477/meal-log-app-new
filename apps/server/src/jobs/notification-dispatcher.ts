import { DateTime } from 'luxon';
import { MealPeriod } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { normalizeTimezone } from '../utils/timezone.js';
import { evaluateAiUsage } from '../services/ai-usage-service.js';
import { isPremium } from '../services/premium-service.js';

const DISPATCH_INTERVAL_MIN = 15;
const MAX_USERS_PER_RUN = 500;
const REMINDER_LOOKBACK_DAYS = 30;
const REMINDER_DELAY_MIN = 60;
const REMINDER_WINDOW_MIN = 30;
const REMINDER_MIN_SAMPLES = 3;
const FREE_RETENTION_DAYS = 30;
const RETENTION_WARNING_DAYS = 7;

const NOTIFICATION_TYPES = {
  MEAL_REMINDER: 'reminder.meal',
  PREMIUM_EXPIRING: 'important.premium-expiring',
  AI_USAGE_LOW: 'important.ai-usage-low',
  LOG_RETENTION: 'important.log-retention',
} as const;

const MEAL_PERIODS = [
  { key: MealPeriod.BREAKFAST, label: { ja: '朝食', en: 'breakfast' }, fallback: 7 * 60 + 30 },
  { key: MealPeriod.LUNCH, label: { ja: '昼食', en: 'lunch' }, fallback: 12 * 60 + 30 },
  { key: MealPeriod.DINNER, label: { ja: '夕食', en: 'dinner' }, fallback: 19 * 60 },
  { key: MealPeriod.SNACK, label: { ja: '間食', en: 'snack' }, fallback: null },
];

type NotificationCandidate = {
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: number;
  allowDuringQuietHours?: boolean;
};

export function scheduleNotificationDispatch() {
  const scheduleNext = () => {
    const delayMs = DISPATCH_INTERVAL_MIN * 60 * 1000;
    const timer = setTimeout(async () => {
      try {
        await dispatchNotifications();
      } catch (error) {
        logger.error({ err: error }, 'notification dispatch failed');
      } finally {
        scheduleNext();
      }
    }, delayMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };

  scheduleNext();
}

async function dispatchNotifications(referenceDate: Date = new Date()) {
  const users = await prisma.user.findMany({
    where: {
      notificationSettings: {
        is: {
          OR: [{ reminderEnabled: true }, { importantEnabled: true }],
        },
      },
      pushDevices: {
        some: {
          disabledAt: null,
          platform: 'IOS',
        },
      },
    },
    include: {
      notificationSettings: true,
      pushDevices: {
        where: { disabledAt: null, platform: 'IOS' },
      },
    },
    take: MAX_USERS_PER_RUN,
  });

  if (users.length === 0) {
    return;
  }

  for (const user of users) {
    const settings = user.notificationSettings;
    if (!settings) continue;
    if (!user.pushDevices.length) continue;

    const timezone = normalizeTimezone(settings.timezone);
    const now = DateTime.fromJSDate(referenceDate).setZone(timezone);
    const nowMinutes = now.hour * 60 + now.minute;
    const localeKey = resolveLocaleKeyFromDevices(user.pushDevices);

    const dailyCount = await countNotificationsToday(user.id, timezone, now);
    if (dailyCount >= settings.dailyCap) {
      continue;
    }

    const inQuietHours = isWithinQuietHours(nowMinutes, settings.quietHoursStart, settings.quietHoursEnd);

    const candidates: NotificationCandidate[] = [];
    const importantCandidate = await buildImportantCandidate(
      user.id,
      timezone,
      now,
      localeKey,
      settings.importantEnabled,
    );
    if (importantCandidate) {
      candidates.push(importantCandidate);
    }

    if (settings.reminderEnabled) {
      const reminderCandidate = await buildMealReminderCandidate(user.id, timezone, now, localeKey);
      if (reminderCandidate) {
        candidates.push(reminderCandidate);
      }
    }

    const chosen = candidates
      .filter((candidate) => (inQuietHours ? candidate.allowDuringQuietHours : true))
      .sort((a, b) => b.priority - a.priority)[0];

    if (!chosen) {
      continue;
    }

    const alreadySent = await hasSentNotificationTypeToday(user.id, chosen.type, timezone, now);
    if (alreadySent) {
      continue;
    }

    await sendNotification(user.id, user.pushDevices, chosen, referenceDate);
  }
}

async function buildMealReminderCandidate(
  userId: number,
  timezone: string,
  now: DateTime,
  localeKey: 'ja' | 'en',
) {
  const fromDate = now.minus({ days: REMINDER_LOOKBACK_DAYS }).startOf('day');
  const logs = await prisma.mealLog.findMany({
    where: {
      userId,
      deletedAt: null,
      createdAt: {
        gte: fromDate.toJSDate(),
      },
    },
    select: { createdAt: true, mealPeriod: true },
  });

  if (logs.length === 0) {
    return null;
  }

  const todayKey = now.toISODate();
  const minutesByPeriod = new Map<MealPeriod, number[]>();
  const loggedToday = new Set<MealPeriod>();

  for (const log of logs) {
    if (!log.mealPeriod) continue;
    const dt = DateTime.fromJSDate(log.createdAt, { zone: timezone });
    if (!dt.isValid) continue;
    const minutes = dt.hour * 60 + dt.minute;
    const list = minutesByPeriod.get(log.mealPeriod) ?? [];
    list.push(minutes);
    minutesByPeriod.set(log.mealPeriod, list);
    if (dt.toISODate() === todayKey) {
      loggedToday.add(log.mealPeriod);
    }
  }

  const nowMinutes = now.hour * 60 + now.minute;

  for (const period of MEAL_PERIODS) {
    if (loggedToday.has(period.key)) {
      continue;
    }
    const sample = minutesByPeriod.get(period.key) ?? [];
    const useFallback = sample.length < REMINDER_MIN_SAMPLES;
    const baseMinutes = useFallback ? period.fallback : median(sample);
    if (baseMinutes == null) {
      continue;
    }

    const target = baseMinutes + REMINDER_DELAY_MIN;
    if (nowMinutes < target || nowMinutes >= target + REMINDER_WINDOW_MIN) {
      continue;
    }

    const label = localeKey === 'ja' ? period.label.ja : period.label.en;
    const copy = localeKey === 'ja'
      ? {
          title: '食事の記録を忘れていませんか？',
          body: `${label}の記録を1タップで済ませましょう。`,
        }
      : {
          title: 'Ready to log your meal?',
          body: `Log ${label} in one tap.`,
        };

    return {
      type: NOTIFICATION_TYPES.MEAL_REMINDER,
      title: copy.title,
      body: copy.body,
      data: { path: '/(tabs)/chat', mealPeriod: period.key.toLowerCase() },
      priority: 10,
    } satisfies NotificationCandidate;
  }

  return null;
}

async function buildImportantCandidate(
  userId: number,
  timezone: string,
  now: DateTime,
  localeKey: 'ja' | 'en',
  importantEnabled: boolean,
) {
  if (!importantEnabled) {
    return null;
  }

  const premiumCandidate = await buildPremiumExpiringCandidate(userId, now, localeKey);
  if (premiumCandidate) return premiumCandidate;

  const usageCandidate = await buildAiUsageCandidate(userId, localeKey);
  if (usageCandidate) return usageCandidate;

  const retentionCandidate = await buildRetentionCandidate(userId, timezone, now, localeKey);
  if (retentionCandidate) return retentionCandidate;

  return null;
}

async function buildPremiumExpiringCandidate(userId: number, now: DateTime, localeKey: 'ja' | 'en') {
  const soon = now.plus({ days: 3 }).toJSDate();
  const active = await prisma.premiumGrant.findFirst({
    where: {
      userId,
      startDate: { lte: now.toJSDate() },
      endDate: { gte: now.toJSDate(), lte: soon },
    },
    orderBy: { endDate: 'asc' },
  });

  if (!active) {
    return null;
  }

  const daysRemaining = Math.max(0, Math.ceil(DateTime.fromJSDate(active.endDate).diff(now, 'days').days));
  const copy =
    localeKey === 'ja'
      ? {
          title: 'プレミアムが間もなく終了します',
          body: `あと${daysRemaining}日で特典が終了します。`,
        }
      : {
          title: 'Premium ends soon',
          body: `Your benefits end in ${daysRemaining} days.`,
        };

  return {
    type: NOTIFICATION_TYPES.PREMIUM_EXPIRING,
    title: copy.title,
    body: copy.body,
    data: { path: '/paywall' },
    priority: 100,
    allowDuringQuietHours: true,
  } satisfies NotificationCandidate;
}

async function buildAiUsageCandidate(userId: number, localeKey: 'ja' | 'en') {
  const status = await evaluateAiUsage(userId);
  if (status.remaining > 1) {
    return null;
  }

  const copy =
    localeKey === 'ja'
      ? {
          title: 'AIの残り回数が少なくなりました',
          body:
            status.remaining > 0
              ? `残り${status.remaining}回です。必要な時に使えるように確認しましょう。`
              : '本日の無料回数を使い切りました。',
        }
      : {
          title: 'AI usage is running low',
          body:
            status.remaining > 0
              ? `${status.remaining} uses left today.`
              : 'You have used all free requests today.',
        };

  return {
    type: NOTIFICATION_TYPES.AI_USAGE_LOW,
    title: copy.title,
    body: copy.body,
    data: { path: '/(tabs)/chat' },
    priority: 90,
    allowDuringQuietHours: true,
  } satisfies NotificationCandidate;
}

async function buildRetentionCandidate(
  userId: number,
  timezone: string,
  now: DateTime,
  localeKey: 'ja' | 'en',
) {
  const premium = await isPremium(userId);
  if (premium) {
    return null;
  }

  const earliest = await prisma.mealLog.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  if (!earliest) {
    return null;
  }

  const daysSince = Math.floor(now.diff(DateTime.fromJSDate(earliest.createdAt).setZone(timezone), 'days').days);
  if (daysSince < FREE_RETENTION_DAYS - RETENTION_WARNING_DAYS) {
    return null;
  }

  const since = now.minus({ days: 7 }).toJSDate();
  const recentNotice = await prisma.notificationLog.findFirst({
    where: {
      userId,
      type: NOTIFICATION_TYPES.LOG_RETENTION,
      sentAt: { gte: since },
      status: 'sent',
    },
  });
  if (recentNotice) {
    return null;
  }

  const copy =
    localeKey === 'ja'
      ? {
          title: '古い食事ログの保存期限が近づいています',
          body: '7日後に古いログが見えなくなります。必要なら保存を。',
        }
      : {
          title: 'Old meal logs expire soon',
          body: 'Older logs will be hidden in 7 days. Save them if needed.',
        };

  return {
    type: NOTIFICATION_TYPES.LOG_RETENTION,
    title: copy.title,
    body: copy.body,
    data: { path: '/paywall' },
    priority: 80,
    allowDuringQuietHours: true,
  } satisfies NotificationCandidate;
}

async function sendNotification(
  userId: number,
  devices: Array<{ id: number; expoToken: string; locale: string | null }>,
  candidate: NotificationCandidate,
  referenceDate: Date,
) {
  const logEntry = await prisma.notificationLog.create({
    data: {
      userId,
      type: candidate.type,
      status: 'pending',
      scheduledFor: referenceDate,
      metadata: {
        title: candidate.title,
        body: candidate.body,
        data: candidate.data,
      },
    },
  });

  try {
    const { ticketIds, disabledDeviceIds } = await sendExpoPush(devices, candidate);
    if (disabledDeviceIds.length > 0) {
      await prisma.pushDevice.updateMany({
        where: { id: { in: disabledDeviceIds } },
        data: { disabledAt: new Date() },
      });
    }
    await prisma.notificationLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          ...((logEntry.metadata as Record<string, unknown> | null) ?? {}),
          ticketIds,
        },
      },
    });
  } catch (error) {
    await prisma.notificationLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown_error',
      },
    });
    throw error;
  }
}

async function sendExpoPush(
  devices: Array<{ id: number; expoToken: string; locale: string | null }>,
  candidate: NotificationCandidate,
) {
  const deviceChunks = chunk(devices, 100);
  const ticketIds: string[] = [];
  const disabledDeviceIds: number[] = [];

  for (const batchDevices of deviceChunks) {
    const messages = batchDevices.map((device) => ({
      to: device.expoToken,
      title: candidate.title,
      body: candidate.body,
      data: candidate.data,
      sound: 'default',
    }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`expo_push_failed:${response.status}:${text}`);
    }

    const payload = (await response.json()) as { data?: Array<{ status: string; id?: string; details?: any }> };
    const results = payload?.data ?? [];
    results.forEach((result, index) => {
      if (result.status === 'ok' && result.id) {
        ticketIds.push(result.id);
        return;
      }
      const errorCode = result.details?.error;
      if (errorCode === 'DeviceNotRegistered') {
        const device = batchDevices[index];
        if (device) {
          disabledDeviceIds.push(device.id);
        }
      }
    });
  }

  return { ticketIds, disabledDeviceIds };
}

async function countNotificationsToday(userId: number, timezone: string, now: DateTime) {
  const { start, end } = dayBounds(now, timezone);
  return prisma.notificationLog.count({
    where: {
      userId,
      sentAt: {
        gte: start.toJSDate(),
        lt: end.toJSDate(),
      },
      status: 'sent',
    },
  });
}

async function hasSentNotificationTypeToday(userId: number, type: string, timezone: string, now: DateTime) {
  const { start, end } = dayBounds(now, timezone);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      userId,
      type,
      sentAt: {
        gte: start.toJSDate(),
        lt: end.toJSDate(),
      },
      status: 'sent',
    },
  });
  return Boolean(existing);
}

function dayBounds(now: DateTime, timezone: string) {
  const local = now.setZone(timezone);
  const start = local.startOf('day');
  const end = start.plus({ days: 1 });
  return { start, end };
}

function isWithinQuietHours(nowMinutes: number, start: number, end: number) {
  if (start === end) {
    return false;
  }
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  return nowMinutes >= start || nowMinutes < end;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function resolveLocaleKeyFromDevices(devices: Array<{ locale: string | null }>) {
  const locale = devices.find((device) => device.locale)?.locale;
  if (locale && locale.toLowerCase().startsWith('ja')) {
    return 'ja' as const;
  }
  return 'en' as const;
}
