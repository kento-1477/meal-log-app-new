import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type { DashboardPeriod } from '@meal-log/shared';
import { getDashboardSummary, getDashboardTargets } from '@/services/api';
import { DashboardViewModel, buildViewModel } from './summaryShared';

const CACHE_PREFIX = 'dashboard:summary:';

export function useDashboardSummary(period: DashboardPeriod, options?: { enabled?: boolean }) {
  const [cached, setCached] = useState<DashboardViewModel | null>(null);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setCached(null);
      return () => {
        cancelled = true;
      };
    }
    AsyncStorage.getItem(cacheKey(period)).then((value) => {
      if (!cancelled && value) {
        try {
          const parsed = JSON.parse(value) as DashboardViewModel;
          setCached(parsed);
        } catch (error) {
          console.warn('Failed to parse cached dashboard summary', error);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period, enabled]);

  const summaryQuery = useQuery({
    queryKey: ['dashboardSummary', period],
    queryFn: async () => {
      const [summary, targets] = await Promise.all([
        getDashboardSummary(period),
        getDashboardTargets(),
      ]);
      return buildViewModel(summary, targets);
    },
    enabled,
  });

  const liveData = useMemo(() => summaryQuery.data ?? null, [summaryQuery.data]);

  useEffect(() => {
    if (!enabled || !summaryQuery.data) {
      return;
    }
    AsyncStorage.setItem(cacheKey(period), JSON.stringify(summaryQuery.data)).catch((error) => {
      console.warn('Failed to cache dashboard summary', error);
    });
    setCached(summaryQuery.data);
  }, [enabled, summaryQuery.data, period]);

  const data = liveData ?? cached;

  return {
    data,
    isLoading: enabled ? summaryQuery.isLoading && !cached : false,
    isFetching: enabled ? summaryQuery.isFetching : false,
    error: summaryQuery.error,
    refetch: summaryQuery.refetch,
    hasFreshData: Boolean(summaryQuery.data),
    isStaleFromCache: enabled ? !summaryQuery.data && Boolean(cached) : false,
  } as const;
}

function cacheKey(period: DashboardPeriod) {
  return `${CACHE_PREFIX}${period}`;
}

export type {
  DashboardViewModel,
  ChartPoint,
  MealPeriodBreakdown,
  MacroStat,
  FormattedMacros,
  NutrientRow,
  MacroComparison,
  PeriodComparison,
} from './summaryShared';
