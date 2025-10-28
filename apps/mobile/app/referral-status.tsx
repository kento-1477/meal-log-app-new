// apps/mobile/app/referral-status.tsx
// 紹介プログラムの状況を表示する画面
// 招待コード、統計情報、最近の紹介一覧を表示
// 関連: services/api.ts, hooks/useReferralStatus.ts

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useReferralStatus } from '@/hooks/useReferralStatus';
import { trackInviteLinkShared } from '../src/analytics/events';

export default function ReferralStatusScreen() {
  const { t } = useTranslation();
  const { status, isLoading, error, refresh } = useReferralStatus();
  const [isCopying, setIsCopying] = useState(false);

  const stats = useMemo(() => {
    if (!status) return [];
    return [
      {
        label: t('referral.status.stats.total'),
        value: String(status.stats.totalReferred),
      },
      {
        label: t('referral.status.stats.completed'),
        value: String(status.stats.completedReferred),
      },
      {
        label: t('referral.status.stats.pending'),
        value: String(status.stats.pendingReferred),
      },
      {
        label: t('referral.status.stats.daysEarned'),
        value: t('referral.status.stats.daysEarnedValue', { count: status.stats.totalPremiumDaysEarned }),
      },
    ];
  }, [status, t]);

  const handleCopyCode = () => {
    if (!status?.inviteCode) return;

    try {
      setIsCopying(true);
      Clipboard.setString(status.inviteCode);
      Alert.alert(t('referral.status.copied'));
    } catch (err) {
      console.error('Failed to copy code:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleShareLink = async () => {
    if (!status?.inviteLink) return;

    try {
      const message = t('referral.share.message', { link: status.inviteLink });
      await Share.share({
        title: t('referral.share.title'),
        message,
      });
      trackInviteLinkShared({ channel: 'system-share' });
    } catch (err) {
      console.error('Failed to share link:', err);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('settings.invite.header') }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !status) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('settings.invite.header') }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || t('referral.error.loadFailed')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.gradient}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('settings.invite.header') }} />
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageTitle}>友だちを招待</Text>

          {/* ベネフィット行 */}
          <View style={styles.benefitRow}>
            <View style={[styles.badge, styles.badgePrimary]}>
              <Text style={[styles.badgeText, styles.badgePrimaryText]}>あなた +30日</Text>
            </View>
            <Text style={styles.slash}>/</Text>
            <View style={[styles.badge, styles.badgeSecondary]}>
              <Text style={[styles.badgeText, styles.badgeSecondaryText]}>友だち 14日</Text>
            </View>
          </View>
          <Text style={styles.condition}>条件：友だちが3日連続で記録</Text>

          {/* 招待コードカード（インラインコピー） */}
          <View style={styles.inviteCodeCard}>
            <Text style={styles.sectionTitle}>{t('referral.status.inviteCode')}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.inviteCode}>{status.inviteCode}</Text>
              <TouchableOpacity style={styles.copyIconBtn} onPress={handleCopyCode} disabled={isCopying}>
                {isCopying ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Feather name="copy" size={18} color={colors.accent} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 共有CTA */}
          <TouchableOpacity style={styles.primaryButton} onPress={handleShareLink}>
            <Text style={styles.primaryButtonText}>{t('referral.status.share')}</Text>
          </TouchableOpacity>

          {/* スタッツ */}
          <View style={styles.statsCard}>
            {stats.map((stat, index) => (
              <View
                key={stat.label}
                style={[styles.statItem, index % 2 === 0 ? styles.statItemLeft : styles.statItemRight]}
              >
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* 手順ボックス */}
          <View style={styles.stepsCard}>
            <Text style={styles.sectionTitle}>受け取り方</Text>
            <View style={styles.stepItem}><Text style={styles.stepText}>・招待リンク／コードを友だちに送る</Text></View>
            <View style={styles.stepItem}><Text style={styles.stepText}>・友だちは登録で <Text style={styles.em}>14日無料</Text> が開始</Text></View>
            <View style={styles.stepItem}><Text style={styles.stepText}>・友だちが <Text style={styles.em}>3日連続で記録</Text> → あなたに <Text style={styles.em}>+30日</Text></Text></View>
          </View>

          {/* 免責 */}
          <Text style={styles.disclaimer}>※ 自分への招待や不正は特典対象外です</Text>

          {/* 最近の紹介 */}
          <View style={styles.recentCard}>
            <Text style={styles.sectionTitle}>{t('referral.status.recent')}</Text>
            {status.recentReferrals.length === 0 ? (
              <Text style={styles.emptyText}>{t('referral.status.recent.empty')}</Text>
            ) : (
              status.recentReferrals.map((item) => {
                const statusLabelMap = {
                  PENDING: t('referral.status.status.pending'),
                  COMPLETED: t('referral.status.status.completed'),
                  EXPIRED: t('referral.status.status.expired'),
                } as const;
                const statusLabel = statusLabelMap[item.status];
                const createdAt = formatDate(item.createdAt);
                const completedAt = item.completedAt ? formatDate(item.completedAt) : null;
                const badgeStyle =
                  item.status === 'COMPLETED'
                    ? styles.statusBadgeCOMPLETED
                    : item.status === 'PENDING'
                      ? styles.statusBadgePENDING
                      : styles.statusBadgeEXPIRED;

                return (
                  <View key={`${item.friendUsername}-${item.createdAt}`} style={styles.recentItem}>
                    <View style={styles.recentHeader}>
                      <Text style={styles.recentName}>{item.friendUsername}</Text>
                      <View style={[styles.statusBadge, badgeStyle]}>
                        <Text style={styles.statusBadgeText}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.recentMeta}>
                      {t('referral.status.consecutiveDays', { days: item.consecutiveDays })}・{createdAt}
                      {completedAt ? ` → ${completedAt}` : ''}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function formatDate(iso: string) {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return formatter.format(date);
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: spacing.lg,
  },
  pageTitle: {
    ...textStyles.titleLarge,
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  retryButtonText: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgePrimary: {
    backgroundColor: colors.accent,
  },
  badgePrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  badgeSecondary: {
    backgroundColor: '#eef2f7',
  },
  badgeSecondaryText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  badgeText: {
    ...textStyles.caption,
    fontSize: 13,
  },
  slash: {
    ...textStyles.titleMedium,
    color: colors.textSecondary,
  },
  condition: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  inviteCodeCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    ...textStyles.h3,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
  },
  inviteCode: {
    ...textStyles.h2,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 4,
  },
  copyIconBtn: {
    padding: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  primaryButtonText: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '700',
  },
  stepsCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  stepItem: {
    marginBottom: 4,
  },
  stepText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  em: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  disclaimer: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  statItem: {
    width: '50%',
    paddingVertical: spacing.md,
  },
  statItemLeft: {
    paddingRight: spacing.sm,
  },
  statItemRight: {
    paddingLeft: spacing.sm,
  },
  statValue: {
    ...textStyles.titleMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    marginBottom: spacing.xl,
  },
  emptyText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  recentItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentName: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadgePENDING: {
    backgroundColor: colors.accentSoft,
  },
  statusBadgeCOMPLETED: {
    backgroundColor: colors.success,
  },
  statusBadgeEXPIRED: {
    backgroundColor: colors.error,
  },
  recentMeta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
