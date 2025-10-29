import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DashboardPeriod, MealLogSummary, MealLogRange, DashboardSummary, DashboardTargets } from '@meal-log/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDashboardSummary, type MacroComparison } from '@/features/dashboard/useDashboardSummary';
import { PeriodSelector } from '@/features/dashboard/components/PeriodSelector';
import { CalorieLineChart } from '@/features/dashboard/components/CalorieLineChart';
import { MealPeriodBreakdown } from '@/features/dashboard/components/MealPeriodBreakdown';

import { EmptyStateCard } from '@/features/dashboard/components/EmptyStateCard';
import { PeriodComparisonCard } from '@/features/dashboard/components/PeriodComparisonCard';
import { type MacroRingProps, type RingColorToken } from '@/features/dashboard/components/RemainingRings';
import { buildRingState } from '@/features/dashboard/components/ringMath';
import Svg, { Circle } from 'react-native-svg';
import { RecentLogsList } from '@/features/dashboard/components/RecentLogsList';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { logout, getMealLogs, getStreak, createFavoriteMeal, deleteFavoriteMeal } from '@/services/api';
import { cacheStreak } from '@/services/streak-storage';
import { useTranslation } from '@/i18n';
import { buildFavoriteDraftFromSummary } from '@/utils/favorites';
import { DateTime } from 'luxon';
import { usePremiumStore } from '@/store/premium';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const DEFAULT_PERIOD: DashboardPeriod = 'today';

const MACRO_ORDER: Array<MacroComparison['key']> = ['protein_g', 'carbs_g', 'fat_g'];
const MACRO_LABEL_KEY: Record<MacroComparison['key'], string> = {
  protein_g: 'macro.protein',
  carbs_g: 'macro.carbs',
  fat_g: 'macro.fat',
};
const MACRO_COLOR_TOKEN: Record<MacroComparison['key'], RingColorToken> = {
  protein_g: 'ringProtein',
  carbs_g: 'ringCarb',
  fat_g: 'ringFat',
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

export default function DashboardScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD);
  const [logsRange, setLogsRange] = useState<MealLogRange>('today');
  const status = useSessionStore((state) => state.status);
  const userPlan = useSessionStore((state) => state.user?.plan ?? 'FREE');
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const isAuthenticated = status === 'authenticated';
  const { t, locale } = useTranslation();
  const premiumState = usePremiumStore((state) => state.status);
  const isPremium = premiumState?.isPremium ?? userPlan === 'PREMIUM';

  const { data, isLoading, isFetching, error, refetch, isStaleFromCache } = useDashboardSummary(period, {
    enabled: isAuthenticated,
  });

  const showEmpty = data ? !data.calories.hasData : false;
  const emptyMessage = period === 'thisWeek' ? t('dashboard.empty.week') : t('dashboard.empty.generic');

  const logsQuery = useQuery({
    queryKey: ['mealLogs', logsRange, locale],
    queryFn: () => getMealLogs({ range: logsRange, limit: 100 }),
    enabled: isAuthenticated,
  });

