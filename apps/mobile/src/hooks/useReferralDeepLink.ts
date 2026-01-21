// apps/mobile/src/hooks/useReferralDeepLink.ts
// 招待リンクのディープリンク処理を担当するカスタムフック
// ログイン状態に応じて即座にclaim、未ログイン時は入力案内
// 関連: services/api.ts, store/session.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useURL } from 'expo-linking';
import { useSessionStore } from '@/store/session';
import { trackReferralPremiumClaimedFriend } from '@/analytics/events';
import { claimReferralCodeApi, getSession } from '@/services/api';
import { useTranslation } from '@/i18n';

interface ReferralError extends Error {
  status?: number;
}

export function useReferralDeepLink() {
  const url = useURL();
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedUrlRef = useRef<string | null>(null);
  const { t } = useTranslation();

  const refreshSessionState = useCallback(async () => {
    try {
      const session = await getSession();
      if (session.authenticated && session.user) {
        setUser(session.user);
        setUsage(session.usage ?? null);
        setOnboarding(session.onboarding ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh session after referral claim:', error);
    }
  }, [setOnboarding, setUsage, setUser]);

  useEffect(() => {
    if (!hydrated || !url || isProcessing) return;

    const handleDeepLink = async () => {
      try {
        const parsed = new URL(url);
        
        const normalizedPath = parsed.pathname.replace(/\/+$/, '');
        const isAppInvite = parsed.protocol === 'meallog:' && parsed.hostname === 'invite';
        const isWebInvite =
          (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
          (parsed.hostname === 'meal-log.app' || parsed.hostname === 'www.meal-log.app') &&
          normalizedPath === '/invite';

        if (!isAppInvite && !isWebInvite) {
          return;
        }

        const code = parsed.searchParams.get('code');
        if (!code) {
          return;
        }

        if (lastProcessedUrlRef.current === url) {
          return;
        }
        lastProcessedUrlRef.current = url;

        setIsProcessing(true);

        if (user) {
          // ログイン済み：即座にclaim
          try {
            const result = await claimReferralCodeApi(code.trim());
            const rewardMessage = result.referrerUsername
              ? t('referral.rewardMessageWithReferrer', {
                  days: result.premiumDays,
                  referrer: result.referrerUsername,
                })
              : t('referral.rewardMessage', { days: result.premiumDays });
            Alert.alert(
              t('referral.rewardTitle'),
              rewardMessage,
            );
            trackReferralPremiumClaimedFriend({ referrer: result.referrerUsername });
            await refreshSessionState();
          } catch (error) {
            const referralError = error as ReferralError;
            const message = referralError.message ?? t('referral.error.claimFailed');
            Alert.alert(t('common.errorTitle'), message);
          }
        } else {
          Alert.alert(
            t('referral.receivedTitle'),
            t('referral.receivedMessage', { code }),
          );
        }
      } catch (error) {
        console.error('Failed to handle referral deep link:', error);
        lastProcessedUrlRef.current = null;
      } finally {
        setIsProcessing(false);
      }
    };

    void handleDeepLink();
  }, [hydrated, url, user, isProcessing, refreshSessionState, t]);

  // 未ログイン時のコードは保存しない（その場での入力のみ）
}
