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

export default function FavoritesIndexScreen() {
  const router = useRouter();
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
        <Text style={styles.title}>お気に入り</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/favorites/new')}
        >
          <Text style={styles.addButtonLabel}>＋ 新規作成</Text>
        </TouchableOpacity>
      </View>

      {favoritesQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだお気に入りが登録されていません。</Text>
          <Text style={styles.emptySubText}>食事詳細やチャットカードから追加できます。</Text>
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
                {Math.round(favorite.totals.kcal)} kcal ／ P {favorite.totals.protein_g}g ／ F {favorite.totals.fat_g}g ／ C {favorite.totals.carbs_g}g
              </Text>
              <Text style={styles.itemNote}>{favorite.notes ?? 'メモなし'}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  emptySubText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
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
