import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { getNotificationSettings, updateNotificationSettings } from '@/services/api';
import {
  getPushPermissionStatus,
  registerPushTokenIfNeeded,
  requestPushPermissionIfNeeded,
  unregisterPushToken,
} from '@/services/notifications';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [importantEnabled, setImportantEnabled] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: getNotificationSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(['notificationSettings'], settings);
      setReminderEnabled(settings.reminder_enabled);
      setImportantEnabled(settings.important_enabled);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setReminderEnabled(settingsQuery.data.reminder_enabled);
      setImportantEnabled(settingsQuery.data.important_enabled);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getPushPermissionStatus();
      if (!cancelled) {
        setPermissionBlocked(!status.granted && !status.canAskAgain);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (key: 'reminder_enabled' | 'important_enabled', nextValue: boolean) => {
    setIsUpdating(true);

    try {
      if (nextValue) {
        const granted = await requestPushPermissionIfNeeded();
        if (!granted) {
          Alert.alert(t('settings.notifications.permissionTitle'), t('settings.notifications.permissionMessage'));
          return;
        }
      }

      const settings = await updateMutation.mutateAsync({ [key]: nextValue });
      let registrationFailed = false;

      if (nextValue) {
        const registered = await registerPushTokenIfNeeded();
        if (!registered) {
          registrationFailed = true;
        }
      }

      const nextReminder = key === 'reminder_enabled' ? nextValue : settings.reminder_enabled;
      const nextImportant = key === 'important_enabled' ? nextValue : settings.important_enabled;

      if (!nextReminder && !nextImportant) {
        try {
          await unregisterPushToken();
        } catch (error) {
          console.warn('[notifications] Failed to unregister token', error);
        }
      }

      if (registrationFailed) {
        Alert.alert(t('settings.notifications.errorTitle'), t('settings.notifications.permissionMessage'));
      }
    } catch (error) {
      console.warn('[notifications] Failed to update settings', error);
      Alert.alert(t('settings.notifications.errorTitle'), t('settings.notifications.errorMessage'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('settings.notifications.screenTitle')}</Text>
        <View style={styles.card}>
          {settingsQuery.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.caption}>{t('settings.notifications.loading')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>{t('settings.notifications.reminder')}</Text>
                <Switch
                  value={reminderEnabled}
                  onValueChange={(value) => handleToggle('reminder_enabled', value)}
                  disabled={isUpdating}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <Text style={styles.caption}>{t('settings.notifications.reminderCaption')}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>{t('settings.notifications.important')}</Text>
                <Switch
                  value={importantEnabled}
                  onValueChange={(value) => handleToggle('important_enabled', value)}
                  disabled={isUpdating}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <Text style={styles.caption}>{t('settings.notifications.importantCaption')}</Text>
            </>
          )}
          <View style={styles.divider} />
          <Text style={styles.caption}>{t('settings.notifications.quietHours')}</Text>
          {permissionBlocked ? (
            <Text style={styles.caption}>{t('settings.notifications.permissionBlocked')}</Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  caption: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
