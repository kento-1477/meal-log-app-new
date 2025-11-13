import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles, fontFamilies } from '@/theme/typography';
import type { CalorieChartMode } from '../useCalorieTrend';
import { DateTime } from 'luxon';

const CHART_HEIGHT = 220;
const PADDING = 16;
const TARGET_BAND_HEIGHT = 18;
const TOOLTIP_WIDTH = 152;

export interface CalorieChartPoint {
  date: string;
  label: string;
  value: number;
}

export interface CalorieChartConfig {
  colors: {
    over: string;
    under: string;
    todayUnder: string;
    todayOver: string;
    future: string;
    targetLine: string;
    targetBand: string;
  };
  bar: {
    thicknessDaily: number;
    thicknessMonthly: number;
    maxMonthly: number;
    borderRadius: number;
  };
  animation: {
    duration: number;
    easing: string;
  };
  label: {
    maxMonthlyLabels: number;
  };
}

export const defaultCalorieChartConfig: CalorieChartConfig = {
  colors: {
    over: colors.accent,
    under: '#4b7bec',
    todayUnder: '#5e8df5',
    todayOver: '#ff9d5c',
    future: colors.border,
    targetLine: 'rgba(120,120,120,0.9)',
    targetBand: 'rgba(120,120,120,0.08)',
  },
  bar: {
    thicknessDaily: 28,
    thicknessMonthly: 8,
    maxMonthly: 10,
    borderRadius: 6,
  },
  animation: {
    duration: 400,
    easing: 'easeOutCubic',
  },
  label: {
    maxMonthlyLabels: 12,
  },
};

interface Props {
  points: CalorieChartPoint[];
  target: number;
  mode: CalorieChartMode;
  config?: Partial<CalorieChartConfig>;
  isLoading?: boolean;
  isFetching?: boolean;
  emptyLabel: string;
  stats?: {
    totalDays: number;
    underTargetDays: number;
    overTargetDays: number;
  };
}

