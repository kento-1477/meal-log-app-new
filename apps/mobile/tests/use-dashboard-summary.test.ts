import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import type { DashboardSummary, DashboardTargets } from '@meal-log/shared';
import {
  buildViewModel,
  buildTargetComparison,
  formatDayLabel,
  roundNumber,
} from '../src/features/dashboard/summaryShared.ts';

function createSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  const base: DashboardSummary = {
    period: 'today',
    range: {
      from: DateTime.fromISO('2025-01-06', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
      to: DateTime.fromISO('2025-01-07', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
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

test('formatDayLabel respects timezone and falls back gracefully', () => {
  const label = formatDayLabel('2025-01-10', 'Asia/Tokyo');
  assert.equal(label, '金 10');

  const fallback = formatDayLabel('invalid-date', 'Asia/Tokyo');
  assert.equal(fallback, 'invalid-date');
});

test('buildTargetComparison reports target deltas and percentages', () => {
  const summary = createSummary();
  const targets: DashboardTargets = {
    calories: 2200,
    protein_g: 130,
    fat_g: 70,
    carbs_g: 260,
  };

  const comparison = buildTargetComparison(summary, targets);

  assert.equal(comparison.referenceLabelKey, 'comparison.target');
  assert.equal(comparison.totals.current, 2100);
  assert.equal(comparison.totals.target, 2200);
  assert.equal(comparison.totals.delta, -100);
  assert.equal(comparison.totals.percentOfTarget, 95);

  const protein = comparison.macros.find((entry) => entry.key === 'protein_g');
  assert.ok(protein);
  assert.equal(protein?.current, 120);
  assert.equal(protein?.target, 130);
  assert.equal(protein?.delta, -10);
  assert.equal(protein?.percentOfTarget, 92);
});

test('buildViewModel includes comparison and formatted labels', () => {
  const summary = createSummary({
    calories: {
      daily: [
        {
          date: '2025-01-06',
          total: 2100,
          perMealPeriod: { breakfast: 500, lunch: 700, dinner: 800, snack: 100, unknown: 0 },
        },
        {
          date: '2025-01-07',
          total: 0,
          perMealPeriod: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unknown: 0 },
        },
      ],
      remainingToday: { calories: 500, protein_g: 20, fat_g: 10, carbs_g: 40 },
    },
  });
  const targets: DashboardTargets = { calories: 2200, protein_g: 130, fat_g: 70, carbs_g: 260 };

  const viewModel = buildViewModel(summary, targets);

  assert.equal(viewModel.calories.labels[0], '月 6');
  assert.equal(viewModel.calories.labels[1], '火 7');
  assert.equal(viewModel.comparison.totals.target, 2200);
  assert.equal(viewModel.comparison.macros.length, 3);
  assert.equal(viewModel.comparison.macros[0].target, 130);
  assert.equal(viewModel.comparison.macros[0].percentOfTarget, 92);
  assert.equal(viewModel.calories.mealPeriodBreakdown[0].percent, Math.round((500 / 2100) * 100));
});

test('buildViewModel scales targets for multi-day ranges', () => {
  const summary = createSummary({
    period: 'thisWeek',
    range: {
      from: DateTime.fromISO('2025-01-06', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
      to: DateTime.fromISO('2025-01-13', { zone: 'Asia/Tokyo' }).startOf('day').toISO(),
      timezone: 'Asia/Tokyo',
    },
    calories: {
      daily: [
        { date: '2025-01-06', total: 2000, perMealPeriod: { breakfast: 500, lunch: 600, dinner: 700, snack: 200, unknown: 0 } },
        { date: '2025-01-07', total: 2100, perMealPeriod: { breakfast: 500, lunch: 600, dinner: 800, snack: 200, unknown: 0 } },
        { date: '2025-01-08', total: 2200, perMealPeriod: { breakfast: 600, lunch: 700, dinner: 800, snack: 100, unknown: 0 } },
        { date: '2025-01-09', total: 2100, perMealPeriod: { breakfast: 500, lunch: 700, dinner: 700, snack: 200, unknown: 0 } },
        { date: '2025-01-10', total: 2300, perMealPeriod: { breakfast: 600, lunch: 700, dinner: 800, snack: 200, unknown: 0 } },
        { date: '2025-01-11', total: 2100, perMealPeriod: { breakfast: 500, lunch: 700, dinner: 700, snack: 200, unknown: 0 } },
        { date: '2025-01-12', total: 2200, perMealPeriod: { breakfast: 600, lunch: 700, dinner: 800, snack: 100, unknown: 0 } },
      ],
      remainingToday: { calories: 500, protein_g: 20, fat_g: 10, carbs_g: 40 },
    },
    macros: {
      total: { calories: 15000, protein_g: 820, fat_g: 450, carbs_g: 1600 },
      targets: { calories: 15400, protein_g: 910, fat_g: 490, carbs_g: 1820 },
      delta: { calories: -400, protein_g: -90, fat_g: -40, carbs_g: -220 },
    },
  });

  const targets: DashboardTargets = { calories: 2200, protein_g: 130, fat_g: 70, carbs_g: 260 };
  const viewModel = buildViewModel(summary, targets);

  assert.equal(viewModel.comparison.totals.target, 15400);
  assert.equal(viewModel.comparison.totals.delta, -400);
  assert.equal(viewModel.comparison.totals.percentOfTarget, Math.round((15000 / 15400) * 100));

  const carbComparison = viewModel.comparison.macros.find((entry) => entry.key === 'carbs_g');
  assert.ok(carbComparison);
  assert.equal(carbComparison?.target, 1820);
  assert.equal(carbComparison?.delta, -220);
});

test('roundNumber rounds consistently', () => {
  assert.equal(roundNumber(123.456, 1), 123.5);
  assert.equal(roundNumber(123.444, 1), 123.4);
});
