import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { buildDashboardSummary, getDefaultTargets } from '../src/services/dashboard-builder.js';

const timezone = 'Asia/Tokyo';

function createLog({ date, calories, protein_g, fat_g, carbs_g, mealPeriod }) {
  return {
    createdAt: DateTime.fromISO(date, { zone: timezone }).toJSDate(),
    calories,
    proteinG: protein_g,
    fatG: fat_g,
    carbsG: carbs_g,
    mealPeriod,
  };
}

test('buildDashboardSummary aggregates totals per day and meal period', () => {
  const logs = [
    createLog({ date: '2024-12-01T08:30:00', calories: 500, protein_g: 30, fat_g: 15, carbs_g: 40, mealPeriod: 'BREAKFAST' }),
    createLog({ date: '2024-12-01T12:10:00', calories: 700, protein_g: 35, fat_g: 22, carbs_g: 60, mealPeriod: 'LUNCH' }),
    createLog({ date: '2024-12-02T19:10:00', calories: 650, protein_g: 32, fat_g: 25, carbs_g: 55, mealPeriod: 'DINNER' }),
  ];

  const fromDate = DateTime.fromISO('2024-12-01', { zone: timezone }).startOf('day');
  const toDate = fromDate.plus({ days: 3 });

  const summary = buildDashboardSummary({
    logs,
    range: { fromDate, toDate, period: 'custom' },
    timezone,
    todayTotals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    dailyTargets: getDefaultTargets(),
  });

  assert.equal(summary.calories.daily.length, 3);
  assert.deepEqual(summary.calories.daily[0], {
    date: '2024-12-01',
    total: 1200,
    perMealPeriod: {
      breakfast: 500,
      lunch: 700,
      dinner: 0,
      snack: 0,
      unknown: 0,
    },
  });
  assert.deepEqual(summary.calories.daily[1], {
    date: '2024-12-02',
    total: 650,
    perMealPeriod: {
      breakfast: 0,
      lunch: 0,
      dinner: 650,
      snack: 0,
      unknown: 0,
    },
  });
  assert.deepEqual(summary.calories.daily[2].total, 0);

  assert.equal(summary.macros.total.calories, 1850);
  assert.equal(summary.macros.total.protein_g, 97);
  assert.equal(summary.macros.total.fat_g, 62);
  assert.equal(summary.macros.total.carbs_g, 155);
});

test('buildDashboardSummary normalizes daily dates even when a log has an invalid timestamp', () => {
  const logs = [
    {
      createdAt: new Date('invalid'),
      calories: 400,
      proteinG: 20,
      fatG: 10,
      carbsG: 30,
      mealPeriod: 'BREAKFAST',
    },
  ];

  const fromDate = DateTime.fromISO('2024-12-05', { zone: timezone }).startOf('day');
  const toDate = fromDate.plus({ days: 3 });

  const summary = buildDashboardSummary({
    logs,
    range: { fromDate, toDate, period: 'custom' },
    timezone,
    todayTotals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    dailyTargets: getDefaultTargets(),
  });

  assert.equal(summary.calories.daily.length, 3);
  summary.calories.daily.forEach((entry, index) => {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(entry.total, 0, `Expected zero calories for day index ${index}`);
  });
  assert.equal(summary.macros.total.calories, 0);
});

test('buildDashboardSummary uses provided targets when supplied', () => {
  const logs = [
    createLog({ date: '2024-12-01T08:30:00', calories: 500, protein_g: 30, fat_g: 15, carbs_g: 40, mealPeriod: 'BREAKFAST' }),
  ];

  const fromDate = DateTime.fromISO('2024-12-01', { zone: timezone }).startOf('day');
  const toDate = fromDate.plus({ days: 1 });

  const customTargets = {
    calories: 3500,
    protein_g: 180,
    fat_g: 90,
    carbs_g: 420,
  };

  const summary = buildDashboardSummary({
    logs,
    range: { fromDate, toDate, period: 'custom' },
    timezone,
    todayTotals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    dailyTargets: customTargets,
  });

  assert.equal(summary.macros.targets.calories, customTargets.calories);
  assert.equal(summary.macros.targets.protein_g, customTargets.protein_g);
  assert.equal(summary.calories.remainingToday.calories, customTargets.calories - 0);
});
