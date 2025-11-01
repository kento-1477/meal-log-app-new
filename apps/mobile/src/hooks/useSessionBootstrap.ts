import { useEffect } from 'react';
import { getSession } from '@/services/api';
import { useSessionStore } from '@/store/session';

export function useSessionBootstrap() {
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const hydrated = useSessionStore((state) => state.hydrated);
  const markHydrated = useSessionStore((state) => state.markHydrated);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;

    async function bootstrap() {
      setStatus('loading');
      const session = await getSession();
      if (cancelled) return;
      if (session.authenticated && session.user) {
        setUser(session.user);
        setUsage(session.usage ?? null);
        setOnboarding(session.onboarding ?? null);
      } else {
        setStatus('unauthenticated');
        setUser(null);
        setUsage(null);
        setOnboarding(null);
      }
      markHydrated();
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, markHydrated, setOnboarding, setStatus, setUsage, setUser]);
}
