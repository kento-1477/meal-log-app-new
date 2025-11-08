import { Platform } from 'react-native';
import { colors } from './colors';

export const fontFamilies = {
  regular: Platform.select({ ios: 'SF Pro Text', android: 'Roboto', default: 'System' }),
  medium: Platform.select({ ios: 'SF Pro Text Medium', android: 'Roboto-Medium', default: 'System' }),
  semibold: Platform.select({ ios: 'SF Pro Display Semibold', android: 'Roboto-Bold', default: 'System' }),
  display: Platform.select({ ios: 'SF Pro Display Bold', android: 'Roboto-Bold', default: 'System' }),
};

export const textStyles = {
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 40,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  heading: {
    fontFamily: fontFamilies.semibold,
    fontSize: 32,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  titleLarge: {
    fontFamily: fontFamilies.semibold,
    fontSize: 24,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  titleMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: 18,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  overline: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
};
