import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { arc, pie } from 'd3-shape';
import type { MacroStat } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  macros: MacroStat[];
}

const SIZE = 160;
const INNER_RADIUS = 48;
const OUTER_RADIUS = 72;

const MACRO_COLORS: Record<MacroStat['key'], string> = {
  protein_g: '#ff9f0a',
  fat_g: '#ff453a',
  carbs_g: '#bf5af2',
};

export function PFCDonutChart({ macros }: Props) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    const total = macros.reduce((sum, item) => sum + item.actual, 0);
    return macros.map((item) => ({
      key: item.key,
      value: item.actual,
      ratio: total > 0 ? Math.round((item.actual / total) * 100) : 0,
    }));
  }, [macros]);

  const arcs = useMemo(() => {
    const pieGenerator = pie<{ key: MacroStat['key']; value: number }>()
      .value((item) => item.value)
      .sort(null);
    return pieGenerator(chartData);
  }, [chartData]);

  const arcGenerator = useMemo(() => arc<any>().innerRadius(INNER_RADIUS).outerRadius(OUTER_RADIUS), []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('macros.donut.title')}</Text>
      <View style={styles.contentRow}>
        <Svg width={SIZE} height={SIZE}>
          <G x={SIZE / 2} y={SIZE / 2}>
            {arcs.map((segment, index) => {
              const path = arcGenerator(segment);
              if (!path) {
                return null;
              }
              return (
                <Path
                  key={chartData[index]?.key ?? index}
                  d={path}
                  fill={MACRO_COLORS[chartData[index]?.key ?? 'protein_g']}
                />
              );
            })}
          </G>
        </Svg>
        <View style={styles.legend}>
          {chartData.map((item) => (
            <View key={item.key} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: MACRO_COLORS[item.key] }]} />
              <View style={styles.legendTextBlock}>
                <Text style={styles.legendLabel}>{macroLabel(item.key, t)}</Text>
                <Text style={styles.legendValue}>{`${item.value.toFixed(1)} g (${item.ratio}%)`}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function macroLabel(
  key: MacroStat['key'],
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

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendTextBlock: {
    gap: spacing.xs,
  },
  legendLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  legendValue: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
