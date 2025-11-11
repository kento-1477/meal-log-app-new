import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { PremiumStatus as PremiumStatusPayload } from '@meal-log/shared';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useSessionStore } from '@/store/session';
import { usePremiumStore } from '@/store/premium';
import {
  fetchIapProducts,
  IAP_UNSUPPORTED_ERROR,
  PREMIUM_PRODUCT_ID,
  purchasePremiumPlan,
  restorePurchases,
} from '@/services/iap';
import {
  trackPaywallViewed,
  trackPaywallPurchaseSuccess,
  trackPaywallPurchaseCancel,
  trackPaywallPurchaseFailure,
  trackPaywallRestoreSuccess,
  trackPaywallRestoreFailure,
} from '@/analytics/events';

const FEATURE_KEYS = [
  'paywall.feature.history',
  'paywall.feature.ai',
  'paywall.feature.dashboard',
  'paywall.feature.support',
] as const;

type FeatureKey = (typeof FEATURE_KEYS)[number];

type FeatureIconConfig = {
  icon: ComponentProps<typeof Feather>['name'];
  background: string;
  color: string;
};

const FEATURE_ICON_MAP: Record<FeatureKey, FeatureIconConfig> = {
  'paywall.feature.history': {
    icon: 'clock',
    background: 'rgba(31,36,44,0.08)',
    color: colors.accentInk,
  },
  'paywall.feature.ai': {
    icon: 'message-circle',
    background: 'rgba(245,178,37,0.18)',
    color: colors.accent,
  },
  'paywall.feature.dashboard': {
    icon: 'bar-chart-2',
    background: 'rgba(116,210,194,0.18)',
    color: colors.accentSage,
  },
  'paywall.feature.support': {
    icon: 'life-buoy',
    background: 'rgba(17,19,24,0.08)',
    color: colors.accentInk,
  },
};

