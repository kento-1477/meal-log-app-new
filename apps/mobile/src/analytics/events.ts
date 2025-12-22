// apps/mobile/src/analytics/events.ts
// Convenience wrappers for well-known analytics events

import { trackEvent } from './track';

export function trackInviteLinkShared(params: { channel: string }) {
  trackEvent('referral.invite_link_shared', params);
}

export function trackReferralPremiumClaimedFriend(params: { referrer?: string | null }) {
  trackEvent('referral.premium_claimed_friend', params);
}

export function trackPaywallViewed(params: { source?: string } = {}) {
  trackEvent('paywall.view', params);
}

export function trackPaywallPurchaseSuccess(params: { productId: string }) {
  trackEvent('paywall.purchase_success', params);
}

export function trackPaywallPurchaseCancel(params: { productId: string }) {
  trackEvent('paywall.purchase_cancel', params);
}

export function trackPaywallPurchaseFailure(params: { productId: string; code?: string; message?: string }) {
  trackEvent('paywall.purchase_failure', params);
}

export function trackPaywallRestoreSuccess(params: { productId: string; restoredCount: number }) {
  trackEvent('paywall.restore_success', params);
}

export function trackPaywallRestoreFailure(params: { productId: string; code?: string; message?: string }) {
  trackEvent('paywall.restore_failure', params);
}

export function trackOnboardingStepViewed(params: { step: string; sessionId?: string | null }) {
  trackEvent('onboarding.step_viewed', params);
}

export function trackOnboardingStepCompleted(params: { step: string; sessionId?: string | null }) {
  trackEvent('onboarding.step_completed', params);
}

export function trackOnboardingGoalsUpdated(params: { goals: string[] }) {
  trackEvent('onboarding.goal_selected', params);
}

export function trackOnboardingCompleted(params: { durationMs: number; sessionId?: string | null }) {
  trackEvent('onboarding.completed', params);
}
