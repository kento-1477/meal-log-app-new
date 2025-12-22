// apps/mobile/src/hooks/useReferralDeepLink.ts
// 招待リンクのディープリンク処理を担当するカスタムフック
// ログイン状態に応じて即座にclaim、未ログイン時は入力案内
// 関連: services/api.ts, store/session.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useURL } from 'expo-linking';
import { useSessionStore } from '@/store/session';
import { trackReferralPremiumClaimedFriend } from '@/analytics/events';
import { getSession } from '@/services/api';
import { getDeviceFingerprintId } from '@/services/device-fingerprint';

interface ClaimReferralResponse {
  success: boolean;
  premiumDays: number;
  premiumUntil: string;
  referrerUsername: string;
}

interface ReferralError extends Error {
  status?: number;
}

async function claimReferralCode(code: string): Promise<ClaimReferralResponse> {
  const { API_BASE_URL } = await import('@/services/config');
  const { getDeviceTimezone } = await import('@/utils/timezone');
  const fingerprint = await getDeviceFingerprintId();
  
  const response = await fetch(`${API_BASE_URL}/api/referral/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timezone': getDeviceTimezone(),
      'X-Device-Id': fingerprint,
    },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.message || data.error || 'Failed to claim referral code';
    const error: ReferralError = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
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
        
        // meallog://invite?code=XXXXXX の形式を確認
        if (parsed.hostname !== 'invite' && parsed.pathname !== '/invite') {
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
            const result = await claimReferralCode(code);
            Alert.alert(
              '🎉 プレミアムを獲得しました！',
              `${result.premiumDays}日間のプレミアムが付与されました。${result.referrerUsername}さんからの紹介ありがとうございます！`
            );
            trackReferralPremiumClaimedFriend({ referrer: result.referrerUsername });
            await refreshSessionState();
          } catch (error) {
            const referralError = error as ReferralError;
            const message = referralError.message ?? '招待コードの適用に失敗しました';
            Alert.alert('エラー', message);
          }
        } else {
          Alert.alert(
            '招待コードを受け取りました',
            `コード: ${code}\nオンボーディングの「友人」選択で入力してください。`
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
  }, [hydrated, url, user, isProcessing, refreshSessionState]);

  // 未ログイン時のコードは保存しない（その場での入力のみ）
}
