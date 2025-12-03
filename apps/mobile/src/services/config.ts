import Constants from 'expo-constants';

const manifest = Constants.expoConfig ?? Constants.manifest2?.extra;
const resolvedBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? manifest?.extra?.apiBaseUrl;
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.CI === 'true';

let baseUrl = resolvedBaseUrl;

if (!baseUrl && isTestEnv) {
  // In test environments, allow a local fallback to prevent imports from crashing.
  baseUrl = 'http://localhost:4000';
}

if (!baseUrl) {
  throw new Error('API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL or extra.apiBaseUrl.');
}

export const API_BASE_URL = baseUrl;
