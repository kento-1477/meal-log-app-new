import { useMemo, useState } from 'react';
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
import { onboardingCardStyle, onboardingTypography } from '@/theme/onboarding';
import { Feather } from '@expo/vector-icons';

export default function OnboardingPlanModeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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

  const adjustCurrentWeight = (delta: number) => {
    const base = draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
    if (base == null) {
      return;
    }
    const next = roundTo(Math.max(base + delta, 1), 1);
    setWeightInput(String(next));
    setWeightError(null);
    updateDraft({ currentWeightKg: next, bodyWeightKg: next });
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

  const weeklyRate = summary ? roundTo(Math.abs(summary.difference / Math.max(summary.weeks, 1)), 2) : null;
  const weeklyDirection = summary ? (summary.difference >= 0 ? -1 : 1) : 1;
  const weeklyText =
    weeklyRate != null
      ? `${weeklyDirection < 0 ? '-' : '+'}${weeklyRate} ${t('onboarding.weight.kg')}/${t('common.week')}`
      : '--';

  const etaWeeks = summary ? Math.max(1, Math.round(summary.weeks)) : null;
  const etaText = etaWeeks ? t('onboarding.summary.etaWeeks', { count: etaWeeks }) : '--';

  const caloriesText = previewPlan ? `${previewPlan.targetCalories} ${t('unit.kcal')}` : '--';

  const canProceed = Boolean(plan && draft.currentWeightKg && draft.targetWeightKg && !error && !weightError);

  const targetDelta =
    draft.currentWeightKg && draft.targetWeightKg
      ? roundTo(draft.targetWeightKg - draft.currentWeightKg, 1)
      : null;
  const absTargetDelta = targetDelta != null ? roundTo(Math.abs(targetDelta), 1) : null;
  const targetDeltaText =
    absTargetDelta != null
      ? targetDelta < 0
        ? t('onboarding.summary.deltaLoss', { value: absTargetDelta })
        : t('onboarding.summary.deltaGain', { value: absTargetDelta })
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
        <View style={styles.weightGrid}>
          <View style={styles.weightCard}>
            <Text style={styles.cardLabel}>{t('onboarding.weight.currentLabel')}</Text>
            <View style={styles.weightRow}>
              <View style={styles.weightValue}>
                <TextInput
                  style={styles.weightInput}
                  value={weightInput}
                  onChangeText={handleWeightChange}
                  keyboardType="decimal-pad"
                  textContentType="oneTimeCode"
                  autoComplete="off"
                  importantForAutofill="no"
                  placeholder="65"
                />
                <Text style={styles.weightUnit}>{t('onboarding.weight.kg')}</Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => adjustCurrentWeight(0.5)}
                  accessibilityRole="button"
                >
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => adjustCurrentWeight(-0.5)}
                  accessibilityRole="button"
                >
                  <Text style={styles.stepperText}>−</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.weightNote}>{t('onboarding.weight.currentHelper')}</Text>
            {weightError ? <Text style={styles.error}>{weightError}</Text> : null}
          </View>

          <View style={[styles.weightCard, styles.weightCardTarget]}>
            <Text style={styles.cardLabel}>{t('onboarding.summary.targetWeight')}</Text>
            <View style={styles.weightRow}>
              <View style={styles.weightValue}>
                <TextInput
                  style={styles.weightInput}
                  value={targetInput}
                  onChangeText={handleTargetChange}
                  keyboardType="decimal-pad"
                  placeholder="60"
                  selectionColor={colors.accent}
                />
                <Text style={styles.weightUnit}>{t('onboarding.weight.kg')}</Text>
              </View>
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
            {targetDelta != null && targetDeltaText ? (
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
                    {targetDeltaText}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.paceSection}>
          <View style={styles.paceHeader}>
            <Text style={onboardingTypography.label}>{t('settings.profile.planSection')}</Text>
            <Text style={onboardingTypography.helper}>{t('settings.profile.planHint')}</Text>
          </View>
          <View style={styles.paceList}>
            {PLAN_INTENSITY_OPTIONS.map((option) => {
              const selected = option.id === planIntensity;
              const title =
                option.id === 'STANDARD'
                  ? `${t(option.labelKey)}（${t('onboarding.plan.recommended')}）`
                  : t(option.labelKey);
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
                      {title}
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

        <View style={styles.insightCard}>
          <View style={styles.insightItem}>
            <Text style={styles.insightLabel}>{t('onboarding.summary.weeklyChange')}</Text>
            <Text style={styles.insightValue} numberOfLines={1}>
              {weeklyText}
            </Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightLabel}>{t('onboarding.summary.etaLabel')}</Text>
            <Text style={styles.insightValue} numberOfLines={1}>
              {etaText}
            </Text>
          </View>
          <View style={styles.insightItem}>
            <Text style={styles.insightLabel}>{t('onboarding.analysis.calories')}</Text>
            <Text style={styles.insightValue} numberOfLines={1}>
              {caloriesText}
            </Text>
          </View>
        </View>

        {draft.heightCm ? (
          <View style={[styles.card, styles.metricsCard]}>
            <Text style={onboardingTypography.cardTitle}>{t('onboarding.weight.metricsTitle')}</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricsItem}>
                <Text style={styles.metricsLabel}>{t('onboarding.weight.bmi')}</Text>
                <Text style={styles.metricsValue}>{bmi ? roundTo(bmi, 1) : '--'}</Text>
              </View>
              <View style={styles.metricsItem}>
                <Text style={styles.metricsLabel}>{t('onboarding.weight.idealRange')}</Text>
                <Text style={styles.metricsValue} numberOfLines={1}>
                  {idealRange ? `${roundTo(idealRange.minKg, 1)} - ${roundTo(idealRange.maxKg, 1)} kg` : '--'}
                </Text>
              </View>
            </View>
            <Text style={styles.metricsHint}>{t('onboarding.weight.idealHint')}</Text>
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
    gap: 16,
  },
  card: {
    gap: 12,
    ...onboardingCardStyle,
  },
  weightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  weightCard: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 160,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  weightCardTarget: {
    borderColor: 'rgba(245,178,37,0.45)',
    backgroundColor: 'rgba(255,248,236,0.95)',
  },
  cardLabel: {
    ...textStyles.overline,
    color: colors.textSecondary,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  weightValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightInput: {
    minWidth: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fontFamilies.display,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  weightUnit: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  weightNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  stepper: {
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  stepperText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  deltaText: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  paceSection: {
    gap: 10,
  },
  paceHeader: {
    gap: 4,
  },
  paceList: {
    gap: 10,
  },
  paceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  paceCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,226,162,0.35)',
  },
  paceIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.06)',
  },
  paceIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  paceText: {
    flex: 1,
    gap: 4,
  },
  paceTitle: {
    ...onboardingTypography.cardTitle,
    fontSize: 16,
  },
  paceTitleSelected: {
    color: colors.textPrimary,
  },
  paceSubtitle: {
    ...onboardingTypography.cardDetail,
    fontSize: 12,
  },
  paceSubtitleSelected: {
    color: colors.textSecondary,
  },
  paceRate: {
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  insightCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  insightItem: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
    gap: 4,
  },
  insightLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  insightValue: {
    ...textStyles.titleMedium,
    fontFamily: fontFamilies.semibold,
    color: colors.textPrimary,
  },
  metricsCard: {
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricsItem: {
    flex: 1,
    gap: 4,
  },
  metricsLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  metricsValue: {
    ...textStyles.titleMedium,
    fontFamily: fontFamilies.semibold,
    color: colors.textPrimary,
  },
  metricsHint: {
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
