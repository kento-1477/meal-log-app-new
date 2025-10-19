export function describeLocale(locale: string | undefined | null) {
  if (!locale) {
    return '';
  }
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('ja')) {
    return '日本語';
  }
  if (normalized.startsWith('en')) {
    return '英語';
  }
  return locale;
}

export function formatLocaleTag(locale: string | undefined | null) {
  if (!locale) {
    return '';
  }
  return locale;
}
