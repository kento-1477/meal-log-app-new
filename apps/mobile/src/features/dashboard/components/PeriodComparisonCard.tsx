import { StyleSheet, Text, View } from 'react-native';
import type { PeriodComparison } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  comparison: PeriodComparison;
}

export function PeriodComparisonCard({ comparison }: Props) {
  const { t } = useTranslation();
  const heading = t('comparison.heading', { period: t(comparison.previousLabelKey) });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>{t('comparison.current')}</Text>
          <Text style={styles.summaryValue}>{formatKcal(comparison.totals.current)}</Text>
        </View>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>{t('comparison.previous')}</Text>
          <Text style={styles.summaryValueSecondary}>{formatKcal(comparison.totals.previous)}</Text>
        </View>
        <View style={styles.deltaBlock}>
          <Text
            style={[
              styles.deltaValue,
              comparison.totals.delta > 0 ? styles.deltaPositive : comparison.totals.delta < 0 ? styles.deltaNegative : null,
            ]}
          >
            {`${signedValue(comparison.totals.delta)} kcal`}
          </Text>
          <Text
            style={[
              styles.deltaPercent,
              comparison.totals.deltaPercent > 0
                ? styles.deltaPositive
                : comparison.totals.deltaPercent < 0
                ? styles.deltaNegative
                : null,
            ]}
          >
            {t('comparison.percentChange', { value: signedValue(comparison.totals.deltaPercent) })}
          </Text>
        </View>
      </View>
      <View style={styles.macroRow}>
        {comparison.macros.map((macro) => (
          <View key={macro.key} style={styles.macroCard}>
            <Text style={styles.macroLabel}>{macroLabel(macro.key, t)}</Text>
            <Text style={styles.macroValue}>{`${macro.current} g`}</Text>
            <Text style={styles.macroPrevious}>{`${macro.previous} g`}</Text>
            <Text
              style={[
                styles.macroDelta,
                macro.delta > 0 ? styles.deltaPositive : macro.delta < 0 ? styles.deltaNegative : null,
              ]}
            >
              {t('comparison.macroDelta', { delta: signedValue(macro.delta) })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function macroLabel(
  key: PeriodComparison['macros'][number]['key'],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (key) {
    case 'protein_g':
      return t('macro.protein');
    case 'fat_g':
      return t('macro.fat');
    case 'carbs_g':
    default:
      return t('macro.carbs');
  }
}

function signedValue(value: number) {
  return value === 0 ? '0' : value > 0 ? `+${roundValue(value)}` : `${roundValue(value)}`;
}

function roundValue(value: number) {
  return Math.round(value * 10) / 10;
}

function formatKcal(value: number) {
  return `${Math.round(value)} kcal`;
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...textStyles.titleSmall,
    color: colors.textPrimary,
  },
  summaryValueSecondary: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  deltaBlock: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  deltaValue: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deltaPercent: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  deltaPositive: {
    color: colors.error,
  },
  deltaNegative: {
    color: colors.success,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  macroLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macroValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  macroPrevious: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macroDelta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
