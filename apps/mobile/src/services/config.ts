import Constants from 'expo-constants';

const manifest = Constants.expoConfig ?? Constants.manifest2?.extra;
const resolvedBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? manifest?.extra?.apiBaseUrl;

if (!resolvedBaseUrl) {
  throw new Error('API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL or extra.apiBaseUrl.');
}

export const API_BASE_URL = resolvedBaseUrl;
