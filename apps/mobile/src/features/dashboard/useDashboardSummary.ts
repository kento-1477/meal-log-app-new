import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { DashboardPeriod } from '@meal-log/shared';
import { getDashboardSummary, getDashboardTargets } from '@/services/api';
import { useTranslation } from '@/i18n';
import { DashboardViewModel, buildViewModel } from './summaryShared';

const CACHE_PREFIX = 'dashboard:summary:';

type SummaryRange = { from: string; to: string };

function getTodayKey() {
  return DateTime.now().toISODate();
}

export function useDashboardSummary(
  period: DashboardPeriod,
  options?: { enabled?: boolean; range?: SummaryRange },
) {
  const [cached, setCached] = useState<DashboardViewModel | null>(null);
  const enabled = options?.enabled ?? true;
  const { locale } = useTranslation();
  const rangeKey = options?.range ? `${options.range.from}:${options.range.to}` : null;
  const queryClient = useQueryClient();

  // 日付をトラッキングして、日付が変わったらキャッシュをクリアして再取得
  const [todayKey, setTodayKey] = useState(getTodayKey);
  const appStateRef = useRef(AppState.currentState);

  // AppState監視: foreground復帰時に日付変更をチェック
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        const currentTodayKey = getTodayKey();
        if (currentTodayKey !== todayKey) {
          console.log('[Dashboard] Date changed, invalidating cache');
          setTodayKey(currentTodayKey);
          // クエリを無効化して再取得をトリガー
          queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
        }
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [todayKey, queryClient]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setCached(null);
      return () => {
        cancelled = true;
      };
    }
    // 日付をキャッシュキーに含めることで、日付変更時に古いキャッシュを使わない
    AsyncStorage.getItem(cacheKey(period, locale, rangeKey, todayKey)).then((value) => {
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
  }, [period, enabled, locale, rangeKey, todayKey]);

  const summaryQuery = useQuery({
    queryKey: ['dashboardSummary', period, locale, rangeKey, todayKey],
    queryFn: async () => {
      const [summary, targets] = await Promise.all([
        getDashboardSummary(period, options?.range),
        getDashboardTargets(),
      ]);
      return buildViewModel(summary, targets);
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5分間はstaleとしない
  });

  const liveData = useMemo(() => summaryQuery.data ?? null, [summaryQuery.data]);

  useEffect(() => {
    if (!enabled || !summaryQuery.data) {
      return;
    }
    AsyncStorage.setItem(cacheKey(period, locale, rangeKey, todayKey), JSON.stringify(summaryQuery.data)).catch((error) => {
      console.warn('Failed to cache dashboard summary', error);
    });
    setCached(summaryQuery.data);
  }, [enabled, summaryQuery.data, period, locale, rangeKey, todayKey]);

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

function cacheKey(period: DashboardPeriod, locale: string, rangeKey: string | null, dateKey: string | null) {
  return `${CACHE_PREFIX}${locale}:${period}:${dateKey ?? 'unknown'}${rangeKey ? `:${rangeKey}` : ''}`;
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

