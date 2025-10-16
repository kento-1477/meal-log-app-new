import { create } from 'zustand';
import type { AiUsageSummary, UserPlan } from '@meal-log/shared';

type User = {
  id: number;
  email: string;
  username?: string | null;
  plan: UserPlan;
  aiCredits: number;
};

type Status = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface SessionState {
  user: User | null;
  status: Status;
  hydrated: boolean;
  usage: AiUsageSummary | null;
  setUser: (user: User | null) => void;
  setStatus: (status: Status) => void;
  setUsage: (usage: AiUsageSummary | null) => void;
  markHydrated: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  status: 'idle',
  hydrated: false,
  usage: null,
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  setUsage: (usage) =>
    set((state) => ({
      usage,
      user: state.user
        ? {
            ...state.user,
            plan: usage?.plan ?? state.user.plan,
            aiCredits: usage?.credits ?? state.user.aiCredits,
          }
        : state.user,
    })),
  markHydrated: () => set({ hydrated: true }),
}));
