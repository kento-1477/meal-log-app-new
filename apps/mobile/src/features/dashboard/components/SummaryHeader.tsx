import { StyleSheet, Text, View } from 'react-native';
import type { FormattedMacros } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  remaining: FormattedMacros | null;
  totals: FormattedMacros | null;
}

export function SummaryHeader({ remaining, totals }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <Text style={styles.title}>{t('dashboard.summary.remainingToday')}</Text>
        <View style={styles.row}>
          <SummaryChip label="kcal" value={remaining?.calories ?? 0} accent={colors.accent} />
          <SummaryChip label="P" value={remaining?.protein_g ?? 0} accent="#ff9f0a" />
          <SummaryChip label="F" value={remaining?.fat_g ?? 0} accent="#ff453a" />
          <SummaryChip label="C" value={remaining?.carbs_g ?? 0} accent="#bf5af2" />
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

interface ChipProps {
  label: string;
  value: number;
  accent: string;
  subdued?: boolean;
}

function SummaryChip({ label, value, accent, subdued }: ChipProps) {
  return (
    <View style={[styles.chip, { borderColor: subdued ? colors.border : accent }] }>
      <Text style={[styles.chipLabel, { color: subdued ? colors.textSecondary : accent }]}>{label}</Text>
      <Text style={[styles.chipValue, { color: subdued ? colors.textPrimary : accent }]}>{formatValue(value, label)}</Text>
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
    minWidth: 72,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
