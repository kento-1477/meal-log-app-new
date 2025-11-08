import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { logout } from '@/services/api';
import { useSessionStore } from '@/store/session';

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
    />
  );
}
