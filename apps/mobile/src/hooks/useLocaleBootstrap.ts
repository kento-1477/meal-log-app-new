import { useEffect } from 'react';
import { getDeviceLocale } from '@/i18n';
import { useSessionStore } from '@/store/session';

export function useLocaleBootstrap() {
  const setLocale = useSessionStore((state) => state.setLocale);
  const currentLocale = useSessionStore((state) => state.locale);

  useEffect(() => {
    const deviceLocale = getDeviceLocale();
    if (deviceLocale !== currentLocale) {
      setLocale(deviceLocale);
    }
  }, [currentLocale, setLocale]);
}
