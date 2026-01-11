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

const HEIGHT_RANGE_CM = { min: 130, max: 220 } as const;
const WEIGHT_RANGE_KG = { min: 35, max: 250 } as const;

export default function OnboardingAnalysisScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
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

  const displayPlan = useMemo(() => {
    if (!computedPlan) {
      return null;
    }
    return {
      targetCalories: computedPlan.targetCalories,
      proteinGrams: computedPlan.proteinGrams,
      fatGrams: computedPlan.fatGrams,
      carbGrams: computedPlan.carbGrams,
    };
  }, [computedPlan]);

  type FixStep = 'basic-info' | 'activity' | 'plan-mode';

  const planIssues = useMemo(() => {
    if (displayPlan) {
      return [];
    }

    const issues: Array<{ message: string; step: FixStep }> = [];
    const birthdate = draft.birthdate ?? null;

    if (!birthdate) {
      issues.push({ message: t('onboarding.analysis.issue.missingAge'), step: 'basic-info' });
    } else if (Number.isNaN(new Date(birthdate).getTime())) {
      issues.push({ message: t('onboarding.analysis.issue.invalidAge'), step: 'basic-info' });
    }

    const heightCm = draft.heightCm ?? null;
    if (heightCm == null || !Number.isFinite(heightCm)) {
      issues.push({ message: t('onboarding.analysis.issue.missingHeight'), step: 'basic-info' });
    } else if (heightCm < HEIGHT_RANGE_CM.min || heightCm > HEIGHT_RANGE_CM.max) {
      issues.push({
        message: t('onboarding.analysis.issue.heightRange', {
          min: HEIGHT_RANGE_CM.min,
          max: HEIGHT_RANGE_CM.max,
          value: heightCm.toLocaleString(locale),
        }),
        step: 'basic-info',
      });
    }

    const currentWeightKg = draft.currentWeightKg ?? draft.bodyWeightKg ?? null;
    if (currentWeightKg == null || !Number.isFinite(currentWeightKg)) {
      issues.push({ message: t('onboarding.analysis.issue.missingWeight'), step: 'plan-mode' });
    } else if (currentWeightKg < WEIGHT_RANGE_KG.min || currentWeightKg > WEIGHT_RANGE_KG.max) {
      issues.push({
        message: t('onboarding.analysis.issue.weightRange', {
          min: WEIGHT_RANGE_KG.min,
          max: WEIGHT_RANGE_KG.max,
          value: currentWeightKg.toLocaleString(locale),
        }),
        step: 'plan-mode',
      });
    }

    if (!draft.activityLevel) {
      issues.push({ message: t('onboarding.analysis.issue.missingActivity'), step: 'activity' });
    }

    if (!draft.planIntensity) {
      issues.push({ message: t('onboarding.analysis.issue.missingPlanIntensity'), step: 'plan-mode' });
    }

    return issues;
  }, [displayPlan, draft, locale, t]);

  const fixStep = useMemo<FixStep>(() => {
    if (planIssues.some((issue) => issue.step === 'basic-info')) {
      return 'basic-info';
    }
    if (planIssues.some((issue) => issue.step === 'activity')) {
      return 'activity';
    }
    return 'plan-mode';
  }, [planIssues]);

  const handleReviewInputs = () => {
    router.replace(`/(onboarding)/${fixStep}`);
  };

  return (
    <OnboardingScaffold
      step="analysis"
      title={t('onboarding.analysis.complete')}
      subtitle={t('onboarding.analysis.completeSub')}
      onNext={displayPlan ? handleContinue : handleReviewInputs}
      nextLabel={displayPlan ? t('onboarding.analysis.savePlan') : t('onboarding.analysis.reviewInputs')}
      nextDisabled={false}
      onBack={displayPlan ? undefined : () => router.back()}
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
            <View style={styles.failureCard}>
              <Text style={styles.statusSub}>{t('onboarding.analysis.error')}</Text>
              {planIssues.length > 0 ? (
                <View style={styles.issueCard}>
                  <Text style={styles.issueTitle}>{t('onboarding.analysis.errorDetailsTitle')}</Text>
                  {planIssues.map((issue, index) => (
                    <Text key={`${issue.step}-${index}`} style={styles.issueItem}>
                      ・{issue.message}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.issueHint}>{t('onboarding.analysis.errorHint')}</Text>
            </View>
          )}
          {targetDateIso ? (
            <Text style={styles.helperText}>
              {t('onboarding.summary.etaLabel')}: {new Date(targetDateIso).toLocaleDateString()}
            </Text>
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
  failureCard: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  issueCard: {
    width: '100%',
    backgroundColor: 'rgba(28,28,30,0.04)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  issueTitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  issueItem: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  issueHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
