import { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DashboardPeriod } from '@meal-log/shared';
import { useDashboardSummary } from '@/features/dashboard/useDashboardSummary';
import { PeriodSelector } from '@/features/dashboard/components/PeriodSelector';
import { TabBar, type TabKey } from '@/features/dashboard/components/TabBar';
import { SummaryHeader } from '@/features/dashboard/components/SummaryHeader';
import { CalorieLineChart } from '@/features/dashboard/components/CalorieLineChart';
import { MealPeriodBreakdown } from '@/features/dashboard/components/MealPeriodBreakdown';
import { MacroProgressList } from '@/features/dashboard/components/MacroProgressList';
import { NutrientTable } from '@/features/dashboard/components/NutrientTable';
import { EmptyStateCard } from '@/features/dashboard/components/EmptyStateCard';
import { PeriodComparisonCard } from '@/features/dashboard/components/PeriodComparisonCard';
import { PFCDonutChart } from '@/features/dashboard/components/PFCDonutChart';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { logout } from '@/services/api';
import { useTranslation } from '@/i18n';

const DEFAULT_PERIOD: DashboardPeriod = 'thisWeek';

export default function DashboardScreen() {
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD);
  const [activeTab, setActiveTab] = useState<TabKey>('calories');
  const status = useSessionStore((state) => state.status);
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const isAuthenticated = status === 'authenticated';
  const { t } = useTranslation();

  const { data, isLoading, isFetching, error, refetch, isStaleFromCache } = useDashboardSummary(period, {
    enabled: isAuthenticated,
  });

  const showEmpty = data ? !data.calories.hasData : false;
  const emptyMessage = period === 'thisWeek' ? t('dashboard.empty.week') : t('dashboard.empty.generic');

  const handleLogout = async () => {
    try {
      setStatus('loading');
      await logout();
      setUser(null);
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

            <SummaryHeader remaining={data.header.remaining} totals={data.header.totals} />

            {data.comparison ? <PeriodComparisonCard comparison={data.comparison} /> : null}

            <TabBar active={activeTab} onChange={setActiveTab} />

            {activeTab === 'calories' && (
              <View style={styles.section}>
                <View style={styles.card}>
                  <CalorieLineChart points={data.calories.points} target={data.calories.targetLine} />
                </View>
                <MealPeriodBreakdown entries={data.calories.mealPeriodBreakdown} comparison={data.comparison?.mealPeriods ?? null} />
                {showEmpty && <EmptyStateCard message={emptyMessage} />}
              </View>
            )}

            {activeTab === 'macros' && (
              <View style={[styles.card, styles.section]}>
                <PFCDonutChart macros={data.macros} />
                <MacroProgressList macros={data.macros} comparison={data.comparison?.macros ?? null} />
              </View>
            )}

            {activeTab === 'nutrients' && (
              <View style={styles.section}>
                <NutrientTable data={data.nutrients} />
              </View>
            )}
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
