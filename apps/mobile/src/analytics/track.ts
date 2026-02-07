// apps/mobile/src/analytics/track.ts
// Minimal analytics facade. Replace console logging with your vendor SDK as needed.

import { postAnalyticsEvent, postOnboardingEvent } from '@/services/api';
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
  | 'review.prompt_feedback'
  | 'review.prompt_dismiss'
  | 'report.preference_saved'
  | 'report.generate_requested'
  | 'report.generate_completed'
  | 'report.voice_mode_switched'
  | 'report.details_expanded'
  | 'report.shared'
  | 'report.feedback_submitted'
  | 'onboarding.step_viewed'
  | 'onboarding.step_completed'
  | 'onboarding.goal_selected'
  | 'onboarding.completed';

const ONBOARDING_EVENTS = new Set<OnboardingEventPayload['eventName']>([
  'onboarding.step_viewed',
  'onboarding.step_completed',
  'onboarding.completed',
]);

const REPORT_EVENTS = new Set<AnalyticsEventName>([
  'report.preference_saved',
  'report.generate_requested',
  'report.generate_completed',
  'report.voice_mode_switched',
  'report.details_expanded',
  'report.shared',
  'report.feedback_submitted',
]);

const isOnboardingEvent = (event: AnalyticsEventName): event is OnboardingEventPayload['eventName'] =>
  ONBOARDING_EVENTS.has(event as OnboardingEventPayload['eventName']);

export function trackEvent(event: AnalyticsEventName, params: Record<string, unknown> = {}) {
  console.log(`[analytics] ${event}`, params);

  if (REPORT_EVENTS.has(event)) {
    const { sessionId, step, ...metadata } = params;
    const cleanedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
    );
    const metadataPayload = Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : null;

    void postAnalyticsEvent({
      eventName: event,
      sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
      metadata: metadataPayload,
    }).catch((error) => {
      console.warn('[analytics] report event failed', error);
    });
  }

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
