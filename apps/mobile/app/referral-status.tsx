// apps/mobile/app/referral-status.tsx
// 紹介プログラムの状況を表示する画面
// 招待コード、統計情報、最近の紹介一覧を表示
// 関連: services/api.ts, hooks/useReferralStatus.ts

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useReferralStatus } from '@/hooks/useReferralStatus';
import { trackInviteLinkShared } from '@/analytics/events';

const BACKGROUND_GRADIENT = ['#fff4ec', '#fff8f3'];
const HERO_GRADIENT = ['#ffe8c7', '#ffcdd9'];
const GLASS_GRADIENT = ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.6)'];
const SHEEN_GRADIENT = ['rgba(255,255,255,0)', 'rgba(255,208,164,0.5)', 'rgba(255,152,177,0.45)', 'rgba(255,255,255,0)'];
const SHEEN_GRADIENT_SOFT = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'];

export default function ReferralStatusScreen() {
  const { t } = useTranslation();
  const { status, isLoading, error, refresh } = useReferralStatus();
  const [isCopyingCode, setIsCopyingCode] = useState(false);
  const [isCopyingLink, setIsCopyingLink] = useState(false);

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

  const steps = useMemo(
    () => [
      {
        title: t('referral.status.steps.send.title'),
        description: t('referral.status.steps.send.description'),
      },
      {
        title: t('referral.status.steps.friend.title'),
        description: t('referral.status.steps.friend.description'),
      },
      {
        title: t('referral.status.steps.reward.title'),
        description: t('referral.status.steps.reward.description'),
      },
    ],
    [t],
  );

  const handleCopyCode = () => {
    if (!status?.inviteCode) return;

    try {
      setIsCopyingCode(true);
      Clipboard.setString(status.inviteCode);
      Alert.alert(t('referral.status.copied'));
    } catch (err) {
      console.error('Failed to copy code:', err);
    } finally {
      setIsCopyingCode(false);
    }
  };

  const handleCopyLink = () => {
    if (!status?.inviteLink) return;

    try {
      setIsCopyingLink(true);
      Clipboard.setString(status.inviteLink);
      Alert.alert(t('referral.status.linkCopied'));
    } catch (err) {
      console.error('Failed to copy link:', err);
    } finally {
      setIsCopyingLink(false);
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
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={BACKGROUND_GRADIENT} style={styles.gradient}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: true, title: t('settings.invite.header') }} />
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <LinearGradient
              colors={HERO_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            />
            <View style={[styles.heroOrb, styles.heroOrbLarge]} />
            <View style={[styles.heroOrb, styles.heroOrbSmall]} />
            <View style={styles.heroPillRow}>
              <View style={styles.heroPill}>
                <Feather name="zap" size={14} color="#FFDDB2" />
                <Text style={styles.heroPillText}>{t('referral.status.hero.pillPrimary')}</Text>
              </View>
              <View style={[styles.heroPill, styles.heroPillSecondary]}>
                <Text style={styles.heroPillText}>{t('referral.status.hero.pillSecondary')}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{t('referral.status.hero.title')}</Text>
            <Text style={styles.heroSubtitle}>{t('referral.status.hero.subtitle')}</Text>
            <View style={styles.heroRewardRow}>
              <View style={[styles.rewardBubble, styles.rewardBubblePrimary]}>
                <Text style={styles.rewardLabel}>{t('referral.status.hero.youLabel')}</Text>
                <Text style={styles.rewardValue}>{t('referral.status.hero.youValue')}</Text>
              </View>
              <View style={[styles.rewardBubble, styles.rewardBubbleSecondary]}>
                <Text style={styles.rewardLabel}>{t('referral.status.hero.friendLabel')}</Text>
                <Text style={styles.rewardValue}>{t('referral.status.hero.friendValue')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.codeSection}>
            <View style={styles.inviteCodeCard}>
              <BlurView tint="light" intensity={55} style={styles.blurLayer} />
              <LinearGradient
                pointerEvents="none"
                colors={GLASS_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.frostedGradient}
              />
              <LinearGradient
                pointerEvents="none"
                colors={SHEEN_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.rainbowSheen}
              />
              <LinearGradient
                pointerEvents="none"
                colors={SHEEN_GRADIENT_SOFT}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.rainbowSheenSecondary}
              />
              <View style={styles.cardInner}>
                <Text style={styles.sectionEyebrow}>{t('referral.status.inviteCode')}</Text>
                <View style={styles.codeRow}>
                  <View>
                    <Text style={styles.codeHelper}>{t('referral.status.codeHelper')}</Text>
                    <Text style={styles.inviteCode}>{status.inviteCode}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyIconBtn} onPress={handleCopyCode} disabled={isCopyingCode}>
                    {isCopyingCode ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Feather name="copy" size={20} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleShareLink}>
                <Text style={styles.primaryButtonText}>{t('referral.status.shareLink')}</Text>
                <Feather name="share-2" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyLink} disabled={isCopyingLink}>
                {isCopyingLink ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Feather name="link-2" size={18} color={colors.textPrimary} />
                )}
                <Text style={styles.secondaryButtonText}>{t('referral.status.copyLink')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.glassCard}>
            <BlurView tint="light" intensity={55} style={styles.blurLayer} />
            <LinearGradient
              pointerEvents="none"
              colors={GLASS_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.frostedGradient}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rainbowSheen}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT_SOFT}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.rainbowSheenSecondary}
            />
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <Text style={styles.sectionTitle}>{t('referral.status.progressTitle')}</Text>
                <Text style={styles.cardHint}>{t('referral.status.progressHint')}</Text>
              </View>
              <View style={styles.statsGrid}>
                {stats.map((stat) => (
                  <View key={stat.label} style={styles.statItem}>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.stepsCard}>
            <BlurView tint="light" intensity={55} style={styles.blurLayer} />
            <LinearGradient
              pointerEvents="none"
              colors={GLASS_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.frostedGradient}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rainbowSheen}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT_SOFT}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.rainbowSheenSecondary}
            />
            <View style={styles.cardInner}>
              <Text style={styles.sectionTitle}>{t('referral.status.steps.title')}</Text>
              {steps.map((step, index) => (
                <View key={step.title} style={styles.stepRow}>
                  <View style={styles.stepIndexWrap}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepHeading}>{step.title}</Text>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.disclaimer}>{t('referral.status.disclaimer')}</Text>

          <View style={styles.recentCard}>
            <BlurView tint="light" intensity={55} style={styles.blurLayer} />
            <LinearGradient
              pointerEvents="none"
              colors={GLASS_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.frostedGradient}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rainbowSheen}
            />
            <LinearGradient
              pointerEvents="none"
              colors={SHEEN_GRADIENT_SOFT}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.rainbowSheenSecondary}
            />
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <Text style={styles.sectionTitle}>{t('referral.status.recent')}</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
                  <Feather name="rotate-cw" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {status.recentReferrals.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="users" size={24} color={colors.textSecondary} />
                  <Text style={styles.emptyText}>{t('referral.status.recent.empty')}</Text>
                </View>
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
                        <View>
                          <Text style={styles.recentName}>{item.friendUsername}</Text>
                          <Text style={styles.recentMeta}>{createdAt}</Text>
                        </View>
                        <View style={[styles.statusBadge, badgeStyle]}>
                          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.recentMeta}>
                        {t('referral.status.consecutiveDays', { days: item.consecutiveDays })}
                        {completedAt ? ` → ${completedAt}` : ''}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
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
  heroCard: {
    borderRadius: 32,
    overflow: 'hidden',
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  heroOrb: {
    position: 'absolute',
    backgroundColor: '#ffc28e',
    opacity: 0.25,
    borderRadius: 999,
  },
  heroOrbLarge: {
    width: 180,
    height: 180,
    top: -40,
    right: -60,
  },
  heroOrbSmall: {
    width: 90,
    height: 90,
    bottom: -20,
    left: -10,
  },
  heroPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 126, 101, 0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroPillSecondary: {
    backgroundColor: 'rgba(255, 197, 66, 0.2)',
  },
  heroPillText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  heroTitle: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    fontSize: 32,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    lineHeight: 38,
  },
  heroSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  heroRewardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rewardBubble: {
    flex: 1,
    borderRadius: 24,
    padding: spacing.md,
    borderWidth: 1,
  },
  rewardBubblePrimary: {
    borderColor: 'rgba(255,160,122,0.8)',
    backgroundColor: 'rgba(255, 168, 113, 0.2)',
  },
  rewardBubbleSecondary: {
    borderColor: 'rgba(255,197,66,0.6)',
    backgroundColor: 'rgba(255,231,181,0.5)',
  },
  rewardLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  rewardValue: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
    marginTop: 4,
  },
  codeSection: {
    marginBottom: spacing.xl,
  },
  inviteCodeCard: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 28,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,184,120,0.6)',
    overflow: 'hidden',
  },
  frostedGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  rainbowSheen: {
    ...StyleSheet.absoluteFillObject,
    top: -40,
    bottom: -40,
    left: -60,
    right: -60,
    opacity: 0.45,
    transform: [{ rotate: '-8deg' }],
  },
  rainbowSheenSecondary: {
    ...StyleSheet.absoluteFillObject,
    top: -20,
    bottom: -20,
    left: -40,
    right: -40,
    opacity: 0.35,
    transform: [{ rotate: '12deg' }],
  },
  cardInner: {
    position: 'relative',
  },
  sectionEyebrow: {
    ...textStyles.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  codeHelper: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  inviteCode: {
    ...textStyles.heading,
    color: colors.textPrimary,
    letterSpacing: 6,
  },
  copyIconBtn: {
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#ff7a6a',
    borderRadius: 999,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryButtonText: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,160,122,0.8)',
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  secondaryButtonText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 28,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,184,120,0.55)',
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cardHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    marginBottom: spacing.lg,
  },
  statValue: {
    ...textStyles.titleLarge,
    fontSize: 30,
    color: colors.textPrimary,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  stepsCard: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 28,
    padding: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
    borderWidth: 1,
    borderColor: 'rgba(255,184,120,0.5)',
    overflow: 'hidden',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
  },
  stepIndexWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepIndex: {
    ...textStyles.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stepContent: {
    flex: 1,
  },
  stepHeading: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  stepDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  disclaimer: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginVertical: spacing.lg,
    textAlign: 'center',
  },
  recentCard: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 28,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    marginBottom: spacing.xl,
  },
  refreshButton: {
    padding: spacing.xs,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
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
