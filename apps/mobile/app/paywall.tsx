import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
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
  PREMIUM_MONTHLY_PRODUCT_ID,
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
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';

const PaywallHeaderImage = require('../assets/images/paywall-header.png');

type PlanType = 'yearly' | 'monthly';

interface ComparisonRow {
  feature: string;
  subtitle?: string;
  free: string;
  premium: string;
  premiumIcon?: boolean;
}

const COMPARISON_DATA: ComparisonRow[] = [
  {
    feature: 'paywall.table.aiAnalysis',
    subtitle: 'paywall.table.perDay',
    free: '3回',
    premium: '20回',
  },
  {
    feature: 'paywall.table.historyRetention',
    free: '30日',
    premium: '90日',
  },
  {
    feature: 'paywall.table.monthlyCalorieDeficit',
    free: '—',
    premium: '✓',
    premiumIcon: true,
  },
];

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

  const [selectedPlan, setSelectedPlan] = useState<PlanType>('yearly');

  const {
    data: products,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['paywall', 'products'],
    queryFn: async () => {
      const result = await fetchIapProducts([PREMIUM_PRODUCT_ID, PREMIUM_MONTHLY_PRODUCT_ID]);
      return {
        yearly: result.find((p) => p.productId === PREMIUM_PRODUCT_ID) ?? null,
        monthly: result.find((p) => p.productId === PREMIUM_MONTHLY_PRODUCT_ID) ?? null,
      };
    },
    enabled: Platform.OS === 'ios',
    staleTime: 10 * 60 * 1000,
  });

  const yearlyProduct = products?.yearly;
  const monthlyProduct = products?.monthly;

  const purchaseMutation = useMutation({
    mutationFn: (plan: 'yearly' | 'monthly') => purchasePremiumPlan(plan),
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
        trackPaywallPurchaseCancel({ productId: selectedPlan === 'yearly' ? PREMIUM_PRODUCT_ID : PREMIUM_MONTHLY_PRODUCT_ID });
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
    mutationFn: () => restorePurchases([PREMIUM_PRODUCT_ID, PREMIUM_MONTHLY_PRODUCT_ID]),
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
    // 商品が取得されていない場合はエラー
    const selectedProduct = selectedPlan === 'yearly' ? yearlyProduct : monthlyProduct;
    if (!selectedProduct) {
      Alert.alert(t('paywall.error.generic'), 'Must query item from store before calling purchase');
      return;
    }
    purchaseMutation.mutate(selectedPlan);
  }, [isPremium, purchaseMutation, selectedPlan, yearlyProduct, monthlyProduct, t]);

  const handleRestore = useCallback(() => {
    restoreMutation.mutate();
  }, [restoreMutation]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/chat');
    }
  }, [router]);

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn('Failed to open URL', err);
    }
  }, []);

  const yearlyPriceInfo = useMemo(() => {
    if (productLoading) return { price: t('paywall.price.loading'), perMonth: '' };
    if (!yearlyProduct) return { price: t('paywall.price.unavailable'), perMonth: '' };
    const price = yearlyProduct.price || `¥${Math.round(yearlyProduct.priceAmount)}`;
    const perMonth = yearlyProduct.priceAmount > 0 ? `¥${Math.round(yearlyProduct.priceAmount / 12)}` : '';
    return { price, perMonth };
  }, [yearlyProduct, productLoading, t]);

  const monthlyPriceInfo = useMemo(() => {
    if (productLoading) return { price: t('paywall.price.loading') };
    if (!monthlyProduct) return { price: t('paywall.price.unavailable') };
    return { price: monthlyProduct.price || `¥${Math.round(monthlyProduct.priceAmount)}` };
  }, [monthlyProduct, productLoading, t]);

  const dailyPrice = useMemo(() => {
    if (!yearlyProduct || yearlyProduct.priceAmount <= 0) return '16';
    return Math.round(yearlyProduct.priceAmount / 365).toString();
  }, [yearlyProduct]);

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

  // DEBUG: Disabled to avoid connection conflict with fetchIapProducts
  // fetchIapProducts now has detailed logging, so this is not needed
  // useEffect(() => {
  //   if (Platform.OS === 'ios' && sessionStatus === 'authenticated') {
  //     console.log('[Paywall] Calling debugIAP...');
  //     debugIAP();
  //   }
  // }, [sessionStatus]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Feather name="x" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Header Image */}
          <View style={styles.headerImageContainer}>
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGradient}
            />
            <Image source={PaywallHeaderImage} style={styles.headerImage} resizeMode="cover" />
          </View>

          {/* Headline */}
          <Text style={styles.headline}>{t('paywall.headline')}</Text>

          {/* Comparison Table */}
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={styles.tableFeatureCol}>
                <Text style={styles.tableHeaderText}>{t('paywall.table.feature')}</Text>
              </View>
              <View style={styles.tableFreeCol}>
                <Text style={styles.tableHeaderText}>{t('paywall.table.free')}</Text>
              </View>
              <View style={styles.tablePremiumCol}>
                <Text style={styles.tablePremiumHeaderText}>{t('paywall.table.premium')}</Text>
              </View>
            </View>

            {/* Table Rows */}
            {COMPARISON_DATA.map((row, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={styles.tableFeatureCol}>
                  <Text style={styles.tableFeatureText}>{t(row.feature)}</Text>
                  {row.subtitle && <Text style={styles.tableSubtitle}>{t(row.subtitle)}</Text>}
                </View>
                <View style={styles.tableFreeCol}>
                  <Text style={styles.tableFreeValue}>{row.free}</Text>
                </View>
                <View style={styles.tablePremiumCol}>
                  {row.premiumIcon ? (
                    <Feather name="check" size={20} color="#22C55E" />
                  ) : (
                    <Text style={styles.tablePremiumValue}>{row.premium}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Plan Selection Cards */}
          <View style={styles.planCardsContainer}>
            {/* Yearly Plan */}
            <TouchableOpacity
              style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardSelected]}
              onPress={() => setSelectedPlan('yearly')}
              activeOpacity={0.8}
            >
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>{t('paywall.plan.yearly.badge')}</Text>
              </View>
              <Text style={styles.planTitle}>{t('paywall.plan.yearly')}</Text>
              <Text style={styles.planPrice}>{yearlyPriceInfo.price}</Text>
              <Text style={styles.planSubtitle}>/年</Text>
              {yearlyPriceInfo.perMonth && (
                <Text style={styles.planPerMonth}>{yearlyPriceInfo.perMonth}/月</Text>
              )}
            </TouchableOpacity>

            {/* Monthly Plan */}
            <TouchableOpacity
              style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
              onPress={() => setSelectedPlan('monthly')}
              activeOpacity={0.8}
            >
              <Text style={styles.planTitle}>{t('paywall.plan.monthly')}</Text>
              <Text style={styles.planPrice}>{monthlyPriceInfo.price}</Text>
            </TouchableOpacity>
          </View>

          {/* Trial Info */}
          <Text style={styles.trialInfo}>{t('paywall.trial.info', { daily: dailyPrice })}</Text>

          {/* CTA Button */}
          <TouchableOpacity
            style={[styles.ctaButton, (platformUnsupported || isPremium || premiumLoading || (!yearlyProduct && !monthlyProduct)) && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={platformUnsupported || isPremium || premiumLoading || purchaseMutation.isPending || (!yearlyProduct && !monthlyProduct)}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              {purchaseMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>{t('paywall.cta.startTrial')}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer Links */}
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={handleRestore} disabled={restoreMutation.isPending}>
              {restoreMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={styles.footerLink}>{t('paywall.footer.restore')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleOpenUrl(TERMS_OF_SERVICE_URL)}>
              <Text style={styles.footerLink}>{t('paywall.footer.terms')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleOpenUrl(PRIVACY_POLICY_URL)}>
              <Text style={styles.footerLink}>{t('paywall.footer.privacy')}</Text>
            </TouchableOpacity>
          </View>

          {/* Error Notice */}
          {productError ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{t('paywall.error.loadFailed')}</Text>
              <TouchableOpacity onPress={() => refetchProducts()}>
                <Text style={styles.retryLink}>{t('paywall.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {platformUnsupported ? (
            <View style={styles.errorCard}>
              <Feather name="smartphone" size={18} color={colors.accentInk} />
              <Text style={styles.errorText}>{t('paywall.error.unsupported')}</Text>
            </View>
          ) : null}
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
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerImageContainer: {
    height: 180,
    width: '100%',
    overflow: 'hidden',
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headline: {
    ...textStyles.titleLarge,
    fontSize: 24,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 20,
    paddingHorizontal: 24,
    color: colors.textPrimary,
  },
  tableContainer: {
    marginHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableFeatureCol: {
    flex: 2,
  },
  tableFreeCol: {
    flex: 1,
    alignItems: 'center',
  },
  tablePremiumCol: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    marginVertical: -12,
    paddingVertical: 12,
  },
  tableHeaderText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tablePremiumHeaderText: {
    ...textStyles.caption,
    fontWeight: '700',
    color: '#22C55E',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  tableFeatureText: {
    ...textStyles.body,
    fontWeight: '500',
    color: colors.textPrimary,
    fontSize: 14,
  },
  tableSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  tableFreeValue: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  tablePremiumValue: {
    ...textStyles.body,
    fontWeight: '600',
    color: '#22C55E',
    fontSize: 14,
  },
  planCardsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 12,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    ...textStyles.caption,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  planTitle: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 8,
    fontSize: 14,
  },
  planPrice: {
    ...textStyles.titleLarge,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
  },
  planSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: -4,
  },
  planPerMonth: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  trialInfo: {
    ...textStyles.body,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
    paddingHorizontal: 24,
  },
  ctaButton: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    ...textStyles.body,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
    paddingHorizontal: 24,
  },
  footerLink: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 92, 92, 0.1)',
  },
  errorText: {
    ...textStyles.caption,
    color: colors.error,
    flex: 1,
  },
  retryLink: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
});
