import { Image, View } from 'react-native';
import { colors } from '@/theme/colors';

const splashImage = require('../../assets/splash.png');

export function AppSplash() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <Image source={splashImage} style={{ width: 240, height: 240 }} resizeMode="contain" />
    </View>
  );
}

