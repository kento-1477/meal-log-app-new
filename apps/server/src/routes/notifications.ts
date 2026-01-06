import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  NotificationSettingsUpdateRequestSchema,
  PushTokenDisableRequestSchema,
  PushTokenRegisterRequestSchema,
} from '@meal-log/shared';
import { requireAuth } from '../middleware/require-auth.js';
import { resolveRequestTimezone } from '../utils/timezone.js';
import {
  disablePushDevice,
  getOrCreateNotificationSettings,
  toSettingsResponse,
  updateNotificationSettings,
  upsertPushDevice,
} from '../services/notification-service.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/settings', async (req, res, next) => {
  try {
    const timezone = resolveRequestTimezone(req);
    const settings = await getOrCreateNotificationSettings(req.session.userId!, { timezone });
    res.status(StatusCodes.OK).json({ ok: true, settings: toSettingsResponse(settings) });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.put('/settings', async (req, res, next) => {
  try {
    const parsed = NotificationSettingsUpdateRequestSchema.parse(req.body);
    const settings = await updateNotificationSettings(req.session.userId!, {
      reminderEnabled: parsed.reminder_enabled,
      importantEnabled: parsed.important_enabled,
      quietHoursStart: parsed.quiet_hours_start,
      quietHoursEnd: parsed.quiet_hours_end,
      dailyCap: parsed.daily_cap,
      timezone: parsed.timezone,
    });
    res.status(StatusCodes.OK).json({ ok: true, settings: toSettingsResponse(settings) });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/token', async (req, res, next) => {
  try {
    const parsed = PushTokenRegisterRequestSchema.parse(req.body);
    const timezone = parsed.timezone ?? resolveRequestTimezone(req);
    await upsertPushDevice({
      userId: req.session.userId!,
      deviceId: parsed.device_id,
      expoToken: parsed.expo_token,
      platform: parsed.platform,
      locale: parsed.locale ?? null,
      timezone,
    });
    await updateNotificationSettings(req.session.userId!, {
      timezone,
    });
    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.delete('/token', async (req, res, next) => {
  try {
    const parsed = PushTokenDisableRequestSchema.parse(req.body);
    await disablePushDevice({ userId: req.session.userId!, deviceId: parsed.device_id });
    res.status(StatusCodes.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
