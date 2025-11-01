import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassCard } from '@/components/GlassCard';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { registerUser } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
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
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);
      const response = await registerUser({
        email: email.trim(),
        password: password.trim(),
        username: username.trim() ? username.trim() : undefined,
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
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholder={t('register.passwordPlaceholder')}
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('register.usernameLabel')}</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="words"
              style={styles.input}
              placeholder={t('register.usernamePlaceholder')}
            />
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
