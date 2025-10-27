// apps/mobile/src/analytics/events.ts
// Convenience wrappers for well-known analytics events

import { trackEvent } from './track';

export function trackInviteLinkShared(params: { channel: string }) {
  trackEvent('referral.invite_link_shared', params);
}

export function trackReferralPremiumClaimedFriend(params: { referrer?: string | null }) {
  trackEvent('referral.premium_claimed_friend', params);
}
