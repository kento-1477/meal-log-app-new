import { prisma } from '../db/prisma.js';
import { normalizeTimezone } from '../utils/timezone.js';

const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 7 * 60;
const DEFAULT_DAILY_CAP = 1;

export function toSettingsResponse(settings: {
  reminderEnabled: boolean;
  importantEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  dailyCap: number;
  timezone: string | null;
}) {
  return {
    reminder_enabled: settings.reminderEnabled,
    important_enabled: settings.importantEnabled,
    quiet_hours_start: settings.quietHoursStart,
    quiet_hours_end: settings.quietHoursEnd,
    daily_cap: settings.dailyCap,
    timezone: normalizeTimezone(settings.timezone),
  };
}

export async function getOrCreateNotificationSettings(
  userId: number,
  options?: { timezone?: string | null },
) {
  const existing = await prisma.notificationSettings.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.notificationSettings.create({
    data: {
      userId,
      reminderEnabled: false,
      importantEnabled: false,
      quietHoursStart: DEFAULT_QUIET_START,
      quietHoursEnd: DEFAULT_QUIET_END,
      dailyCap: DEFAULT_DAILY_CAP,
      timezone: options?.timezone ? normalizeTimezone(options.timezone) : null,
    },
  });
}

export async function updateNotificationSettings(
  userId: number,
  updates: Partial<{
    reminderEnabled: boolean;
    importantEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
    dailyCap: number;
    timezone: string | null;
  }>,
) {
  const existing = await getOrCreateNotificationSettings(userId, {
    timezone: updates.timezone ?? null,
  });

  return prisma.notificationSettings.update({
    where: { id: existing.id },
    data: {
      reminderEnabled: updates.reminderEnabled ?? existing.reminderEnabled,
      importantEnabled: updates.importantEnabled ?? existing.importantEnabled,
      quietHoursStart: clampMinutes(updates.quietHoursStart ?? existing.quietHoursStart),
      quietHoursEnd: clampMinutes(updates.quietHoursEnd ?? existing.quietHoursEnd),
      dailyCap: clampDailyCap(updates.dailyCap ?? existing.dailyCap),
      timezone:
        updates.timezone !== undefined
          ? normalizeTimezone(updates.timezone)
          : existing.timezone,
    },
  });
}

export async function upsertPushDevice(params: {
  userId: number;
  deviceId: string;
  expoToken: string;
  platform: string;
  locale?: string | null;
  timezone?: string | null;
}) {
  const timezone = params.timezone ? normalizeTimezone(params.timezone) : null;
  return prisma.pushDevice.upsert({
    where: {
      userId_deviceId: {
        userId: params.userId,
        deviceId: params.deviceId,
      },
    },
    update: {
      expoToken: params.expoToken,
      platform: params.platform,
      locale: params.locale ?? null,
      timezone,
      lastSeenAt: new Date(),
      disabledAt: null,
    },
    create: {
      userId: params.userId,
      deviceId: params.deviceId,
      expoToken: params.expoToken,
      platform: params.platform,
      locale: params.locale ?? null,
      timezone,
      lastSeenAt: new Date(),
    },
  });
}

export async function disablePushDevice(params: { userId: number; deviceId: string }) {
  await prisma.pushDevice.updateMany({
    where: {
      userId: params.userId,
      deviceId: params.deviceId,
      disabledAt: null,
    },
    data: {
      disabledAt: new Date(),
    },
  });
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUIET_START;
  }
  return Math.max(0, Math.min(1439, Math.round(value)));
}

function clampDailyCap(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_DAILY_CAP;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}
