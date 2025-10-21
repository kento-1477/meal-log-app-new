import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFavoriteMeal,
  deleteFavoriteMeal,
  deleteMealLogEntry,
  getMealLogDetail,
  getMealLogShare,
  restoreMealLogEntry,
  updateMealLog,
} from '@/services/api';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { buildFavoriteDraftFromDetail } from '@/utils/favorites';
import { useTranslation } from '@/i18n';
import { describeLocale } from '@/utils/locale';
import { useChatStore } from '@/store/chat';

const mealPeriodOptions = [
  { value: 'breakfast', label: '朝食' },
  { value: 'lunch', label: '昼食' },
  { value: 'dinner', label: '夕食' },
  { value: 'snack', label: '間食' },
] as const;

type MealPeriodValue = (typeof mealPeriodOptions)[number]['value'];

type FieldState = {
  dish: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  mealPeriod: MealPeriodValue | null;
};

const initialState: FieldState = {
  dish: '',
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
  mealPeriod: null,
};

export default function MealLogDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FieldState>(initialState);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { locale, t } = useTranslation();
  const updateCardForLog = useChatStore((state) => state.updateCardForLog);

  const logId = params.id ?? '';

  const detailQuery = useQuery({
    queryKey: ['logDetail', logId, locale],
    queryFn: () => getMealLogDetail(logId),
    enabled: Boolean(logId),
  });

  useEffect(() => {
    if (detailQuery.data?.item) {
      const item = detailQuery.data.item;
      setFields({
        dish: item.food_item,
        calories: item.calories.toString(),
        protein: item.protein_g.toString(),
        fat: item.fat_g.toString(),
        carbs: item.carbs_g.toString(),
        mealPeriod: (item.meal_period as MealPeriodValue | null) ?? null,
      });
    }
  }, [detailQuery.data?.item]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!logId) return null;
      return updateMealLog(logId, {
        food_item: fields.dish,
        calories: Number(fields.calories),
        protein_g: Number(fields.protein),
        fat_g: Number(fields.fat),
        carbs_g: Number(fields.carbs),
        meal_period: fields.mealPeriod ?? undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['logDetail', logId] });
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      if (result?.item && logId) {
        updateCardForLog(logId, {
          dish: result.item.food_item,
          mealPeriod: result.item.meal_period ?? null,
          totals: {
            kcal: result.item.calories,
            protein_g: result.item.protein_g,
            fat_g: result.item.fat_g,
            carbs_g: result.item.carbs_g,
          },
        });
      }
      Alert.alert('保存しました');
    },
    onError: (error) => {
      console.error(error);
      Alert.alert('保存に失敗しました', '時間をおいて再度お試しください。');
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (targetState: boolean) => {
      const current = detailQuery.data?.item;
      if (!current) return;
      if (targetState) {
        const draft = buildFavoriteDraftFromDetail(current);
        await createFavoriteMeal(draft);
      } else if (current.favorite_meal_id) {
        await deleteFavoriteMeal(current.favorite_meal_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logDetail', logId, locale] });
      queryClient.invalidateQueries({ queryKey: ['recentLogs', locale] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'お気に入りの更新に失敗しました';
      Alert.alert('お気に入りの更新に失敗しました', message);
    },
  });

  const detail = detailQuery.data?.item;
  const isLoading = detailQuery.isLoading;

  const handleChange = (key: keyof FieldState, value: string | MealPeriodValue | null) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!fields.dish.trim()) {
      Alert.alert('料理名を入力してください');
      return;
    }

    mutation.mutate();
  };

  const historyEntries = detail?.history ?? [];
  const timeHistoryEntries = detail?.time_history ?? [];

  const handleShare = async () => {
    if (!logId) return;
    try {
      setSharing(true);
      const response = await getMealLogShare(logId);
      await Share.share({ message: response.share.text });
    } catch (_error) {
      Alert.alert('共有に失敗しました', '時間をおいて再度お試しください。');
    } finally {
      setSharing(false);
    }
  };

  const handleFavoriteToggle = (targetState: boolean) => {
    toggleFavoriteMutation.mutate(targetState);
  };

  const handleDelete = () => {
    if (!logId) {
      return;
    }
    Alert.alert(t('logs.deleteConfirm.title'), t('logs.deleteConfirm.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void performDelete(logId),
      },
    ]);
  };

  async function performDelete(targetId: string) {
    try {
      setDeleting(true);
      await deleteMealLogEntry(targetId);
      invalidateQueries(targetId);
      Alert.alert(t('logs.deleted.title'), t('logs.deleted.message'), [
        {
          text: t('logs.deleted.undo'),
          onPress: () => void undoDelete(targetId),
        },
        {
          text: t('common.close'),
          style: 'cancel',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Failed to delete meal log', error);
      Alert.alert(t('logs.deleted.failed'));
    } finally {
      setDeleting(false);
    }
  }

  async function undoDelete(targetId: string) {
    try {
      await restoreMealLogEntry(targetId);
      invalidateQueries(targetId);
      Alert.alert(t('logs.restore.success'));
    } catch (error) {
      console.error('Failed to restore meal log', error);
      Alert.alert(t('logs.restore.failed'));
    }
  }

  function invalidateQueries(targetId: string) {
    queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['streak'] });
    queryClient.invalidateQueries({ queryKey: ['logDetail', targetId] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : !detail ? (
        <View style={styles.loadingContainer}>
          <Text style={textStyles.body}>データを取得できませんでした。</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={[
                styles.favoriteButton,
                detail?.favorite_meal_id ? styles.favoriteButtonActive : null,
              ]}
              onPress={() => handleFavoriteToggle(!(detail?.favorite_meal_id))}
              disabled={toggleFavoriteMutation.isPending}
            >
              {toggleFavoriteMutation.isPending ? (
                <ActivityIndicator color={detail?.favorite_meal_id ? '#fff' : colors.accent} />
              ) : (
                <Text
                  style={[
                    styles.favoriteButtonLabel,
                    detail?.favorite_meal_id ? styles.favoriteButtonActiveLabel : null,
                  ]}
                >
                  {detail?.favorite_meal_id ? 'お気に入り済み' : 'お気に入り登録'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={sharing}>
              <Text style={styles.shareButtonLabel}>{sharing ? '共有中…' : '共有する'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteButtonLabel}>{t('common.delete')}</Text>
              )}
            </TouchableOpacity>
          </View>
          {detail.image_url ? <Image source={{ uri: detail.image_url }} style={styles.heroImage} /> : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>基本情報</Text>
            {detail.fallback_applied && detail.requested_locale && detail.locale && detail.requested_locale !== detail.locale ? (
              <Text style={styles.fallbackNote}>
                ※ {describeLocale(detail.requested_locale)} の翻訳が未対応のため {describeLocale(detail.locale)} で表示しています
              </Text>
            ) : null}
            <Text style={styles.label}>料理名</Text>
            <TextInput
              value={fields.dish}
              onChangeText={(text) => handleChange('dish', text)}
              style={styles.input}
              placeholder="例: グリルチキンサラダ"
            />

            <View style={styles.gridRow}>
              <FieldInput
                label="カロリー"
                unit="kcal"
                value={fields.calories}
                onChangeText={(text) => handleChange('calories', text)}
              />
              <FieldInput
                label="タンパク質"
                unit="g"
                value={fields.protein}
                onChangeText={(text) => handleChange('protein', text)}
              />
            </View>
            <View style={styles.gridRow}>
              <FieldInput
                label="脂質"
                unit="g"
                value={fields.fat}
                onChangeText={(text) => handleChange('fat', text)}
              />
              <FieldInput
                label="炭水化物"
                unit="g"
                value={fields.carbs}
                onChangeText={(text) => handleChange('carbs', text)}
              />
            </View>

            <Text style={[styles.label, { marginTop: spacing.lg }]}>時間帯タグ</Text>
            <View style={styles.mealPeriodRow}>
              {mealPeriodOptions.map((option) => {
                const isActive = fields.mealPeriod === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.mealPeriodChip, isActive && styles.mealPeriodChipActive]}
                    onPress={() => handleChange('mealPeriod', option.value)}
                  >
                    <Text style={[styles.mealPeriodLabel, isActive && styles.mealPeriodLabelActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, mutation.isLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={mutation.isLoading}
          >
            <Text style={styles.saveButtonText}>{mutation.isLoading ? '保存中...' : '変更を保存'}</Text>
          </TouchableOpacity>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>編集履歴</Text>
            {historyEntries.length === 0 ? (
              <Text style={styles.placeholder}>まだ編集履歴はありません。</Text>
            ) : (
              historyEntries.map((entry) => (
                <View key={entry.id} style={styles.historyCard}>
                  <Text style={styles.historyTitle}>
                    {formatTimestamp(entry.created_at)} · {entry.user_name ?? entry.user_email ?? 'ユーザー'}
                  </Text>
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <Text key={field} style={styles.historyChange}>
                      {formatFieldLabel(field)}: {formatChange(change)}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>時間帯履歴</Text>
            {timeHistoryEntries.length === 0 ? (
              <Text style={styles.placeholder}>{t('history.timeHistory.empty')}</Text>
            ) : (
              timeHistoryEntries.map((entry) => (
                <View key={entry.id} style={styles.historyCard}>
                  {(() => {
                    const sourceLabel = describeHistorySource(entry.source, t);
                    const previousLabel = describeMealPeriod(entry.previous, t);
                    const nextLabel = describeMealPeriod(entry.next, t);
                    return (
                      <>
                        <Text style={styles.historyTitle}>
                          {formatTimestamp(entry.changed_at)} · {sourceLabel}
                        </Text>
                        <Text style={styles.historyChange}>{`${previousLabel} → ${nextLabel}`}</Text>
                      </>
                    );
                  })()}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function FieldInput({
  label,
  unit,
  value,
  onChangeText,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWithUnit}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          style={[styles.input, { flex: 1 }]}
          keyboardType="decimal-pad"
        />
        <Text style={styles.unitLabel}>{unit}</Text>
      </View>
    </View>
  );
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

function describeHistorySource(source: string | null | undefined, t: Translator) {
  if (source === 'manual') {
    return t('history.timeHistory.source.manual');
  }
  return t('history.timeHistory.source.auto');
}

function describeMealPeriod(value: string | null | undefined, t: Translator) {
  if (!value) {
    return t('history.timeHistory.none');
  }
  return t(`meal.${value}`);
}

function formatFieldLabel(field: string) {
  switch (field) {
    case 'foodItem':
      return '料理名';
    case 'calories':
      return 'カロリー';
    case 'proteinG':
      return 'タンパク質';
    case 'fatG':
      return '脂質';
    case 'carbsG':
      return '炭水化物';
    case 'mealPeriod':
      return '時間帯タグ';
    default:
      return field;
  }
}

function formatChange(change: unknown) {
  if (!change || typeof change !== 'object') return '-';
  const record = change as { before?: unknown; after?: unknown };
  return `${record.before ?? '-'} → ${record.after ?? '-'}`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: 120,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  favoriteButton: {
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#fff',
  },
  favoriteButtonActive: {
    backgroundColor: colors.accent,
  },
  favoriteButtonLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  favoriteButtonActiveLabel: {
    color: '#fff',
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  shareButtonLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  deleteButton: {
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.error,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
  },
  fallbackNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    ...textStyles.body,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unitLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  mealPeriodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mealPeriodChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealPeriodChipActive: {
    backgroundColor: `${colors.accent}22`,
    borderColor: colors.accent,
  },
  mealPeriodLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  mealPeriodLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 24,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  placeholder: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
  },
  historyTitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  historyChange: {
    ...textStyles.body,
  },
});
