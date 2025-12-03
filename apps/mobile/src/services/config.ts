import Constants from 'expo-constants';

const manifest = Constants.expoConfig ?? Constants.manifest2?.extra;
const resolvedBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? manifest?.extra?.apiBaseUrl;
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.CI === 'true' ||
  (Array.isArray(process.argv) && process.argv.some((arg) => arg.includes('--test')));

let baseUrl = resolvedBaseUrl;

if (!baseUrl) {
  const allowFallback = isTestEnv || process.env.NODE_ENV !== 'production';
  if (allowFallback) {
    baseUrl = 'http://localhost:4000';
  }
}

// In production builds we still prefer a real value, but avoid hard crashes in environments
// (like CI tests) where RN constants/manifest are absent.
if (!baseUrl) {
  console.warn('API base URL is not configured. Falling back to http://localhost:4000');
  baseUrl = 'http://localhost:4000';
}

export const API_BASE_URL = baseUrl;
