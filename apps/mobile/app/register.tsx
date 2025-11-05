import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassCard } from '@/components/GlassCard';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { registerUser } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';
import { Feather } from '@expo/vector-icons';

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('register.validation.missing'));
      return;
    }

    if (password.trim().length < 8) {
      setError(t('register.validation.passwordShort'));
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setError(t('register.validation.passwordMismatch'));
      return;
    }
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);
      const response = await registerUser({
        email: email.trim(),
        password: password.trim(),
      });
      setUser(response.user);
      setUsage(response.usage);
      setOnboarding(response.onboarding ?? null);
      setStatus('authenticated');
      router.dismissAll();
      const needsOnboarding = !(response.onboarding?.completed ?? false);
      router.replace(needsOnboarding ? '/(onboarding)/welcome' : '/(tabs)/chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('register.error.generic');
      setError(message);
      setStatus('error');
      setOnboarding(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('register.title')}</Text>
          <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
        </View>
        <GlassCard>
          <Text style={styles.guideline}>{t('register.passwordGuideline')}</Text>
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.emailLabel')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder={t('register.emailPlaceholder')}
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.passwordLabel')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={[styles.input, styles.passwordInput]}
                placeholder={t('register.passwordPlaceholder')}
              />
              <TouchableOpacity
                style={styles.visibilityToggle}
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t('register.hidePassword') : t('register.showPassword')}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.confirmPasswordLabel')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                style={[styles.input, styles.passwordInput]}
                placeholder={t('register.confirmPasswordPlaceholder')}
              />
              <TouchableOpacity
                style={styles.visibilityToggle}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? t('register.hidePassword') : t('register.showPassword')}
              >
                <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
          <View style={{ marginTop: 24 }}>
            <PrimaryButton label={t('register.submit')} onPress={handleRegister} loading={loading} />
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/login')}>
            <Text style={styles.secondaryButtonLabel}>{t('register.backToLogin')}</Text>
          </TouchableOpacity>
        </GlassCard>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    ...textStyles.titleLarge,
    fontSize: 32,
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: 12,
  },
  guideline: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    ...textStyles.caption,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 44,
  },
  visibilityToggle: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  error: {
    color: colors.error,
    marginTop: 12,
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
