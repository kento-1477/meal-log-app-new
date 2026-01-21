import { DateTime } from 'luxon';
import type { DashboardSummary, DashboardTargets } from '@meal-log/shared';
import { getIntlLocale, translateKey } from '@/i18n';

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
  target: number;
  delta: number;
  percentOfTarget: number;
}

export interface PeriodComparison {
  referenceLabelKey: string;
  totals: {
    current: number;
    target: number;
    delta: number;
    percentOfTarget: number;
  };
  macros: MacroComparison[];
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
  comparison: PeriodComparison;
}

export function buildViewModel(summary: DashboardSummary, targets: DashboardTargets): DashboardViewModel {
  const remaining = roundMacros(summary.calories.remainingToday);
  const totals = roundMacros(summary.macros.total);
  const delta = roundMacros(summary.macros.delta);
  const targetCalories = targets.calories;
  const timezone = summary.range.timezone;

  const points = summary.calories.daily.map((entry, index) => {
    const normalizedDate = normalizeDailyDate(entry.date, timezone);
    const fallbackLabel = formatFallbackDayLabel(index);
    return {
      label: formatDayLabel(normalizedDate, fallbackLabel, timezone),
      value: entry.total,
      isoDate: normalizedDate ?? '',
    };
  });

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
    comparison: buildTargetComparison(summary, summary.macros.targets),
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
    { key: 'breakfast', label: translateKey('meal.breakfast'), value: totalPerPeriod.breakfast, percent: 0 },
    { key: 'lunch', label: translateKey('meal.lunch'), value: totalPerPeriod.lunch, percent: 0 },
    { key: 'dinner', label: translateKey('meal.dinner'), value: totalPerPeriod.dinner, percent: 0 },
    { key: 'snack', label: translateKey('meal.snack'), value: totalPerPeriod.snack, percent: 0 },
    { key: 'unknown', label: translateKey('meal.unknown'), value: totalPerPeriod.unknown, percent: 0 },
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
      label: translateKey('macro.protein'),
      actual: roundNumber(total.protein_g, 1),
      target: roundNumber(targets.protein_g, 1),
      delta: roundNumber(delta.protein_g, 1),
      percent: percentage(total.protein_g, targets.protein_g),
    },
    {
      key: 'fat_g',
      label: translateKey('macro.fat'),
      actual: roundNumber(total.fat_g, 1),
      target: roundNumber(targets.fat_g, 1),
      delta: roundNumber(delta.fat_g, 1),
      percent: percentage(total.fat_g, targets.fat_g),
    },
    {
      key: 'carbs_g',
      label: translateKey('macro.carbs'),
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

export function formatDayLabel(isoDate: string | null | undefined, fallbackLabel: string, timezone: string) {
  if (!isoDate || typeof isoDate !== 'string') {
    return fallbackLabel;
  }
  const date = DateTime.fromISO(isoDate, { zone: timezone });
  if (!date.isValid) {
    return fallbackLabel;
  }
  const weekday = date.setLocale(getIntlLocale()).toFormat('ccc');
  return `${weekday} ${date.day}`;
}

function normalizeDailyDate(raw: string | null | undefined, timezone: string): string | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const parsed = DateTime.fromISO(raw, { zone: timezone });
  if (!parsed.isValid) {
    return null;
  }
  return parsed.startOf('day').toISODate();
}

function formatFallbackDayLabel(index: number) {
  const locale = getIntlLocale();
  const dayNumber = index + 1;
  return locale.startsWith('ja') ? `${dayNumber}日目` : `Day ${dayNumber}`;
}

export function buildTargetComparison(summary: DashboardSummary, targets: DashboardTargets): PeriodComparison {
  const totals = summary.macros.total;

  return {
    referenceLabelKey: 'comparison.target',
    totals: {
      current: roundNumber(totals.calories, 0),
      target: roundNumber(targets.calories, 0),
      delta: roundNumber(totals.calories - targets.calories, 0),
      percentOfTarget: percentage(totals.calories, targets.calories),
    },
    macros: [
      {
        key: 'protein_g',
        current: roundNumber(totals.protein_g, 1),
        target: roundNumber(targets.protein_g, 1),
        delta: roundNumber(totals.protein_g - targets.protein_g, 1),
        percentOfTarget: percentage(totals.protein_g, targets.protein_g),
      },
      {
        key: 'fat_g',
        current: roundNumber(totals.fat_g, 1),
        target: roundNumber(targets.fat_g, 1),
        delta: roundNumber(totals.fat_g - targets.fat_g, 1),
        percentOfTarget: percentage(totals.fat_g, targets.fat_g),
      },
      {
        key: 'carbs_g',
        current: roundNumber(totals.carbs_g, 1),
        target: roundNumber(targets.carbs_g, 1),
        delta: roundNumber(totals.carbs_g - targets.carbs_g, 1),
        percentOfTarget: percentage(totals.carbs_g, targets.carbs_g),
      },
    ],
  };
}
