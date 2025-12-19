import AsyncStorage from '@react-native-async-storage/async-storage';
import { customAlphabet } from 'nanoid/non-secure';

const STORAGE_KEY = '@device_fingerprint_id';
const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32);

let cachedId: string | null = null;
let inFlight: Promise<string> | null = null;

export async function getDeviceFingerprintId(): Promise<string> {
  if (cachedId) {
    return cachedId;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached) {
      cachedId = cached;
      return cached;
    }
    const id = generateId();
    await AsyncStorage.setItem(STORAGE_KEY, id);
    cachedId = id;
    return id;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
