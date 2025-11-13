import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { logout } from '@/services/api';
import { useSessionStore } from '@/store/session';

const previewImage = require('../../assets/onboarding-hero.png');
const foodDecorations = [
  { emoji: '🍱', style: 'heroChip0' },
  { emoji: '🥗', style: 'heroChip1' },
  { emoji: '🍓', style: 'heroChip2' },
  { emoji: '🍤', style: 'heroChip3' },
] as const;

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const markStarted = useOnboardingStore((state) => state.markStarted);
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const { t } = useTranslation();
  const [returning, setReturning] = useState(false);

  useOnboardingStep('welcome');

  useEffect(() => {
    markStarted();
  }, [markStarted]);

  const handleBackToLogin = useCallback(async () => {
    if (returning) return;

    try {
      setReturning(true);
      await logout();
      resetOnboarding();
      setUsage(null);
      setUser(null);
      router.replace('/login');
    } catch (error) {
      console.warn('Failed to return to login from onboarding welcome', error);
      Alert.alert(t('settings.account.logoutError'));
    } finally {
      setReturning(false);
    }
  }, [resetOnboarding, returning, router, setUsage, setUser, t]);

  return (
    <OnboardingScaffold
      step="welcome"
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      headerActionLabel={t('onboarding.welcome.backToLogin')}
      onHeaderAction={handleBackToLogin}
      headerActionPosition="left"
      onNext={() => router.push('/(onboarding)/goals')}
      nextLabel={t('common.continue')}
      scrollEnabled={false}
      accent={
        <View style={styles.hero}>
          <Text style={styles.heroBadgeText}>{t('onboarding.welcome.previewBadge')}</Text>
          <View style={styles.heroImageWrap}>
            <View style={styles.heroAura} />
            <Image source={previewImage} style={styles.heroImage} resizeMode="contain" />
            <View pointerEvents="none" style={styles.heroDecorations}>
              {foodDecorations.map((item) => (
                <View key={item.emoji} style={[styles.heroChip, styles[item.style]]}>
                  <Text style={styles.heroChipText}>{item.emoji}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 0,
    alignItems: 'center',
    gap: 10,
  },
  heroBadgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ff7a00',
  },
  heroImageWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAura: {
    position: 'absolute',
    width: '70%',
    height: 220,
    backgroundColor: 'rgba(255, 243, 207, 0.6)',
    borderRadius: 160,
    top: 30,
    shadowColor: '#ffd27d',
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  heroImage: {
    width: '90%',
    height: 360,
    marginBottom: -8,
  },
  heroDecorations: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  heroChip: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 12,
  },
  heroChipText: {
    fontSize: 24,
  },
  heroChip0: {
    top: 40,
    left: 30,
  },
  heroChip1: {
    top: 90,
    right: 26,
  },
  heroChip2: {
    bottom: 120,
    left: 60,
  },
  heroChip3: {
    bottom: 110,
    right: 42,
  },
});
