// apps/mobile/src/hooks/useReferralDeepLink.ts
// 招待リンクのディープリンク処理を担当するカスタムフック
// ログイン状態に応じて即座にclaimまたはコードを保存
// 関連: services/api.ts, store/session.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useURL } from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionStore } from '@/store/session';
import { trackReferralPremiumClaimedFriend } from '../analytics/events';
import { getSession } from '@/services/api';

const REFERRAL_CODE_KEY = '@referral_code';

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
  
  const response = await fetch(`${API_BASE_URL}/api/referral/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timezone': getDeviceTimezone(),
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
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedUrlRef = useRef<string | null>(null);

  const refreshSessionState = useCallback(async () => {
    try {
      const session = await getSession();
      if (session.authenticated && session.user) {
        setUser(session.user);
        setUsage(session.usage ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh session after referral claim:', error);
    }
  }, [setUsage, setUser]);

  useEffect(() => {
    if (!url || isProcessing) return;

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
          // 未ログイン：コードを保存してログイン画面へ
          await AsyncStorage.setItem(REFERRAL_CODE_KEY, code);
          Alert.alert(
            '招待リンクを受け取りました',
            'ログイン後に自動的に14日間のプレミアムが付与されます。'
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
  }, [url, user, isProcessing, refreshSessionState]);

  // ログイン後の自動claim処理
  useEffect(() => {
    if (!user || isProcessing) return;

    const checkPendingReferral = async () => {
      try {
        const savedCode = await AsyncStorage.getItem(REFERRAL_CODE_KEY);
        if (!savedCode) return;

        setIsProcessing(true);

        try {
          const result = await claimReferralCode(savedCode);
          await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
          await refreshSessionState();

          Alert.alert(
            '🎉 プレミアムを獲得しました！',
            `${result.premiumDays}日間のプレミアムが付与されました。${result.referrerUsername}さんからの紹介ありがとうございます！`
          );
          trackReferralPremiumClaimedFriend({ referrer: result.referrerUsername });
        } catch (error) {
          const referralError = error as ReferralError;
          const message = referralError.message ?? '招待コードの適用に失敗しました';
          Alert.alert('エラー', message);
          if (referralError.status && [400, 403, 404, 409].includes(referralError.status)) {
            await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
          }
        }
      } catch (error) {
        console.error('Failed to check pending referral:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    void checkPendingReferral();
  }, [user, isProcessing, refreshSessionState]);
}