export default function PaywallScreen() {
  const { t } = useTranslation();
  const { status: premiumStatus, isLoading: premiumLoading } = usePremiumStatus();
  const isPremium = premiumStatus?.isPremium ?? false;
  const router = useRouter();
  const setUsage = useSessionStore((state) => state.setUsage);
  const sessionStatus = useSessionStore((state) => state.status);
  const setPremiumStoreStatus = usePremiumStore((state) => state.setStatus);
  const setPremiumStoreError = usePremiumStore((state) => state.setError);
  const setPremiumStoreLoading = usePremiumStore((state) => state.setLoading);

  const {
    data: premiumProduct,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['paywall', 'product', PREMIUM_PRODUCT_ID],
    queryFn: async () => {
      const [product] = await fetchIapProducts([PREMIUM_PRODUCT_ID]);
      return product ?? null;
    },
    enabled: Platform.OS === 'ios',
    staleTime: 10 * 60 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: purchasePremiumPlan,
    onMutate: () => {
      setPremiumStoreLoading(true);
      setPremiumStoreError(null);
      Alert.alert(t('paywall.alert.purchasePending'));
    },
    onSuccess: (result) => {
      setUsage(result.response.usage);
      setPremiumStoreStatus(transformPremiumStatus(result.response.premiumStatus));
      trackPaywallPurchaseSuccess({ productId: result.productId });
      Alert.alert(t('paywall.alert.purchaseSuccess'));
      router.replace('/(tabs)/dashboard');
    },
    onError: (error: unknown) => {
      const err = error as { code?: string; message?: string } | Error;
      if ((err as any)?.code === 'iap.cancelled') {
        trackPaywallPurchaseCancel({ productId: PREMIUM_PRODUCT_ID });
        setPremiumStoreLoading(false);
        return;
      }
      if ((err as any)?.code === IAP_UNSUPPORTED_ERROR) {
        Alert.alert(t('paywall.error.unsupported'));
        setPremiumStoreError(t('paywall.error.unsupported'));
        trackPaywallPurchaseFailure({ productId: PREMIUM_PRODUCT_ID, code: IAP_UNSUPPORTED_ERROR });
        setPremiumStoreLoading(false);
        return;
      }
      const message = err instanceof Error ? err.message : undefined;
      Alert.alert(t('paywall.error.generic'), message);
      setPremiumStoreError(message ?? t('paywall.error.generic'));
      trackPaywallPurchaseFailure({ productId: PREMIUM_PRODUCT_ID, message, code: (err as any)?.code });
      setPremiumStoreLoading(false);
    },
    onSettled: () => {
      setPremiumStoreLoading(false);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => restorePurchases([PREMIUM_PRODUCT_ID]),
    onMutate: () => {
      setPremiumStoreLoading(true);
      setPremiumStoreError(null);
    },
    onSuccess: (result) => {
      if (result.restored.length === 0) {
        Alert.alert(t('paywall.alert.restoreEmpty'));
        trackPaywallRestoreFailure({ productId: PREMIUM_PRODUCT_ID, code: 'iap.notFound' });
        return;
      }

      const latest = result.restored[result.restored.length - 1];
      setUsage(latest.response.usage);
      setPremiumStoreStatus(transformPremiumStatus(latest.response.premiumStatus));
      trackPaywallRestoreSuccess({ productId: latest.productId, restoredCount: result.restored.length });
      Alert.alert(t('paywall.alert.restoreSuccess'));
      router.replace('/(tabs)/dashboard');
    },
    onError: (error: unknown) => {
      const err = error as { code?: string; message?: string } | Error;
      if ((err as any)?.code === 'iap.cancelled') {
        trackPaywallRestoreFailure({ productId: PREMIUM_PRODUCT_ID, code: 'iap.cancelled' });
        setPremiumStoreLoading(false);
        return;
      }
      if ((err as any)?.code === IAP_UNSUPPORTED_ERROR) {
        Alert.alert(t('paywall.error.unsupported'));
        setPremiumStoreError(t('paywall.error.unsupported'));
        trackPaywallRestoreFailure({ productId: PREMIUM_PRODUCT_ID, code: IAP_UNSUPPORTED_ERROR });
        setPremiumStoreLoading(false);
        return;
      }
      const message = err instanceof Error ? err.message : undefined;
      Alert.alert(t('paywall.error.restoreFailed'), message);
      setPremiumStoreError(message ?? t('paywall.error.restoreFailed'));
      trackPaywallRestoreFailure({ productId: PREMIUM_PRODUCT_ID, code: (err as any)?.code, message });
      setPremiumStoreLoading(false);
    },
    onSettled: () => {
      setPremiumStoreLoading(false);
    },
  });

  const handlePurchase = useCallback(() => {
    if (isPremium) {
      Alert.alert(t('paywall.status.alreadyPremium'));
      return;
    }
    purchaseMutation.mutate();
  }, [isPremium, purchaseMutation, t]);

  const handleRestore = useCallback(() => {
    restoreMutation.mutate();
  }, [restoreMutation]);

  const featureList = useMemo(
    () => FEATURE_KEYS.map((key) => ({ key, label: t(key), iconConfig: FEATURE_ICON_MAP[key] })),
    [t],
  );

  const spotlightHighlights = useMemo(
    () => [
      {
        key: 'ai',
        label: t('paywall.spotlight.ai.title'),
        description: t('paywall.spotlight.ai.description'),
        value: '3→20',
        background: 'rgba(245,178,37,0.12)',
        glow: 'rgba(245,178,37,0.32)',
        valueColor: colors.accent,
      },
      {
        key: 'history',
        label: t('paywall.spotlight.history.title'),
        description: t('paywall.spotlight.history.description'),
        value: '90+',
        background: 'rgba(116,210,194,0.14)',
        glow: 'rgba(116,210,194,0.35)',
        valueColor: colors.accentSage,
      },
      {
        key: 'insight',
        label: t('paywall.spotlight.dashboard.title'),
        description: t('paywall.spotlight.dashboard.description'),
        value: 'Pro',
        background: 'rgba(17,19,24,0.12)',
        glow: 'rgba(17,19,24,0.28)',
        valueColor: colors.accentInk,
      },
    ],
    [t],
  );

  const priceLabel = useMemo(() => {
    if (productLoading) {
      return t('paywall.price.loading');
    }
    if (!premiumProduct) {
      return t('paywall.price.unavailable');
    }
    return premiumProduct.localizedPrice ?? premiumProduct.price;
  }, [premiumProduct, productLoading, t]);

  const platformUnsupported = Platform.OS !== 'ios';

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && isPremium) {
      router.replace('/(tabs)/dashboard');
    }
  }, [router, sessionStatus, isPremium]);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && !isPremium) {
      trackPaywallViewed();
    }
  }, [sessionStatus, isPremium]);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#E9F1FF', '#FDF9F2', '#FFF4E2']}
        locations={[0, 0.6, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.heroWrapper}>
            <LinearGradient
              colors={['#FFFFFF', '#FFF5E9', '#F5F1FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerCard}
            >
              <View style={styles.heroHalo} />
              <View style={styles.heroBadgeRow}>
                <View style={styles.badgePill}>
                  <Text style={styles.breadcrumb}>{t('paywall.badge')}</Text>
                </View>
                {!platformUnsupported ? <Text style={styles.badgeHint}>{t('paywall.heroHint')}</Text> : null}
              </View>
              <Text style={styles.title}>{t('paywall.title')}</Text>
              <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>
              <View style={styles.pricePill}>
                {productLoading ? (
                  <ActivityIndicator color={colors.accentInk} />
                ) : (
                  <>
                    <Text style={styles.price}>{priceLabel}</Text>
                    <Text style={styles.priceCaption}>{t('paywall.priceCaption')}</Text>
                  </>
                )}
              </View>
              {isPremium ? (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>
                    {t('paywall.status.active', { days: premiumStatus?.daysRemaining ?? 0 })}
                  </Text>
                </View>
              ) : null}
            </LinearGradient>
          </View>

        <View style={styles.manifestCard}>
          <Text style={styles.manifestTitle}>{t('paywall.manifest.title')}</Text>
          <Text style={styles.manifestDescription}>{t('paywall.manifest.description')}</Text>
        </View>

        <View style={styles.spotlightSection}>
          <Text style={styles.sectionEyebrow}>{t('paywall.spotlight.title')}</Text>
          <View style={styles.spotlightGrid}>
            {spotlightHighlights.map((item) => (
              <View key={item.key} style={[styles.spotlightCard, { backgroundColor: item.background }]}>
                <View style={[styles.spotlightGlow, { backgroundColor: item.glow }]} />
                <Text style={styles.spotlightLabel}>{item.label}</Text>
                <Text style={[styles.spotlightValue, { color: item.valueColor }]}>{item.value}</Text>
                <Text style={styles.spotlightDescription}>{item.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {platformUnsupported ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>{t('paywall.error.unsupported')}</Text>
            <Text style={styles.noticeDescription}>{t('paywall.error.unsupportedDescription')}</Text>
          </View>
        ) : null}

        {productError ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>{t('paywall.error.loadFailed')}</Text>
            <Text style={styles.noticeDescription}>{t('paywall.error.loadFailedDescription')}</Text>
            <TouchableOpacity onPress={() => refetchProducts()} style={styles.retryButton}>
              <Text style={styles.retryLabel}>{t('paywall.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.featureCard}>
          <Text style={styles.sectionTitle}>{t('paywall.featuresTitle')}</Text>
          <View style={styles.featureList}>
            {featureList.map((feature) => (
              <View style={styles.featureRow} key={feature.key}>
                <View style={[styles.featureIcon, { backgroundColor: feature.iconConfig.background }]}>
                  <Feather name={feature.iconConfig.icon} size={20} color={feature.iconConfig.color} />
                </View>
                <Text style={styles.featureText}>{feature.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (platformUnsupported || isPremium || premiumLoading) && styles.buttonDisabled]}
          onPress={handlePurchase}
          disabled={platformUnsupported || isPremium || premiumLoading || purchaseMutation.isLoading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#1F1A11', '#1B1205', '#3B2400']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryButtonGradient}
          >
            {purchaseMutation.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonLabel}>
                {isPremium ? t('paywall.primaryButton.premium') : t('paywall.primaryButton.default')}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, (platformUnsupported || restoreMutation.isLoading) && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={platformUnsupported || restoreMutation.isLoading}
        >
          {restoreMutation.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.secondaryButtonLabel}>{t('paywall.secondaryButton.restore')}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>{t('paywall.disclaimer')}</Text>

        <View style={styles.footerLinks}>
          <Link href="/settings" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkLabel}>{t('paywall.link.managePlan')}</Text>
            </TouchableOpacity>
          </Link>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function transformPremiumStatus(payload: PremiumStatusPayload) {
  return {
    isPremium: payload.isPremium,
    source: payload.source,
    daysRemaining: payload.daysRemaining,
    expiresAt: payload.expiresAt,
    grants: (payload.grants ?? []).map((grant) => ({
      source: grant.source,
      days: grant.days,
      startDate: grant.startDate,
      endDate: grant.endDate,
      createdAt: grant.createdAt,
    })),
  };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 24,
  },
  heroWrapper: {
    borderRadius: 36,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 12,
  },
  headerCard: {
    borderRadius: 36,
    padding: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  heroHalo: {
    position: 'absolute',
    top: -120,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: colors.cardHalo,
    opacity: 0.7,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  badgePill: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  breadcrumb: {
    ...textStyles.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.accentInk,
  },
  badgeHint: {
    ...textStyles.caption,
    color: colors.accentInk,
    opacity: 0.7,
  },
  title: {
    ...textStyles.display,
    fontSize: 32,
    lineHeight: 40,
    color: colors.accentInk,
  },
  subtitle: {
    ...textStyles.body,
    fontSize: 17,
    color: colors.textSecondary,
    marginTop: 10,
    lineHeight: 26,
  },
  pricePill: {
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'flex-start',
    gap: 4,
  },
  price: {
    ...textStyles.titleLarge,
    color: colors.accentInk,
    fontSize: 30,
  },
  priceCaption: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'flex-start',
  },
  statusText: {
    ...textStyles.caption,
    color: colors.accentInk,
  },
  manifestCard: {
    borderRadius: 30,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 8,
  },
  manifestTitle: {
    ...textStyles.heading,
    fontSize: 26,
    color: colors.accentInk,
    letterSpacing: -0.3,
  },
  manifestDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 24,
  },
  spotlightSection: {
    gap: 12,
  },
  sectionEyebrow: {
    ...textStyles.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spotlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  spotlightCard: {
    flex: 1,
    minWidth: '48%',
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  spotlightGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 120,
    opacity: 0.6,
  },
  spotlightLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  spotlightValue: {
    ...textStyles.titleLarge,
    marginTop: 8,
  },
  spotlightDescription: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginTop: 6,
  },
  noticeCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  noticeTitle: {
    ...textStyles.titleMedium,
    fontSize: 18,
    marginBottom: 8,
    color: colors.textPrimary,
  },
  noticeDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  retryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  retryLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  featureCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 28,
    padding: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: colors.glassStroke,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    fontSize: 20,
  },
  featureList: {
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  featureText: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  primaryButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  secondaryButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  disclaimer: {
    ...textStyles.caption,
    marginTop: 8,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footerLinks: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  linkButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  linkLabel: {
    ...textStyles.body,
    color: colors.accent,
  },
});
