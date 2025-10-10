import Constants from 'expo-constants';

const manifest = Constants.expoConfig ?? Constants.manifest2?.extra;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? manifest?.extra?.apiBaseUrl ?? 'http://localhost:4000';
