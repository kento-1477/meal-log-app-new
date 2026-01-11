import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors } from '@/theme/colors';
import { fontFamilies, textStyles } from '@/theme/typography';
import { onboardingTypography, onboardingJapaneseTypography } from '@/theme/onboarding';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { OnboardingStep } from '@/store/onboarding';
import { ONBOARDING_STEPS, useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { isJapaneseLocale } from '@/theme/localeTypography';
import { trackOnboardingStepCompleted } from '@/analytics/events';

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
  scrollEnabled?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  showProgress?: boolean;
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
  scrollEnabled = true,
  titleStyle,
  subtitleStyle,
  showProgress = true,
}: Props) {
  const progressSteps = ONBOARDING_STEPS.filter((item) => item !== 'welcome');
  const index = Math.max(0, progressSteps.indexOf(step));
  const total = progressSteps.length;
  const progress = total > 0 ? (index + 1) / total : 0;
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const isJapanese = isJapaneseLocale(locale);
  const sessionId = useOnboardingStore((state) => state.sessionId);
  const remainingSteps = Math.max(0, total - index - 1);
  const estimatedMinutes = Math.max(1, Math.round(remainingSteps * 0.5));
  const progressHint =
    remainingSteps === 0
      ? t('onboarding.progress.last')
      : t('onboarding.progress.remaining', { count: remainingSteps, minutes: estimatedMinutes });

  // Avoid leaving extra gap above the keyboard; push content right up to the keyboard edge.
  const keyboardOffset = 0;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const hasHeaderAction = Boolean(headerActionLabel && onHeaderAction);
  const showTopAction = hasHeaderAction && headerActionPosition === 'left';
  const showRightAction = hasHeaderAction && !showTopAction;
  const handleNext = useCallback(() => {
    if (!onNext) {
      return;
    }
    trackOnboardingStepCompleted({ step, sessionId });
    onNext();
  }, [onNext, sessionId, step]);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
    <AuroraBackground style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoiding}
        keyboardVerticalOffset={keyboardOffset}
      >
        <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 12 }]} edges={['top', 'left', 'right']}>
          <View style={styles.wrapper}>
            <View style={[styles.headerContainer, !showProgress ? styles.headerContainerCompact : null]}>
              {showTopAction ? <View style={styles.headerTopRow}>{renderHeaderAction('top')}</View> : null}

              <View style={styles.headerRow}>
                {onBack ? (
                  <TouchableOpacity
                    onPress={onBack}
                    style={styles.backChip}
                    accessibilityRole="button"
                    accessibilityLabel={backLabel ?? t('common.back')}
                    activeOpacity={0.8}
                  >
                    <Feather name="chevron-left" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.backChipPlaceholder} />
                )}

                {showProgress ? (
                  <View style={styles.progressArea}>
                    <View style={styles.progressColumn}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[styles.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]}
                          accessible
                          accessibilityRole="progressbar"
                          accessibilityValue={{ min: 0, max: 1, now: Math.min(1, Math.max(0, progress)) }}
                        />
                      </View>
                      <Text style={styles.progressHint}>{progressHint}</Text>
                    </View>
                    <Text style={styles.stepText}>{`${index + 1}/${total}`}</Text>
                  </View>
                ) : (
                  <View style={styles.progressPlaceholder} />
                )}

                {showRightAction ? (
                  renderHeaderAction('right')
                ) : (
                  <View style={styles.headerActionPlaceholder} />
                )}
              </View>
            </View>

              {scrollEnabled ? (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 32) }]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                >
                  <View style={styles.titleBlock}>
                    <Text style={[onboardingTypography.title, isJapanese && onboardingJapaneseTypography.title, titleStyle]}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text
                        style={[onboardingTypography.subtitle, isJapanese && onboardingJapaneseTypography.subtitle, subtitleStyle]}
                      >
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {accent ? <View style={styles.accent}>{accent}</View> : null}
                  <View style={styles.children}>{children}</View>
                </ScrollView>
              ) : (
                <View style={[styles.staticContent, { paddingBottom: Math.max(48, insets.bottom + 32) }]}>
                  <View style={styles.titleBlock}>
                    <Text style={[onboardingTypography.title, isJapanese && onboardingJapaneseTypography.title, titleStyle]}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text
                        style={[onboardingTypography.subtitle, isJapanese && onboardingJapaneseTypography.subtitle, subtitleStyle]}
                      >
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {accent ? <View style={styles.accent}>{accent}</View> : null}
                  <View style={styles.children}>{children}</View>
                </View>
              )}
            </View>

            <View style={[styles.footer, { paddingBottom: keyboardVisible ? 0 : Math.max(16, insets.bottom + 12) }]}>
              {footer}
              {onNext ? (
                <PrimaryButton
                  label={nextLabel ?? t('common.continue')}
                  onPress={handleNext}
                  disabled={nextDisabled}
                />
              ) : null}
            </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </AuroraBackground>
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
  headerContainerCompact: {
    paddingBottom: 8,
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
  staticContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: 28,
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
    paddingTop: 8,
    gap: 10,
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
  progressPlaceholder: {
    flex: 1,
    minHeight: 20,
  },
  progressColumn: {
    flex: 1,
    gap: 6,
  },
  stepText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontFamily: fontFamilies.semibold,
  },
  progressHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
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
