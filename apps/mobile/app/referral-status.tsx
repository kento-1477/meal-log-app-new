// apps/mobile/app/referral-status.tsx
// 紹介プログラムの状況を表示する画面
// 招待コード、統計情報、最近の紹介一覧を表示
// 関連: services/api.ts, hooks/useReferralStatus.ts

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useReferralStatus } from '@/hooks/useReferralStatus';

export default function ReferralStatusScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { status, isLoading, error, refresh } = useReferralStatus();
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyCode = async () => {
    if (!status?.inviteCode) return;

    try {
      setIsCopying(true);
      await Clipboard.setStringAsync(status.inviteCode);
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
    } catch (err) {
      console.error('Failed to share link:', err);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('referral.status.title') }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !status) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('referral.status.title') }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || t('referral.error.loadFailed')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderReferralItem = ({ item }: { item: any }) => {
    const statusColor = item.status === 'COMPLETED' ? colors.success : colors.textSecondary;
    const statusText = t(`referral.status.status.${item.status.toLowerCase()}`);

    return (
      <View style={styles.referralItem}>
        <View style={styles.referralIcon}>
          <Feather name="user" size={20} color={colors.accent} />
        </View>
        <View style={styles.referralInfo}>
          <Text style={styles.referralUsername}>{item.friendUsername}</Text>
          <Text style={styles.referralDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.referralStatus}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
          {item.status === 'PENDING' && (
            <Text style={styles.consecutiveDays}>{t('referral.status.consecutiveDays', { days: item.consecutiveDays })}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[colors.background, '#ffffff']} style={styles.gradient}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('referral.status.title') }} />
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* 招待コードカード */}
          <View style={styles.inviteCodeCard}>
            <Text style={styles.sectionTitle}>{t('referral.status.inviteCode')}</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.inviteCode}>{status.inviteCode}</Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.copyButton]}
                onPress={handleCopyCode}
                disabled={isCopying}
              >
                {isCopying ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Feather name="copy" size={16} color={colors.accent} />
                    <Text style={styles.actionButtonText}>{t('referral.status.copy')}</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.shareButton]} onPress={handleShareLink}>
                <Feather name="share-2" size={16} color="#fff" />
                <Text style={styles.shareButtonText}>{t('referral.status.share')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 統計カード */}
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>統計</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.stats.totalReferred}</Text>
                <Text style={styles.statLabel}>{t('referral.status.stats.total')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.stats.completedReferred}</Text>
                <Text style={styles.statLabel}>{t('referral.status.stats.completed')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.stats.pendingReferred}</Text>
                <Text style={styles.statLabel}>{t('referral.status.stats.pending')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, styles.premiumDays]}>{status.stats.totalPremiumDaysEarned}</Text>
                <Text style={styles.statLabel}>{t('referral.status.stats.daysEarned')}</Text>
              </View>
            </View>
          </View>

          {/* 最近の紹介リスト */}
          {status.recentReferrals.length > 0 && (
            <View style={styles.referralListCard}>
              <Text style={styles.sectionTitle}>{t('referral.status.recent')}</Text>
              {status.recentReferrals.map((item, index) => (
                <View key={index}>{renderReferralItem({ item })}</View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
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
  inviteCodeCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
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
  codeContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  inviteCode: {
    ...textStyles.h2,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    gap: spacing.xs,
  },
  copyButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  shareButton: {
    backgroundColor: colors.accent,
  },
  actionButtonText: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.accent,
  },
  shareButtonText: {
    ...textStyles.body,
    fontWeight: '600',
    color: '#fff',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    ...textStyles.h2,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  premiumDays: {
    color: colors.accent,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  referralListCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  referralItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  referralIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  referralInfo: {
    flex: 1,
  },
  referralUsername: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  referralDate: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  referralStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  statusText: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  consecutiveDays: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
