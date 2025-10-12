import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MealLogSummary } from '@meal-log/shared';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  logs: MealLogSummary[];
}

export function RecentLogsList({ logs }: Props) {
  const router = useRouter();
  const { t } = useTranslation();

  if (!logs.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('recentLogs.heading')}</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('recentLogs.empty')}</Text>
          <TouchableOpacity style={styles.cta} onPress={() => router.push('/(tabs)/chat')}>
            <Text style={styles.ctaLabel}>{t('button.record')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{t('recentLogs.heading')}</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/chat')}>
          <Text style={styles.secondaryCta}>{t('recentLogs.addMore')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {logs.map((log) => (
          <TouchableOpacity key={log.id} style={styles.item} onPress={() => router.push(`/log/${log.id}`)}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{log.dish}</Text>
              <Text style={styles.itemCalories}>{Math.round(log.calories)} kcal</Text>
            </View>
            <View style={styles.macrosRow}>
              <Text style={styles.macroLabel}>{t('macro.protein')}: {log.protein_g} g</Text>
              <Text style={styles.macroLabel}>{t('macro.fat')}: {log.fat_g} g</Text>
              <Text style={styles.macroLabel}>{t('macro.carbs')}: {log.carbs_g} g</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemCalories: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  macroLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  ctaLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryCta: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
});
