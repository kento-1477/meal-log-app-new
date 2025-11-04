import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { onboardingTypography } from '@/theme/onboarding';

export type CardIconRenderer = (selected: boolean) => ReactNode;

interface SelectableCardProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  icon?: CardIconRenderer;
  badge?: string;
  disabled?: boolean;
}

export function SelectableCard({
  title,
  subtitle,
  selected = false,
  onPress,
  icon,
  badge,
  disabled,
}: SelectableCardProps) {
  const iconNode = icon ? icon(selected) : null;
  const accessibilityLabel = subtitle ? `${title}. ${subtitle}` : title;

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.85}
      style={[styles.card, selected ? styles.cardSelected : null, disabled ? styles.cardDisabled : null]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
    >
      {iconNode ? (
        <View style={[styles.iconWrapper, selected ? styles.iconWrapperSelected : null]}>{iconNode}</View>
      ) : null}
      <View style={styles.textBlock}>
        <Text style={[onboardingTypography.cardTitle, selected ? styles.titleSelected : null]}>{title}</Text>
        {subtitle ? (
          <Text
            style={[onboardingTypography.cardDetail, selected ? styles.subtitleSelected : null]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, selected ? styles.badgeSelected : null]}>
          <Text
            style={[onboardingTypography.cardDetail, styles.badgeText, selected ? styles.badgeTextSelected : null]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    minHeight: 76,
  },
  cardSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    shadowOpacity: 0.16,
    elevation: 6,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  titleSelected: {
    color: '#ffffff',
  },
  subtitleSelected: {
    color: 'rgba(255,255,255,0.72)',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(28,28,30,0.08)',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badgeText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  badgeTextSelected: {
    color: '#ffffff',
  },
});
