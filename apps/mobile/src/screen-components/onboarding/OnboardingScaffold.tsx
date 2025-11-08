import type { ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { fontFamilies, textStyles } from '@/theme/typography';
import { onboardingTypography, onboardingJapaneseTypography } from '@/theme/onboarding';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { OnboardingStep } from '@/store/onboarding';
import { ONBOARDING_STEPS } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { isJapaneseLocale } from '@/theme/localeTypography';

interface Props {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  nextLabel?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  onBack?: () => void;
  backLabel?: string;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  headerActionPosition?: 'left' | 'right';
  footer?: ReactNode;
  accent?: ReactNode;
}

export function OnboardingScaffold({
  step,
  title,
  subtitle,
  children,
  nextLabel,
  onNext,
  nextDisabled,
  onBack,
  backLabel,
  headerActionLabel,
  onHeaderAction,
  headerActionPosition = 'right',
  footer,
  accent,
}: Props) {
  const index = Math.max(0, ONBOARDING_STEPS.indexOf(step));
  const total = ONBOARDING_STEPS.length;
  const progress = (index + 1) / total;
  const insets = useSafeAreaInsets();
  const { locale } = useTranslation();
  const isJapanese = isJapaneseLocale(locale);

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 24 : 0;
  const hasHeaderAction = Boolean(headerActionLabel && onHeaderAction);
  const showTopAction = hasHeaderAction && headerActionPosition === 'left';
  const showRightAction = hasHeaderAction && !showTopAction;

  const renderHeaderAction = (placement: 'right' | 'top') => {
    if (!headerActionLabel || !onHeaderAction) {
      return null;
    }

    if (placement === 'top') {
      return (
        <TouchableOpacity
          onPress={onHeaderAction}
          style={styles.headerTopButton}
          accessibilityRole="button"
          accessibilityLabel={headerActionLabel}
          activeOpacity={0.8}
        >
          <Text style={styles.headerTopButtonText}>{headerActionLabel}</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={onHeaderAction}
        style={styles.headerAction}
        accessibilityRole="button"
        accessibilityLabel={headerActionLabel}
        activeOpacity={0.8}
      >
        <Text style={styles.headerActionText}>{headerActionLabel}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoiding}
        keyboardVerticalOffset={keyboardOffset}
      >
        <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 12 }]}>
          <View style={styles.wrapper}>
            <View style={styles.headerContainer}>
              {showTopAction ? <View style={styles.headerTopRow}>{renderHeaderAction('top')}</View> : null}

              <View style={styles.headerRow}>
                {onBack ? (
                  <TouchableOpacity
                    onPress={onBack}
                    style={styles.backChip}
                    accessibilityRole="button"
                    accessibilityLabel={backLabel ?? '戻る'}
                    activeOpacity={0.8}
                  >
                    <Feather name="chevron-left" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.backChipPlaceholder} />
                )}

                <View style={styles.progressArea}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]}
                      accessible
                      accessibilityRole="progressbar"
                      accessibilityValue={{ min: 0, max: 1, now: Math.min(1, Math.max(0, progress)) }}
                    />
                  </View>
                  <Text style={styles.stepText}>{`${index + 1}/${total}`}</Text>
                </View>

                {showRightAction ? (
                  renderHeaderAction('right')
                ) : (
                  <View style={styles.headerActionPlaceholder} />
                )}
              </View>
            </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 32) }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              >
                <View style={styles.titleBlock}>
                  <Text style={[onboardingTypography.title, isJapanese && onboardingJapaneseTypography.title]}>{title}</Text>
                  {subtitle ? (
                    <Text style={[onboardingTypography.subtitle, isJapanese && onboardingJapaneseTypography.subtitle]}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {accent ? <View style={styles.accent}>{accent}</View> : null}
                <View style={styles.children}>{children}</View>
              </ScrollView>
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
              {footer}
              {onNext ? (
                <PrimaryButton
                  label={nextLabel ?? '続ける'}
                  onPress={onNext}
                  disabled={nextDisabled}
                />
              ) : null}
            </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  avoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
    paddingHorizontal: 24,
  },
  headerContainer: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerTopRow: {
    alignItems: 'flex-end',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E7E7EA',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    gap: 32,
  },
  scroll: {
    flex: 1,
  },
  titleBlock: {
    gap: 12,
  },
  accent: {
    marginTop: 12,
  },
  children: {
    gap: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  progressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontFamily: fontFamilies.semibold,
  },
  headerAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  headerActionPlaceholder: {
    minWidth: 44,
    height: 44,
  },
  headerTopButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  headerTopButtonText: {
    ...textStyles.caption,
    color: colors.accent,
    fontFamily: fontFamilies.semibold,
  },
  headerActionText: {
    ...textStyles.caption,
    fontFamily: fontFamilies.semibold,
    color: colors.textPrimary,
  },
  backChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  backChipPlaceholder: {
    width: 44,
    height: 44,
    opacity: 0,
  },
});
