import { StyleSheet, Text, View } from 'react-native';
import type { MacroComparison, MacroStat } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  macros: MacroStat[];
  comparison?: MacroComparison[] | null;
}

export function MacroProgressList({ macros, comparison }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {macros.map((item) => {
        const comparisonEntry = comparison?.find((entry) => entry.key === item.key);
        return (
          <View key={item.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.label}>{macroLabel(item.key, t)}</Text>
              <View style={styles.rowHeaderRight}>
                <Text style={styles.value}>{`${item.actual} / ${item.target} g`}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(item.percent, 120)}%`,
                    backgroundColor: item.percent > 110 ? colors.error : colors.accent,
                  },
                ]}
              />
            </View>
            <View style={styles.metaRow}>
              <Text
                style={[styles.delta, item.delta > 0 ? styles.deltaPositive : item.delta < 0 ? styles.deltaNegative : null]}
              >
                {formatDelta(item.delta)}
              </Text>
              {comparisonEntry ? (
                <Text
                  style={[
                    styles.comparison,
                    comparisonEntry.delta > 0 ? styles.deltaPositive : comparisonEntry.delta < 0 ? styles.deltaNegative : null,
                  ]}
                >
                  {t('comparison.macroDelta', {
                    delta: formatSigned(comparisonEntry.delta),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function macroLabel(key: MacroStat['key'], t: (key: string, params?: Record<string, string | number>) => string) {
  if (key === 'protein_g') return t('macro.protein');
  if (key === 'fat_g') return t('macro.fat');
  if (key === 'carbs_g') return t('macro.carbs');
  return key;
}

function formatDelta(delta: number) {
  if (delta === 0) {
    return '±0 g';
  }
  return `${delta > 0 ? '+' : ''}${delta} g`;
}

function formatSigned(value: number) {
  if (value === 0) {
    return '0';
  }
  return value > 0 ? `+${value}` : `${value}`;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowHeaderRight: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'baseline',
  },
  label: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  value: {
    ...textStyles.caption,
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
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  delta: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  deltaPositive: {
    color: colors.error,
  },
  deltaNegative: {
    color: colors.success,
  },
  comparison: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
