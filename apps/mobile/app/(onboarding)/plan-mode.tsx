import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { fontFamilies, textStyles } from '@/theme/typography';
import { roundTo } from '@/utils/units';
import { onboardingCardStyle, onboardingInputStyle, onboardingTypography } from '@/theme/onboarding';
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

  const adjustTargetWeight = (delta: number) => {
    const base = draft.targetWeightKg ?? draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
    if (base == null) {
      return;
    }
    const next = roundTo(Math.max(base + delta, 1), 1);
    setTargetInput(String(next));
    setError(null);
    updateDraft({ targetWeightKg: next });
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

  const targetDelta =
    draft.currentWeightKg && draft.targetWeightKg
      ? roundTo(draft.targetWeightKg - draft.currentWeightKg, 1)
      : null;

  const targetDeltaLabel =
    draft.currentWeightKg && draft.targetWeightKg
      ? `${roundTo(draft.currentWeightKg, 1)} → ${roundTo(draft.targetWeightKg, 1)} ${t('onboarding.weight.kg')}`
      : null;

  const paceIconMap: Record<PlanIntensity, 'feather' | 'wind' | 'target'> = {
    GENTLE: 'feather',
    STANDARD: 'wind',
    INTENSE: 'target',
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
        <View style={[styles.card, styles.compactCard]}>
          <View style={styles.compactRow}>
            <View style={styles.compactText}>
              <Text style={onboardingTypography.label}>{t('onboarding.weight.currentLabel')}</Text>
              <Text style={onboardingTypography.helper}>{t('onboarding.weight.currentHelper')}</Text>
            </View>
            <View style={styles.compactInputRow}>
              <TextInput
                style={styles.compactInput}
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
          </View>
          {weightError ? <Text style={styles.error}>{weightError}</Text> : null}
        </View>

        <View style={[styles.card, styles.goalCard]}>
          <View style={styles.goalHeader}>
            <Text style={onboardingTypography.label}>{t('onboarding.summary.targetWeight')}</Text>
            <Text style={onboardingTypography.helper}>{t('onboarding.summary.targetHelper')}</Text>
          </View>
          <View style={styles.goalInputRow}>
            <TextInput
              style={styles.goalInput}
              value={targetInput}
              onChangeText={handleTargetChange}
              keyboardType="decimal-pad"
              placeholder="60"
              selectionColor={colors.accent}
            />
            <Text style={styles.goalUnit}>{t('onboarding.weight.kg')}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => adjustTargetWeight(0.5)}
                accessibilityRole="button"
              >
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => adjustTargetWeight(-0.5)}
                accessibilityRole="button"
              >
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
            </View>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {targetDelta != null && targetDeltaLabel ? (
            <View style={styles.deltaRow}>
              <View
                style={[
                  styles.deltaChip,
                  { backgroundColor: targetDelta < 0 ? 'rgba(245,178,37,0.2)' : 'rgba(116,210,194,0.2)' },
                ]}
              >
                <Feather
                  name={targetDelta < 0 ? 'trending-down' : 'trending-up'}
                  size={14}
                  color={targetDelta < 0 ? colors.accentInk : colors.accentSage}
                />
                <Text
                  style={[
                    styles.deltaText,
                    { color: targetDelta < 0 ? colors.accentInk : colors.accentSage },
                  ]}
                >
                  {`${targetDelta < 0 ? '' : '+'}${targetDelta} ${t('onboarding.weight.kg')}`}
                </Text>
              </View>
              <Text style={styles.deltaNote} numberOfLines={1}>
                {targetDeltaLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.paceSection}>
          <View style={styles.paceHeader}>
            <Text style={onboardingTypography.label}>{t('settings.profile.planSection')}</Text>
            <Text style={onboardingTypography.helper}>{t('settings.profile.planHint')}</Text>
          </View>
          <View style={styles.paceList}>
            {PLAN_INTENSITY_OPTIONS.map((option) => {
              const selected = option.id === planIntensity;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => handleSelect(option.id)}
                  activeOpacity={0.85}
                  style={[styles.paceCard, selected ? styles.paceCardSelected : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.paceIcon, selected ? styles.paceIconSelected : null]}>
                    <Feather
                      name={paceIconMap[option.id]}
                      size={20}
                      color={selected ? colors.accentInk : colors.textPrimary}
                    />
                  </View>
                  <View style={styles.paceText}>
                    <Text style={[styles.paceTitle, selected ? styles.paceTitleSelected : null]}>
                      {t(option.labelKey)}
                    </Text>
                    <Text style={[styles.paceSubtitle, selected ? styles.paceSubtitleSelected : null]} numberOfLines={2}>
                      {t(option.descriptionKey)}
                    </Text>
                  </View>
                  <View style={[styles.paceRate, selected ? styles.paceRateSelected : null]}>
                    <Text style={[styles.paceRateText, selected ? styles.paceRateTextSelected : null]}>
                      {t('onboarding.plan.perWeek', { value: option.weeklyRateKg })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
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
  card: {
    gap: 16,
    ...onboardingCardStyle,
  },
  compactCard: {
    paddingVertical: 18,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  compactText: {
    flex: 1,
    gap: 6,
  },
  compactInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactInput: {
    minWidth: 110,
    ...onboardingInputStyle,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  unit: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  goalCard: {
    borderColor: 'rgba(245,178,37,0.35)',
    backgroundColor: 'rgba(255,248,236,0.96)',
  },
  goalHeader: {
    gap: 6,
  },
  goalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goalInput: {
    flex: 1,
    ...onboardingInputStyle,
    paddingVertical: 18,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: fontFamilies.display,
    textAlign: 'center',
  },
  goalUnit: {
    ...textStyles.titleMedium,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  stepper: {
    gap: 10,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deltaText: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  deltaNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
  paceSection: {
    gap: 12,
  },
  paceHeader: {
    gap: 6,
  },
  paceList: {
    gap: 12,
  },
  paceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  paceCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,226,162,0.35)',
  },
  paceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.06)',
  },
  paceIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  paceText: {
    flex: 1,
    gap: 4,
  },
  paceTitle: {
    ...onboardingTypography.cardTitle,
  },
  paceTitleSelected: {
    color: colors.textPrimary,
  },
  paceSubtitle: {
    ...onboardingTypography.cardDetail,
  },
  paceSubtitleSelected: {
    color: colors.textSecondary,
  },
  paceRate: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(28,28,30,0.08)',
  },
  paceRateSelected: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  paceRateText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  paceRateTextSelected: {
    color: colors.accentInk,
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
