import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreakPayload } from './api';

const STREAK_CACHE_KEY = 'widget:streak';

export interface CachedStreak extends StreakPayload {
  cachedAt: number;
}

export async function cacheStreak(streak: StreakPayload) {
  const payload: CachedStreak = {
    ...streak,
    cachedAt: Date.now(),
  };
  await AsyncStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(payload));
}

export async function readCachedStreak(): Promise<CachedStreak | null> {
  const raw = await AsyncStorage.getItem(STREAK_CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedStreak;
    if (typeof parsed.current !== 'number' || typeof parsed.longest !== 'number') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse cached streak', error);
    return null;
  }
}
