import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PlanIntensity } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';

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
            <TouchableOpacity
              key={option.id}
              style={[styles.option, selected ? styles.optionSelected : null]}
              onPress={() => handleSelect(option.id)}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : null]}>
                  {t(option.labelKey)}
                </Text>
                <Text style={[styles.badge, selected ? styles.badgeSelected : null]}>
                  {t('onboarding.plan.perWeek', { value: option.weeklyRateKg })}
                </Text>
              </View>
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    ...textStyles.caption,
    color: colors.textSecondary,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeSelected: {
    color: colors.accent,
    backgroundColor: 'rgba(10,132,255,0.15)',
  },
});
