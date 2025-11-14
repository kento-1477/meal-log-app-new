import AsyncStorage from '@react-native-async-storage/async-storage';
import { customAlphabet } from 'nanoid/non-secure';

const STORAGE_KEY = '@device_fingerprint_id';
const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32);

export async function getDeviceFingerprintId(): Promise<string> {
  const cached = await AsyncStorage.getItem(STORAGE_KEY);
  if (cached) {
    return cached;
  }
  const id = generateId();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}
