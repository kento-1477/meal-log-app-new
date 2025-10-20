import { Alert, Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function DevResetStreak() {
  if (!__DEV__) {
    return null;
  }

  const onPress = async () => {
    try {
      await AsyncStorage.removeItem('dialog:seen:streak');
      Alert.alert('streakの既読フラグを消しました');
    } catch (error) {
      console.warn('Failed to remove streak flag', error);
      Alert.alert('リセットに失敗しました', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Pressable onLongPress={onPress} style={{ padding: 12 }}>
      <Text style={{ fontSize: 12, color: '#888' }}>（開発用）30日モーダル再表示：長押しでリセット</Text>
    </Pressable>
  );
}
