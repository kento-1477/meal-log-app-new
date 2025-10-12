import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import {
  buildRingState,
  type RingInput,
  type TranslateFn,
} from './ringMath';

const LARGE_RING_SIZE = 140;
const LARGE_STROKE_WIDTH = 12;
const SMALL_RING_SIZE = 110;
const SMALL_STROKE_WIDTH = 9;

export type { RingColorToken } from './ringMath';
export type MacroRingProps = RingInput;

interface RemainingRingsProps {
  total: MacroRingProps;
  macros: MacroRingProps[];
}

export function RemainingRings({ total, macros }: RemainingRingsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <RingCard data={total} variant="large" t={t} />
      <View style={styles.macroRow}>
        {macros.map((macro) => (
          <RingCard key={macro.label} data={macro} variant="small" t={t} />
        ))}
      </View>
    </View>
  );
}

type RingCardVariant = 'large' | 'small';

interface RingCardProps {
  data: MacroRingProps;
  variant: RingCardVariant;
  t: TranslateFn;
}

function RingCard({ data, variant, t }: RingCardProps) {
  const state = buildRingState(data, t);
  const size = variant === 'large' ? LARGE_RING_SIZE : SMALL_RING_SIZE;
  const strokeWidth =
    variant === 'large' ? LARGE_STROKE_WIDTH : SMALL_STROKE_WIDTH;
  const isLarge = variant === 'large';

  const percentage = Math.round(state.progress * 100);

  return (
    <View
      style={[styles.card, isLarge ? styles.largeCard : styles.smallCard]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={state.accessibilityLabel}
    >
      <Text style={styles.cardLabel}>{data.label}</Text>
      <View style={styles.ringWrapper}>
        <Ring
          size={size}
          strokeWidth={strokeWidth}
          progress={state.progress}
          color={state.ringColor}
          trackColor={state.trackColor}
        />
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.percentText, isLarge && styles.percentTextLarge]}>
            {percentage}%
          </Text>
        </View>
      </View>
      <View style={styles.bottomContainer}>
        <Text style={[styles.ratioValue, isLarge && styles.ratioValueLarge]}>
          {state.currentText} / {state.targetText}
        </Text>
        <Text
          style={[
            styles.deltaText,
            state.status === 'over' && styles.deltaTextOver,
          ]}
        >
          {state.deltaText}
        </Text>
      </View>
    </View>
  );
}

interface RingProps {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
}

function Ring({ size, strokeWidth, progress, color, trackColor }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp(progress, 0, 1);
  const dashOffset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {clamped > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </Svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  largeCard: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  smallCard: {
    flex: 1,
  },
  cardLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  ringWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  percentTextLarge: {
    ...textStyles.headline,
  },
  bottomContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratioValue: {
    ...textStyles.body,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  ratioValueLarge: {
    ...textStyles.titleSmall,
  },
  deltaText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  deltaTextOver: {
    color: colors.error,
    fontWeight: '600',
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
