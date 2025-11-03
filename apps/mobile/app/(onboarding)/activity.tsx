import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { ACTIVITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { SelectableCard } from '@/components/SelectableCard';
import type { CardIconRenderer } from '@/components/SelectableCard';
import { Feather } from '@expo/vector-icons';

export default function OnboardingActivityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const activityLevel = useOnboardingStore((state) => state.draft.activityLevel ?? null);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('activity');

  const handleSelect = (id: string) => {
    const next = activityLevel === id ? null : id;
    updateDraft({ activityLevel: next });
  };

  const iconMap: Record<string, CardIconRenderer> = {
    SEDENTARY: (selected) => (
      <Feather name="coffee" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    LIGHT: (selected) => <Feather name="sun" size={22} color={selected ? '#fff' : colors.textPrimary} />,
    MODERATE: (selected) => (
      <Feather name="trending-up" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    ACTIVE: (selected) => (
      <Feather name="activity" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    ATHLETE: (selected) => <Feather name="zap" size={22} color={selected ? '#fff' : colors.textPrimary} />,
  };

  return (
    <OnboardingScaffold
      step="activity"
      title={t('onboarding.activity.title')}
      subtitle={t('onboarding.activity.subtitle')}
      onNext={() => router.push('/(onboarding)/plan-mode')}
      nextLabel={t('common.next')}
      nextDisabled={!activityLevel}
      onBack={() => router.back()}
    >
      <View style={styles.stack}>
        {ACTIVITY_OPTIONS.map((option) => {
          const selected = option.id === activityLevel;
          return (
            <SelectableCard
              key={option.id}
              title={t(option.labelKey)}
              subtitle={t(option.descriptionKey)}
              selected={selected}
              onPress={() => handleSelect(option.id)}
              icon={iconMap[option.id]}
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
