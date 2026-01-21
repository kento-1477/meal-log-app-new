import * as StoreReview from 'expo-store-review';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const appStoreId =
  Constants.expoConfig?.ios?.appStoreId ??
  Constants.expoConfig?.extra?.appStoreId ??
  process.env.EXPO_PUBLIC_APP_STORE_ID ??
  null;
const androidPackage = Constants.expoConfig?.android?.package ?? 'com.meallog.app';

const APP_STORE_URL = appStoreId ? `https://apps.apple.com/app/id${appStoreId}` : null;
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${androidPackage}`;

export type ReviewRequestResult = {
  requested: boolean;
  fallbackOpened: boolean;
};

export async function requestStoreReview(): Promise<ReviewRequestResult> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
      return { requested: true, fallbackOpened: false };
    }
  } catch (error) {
    console.warn('Failed to request in-app review', error);
  }

  const fallbackUrl = Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
  if (fallbackUrl) {
    try {
      const supported = await Linking.canOpenURL(fallbackUrl);
      if (supported) {
        await Linking.openURL(fallbackUrl);
        return { requested: false, fallbackOpened: true };
      }
    } catch (error) {
      console.warn('Failed to open store review URL', error);
    }
  }

  return { requested: false, fallbackOpened: false };
}
