import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { computeNutritionPlan, estimateTargetDate } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { onboardingCardStyle, onboardingTypography } from '@/theme/onboarding';

export default function OnboardingAnalysisScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);

  useOnboardingStep('analysis');

  const plan = PLAN_INTENSITY_OPTIONS.find((item) => item.id === draft.planIntensity) ?? null;

  const targetDateIso = useMemo(() => {
    if (!draft.currentWeightKg || !draft.targetWeightKg || !plan) {
      return null;
    }
    return estimateTargetDate({
      currentWeightKg: draft.currentWeightKg,
      targetWeightKg: draft.targetWeightKg,
      weeklyRateKg: plan.weeklyRateKg,
      startDate: new Date(),
    });
  }, [draft.currentWeightKg, draft.targetWeightKg, plan]);

  const handleContinue = () => {
    router.replace('/(onboarding)/apple-connect');
  };

  const computedPlan = useMemo(() => {
    return computeNutritionPlan({
      gender: draft.gender ?? null,
      birthdate: draft.birthdate ?? null,
      heightCm: draft.heightCm ?? null,
      currentWeightKg: draft.currentWeightKg ?? draft.bodyWeightKg ?? null,
      targetWeightKg: draft.targetWeightKg ?? null,
      activityLevel: draft.activityLevel ?? null,
      planIntensity: draft.planIntensity ?? null,
      goals: draft.goals,
    });
  }, [draft]);

  const displayPlan = computedPlan
    ? {
        targetCalories: computedPlan.targetCalories,
        proteinGrams: computedPlan.proteinGrams,
        fatGrams: computedPlan.fatGrams,
        carbGrams: computedPlan.carbGrams,
      }
    : null;

  return (
    <OnboardingScaffold
      step="analysis"
      title={t('onboarding.analysis.complete')}
      subtitle={t('onboarding.analysis.completeSub')}
      onNext={handleContinue}
      nextLabel="プランを保存する"
      nextDisabled={!displayPlan}
      onBack={undefined}
    >
      <View style={styles.centerBlock}>
        <View style={[styles.card, styles.successCard]}>
          {displayPlan ? (
            <View style={styles.summaryCard}>
              <Text style={onboardingTypography.cardTitle}>{t('onboarding.analysis.recommendationTitle')}</Text>
              <View style={styles.summaryRow}>
                <Text style={onboardingTypography.cardDetail}>{t('onboarding.analysis.calories')}</Text>
                <Text style={onboardingTypography.cardTitle}>{displayPlan.targetCalories} kcal</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={onboardingTypography.cardDetail}>{t('onboarding.analysis.protein')}</Text>
                <Text style={onboardingTypography.cardTitle}>{displayPlan.proteinGrams} g</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={onboardingTypography.cardDetail}>{t('onboarding.analysis.fat')}</Text>
                <Text style={onboardingTypography.cardTitle}>{displayPlan.fatGrams} g</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={onboardingTypography.cardDetail}>{t('onboarding.analysis.carbs')}</Text>
                <Text style={onboardingTypography.cardTitle}>{displayPlan.carbGrams} g</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.statusSub}>{t('onboarding.analysis.error')}</Text>
          )}
          {targetDateIso ? (
            <Text style={styles.helperText}>目標達成予測: {new Date(targetDateIso).toLocaleDateString()}</Text>
          ) : null}
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    ...onboardingCardStyle,
  },
  successCard: {
    gap: 20,
  },
  statusText: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statusSub: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: 'rgba(28,28,30,0.04)',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
