import * as SecureStore from 'expo-secure-store';

const COOKIE_KEY = 'meallog_session_cookie';

export async function saveSessionCookie(cookie: string) {
  await SecureStore.setItemAsync(COOKIE_KEY, cookie);
}

export async function getSessionCookie() {
  return SecureStore.getItemAsync(COOKIE_KEY);
}

export async function clearSessionCookie() {
  await SecureStore.deleteItemAsync(COOKIE_KEY);
}
