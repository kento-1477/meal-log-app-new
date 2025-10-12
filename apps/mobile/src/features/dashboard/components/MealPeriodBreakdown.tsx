import { StyleSheet, Text, View } from 'react-native';
import type { MealPeriodBreakdown } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  entries: MealPeriodBreakdown[];
}

export function MealPeriodBreakdown({ entries }: Props) {
  const { t } = useTranslation();
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('mealDistribution.heading')}</Text>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.label}>{mealLabel(entry.key, t)}</Text>
            <Text style={styles.value}>{total > 0 ? `${entry.percent}%` : '-'}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(entry.percent, 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function mealLabel(
  key: MealPeriodBreakdown['key'],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (key) {
    case 'breakfast':
      return t('meal.breakfast');
    case 'lunch':
      return t('meal.lunch');
    case 'dinner':
      return t('meal.dinner');
    case 'snack':
      return t('meal.snack');
    case 'unknown':
    default:
      return t('meal.unknown');
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  heading: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  value: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    flex: 1,
    backgroundColor: colors.accent,
  },
});
