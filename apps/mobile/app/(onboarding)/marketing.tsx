import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { MARKETING_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { SelectableCard } from '@/components/SelectableCard';
import type { CardIconRenderer } from '@/components/SelectableCard';
import { Feather } from '@expo/vector-icons';

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

  const iconMap: Record<string, CardIconRenderer> = {
    instagram: (selected) => (
      <Feather name="camera" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    facebook: (selected) => (
      <Feather name="users" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    tiktok: (selected) => (
      <Feather name="music" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    friend: (selected) => (
      <Feather name="message-circle" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    app_store: (selected) => (
      <Feather name="shopping-bag" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    other: (selected) => (
      <Feather name="more-horizontal" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
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
            <SelectableCard
              key={option.id}
              title={t(option.labelKey)}
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
  grid: {
    gap: 14,
  },
  skip: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
