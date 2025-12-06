import { create } from 'zustand';
import type { AiUsageSummary, OnboardingStatus, UserTier } from '@meal-log/shared';
import { getLocale, setLocale as setI18nLocale, type Locale } from '@/i18n';
import { savePreferredLocale } from '@/services/locale-storage';

type User = {
  id: number;
  email: string;
  username?: string | null;
  plan?: UserTier;
  aiCredits: number;
  appleLinked?: boolean | null;
  appleEmail?: string | null;
};

type Status = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface SessionState {
  user: User | null;
  status: Status;
  hydrated: boolean;
  usage: AiUsageSummary | null;
  locale: Locale;
  onboarding: OnboardingStatus | null;
  setUser: (user: User | null) => void;
  setStatus: (status: Status) => void;
  setUsage: (usage: AiUsageSummary | null) => void;
  markHydrated: () => void;
  setLocale: (locale: Locale) => void;
  setOnboarding: (status: OnboardingStatus | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  status: 'idle',
  hydrated: false,
  usage: null,
  locale: getLocale(),
  onboarding: null,
  setUser: (user) =>
    set((state) => ({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      onboarding: user ? state.onboarding : null,
    })),
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
  setLocale: (locale) => {
    set({ locale });
    setI18nLocale(locale);
    void savePreferredLocale(locale);
  },
  setOnboarding: (onboarding) => set({ onboarding }),
}));
