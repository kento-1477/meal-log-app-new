import { StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { fontFamilies } from '@/theme/typography';
import { getJapaneseBodyStyle, getJapaneseHeadlineStyle } from './localeTypography';

export const onboardingCardStyle = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  borderRadius: 24,
  paddingVertical: 22,
  paddingHorizontal: 24,
  borderWidth: 1,
  borderColor: 'rgba(28,28,30,0.06)',
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 4,
} as const;

export const onboardingInputStyle = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  borderRadius: 20,
  paddingHorizontal: 20,
  paddingVertical: 16,
  borderWidth: 1,
  borderColor: 'rgba(28,28,30,0.08)',
  fontSize: 17,
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 2,
} as const;

export const onboardingTypography = StyleSheet.create({
  title: {
    fontFamily: fontFamilies.semibold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
    lineHeight: 18,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  helper: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  cardTitle: {
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  cardDetail: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});

export const onboardingJapaneseTypography = StyleSheet.create({
  title: {
    ...getJapaneseHeadlineStyle(),
    fontSize: 34,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  subtitle: {
    ...getJapaneseBodyStyle(),
    fontSize: 17,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  label: {
    ...getJapaneseBodyStyle(),
    fontSize: 15,
    lineHeight: 18,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  helper: {
    ...getJapaneseBodyStyle(),
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  cardTitle: {
    ...getJapaneseHeadlineStyle(),
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  cardDetail: {
    ...getJapaneseBodyStyle(),
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
