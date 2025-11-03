import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { PlanIntensity } from '@meal-log/shared';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { SelectableCard } from '@/components/SelectableCard';
import type { CardIconRenderer } from '@/components/SelectableCard';
import { Feather } from '@expo/vector-icons';

export default function OnboardingPlanModeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const planIntensity = useOnboardingStore((state) => state.draft.planIntensity ?? null);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('plan-mode');

  const handleSelect = (id: PlanIntensity) => {
    const next: PlanIntensity | null = planIntensity === id ? null : id;
    updateDraft({ planIntensity: next });
  };

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
      onNext={() => router.push('/(onboarding)/plan-summary')}
      nextLabel={t('common.next')}
      nextDisabled={!planIntensity}
      onBack={() => router.back()}
    >
      <View style={styles.stack}>
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
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
});
