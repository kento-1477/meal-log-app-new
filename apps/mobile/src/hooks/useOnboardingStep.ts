import { useEffect } from 'react';
import { trackOnboardingStepViewed } from '@/analytics/events';
import type { OnboardingStep } from '@/store/onboarding';
import { useOnboardingStore } from '@/store/onboarding';

export function useOnboardingStep(step: OnboardingStep) {
  const setStep = useOnboardingStore((state) => state.setStep);

  useEffect(() => {
    setStep(step);
    trackOnboardingStepViewed({ step });
  }, [setStep, step]);
}
