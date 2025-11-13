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
import { roundTo } from '@/utils/units';
import { onboardingCardStyle, onboardingInputStyle, onboardingTypography } from '@/theme/onboarding';

export default function OnboardingCurrentWeightScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('current-weight');

  const initialKg = draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
  const [weightInput, setWeightInput] = useState(() => (initialKg ? String(roundTo(initialKg, 1)) : ''));
  const [error, setError] = useState<string | null>(null);

  const handleWeightChange = (value: string) => {
    setWeightInput(value);
    const parsed = Number(value);
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
      <View style={styles.stack}>
        <View style={styles.card}>
          <Text style={onboardingTypography.label}>{t('onboarding.weight.currentLabel')}</Text>
          <Text style={onboardingTypography.helper}>{t('onboarding.weight.currentHelper')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={weightInput}
              onChangeText={handleWeightChange}
              keyboardType="decimal-pad"
              textContentType="oneTimeCode"
              autoComplete="off"
              importantForAutofill="no"
              placeholder="65"
            />
            <Text style={styles.unitLabel}>{t('onboarding.weight.kg')}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {draft.heightCm ? (
          <View style={[styles.card, styles.metricsCard]}>
            <Text style={onboardingTypography.cardTitle}>{t('onboarding.weight.metricsTitle')}</Text>
            <View style={styles.metricsRow}>
              <Text style={onboardingTypography.cardDetail}>{t('onboarding.weight.bmi')}</Text>
              <Text style={onboardingTypography.cardTitle}>{bmi ? roundTo(bmi, 1) : '--'}</Text>
            </View>
            {idealRange ? (
              <View style={styles.metricsRow}>
                <Text style={onboardingTypography.cardDetail}>{t('onboarding.weight.idealRange')}</Text>
                <Text style={onboardingTypography.cardTitle}>
                  {`${roundTo(idealRange.minKg, 1)} - ${roundTo(idealRange.maxKg, 1)} kg`}
                </Text>
              </View>
            ) : null}
            <Text style={onboardingTypography.helper}>{t('onboarding.weight.idealHint')}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.notice}>{t('onboarding.weight.needHeight')}</Text>
          </View>
        )}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 24,
  },
  card: {
    gap: 16,
    ...onboardingCardStyle,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    ...onboardingInputStyle,
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
    gap: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
