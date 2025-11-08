import { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { SUPPORT_EMAIL } from '@/config/legal';
import appManifest from '../../app.json';
import { AuroraBackground } from '@/components/AuroraBackground';
import { BrandHeader } from '@/components/BrandHeader';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const { status: premiumStatus } = usePremiumStatus();
  const versionLabel = appManifest?.expo?.version ?? '1.0.0';

  const menuItems = useMemo(
    () => [
      {
        key: 'account',
        label: t('settings.menu.personal'),
        icon: <Feather name="user" size={20} color={colors.textPrimary} />,
        action: () => router.push('/settings/account'),
      },
      {
        key: 'nutrition',
        label: t('settings.menu.nutrition'),
        icon: <Feather name="target" size={20} color={colors.textPrimary} />,
        action: () => router.push('/settings/profile'),
      },
      {
        key: 'weight',
        label: t('settings.menu.weight'),
        icon: <Feather name="flag" size={20} color={colors.textPrimary} />,
        action: () => router.push('/settings/profile'),
      },
      {
        key: 'notifications',
        label: t('settings.notifications.screenTitle'),
        icon: <Feather name="bell" size={20} color={colors.textPrimary} />,
        action: () => router.push('/settings/notifications'),
      },
      {
        key: 'language',
        label: t('settings.menu.language'),
        icon: <Feather name="globe" size={20} color={colors.textPrimary} />,
        action: () => router.push('/settings/language'),
      },
    ],
    [router, t],
  );

  const handleFeedback = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Meal Log feedback')}`;
    void Linking.openURL(url);
  };

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BrandHeader
            title={t('settings.title')}
            subtitle={user?.email ?? t('settings.profile.subtitle')}
          />
          <TouchableOpacity style={styles.inviteTopButton} onPress={() => router.push('/referral-status')}>
            <Feather name="share-2" size={14} color={colors.accent} />
            <Text style={styles.inviteTopButtonLabel}>{t('settings.invite.cta')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.profileCard} activeOpacity={0.8} onPress={() => router.push('/settings/account')}>
            <View style={styles.avatarCircle}>
              <Feather name="user" size={24} color={colors.accent} />
            </View>
            <View style={styles.profileTextContainer}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{user?.email ?? t('settings.profile.namePlaceholder')}</Text>
            </View>
            {premiumStatus?.isPremium ? (
              <View style={styles.premiumBadge}
              >
                <Feather name="star" size={12} color="#fff" />
                <Text style={styles.premiumBadgeText}>{t('premium.badge')}</Text>
              </View>
            ) : null}
            <Text style={styles.profileSubtitle}>
              {premiumStatus?.isPremium
                ? t('premium.daysRemaining', { days: premiumStatus.daysRemaining })
                : t('settings.profile.subtitle')}
            </Text>
            </View>
              <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.inviteCard} activeOpacity={0.9} onPress={() => router.push('/referral-status')}>
            <LinearGradient colors={['#fbe4ff', '#ffecef']} style={styles.inviteGradient}>
              <View style={styles.inviteHeader}>
                <Feather name="users" size={18} color={colors.textPrimary} />
                <Text style={styles.inviteLabel}>{t('settings.invite.header')}</Text>
              </View>
              <View style={styles.inviteBody}>
                <Text style={styles.inviteTitle}>{t('settings.invite.title')}</Text>
                <Text style={styles.inviteSubtitle}>{t('settings.invite.subtitle')}</Text>
              </View>
              <View style={styles.inviteButton}>
                <Text style={styles.inviteButtonLabel}>{t('settings.invite.cta')}</Text>
                <Feather name="chevron-right" size={20} color={colors.accent} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <View key={item.key}>
                <TouchableOpacity style={styles.menuItem} onPress={item.action} activeOpacity={0.7}>
                  <View style={styles.menuIcon}>{item.icon}</View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                {index < menuItems.length - 1 ? <View style={styles.menuDivider} /> : null}
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t('settings.section.feedback')}</Text>
            </View>
            <Text style={styles.sectionDescription}>{t('settings.feedback.description')}</Text>
            <TouchableOpacity style={styles.outlineButton} onPress={handleFeedback}>
              <Text style={styles.outlineButtonLabel}>{t('settings.feedback.sendMail')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t('settings.section.about')}</Text>
            </View>
            <Text style={styles.sectionDescription}>{t('settings.about.version', { version: versionLabel })}</Text>
            <Text style={styles.caption}>{t('settings.about.developer')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  inviteTopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  inviteTopButtonLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 24,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextContainer: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileName: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
    marginTop: spacing.xs,
  },
  premiumBadgeText: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
    fontSize: 10,
  },
  profileSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  inviteCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
    backgroundColor: colors.surfaceStrong,
  },
  inviteGradient: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inviteLabel: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  inviteBody: {
    gap: spacing.xs,
  },
  inviteTitle: {
    ...textStyles.titleLarge,
    fontSize: 24,
    color: colors.textPrimary,
  },
  inviteSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  inviteButton: {
    backgroundColor: '#fff',
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  inviteButtonLabel: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 24,
    paddingVertical: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 36,
  },
  sectionCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  sectionDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  caption: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  outlineButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  outlineButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
