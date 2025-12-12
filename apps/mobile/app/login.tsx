import { useState } from 'react';
import { Image, Linking, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { signInWithApple } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';

const logo = require('../assets/brand/logo.png');

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const { t } = useTranslation();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn('Failed to open url', url, err);
    }
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('missing_identity_token');
      }

      const response = await signInWithApple({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        email: credential.email ?? undefined,
        fullName: credential.fullName
          ? `${credential.fullName.givenName ?? ''} ${credential.fullName.familyName ?? ''}`.trim()
          : undefined,
      });

      setUser(response?.user ?? null);
      setUsage(response?.usage ?? null);
      setOnboarding(response?.onboarding ?? null);
      setStatus('authenticated');
      router.dismissAll();
      const needsOnboarding = !(response?.onboarding?.completed ?? false);
      router.replace(needsOnboarding ? '/(onboarding)/welcome' : '/(tabs)/chat');
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        setStatus('idle');
        return;
      }
      const conflict = (err as { code?: string })?.code === 'auth.apple_conflict';
      if (conflict) {
        setError(t('login.appleConflict'));
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(t('login.appleError'));
      }
      setStatus('error');
      setOnboarding(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.page}>
        <View style={styles.center}>
          <View style={styles.avatarCircle}>
            <Image source={logo} style={styles.avatar} resizeMode="contain" />
          </View>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleLogin}
              disabled={loading}
            />
          ) : (
            <Text style={styles.unsupportedText}>現在このアプリはiOSのみ対応しています。</Text>
          )}
        </View>

        <Text style={styles.legal}>
          {t('login.appleLegal.prefix')}
          <Text style={styles.link} onPress={() => handleOpenUrl(PRIVACY_POLICY_URL)}>
            {t('common.privacyPolicy')}
          </Text>
          {t('login.appleLegal.connector')}
          <Text style={styles.link} onPress={() => handleOpenUrl(TERMS_OF_SERVICE_URL)}>
            {t('common.termsOfService')}
          </Text>
          {t('login.appleLegal.suffix')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 120,
    height: 120,
  },
  title: {
    ...textStyles.titleMedium,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyles.body,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  appleButton: {
    width: '100%',
    height: 44,
  },
  legal: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    fontWeight: '600',
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
    textAlign: 'center',
  },
  unsupportedText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

