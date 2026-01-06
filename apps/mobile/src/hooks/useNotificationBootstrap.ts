import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSessionStore } from '@/store/session';
import { getNotificationSettings } from '@/services/api';
import { configureNotificationHandler, registerPushTokenIfNeeded } from '@/services/notifications';

export function useNotificationBootstrap() {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const path = typeof data.path === 'string' ? data.path : null;
      if (path) {
        router.push(path);
      }
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const settings = await getNotificationSettings();
        if (cancelled) return;
        if (settings.reminder_enabled || settings.important_enabled) {
          await registerPushTokenIfNeeded({ prompt: false });
        }
      } catch (error) {
        console.warn('[notifications] Failed to sync settings', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);
}
