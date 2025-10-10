import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { GlassCard } from '@/components/GlassCard';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { getDailySummary, getRecentLogs, logout } from '@/services/api';

import { useRouter } from 'expo-router';
import { useSessionStore } from '@/store/session';

export default function DashboardScreen() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const user = useSessionStore((state) => state.user);
  const [refreshing, setRefreshing] = useState(false);
  const summaryQuery = useQuery({ queryKey: ['dailySummary'], queryFn: () => getDailySummary(7) });
  const logsQuery = useQuery({ queryKey: ['recentLogs'], queryFn: getRecentLogs });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([summaryQuery.refetch(), logsQuery.refetch()]);
    setRefreshing(false);
  }, [summaryQuery, logsQuery]);

  const todayTotals = summaryQuery.data?.today ?? { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  const pastWeek = summaryQuery.data?.daily ?? [];

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setStatus('unauthenticated');
    router.replace('/login');
  }, [router, setStatus, setUser]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.greeting}>こんにちは、{user?.username ?? user?.email ?? 'ゲスト'}さん</Text>
          <Text style={styles.greetingCaption}>召し上がったものを振り返りましょう</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>ログアウト</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>今日のサマリー</Text>
        <GlassCard>
          <View style={styles.totalsRow}>
            <MacroStat label="Calories" value={todayTotals.calories} unit="kcal" accent={colors.accent} />
            <MacroStat label="Protein" value={todayTotals.protein_g} unit="g" accent="#ff9f0a" />
            <MacroStat label="Fat" value={todayTotals.fat_g} unit="g" accent="#ff453a" />
            <MacroStat label="Carbs" value={todayTotals.carbs_g} unit="g" accent="#bf5af2" />
          </View>
        </GlassCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7日間トレンド</Text>
        <GlassCard>
          {pastWeek.length === 0 ? (
            <Text style={styles.placeholder}>まだデータがありません。</Text>
          ) : (
            <View style={styles.trendList}>
              {pastWeek.map((day) => (
                <View key={day.date} style={styles.trendRow}>
                  <Text style={styles.trendDate}>{formatDayLabel(day.date)}</Text>
                  <View style={styles.trendBarContainer}>
                    <View style={[styles.trendBar, { width: Math.min(day.calories / 3, 220) }]} />
                  </View>
                  <Text style={styles.trendValue}>{Math.round(day.calories)} kcal</Text>
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近の食事</Text>
        {logsQuery.data?.items?.map((item) => (
          <GlassCard key={item.id} style={styles.mealCard}>
            <Text style={styles.mealTitle}>{item.dish}</Text>
            <Text style={styles.mealTimestamp}>{formatTimestamp(item.created_at)}</Text>
            <View style={styles.mealMacros}>
              <MacroChip label="P" value={item.protein_g} accent="#ff9f0a" />
              <MacroChip label="F" value={item.fat_g} accent="#ff453a" />
              <MacroChip label="C" value={item.carbs_g} accent="#bf5af2" />
            </View>
          </GlassCard>
        )) ?? <Text style={styles.placeholder}>食事ログがまだありません。</Text>}
      </View>
    </ScrollView>
  );
}

function MacroStat({ label, value, unit, accent }: { label: string; value: number; unit: string; accent: string }) {
  return (
    <View style={[styles.macroStat, { borderColor: accent }]}>
      <Text style={[styles.macroLabel, { color: accent }]}>{label}</Text>
      <Text style={styles.macroValue}>{Math.round(value)}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

function MacroChip({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={[styles.macroChip, { backgroundColor: `${accent}22` }]}>
      <Text style={[styles.macroChipLabel, { color: accent }]}>{label}</Text>
      <Text style={[styles.macroChipValue, { color: accent }]}>{Math.round(value)}g</Text>
    </View>
  );
}

function formatDayLabel(date: string) {
  const day = new Date(date);
  return `${day.getMonth() + 1}/${day.getDate()}`;
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greeting: {
    ...textStyles.titleMedium,
  },
  greetingCaption: {
    ...textStyles.caption,
    marginTop: 4,
  },
  logout: {
    color: colors.accent,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    marginBottom: spacing.md,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  macroStat: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  macroValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 6,
  },
  macroUnit: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  placeholder: {
    color: colors.textSecondary,
    ...textStyles.body,
  },
  trendList: {
    gap: spacing.sm,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trendDate: {
    width: 60,
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  trendBarContainer: {
    flex: 1,
    backgroundColor: 'rgba(10, 132, 255, 0.08)',
    borderRadius: 12,
    overflow: 'hidden',
    height: 12,
  },
  trendBar: {
    height: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  trendValue: {
    width: 80,
    textAlign: 'right',
    ...textStyles.caption,
  },
  mealCard: {
    marginBottom: spacing.md,
  },
  mealTitle: {
    ...textStyles.titleMedium,
    marginBottom: spacing.sm,
  },
  mealTimestamp: {
    ...textStyles.caption,
    marginBottom: spacing.sm,
  },
  mealMacros: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  macroChipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  macroChipValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
