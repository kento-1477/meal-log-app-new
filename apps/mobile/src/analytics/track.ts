// apps/mobile/src/analytics/track.ts
// Minimal analytics facade. Replace console logging with your vendor SDK as needed.

export type AnalyticsEventName =
  | 'referral.invite_link_generated'
  | 'referral.invite_link_shared'
  | 'referral.invite_link_clicked'
  | 'referral.signup_via_referral'
  | 'referral.premium_claimed_friend'
  | 'referral.premium_claimed_referrer'
  | 'referral.conversion_to_paid';

export function trackEvent(event: AnalyticsEventName, params: Record<string, unknown> = {}) {
  console.log(`[analytics] ${event}`, params);
}
