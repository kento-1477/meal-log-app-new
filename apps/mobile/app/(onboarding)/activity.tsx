import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { ACTIVITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';

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
            <TouchableOpacity
              key={option.id}
              style={[styles.option, selected ? styles.optionSelected : null]}
              onPress={() => handleSelect(option.id)}
            >
              <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : null]}>
                {t(option.labelKey)}
              </Text>
              <Text style={[styles.optionSubtitle, selected ? styles.optionSubtitleSelected : null]}>
                {t(option.descriptionKey)}
              </Text>
            </TouchableOpacity>
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
  option: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 18,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  optionTitleSelected: {
    color: colors.accent,
  },
  optionSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  optionSubtitleSelected: {
    color: colors.textPrimary,
  },
});
