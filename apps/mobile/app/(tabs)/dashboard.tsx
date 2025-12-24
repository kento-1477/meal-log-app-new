import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
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
import { CalorieBarChart, defaultCalorieChartConfig } from '@/features/dashboard/components/CalorieBarChart';
import { MonthlyCalorieChart } from '@/features/dashboard/components/MonthlyCalorieChart';
import { MealPeriodBreakdown } from '@/features/dashboard/components/MealPeriodBreakdown';

import { EmptyStateCard } from '@/features/dashboard/components/EmptyStateCard';

import { type MacroRingProps, type RingColorToken } from '@/features/dashboard/components/RemainingRings';
import { buildRingState } from '@/features/dashboard/components/ringMath';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { RecentLogsList } from '@/features/dashboard/components/RecentLogsList';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import {
  logout,
  getMealLogs,
  getMealLogDetail,
  createFavoriteMeal,
  deleteFavoriteMeal,
  getDashboardSummary,
} from '@/services/api';
import { useTranslation } from '@/i18n';
import { buildFavoriteDraftFromDetail, buildFavoriteDraftFromSummary } from '@/utils/favorites';
import { DateTime } from 'luxon';
import { usePremiumStore } from '@/store/premium';
import { useRouter } from 'expo-router';
// Feather icon removed - now using emoji icons
import { LinearGradient } from 'expo-linear-gradient';
import { AuroraBackground } from '@/components/AuroraBackground';
import { useCalorieTrend, type CalorieChartMode } from '@/features/dashboard/useCalorieTrend';

