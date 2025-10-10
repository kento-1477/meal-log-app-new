import { create } from 'zustand';

type User = {
  id: number;
  email: string;
  username?: string | null;
};

type Status = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface SessionState {
  user: User | null;
  status: Status;
  hydrated: boolean;
  setUser: (user: User | null) => void;
  setStatus: (status: Status) => void;
  markHydrated: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  status: 'idle',
  hydrated: false,
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  markHydrated: () => set({ hydrated: true }),
}));
