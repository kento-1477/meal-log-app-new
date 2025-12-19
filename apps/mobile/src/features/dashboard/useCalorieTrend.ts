import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { getCalorieTrend, type CalorieTrendMode } from '@/services/api';
import { useTranslation } from '@/i18n';

export type CalorieChartMode = CalorieTrendMode;

export function useCalorieTrend(mode: CalorieChartMode, options?: { enabled?: boolean }) {
  const { locale } = useTranslation();
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ['calorieTrend', mode, locale],
    queryFn: () => getCalorieTrend(mode),
    enabled,
    staleTime: 1000 * 60 * 5,
  });

  const transformedPoints = useMemo(() => {
    if (!query.data) {
      return [];
    }
    return query.data.points.map((point) => {
      const dt = DateTime.fromISO(point.date);
      if (!dt.isValid) {
        return point;
      }
      if (mode === 'weekly') {
        return {
          ...point,
          label: formatMonthDayWithWeekday(dt, locale),
        };
      }
      if (mode === 'monthly') {
        return {
          ...point,
          label: formatDayNumber(dt, locale),
        };
      }
      if (mode === 'daily') {
        return {
          ...point,
          label: formatMonthDayWithWeekday(dt, locale),
        };
      }
      return point;
    });
  }, [query.data, mode, locale]);

  const stats = useMemo(() => {
    if (!query.data) {
      return { totalDays: 0, underTargetDays: 0, overTargetDays: 0 } as const;
    }
    const today = DateTime.now().startOf('day');
    let under = 0;
    let over = 0;
    query.data.points.forEach((point) => {
      const dt = DateTime.fromISO(point.date);
      const isFuture = dt.isValid && dt.startOf('day') > today;
      if (isFuture) {
        return;
      }
      if (point.value >= query.data.target) {
        over += 1;
      } else {
        under += 1;
      }
    });
    return {
      totalDays: query.data.points.length,
      underTargetDays: under,
      overTargetDays: over,
    } as const;
  }, [query.data]);

  const hasData = transformedPoints.some((point) => point.value > 0);

  return {
    target: query.data?.target ?? 0,
    points: transformedPoints,
    hasData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    stats,
  };
}

function formatWeekday(date: DateTime, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date.toJSDate());
}

function formatDayNumber(date: DateTime, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date.toJSDate());
}

function formatMonthDayWithWeekday(date: DateTime, locale: string) {
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date.toJSDate());
  const weekday = formatWeekday(date, locale);
  return `${monthDay} (${weekday})`;
}
