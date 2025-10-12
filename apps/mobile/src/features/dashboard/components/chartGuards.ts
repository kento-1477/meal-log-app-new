import type { ChartPoint } from '../useDashboardSummary';

export function hasSufficientChartData(points: ChartPoint[]): boolean {
  if (points.length < 2) {
    return false;
  }
  return points.every((point) => point.label.trim().length > 0);
}
