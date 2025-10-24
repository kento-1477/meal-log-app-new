// apps/mobile/src/hooks/useReferralStatus.ts
// 紹介プログラムの状況を取得・管理するカスタムフック
// API /api/referral/my-statusからデータを取得
// 関連: services/api.ts

import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { getReferralStatus, ReferralStatusResponse } from '@/services/api';

export function useReferralStatus() {
  const user = useSessionStore((state) => state.user);
  const [status, setStatus] = useState<ReferralStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getReferralStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch referral status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch referral status');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, isLoading, error, refresh: fetchStatus };
}
