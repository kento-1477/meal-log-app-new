import { DateTime } from 'luxon';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles, fontFamilies } from '@/theme/typography';
import { getIntlLocale, useTranslation } from '@/i18n';

export type MonthlyBar = {
  day: number;
  intakeKcal: number | null;
  targetKcal: number;
  isToday: boolean;
  rawDate?: string;
};

interface MonthlyCalorieChartProps {
  days: MonthlyBar[];
  startDate: string;
  endDate: string;
  averageCalories: number | null;
}

const MAX_RATIO = 1.2;
const CHART_HEIGHT = 120;
const TARGET_LINE_WIDTH = 1.5;

function normalizeHeight(value: number | null, target: number) {
  if (value == null) {
    return 0.12;
  }
  if (target <= 0) {
    return 0;
  }
  const ratio = Math.min(value / target, MAX_RATIO);
  return ratio / MAX_RATIO;
}

export const MonthlyCalorieChart = memo(({ days, startDate, endDate, averageCalories }: MonthlyCalorieChartProps) => {
  const today = useMemo(() => DateTime.now().startOf('day'), []);
  const { t, locale } = useTranslation();
  const intlLocale = getIntlLocale(locale);
  const labels = buildAxisLabels(days.length, startDate);
  const targetLineOffset = spacing.xs + CHART_HEIGHT - CHART_HEIGHT * (1 / MAX_RATIO);
  const rangeLabel = useMemo(() => {
    const from = DateTime.fromISO(startDate).setLocale(intlLocale).toLocaleString(DateTime.DATE_MED);
    const to = DateTime.fromISO(endDate).setLocale(intlLocale).toLocaleString(DateTime.DATE_MED);
    return t('dashboard.chart.rangeLabel', { from, to });
  }, [startDate, endDate, intlLocale, t]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.summaryLabel}>{t('dashboard.chart.averageLabel')}</Text>
          <Text style={styles.summaryValue}>
            {averageCalories != null ? `${averageCalories.toLocaleString()} kcal` : '-- kcal'}
          </Text>
        </View>
        <Text style={styles.rangeText}>{rangeLabel}</Text>
      </View>
      <View style={styles.chartCard}>
        <View style={styles.chartArea}>
          <View pointerEvents="none" style={[styles.targetLineLayer, { top: targetLineOffset }]} />
          <View style={styles.barRow}>
            {days.map((day) => {
              const height = normalizeHeight(day.intakeKcal, day.targetKcal) * CHART_HEIGHT;
              const bgColor = pickBarColor(day);
              const isFuture = day.rawDate ? DateTime.fromISO(day.rawDate).startOf('day') > today : false;
              return (
                <View key={`month-bar-${day.day}`} style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(height, 8),
                        backgroundColor: bgColor,
                        opacity: day.intakeKcal == null || isFuture ? 0.35 : 1,
                      },
                    ]}
                  />
                  {day.isToday ? <View style={styles.todayHalo} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.axisRow}>
        {labels.map((label) => {
          const percent = label.offset / Math.max(1, days.length - 1);
          const translateX = percent === 0 ? 0 : percent === 1 ? -24 : -16;
          return (
            <Text
              key={label.key}
              style={[
                styles.axisLabel,
                {
                  position: 'absolute',
                  left: `${percent * 100}%`,
                  transform: [{ translateX }],
                },
              ]}
            >
              {label.text}
            </Text>
          );
        })}
      </View>
    </View>
  );
});

function pickBarColor(day: MonthlyBar) {
  if (day.intakeKcal == null) {
    return colors.border;
  }
  if (day.intakeKcal >= day.targetKcal) {
    return '#ff8a3d';
  }
  return '#4b7bec';
}

function buildAxisLabels(length: number, startIso: string) {
  const start = DateTime.fromISO(startIso);
  const labels: Array<{ key: string; text: string; offset: number }> = [];
  const step = 7;
  for (let offset = 0; offset < length; offset += step) {
    const date = start.plus({ days: offset });
    labels.push({
      key: `label-${offset}`,
      text: date.toFormat('M/d'),
      offset,
    });
  }
  const lastOffset = length - 1;
  const lastDate = start.plus({ days: lastOffset });
  if (labels.length === 0) {
    labels.push({ key: 'label-0', text: lastDate.toFormat('M/d'), offset: lastOffset });
  } else {
    const prev = labels[labels.length - 1];
    if (lastOffset - prev.offset < step / 2) {
      labels[labels.length - 1] = {
        key: `label-${lastOffset}`,
        text: lastDate.toFormat('M/d'),
        offset: lastOffset,
      };
    } else if (prev.offset !== lastOffset) {
      labels.push({
        key: `label-${lastOffset}`,
        text: lastDate.toFormat('M/d'),
        offset: lastOffset,
      });
    }
  }
  return labels;
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...textStyles.titleMedium,
    fontFamily: fontFamilies.semibold,
  },
  rangeText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  chartCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(75, 123, 236, 0.08)',
    padding: spacing.sm,
  },
  chartArea: {
    height: CHART_HEIGHT + 16,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    position: 'relative',
  },
  targetLineLayer: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    borderBottomWidth: TARGET_LINE_WIDTH,
    borderBottomColor: '#9aa5c5',
    borderStyle: 'dashed',
    zIndex: 2,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    paddingHorizontal: spacing.xs,
    position: 'relative',
    zIndex: 1,
  },
  barSlot: {
    flex: 1,
    marginHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 999,
  },
  todayHalo: {
    position: 'absolute',
    top: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFD54F',
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  axisLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});

MonthlyCalorieChart.displayName = 'MonthlyCalorieChart';
