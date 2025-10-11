import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary, DashboardTargets, DashboardPeriod } from '@meal-log/shared';
import { getDashboardSummary, getDashboardTargets } from '@/services/api';
import {
  DashboardViewModel,
  buildViewModel,
  computeMealPeriodBreakdown,
  getComparisonRequest,
  mergeWithComparison,
  roundNumber,
  FormattedMacros,
  MacroStat,
  NutrientRow,
} from './summaryShared';

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

  const baseSummary = summaryQuery.data?.summary ?? cached?.summary ?? null;
  const comparisonRequest = useMemo(() => getComparisonRequest(period, baseSummary), [period, baseSummary]);

  const comparisonQuery = useQuery({
    queryKey: ['dashboardSummary', period, 'comparison', comparisonRequest?.cacheKey ?? 'none'],
    queryFn: async () => {
      if (!comparisonRequest) {
        return null;
      }
      return getDashboardSummary(comparisonRequest.period, comparisonRequest.range);
    },
    enabled: enabled && Boolean(comparisonRequest),
  });

  const liveData = useMemo(() => {
    if (!summaryQuery.data) {
      return null;
    }
    return mergeWithComparison(summaryQuery.data, comparisonQuery.data ?? null, comparisonRequest?.labelKey ?? null);
  }, [summaryQuery.data, comparisonQuery.data, comparisonRequest?.labelKey]);

  useEffect(() => {
    if (!enabled || !summaryQuery.data) {
      return;
    }
    const merged = mergeWithComparison(summaryQuery.data, comparisonQuery.data ?? null, comparisonRequest?.labelKey ?? null);
    AsyncStorage.setItem(cacheKey(period), JSON.stringify(merged)).catch((error) => {
      console.warn('Failed to cache dashboard summary', error);
    });
    setCached(merged);
  }, [enabled, summaryQuery.data, comparisonQuery.data, comparisonRequest?.labelKey, period]);

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

function buildViewModel(summary: DashboardSummary, targets: DashboardTargets): DashboardViewModel {
  const remaining = roundMacros(summary.calories.remainingToday);
  const totals = roundMacros(summary.macros.total);
  const delta = roundMacros(summary.macros.delta);
  const targetCalories = targets.calories;

  const points = summary.calories.daily.map((entry) => ({
    label: formatDayLabel(entry.date),
    value: entry.total,
    isoDate: entry.date,
  }));

  const breakdown = computeMealPeriodBreakdown(summary.calories.daily);
  const macros = buildMacroStats(summary.macros.total, summary.macros.targets, summary.macros.delta);
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
  MealPeriodComparison,
  PeriodComparison,
} from './summaryShared';
