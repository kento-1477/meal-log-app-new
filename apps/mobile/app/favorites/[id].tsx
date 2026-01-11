import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FavoriteMeal } from '@meal-log/shared';
import {
  createFavoriteMeal,
  deleteFavoriteMeal,
  getFavoriteDetail,
  updateFavoriteMeal,
} from '@/services/api';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface ItemFormState {
  id?: number;
  name: string;
  grams: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
}

const emptyItem = (): ItemFormState => ({
  name: '',
  grams: '',
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
});

export default function FavoriteDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale, t } = useTranslation();
  const rawId = params.id ?? 'new';
  const isNew = rawId === 'new';
  const numericId = !isNew ? Number(rawId) : null;

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [items, setItems] = useState<ItemFormState[]>([emptyItem()]);

  const detailQuery = useQuery({
    queryKey: ['favoriteDetail', numericId],
    queryFn: async () => {
      if (!numericId) return null;
      const response = await getFavoriteDetail(numericId);
      return response.item;
    },
    enabled: Boolean(numericId),
  });

  useEffect(() => {
    if (detailQuery.data) {
      const favorite = detailQuery.data;
      setName(favorite.name);
      setNotes(favorite.notes ?? '');
      setKcal(String(Math.round(favorite.totals.kcal)));
      setProtein(String(favorite.totals.protein_g));
      setFat(String(favorite.totals.fat_g));
      setCarbs(String(favorite.totals.carbs_g));
      setItems(
        favorite.items.map((item) => ({
          id: item.id,
          name: item.name,
          grams: String(item.grams),
          calories: item.calories != null ? String(item.calories) : '',
          protein: item.protein_g != null ? String(item.protein_g) : '',
          fat: item.fat_g != null ? String(item.fat_g) : '',
          carbs: item.carbs_g != null ? String(item.carbs_g) : '',
        })),
      );
    }
  }, [detailQuery.data]);

  const createMutation = useMutation({
    mutationFn: createFavoriteMeal,
    onSuccess: () => {
      invalidateLists();
      Alert.alert(t('favorites.saveSuccess'));
      router.back();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('favorites.saveFailedMessage');
      Alert.alert(t('favorites.saveFailedTitle'), message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildUpdatePayload>) => updateFavoriteMeal(numericId!, payload),
    onSuccess: () => {
      invalidateLists();
      Alert.alert(t('favorites.updateSuccess'));
      router.back();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('favorites.updateFailedMessage');
      Alert.alert(t('favorites.updateFailedTitle'), message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFavoriteMeal(id),
    onSuccess: () => {
      invalidateLists();
      Alert.alert(t('favorites.deleteSuccess'));
      router.back();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t('favorites.deleteFailedMessage');
      Alert.alert(t('favorites.deleteFailedTitle'), message);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const favorite = detailQuery.data;

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleChangeItem = (index: number, key: keyof ItemFormState, value: string) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  };

  const handleSave = () => {
    if (!canSave) {
      Alert.alert(t('favorites.requiredTitle'), t('favorites.requiredMessage'));
      return;
    }
    const payload = buildUpdatePayload({ name, notes, kcal, protein, fat, carbs, items, favorite });
    if (isNew) {
      createMutation.mutate(payload);
    } else if (numericId) {
      updateMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (!numericId) return;
    Alert.alert(t('favorites.deleteConfirmTitle'), t('favorites.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(numericId),
      },
    ]);
  };

  const headerTitle = isNew ? t('favorites.createTitle') : favorite?.name ?? t('favorites.title');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {detailQuery.isLoading && !isNew ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('favorites.section.name')}</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder={t('favorites.namePlaceholder')} />
            <Text style={styles.sectionLabel}>{t('favorites.section.notes')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, styles.notesInput]}
              placeholder={t('favorites.notesPlaceholder')}
              multiline
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('favorites.section.totals')}</Text>
            <View style={styles.totalsRow}>
              <FieldInput label="kcal" value={kcal} onChangeText={setKcal} keyboardType="numeric" />
              <FieldInput label="P (g)" value={protein} onChangeText={setProtein} keyboardType="numeric" />
            </View>
            <View style={styles.totalsRow}>
              <FieldInput label="F (g)" value={fat} onChangeText={setFat} keyboardType="numeric" />
              <FieldInput label="C (g)" value={carbs} onChangeText={setCarbs} keyboardType="numeric" />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('favorites.section.items')}</Text>
              <TouchableOpacity onPress={handleAddItem}>
                <Text style={styles.addItemLabel}>{t('favorites.addItem')}</Text>
              </TouchableOpacity>
            </View>
            {items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                <View style={styles.itemHeaderRow}>
                  <Text style={styles.itemIndex}>#{index + 1}</Text>
                  <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                    <Text style={styles.removeItemLabel}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
                <FieldInput label={t('favorites.field.foodName')} value={item.name} onChangeText={(text) => handleChangeItem(index, 'name', text)} />
                <FieldInput
                  label={t('favorites.field.amount')}
                  value={item.grams}
                  onChangeText={(text) => handleChangeItem(index, 'grams', text)}
                  keyboardType="numeric"
                />
                <View style={styles.itemRow}>
                  <FieldInput
                    label="kcal"
                    value={item.calories}
                    onChangeText={(text) => handleChangeItem(index, 'calories', text)}
                    keyboardType="numeric"
                  />
                  <FieldInput
                    label="P"
                    value={item.protein}
                    onChangeText={(text) => handleChangeItem(index, 'protein', text)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.itemRow}>
                  <FieldInput
                    label="F"
                    value={item.fat}
                    onChangeText={(text) => handleChangeItem(index, 'fat', text)}
                    keyboardType="numeric"
                  />
                  <FieldInput
                    label="C"
                    value={item.carbs}
                    onChangeText={(text) => handleChangeItem(index, 'carbs', text)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (!canSave || isSaving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonLabel}>{t('favorites.saveButton')}</Text>}
          </TouchableOpacity>

          {!isNew ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.deleteButtonLabel}>{t('favorites.deleteButton')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );

  function buildUpdatePayload(state: {
    name: string;
    notes: string;
    kcal: string;
    protein: string;
    fat: string;
    carbs: string;
    items: ItemFormState[];
    favorite?: FavoriteMeal | null;
  }) {
    return {
      name: state.name,
      notes: state.notes ? state.notes : null,
      totals: {
        kcal: parseNumber(state.kcal),
        protein_g: parseNumber(state.protein),
        fat_g: parseNumber(state.fat),
        carbs_g: parseNumber(state.carbs),
      },
      items: state.items
        .filter((item) => item.name.trim().length > 0)
        .map((item, index) => ({
          name: item.name,
          grams: parseNumber(item.grams),
          calories: parseOptionalNumber(item.calories),
          protein_g: parseOptionalNumber(item.protein),
          fat_g: parseOptionalNumber(item.fat),
          carbs_g: parseOptionalNumber(item.carbs),
          order_index: index,
        })),
      source_log_id: state.favorite?.source_log_id ?? null,
    };
  }

  function parseNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseOptionalNumber(value: string) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
    queryClient.invalidateQueries({ queryKey: ['recentLogs', locale] });
    queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
  }
}

interface FieldInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric';
}

function FieldInput({ label, value, onChangeText, keyboardType = 'default' }: FieldInputProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={styles.fieldInput} keyboardType={keyboardType} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  backLabel: {
    ...textStyles.caption,
    color: colors.accent,
  },
  headerSpacer: {
    width: 60,
  },
  title: {
    ...textStyles.titleMedium,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...textStyles.body,
    backgroundColor: '#fff',
  },
  notesInput: {
    minHeight: 72,
  },
  totalsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addItemLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemIndex: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  removeItemLabel: {
    ...textStyles.caption,
    color: colors.accent,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...textStyles.body,
    backgroundColor: colors.surface,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 20,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
