import { StyleSheet, Text, View } from 'react-native';
import type { MealPeriodBreakdown, MealPeriodComparison } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  entries: MealPeriodBreakdown[];
  comparison?: MealPeriodComparison[] | null;
}

export function MealPeriodBreakdown({ entries, comparison }: Props) {
  const { t } = useTranslation();
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const comparisonLookup = new Map((comparison ?? []).map((item) => [item.key, item]));

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('mealDistribution.heading')}</Text>
      {entries.map((entry) => {
        const comparisonEntry = comparisonLookup.get(entry.key);
        return (
          <View key={entry.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.label}>{mealLabel(entry.key, t)}</Text>
              <Text style={styles.value}>{total > 0 ? `${entry.percent}%` : '-'}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(entry.percent, 100)}%` }]} />
            </View>
            {comparisonEntry ? (
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonLabel}>{t('mealDistribution.previous')}:</Text>
                <Text style={styles.comparisonValue}>{`${comparisonEntry.previousPercent}%`}</Text>
                <Text
                  style={[
                    styles.delta,
                    comparisonEntry.deltaPercent > 0
                      ? styles.deltaPositive
                      : comparisonEntry.deltaPercent < 0
                      ? styles.deltaNegative
                      : null,
                  ]}
                >
                  {formatPercentDelta(comparisonEntry.deltaPercent)}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
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

function formatPercentDelta(delta: number) {
  if (delta === 0) {
    return '±0%';
  }
  return `${delta > 0 ? '+' : ''}${delta}%`;
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
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  comparisonLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  comparisonValue: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  delta: {
    ...textStyles.caption,
    marginLeft: 'auto',
    color: colors.textSecondary,
  },
  deltaPositive: {
    color: colors.error,
  },
  deltaNegative: {
    color: colors.success,
  },
});
