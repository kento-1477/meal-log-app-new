import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { GlassCard } from '@/components/GlassCard';
import { login } from '@/services/api';
import { useSessionStore } from '@/store/session';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);

  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);
      const response = await login({ email, password });
      setUser(response?.user ?? null);
      setUsage(response?.usage ?? null);
      setStatus('authenticated');
      router.replace('/(tabs)/chat');
    } catch (err) {
      setError((err as Error).message ?? 'ログインに失敗しました');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <View style={styles.header}> 
          <Text style={styles.title}>Meal Log</Text>
          <Text style={styles.subtitle}>食事を記録して、AI が栄養素を推定します。</Text>
        </View>
        <GlassCard>
          <View style={styles.formGroup}>
            <Text style={styles.label}>メールアドレス</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              inputMode="email"
              autoCapitalize="none"
              style={styles.input}
              placeholder="you@example.com"
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>パスワード</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholder="••••••••"
            />
          </View>
          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
          <View style={{ marginTop: 24 }}>
            <PrimaryButton label="ログイン" onPress={handleLogin} loading={loading} />
          </View>
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
    fontSize: 36,
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
});
