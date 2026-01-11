import { Alert, Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '@/i18n';

export function DevResetStreak() {
  const { t } = useTranslation();

  if (!__DEV__) {
    return null;
  }

  const onPress = async () => {
    try {
      await AsyncStorage.removeItem('dialog:seen:streak');
      Alert.alert(t('dev.resetStreak.success'));
    } catch (error) {
      console.warn('Failed to remove streak flag', error);
      Alert.alert(t('dev.resetStreak.failureTitle'), error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Pressable onLongPress={onPress} style={{ padding: 12 }}>
      <Text style={{ fontSize: 12, color: '#888' }}>{t('dev.resetStreak.helper')}</Text>
    </Pressable>
  );
}
