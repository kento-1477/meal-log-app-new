import React from 'react';
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

export const NutritionCard: React.FC<NutritionCardProps> = ({ payload, onShare, sharing, onAddFavorite, addingFavorite, onEdit }) => {
  const { t } = useTranslation();
  const baseWarnings = (payload.warnings ?? []).map((warning) =>
    warning.startsWith('zeroFloored') ? t('card.warnings.zeroFloored') : warning,
  );

  if (payload.fallbackApplied && payload.requestedLocale && payload.locale && payload.requestedLocale !== payload.locale) {
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
        <View style={{ flex: 1 }}>
          <Text style={styles.dish}>{payload.dish}</Text>
          <Text style={styles.confidence}>
            {t('card.confidence', { value: Math.round(payload.confidence * 100) })}
          </Text>
          {payload.mealPeriod ? (
            <Text style={styles.meta}>
              {t(`meal.${payload.mealPeriod}`)}
              {payload.timezone ? ` · ${payload.timezone}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {onEdit ? (
            <TouchableOpacity style={styles.editButton} onPress={onEdit}>
              <Text style={styles.editLabel}>{t('card.edit')}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.kcalBadge}>
            <Text style={styles.kcalValue}>{Math.round(payload.totals.kcal)}</Text>
            <Text style={styles.kcalLabel}>{t('unit.kcal')}</Text>
          </View>
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
      <View style={styles.divider} />
      <View style={styles.macroRow}>
        <MacroPill
          label={t('macro.protein')}
          value={payload.totals.protein_g}
          unit={t('unit.gram')}
          color="#ff9f0a"
        />
        <MacroPill
          label={t('macro.fat')}
          value={payload.totals.fat_g}
          unit={t('unit.gram')}
          color="#ff453a"
        />
        <MacroPill
          label={t('macro.carbs')}
          value={payload.totals.carbs_g}
          unit={t('unit.gram')}
          color="#bf5af2"
        />
      </View>
      {payload.items?.length ? (
        <View style={styles.itemsBlock}>
          {payload.items.slice(0, 3).map((item, index) => (
            <View key={`${item.name ?? 'item'}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
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
};

const MacroPill: React.FC<{ label: string; value: number; unit: string; color: string }> = ({
  label,
  value,
  unit,
  color,
}) => (
  <View style={[styles.macroPill, { backgroundColor: `${color}22`, borderColor: color }]}>
    <Text style={[styles.macroLabel, { color }]}>{label}</Text>
    <Text style={[styles.macroValue, { color }]}>
      {Math.round(value)} {unit}
    </Text>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dish: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  confidence: {
    ...textStyles.caption,
    color: colors.accent,
    marginTop: 4,
  },
  meta: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  kcalBadge: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kcalValue: {
    color: 'white',
    fontWeight: '700',
    fontSize: 18,
  },
  kcalLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  macroPill: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginHorizontal: 4,
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
