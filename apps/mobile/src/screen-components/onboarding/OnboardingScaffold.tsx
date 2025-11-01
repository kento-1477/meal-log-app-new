import type { ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.avoiding}
      keyboardVerticalOffset={keyboardOffset}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.wrapper}>
            <View style={styles.header}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { flexGrow: progress }]} />
                <View style={[styles.progressRemainder, { flexGrow: Math.max(0, 1 - progress) }]} />
              </View>
              <View style={styles.stepMeta}>
                <Text style={styles.stepText}>{`Step ${index + 1} / ${total}`}</Text>
                {onBack ? (
                  <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={styles.backLabel}>{backLabel ?? '戻る'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
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

          <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom + 16) }] }>
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
  );
}

const styles = StyleSheet.create({
  avoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wrapper: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  header: {
    gap: 16,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    flexBasis: 0,
  },
  progressRemainder: {
    flexBasis: 0,
  },
  stepMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 32,
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
    fontSize: 30,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  accent: {
    marginTop: 16,
  },
  children: {
    flex: 1,
    marginTop: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
});
