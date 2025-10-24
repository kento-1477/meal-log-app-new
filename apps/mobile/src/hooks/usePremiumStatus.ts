// apps/mobile/src/hooks/usePremiumStatus.ts
// プレミアムステータスを取得・管理するカスタムフック
// ログイン時に自動取得し、storeに保存
// 関連: store/premium.ts, services/api.ts

import { useEffect } from 'react';
import { usePremiumStore } from '@/store/premium';
import { useSessionStore } from '@/store/session';
import { getPremiumStatus } from '@/services/api';

export function usePremiumStatus() {
  const user = useSessionStore((state) => state.user);
  const { status, isLoading, error, setStatus, setLoading, setError, reset } = usePremiumStore();

  useEffect(() => {
    if (!user) {
      reset();
      return;
    }

    const fetchPremiumStatus = async () => {
      try {
        setLoading(true);
        const data = await getPremiumStatus();
        setStatus(data);
      } catch (err) {
        console.error('Failed to fetch premium status:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch premium status');
      }
    };

    void fetchPremiumStatus();
  }, [user, setStatus, setLoading, setError, reset]);

  return { status, isLoading, error };
}