export function CalorieBarChart({ points, target, mode, config, isLoading, isFetching, emptyLabel, stats }: Props) {
  const [width, setWidth] = useState(0);
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationFrame = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const mergedConfig = useMemo(() => mergeConfig(config), [config]);
  const today = useMemo(() => DateTime.now().startOf('day'), []);

  useEffect(() => {
    setActiveIndex(null);
  }, [points, mode]);

  useEffect(() => {
    setAnimationProgress(0);
    const duration = 350;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / duration);
      setAnimationProgress(progress);
      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(tick);
      }
    };
    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [points, mode]);

  const chartData = useMemo(() => {
    if (width === 0 || points.length === 0) {
      return {
        bars: [],
        targetY: 0,
        hasValues: false,
        maxValue: 0,
        scaleMax: 1,
        baseline: CHART_HEIGHT - PADDING,
        usableHeight: CHART_HEIGHT - PADDING * 2,
      };
    }

    const maxPoint = Math.max(target, ...points.map((point) => point.value));
    const paddedMax = maxPoint <= 0 ? 1 : maxPoint * 1.2;
    const effectiveMax = Math.max(paddedMax, target * 1.15, 1);
    const innerPadding = mode === 'monthly' ? PADDING * 0.6 : PADDING;
    const topPadding = PADDING + 8;
    const bottomPadding = PADDING + 10;
    const chartWidth = width;
    const barArea = (chartWidth - innerPadding * 2) / points.length;
    const desiredThickness = mode === 'monthly' ? mergedConfig.bar.thicknessMonthly : mergedConfig.bar.thicknessDaily;
    const cappedThickness =
      mode === 'monthly'
        ? Math.min(desiredThickness, mergedConfig.bar.maxMonthly, Math.max(4, barArea * 0.9))
        : Math.min(desiredThickness, Math.max(4, barArea * 0.85));
    const barWidth = Math.max(4, cappedThickness);
    const baseline = CHART_HEIGHT - bottomPadding;
    const usableHeight = Math.max(40, CHART_HEIGHT - (topPadding + bottomPadding));

    const bars = points.map((point, index) => {
      const date = DateTime.fromISO(point.date);
      const isFuture = date.startOf('day') > today;
      const isToday = date.hasSame(today, 'day');
      const heightRaw = (point.value / effectiveMax) * usableHeight;
      const height = (isFuture ? Math.min(6, usableHeight * 0.1) : heightRaw) * animationProgress;
      const y = baseline - height;
      const widthForBar = isToday ? Math.min(barWidth + 4, barArea * 0.9) : barWidth;
      const offset = barArea > widthForBar ? (barArea - widthForBar) / 2 : 0;
      const x = innerPadding + index * barArea + offset;
      const centerX = x + widthForBar / 2;
      const isOverTarget = point.value >= target;
      return {
        index,
        x,
        y,
        width: widthForBar,
        height,
        value: point.value,
        label: point.label,
        centerX,
        baseline,
        isFuture,
        isToday,
        isOverTarget,
        date,
      };
    });

    const targetY = baseline - (target / effectiveMax) * usableHeight;

    return {
      bars,
      targetY,
      hasValues: points.some((point) => point.value > 0),
      maxValue: effectiveMax,
      scaleMax: effectiveMax,
      baseline,
      usableHeight,
    };
  }, [width, points, target, mode, mergedConfig, today, animationProgress]);

  const labelStep = useMemo(() => {
    if (mode !== 'monthly') {
      return 1;
    }
    if (points.length <= mergedConfig.label.maxMonthlyLabels) {
      return 1;
    }
    return Math.ceil(points.length / mergedConfig.label.maxMonthlyLabels);
  }, [mode, points.length, mergedConfig.label.maxMonthlyLabels]);

  const activeBar = activeIndex != null ? chartData.bars[activeIndex] : null;
  const targetVisible = target > 0 && chartData.maxValue > 0;

  const showEmptyState = !isLoading && width > 0 && (!points.length || !chartData.hasValues);
  const todayIso = today.toISODate();
  const completion = useMemo(() => {
    if (!stats || stats.totalDays === 0) {
      return { label: '達成 0日', percent: 0 };
    }
    const percent = Math.min(1, stats.underTargetDays / stats.totalDays);
    return {
      label: `達成 ${stats.underTargetDays}/${stats.totalDays}日 (${Math.round(percent * 100)}%)`,
      percent,
    };
  }, [stats]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.chartRow}>
        <View
          style={styles.graphArea}
          onLayout={(event) => {
            setWidth(event.nativeEvent.layout.width);
          }}
        >
          {isLoading && !chartData.hasValues ? (
            <View style={styles.loader}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}
          {!isLoading && showEmptyState ? (
            <View style={styles.loader}>
              <Text style={styles.placeholder}>{emptyLabel}</Text>
            </View>
          ) : null}
          {width > 0 && points.length > 0 ? (
            <>
              <Svg width={width} height={CHART_HEIGHT} onPress={() => setActiveIndex(null)}>
                {targetVisible && (
                  <>
                    {renderTargetBand(width, chartData.targetY, mergedConfig)}
                    <Line
                      x1={PADDING}
                      x2={width - PADDING}
                      y1={chartData.targetY}
                      y2={chartData.targetY}
                      stroke={mergedConfig.colors.targetLine}
                      strokeDasharray="6 6"
                      strokeWidth={1}
                    />
                  </>
                )}
                {chartData.bars.map((bar) => {
                  const barColor = bar.isFuture
                    ? mergedConfig.colors.future
                    : bar.isOverTarget
                      ? bar.isToday
                        ? mergedConfig.colors.todayOver
                        : mergedConfig.colors.over
                      : bar.isToday
                        ? mergedConfig.colors.todayUnder
                        : mergedConfig.colors.under;
                  const opacity = activeIndex === bar.index ? 0.95 : 1;
                  return (
                    <Rect
                      key={`${bar.index}-${bar.label}`}
                      x={bar.x}
                      y={bar.y}
                      width={Math.max(bar.width, 2)}
                      height={Math.max(bar.height, bar.isFuture ? 4 : 0)}
                      rx={mergedConfig.bar.borderRadius}
                      fill={barColor}
                      opacity={opacity}
                      onPressIn={() =>
                        setActiveIndex((current) => (current === bar.index ? null : bar.index))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${bar.label}, ${bar.value} kcal${
                        bar.isFuture ? '（予定日）' : ''
                      }`}
                    />
                  );
                })}
              </Svg>
              {targetVisible ? (
                <Text style={[styles.targetLabel, { top: Math.max(chartData.targetY - 26, 6), right: PADDING }]}>
                  目標 {target.toLocaleString()} kcal
                </Text>
              ) : null}
              {activeBar ? (
                <Tooltip
                  point={points[activeBar.index]}
                  target={target}
                  layoutWidth={width}
                  x={activeBar.centerX}
                  y={activeBar.y}
                />
              ) : null}
            </>
          ) : null}
          {isFetching && !isLoading ? (
            <View style={styles.fetchingIndicator}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.labelsRow}>
        <View style={styles.labelsWrapper}>
          {points.map((point, index) => {
            const { dateText, weekdayText } = splitLabel(point.label);
            const isFuture = DateTime.fromISO(point.date).startOf('day') > today;
            const showLabel =
              mode === 'monthly' ? shouldShowMonthlyLabel(index, points.length) : index % labelStep === 0;
            return (
              <View
                key={`${point.date}-${index}`}
                style={[styles.labelStack, mode === 'monthly' && styles.labelStackCompact]}
              >
                <Text
                  style={[
                    styles.labelDate,
                    mode === 'monthly' && styles.labelDateCompact,
                    isFuture && styles.futureLabel,
                    point.date === todayIso && styles.todayLabel,
                  ]}
                >
                  {showLabel ? dateText : ''}
                </Text>
                <Text
                  style={[
                    styles.labelWeekday,
                    mode === 'monthly' && styles.labelWeekdayCompact,
                    isFuture && styles.futureLabel,
                    point.date === todayIso && styles.todayLabel,
                  ]}
                >
                  {showLabel ? weekdayText : ''}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      {mode === 'monthly' && stats ? (
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>{completion.label}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  flex: Math.max(0.001, completion.percent),
                },
              ]}
            />
            <View style={{ flex: Math.max(0, 1 - completion.percent) }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function splitLabel(label: string) {
  const match = label.match(/(.+)\s\((.+)\)/);
  if (match) {
    return { dateText: match[1], weekdayText: match[2] };
  }
  const parts = label.split(' ');
  return { dateText: parts[0] ?? label, weekdayText: parts[1] ?? '' };
}

function shouldShowMonthlyLabel(index: number, total: number) {
  const dayNumber = index + 1;
  if (index === 0 || index === total - 1) {
    return true;
  }
  return dayNumber % 5 === 0;
}

function Tooltip({
  point,
  target,
  layoutWidth,
  x,
  y,
}: {
  point: CalorieChartPoint;
  target: number;
  layoutWidth: number;
  x: number;
  y: number;
}) {
  const diff = point.value - target;
  const diffText = diff === 0 ? '±0 kcal' : `${diff > 0 ? '+' : ''}${diff} kcal`;
  const diffColor = diff >= 0 ? colors.accent : colors.textSecondary;
  const clampedLeft = Math.min(Math.max(x - TOOLTIP_WIDTH / 2, 8), layoutWidth - TOOLTIP_WIDTH - 8);
  const top = Math.max(y - 56, 8);

  return (
    <View style={[styles.tooltip, { left: clampedLeft, top }]}>
      <Text style={styles.tooltipLabel}>{point.label}</Text>
      <Text style={styles.tooltipValue}>{point.value.toLocaleString()} kcal</Text>
      <Text style={[styles.tooltipDiff, { color: diffColor }]}>{diffText}</Text>
    </View>
  );
}

function renderTargetBand(width: number, targetY: number, config: CalorieChartConfig) {
  const maxBandHeight = Math.min(TARGET_BAND_HEIGHT, CHART_HEIGHT - PADDING * 2);
  const bandY = Math.min(Math.max(targetY - maxBandHeight / 2, PADDING), CHART_HEIGHT - PADDING - maxBandHeight);
  return (
    <Rect
      x={PADDING}
      y={bandY}
      width={width - PADDING * 2}
      height={maxBandHeight}
      fill={config.colors.targetBand}
    />
  );
}

function mergeConfig(config?: Partial<CalorieChartConfig>): CalorieChartConfig {
  if (!config) {
    return defaultCalorieChartConfig;
  }
  return {
    colors: { ...defaultCalorieChartConfig.colors, ...(config.colors ?? {}) },
    bar: { ...defaultCalorieChartConfig.bar, ...(config.bar ?? {}) },
    animation: { ...defaultCalorieChartConfig.animation, ...(config.animation ?? {}) },
    label: { ...defaultCalorieChartConfig.label, ...(config.label ?? {}) },
  };
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  graphArea: {
    flex: 1,
    height: CHART_HEIGHT,
    position: 'relative',
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  placeholder: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  labelsWrapper: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelStack: {
    alignItems: 'center',
    minWidth: 42,
  },
  labelStackCompact: {
    minWidth: 24,
  },
  labelDate: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  labelDateCompact: {
    fontSize: 11,
  },
  labelWeekday: {
    ...textStyles.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  labelWeekdayCompact: {
    fontSize: 10,
  },
  todayLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.medium,
  },
  futureLabel: {
    color: colors.textMuted,
  },
  targetLabel: {
    position: 'absolute',
    ...textStyles.caption,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    color: colors.textSecondary,
  },
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tooltipLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  tooltipValue: {
    ...textStyles.body,
    fontFamily: fontFamilies.semibold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  tooltipDiff: {
    ...textStyles.caption,
    fontFamily: fontFamilies.medium,
    marginTop: 2,
  },
  progressRow: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  progressLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fetchingIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});
