import { Platform } from 'react-native';

const japaneseHeadlineFont = Platform.select({
  ios: 'HiraginoSans-W7',
  android: 'NotoSansCJKjp-Black',
  default: 'System',
});

const japaneseBodyFont = Platform.select({
  ios: 'HiraginoSans-W6',
  android: 'NotoSansCJKjp-Bold',
  default: 'System',
});

export function isJapaneseLocale(locale: string | null | undefined) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('ja');
}

export function getJapaneseHeadlineStyle() {
  return {
    fontFamily: japaneseHeadlineFont,
    fontWeight: Platform.OS === 'android' ? '900' : '700',
    letterSpacing: -0.3,
  } as const;
}

export function getJapaneseBodyStyle() {
  return {
    fontFamily: japaneseBodyFont,
    fontWeight: Platform.OS === 'android' ? '700' : '600',
    letterSpacing: -0.15,
  } as const;
}
