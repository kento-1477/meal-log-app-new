import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { getComparisonRequest, buildPeriodComparison, buildViewModel } from '../src/features/dashboard/summaryShared.ts';
import type { DashboardSummary, DashboardTargets } from '@meal-log/shared';
import type { DashboardViewModel } from '../src/features/dashboard/summaryShared.ts';

function createSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  const base: DashboardSummary = {
    period: 'thisWeek',
    range: {
      from: DateTime.fromISO('2025-01-06', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
      to: DateTime.fromISO('2025-01-13', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
      timezone: 'Asia/Tokyo',
    },
    calories: {
      daily: [
        {
          date: '2025-01-06',
          total: 2100,
          perMealPeriod: { breakfast: 500, lunch: 700, dinner: 800, snack: 100, unknown: 0 },
        },
      ],
      remainingToday: { calories: 500, protein_g: 20, fat_g: 10, carbs_g: 40 },
    },
    macros: {
      total: { calories: 2100, protein_g: 120, fat_g: 60, carbs_g: 250 },
      targets: { calories: 2200, protein_g: 130, fat_g: 70, carbs_g: 260 },
      delta: { calories: -100, protein_g: -10, fat_g: -10, carbs_g: -10 },
    },
    micros: [],
    metadata: {
      generatedAt: DateTime.fromISO('2025-01-07T00:00:00', { zone: 'Asia/Tokyo' }).toISO(),
    },
  };
  return { ...base, ...overrides };
}

function createViewModel(summary: DashboardSummary, targets: DashboardTargets): DashboardViewModel {
  const totalCalories = summary.calories.daily[0].total;
  const perMeal = summary.calories.daily[0].perMealPeriod;
  const base = buildViewModel(summary, targets);
  return {
    ...base,
    calories: {
      ...base.calories,
      mealPeriodBreakdown: [
        { key: 'breakfast', label: '朝食', value: perMeal.breakfast, percent: Math.round((perMeal.breakfast / totalCalories) * 100) },
        { key: 'lunch', label: '昼食', value: perMeal.lunch, percent: Math.round((perMeal.lunch / totalCalories) * 100) },
        { key: 'dinner', label: '夕食', value: perMeal.dinner, percent: Math.round((perMeal.dinner / totalCalories) * 100) },
        { key: 'snack', label: '間食', value: perMeal.snack, percent: Math.round((perMeal.snack / totalCalories) * 100) },
        { key: 'unknown', label: '未分類', value: perMeal.unknown, percent: 0 },
      ],
    },
  };
}

test('getComparisonRequest resolves previous period for today', () => {
  const result = getComparisonRequest('today', null);
  assert.deepEqual(result, {
    period: 'yesterday',
    cacheKey: 'yesterday',
    labelKey: 'period.yesterday',
  });
});

test('getComparisonRequest computes custom range window', () => {
  const summary = createSummary({
    period: 'custom',
    range: {
      from: '2025-01-10T00:00:00.000+09:00',
      to: '2025-01-15T00:00:00.000+09:00',
      timezone: 'Asia/Tokyo',
    },
  });

  const result = getComparisonRequest('custom', summary);
  assert.ok(result);
  assert.equal(result?.period, 'custom');
  assert.equal(result?.range?.from, '2025-01-05');
  assert.equal(result?.range?.to, '2025-01-09');
});

test('buildPeriodComparison calculates totals and meal deltas', () => {
  const currentSummary = createSummary();
  const previousSummary = createSummary({
    macros: {
      total: { calories: 1800, protein_g: 100, fat_g: 55, carbs_g: 220 },
      targets: currentSummary.macros.targets,
      delta: { calories: -400, protein_g: -30, fat_g: -15, carbs_g: -30 },
    },
    calories: {
      daily: [
        {
          date: '2024-12-30',
          total: 1800,
          perMealPeriod: { breakfast: 400, lunch: 700, dinner: 600, snack: 100, unknown: 0 },
        },
      ],
      remainingToday: currentSummary.calories.remainingToday,
    },
  });

  const targets: DashboardTargets = { calories: 2200, protein_g: 130, fat_g: 70, carbs_g: 260 };
  const viewModel = createViewModel(currentSummary, targets);
  const comparison = buildPeriodComparison(viewModel, previousSummary, 'period.lastWeek');

  assert.equal(comparison.totals.current, 2100);
  assert.equal(comparison.totals.previous, 1800);
  assert.equal(comparison.totals.delta, 300);
  assert.equal(comparison.macros[0].delta, 20);
  assert.equal(comparison.mealPeriods[0].previousPercent, 22);
});
