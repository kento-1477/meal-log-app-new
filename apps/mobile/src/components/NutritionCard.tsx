import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import type { NutritionCardPayload } from '@/types/chat';

interface NutritionCardProps {
  payload: NutritionCardPayload;
  onShare?: () => void;
  sharing?: boolean;
}

export const NutritionCard: React.FC<NutritionCardProps> = ({ payload, onShare, sharing }) => {
  return (
    <GlassCard intensity={30} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dish}>{payload.dish}</Text>
          <Text style={styles.confidence}>{Math.round(payload.confidence * 100)}% confidence</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.kcalBadge}>
            <Text style={styles.kcalValue}>{Math.round(payload.totals.kcal)}</Text>
            <Text style={styles.kcalLabel}>kcal</Text>
          </View>
          {onShare ? (
            <TouchableOpacity style={styles.shareButton} onPress={onShare} disabled={sharing}>
              {sharing ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.shareLabel}>共有</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={payload.totals.protein_g} unit="g" color="#ff9f0a" />
        <MacroPill label="Fat" value={payload.totals.fat_g} unit="g" color="#ff453a" />
        <MacroPill label="Carbs" value={payload.totals.carbs_g} unit="g" color="#bf5af2" />
      </View>
      {payload.items?.length ? (
        <View style={styles.itemsBlock}>
          {payload.items.slice(0, 3).map((item) => (
            <View key={item.name} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemAmount}>{Math.round(item.grams)} g</Text>
            </View>
          ))}
        </View>
      ) : null}
      {payload.warnings?.length ? (
        <View style={styles.warningBlock}>
          {payload.warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
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
  shareLabel: {
    ...textStyles.caption,
    color: colors.accent,
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
