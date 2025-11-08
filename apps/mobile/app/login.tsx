import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { GlassCard } from '@/components/GlassCard';
import { AuroraBackground } from '@/components/AuroraBackground';
import { BrandHeader } from '@/components/BrandHeader';
import { login } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';
import { Feather } from '@expo/vector-icons';
import { SUPPORT_EMAIL } from '@/config/legal';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const { t } = useTranslation();

  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Password reset request')}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        throw new Error('cannot open mailto');
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(t('login.forgotPasswordErrorTitle'), t('login.forgotPasswordErrorMessage'));
      console.warn('Failed to open mail client', error);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);
      const response = await login({ email, password });
      setUser(response?.user ?? null);
      setUsage(response?.usage ?? null);
      setOnboarding(response?.onboarding ?? null);
      setStatus('authenticated');
      router.dismissAll();
      const needsOnboarding = !(response?.onboarding?.completed ?? false);
      router.replace(needsOnboarding ? '/(onboarding)/welcome' : '/(tabs)/chat');
    } catch (err) {
      setError((err as Error).message ?? t('login.error.generic'));
      setStatus('error');
      setOnboarding(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuroraBackground style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
          <BrandHeader title={t('login.title')} subtitle={t('login.subtitle')} align="center" />
          <GlassCard style={styles.formCard}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('login.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                inputMode="email"
                autoCapitalize="none"
                style={styles.input}
                placeholder={t('login.emailPlaceholder')}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('login.passwordLabel')}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.passwordInput]}
                  placeholder={t('login.passwordPlaceholder')}
                />
                <TouchableOpacity
                  style={styles.visibilityToggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordLink}>
                <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
              </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
            <View style={styles.primaryAction}>
              <PrimaryButton label={t('login.submit')} onPress={handleLogin} loading={loading} />
            </View>
          </GlassCard>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/register')}>
            <Text style={styles.secondaryButtonLabel}>{t('login.register')}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  formCard: {
    paddingVertical: 28,
  },
  primaryAction: {
    marginTop: 24,
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
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  error: {
    color: colors.error,
    marginTop: 12,
  },
  secondaryButton: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
