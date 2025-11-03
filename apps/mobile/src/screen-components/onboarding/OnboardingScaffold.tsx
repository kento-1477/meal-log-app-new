import type { ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { OnboardingStep } from '@/store/onboarding';
import { ONBOARDING_STEPS } from '@/store/onboarding';

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
  footer,
  accent,
}: Props) {
  const index = Math.max(0, ONBOARDING_STEPS.indexOf(step));
  const total = ONBOARDING_STEPS.length;
  const progress = (index + 1) / total;
  const insets = useSafeAreaInsets();

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 24 : 0;

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoiding}
        keyboardVerticalOffset={keyboardOffset}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top || 12 }]}>
            <View style={styles.wrapper}>
              <View style={styles.header}>
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
                    <View style={[styles.progressFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
                  </View>
                  <Text style={styles.stepText}>{`${index + 1}/${total}`}</Text>
                </View>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 32) }]}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
        </TouchableWithoutFeedback>
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
  header: {
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
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
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  accent: {
    marginTop: 12,
  },
  children: {
    flex: 1,
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
    gap: 16,
    paddingHorizontal: 16,
  },
  stepText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
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