const DEFAULT_PERIOD: DashboardPeriod = 'today';
const brandLogo = require('../../assets/brand/logo.png');
type SegmentKey = 'daily' | 'weekly' | 'monthly';
const CALORIE_CHART_CONFIG = {
  ...defaultCalorieChartConfig,
  colors: {
    ...defaultCalorieChartConfig.colors,
    over: '#ff8a3d',
    under: '#4b7bec',
  },
  bar: {
    ...defaultCalorieChartConfig.bar,
    thicknessMonthly: 8,
    maxMonthly: 10,
  },
};

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
  const [segmentKey, setSegmentKey] = useState<SegmentKey>('daily');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [segmentGroupWidth, setSegmentGroupWidth] = useState(0);
  const segmentHighlight = useRef(new Animated.Value(4)).current;
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
  const segmentOptions = useMemo(
    () => [
      { key: 'daily' as SegmentKey, label: t('dashboard.segment.today') },
      { key: 'weekly' as SegmentKey, label: t('dashboard.segment.week') },
      { key: 'monthly' as SegmentKey, label: t('dashboard.segment.month') },
    ],
    [t],
  );
  const activeSegmentIndex = segmentOptions.findIndex((option) => option.key === segmentKey);
  const segmentButtonWidth = useMemo(() => {
    if (segmentGroupWidth <= 0 || segmentOptions.length === 0) {
      return 0;
    }
    const gap = 4;
    const horizontalPadding = 8; // segmentGroup padding (left+right)
    return (segmentGroupWidth - horizontalPadding - gap * (segmentOptions.length - 1)) / segmentOptions.length;
  }, [segmentGroupWidth, segmentOptions.length]);

  useEffect(() => {
    if (segmentButtonWidth <= 0 || activeSegmentIndex < 0) {
      return;
    }
    const gap = 4;
    const target = 4 + activeSegmentIndex * (segmentButtonWidth + gap);
    Animated.timing(segmentHighlight, {
      toValue: target,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [activeSegmentIndex, segmentButtonWidth, segmentHighlight]);
  const handleSegmentChange = (key: SegmentKey) => {
    setSegmentKey(key);
    if (key === 'daily') {
      setPeriod('today');
      setCustomRange(null);
      return;
    }
    if (key === 'weekly') {
      setPeriod('thisWeek');
      setCustomRange(null);
      return;
    }

    const now = DateTime.now();
    const startDate = now.minus({ days: 29 }).startOf('day').toISODate();
    const endDate = now.endOf('day').toISODate();
    setPeriod('custom');
    if (startDate && endDate) {
      setCustomRange({ from: startDate, to: endDate });
    } else {
      setCustomRange(null);
    }
  };

  const { data, isLoading, isFetching, error, refetch, isStaleFromCache } = useDashboardSummary(period, {
    enabled: isAuthenticated,
    range: customRange ?? undefined,
  });
  const chartMode: CalorieChartMode = segmentKey === 'monthly' ? 'monthly' : segmentKey === 'weekly' ? 'weekly' : 'daily';
  const calorieTrend = useCalorieTrend(chartMode, { enabled: isAuthenticated });
  const monthlySummary = useMemo(() => {
    if (chartMode !== 'monthly' || !calorieTrend.points.length) {
      return null;
    }
    const today = DateTime.now().startOf('day');
    const start = today.minus({ days: 29 });
    const bars = [];
    let total = 0;
    let count = 0;
    calorieTrend.points.forEach((point, index) => {
      const dt = DateTime.fromISO(point.date);
      const isToday = dt.isValid ? dt.hasSame(today, 'day') : index === 0;
      const isFuture = dt.isValid ? dt.startOf('day') > today : false;
      const intake = isFuture ? null : point.value;
      if (intake != null) {
        total += intake;
        count += 1;
      }
      bars.unshift({
        day: dt.isValid ? dt.day : index + 1,
        intakeKcal: intake,
        targetKcal: calorieTrend.target,
        isToday,
        rawDate: point.date,
      });
    });
    return {
      bars,
      startDate: start.toISODate(),
      endDate: today.toISODate(),
      averageCalories: count > 0 ? Math.round(total / count) : null,
    };
  }, [chartMode, calorieTrend.points, calorieTrend.target]);

  const logsQuery = useQuery({
    queryKey: ['mealLogs', logsRange, locale],
    queryFn: () => getMealLogs({ range: logsRange, limit: 100 }),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const showEmpty = data ? !data.calories.hasData : false;
  const emptyMessage = period === 'thisWeek' ? t('dashboard.empty.week') : t('dashboard.empty.generic');
  const chartEmptyLabel = t('dashboard.chart.empty');
  const refreshing = isFetching || calorieTrend.isFetching || logsQuery.isFetching;
  const handleRefresh = () => {
    refetch();
    calorieTrend.refetch();
    logsQuery.refetch();
  };

  const queryClient = useQueryClient();
  const [favoriteToggleId, setFavoriteToggleId] = useState<string | null>(null);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ log, targetState }: { log: MealLogSummary; targetState: boolean }) => {
      if (targetState) {
        const draft = log.ai_raw
          ? buildFavoriteDraftFromSummary(log)
          : await (async () => {
            try {
              return buildFavoriteDraftFromDetail((await getMealLogDetail(log.id)).item);
            } catch (_error) {
              return buildFavoriteDraftFromSummary(log);
            }
          })();
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
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <View style={styles.headerLead}>
                <Image source={brandLogo} style={styles.headerLogo} />
                <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                  {t('dashboard.title')}
                </Text>
              </View>
              {isAuthenticated ? (
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                  <Text style={styles.logoutText}>{t('dashboard.logout')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={styles.segmentRow}>
            <View
              style={styles.segmentGroup}
              onLayout={(event) => setSegmentGroupWidth(event.nativeEvent.layout.width)}
              accessibilityRole="tablist"
            >
              {segmentButtonWidth > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.segmentHighlight,
                    {
                      width: segmentButtonWidth,
                      transform: [{ translateX: segmentHighlight }],
                    },
                  ]}
                />
              ) : null}
              {segmentOptions.map((option) => {
                const active = option.key === segmentKey;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    onPress={() => handleSegmentChange(option.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
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
                  {(['primary', 'macro'] as const).map((section) => {
                    if (section === 'primary') {
                      return (
                        <View style={styles.metricRow} key="primary">
                          <View style={[styles.metricCardShell, styles.metricCardTall]}>
                            <CalorieRing data={ringData.total} t={t} />
                          </View>
                          <View style={[styles.metricCardShell, styles.metricCardTall]}>
                            {isPremium ? (
                              <MonthlyDeficitCard summary={data.summary} targets={data.targets} t={t} locale={locale} />
                            ) : (
                              <MonthlyDeficitLockedCard onUpgrade={() => router.push('/paywall')} />
                            )}
                          </View>
                        </View>
                      );
                    }
                    return (
                      <View style={styles.macroRow} key="macro">
                        {ringData.macros.map((macro) => (
                          <View style={styles.macroCardShell} key={`${macro.label}-${macro.colorToken}`}>
                            <MacroRing data={macro} t={t} />
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              ) : null}



              <View style={styles.section}>
                <View style={styles.card}>
                  {chartMode === 'monthly' && monthlySummary ? (
                    <MonthlyCalorieChart
                      days={monthlySummary.bars}
                      startDate={monthlySummary.startDate}
                      endDate={monthlySummary.endDate}
                      averageCalories={monthlySummary.averageCalories}
                    />
                  ) : (
                    <CalorieBarChart
                      points={calorieTrend.points}
                      target={calorieTrend.target}
                      mode={chartMode}
                      config={CALORIE_CHART_CONFIG}
                      isLoading={calorieTrend.isLoading}
                      isFetching={calorieTrend.isFetching}
                      emptyLabel={chartEmptyLabel}
                      stats={calorieTrend.stats}
                    />
                  )}
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
    </AuroraBackground>
  );
}

interface MonthlyDeficitCardProps {
  summary: DashboardSummary;
  targets: DashboardTargets;
  t: Translate;
  locale: string;
}

function MonthlyDeficitCard({ summary, targets, locale }: MonthlyDeficitCardProps) {
  const [helpVisible, setHelpVisible] = useState(false);
  const timezone = summary.range.timezone ?? null;

  const zonedNow = timezone ? DateTime.now().setZone(timezone) : DateTime.now();
  const now = zonedNow.isValid ? zonedNow : DateTime.now();
  const today = now.startOf('day');
  const monthKey = today.toFormat('yyyy-MM');

  let monthStart = today.startOf('month');
  if (timezone) {
    const explicitStart = DateTime.fromObject({ year: today.year, month: today.month, day: 1 }, { zone: timezone });
    if (explicitStart.isValid) {
      monthStart = explicitStart.startOf('day');
    }
  }
  const monthEnd = monthStart.endOf('month').startOf('day');
  const rangeEnd = DateTime.min(today, monthEnd);

  const rangeEndIso = rangeEnd.toISODate();
  const monthRange = {
    from: monthStart.toISODate(),
    to: rangeEndIso,
  } as const;

  const monthlySummaryQuery = useQuery({
    queryKey: ['dashboardSummary', 'monthlyDeficit', monthKey, rangeEndIso, locale],
    queryFn: () => getDashboardSummary('custom', monthRange),
    staleTime: 1000 * 60 * 5,
  });

  const monthlySummary = monthlySummaryQuery.data ?? null;
  const dailyEntries = monthlySummary?.calories.daily ?? [];

  const targetDaily = typeof targets.calories === 'number' ? targets.calories : 0;

  const totalDeficit = dailyEntries.reduce((sum, entry) => {
    if (entry.total <= 0) {
      return sum;
    }
    const dailyDeficit = targetDaily - entry.total;
    return sum + dailyDeficit;
  }, 0);

  const hasMonthlyData = monthlySummary !== null;

  // kg換算: 7200kcal = 1kg
  const fatKg = Math.abs(totalDeficit) / 7200;
  const displayKg = hasMonthlyData ? fatKg.toFixed(1) : '--';
  const displayKcal = hasMonthlyData
    ? (totalDeficit >= 0 ? `-${Math.abs(totalDeficit).toLocaleString()}` : `+${Math.abs(totalDeficit).toLocaleString()}`)
    : '--';

  // ペース判定
  const daysElapsed = dailyEntries.length;
  const expectedDeficitPerDay = targetDaily * 0.15; // 目標の15%削減を基準
  const expectedTotal = expectedDeficitPerDay * daysElapsed;
  const paceStatus = totalDeficit >= expectedTotal * 0.8 ? '順調✓' : '頑張り中';

  const isLoading = monthlySummaryQuery.isLoading && !monthlySummary;

  return (
    <View style={burningStyles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FFF4EC', '#FFEFE4']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={burningStyles.gradientBg}
      />

      {/* ヘッダー: タイトル + ヘルプアイコン */}
      <View style={burningStyles.header}>
        <View style={burningStyles.headerTitle}>
          <View style={burningStyles.fireIconContainer}>
            <Text style={burningStyles.fireIconSmall}>🔥</Text>
          </View>
          <Text style={burningStyles.headerTitleText}>月間脂肪燃焼量</Text>
        </View>
        <TouchableOpacity
          onPress={() => setHelpVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="月間脂肪燃焼量の説明"
          accessibilityRole="button"
        >
          <View style={burningStyles.helpCircle} pointerEvents="none">
            <Text style={burningStyles.helpCircleText}>?</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* メインコンテンツ */}
      <View style={burningStyles.premiumCard}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#FF7043" />
        ) : (
          <>
            <View style={burningStyles.sampleValueRow}>
              <Text style={burningStyles.samplePrefix}>脂肪</Text>
              <Text style={burningStyles.sampleNumber}>{displayKg}</Text>
              <Text style={burningStyles.sampleUnit}>kg</Text>
              <Text style={burningStyles.sampleSuffix}>相当</Text>
            </View>
            <View style={burningStyles.sampleDetailRow}>
              <Text style={burningStyles.sampleDetail}>累計 {displayKcal}kcal</Text>
              <Text style={burningStyles.sampleDetailSeparator}>  </Text>
              <Text style={burningStyles.sampleDetail}>ペース {paceStatus}</Text>
            </View>
          </>
        )}
      </View>

      <MonthlyDeficitHelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} mode="unlocked" />
    </View>
  );
}

interface MonthlyDeficitLockedCardProps {
  onUpgrade: () => void;
}

function MonthlyDeficitLockedCard({ onUpgrade }: MonthlyDeficitLockedCardProps) {
  const [helpVisible, setHelpVisible] = useState(false);

  return (
    <View style={burningStyles.container}>
      {/* 背景グラデーション */}
      <LinearGradient
        colors={['#FFF8F0', '#FFF4EC', '#FFEFE4']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={burningStyles.gradientBg}
      />

      {/* ヘッダー: タイトル + ヘルプアイコン */}
      <View style={burningStyles.header}>
        <View style={burningStyles.headerTitle}>
          <View style={burningStyles.fireIconContainer}>
            <Text style={burningStyles.fireIconSmall}>🔥</Text>
          </View>
          <Text style={burningStyles.headerTitleText}>月間脂肪燃焼量</Text>
        </View>
        <TouchableOpacity
          onPress={() => setHelpVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="月間脂肪燃焼量の説明"
          accessibilityRole="button"
        >
          <View style={burningStyles.helpCircle} pointerEvents="none">
            <Text style={burningStyles.helpCircleText}>?</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* プレビュー説明テキスト */}
      <Text style={burningStyles.previewHint}>解放するとこんな表示に ↓</Text>

      {/* SAMPLEプレビューカード */}
      <View style={burningStyles.sampleCard}>
        <View style={burningStyles.sampleBadge}>
          <Text style={burningStyles.sampleBadgeText}>SAMPLE</Text>
        </View>
        <View style={burningStyles.sampleValueRow}>
          <Text style={burningStyles.samplePrefix}>脂肪</Text>
          <Text style={burningStyles.sampleNumber}>0.8</Text>
          <Text style={burningStyles.sampleUnit}>kg</Text>
          <Text style={burningStyles.sampleSuffix}>相当</Text>
        </View>
        <View style={burningStyles.sampleDetailRow}>
          <Text style={burningStyles.sampleDetail}>累計 -5,600kcal</Text>
          <Text style={burningStyles.sampleDetailSeparator}>  </Text>
          <Text style={burningStyles.sampleDetail}>ペース 順調✓</Text>
        </View>
      </View>

      {/* 区切り線 */}
      <View style={burningStyles.dividerRow}>
        <View style={burningStyles.dividerLine} />
        <Text style={burningStyles.dividerText}>🔒 プレミアム限定</Text>
        <View style={burningStyles.dividerLine} />
      </View>

      {/* CTAボタン */}
      <TouchableOpacity
        style={burningStyles.ctaButtonNew}
        onPress={onUpgrade}
        activeOpacity={0.8}
      >
        <Text style={burningStyles.ctaLabelNew}>✨ プレミアムで解放</Text>
      </TouchableOpacity>

      <MonthlyDeficitHelpModal visible={helpVisible} onClose={() => setHelpVisible(false)} mode="locked" />
    </View>
  );
}

interface MonthlyDeficitHelpModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: 'locked' | 'unlocked';
}

function MonthlyDeficitHelpModal({ visible, onClose, mode = 'unlocked' }: MonthlyDeficitHelpModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={burningStyles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={burningStyles.modalCard}>
          <LinearGradient
            colors={['#FFF8F0', '#FFE8D6']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={burningStyles.modalGradient}
          >
            <Text style={burningStyles.modalTitle}>🔥 月間脂肪燃焼量</Text>

            {/* Fat Illustration */}
            <View style={burningStyles.fatContainer}>
              <Image
                source={require('../../assets/illustrations/fat_character.png')}
                style={burningStyles.fatImage}
                resizeMode="contain"
              />
            </View>

            {/* Clear Explanation */}
            <View style={burningStyles.descriptionBox}>
              <Text style={burningStyles.descriptionText}>
                毎日「目標カロリーより少なく食べられた分」を1ヶ月間積み上げた数値です。{'\n\n'}
                <Text style={burningStyles.highlightText}>7,200kcal</Text> 貯まるごとに
                <Text style={burningStyles.highlightText}>脂肪1kg</Text>の減少に相当します。
              </Text>
              {mode === 'locked' ? (
                <Text style={burningStyles.descriptionNoteText}>
                  <Text style={burningStyles.highlightText}>※PREMIUM</Text>であなたの数値・推移が表示されます。
                </Text>
              ) : null}
            </View>
            {/* Compact Diagram */}
            <View style={burningStyles.diagramBox}>
              <Text style={burningStyles.diagramTitle}>計算イメージ</Text>

              <View style={burningStyles.calculationRow}>
                <View style={burningStyles.calcBox}>
                  <Text style={burningStyles.calcLabel}>目標</Text>
                  <Text
                    style={burningStyles.calcValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    ◯◯◯◯
                  </Text>
                </View>
                <Text style={burningStyles.calcOperator}>−</Text>
                <View style={burningStyles.calcBox}>
                  <Text style={burningStyles.calcLabel}>摂取</Text>
                  <Text
                    style={burningStyles.calcValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    ◯◯◯◯
                  </Text>
                </View>
                <Text style={burningStyles.calcOperator}>=</Text>
                <View style={burningStyles.calcBox}>
                  <Text style={burningStyles.calcLabel}>燃焼</Text>
                  <Text
                    style={burningStyles.calcValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    ◯◯◯
                  </Text>
                </View>
              </View>
              <View style={burningStyles.monthlyResultBox}>
                <Text style={burningStyles.monthlyResultText}>月間合計 = ◯◯◯◯ kcal 🔥</Text>
              </View>
              <Text style={burningStyles.noteText}>※一ヶ月分を積み上げたイメージ</Text>
            </View>

            <TouchableOpacity style={burningStyles.modalCloseBtn} onPress={onClose}>
              <Text style={burningStyles.modalCloseBtnText}>閉じる</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Burning Reward専用スタイル（プロ品質・他セクションと統一）
const burningStyles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 2,
  },
  premiumBadge: {
    backgroundColor: '#FF7043',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  helpCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCircleText: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(0,0,0,0.55)',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2C2C2E',
    textAlign: 'center',
    marginTop: 10,
  },
  fireContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    marginTop: 6,
  },
  fireEmoji: {
    fontSize: 34,
    textShadowColor: 'rgba(255,120,60,0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    marginHorizontal: 12,
    marginTop: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  resultLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 4,
    fontWeight: '500',
  },
  resultMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  lockedResultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  resultPrefix: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2C2E',
    marginRight: 6,
  },
  blurredValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FF6B35',
    opacity: 0.75,
    marginRight: 6,
    letterSpacing: 1.5,
  },
  resultUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2C2E',
    marginRight: 4,
  },
  resultHighlight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },
  resultSuffix: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2C2C2E',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    opacity: 0.55,
  },
  previewPill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,107,53,0.35)',
    marginHorizontal: 4,
  },
  previewPillSm: {
    width: 10,
  },
  previewPillMd: {
    width: 16,
  },
  previewPillLg: {
    width: 22,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(232,93,4,0.18)',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 12,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  ctaEmoji: {
    fontSize: 12,
  },
  ctaLabel: {
    color: '#E85D04',
    fontSize: 13,
    fontWeight: '800',
  },
  // 案F: Header with title
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C2C2E',
  },
  fireIconContainer: {
    width: 28,
    height: 28,
    backgroundColor: 'rgba(255, 240, 230, 0.9)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireIconSmall: {
    fontSize: 16,
  },
  // 案F: Preview hint text
  previewHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  // 案F: Sample preview card
  sampleCard: {
    backgroundColor: 'rgba(255, 248, 244, 0.95)',
    borderColor: 'rgba(255, 140, 100, 0.2)',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    position: 'relative',
  },
  sampleBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    backgroundColor: 'rgba(255, 112, 67, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sampleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF7043',
    letterSpacing: 0.5,
  },
  sampleValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
  },
  samplePrefix: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginRight: 6,
  },
  sampleNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF7043',
  },
  sampleUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginLeft: 2,
  },
  sampleSuffix: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginLeft: 4,
  },
  sampleDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleDetail: {
    fontSize: 11,
    color: '#888',
  },
  sampleDetailSeparator: {
    fontSize: 11,
    color: '#CCC',
    marginHorizontal: 6,
  },
  // 案F: Divider with lock
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  dividerText: {
    fontSize: 11,
    color: '#AAA',
    marginHorizontal: 10,
  },
  // 案F: New CTA button
  ctaButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF7043',
    borderRadius: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 14,
    shadowColor: '#FF7043',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaLabelNew: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // 案F: Premium card content area
  premiumCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  // モーダル
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    maxWidth: 340,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
  },
  fatContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  fatImage: {
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  descriptionBox: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#2C2C2E',
    lineHeight: 21,
  },
  descriptionNoteText: {
    marginTop: 10,
    fontSize: 12,
    color: '#2C2C2E',
    lineHeight: 18,
  },
  highlightText: {
    color: '#FF7043',
    fontWeight: '700',
  },
  diagramBox: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  diagramTitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  calculationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  calcBox: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  calcLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 2,
  },
  calcValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2E',
  },
  calcOperator: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF7043',
    marginHorizontal: 8,
  },
  monthlyResultBox: {
    backgroundColor: '#FFA500',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  monthlyResultText: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
  },
  noteText: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
  modalCloseBtn: {
    backgroundColor: '#FF7043',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

// MonthlyProgressMeter and formatDelta removed - no longer used in new design

const LARGE_RING_SIZE = 132;
const LARGE_STROKE_WIDTH = 10;
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
    <View style={styles.metricCardContent}>
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
    <View style={styles.macroCardContent}>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 4,
    gap: spacing.md,
  },
  headerBlock: {
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  headerLogo: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  logoutButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  logoutText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 4,
  },
  segmentGroup: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 4,
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentButtonActive: {},
  segmentLabel: {
    ...textStyles.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  segmentHighlight: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dashboardBody: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
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
  lockedDeficitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  lockedDeficitValue: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  lockedDeficitDays: {
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
    opacity: 0.85,
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
    backgroundColor: colors.surfaceStrong,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricCardShell: {
    flex: 1,
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: colors.surfaceStrong,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    minHeight: 230,
  },
  metricCardTall: {
    minHeight: 240,
  },
  metricCardContent: {
    flex: 1,
    gap: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  macroCardShell: {
    flex: 1,
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: colors.surfaceStrong,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    minHeight: 210,
  },
  macroCardContent: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthlyCard: {
    flex: 1,
    gap: spacing.md,
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
  monthlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthlyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthlyWhereLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  monthlyLabelMultiline: {
    ...textStyles.caption,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  monthlyValue: {
    ...textStyles.titleLarge,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  monthlyProgressContainer: {
    height: 56,
    borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.2)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  monthlyProgressSvg: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  monthlyProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: '100%',
  },
  monthlyProgressLoader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -10,
    marginLeft: -10,
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
  lockedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lockedMaskedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  lockedMaskedValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  lockedCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  lockedCtaLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 20,
    padding: spacing.lg,
    maxWidth: 340,
    width: '100%',
    gap: spacing.md,
  },
  modalTitle: {
    ...textStyles.titleMedium,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBody: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  modalButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
