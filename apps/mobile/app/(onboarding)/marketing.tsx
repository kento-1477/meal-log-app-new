import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { MARKETING_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';

export default function OnboardingMarketingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const marketing = useOnboardingStore((state) => state.draft.marketingSource ?? '');
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('marketing');

  const handleSelect = (id: string) => {
    const next = marketing === id ? '' : id;
    updateDraft({ marketingSource: next });
  };

  return (
    <OnboardingScaffold
      step="marketing"
      title={t('onboarding.marketing.title')}
      subtitle={t('onboarding.marketing.subtitle')}
      onNext={() => router.push('/(onboarding)/current-weight')}
      nextLabel={t('common.next')}
      onBack={() => router.back()}
      footer={
        <TouchableOpacity onPress={() => router.push('/(onboarding)/current-weight')}>
          <Text style={styles.skip}>{t('common.skip')}</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.grid}>
        {MARKETING_OPTIONS.map((option) => {
          const selected = option.id === marketing;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.card, selected ? styles.cardSelected : null]}
              onPress={() => handleSelect(option.id)}
            >
              <Text style={[styles.cardLabel, selected ? styles.cardLabelSelected : null]}>
                {t(option.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flexBasis: '48%',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  cardSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  cardLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cardLabelSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  skip: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
