import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { PremiumStatus as PremiumStatusPayload } from '@meal-log/shared';
import { syncPurchasesFromHistory } from '@/services/iap';
import { useSessionStore } from '@/store/session';
import { usePremiumStore } from '@/store/premium';

export function useIapSync() {
  const user = useSessionStore((state) => state.user);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setPremiumStatus = usePremiumStore((state) => state.setStatus);
  const syncRef = useRef(false);

  useEffect(() => {
    if (!user) {
      syncRef.current = false;
      return;
    }
    if (syncRef.current) return;
    syncRef.current = true;

    if (Platform.OS !== 'ios') {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        const result = await syncPurchasesFromHistory();
        if (cancelled || result.restored.length === 0) {
          return;
        }
        const latest = result.restored[result.restored.length - 1];
        if (latest?.response?.usage) {
          setUsage(latest.response.usage);
        }
        if (latest?.response?.premiumStatus) {
          setPremiumStatus(transformPremiumStatus(latest.response.premiumStatus));
        }
      } catch (error) {
        console.warn('Failed to sync IAP history', error);
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [setPremiumStatus, setUsage, user]);
}

function transformPremiumStatus(payload: PremiumStatusPayload) {
  return {
    isPremium: payload.isPremium,
    source: payload.source,
    daysRemaining: payload.daysRemaining,
    expiresAt: payload.expiresAt,
    grants: (payload.grants ?? []).map((grant) => ({
      source: grant.source,
      days: grant.days,
      startDate: grant.startDate,
      endDate: grant.endDate,
      createdAt: grant.createdAt,
    })),
  };
}
