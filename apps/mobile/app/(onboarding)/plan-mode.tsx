import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  calculateBmi,
  calculateIdealWeightRange,
  computeNutritionPlan,
  estimateTargetDate,
  type PlanIntensity,
} from '@meal-log/shared';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { roundTo } from '@/utils/units';
import { onboardingCardStyle, onboardingInputStyle, onboardingTypography } from '@/theme/onboarding';
import { SelectableCard } from '@/components/SelectableCard';
import type { CardIconRenderer } from '@/components/SelectableCard';
import { Feather } from '@expo/vector-icons';

export default function OnboardingPlanModeScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const planIntensity = draft.planIntensity ?? null;
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('plan-mode');

  const plan = PLAN_INTENSITY_OPTIONS.find((item) => item.id === planIntensity) ?? null;

  const initialKg = draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
  const [weightInput, setWeightInput] = useState(() => (initialKg ? String(roundTo(initialKg, 1)) : ''));
  const [weightError, setWeightError] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState(() =>
    draft.targetWeightKg ? String(roundTo(draft.targetWeightKg, 1)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (id: PlanIntensity) => {
    const next: PlanIntensity | null = planIntensity === id ? null : id;
    updateDraft({ planIntensity: next });
  };

  const handleWeightChange = (value: string) => {
    setWeightInput(value);
    const parsed = Number(value);
    if (parsed == null || parsed <= 0) {
      if (!value) {
        updateDraft({ currentWeightKg: null, bodyWeightKg: null });
        setWeightError(null);
      } else {
        setWeightError(t('onboarding.weight.invalid'));
      }
      return;
    }
    setWeightError(null);
    updateDraft({ currentWeightKg: parsed, bodyWeightKg: parsed });
  };

  const handleTargetChange = (value: string) => {
    setTargetInput(value);
    const parsed = Number(value);
    if (parsed == null || parsed <= 0) {
      if (!value) {
        updateDraft({ targetWeightKg: null });
        setError(null);
      } else {
        setError(t('onboarding.summary.invalidTarget'));
      }
      return;
    }
    setError(null);
    updateDraft({ targetWeightKg: parsed });
  };

  const summary = useMemo(() => {
    if (!draft.currentWeightKg || !draft.targetWeightKg || !plan) {
      return null;
    }
    const difference = draft.currentWeightKg - draft.targetWeightKg;
    if (Math.abs(difference) < 0.001) {
      return {
        difference,
        weeks: 0,
        targetDate: new Date(),
      };
    }
    const weeklyRate = plan.weeklyRateKg;
    if (weeklyRate <= 0) return null;
    const weeks = Math.abs(difference) / weeklyRate;
    const iso = estimateTargetDate({
      currentWeightKg: draft.currentWeightKg,
      targetWeightKg: draft.targetWeightKg,
      weeklyRateKg: weeklyRate,
      startDate: new Date(),
    });
    return {
      difference,
      weeks,
      targetDate: iso ? new Date(iso) : null,
    };
  }, [draft.currentWeightKg, draft.targetWeightKg, plan]);

  const previewPlan = useMemo(
    () =>
      computeNutritionPlan({
        gender: draft.gender ?? null,
        birthdate: draft.birthdate ?? null,
        heightCm: draft.heightCm ?? null,
        currentWeightKg: draft.currentWeightKg ?? draft.bodyWeightKg ?? null,
        targetWeightKg: draft.targetWeightKg ?? null,
        activityLevel: draft.activityLevel ?? null,
        planIntensity: draft.planIntensity ?? null,
        goals: draft.goals,
      }),
    [
      draft.activityLevel,
      draft.birthdate,
      draft.bodyWeightKg,
      draft.currentWeightKg,
      draft.gender,
      draft.goals,
      draft.heightCm,
      draft.planIntensity,
      draft.targetWeightKg,
    ],
  );

  const bmi = calculateBmi(draft.currentWeightKg ?? null, draft.heightCm ?? null);
  const idealRange = calculateIdealWeightRange(draft.heightCm ?? null);

  const targetDateIsoMemo = summary?.targetDate?.toISOString() ?? null;

  useEffect(() => {
    if (targetDateIsoMemo !== draft.targetDate) {
      updateDraft({ targetDate: targetDateIsoMemo });
    }
  }, [draft.targetDate, targetDateIsoMemo, updateDraft]);

  const targetDateText = summary?.targetDate
    ? summary.targetDate.toLocaleDateString(locale === 'ja-JP' ? 'ja-JP' : undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '--';

  const weeklyChange = summary ? roundTo(summary.difference / Math.max(summary.weeks, 1), 2) : null;

  const canProceed = Boolean(plan && draft.currentWeightKg && draft.targetWeightKg && !error && !weightError);

  const iconMap: Record<PlanIntensity, CardIconRenderer> = {
    GENTLE: (selected) => (
      <Feather name="feather" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    STANDARD: (selected) => (
      <Feather name="wind" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    INTENSE: (selected) => (
      <Feather name="target" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
  };

  return (
    <OnboardingScaffold
      step="plan-mode"
      title={t('onboarding.plan.title')}
      subtitle={t('onboarding.plan.subtitle')}
      onNext={() => router.push('/(onboarding)/analysis')}
      nextLabel={t('onboarding.summary.cta')}
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
            <Text style={styles.unit}>{t('onboarding.weight.kg')}</Text>
          </View>
          {weightError ? <Text style={styles.error}>{weightError}</Text> : null}
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

        <View style={styles.optionStack}>
          {PLAN_INTENSITY_OPTIONS.map((option) => {
            const selected = option.id === planIntensity;
            return (
              <SelectableCard
                key={option.id}
                title={t(option.labelKey)}
                subtitle={t(option.descriptionKey)}
                selected={selected}
                onPress={() => handleSelect(option.id)}
                icon={iconMap[option.id]}
                badge={t('onboarding.plan.perWeek', { value: option.weeklyRateKg })}
              />
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={onboardingTypography.label}>{t('onboarding.summary.targetWeight')}</Text>
          <Text style={onboardingTypography.helper}>{t('onboarding.summary.targetHelper')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={targetInput}
              onChangeText={handleTargetChange}
              keyboardType="decimal-pad"
              placeholder="60"
            />
            <Text style={styles.unit}>{t('onboarding.weight.kg')}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {previewPlan ? (
          <View style={[styles.card, styles.previewCard]}>
            <Text style={onboardingTypography.cardTitle}>{t('onboarding.plan.previewTitle')}</Text>
            <Text style={styles.previewValue}>{`${previewPlan.targetCalories} kcal`}</Text>
            <Text style={onboardingTypography.helper}>{t('onboarding.plan.previewHelper')}</Text>
          </View>
        ) : null}

        <View style={[styles.card, styles.summaryCard]}>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.planMode')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>
              {plan ? t(plan.labelKey) : t('onboarding.summary.unselected')}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.weeklyChange')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>
              {weeklyChange != null ? `${roundTo(Math.abs(weeklyChange), 2)} kg / ${t('common.week')}` : '--'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.projectedDate')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>{targetDateText}</Text>
          </View>
          <Text style={onboardingTypography.helper}>{t('onboarding.summary.note')}</Text>
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 20,
  },
  optionStack: {
    gap: 16,
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
  unit: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryCard: {
    gap: 12,
  },
  previewCard: {
    gap: 8,
  },
  previewValue: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryValue: {
    textAlign: 'right',
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
