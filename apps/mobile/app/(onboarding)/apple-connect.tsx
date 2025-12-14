import { useCallback, useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, View, Platform, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import type { UpdateUserProfileRequest } from '@meal-log/shared';
import { estimateTargetDate } from '@meal-log/shared';
import { signInWithApple, updateUserProfile, getPremiumStatus } from '@/services/api';
import { useSessionStore } from '@/store/session';
import { useOnboardingStore } from '@/store/onboarding';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';
import { trackOnboardingCompleted } from '@/analytics/events';
import { usePremiumStore } from '@/store/premium';

const logo = require('../../assets/brand/logo.png');

export default function OnboardingAppleConnect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const user = useSessionStore((state) => state.user);
  const locale = useSessionStore((state) => state.locale);
  const draft = useOnboardingStore((state) => state.draft);
  const resetDraft = useOnboardingStore((state) => state.reset);
  const startedAt = useOnboardingStore((state) => state.startedAt);
  const setPremiumStatus = usePremiumStore((state) => state.setStatus);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => PLAN_INTENSITY_OPTIONS.find((item) => item.id === draft.planIntensity) ?? null, [draft.planIntensity]);

  const targetDateIso = useMemo(() => {
    if (!draft.currentWeightKg || !draft.targetWeightKg || !plan) {
      return null;
    }
    return estimateTargetDate({
      currentWeightKg: draft.currentWeightKg,
      targetWeightKg: draft.targetWeightKg,
      weeklyRateKg: plan.weeklyRateKg,
      startDate: new Date(),
    });
  }, [draft.currentWeightKg, draft.targetWeightKg, plan]);

  const buildProfilePayload = useCallback((): UpdateUserProfileRequest => {
    const completedAt = new Date().toISOString();
    return {
      display_name: draft.displayName ? draft.displayName.trim() : null,
      gender: draft.gender ?? null,
      birthdate: draft.birthdate ?? null,
      height_cm: draft.heightCm ?? null,
      unit_preference: 'METRIC',
      marketing_source: draft.marketingSource ? draft.marketingSource.trim() : null,
      marketing_referral_code: draft.marketingReferralCode ? draft.marketingReferralCode.trim() : null,
      goals: draft.goals,
      body_weight_kg: draft.bodyWeightKg ?? draft.currentWeightKg ?? null,
      current_weight_kg: draft.currentWeightKg ?? null,
      target_weight_kg: draft.targetWeightKg ?? null,
      plan_intensity: draft.planIntensity ?? null,
      target_date: targetDateIso,
      activity_level: draft.activityLevel ?? null,
      apple_health_linked: false,
      questionnaire_completed_at: completedAt,
      language: locale ?? null,
    };
  }, [draft, locale, targetDateIso]);

  const handleAppleContinue = async () => {
    if (Platform.OS !== 'ios') {
      setError(t('login.appleError'));
      return;
    }
    try {
      setLoading(true);
      setStatus('loading');
      setError(null);

      if (!user) {
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
      }

      const profileResult = await updateUserProfile(buildProfilePayload());
      const completedAt = profileResult.profile.questionnaire_completed_at ?? new Date().toISOString();
      setOnboarding({ completed: true, completed_at: completedAt });
      trackOnboardingCompleted({ durationMs: Date.now() - (startedAt ?? Date.now()) });
      resetDraft();

      if (profileResult.referralClaimed && profileResult.referralResult) {
        Alert.alert(
          '🎉 プレミアムを獲得しました！',
          `${profileResult.referralResult.premiumDays}日間のプレミアムが付与されました。${profileResult.referralResult.referrerUsername ?? ''}`.trim(),
        );
        getPremiumStatus()
          .then((status) => setPremiumStatus(status))
          .catch((err) => console.warn('Failed to refresh premium status', err));
      }

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
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{t('onboarding.appleConnect.badge')}</Text>
            </View>

            <View style={styles.logoWrap}>
              <LinearGradient
                colors={['rgba(245,178,37,0.18)', 'rgba(116,210,194,0.12)', 'transparent']}
                start={{ x: 0.2, y: 0.1 }}
                end={{ x: 0.8, y: 0.9 }}
                style={styles.logoHalo}
              />
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            </View>

            <Text style={styles.title}>{t('onboarding.appleConnect.title')}</Text>
            <Text style={styles.subcopy}>{t('onboarding.appleConnect.subtitle')}</Text>

            <View style={styles.benefits}>
              {(['benefit1', 'benefit2', 'benefit3'] as const).map((key) => (
                <View key={key} style={styles.benefitRow}>
                  <View style={styles.tick}>
                    <Text style={styles.tickText}>✓</Text>
                  </View>
                  <Text style={styles.benefitText}>{t(`onboarding.appleConnect.${key}`)}</Text>
                </View>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {Platform.OS === 'ios' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleContinue}
                disabled={loading}
              />
            ) : (
              <Text style={styles.unsupportedText}>現在このアプリはiOSのみ対応しています。</Text>
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
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(245,178,37,0.16)',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b36a00',
    letterSpacing: 0.2,
  },
  title: {
    ...textStyles.titleMedium,
    textAlign: 'center',
    color: colors.textPrimary,
    lineHeight: 28,
    marginTop: 12,
  },
  subcopy: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  logoWrap: {
    marginTop: 18,
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
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  benefits: {
    marginTop: 18,
    marginBottom: 16,
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: 'rgba(116,210,194,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f6f61',
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
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
    marginTop: 4,
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
