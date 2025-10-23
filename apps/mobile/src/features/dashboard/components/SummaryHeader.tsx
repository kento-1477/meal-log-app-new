import { StyleSheet, Text, View } from 'react-native';
import type { DashboardSummary, DashboardTargets } from '@meal-log/shared';
import type { FormattedMacros } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  remaining: FormattedMacros | null;
  totals: FormattedMacros | null;
  targets: DashboardTargets;
  summary: DashboardSummary;
}

export function SummaryHeader({ remaining, totals, targets, summary }: Props) {
  const { t } = useTranslation();
  
  // 現在の摂取量を計算（目標 - 残り）
  const currentIntake = {
    calories: (targets.calories ?? 0) - (remaining?.calories ?? 0),
    protein_g: (summary.macros.targets.protein_g ?? 0) - (remaining?.protein_g ?? 0),
    fat_g: (summary.macros.targets.fat_g ?? 0) - (remaining?.fat_g ?? 0),
    carbs_g: (summary.macros.targets.carbs_g ?? 0) - (remaining?.carbs_g ?? 0),
  };
  
  // パーセンテージを計算
  const percentages = {
    calories: calcPercentage(currentIntake.calories, targets.calories ?? 0),
    protein_g: calcPercentage(currentIntake.protein_g, summary.macros.targets.protein_g ?? 0),
    fat_g: calcPercentage(currentIntake.fat_g, summary.macros.targets.fat_g ?? 0),
    carbs_g: calcPercentage(currentIntake.carbs_g, summary.macros.targets.carbs_g ?? 0),
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <Text style={styles.title}>{t('dashboard.summary.remainingToday')}</Text>
        <View style={styles.row}>
          <SummaryChip label="kcal" value={remaining?.calories ?? 0} accent={colors.accent} percentage={percentages.calories} />
          <SummaryChip label="P" value={remaining?.protein_g ?? 0} accent="#ff9f0a" percentage={percentages.protein_g} />
          <SummaryChip label="F" value={remaining?.fat_g ?? 0} accent="#ff453a" percentage={percentages.fat_g} />
          <SummaryChip label="C" value={remaining?.carbs_g ?? 0} accent="#bf5af2" percentage={percentages.carbs_g} />
        </View>
      </View>
      <View style={styles.block}>
        <Text style={styles.title}>{t('dashboard.summary.periodTotal')}</Text>
        <View style={styles.row}>
          <SummaryChip label="kcal" value={totals?.calories ?? 0} accent={colors.textPrimary} subdued />
          <SummaryChip label="P" value={totals?.protein_g ?? 0} accent={colors.textPrimary} subdued />
          <SummaryChip label="F" value={totals?.fat_g ?? 0} accent={colors.textPrimary} subdued />
          <SummaryChip label="C" value={totals?.carbs_g ?? 0} accent={colors.textPrimary} subdued />
        </View>
      </View>
    </View>
  );
}

function calcPercentage(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.round((current / target) * 100);
}

interface ChipProps {
  label: string;
  value: number;
  accent: string;
  subdued?: boolean;
  percentage?: number;
}

function SummaryChip({ label, value, accent, subdued, percentage }: ChipProps) {
  return (
    <View style={[styles.chip, { borderColor: subdued ? colors.border : accent }] }>
      <Text style={[styles.chipLabel, { color: subdued ? colors.textSecondary : accent }]}>{label}</Text>
      <Text style={[styles.chipValue, { color: subdued ? colors.textPrimary : accent }]}>
        {percentage !== undefined ? `${percentage}%` : formatValue(value, label)}
      </Text>
    </View>
  );
}

function formatValue(value: number, label: string) {
  const decimals = label === 'kcal' ? 0 : 1;
  return value.toFixed(decimals);
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  title: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipValue: {
    fontSize: 20,
    fontWeight: '700',
  },
});
