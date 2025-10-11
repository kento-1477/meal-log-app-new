import { DateTime } from 'luxon';
import type { DashboardSummary, DashboardTargets, DashboardPeriod } from '@meal-log/shared';

export interface ChartPoint {
  label: string;
  value: number;
  isoDate: string;
}

export interface MealPeriodBreakdown {
  key: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
  label: string;
  value: number;
  percent: number;
}

export interface MacroStat {
  key: 'protein_g' | 'fat_g' | 'carbs_g';
  label: string;
  actual: number;
  target: number;
  percent: number;
  delta: number;
}

export interface FormattedMacros {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface NutrientRow {
  key: string;
  label: string;
  unit: string;
  total: number;
  target: number;
  delta: number;
}

export interface MacroComparison {
  key: MacroStat['key'];
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
}

export interface MealPeriodComparison {
  key: MealPeriodBreakdown['key'];
  currentPercent: number;
  previousPercent: number;
  deltaPercent: number;
}

export interface PeriodComparison {
  previousLabelKey: string;
  totals: {
    current: number;
    previous: number;
    delta: number;
    deltaPercent: number;
  };
  macros: MacroComparison[];
  mealPeriods: MealPeriodComparison[];
}

export interface DashboardViewModel {
  summary: DashboardSummary;
  targets: DashboardTargets;
  header: {
    remaining: FormattedMacros;
    totals: FormattedMacros;
    delta: FormattedMacros;
  };
  calories: {
    points: ChartPoint[];
    targetLine: number;
    labels: string[];
    mealPeriodBreakdown: MealPeriodBreakdown[];
    hasData: boolean;
  };
  macros: Array<MacroStat>;
  nutrients: Array<NutrientRow>;
  comparison?: PeriodComparison | null;
}

export function buildViewModel(summary: DashboardSummary, targets: DashboardTargets): DashboardViewModel {
  const remaining = roundMacros(summary.calories.remainingToday);
  const totals = roundMacros(summary.macros.total);
  const delta = roundMacros(summary.macros.delta);
  const targetCalories = targets.calories;

  const points = summary.calories.daily.map((entry) => ({
    label: formatDayLabel(entry.date),
    value: entry.total,
    isoDate: entry.date,
  }));

  const breakdown = computeMealPeriodBreakdown(summary.calories.daily);
  const macros = buildMacroStats(summary.macros.total, summary.macros.targets, summary.macros.delta);
  const nutrients = summary.micros.map((item) => ({
    key: item.key,
    label: item.label,
    unit: item.unit,
    total: roundNumber(item.total, item.unit === 'kcal' ? 0 : 1),
    target: roundNumber(item.target, item.unit === 'kcal' ? 0 : 1),
    delta: roundNumber(item.delta, item.unit === 'kcal' ? 0 : 1),
  }));

  return {
    summary,
    targets,
    header: {
      remaining,
      totals,
      delta,
    },
    calories: {
      points,
      targetLine: targetCalories,
      labels: points.map((p) => p.label),
      mealPeriodBreakdown: breakdown,
      hasData: points.some((point) => point.value > 0),
    },
    macros,
    nutrients,
    comparison: null,
  };
}

export function computeMealPeriodBreakdown(daily: DashboardSummary['calories']['daily']): MealPeriodBreakdown[] {
  const totalPerPeriod = daily.reduce(
    (acc, entry) => {
      acc.breakfast += entry.perMealPeriod.breakfast;
      acc.lunch += entry.perMealPeriod.lunch;
      acc.dinner += entry.perMealPeriod.dinner;
      acc.snack += entry.perMealPeriod.snack;
      acc.unknown += entry.perMealPeriod.unknown;
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unknown: 0 },
  );

  const totalCalories = Object.values(totalPerPeriod).reduce((sum, value) => sum + value, 0);

  const entries: MealPeriodBreakdown[] = [
    { key: 'breakfast', label: '朝食', value: totalPerPeriod.breakfast, percent: 0 },
    { key: 'lunch', label: '昼食', value: totalPerPeriod.lunch, percent: 0 },
    { key: 'dinner', label: '夕食', value: totalPerPeriod.dinner, percent: 0 },
    { key: 'snack', label: '間食', value: totalPerPeriod.snack, percent: 0 },
    { key: 'unknown', label: '未分類', value: totalPerPeriod.unknown, percent: 0 },
  ];

  return entries.map((entry) => ({
    ...entry,
    percent: totalCalories > 0 ? Math.round((entry.value / totalCalories) * 100) : 0,
  }));
}

export function buildMacroStats(
  total: DashboardSummary['macros']['total'],
  targets: DashboardSummary['macros']['targets'],
  delta: DashboardSummary['macros']['delta'],
): MacroStat[] {
  const entries: Array<MacroStat> = [
    {
      key: 'protein_g',
      label: 'たんぱく質',
      actual: roundNumber(total.protein_g, 1),
      target: roundNumber(targets.protein_g, 1),
      delta: roundNumber(delta.protein_g, 1),
      percent: percentage(total.protein_g, targets.protein_g),
    },
    {
      key: 'fat_g',
      label: '脂質',
      actual: roundNumber(total.fat_g, 1),
      target: roundNumber(targets.fat_g, 1),
      delta: roundNumber(delta.fat_g, 1),
      percent: percentage(total.fat_g, targets.fat_g),
    },
    {
      key: 'carbs_g',
      label: '炭水化物',
      actual: roundNumber(total.carbs_g, 1),
      target: roundNumber(targets.carbs_g, 1),
      delta: roundNumber(delta.carbs_g, 1),
      percent: percentage(total.carbs_g, targets.carbs_g),
    },
  ];

  return entries;
}

export function percentage(actual: number, target: number) {
  if (target === 0) return 0;
  return Math.round((actual / target) * 100);
}

export function percentChange(actual: number, previous: number, decimals = 1) {
  if (previous === 0) {
    return actual === 0 ? 0 : 100;
  }
  return roundNumber(((actual - previous) / previous) * 100, decimals);
}

export function roundMacros(values: DashboardSummary['macros']['total']): FormattedMacros {
  return {
    calories: roundNumber(values.calories, 0),
    protein_g: roundNumber(values.protein_g, 1),
    fat_g: roundNumber(values.fat_g, 1),
    carbs_g: roundNumber(values.carbs_g, 1),
  };
}

export function roundNumber(value: number, decimals: number) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatDayLabel(isoDate: string) {
  const date = DateTime.fromISO(isoDate);
  const weekday = date.setLocale('ja').toFormat('ccc');
  return `${weekday} ${date.day}`;
}

interface ComparisonRequest {
  period: DashboardPeriod;
  range?: { from: string; to: string };
  cacheKey: string;
  labelKey: string;
}

export function getComparisonRequest(period: DashboardPeriod, summary: DashboardSummary | null): ComparisonRequest | null {
  switch (period) {
    case 'today':
      return { period: 'yesterday', cacheKey: 'yesterday', labelKey: 'period.yesterday' };
    case 'yesterday':
      return { period: 'today', cacheKey: 'today', labelKey: 'period.today' };
    case 'thisWeek':
      return { period: 'lastWeek', cacheKey: 'lastWeek', labelKey: 'period.lastWeek' };
    case 'lastWeek':
      return { period: 'thisWeek', cacheKey: 'thisWeek', labelKey: 'period.thisWeek' };
    case 'custom': {
      if (!summary) {
        return null;
      }
      const timezone = summary.range.timezone;
      const from = DateTime.fromISO(summary.range.from, { zone: timezone }).startOf('day');
      const to = DateTime.fromISO(summary.range.to, { zone: timezone }).startOf('day');
      const days = Math.max(Math.round(to.diff(from, 'days').days), 1);
      const previousTo = from.minus({ days: 1 }).startOf('day');
      const previousFrom = previousTo.minus({ days: days - 1 }).startOf('day');
      return {
        period: 'custom',
        range: { from: previousFrom.toISODate(), to: previousTo.toISODate() },
        cacheKey: `custom:${previousFrom.toISODate()}:${previousTo.toISODate()}`,
        labelKey: 'period.previousRange',
      };
    }
    default:
      return null;
  }
}

export function buildPeriodComparison(
  current: DashboardViewModel,
  previous: DashboardSummary,
  previousLabelKey: string,
): PeriodComparison {
  const currentTotals = current.summary.macros.total;
  const previousTotals = previous.macros.total;

  const totals = {
    current: roundNumber(currentTotals.calories, 0),
    previous: roundNumber(previousTotals.calories, 0),
    delta: roundNumber(currentTotals.calories - previousTotals.calories, 0),
    deltaPercent: percentChange(currentTotals.calories, previousTotals.calories),
  };

  const macros: MacroComparison[] = [
    {
      key: 'protein_g',
      current: roundNumber(currentTotals.protein_g, 1),
      previous: roundNumber(previousTotals.protein_g, 1),
      delta: roundNumber(currentTotals.protein_g - previousTotals.protein_g, 1),
      deltaPercent: percentChange(currentTotals.protein_g, previousTotals.protein_g),
    },
    {
      key: 'fat_g',
      current: roundNumber(currentTotals.fat_g, 1),
      previous: roundNumber(previousTotals.fat_g, 1),
      delta: roundNumber(currentTotals.fat_g - previousTotals.fat_g, 1),
      deltaPercent: percentChange(currentTotals.fat_g, previousTotals.fat_g),
    },
    {
      key: 'carbs_g',
      current: roundNumber(currentTotals.carbs_g, 1),
      previous: roundNumber(previousTotals.carbs_g, 1),
      delta: roundNumber(currentTotals.carbs_g - previousTotals.carbs_g, 1),
      deltaPercent: percentChange(currentTotals.carbs_g, previousTotals.carbs_g),
    },
  ];

  const previousBreakdown = computeMealPeriodBreakdown(previous.calories.daily);
  const previousLookup = new Map(previousBreakdown.map((entry) => [entry.key, entry]));

  const mealPeriods: MealPeriodComparison[] = current.calories.mealPeriodBreakdown.map((entry) => {
    const previousEntry = previousLookup.get(entry.key);
    const previousPercent = previousEntry?.percent ?? 0;
    return {
      key: entry.key,
      currentPercent: entry.percent,
      previousPercent,
      deltaPercent: roundNumber(entry.percent - previousPercent, 1),
    };
  });

  return {
    previousLabelKey,
    totals,
    macros,
    mealPeriods,
  };
}

export function mergeWithComparison(
  base: DashboardViewModel,
  previous: DashboardSummary | null,
  previousLabelKey: string | null,
): DashboardViewModel {
  const comparison = previous && previousLabelKey ? buildPeriodComparison(base, previous, previousLabelKey) : null;
  return {
    ...base,
    comparison,
  };
}
