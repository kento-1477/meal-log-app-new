// apps/mobile/src/store/premium.ts
// プレミアム状態を管理するZustand store
// API /api/user/premium-statusからデータを取得して保存
// 関連: services/api.ts, hooks/usePremiumStatus.ts

import { create } from 'zustand';

export type PremiumSource = 'REFERRAL_FRIEND' | 'REFERRAL_REFERRER' | 'PURCHASE' | 'ADMIN_GRANT';

export interface PremiumGrant {
  source: PremiumSource;
  days: number;
  startDate: string;
  endDate: string;
}

export interface PremiumStatus {
  isPremium: boolean;
  source: PremiumSource | null;
  daysRemaining: number;
  expiresAt: string | null;
  grants: PremiumGrant[];
}

interface PremiumStore {
  status: PremiumStatus | null;
  isLoading: boolean;
  error: string | null;
  setStatus: (status: PremiumStatus) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  status: null,
  isLoading: false,
  error: null,
};

export const usePremiumStore = create<PremiumStore>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status, isLoading: false, error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set(initialState),
}));
