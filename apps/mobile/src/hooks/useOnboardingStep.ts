import { useEffect } from 'react';
import { trackOnboardingStepViewed } from '@/analytics/events';
import type { OnboardingStep } from '@/store/onboarding';
import { useOnboardingStore } from '@/store/onboarding';

export function useOnboardingStep(step: OnboardingStep) {
  const setStep = useOnboardingStore((state) => state.setStep);
  const markStarted = useOnboardingStore((state) => state.markStarted);

  useEffect(() => {
    setStep(step);
    markStarted();
    const sessionId = useOnboardingStore.getState().sessionId;
    trackOnboardingStepViewed({ step, sessionId });
  }, [markStarted, setStep, step]);
}
