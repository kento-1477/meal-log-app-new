import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { MealLogSummary, MealLogRange } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import {
  deleteMealLogEntry,
  getMealLogs,
  restoreMealLogEntry,
} from '@/services/api';

const RANGE_OPTIONS: Array<{ value: MealLogRange; labelKey: string }> = [
  { value: 'today', labelKey: 'history.range.today' },
  { value: 'week', labelKey: 'history.range.week' },
  { value: 'twoWeeks', labelKey: 'history.range.twoWeeks' },
  { value: 'threeWeeks', labelKey: 'history.range.threeWeeks' },
  { value: 'month', labelKey: 'history.range.month' },
];

export default function MealLogHistoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useTranslation();
  const [range, setRange] = useState<MealLogRange>('today');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ['mealLogs', range, locale],
    queryFn: () => getMealLogs({ range, limit: 100 }),
  });

  const logs = logsQuery.data?.items ?? [];
  const timezone = logsQuery.data?.timezone ?? null;

  const deleteMutation = useMutation({
    mutationFn: (logId: string) => deleteMealLogEntry(logId),
    onSuccess: (_res, logId) => {
      invalidateQueries(logId);
    },
    onError: () => {
      Alert.alert(t('history.delete.failedTitle'), t('history.delete.failedMessage'));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (logId: string) => restoreMealLogEntry(logId),
    onSuccess: (_res, logId) => {
      invalidateQueries(logId);
      Alert.alert(t('history.restore.success'));
    },
    onError: () => {
      Alert.alert(t('history.restore.failed'));
    },
  });

  const handleDelete = (log: MealLogSummary) => {
    Alert.alert(t('history.delete.confirmTitle'), t('history.delete.confirmMessage', { dish: log.dish }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => confirmDelete(log.id),
      },
    ]);
  };

  const confirmDelete = (logId: string) => {
    setDeletingId(logId);
    deleteMutation.mutate(logId, {
      onSuccess: () => {
        Alert.alert(t('history.delete.successTitle'), t('history.delete.successMessage'), [
          {
            text: t('history.delete.undo'),
            onPress: () => restoreMutation.mutate(logId),
          },
          { text: t('common.close'), style: 'cancel' },
        ]);
      },
    });
  };

  const invalidateQueries = (logId: string) => {
    queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
    queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['logDetail', logId] });
  };

  const renderItem = ({ item }: { item: MealLogSummary }) => {
    const createdAt = formatTimestamp(item.created_at, locale, timezone ?? undefined);
    const mealPeriodLabel = item.meal_period ? t(`meal.${item.meal_period}`) : t('meal.unknown');
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/log/${item.id}`)}
        accessibilityRole="button"
      >
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{item.dish}</Text>
          <Text style={styles.rowMeta}>
            {mealPeriodLabel} · {createdAt}
          </Text>
          <Text style={styles.rowMacros}>
            {Math.round(item.calories)} kcal · P {Math.round(item.protein_g)}g · F {Math.round(item.fat_g)}g · C {Math.round(item.carbs_g)}g
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={(event) => {
            event.stopPropagation();
            handleDelete(item);
          }}
          disabled={deletingId === item.id || deleteMutation.isPending}
        >
          {deletingId === item.id && deleteMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteButtonLabel}>{t('common.delete')}</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: MealLogSummary) => item.id;

  const header = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{t('history.title')}</Text>
        <Text style={styles.subtitle}>{t('history.subtitle')}</Text>
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => {
            const isActive = option.value === range;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                onPress={() => setRange(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.rangeLabel, isActive && styles.rangeLabelActive]}>{t(option.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {timezone ? <Text style={styles.timezone}>{t('history.timezone', { timezone })}</Text> : null}
      </View>
    ),
    [range, t, timezone],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={logs.length === 0 ? [styles.listContent, styles.emptyContainer] : styles.listContent}
        ListHeaderComponent={header}
        ListEmptyComponent={
          logsQuery.isLoading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('history.empty')}</Text>
              <TouchableOpacity style={styles.primaryCta} onPress={() => router.push('/(tabs)/chat')}>
                <Text style={styles.primaryCtaLabel}>{t('button.record')}</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          logsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={logsQuery.isFetching && !logsQuery.isRefetching}
            onRefresh={() => logsQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      />
    </View>
  );
}

function formatTimestamp(iso: string, locale: string, timezone?: string) {
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
  },
  headerContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...textStyles.heading,
  },
  subtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rangeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}11`,
  },
  rangeLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  rangeLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  timezone: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    ...textStyles.subheading,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  rowMacros: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  deleteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.error,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  primaryCta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryCtaLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
