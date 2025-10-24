// apps/mobile/src/hooks/useReferralDeepLink.ts
// 招待リンクのディープリンク処理を担当するカスタムフック
// ログイン状態に応じて即座にclaimまたはコードを保存
// 関連: services/api.ts, store/session.ts

import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useURL } from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';

const REFERRAL_CODE_KEY = '@referral_code';

interface ClaimReferralResponse {
  success: boolean;
  premiumDays: number;
  premiumUntil: string;
  referrerUsername: string;
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
    throw new Error(data.message || 'Failed to claim referral code');
  }

  return response.json();
}

export function useReferralDeepLink() {
  const url = useURL();
  const user = useSessionStore((state) => state.user);
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

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

        setIsProcessing(true);

        if (user) {
          // ログイン済み：即座にclaim
          try {
            const result = await claimReferralCode(code);
            Alert.alert(
              '🎉 プレミアムを獲得しました！',
              `${result.premiumDays}日間のプレミアムが付与されました。${result.referrerUsername}さんからの紹介ありがとうございます！`
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : '招待コードの適用に失敗しました';
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
      } finally {
        setIsProcessing(false);
      }
    };

    void handleDeepLink();
  }, [url, user, isProcessing, t]);

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
          
          Alert.alert(
            '🎉 プレミアムを獲得しました！',
            `${result.premiumDays}日間のプレミアムが付与されました。${result.referrerUsername}さんからの紹介ありがとうございます！`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '招待コードの適用に失敗しました';
          Alert.alert('エラー', message);
          // エラーの場合はコードを保持（再試行の機会を与える）
        }
      } catch (error) {
        console.error('Failed to check pending referral:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    void checkPendingReferral();
  }, [user, isProcessing]);
}
