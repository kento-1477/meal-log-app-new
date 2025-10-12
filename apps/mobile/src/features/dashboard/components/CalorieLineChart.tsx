import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line as SvgLine, Path, Circle } from 'react-native-svg';
import { line, curveMonotoneX } from 'd3-shape';
import type { ChartPoint } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { hasSufficientChartData } from './chartGuards';

interface Props {
  points: ChartPoint[];
  target: number;
}

const CHART_HEIGHT = 160;
const PADDING = 12;

export function CalorieLineChart({ points, target }: Props) {
  const [width, setWidth] = useState(0);
  const { t } = useTranslation();

  const canRenderSeries = hasSufficientChartData(points);

  const { pathData, coordinates, targetY, maxValue } = useMemo(() => {
    if (!canRenderSeries || width === 0) {
      return { pathData: null, coordinates: [], targetY: 0, maxValue: 0 };
    }

    const maxPoint = Math.max(target, ...points.map((p) => p.value));
    const effectiveMax = maxPoint === 0 ? 1 : maxPoint;
    const chartWidth = width - PADDING * 2;

    const generator = line<ChartPoint>()
      .x((_point, index) => (points.length === 1 ? chartWidth / 2 + PADDING : PADDING + (index / (points.length - 1)) * chartWidth))
      .y((point) => CHART_HEIGHT - (point.value / effectiveMax) * (CHART_HEIGHT - PADDING * 2) - PADDING)
      .curve(curveMonotoneX);

    const path = generator(points);
    const coords = points.map((point, index) => ({
      x: points.length === 1 ? chartWidth / 2 + PADDING : PADDING + (index / (points.length - 1)) * chartWidth,
      y: CHART_HEIGHT - (point.value / effectiveMax) * (CHART_HEIGHT - PADDING * 2) - PADDING,
      value: point.value,
      label: point.label,
    }));

    const targetLineY = CHART_HEIGHT - (target / effectiveMax) * (CHART_HEIGHT - PADDING * 2) - PADDING;

    return { pathData: path, coordinates: coords, targetY: targetLineY, maxValue: effectiveMax };
  }, [canRenderSeries, points, target, width]);

  const shouldRenderChart = width > 0 && canRenderSeries && maxValue > 0 && Boolean(pathData);

  return (
    <View>
      <View style={styles.chartContainer} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {shouldRenderChart ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {target > 0 && (
              <SvgLine
                x1={PADDING}
                x2={width - PADDING}
                y1={targetY}
                y2={targetY}
                stroke={colors.textSecondary}
                strokeDasharray="6 6"
                strokeWidth={1}
              />
            )}
            {pathData && (
              <Path d={pathData} stroke={colors.accent} strokeWidth={3} fill="none" />
            )}
            <G>
              {coordinates.map((coord, index) => (
                <Circle key={`${coord.label}-${index}`} cx={coord.x} cy={coord.y} r={4} fill={colors.accent} />
              ))}
            </G>
          </Svg>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.placeholder}>{t('chart.placeholder.insufficientData')}</Text>
          </View>
        )}
      </View>
      {canRenderSeries && (
        <View style={styles.labelsRow}>
          {points.map((point) => (
            <Text key={point.isoDate} style={styles.labelText}>
              {point.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    height: CHART_HEIGHT,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
  },
  emptyChart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  labelText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    minWidth: 48,
    textAlign: 'center',
  },
});
