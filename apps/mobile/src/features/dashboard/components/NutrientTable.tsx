import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NutrientRow } from '../useDashboardSummary';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';

interface Props {
  data: NutrientRow[];
}

export function NutrientTable({ data }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.cellLabel, styles.wide]}>{t('nutrients.header.nutrient')}</Text>
        <Text style={styles.cellLabel}>{t('nutrients.header.total')}</Text>
        <Text style={styles.cellLabel}>{t('nutrients.header.target')}</Text>
        <Text style={styles.cellLabel}>{t('nutrients.header.delta')}</Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.dataRow}>
            <View style={[styles.cell, styles.wide]}>
              <Text style={styles.nutrientLabel}>{item.label}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.number}>{formatValue(item.total, item.unit)}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.number}>{formatValue(item.target, item.unit)}</Text>
            </View>
            <View style={styles.cell}>
              <Text
                style={[
                  styles.number,
                  item.delta > 0 ? styles.excess : item.delta < 0 ? styles.deficit : null,
                ]}
              >
                {formatValue(item.delta, item.unit)}
              </Text>
              <Text style={styles.statusText}>{statusLabel(item.delta, t)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function formatValue(value: number, unit: string) {
  const decimals = unit === 'kcal' ? 0 : 1;
  return `${value.toFixed(decimals)}${unit}`;
}

function statusLabel(delta: number, t: (key: string) => string) {
  if (delta === 0) {
    return t('status.onTarget');
  }
  return delta > 0 ? t('status.over') : t('status.under');
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dataRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cellLabel: {
    flex: 1,
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  wide: {
    flex: 1.5,
    alignItems: 'flex-start',
  },
  nutrientLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  number: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  excess: {
    color: colors.error,
  },
  deficit: {
    color: colors.success,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
