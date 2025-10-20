import { useEffect } from 'react';
import { loadPreferredLocale } from '@/services/locale-storage';
import { useSessionStore } from '@/store/session';

export function useLocaleBootstrap() {
  const setLocale = useSessionStore((state) => state.setLocale);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = await loadPreferredLocale();
      if (!cancelled && stored) {
        setLocale(stored);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setLocale]);
}
