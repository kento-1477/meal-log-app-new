import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
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
    () => FEATURE_KEYS.map((key) => ({ key, label: t(key) })),
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.breadcrumb}>{t('paywall.badge')}</Text>
          <Text style={styles.title}>{t('paywall.title')}</Text>
          <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>
          <View style={styles.priceRow}>
            {productLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.price}>{priceLabel}</Text>
            )}
          </View>
          {isPremium ? (
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {t('paywall.status.active', { days: premiumStatus?.daysRemaining ?? 0 })}
              </Text>
            </View>
          ) : null}
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
          {featureList.map((feature) => (
            <View style={styles.featureRow} key={feature.key}>
              <View style={styles.featureBullet} />
              <Text style={styles.featureText}>{feature.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (platformUnsupported || isPremium || premiumLoading) && styles.buttonDisabled]}
          onPress={handlePurchase}
          disabled={platformUnsupported || isPremium || premiumLoading || purchaseMutation.isLoading}
        >
          {purchaseMutation.isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonLabel}>
              {isPremium ? t('paywall.primaryButton.premium') : t('paywall.primaryButton.default')}
            </Text>
          )}
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
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 24,
    gap: 20,
  },
  headerCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 24,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  breadcrumb: {
    ...textStyles.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    marginTop: 4,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  price: {
    ...textStyles.titleMedium,
    color: colors.accent,
  },
  statusBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(52,199,89,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusText: {
    ...textStyles.caption,
    color: colors.success,
  },
  noticeCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  featureText: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
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
