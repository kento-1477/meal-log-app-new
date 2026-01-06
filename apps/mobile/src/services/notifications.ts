import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDeviceFingerprintId } from './device-fingerprint';
import { registerPushToken, disablePushToken } from './api';
import { getLocale } from '@/i18n';
import { getDeviceTimezone } from '@/utils/timezone';

const IOS_PLATFORM = 'IOS';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function resolveProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.expoConfig?.extra?.projectId ??
    null
  );
}

export async function getPushPermissionStatus() {
  if (Platform.OS !== 'ios') {
    return { granted: false, canAskAgain: false } as const;
  }
  const permissions = await Notifications.getPermissionsAsync();
  return {
    granted: permissions.status === 'granted',
    canAskAgain: permissions.canAskAgain,
  } as const;
}

export async function requestPushPermissionIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status === 'granted') {
    return true;
  }
  const request = await Notifications.requestPermissionsAsync();
  return request.status === 'granted';
}

export async function registerPushTokenIfNeeded(options?: { prompt?: boolean }): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const shouldPrompt = options?.prompt ?? true;
  let granted = (await getPushPermissionStatus()).granted;
  if (!granted && shouldPrompt) {
    granted = await requestPushPermissionIfNeeded();
  }
  if (!granted) return false;

  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn('[notifications] Missing Expo projectId; cannot register push token');
    return false;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await getDeviceFingerprintId();

  await registerPushToken({
    expo_token: tokenResponse.data,
    device_id: deviceId,
    platform: IOS_PLATFORM,
    locale: getLocale(),
    timezone: getDeviceTimezone(),
  });

  return true;
}

export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  const deviceId = await getDeviceFingerprintId();
  await disablePushToken({ device_id: deviceId });
}
