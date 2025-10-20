import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'dialog:seen:';

export async function hasDialogBeenSeen(id: string, token: string) {
  try {
    const value = await AsyncStorage.getItem(KEY_PREFIX + id);
    return value === token;
  } catch (error) {
    console.warn('Failed to read dialog tracker state', error);
    return false;
  }
}

export async function markDialogSeen(id: string, token: string) {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + id, token);
  } catch (error) {
    console.warn('Failed to persist dialog tracker state', error);
  }
}
