import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardingInputStyle } from '@/theme/onboarding';
import { REFERRAL_CODE_STORAGE_KEY } from '@/hooks/useReferralDeepLink';
import { isJapaneseLocale } from '@/theme/localeTypography';

export default function OnboardingMarketingScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const marketing = useOnboardingStore((state) => state.draft.marketingSource ?? '');
  const referralCode = useOnboardingStore((state) => state.draft.marketingReferralCode ?? '');
  const updateDraft = useOnboardingStore((state) => state.updateDraft);
  const [prefilledCodeLoaded, setPrefilledCodeLoaded] = useState(false);
  const isJapanese = isJapaneseLocale(locale);

  useOnboardingStep('marketing');

  const handleSelect = (id: string) => {
    const next = marketing === id ? '' : id;
    updateDraft({ marketingSource: next });
  };

  useEffect(() => {
    if (prefilledCodeLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
        if (!cancelled && stored && !referralCode) {
          updateDraft({ marketingReferralCode: stored });
        }
      } catch (error) {
        console.warn('Failed to preload referral code', error);
      } finally {
        if (!cancelled) {
          setPrefilledCodeLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefilledCodeLoaded, referralCode, updateDraft]);

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
          const isFriendOption = option.id === 'friend';
          return (
            <View key={option.id} style={styles.optionBlock}>
              <SelectableCard
                title={t(option.labelKey)}
                selected={selected}
                onPress={() => handleSelect(option.id)}
                icon={iconMap[option.id]}
              />
              {isFriendOption && selected ? (
                <View style={styles.referralContainer}>
                  <Text style={[styles.referralLabel, isJapanese && styles.referralLabelJapanese]}>
                    {t('onboarding.marketing.referralLabel')}
                  </Text>
                  <TextInput
                    style={styles.referralInput}
                    value={referralCode}
                    onChangeText={(value) => updateDraft({ marketingReferralCode: value })}
                    placeholder={t('onboarding.marketing.referralPlaceholder')}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
              ) : null}
            </View>
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
  optionBlock: {
    gap: 12,
  },
  skip: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  referralContainer: {
    marginTop: 16,
    gap: 8,
  },
  referralLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  referralLabelJapanese: {
    letterSpacing: -0.2,
  },
  referralInput: {
    ...onboardingInputStyle,
    height: 52,
  },
});
