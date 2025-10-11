import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DashboardPeriod } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

const PERIOD_VALUES: DashboardPeriod[] = ['today', 'yesterday', 'thisWeek', 'lastWeek'];

interface Props {
  period: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}

export function PeriodSelector({ period, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const options = PERIOD_VALUES.map((value) => ({ value, label: periodOptionLabel(value, t) }));

  const handleSelect = (value: DashboardPeriod) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText}>{periodOptionLabel(period, t)}</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {options.map((option) => (
              <TouchableOpacity key={option.value} style={styles.option} onPress={() => handleSelect(option.value)}>
                <Text style={[styles.optionLabel, period === option.value && styles.optionLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function periodOptionLabel(
  period: DashboardPeriod,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (period) {
    case 'today':
      return t('period.today');
    case 'yesterday':
      return t('period.yesterday');
    case 'thisWeek':
      return t('period.thisWeek');
    case 'lastWeek':
      return t('period.lastWeek');
    case 'custom':
    default:
      return t('period.custom');
  }
}

const styles = StyleSheet.create({
  trigger: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.sm,
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  optionLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  optionLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});
