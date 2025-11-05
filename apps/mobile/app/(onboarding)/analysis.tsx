import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserProfileRequest, UserProfile } from '@meal-log/shared';
import { computeNutritionPlan, estimateTargetDate } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useSessionStore } from '@/store/session';
import { usePremiumStore } from '@/store/premium';
import { useTranslation } from '@/i18n';
import { updateUserProfile, getPremiumStatus } from '@/services/api';
import { trackOnboardingCompleted } from '@/analytics/events';
import { onboardingCardStyle, onboardingTypography } from '@/theme/onboarding';

export default function OnboardingAnalysisScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const draft = useOnboardingStore((state) => state.draft);
  const resetDraft = useOnboardingStore((state) => state.reset);
  const startedAt = useOnboardingStore((state) => state.startedAt);
  const setOnboardingStatus = useSessionStore((state) => state.setOnboarding);
  const locale = useSessionStore((state) => state.locale);
  const setPremiumStatus = usePremiumStore((state) => state.setStatus);

  useOnboardingStep('analysis');

  const [progress, setProgress] = useState(20);
  const [profileResult, setProfileResult] = useState<UserProfile | null>(null);

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

  const submissionPayload: UpdateUserProfileRequest = useMemo(() => {
    const completedAt = new Date().toISOString();
    return {
      display_name: draft.displayName ? draft.displayName.trim() : null,
      gender: draft.gender ?? null,
      birthdate: draft.birthdate ?? null,
      height_cm: draft.heightCm ?? null,
      unit_preference: 'METRIC',
      marketing_source: draft.marketingSource ? draft.marketingSource.trim() : null,
      marketing_referral_code: draft.marketingReferralCode ? draft.marketingReferralCode.trim() : null,
      goals: draft.goals,
      body_weight_kg: draft.bodyWeightKg ?? draft.currentWeightKg ?? null,
      current_weight_kg: draft.currentWeightKg ?? null,
      target_weight_kg: draft.targetWeightKg ?? null,
      plan_intensity: draft.planIntensity ?? null,
      target_date: targetDateIso,
      activity_level: draft.activityLevel ?? null,
      apple_health_linked: false,
      questionnaire_completed_at: completedAt,
      language: locale ?? null,
    } satisfies UpdateUserProfileRequest;
  }, [draft, locale, targetDateIso]);

  const mutation = useMutation({
    mutationFn: async () => updateUserProfile(submissionPayload),
    onSuccess: (result) => {
      setProfileResult(result.profile);
      const completedAt = result.profile.questionnaire_completed_at ?? new Date().toISOString();
      setOnboardingStatus({ completed: true, completed_at: completedAt });
      queryClient.setQueryData(['profile'], result.profile);
      trackOnboardingCompleted({ durationMs: Date.now() - (startedAt ?? Date.now()) });
      if (result.referralClaimed && result.referralResult) {
        Alert.alert(
          '🎉 プレミアムを獲得しました！',
          `${result.referralResult.premiumDays}日間のプレミアムが付与されました。${result.referralResult.referrerUsername ?? ''}`.trim(),
        );
        getPremiumStatus()
          .then((status) => setPremiumStatus(status))
          .catch((error) => console.warn('Failed to refresh premium status', error));
      }
      resetDraft();
    },
  });

  useEffect(() => {
    if (!mutation.isPending) return;
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 95 ? 95 : prev + Math.random() * 8));
    }, 400);
    return () => clearInterval(interval);
  }, [mutation.isPending]);

  useEffect(() => {
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mutation.isSuccess) {
      setProgress(100);
    }
  }, [mutation.isSuccess]);

  const handleContinue = () => {
    router.replace('/(tabs)/dashboard');
  };

  const renderContent = () => {
    if (mutation.isPending) {
      return (
        <View style={styles.centerBlock}>
          <View style={[styles.card, styles.loadingCard]}>
            <View style={styles.progressCircle}>
              <Text style={styles.progressText}>{`${Math.round(progress)}%`}</Text>
            </View>
            <Text style={styles.statusText}>{t('onboarding.analysis.processing')}</Text>
            <Text style={styles.statusSub}>{t('onboarding.analysis.processingSub')}</Text>
            <ActivityIndicator color={colors.accent} style={styles.loadingSpinner} />
          </View>
        </View>
      );
    }

    if (mutation.isError) {
      return (
        <View style={styles.centerBlock}>
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.statusText}>{t('onboarding.analysis.error')}</Text>
            <Text style={styles.statusSub}>{(mutation.error as Error).message}</Text>
            <TouchableOpacity
              style={styles.retryChip}
              onPress={() => mutation.mutate()}
              activeOpacity={0.85}
            >
              <Text style={styles.retryChipLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const planSummary = profileResult
      ? {
          targetCalories: profileResult.target_calories,
          proteinGrams: profileResult.target_protein_g,
          fatGrams: profileResult.target_fat_g,
          carbGrams: profileResult.target_carbs_g,
        }
      : null;

    const computedPlan = computeNutritionPlan({
      gender: draft.gender ?? null,
      birthdate: draft.birthdate ?? null,
      heightCm: draft.heightCm ?? null,
      currentWeightKg: draft.currentWeightKg ?? draft.bodyWeightKg ?? null,
      targetWeightKg: draft.targetWeightKg ?? null,
      activityLevel: draft.activityLevel ?? null,
      planIntensity: draft.planIntensity ?? null,
      goals: draft.goals,
    });

    const displayPlan = planSummary ?? (computedPlan
      ? {
          targetCalories: computedPlan.targetCalories,
          proteinGrams: computedPlan.proteinGrams,
          fatGrams: computedPlan.fatGrams,
          carbGrams: computedPlan.carbGrams,
        }
      : null);

    return (
      <View style={styles.centerBlock}>
        <View style={[styles.card, styles.successCard]}>
          <Text style={styles.statusText}>{t('onboarding.analysis.complete')}</Text>
          <Text style={styles.statusSub}>{t('onboarding.analysis.completeSub')}</Text>
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
          ) : null}
          <Text style={styles.link} onPress={handleContinue}>
            {t('onboarding.analysis.goHome')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <OnboardingScaffold
      step="analysis"
      title={t('onboarding.analysis.title')}
      subtitle={t('onboarding.analysis.subtitle')}
      onNext={mutation.isSuccess ? handleContinue : undefined}
      nextLabel={mutation.isSuccess ? t('onboarding.analysis.goHome') : undefined}
      nextDisabled={!mutation.isSuccess}
      onBack={undefined}
    >
      {renderContent()}
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
  loadingCard: {
    gap: 20,
  },
  errorCard: {
    gap: 16,
  },
  successCard: {
    gap: 20,
  },
  progressCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    ...textStyles.titleLarge,
    color: colors.accent,
    fontWeight: '700',
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
  loadingSpinner: {
    marginTop: 4,
  },
  retryChip: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.textPrimary,
  },
  retryChipLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  link: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
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
});
