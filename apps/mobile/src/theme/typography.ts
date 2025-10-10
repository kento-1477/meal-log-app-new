import { Platform } from 'react-native';

export const fontFamilies = {
  regular: Platform.select({ ios: 'SF Pro Text', android: 'Roboto', default: 'System' }),
  medium: Platform.select({ ios: 'SF Pro Display Medium', android: 'Roboto-Medium', default: 'System' }),
  semibold: Platform.select({ ios: 'SF Pro Display Semibold', android: 'Roboto-Bold', default: 'System' }),
};

export const textStyles = {
  titleLarge: {
    fontFamily: fontFamilies.semibold,
    fontSize: 28,
    letterSpacing: -0.2,
  },
  titleMedium: {
    fontFamily: fontFamilies.semibold,
    fontSize: 20,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: 'rgba(60,60,67,0.6)',
  },
};
