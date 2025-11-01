import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { calculateBmi, calculateIdealWeightRange } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { formatWeight, parseWeightInput, roundTo } from '@/utils/units';

export default function OnboardingCurrentWeightScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('current-weight');

  const unit = draft.unitPreference ?? 'METRIC';
  const initialKg = draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
  const [weightInput, setWeightInput] = useState(() => formatWeight(initialKg, unit));
  const [error, setError] = useState<string | null>(null);

  const handleWeightChange = (value: string) => {
    setWeightInput(value);
    const parsed = parseWeightInput(value, unit);
    if (parsed == null || parsed <= 0) {
      if (!value) {
        updateDraft({ currentWeightKg: null, bodyWeightKg: null });
        setError(null);
      } else {
        setError(t('onboarding.weight.invalid'));
      }
      return;
    }
    setError(null);
    updateDraft({ currentWeightKg: parsed, bodyWeightKg: parsed });
  };

  const bmi = calculateBmi(draft.currentWeightKg ?? null, draft.heightCm ?? null);
  const idealRange = calculateIdealWeightRange(draft.heightCm ?? null);

  const canProceed = Boolean(draft.currentWeightKg) && !error;

  return (
    <OnboardingScaffold
      step="current-weight"
      title={t('onboarding.weight.title')}
      subtitle={t('onboarding.weight.subtitle')}
      onNext={() => router.push('/(onboarding)/activity')}
      nextLabel={t('common.next')}
      nextDisabled={!canProceed}
      onBack={() => router.back()}
    >
      <View style={styles.wrapper}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.weight.currentLabel')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={weightInput}
              onChangeText={handleWeightChange}
              keyboardType="decimal-pad"
              placeholder={unit === 'IMPERIAL' ? '150' : '65'}
            />
            <Text style={styles.unitLabel}>{unit === 'IMPERIAL' ? t('onboarding.weight.lbs') : t('onboarding.weight.kg')}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {draft.heightCm ? (
          <View style={styles.metricsCard}>
            <Text style={styles.metricsTitle}>{t('onboarding.weight.metricsTitle')}</Text>
            <View style={styles.metricsRow}>
              <Text style={styles.metricsLabel}>{t('onboarding.weight.bmi')}</Text>
              <Text style={styles.metricsValue}>{bmi ? roundTo(bmi, 1) : '--'}</Text>
            </View>
            {idealRange ? (
              <View style={styles.metricsRow}>
                <Text style={styles.metricsLabel}>{t('onboarding.weight.idealRange')}</Text>
                <Text style={styles.metricsValue}>
                  {`${roundTo(idealRange.minKg, 1)} - ${roundTo(idealRange.maxKg, 1)} kg`}
                </Text>
              </View>
            ) : null}
            <Text style={styles.metricsFootnote}>{t('onboarding.weight.idealHint')}</Text>
          </View>
        ) : (
          <Text style={styles.notice}>{t('onboarding.weight.needHeight')}</Text>
        )}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 24,
  },
  field: {
    gap: 12,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  unitLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metricsCard: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.1)',
  },
  metricsTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricsLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  metricsValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  metricsFootnote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  notice: {
    ...textStyles.caption,
    color: colors.error,
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
  },
});
