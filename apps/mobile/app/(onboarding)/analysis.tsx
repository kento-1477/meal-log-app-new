import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserProfileRequest } from '@meal-log/shared';
import { estimateTargetDate } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';
import { updateUserProfile } from '@/services/api';
import { trackOnboardingCompleted } from '@/analytics/events';

export default function OnboardingAnalysisScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const draft = useOnboardingStore((state) => state.draft);
  const resetDraft = useOnboardingStore((state) => state.reset);
  const startedAt = useOnboardingStore((state) => state.startedAt);
  const setOnboardingStatus = useSessionStore((state) => state.setOnboarding);
  const locale = useSessionStore((state) => state.locale);

  useOnboardingStep('analysis');

  const [progress, setProgress] = useState(20);

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
      unit_preference: draft.unitPreference ?? 'METRIC',
      marketing_source: draft.marketingSource ? draft.marketingSource.trim() : null,
      goals: draft.goals,
      target_calories: draft.targetCalories ?? null,
      target_protein_g: draft.targetProtein ?? null,
      target_fat_g: draft.targetFat ?? null,
      target_carbs_g: draft.targetCarbs ?? null,
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
    onSuccess: (profile) => {
      const completedAt = profile.questionnaire_completed_at ?? new Date().toISOString();
      setOnboardingStatus({ completed: true, completed_at: completedAt });
      queryClient.setQueryData(['profile'], profile);
      trackOnboardingCompleted({ durationMs: Date.now() - (startedAt ?? Date.now()) });
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
          <View style={styles.progressCircle}>
            <Text style={styles.progressText}>{`${Math.round(progress)}%`}</Text>
          </View>
          <Text style={styles.statusText}>{t('onboarding.analysis.processing')}</Text>
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        </View>
      );
    }

    if (mutation.isError) {
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.statusText}>{t('onboarding.analysis.error')}</Text>
          <Text style={styles.statusSub}>{(mutation.error as Error).message}</Text>
          <View style={styles.buttonsRow}>
            <Text style={styles.link} onPress={() => mutation.mutate()}>
              {t('common.retry')}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.centerBlock}>
        <Text style={styles.statusText}>{t('onboarding.analysis.complete')}</Text>
        <Text style={styles.statusSub}>{t('onboarding.analysis.completeSub')}</Text>
        <Text style={styles.link} onPress={handleContinue}>
          {t('onboarding.analysis.goHome')}
        </Text>
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
    gap: 16,
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
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  link: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
    textAlign: 'center',
  },
});
