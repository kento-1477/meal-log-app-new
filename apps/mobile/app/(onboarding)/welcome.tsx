import { useCallback, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { trackOnboardingStepCompleted } from '@/analytics/events';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { useOnboardingStore } from '@/store/onboarding';
import { useSessionStore } from '@/store/session';
import { useTranslation } from '@/i18n';
import { logout } from '@/services/api';
import { colors } from '@/theme/colors';
import { fontFamilies } from '@/theme/typography';

const heroImage = require('../../assets/images/welcome-hero.png');

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sessionId = useOnboardingStore((state) => state.sessionId);
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const setOnboarding = useSessionStore((state) => state.setOnboarding);
  const { t } = useTranslation();
  const [returning, setReturning] = useState(false);

  useOnboardingStep('welcome');

  const handleStart = useCallback(() => {
    trackOnboardingStepCompleted({ step: 'welcome', sessionId });
    router.push('/(onboarding)/goals');
  }, [router, sessionId]);

  const handleBackToLogin = useCallback(async () => {
    if (returning) return;
    setReturning(true);
    try {
      if (user) {
        await logout();
      }
    } catch (error) {
      console.warn('Failed to logout from onboarding welcome', error);
    } finally {
      setReturning(false);
    }
    resetOnboarding();
    setUsage(null);
    setOnboarding(null);
    setUser(null);
    router.replace('/login');
  }, [resetOnboarding, returning, router, setOnboarding, setUsage, setUser, user]);

  return (
    <View style={styles.screen}>
      <ImageBackground source={heroImage} resizeMode="cover" style={styles.hero}>
        <LinearGradient
          colors={['rgba(7, 14, 23, 0.64)', 'rgba(7, 14, 23, 0.28)', 'rgba(7, 14, 23, 0.74)']}
          locations={[0.04, 0.38, 1]}
          style={styles.overlay}
        />
        <SafeAreaView
          style={[styles.safeArea, { paddingTop: Math.max(16, insets.top + 4), paddingBottom: Math.max(12, insets.bottom + 4) }]}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <View style={styles.topSection}>
            <View style={styles.topRow}>
              <Pressable
                onPress={handleBackToLogin}
                disabled={returning}
                style={({ pressed }) => [
                  styles.backToLoginButton,
                  (pressed || returning) && styles.backToLoginButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.welcome.backToLogin')}
              >
                <Text style={styles.backToLoginText}>{t('onboarding.welcome.backToLogin')}</Text>
              </Pressable>
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>{t('onboarding.welcome.heroTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.welcome.heroSubtitle')}</Text>
            </View>
          </View>

          <View style={styles.bottomArea}>
            <View style={styles.toast}>
              <Text style={styles.toastText}>{t('onboarding.welcome.toast')}</Text>
            </View>

            <View style={styles.card}>
              <LinearGradient colors={['rgba(255, 241, 196, 0.95)', 'rgba(247, 208, 110, 0.92)']} style={styles.calorieBlock}>
                <Text style={styles.calorieLabel}>{t('onboarding.welcome.calories')}</Text>
                <View style={styles.calorieRow}>
                  <Text style={styles.calorieValue}>800</Text>
                  <Text style={styles.calorieUnit}>kcal</Text>
                </View>
              </LinearGradient>
              <View style={styles.macroRow}>
                <View style={[styles.macroChip, styles.proteinChip]}>
                  <Text style={[styles.macroLabel, styles.proteinText]}>{t('onboarding.welcome.protein')}</Text>
                  <Text style={[styles.macroValue, styles.proteinText]}>31 g</Text>
                </View>
                <View style={[styles.macroChip, styles.fatChip]}>
                  <Text style={[styles.macroLabel, styles.fatText]}>{t('onboarding.welcome.fat')}</Text>
                  <Text style={[styles.macroValue, styles.fatText]}>22 g</Text>
                </View>
                <View style={[styles.macroChip, styles.carbChip]}>
                  <Text style={[styles.macroLabel, styles.carbText]}>{t('onboarding.welcome.carbs')}</Text>
                  <Text style={[styles.macroValue, styles.carbText]}>117 g</Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.welcome.cta')}
            >
              <Text style={styles.buttonText}>{t('onboarding.welcome.cta')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080f17',
  },
  hero: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    gap: 16,
  },
  topRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  backToLoginButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  backToLoginButtonPressed: {
    opacity: 0.75,
  },
  backToLoginText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.92)',
  },
  header: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    textAlign: 'center',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 9,
  },
  subtitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.94)',
    maxWidth: 356,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  bottomArea: {
    alignItems: 'center',
    gap: 18,
  },
  toast: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginRight: 14,
  },
  toastText: {
    fontFamily: fontFamilies.medium,
    fontSize: 20,
    color: '#111827',
  },
  card: {
    width: '92%',
    borderRadius: 34,
    backgroundColor: 'rgba(250, 249, 244, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    transform: [{ rotate: '-11deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  calorieBlock: {
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  calorieLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 17,
    color: 'rgba(43, 43, 43, 0.7)',
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calorieValue: {
    fontFamily: fontFamilies.display,
    fontSize: 42,
    lineHeight: 46,
    color: '#0f172a',
  },
  calorieUnit: {
    fontFamily: fontFamilies.semibold,
    fontSize: 22,
    color: '#111827',
    marginTop: 9,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroChip: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  proteinChip: {
    borderColor: 'rgba(233, 177, 52, 0.4)',
  },
  fatChip: {
    borderColor: 'rgba(207, 99, 120, 0.4)',
  },
  carbChip: {
    borderColor: 'rgba(116, 115, 255, 0.4)',
  },
  macroLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
  },
  macroValue: {
    fontFamily: fontFamilies.semibold,
    fontSize: 19,
  },
  proteinText: {
    color: '#c58f28',
  },
  fatText: {
    color: '#c56975',
  },
  carbText: {
    color: '#6665d8',
  },
  button: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 19,
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    fontFamily: fontFamilies.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.1,
    color: '#1d71ce',
  },
});
