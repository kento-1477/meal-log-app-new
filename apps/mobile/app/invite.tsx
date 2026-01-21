import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { useTranslation } from '@/i18n';

/**
 * Dummy screen so Expo Router can resolve meallog://invite deep links.
 * The actual referral claim is handled globally via useReferralDeepLink,
 * so this screen only shows a lightweight status and redirects home.
 */
export default function InviteRedirectScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace('/');
    }, 0);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.title}>{t('invite.processingTitle')}</Text>
      <Text style={styles.subtitle}>{t('invite.processingSubtitle')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
