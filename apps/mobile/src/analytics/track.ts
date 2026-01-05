// apps/mobile/src/analytics/track.ts
// Minimal analytics facade. Replace console logging with your vendor SDK as needed.

import { postOnboardingEvent } from '@/services/api';
import type { OnboardingEventPayload } from '@/services/api';

export type AnalyticsEventName =
  | 'referral.invite_link_generated'
  | 'referral.invite_link_shared'
  | 'referral.invite_link_clicked'
  | 'referral.signup_via_referral'
  | 'referral.premium_claimed_friend'
  | 'referral.premium_claimed_referrer'
  | 'referral.conversion_to_paid'
  | 'paywall.view'
  | 'paywall.purchase_success'
  | 'paywall.purchase_cancel'
  | 'paywall.purchase_failure'
  | 'paywall.restore_success'
  | 'paywall.restore_failure'
  | 'review.prompt_shown'
  | 'review.prompt_accept'
  | 'review.prompt_dismiss'
  | 'onboarding.step_viewed'
  | 'onboarding.step_completed'
  | 'onboarding.goal_selected'
  | 'onboarding.completed';

const ONBOARDING_EVENTS = new Set<OnboardingEventPayload['eventName']>([
  'onboarding.step_viewed',
  'onboarding.step_completed',
  'onboarding.completed',
]);

const isOnboardingEvent = (event: AnalyticsEventName): event is OnboardingEventPayload['eventName'] =>
  ONBOARDING_EVENTS.has(event as OnboardingEventPayload['eventName']);

export function trackEvent(event: AnalyticsEventName, params: Record<string, unknown> = {}) {
  console.log(`[analytics] ${event}`, params);

  if (!isOnboardingEvent(event)) {
    return;
  }

  const { step, sessionId, ...metadata } = params;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return;
  }

  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
  );
  const metadataPayload = Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : null;

  void postOnboardingEvent({
    eventName: event,
    step: typeof step === 'string' ? step : null,
    sessionId,
    metadata: metadataPayload,
  }).catch((error) => {
    console.warn('[analytics] onboarding event failed', error);
  });
}
