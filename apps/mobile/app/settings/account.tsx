import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { useChatStore } from '@/store/chat';
import { logout, deleteAccount } from '@/services/api';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const resetChat = useChatStore((state) => state.reset);

  const logoutMutation = useMutation({
    mutationFn: async () => logout(),
    onSuccess: () => {
      setUsage(null);
      setUser(null);
      resetChat();
      router.replace('/login');
    },
    onError: () => {
      Alert.alert(t('settings.account.logoutError'));
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => deleteAccount(),
    onSuccess: () => {
      setUsage(null);
      setUser(null);
      resetChat();
      router.replace('/login');
      Alert.alert(t('settings.account.deleteSuccessTitle'), t('settings.account.deleteSuccessMessage'));
    },
    onError: () => {
      Alert.alert(t('settings.account.deleteErrorTitle'), t('settings.account.deleteErrorMessage'));
    },
  });

  const confirmDeleteAccount = () => {
    Alert.alert(t('settings.account.deleteTitle'), t('settings.account.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.account.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteAccountMutation.mutate(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('settings.section.account')}</Text>
        <Text style={styles.caption}>{t('settings.account.screenDescription')}</Text>
        <View style={styles.detailCard}>
          <Text style={styles.label}>{t('settings.account.email')}</Text>
          <Text style={styles.value}>{user?.email ?? t('settings.account.guest')}</Text>
        </View>
        <View style={styles.buttonColumn}>
          <TouchableOpacity
            style={[styles.primaryButton, logoutMutation.isPending && styles.primaryButtonDisabled]}
            onPress={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <Text style={styles.primaryButtonLabel}>{t('settings.account.logout')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.destructiveButton, deleteAccountMutation.isPending && styles.destructiveButtonDisabled]}
            onPress={confirmDeleteAccount}
            disabled={deleteAccountMutation.isPending}
          >
            <Text style={styles.destructiveButtonLabel}>{t('settings.account.deleteAccount')}</Text>
          </TouchableOpacity>
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
  caption: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  value: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  buttonColumn: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  destructiveButton: {
    borderRadius: 18,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
  destructiveButtonDisabled: {
    opacity: 0.6,
  },
  destructiveButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
