import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSufficientChartData } from '../src/features/dashboard/components/chartGuards.ts';

test('hasSufficientChartData returns false when fewer than two points', () => {
  const points = [{ label: '月 6', value: 2100, isoDate: '2025-01-06' }];
  assert.equal(hasSufficientChartData(points), false);
});

test('hasSufficientChartData returns false when labels are missing', () => {
  const points = [
    { label: '  ', value: 1900, isoDate: '2025-01-07' },
    { label: '\t', value: 2000, isoDate: '2025-01-08' },
  ];
  assert.equal(hasSufficientChartData(points), false);
});

test('hasSufficientChartData returns true for well-formed points', () => {
  const points = [
    { label: '月 6', value: 1800, isoDate: '2025-01-06' },
    { label: '火 7', value: 2000, isoDate: '2025-01-07' },
    { label: '水 8', value: 2100, isoDate: '2025-01-08' },
  ];
  assert.equal(hasSufficientChartData(points), true);
});
