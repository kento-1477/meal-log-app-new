import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const markStarted = useOnboardingStore((state) => state.markStarted);
  const { t } = useTranslation();

  useOnboardingStep('welcome');

  useEffect(() => {
    markStarted();
  }, [markStarted]);

  return (
    <OnboardingScaffold
      step="welcome"
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      onNext={() => router.push('/(onboarding)/goals')}
      nextLabel={t('common.continue')}
    />
  );
}
