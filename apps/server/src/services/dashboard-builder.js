import { DateTime, Interval } from 'luxon';
import { DASHBOARD_TARGETS } from '../config/dashboard.js';

export function buildDashboardSummary({ logs, range, timezone, todayTotals }) {
  const interval = Interval.fromDateTimes(range.fromDate, range.toDate);
  const days = [];
  const byDate = new Map();

  const totals = logs.reduce(
    (acc, log) => {
      const dt = DateTime.fromJSDate(log.createdAt, { zone: timezone });
      const dateKey = dt.toISODate();
      const bucket = byDate.get(dateKey) ?? createEmptyDailyBucket();

      bucket.total += log.calories;
      const mealPeriodKey = (log.mealPeriod?.toLowerCase?.() ?? 'unknown');
      if (!Object.prototype.hasOwnProperty.call(bucket.perMealPeriod, mealPeriodKey)) {
        bucket.perMealPeriod.unknown += log.calories;
      } else {
        bucket.perMealPeriod[mealPeriodKey] += log.calories;
      }

      byDate.set(dateKey, bucket);

      acc.calories += log.calories;
      acc.protein_g += log.proteinG;
      acc.fat_g += log.fatG;
      acc.carbs_g += log.carbsG;
      return acc;
    },
    { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );

  for (const day of iterateDays(interval)) {
    const key = day.toISODate();
    const bucket = byDate.get(key) ?? createEmptyDailyBucket();
    days.push({
      date: key,
      total: round(bucket.total, DASHBOARD_TARGETS.calories.decimals),
      perMealPeriod: mapMealPeriod(bucket.perMealPeriod),
    });
  }

  const roundedTotals = roundMacros(totals);
  const targets = getDefaultTargets();
  const delta = roundMacros({
    calories: roundedTotals.calories - targets.calories,
    protein_g: roundedTotals.protein_g - targets.protein_g,
    fat_g: roundedTotals.fat_g - targets.fat_g,
    carbs_g: roundedTotals.carbs_g - targets.carbs_g,
  });

  const micros = buildMicros(roundedTotals, targets, delta);
  const remainingToday = roundMacros({
    calories: Math.max(targets.calories - todayTotals.calories, 0),
    protein_g: Math.max(targets.protein_g - todayTotals.protein_g, 0),
    fat_g: Math.max(targets.fat_g - todayTotals.fat_g, 0),
    carbs_g: Math.max(targets.carbs_g - todayTotals.carbs_g, 0),
  });

  return {
    period: range.period,
    range: {
      from: range.fromDate.toISO(),
      to: range.toDate.toISO(),
      timezone,
    },
    calories: {
      daily: days,
      remainingToday,
    },
    macros: {
      total: roundedTotals,
      targets,
      delta,
    },
    micros,
  };
}

export function getDefaultTargets() {
  return {
    calories: DASHBOARD_TARGETS.calories.value,
    protein_g: DASHBOARD_TARGETS.protein_g.value,
    fat_g: DASHBOARD_TARGETS.fat_g.value,
    carbs_g: DASHBOARD_TARGETS.carbs_g.value,
  };
}

function iterateDays(interval) {
  const days = [];
  let cursor = interval.start;
  while (cursor < interval.end) {
    days.push(cursor);
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

function round(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function roundMacros(macros) {
  return {
    calories: round(macros.calories, DASHBOARD_TARGETS.calories.decimals),
    protein_g: round(macros.protein_g, DASHBOARD_TARGETS.protein_g.decimals),
    fat_g: round(macros.fat_g, DASHBOARD_TARGETS.fat_g.decimals),
    carbs_g: round(macros.carbs_g, DASHBOARD_TARGETS.carbs_g.decimals),
  };
}

function buildMicros(total, targets, delta) {
  return [
    {
      key: 'calories',
      label: 'カロリー',
      unit: DASHBOARD_TARGETS.calories.unit,
      total: total.calories,
      target: targets.calories,
      delta: delta.calories,
    },
    {
      key: 'protein_g',
      label: 'たんぱく質',
      unit: DASHBOARD_TARGETS.protein_g.unit,
      total: total.protein_g,
      target: targets.protein_g,
      delta: delta.protein_g,
    },
    {
      key: 'fat_g',
      label: '脂質',
      unit: DASHBOARD_TARGETS.fat_g.unit,
      total: total.fat_g,
      target: targets.fat_g,
      delta: delta.fat_g,
    },
    {
      key: 'carbs_g',
      label: '炭水化物',
      unit: DASHBOARD_TARGETS.carbs_g.unit,
      total: total.carbs_g,
      target: targets.carbs_g,
      delta: delta.carbs_g,
    },
  ];
}

function mapMealPeriod(periods) {
  return {
    breakfast: round(periods.breakfast, 0),
    lunch: round(periods.lunch, 0),
    dinner: round(periods.dinner, 0),
    snack: round(periods.snack, 0),
    unknown: round(periods.unknown, 0),
  };
}

function createEmptyDailyBucket() {
  return {
    total: 0,
    perMealPeriod: {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
      unknown: 0,
    },
  };
}

export { roundMacros };
