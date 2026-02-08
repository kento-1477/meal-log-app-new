import { DateTime } from 'luxon';

const DEFAULT_DAY_BOUNDARY_HOUR = 4;

function normalizeBoundaryHour(hour: number) {
  if (!Number.isFinite(hour)) {
    return DEFAULT_DAY_BOUNDARY_HOUR;
  }
  return Math.max(0, Math.min(23, Math.trunc(hour)));
}

export function resolveLogicalDay(
  now: DateTime = DateTime.now(),
  dayBoundaryHour: number = DEFAULT_DAY_BOUNDARY_HOUR,
) {
  const boundary = normalizeBoundaryHour(dayBoundaryHour);
  return now.minus({ hours: boundary }).startOf('day');
}

export function resolveDailyDashboardPeriod(
  now: DateTime = DateTime.now(),
  dayBoundaryHour: number = DEFAULT_DAY_BOUNDARY_HOUR,
): 'today' | 'yesterday' {
  const logicalDay = resolveLogicalDay(now, dayBoundaryHour);
  const calendarDay = now.startOf('day');
  return logicalDay.hasSame(calendarDay, 'day') ? 'today' : 'yesterday';
}
