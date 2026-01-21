import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { colors } from '@/theme/colors';
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
  const baseWarnings = (payload.warnings ?? []).map((warning) =>
    warning.startsWith('zeroFloored') ? t('card.warnings.zeroFloored') : warning,
  );

  const translationPending =
    payload.fallbackApplied &&
    payload.requestedLocale &&
    payload.locale &&
    payload.requestedLocale !== payload.locale &&
    !payload.translations?.[payload.requestedLocale];

  if (translationPending) {
    baseWarnings.push(t('card.translationPending'));
  }

  if (
    !translationPending &&
    payload.fallbackApplied &&
    payload.requestedLocale &&
    payload.locale &&
    payload.requestedLocale !== payload.locale
  ) {
    baseWarnings.push(
      t('card.languageFallback', {
        requested: describeLocale(payload.requestedLocale),
        resolved: describeLocale(payload.locale),
      }),
    );
  }

  const warnings = Array.from(new Set(baseWarnings));

  const canAddFavorite = Boolean(onAddFavorite && payload.favoriteCandidate);

  return (
    <GlassCard intensity={30} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerMeta}>
          {payload.mealPeriod ? (
            <View style={styles.mealPill}>
              <Text style={styles.mealPillText}>{t(`meal.${payload.mealPeriod}`)}</Text>
            </View>
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
              style={styles.favoriteButton}
              onPress={() => payload.favoriteCandidate && onAddFavorite?.(payload.favoriteCandidate)}
              disabled={addingFavorite}
            >
              {addingFavorite ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.favoriteLabel}>★</Text>
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
      <Text style={styles.dish} numberOfLines={2} ellipsizeMode="tail">
        {payload.dish}
      </Text>
      <View style={styles.metaRow}>
        {payload.timezone ? <Text style={styles.meta}>{payload.timezone}</Text> : null}
        <Text style={styles.confidence}>
          {t('card.confidence', { value: Math.round(payload.confidence * 100) })}
        </Text>
      </View>
      <View style={styles.divider} />
      <LinearGradient
        colors={[colors.accentSoft, '#FFD586']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.kcalCard}
      >
        <Text style={styles.kcalCardLabel}>{t('log.label.calories')}</Text>
        <View style={styles.kcalValueRow}>
          <Text style={styles.kcalValue}>{Math.round(payload.totals.kcal)}</Text>
          <Text style={styles.kcalLabel}>{t('unit.kcal')}</Text>
        </View>
      </LinearGradient>
      <View style={styles.macroRow}>
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
              <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
              <Text style={styles.itemAmount}>{Math.round(item.grams)} g</Text>
            </View>
          ))}
        </View>
      ) : null}
      {warnings.length ? (
        <View style={styles.warningBlock}>
          {warnings.map((warning, index) => (
            <Text key={`${warning}-${index}`} style={styles.warningText}>
              ⚠️ {warning}
            </Text>
          ))}
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
  <View style={[styles.macroPill, { backgroundColor: `${color}22`, borderColor: color }]}>
    <Text style={[styles.macroLabel, { color }]}>{label}</Text>
    <Text style={[styles.macroValue, { color }]}>{`${Math.round(value)} ${unit}`}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    minHeight: 28,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dish: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    marginTop: 10,
    lineHeight: 24,
  },
  confidence: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  meta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  favoriteLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  editLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  mealPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,178,37,0.4)',
  },
  mealPillText: {
    ...textStyles.caption,
    color: colors.accentInk,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  kcalCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,178,37,0.35)',
    marginBottom: 8,
  },
  kcalCardLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  kcalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  kcalValue: {
    color: colors.accentInk,
    fontSize: 32,
    fontWeight: '700',
  },
  kcalLabel: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: '600',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  macroPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  macroValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  itemsBlock: {
    marginTop: 8,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  itemAmount: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  warningBlock: {
    marginTop: 12,
  },
  warningText: {
    color: colors.error,
    fontSize: 13,
  },
});
