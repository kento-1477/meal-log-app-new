import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Platform, TouchableOpacity, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
// expo-apple-authentication is provided by the native runtime; eslint can't resolve it in monorepo CI
// eslint-disable-next-line import/no-unresolved
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { linkAppleAccount } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';

const logo = require('../../assets/brand/logo.png');

export default function OnboardingAppleConnect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const user = useSessionStore((state) => state.user);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || user?.appleLinked) {
      router.replace('/(tabs)/chat');
    }
  }, [router, user?.appleLinked]);

  const handleAppleLink = async () => {
    if (Platform.OS !== 'ios') return;
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

      const response = await linkAppleAccount({
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
      router.replace('/(tabs)/chat');
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        setStatus('idle');
        return;
      }
      const conflict = (err as { code?: string })?.code === 'auth.apple_conflict';
      if (conflict) {
        setError(t('onboarding.appleConnect.conflict'));
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(t('onboarding.appleConnect.error'));
      }
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)/chat');
  };

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

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.container}>
        <View style={styles.emojiWrap}>
          <View style={styles.avatarCircle}>
            <Image source={logo} style={styles.avatar} resizeMode="contain" />
          </View>
        </View>
        <Text style={styles.title}>{t('onboarding.appleConnect.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.appleConnect.subtitle')}</Text>
        {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleAppleLink}
            disabled={loading}
          />
        ) : null}
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
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>{t('onboarding.appleConnect.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
    backgroundColor: '#fff',
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
  skipButton: {
    paddingVertical: 4,
  },
  skipText: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
    textAlign: 'center',
  },
});
