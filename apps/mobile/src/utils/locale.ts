import { getLocale } from '@/i18n';

export function describeLocale(locale: string | undefined | null) {
  if (!locale) {
    return '';
  }
  const normalized = locale.toLowerCase();
  const uiLocale = getLocale();
  const uiIsJapanese = uiLocale.toLowerCase().startsWith('ja');
  if (normalized.startsWith('ja')) {
    return uiIsJapanese ? '日本語' : 'Japanese';
  }
  if (normalized.startsWith('en')) {
    return uiIsJapanese ? '英語' : 'English';
  }
  return locale;
}

export function formatLocaleTag(locale: string | undefined | null) {
  if (!locale) {
    return '';
  }
  return locale;
}
