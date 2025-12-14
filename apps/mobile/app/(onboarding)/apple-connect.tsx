import { useCallback, useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, View, Platform, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      <View style={styles.page}>
        <View style={styles.center}>
          <View style={styles.avatarCircle}>
            <Image source={logo} style={styles.avatar} resizeMode="contain" />
          </View>
          <Text style={styles.title}>{t('onboarding.appleConnect.title')}</Text>
          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleContinue}
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
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  avatarCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 80,
    height: 80,
  },
  title: {
    ...textStyles.titleMedium,
    textAlign: 'center',
    color: colors.textPrimary,
    lineHeight: 30,
  },
  appleButton: {
    width: '100%',
    maxWidth: 340,
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