const streakQuery = useQuery({
  queryKey: ['streak', locale],
  queryFn: async () => {
    const response = await getStreak();
    await cacheStreak(response.streak);
    return response.streak;
  },
  enabled: isAuthenticated,
  staleTime: 1000 * 60 * 15,
});

  const queryClient = useQueryClient();
  const [favoriteToggleId, setFavoriteToggleId] = useState<string | null>(null);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ log, targetState }: { log: MealLogSummary; targetState: boolean }) => {
      if (targetState) {
        const draft = buildFavoriteDraftFromSummary(log);
        await createFavoriteMeal(draft);
      } else if (log.favorite_meal_id) {
        await deleteFavoriteMeal(log.favorite_meal_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', period, locale] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'お気に入りの更新に失敗しました。';
      Alert.alert('お気に入りの更新に失敗しました', message);
    },
    onSettled: () => {
      setFavoriteToggleId(null);
    },
  });

  const logs = logsQuery.data?.items ?? [];

  const handleToggleFavorite = (log: MealLogSummary, targetState: boolean) => {
    setFavoriteToggleId(log.id);
    toggleFavoriteMutation.mutate({ log, targetState });
  };

  const ringData = useMemo(() => {
    if (!data?.comparison) {
      return null;
    }
    const macros = MACRO_ORDER.flatMap((key) => {
      const macro = data.comparison.macros.find((entry) => entry.key === key);
      if (!macro) {
        return [];
      }
      const config: MacroRingProps = {
        label: t(MACRO_LABEL_KEY[key]),
        current: macro.current,
        target: macro.target,
        unit: 'g',
        colorToken: MACRO_COLOR_TOKEN[key],
      };
      return [config];
    });

    return {
      total: {
        label: t('tab.calories'),
        current: data.comparison.totals.current,
        target: data.comparison.totals.target,
        unit: 'kcal',
        colorToken: 'ringKcal',
      },
      macros,
    };
  }, [data?.comparison, t]);

  const handleLogout = async () => {
    try {
      setStatus('loading');
      await logout();
      setUser(null);
      setUsage(null);
      setStatus('unauthenticated');
    } catch (err) {
      console.warn('Failed to logout', err);
      setStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t('dashboard.title')}</Text>
            <Text style={styles.subtitle}>{periodLabel(period, t)}</Text>
            {isAuthenticated && streakQuery.data ? (
              <Text style={styles.streakBadge}>🔥 {streakQuery.data.current} {t('streak.days')}</Text>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <PeriodSelector period={period} onChange={setPeriod} />
            {isAuthenticated ? (
              <Text style={styles.logoutLink} onPress={handleLogout}>
                {t('dashboard.logout')}
              </Text>
            ) : null}
          </View>
        </View>

        {!isAuthenticated ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{t('dashboard.requiresLogin')}</Text>
            <Text style={styles.errorHint}>{t('dashboard.loginHint')}</Text>
          </View>
        ) : isLoading && !data ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : error && !data ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{t('dashboard.loadError')}</Text>
            <Text style={styles.errorHint}>{t('dashboard.reloadHint')}</Text>
          </View>
        ) : data ? (
          <View style={styles.dashboardBody}>
            {isStaleFromCache && (
              <Text style={styles.cacheBanner}>{t('dashboard.cacheNotice')}</Text>
            )}

            {ringData ? (
              <>
                <View style={styles.topRow}>
                  <View style={styles.calorieRingContainer}>
                    <CalorieRing data={ringData.total} t={t} />
                  </View>
                  {isPremium ? (
                    <MonthlyDeficitCard summary={data.summary} targets={data.targets} t={t} />
                  ) : (
                    <View style={[styles.monthlyCard, styles.lockedCard]}>
                      <View style={styles.premiumLockHeader}>
                        <Feather name="lock" size={16} color={colors.textSecondary} />
                        <Text style={styles.lockedTitle}>{t('dashboard.premiumLocked.monthlyTitle')}</Text>
                      </View>
                      <Text style={styles.lockedSubtitle}>{t('dashboard.premiumLocked.monthlyDescription')}</Text>
                      <TouchableOpacity style={styles.lockedButton} onPress={() => router.push('/paywall')}>
                        <Text style={styles.lockedButtonLabel}>{t('dashboard.premiumLocked.cta')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <View style={styles.macroRow}>
                  {ringData.macros.map((macro) => (
                    <MacroRing key={macro.label} data={macro} t={t} />
                  ))}
                </View>
              </>
            ) : null}

            {data.comparison && isPremium ? <PeriodComparisonCard comparison={data.comparison} /> : null}

            <View style={styles.section}>
              <View style={styles.card}>
          <CalorieLineChart points={data.calories.points} target={data.calories.targetLine} />
              </View>
              <MealPeriodBreakdown entries={data.calories.mealPeriodBreakdown} />
              {showEmpty && <EmptyStateCard message={emptyMessage} />}
            </View>

            <View style={styles.section}>
              {logsQuery.isLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <RecentLogsList
                  logs={logs}
                  range={logsRange}
                  onRangeChange={setLogsRange}
                  onToggleFavorite={handleToggleFavorite}
                  togglingId={favoriteToggleId}
                />
              )}
            </View>
          </View>
        ) : (
          <EmptyStateCard message={emptyMessage} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function periodLabel(period: DashboardPeriod, t: (key: string, params?: Record<string, string | number>) => string) {
  switch (period) {
    case 'today':
      return t('period.today');
    case 'yesterday':
      return t('period.yesterday');
    case 'thisWeek':
      return t('period.thisWeek');
    case 'lastWeek':
      return t('period.lastWeek');
    case 'custom':
      return t('period.custom');
    default:
      return '';
  }
}

interface MonthlyDeficitCardProps {
  summary: DashboardSummary;
  targets: DashboardTargets;
  t: Translate;
}

function MonthlyDeficitCard({ summary, targets, t }: MonthlyDeficitCardProps) {
  const timezone = summary.range.timezone;
  let now = DateTime.now();
  if (timezone) {
    const zonedNow = DateTime.now().setZone(timezone);
    if (zonedNow.isValid) {
      now = zonedNow;
    }
  }

  const targetDaily = typeof targets.calories === 'number' ? targets.calories : null;

  // 今月のエントリーを全て集計
  let totalDelta = 0;
  let dayCount = 0;
  
  if (targetDaily !== null) {
    summary.calories.daily.forEach((entry) => {
      const entryDate = DateTime.fromISO(entry.date, { zone: timezone });
      if (entryDate.isValid && entryDate.hasSame(now, 'month') && entryDate.hasSame(now, 'year')) {
        const delta = entry.total - targetDaily;
        totalDelta += delta;
        dayCount++;
      }
    });
  }

  const averageDailyDelta = dayCount > 0 ? totalDelta / dayCount : 0;
  const color = totalDelta < 0 ? colors.success : totalDelta > 0 ? colors.error : colors.textSecondary;

  return (
    <View style={styles.monthlyCard}>
      <Text style={styles.monthlyLabel}>{t('dashboard.monthlyDeficit.title')}</Text>
      <Text style={[styles.monthlyValue, { color }]}>{formatDelta(totalDelta)}</Text>
      <Text style={styles.monthlyMeta}>
        {t('dashboard.monthlyDeficit.subtitle', {
          days: dayCount,
          daily: formatDelta(averageDailyDelta),
        })}
      </Text>
    </View>
  );
}

function formatDelta(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) {
    return '0 kcal';
  }
  const absValue = Math.abs(rounded).toLocaleString();
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${absValue} kcal`;
}

const LARGE_RING_SIZE = 140;
const LARGE_STROKE_WIDTH = 12;
const SMALL_RING_SIZE = 110;
const SMALL_STROKE_WIDTH = 9;

interface CalorieRingProps {
  data: MacroRingProps;
  t: Translate;
}

function CalorieRing({ data, t }: CalorieRingProps) {
  const state = buildRingState(data, t);
  const percentage = Math.round(state.progress * 100);

  return (
    <View style={styles.calorieCard}>
      <Text style={styles.cardLabel}>{data.label}</Text>
      <View style={styles.ringWrapper}>
        <Ring
          size={LARGE_RING_SIZE}
          strokeWidth={LARGE_STROKE_WIDTH}
          progress={state.progress}
          color={state.ringColor}
          trackColor={state.trackColor}
        />
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.percentTextLarge}>{percentage}%</Text>
        </View>
      </View>
      <View style={styles.bottomContainer}>
        <Text style={styles.ratioValueLarge}>
          {state.currentText} / {state.targetText}
        </Text>
        <Text
          style={[
            styles.deltaText,
            state.status === 'over' && styles.deltaTextOver,
          ]}
        >
          {state.deltaText}
        </Text>
      </View>
    </View>
  );
}

interface MacroRingComponentProps {
  data: MacroRingProps;
  t: Translate;
}

function MacroRing({ data, t }: MacroRingComponentProps) {
  const state = buildRingState(data, t);
  const percentage = Math.round(state.progress * 100);

  return (
    <View style={styles.macroCard}>
      <Text style={styles.cardLabel}>{data.label}</Text>
      <View style={styles.ringWrapper}>
        <Ring
          size={SMALL_RING_SIZE}
          strokeWidth={SMALL_STROKE_WIDTH}
          progress={state.progress}
          color={state.ringColor}
          trackColor={state.trackColor}
        />
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.percentText}>{percentage}%</Text>
        </View>
      </View>
      <View style={styles.bottomContainer}>
        <Text style={styles.ratioValue}>
          {state.currentText} / {state.targetText}
        </Text>
        <Text
          style={[
            styles.deltaText,
            state.status === 'over' && styles.deltaTextOver,
          ]}
        >
          {state.deltaText}
        </Text>
      </View>
    </View>
  );
}

interface RingProps {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
}

function Ring({ size, strokeWidth, progress, color, trackColor }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp(progress, 0, 1);
  const dashOffset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {clamped > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </Svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 160,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakBadge: {
    ...textStyles.caption,
    color: colors.accent,
    marginTop: 4,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoutLink: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  title: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  dashboardBody: {
    gap: spacing.lg,
  },
  premiumLockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockedTitle: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  lockedSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  lockedButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.textSecondary,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    opacity: 0.85,
  },
  lockedButtonLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  lockedCard: {
    opacity: 0.4,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cacheBanner: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  calorieRingContainer: {
    flex: 1,
  },
  calorieCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  macroCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthlyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  ringWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  percentTextLarge: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  bottomContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratioValue: {
    ...textStyles.body,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  ratioValueLarge: {
    ...textStyles.titleSmall,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  deltaText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  deltaTextOver: {
    color: colors.error,
    fontWeight: '600',
  },
  monthlyLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  monthlyValue: {
    ...textStyles.headline,
    fontWeight: '700',
    fontSize: 28,
  },
  monthlyMeta: {
    ...textStyles.caption,
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
