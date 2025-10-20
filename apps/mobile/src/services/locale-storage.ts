import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n';

const LOCALE_STORAGE_KEY = 'app:locale';

export async function loadPreferredLocale(): Promise<Locale | null> {
  try {
    const value = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (!value) {
      return null;
    }
    if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
      return value as Locale;
    }
    return null;
  } catch (error) {
    console.warn('Failed to load preferred locale', error);
    return null;
  }
}

export async function savePreferredLocale(locale: Locale) {
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch (error) {
    console.warn('Failed to persist preferred locale', error);
  }
}
