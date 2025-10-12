import { colors } from '@/theme/colors';

export type RingUnit = 'g' | 'kcal';
export type RingColorToken = 'ringProtein' | 'ringCarb' | 'ringFat' | 'ringKcal';
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface RingInput {
  label: string;
  current: number;
  target: number;
  unit: RingUnit;
  colorToken: RingColorToken;
}

export interface RingState {
  currentText: string;
  targetText: string;
  deltaText: string;
  progress: number;
  ringColor: string;
  trackColor: string;
  accessibilityLabel: string;
  status: 'left' | 'over' | 'no-target';
}

export const MIN_ARC_PROGRESS = 0.03;
export const MAX_ARC_PROGRESS = 0.98;

export function buildRingState(data: RingInput, t: TranslateFn): RingState {
  const safeCurrent = Math.max(0, data.current);
  const safeTarget = Math.max(0, data.target);
  const roundedCurrent = Math.round(safeCurrent);
  const roundedTarget = Math.round(safeTarget);
  const hasTarget = safeTarget > 0;
  const unit = data.unit;

  const deltaRounded = hasTarget ? Math.round(safeTarget - safeCurrent) : 0;
  const status: 'left' | 'over' | 'no-target' = !hasTarget
    ? 'no-target'
    : deltaRounded >= 0
      ? 'left'
      : 'over';

  const currentText = `${roundedCurrent}`;
  const targetText = `${roundedTarget} ${unit}`;

  const deltaText = !hasTarget
    ? t('rings.no_target')
    : t(status === 'over' ? 'rings.over' : 'rings.left', {
        value: Math.abs(deltaRounded),
        unit,
      });

  const statusLabel = !hasTarget
    ? t('rings.no_target')
    : t(status === 'over' ? 'status.over' : 'status.under');

  const accessibilityLabel = !hasTarget
    ? t('rings.accessibleNoTarget', {
        label: data.label,
        current: roundedCurrent,
        unit,
      })
    : t('rings.accessible', {
        label: data.label,
        current: roundedCurrent,
        target: roundedTarget,
        delta: deltaRounded,
        unit,
        status: statusLabel,
      });

  let ringColor = hasTarget ? colors[data.colorToken] : colors.ringInactive;
  if (status === 'over') {
    if (data.colorToken === 'ringProtein') {
      ringColor = colors.success;
    } else {
      ringColor = colors.error;
    }
  }

  return {
    currentText,
    targetText,
    deltaText,
    progress: computeProgress(safeCurrent, safeTarget),
    ringColor,
    trackColor: hasTarget ? colors.border : colors.ringInactive,
    accessibilityLabel,
    status,
  };
}

export function computeProgress(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return current / target;
}
