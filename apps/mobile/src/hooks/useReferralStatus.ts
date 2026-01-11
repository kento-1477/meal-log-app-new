// apps/mobile/src/hooks/useReferralStatus.ts
// 紹介プログラムの状況を取得・管理するカスタムフック
// API /api/referral/my-statusからデータを取得
// 関連: services/api.ts

import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { getReferralStatus } from '@/services/api';
import { translateKey } from '@/i18n';

type ApiError = import('@/services/api').ApiError;
type ReferralStatusResponse = import('@/services/api').ReferralStatusResponse;

export function useReferralStatus() {
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const setSessionUser = useSessionStore((state) => state.setUser);
  const setSessionStatus = useSessionStore((state) => state.setStatus);
  const [status, setStatus] = useState<ReferralStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getReferralStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch referral status:', err);
      const apiError = err as ApiError;
      if (apiError?.status === 401) {
        setSessionUser(null);
        setSessionStatus('unauthenticated');
        setStatus(null);
        setError(translateKey('auth.loginRequired'));
        setIsLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : translateKey('referral.error.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, setSessionStatus, setSessionUser]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, isLoading, error, refresh: fetchStatus };
}
