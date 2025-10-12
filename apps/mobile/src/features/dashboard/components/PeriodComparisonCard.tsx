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
  const heading = t('comparison.heading', { period: t(comparison.referenceLabelKey) });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>{t('comparison.current')}</Text>
          <Text style={styles.summaryValue}>{formatKcal(comparison.totals.current)}</Text>
        </View>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>{t('comparison.target')}</Text>
          <Text style={styles.summaryValueSecondary}>{formatKcal(comparison.totals.target)}</Text>
        </View>
        <View style={styles.deltaBlock}>
          <Text
            style={[
              styles.deltaValue,
              comparison.totals.delta > 0 ? styles.deltaPositive : comparison.totals.delta < 0 ? styles.deltaNegative : null,
            ]}
          >
            {formatDeltaKcal(comparison.totals.delta)}
          </Text>
          <Text
            style={[
              styles.deltaPercent,
              comparison.totals.percentOfTarget > 100
                ? styles.deltaPositive
                : comparison.totals.percentOfTarget < 100
                ? styles.deltaNegative
                : null,
            ]}
          >
            {t('comparison.percentOfTarget', { value: percentString(comparison.totals.percentOfTarget) })}
          </Text>
        </View>
      </View>
      <View style={styles.macroRow}>
        {comparison.macros.map((macro) => (
          <View key={macro.key} style={styles.macroCard}>
            <Text style={styles.macroLabel}>{macroLabel(macro.key, t)}</Text>
            <Text style={styles.macroValue}>{formatGrams(macro.current)}</Text>
            <Text style={styles.macroTarget}>{formatTarget(macro.target)}</Text>
            <Text
              style={[
                styles.macroDelta,
                macro.delta > 0 ? styles.deltaPositive : macro.delta < 0 ? styles.deltaNegative : null,
              ]}
            >
              {t('comparison.macroDelta', { delta: signedValue(macro.delta) })}
            </Text>
            <Text
              style={[
                styles.macroPercent,
                macro.percentOfTarget > 100
                  ? styles.deltaPositive
                  : macro.percentOfTarget < 100
                  ? styles.deltaNegative
                  : null,
              ]}
            >
              {t('comparison.percentOfTarget', { value: percentString(macro.percentOfTarget) })}
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

const roundValue = (value: number) => Math.round(value * 10) / 10;

const formatKcal = (value: number) => `${Math.round(value)} kcal`;

const formatDeltaKcal = (value: number) => `${signedValue(value)} kcal`;

const formatGrams = (value: number) => `${roundValue(value)} g`;

const formatTarget = (value: number) => `${roundValue(value)} g`;

const percentString = (value: number) => `${roundValue(value)}%`;

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
  macroTarget: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macroDelta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macroPercent: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
