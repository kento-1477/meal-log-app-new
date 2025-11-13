import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type PlanComparisonRow = {
  key: string;
  icon: ComponentProps<typeof Feather>['name'];
  labelKey: string;
  freeKey: string;
  premiumKey: string;
};

const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'ai',
    icon: 'message-circle',
    labelKey: 'paywall.comparison.ai.label',
    freeKey: 'paywall.comparison.ai.free',
    premiumKey: 'paywall.comparison.ai.premium',
  },
  {
    key: 'history',
    icon: 'archive',
    labelKey: 'paywall.comparison.history.label',
    freeKey: 'paywall.comparison.history.free',
    premiumKey: 'paywall.comparison.history.premium',
  },
  {
    key: 'dashboard',
    icon: 'bar-chart-2',
    labelKey: 'paywall.comparison.dashboard.label',
    freeKey: 'paywall.comparison.dashboard.free',
    premiumKey: 'paywall.comparison.dashboard.premium',
  },
  {
    key: 'recent',
    icon: 'clock',
    labelKey: 'paywall.comparison.recent.label',
    freeKey: 'paywall.comparison.recent.free',
    premiumKey: 'paywall.comparison.recent.premium',
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

  const handleReturnToChat = useCallback(() => {
    router.replace('/(tabs)/chat');
  }, [router]);

  const comparisonRows = useMemo(
    () =>
      PLAN_COMPARISON_ROWS.map((row) => ({
        key: row.key,
        icon: row.icon,
        label: t(row.labelKey),
        free: t(row.freeKey),
        premium: t(row.premiumKey),
      })),
    [t],
  );

  const planColumnLabels = useMemo(
    () => ({
      free: t('paywall.comparison.column.free'),
      premium: t('paywall.comparison.column.premium'),
    }),
    [t],
  );

  const heroStatusLabel = isPremium ? t('paywall.hero.status.premium') : t('paywall.hero.status.free');

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
      <LinearGradient colors={['#F6F8FF', '#FFF4F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.backgroundGradient} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.planLabel}>{t('paywall.planLabel')}</Text>
            </View>
            <TouchableOpacity style={styles.backButton} onPress={handleReturnToChat}>
              <Text style={styles.backButtonLabel}>{t('paywall.backToChat')}</Text>
            </TouchableOpacity>
          </View>

          <LinearGradient
            colors={['#FFFFFF', '#FFF4EA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{heroStatusLabel}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('paywall.hero.title')}</Text>
            <Text style={styles.heroDescription}>{t('paywall.hero.description')}</Text>
            <View style={styles.priceRow}>
              {productLoading ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.heroPrice}>{priceLabel}</Text>}
            </View>
            {isPremium ? (
              <Text style={styles.heroStatusDetail}>
                {t('paywall.status.active', { days: premiumStatus?.daysRemaining ?? 0 })}
              </Text>
            ) : null}
            <Text style={styles.priceNote}>{t('paywall.hero.priceNote')}</Text>
          </LinearGradient>

          {platformUnsupported ? (
            <View style={styles.noticeCard}>
              <Feather name="smartphone" size={18} color={colors.accentInk} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>{t('paywall.error.unsupported')}</Text>
                <Text style={styles.noticeDescription}>{t('paywall.error.unsupportedDescription')}</Text>
              </View>
            </View>
          ) : null}

          {productError ? (
            <View style={styles.noticeCard}>
              <Feather name="refresh-ccw" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>{t('paywall.error.loadFailed')}</Text>
                <Text style={styles.noticeDescription}>{t('paywall.error.loadFailedDescription')}</Text>
              </View>
              <TouchableOpacity onPress={() => refetchProducts()} style={styles.retryButton}>
                <Text style={styles.retryLabel}>{t('paywall.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (platformUnsupported || isPremium || premiumLoading) && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={platformUnsupported || isPremium || premiumLoading || purchaseMutation.isLoading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#FFB347', '#F97316']}
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

          <TouchableOpacity style={styles.ghostButton} onPress={handleReturnToChat}>
            <Text style={styles.ghostButtonLabel}>{t('paywall.secondaryButton.stayFree')}</Text>
          </TouchableOpacity>

          <View style={styles.comparisonCard}>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonHeading}>{t('paywall.comparison.heading')}</Text>
            </View>
            <View style={styles.planLegend}>
              <View style={[styles.planChip, styles.planChipFree]}>
                <Text style={[styles.planChipLabel, styles.planChipLabelFree]}>{planColumnLabels.free}</Text>
              </View>
              <View style={[styles.planChip, styles.planChipPremium]}>
                <Text style={[styles.planChipLabel, styles.planChipLabelPremium]}>{planColumnLabels.premium}</Text>
              </View>
            </View>
            {comparisonRows.map((row) => (
              <View key={row.key} style={styles.comparisonRow}>
                <View style={styles.comparisonLabelCell}>
                  <View style={styles.comparisonIcon}>
                    <Feather name={row.icon} size={16} color={colors.accentInk} />
                  </View>
                  <Text style={styles.comparisonLabel}>{row.label}</Text>
                </View>
                <View style={styles.planColumns}>
                  <View style={[styles.planCell, styles.planCellFree]}>
                    <View style={[styles.planChip, styles.planChipFree]}>
                      <Text style={[styles.planChipLabel, styles.planChipLabelFree]}>{planColumnLabels.free}</Text>
                    </View>
                    <Text style={styles.planCellText}>{row.free}</Text>
                  </View>
                  <View style={[styles.planCell, styles.planCellPremium]}>
                    <View style={[styles.planChip, styles.planChipPremium]}>
                      <Text style={[styles.planChipLabel, styles.planChipLabelPremium]}>{planColumnLabels.premium}</Text>
                    </View>
                    <Text style={styles.planCellText}>{row.premium}</Text>
                  </View>
                </View>
              </View>
            ))}
            <Text style={styles.comparisonNote}>{t('paywall.comparison.note')}</Text>
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
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 20,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planLabel: {
    ...textStyles.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  backButtonLabel: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 10,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  statusPillText: {
    ...textStyles.caption,
    color: colors.accentInk,
  },
  heroTitle: {
    ...textStyles.display,
    fontSize: 30,
    lineHeight: 36,
    color: colors.accentInk,
  },
  heroDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  heroPrice: {
    ...textStyles.titleLarge,
    fontSize: 32,
    color: colors.accentInk,
  },
  heroStatusDetail: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  priceNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassStroke,
  },
  noticeTitle: {
    ...textStyles.titleSmall,
    color: colors.textPrimary,
  },
  noticeDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  retryLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
  },
  primaryButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  secondaryButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  ghostButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostButtonLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  comparisonCard: {
    marginTop: 8,
    borderRadius: 28,
    padding: 24,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    gap: 16,
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comparisonHeading: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  planLegend: {
    flexDirection: 'row',
    gap: 8,
  },
  planChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  planChipFree: {
    borderColor: 'rgba(31,36,44,0.15)',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  planChipPremium: {
    borderColor: 'rgba(249,115,22,0.4)',
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  planChipLabel: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  planChipLabelFree: {
    color: colors.textSecondary,
  },
  planChipLabelPremium: {
    color: '#B45309',
  },
  comparisonRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,19,24,0.06)',
    gap: 14,
  },
  comparisonLabelCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  comparisonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(17,19,24,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  planColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  planCell: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  planCellFree: {
    borderColor: 'rgba(31,36,44,0.08)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  planCellPremium: {
    borderColor: 'rgba(249,115,22,0.25)',
    backgroundColor: 'rgba(249,115,22,0.08)',
  },
  planCellText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  comparisonNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
