import { useState } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
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
      <View style={styles.background} pointerEvents="none">
        <LinearGradient
          colors={[colors.cardAuroraStart, colors.cardAuroraMid, colors.cardAuroraEnd]}
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 0.85, y: 0.95 }}
          style={styles.auroraGradient}
        />
        <View style={[styles.auroraBlob, styles.auroraBlobA]} />
        <View style={[styles.auroraBlob, styles.auroraBlobB]} />
        <View style={[styles.auroraBlob, styles.auroraBlobC]} />
      </View>

      <View style={styles.page}>
        <View style={styles.center}>
          <View style={styles.card}>
            <View style={styles.logoWrap}>
              <LinearGradient
                colors={['rgba(245,178,37,0.18)', 'rgba(116,210,194,0.12)', 'transparent']}
                start={{ x: 0.2, y: 0.1 }}
                end={{ x: 0.8, y: 0.9 }}
                style={styles.logoHalo}
              />
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            </View>

            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {Platform.OS === 'ios' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleLogin}
                disabled={loading}
              />
            ) : (
              <Text style={styles.unsupportedText}>{t('login.unsupportedPlatform')}</Text>
            )}
          </View>
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
    backgroundColor: colors.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  auroraGradient: {
    position: 'absolute',
    left: -80,
    right: -80,
    top: -120,
    height: '62%',
    opacity: 0.9,
  },
  auroraBlob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.9,
  },
  auroraBlobA: {
    width: 360,
    height: 360,
    top: -160,
    left: -140,
    backgroundColor: colors.cardAuroraStart,
  },
  auroraBlobB: {
    width: 420,
    height: 420,
    top: -220,
    right: -180,
    opacity: 0.85,
    backgroundColor: colors.cardAuroraMid,
  },
  auroraBlobC: {
    width: 420,
    height: 420,
    top: 160,
    left: -200,
    opacity: 0.7,
    backgroundColor: colors.cardAuroraEnd,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 9,
  },
  logoWrap: {
    marginTop: 6,
    alignSelf: 'center',
    width: 124,
    height: 124,
    borderRadius: 999,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoHalo: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 999,
    transform: [{ translateY: 12 }],
  },
  logo: {
    width: 84,
    height: 84,
  },
  title: {
    ...textStyles.titleMedium,
    textAlign: 'center',
    color: colors.textPrimary,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 10,
    marginBottom: 18,
  },
  appleButton: {
    alignSelf: 'stretch',
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
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
    color: colors.error,
    textAlign: 'center',
  },
  unsupportedText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
