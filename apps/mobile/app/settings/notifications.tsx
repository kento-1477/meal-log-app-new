import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';

export default function NotificationsScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('settings.notifications.screenTitle')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.notifications.reminder')}</Text>
            <Switch value={false} disabled trackColor={{ false: colors.border, true: colors.accent }} />
          </View>
          <Text style={styles.caption}>{t('settings.notifications.comingSoon')}</Text>
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
  label: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  caption: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
