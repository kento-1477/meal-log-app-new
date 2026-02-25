import { useEffect, useRef } from 'react';
import { getDeviceLocale } from '@/i18n';
import { loadPreferredLocale } from '@/services/locale-storage';
import { useSessionStore } from '@/store/session';

export function useLocaleBootstrap() {
  const setLocale = useSessionStore((state) => state.setLocale);
  const currentLocale = useSessionStore((state) => state.locale);
  const hydrated = useSessionStore((state) => state.hydrated);
  const didBootstrapRef = useRef(false);

  useEffect(() => {
    if (!hydrated || didBootstrapRef.current) {
      return;
    }
    didBootstrapRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      const preferredLocale = await loadPreferredLocale();
      const resolvedLocale = preferredLocale ?? getDeviceLocale();
      if (!cancelled && resolvedLocale !== currentLocale) {
        setLocale(resolvedLocale);
      }
    };

    bootstrap().catch((error) => {
      console.warn('Failed to bootstrap locale preference', error);
      if (!cancelled) {
        const deviceLocale = getDeviceLocale();
        if (deviceLocale !== currentLocale) {
          setLocale(deviceLocale);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentLocale, hydrated, setLocale]);
}
