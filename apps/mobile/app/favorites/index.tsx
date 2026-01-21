import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { getFavorites } from '@/services/api';
import { useTranslation } from '@/i18n';

export default function FavoritesIndexScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const favoritesQuery = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const response = await getFavorites();
      return response.items;
    },
  });

  const favorites = favoritesQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('favorites.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/favorites/new')}
        >
          <Text style={styles.addButtonLabel}>{t('favorites.addNew')}</Text>
        </TouchableOpacity>
      </View>

      {favoritesQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('favorites.empty')}</Text>
          <Text style={styles.emptySubText}>{t('favorites.emptyHint')}</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('favorites.emptyGuideTitle')}</Text>
            <Text style={styles.emptyCardText}>{t('favorites.emptyGuideSteps')}</Text>
          </View>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('favorites.emptyBenefitsTitle')}</Text>
            <Text style={styles.emptyCardText}>{t('favorites.emptyBenefitsList')}</Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {favorites.map((favorite) => (
            <TouchableOpacity
              key={favorite.id}
              style={styles.item}
              onPress={() => router.push(`/favorites/${favorite.id}`)}
            >
              <Text style={styles.itemName}>{favorite.name}</Text>
              <Text style={styles.itemMeta}>
                {Math.round(favorite.totals.kcal)} kcal / P {favorite.totals.protein_g}g / F {favorite.totals.fat_g}g / C {favorite.totals.carbs_g}g
              </Text>
              <Text style={styles.itemNote}>{favorite.notes ?? t('favorites.notesEmpty')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
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
  title: {
    ...textStyles.titleLarge,
  },
  addButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addButtonLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.xs,
  },
  emptyCardTitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyCardText: {
    ...textStyles.body,
    color: colors.textPrimary,
    textAlign: 'left',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemName: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemMeta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  itemNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
