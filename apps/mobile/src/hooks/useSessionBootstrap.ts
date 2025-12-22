import { useEffect, useRef } from 'react';
import { getSession } from '@/services/api';
import { useSessionStore } from '@/store/session';

export function useSessionBootstrap() {
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const hydrated = useSessionStore((state) => state.hydrated);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const markSessionChecked = useSessionStore((state) => state.markSessionChecked);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      try {
        const session = await getSession();
        if (cancelled) return;
        if (session.authenticated && session.user) {
          setUser(session.user);
          setUsage(session.usage ?? null);
          setOnboarding(session.onboarding ?? null);
        } else {
          setUser(null);
          setUsage(null);
          setOnboarding(null);
        }
      } catch (error) {
        if (cancelled) return;
        const statusCode = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
        if (statusCode === 401) {
          setUser(null);
          setUsage(null);
          setOnboarding(null);
          setStatus('unauthenticated');
        }
      } finally {
        if (!cancelled) {
          markSessionChecked();
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, markSessionChecked, setOnboarding, setStatus, setUsage, setUser]);
}
