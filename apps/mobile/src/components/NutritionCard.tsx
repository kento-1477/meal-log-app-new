import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from './GlassCard';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import type { FavoriteMealDraft } from '@meal-log/shared';
import type { NutritionCardPayload } from '@/types/chat';
import { useTranslation } from '@/i18n';
import { describeLocale } from '@/utils/locale';

interface NutritionCardProps {
  payload: NutritionCardPayload;
  onShare?: () => void;
  sharing?: boolean;
  onAddFavorite?: (draft: FavoriteMealDraft) => void;
  addingFavorite?: boolean;
  onEdit?: () => void;
}

export const NutritionCard = React.memo<NutritionCardProps>(function NutritionCard({
  payload,
  onShare,
  sharing,
  onAddFavorite,
  addingFavorite,
  onEdit,
}) {
  const { t } = useTranslation();
  const adviceMessages = Array.from(
    new Set(
      (payload.warnings ?? []).map((warning) =>
        warning.startsWith('zeroFloored') ? t('card.warnings.zeroFloored') : warning,
      ),
    ),
  );
  const fallbackMessage =
    payload.fallbackApplied && payload.requestedLocale && payload.locale && payload.requestedLocale !== payload.locale
      ? t('card.languageFallback', {
          requested: describeLocale(payload.requestedLocale),
          resolved: describeLocale(payload.locale),
        })
      : null;

  const canAddFavorite = Boolean(onAddFavorite && payload.favoriteCandidate);

  return (
    <GlassCard intensity={30} style={styles.card} contentStyle={styles.cardContent}>
      <View style={styles.headerRow}>
        <View style={styles.titleColumn}>
          {payload.mealPeriod ? (
            <View style={styles.mealChip}>
              <Text style={styles.mealChipLabel}>{t(`meal.${payload.mealPeriod}`)}</Text>
            </View>
          ) : null}
          <Text style={styles.dish} numberOfLines={1} ellipsizeMode="tail">
            {payload.dish}
          </Text>
          {fallbackMessage ? (
            <Text style={styles.fallbackNote} numberOfLines={2}>
              {fallbackMessage}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {onEdit ? (
            <TouchableOpacity style={styles.editButton} onPress={onEdit}>
              <Text style={styles.editLabel}>{t('card.edit')}</Text>
            </TouchableOpacity>
          ) : null}
          {canAddFavorite ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => payload.favoriteCandidate && onAddFavorite?.(payload.favoriteCandidate)}
              disabled={addingFavorite}
            >
              {addingFavorite ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.iconLabel}>★</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {onShare ? (
            <TouchableOpacity style={styles.shareButton} onPress={onShare} disabled={sharing}>
              {sharing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.shareLabel}>{t('card.share')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <LinearGradient
        colors={[colors.accentSoft, '#FFD089']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.kcalHero}
      >
        <Text style={styles.kcalLabel}>{t('tab.calories')}</Text>
        <View style={styles.kcalRow}>
          <Text style={styles.kcalValue}>{Math.round(payload.totals.kcal)}</Text>
          <Text style={styles.kcalUnit}>{t('unit.kcal')}</Text>
        </View>
      </LinearGradient>

      <View style={styles.macroGrid}>
        <MacroPill
          label={t('macro.protein')}
          value={payload.totals.protein_g}
          unit={t('unit.gram')}
          color={colors.ringProtein}
        />
        <MacroPill
          label={t('macro.fat')}
          value={payload.totals.fat_g}
          unit={t('unit.gram')}
          color={colors.ringFat}
        />
        <MacroPill
          label={t('macro.carbs')}
          value={payload.totals.carbs_g}
          unit={t('unit.gram')}
          color={colors.ringCarb}
        />
      </View>
      {payload.items?.length ? (
        <View style={styles.itemsBlock}>
          {payload.items.slice(0, 4).map((item, index) => (
            <View key={`${item.name ?? 'item'}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemAmount}>{Math.round(item.grams)} g</Text>
            </View>
          ))}
        </View>
      ) : null}
      {adviceMessages.length ? (
        <View style={styles.adviceBlock}>
          <View style={styles.adviceIcon}>
            <Text style={styles.adviceIconText}>AI</Text>
          </View>
          <View style={styles.adviceContent}>
            <Text style={styles.adviceTitle}>{t('card.adviceTitle')}</Text>
            {adviceMessages.map((advice, index) => (
              <Text key={`${advice}-${index}`} style={styles.adviceText}>
                {advice}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </GlassCard>
  );
});

const MacroPill: React.FC<{ label: string; value: number; unit: string; color: string }> = ({
  label,
  value,
  unit,
  color,
}) => (
  <View style={[styles.macroPill, { backgroundColor: `${color}1A`, borderColor: color }]}>
    <Text style={[styles.macroLabel, { color }]}>{label}</Text>
    <View style={styles.macroValueRow}>
      <Text style={[styles.macroValue, { color }]}>{Math.round(value)}</Text>
      <Text style={[styles.macroUnit, { color }]}>{unit}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    marginVertical: 12,
  },
  cardContent: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  mealChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: `${colors.accent}22`,
  },
  mealChipLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  dish: {
    ...textStyles.titleMedium,
    fontSize: 20,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  fallbackNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  editLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${colors.accent}14`,
  },
  shareLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  kcalHero: {
    borderRadius: 22,
    padding: spacing.lg,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 178, 37, 0.35)',
    overflow: 'hidden',
  },
  kcalLabel: {
    ...textStyles.overline,
    color: '#9C5B1C',
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  kcalValue: {
    ...textStyles.display,
    fontSize: 46,
    color: colors.textPrimary,
  },
  kcalUnit: {
    ...textStyles.titleMedium,
    fontSize: 16,
    color: colors.textSecondary,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroPill: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  macroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  macroUnit: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  itemsBlock: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  itemAmount: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  adviceBlock: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 200, 148, 0.4)',
    backgroundColor: 'rgba(59, 200, 148, 0.12)',
    alignItems: 'flex-start',
  },
  adviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 200, 148, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adviceIconText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.8,
  },
  adviceContent: {
    flex: 1,
    gap: 4,
  },
  adviceTitle: {
    ...textStyles.caption,
    color: colors.success,
    fontWeight: '700',
  },
  adviceText: {
    ...textStyles.caption,
    color: colors.textPrimary,
  },
});
