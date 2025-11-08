import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';

const logo = require('../../assets/brand/logo.png');

interface Props {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  actionLabel?: string;
  onAction?: () => void;
}

export const BrandHeader: React.FC<Props> = ({ title, subtitle, align = 'left', actionLabel, onAction }) => {
  const isCenter = align === 'center';
  return (
    <View style={[styles.container, isCenter && styles.centerAligned]}>
      <View style={[styles.lead, isCenter && styles.centerAligned]}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={[styles.textBlock, isCenter && styles.centerAligned]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.actionChip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  centerAligned: {
    justifyContent: 'center',
    textAlign: 'center',
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
  },
  logo: {
    width: 36,
    height: 36,
  },
  textBlock: {
    flex: 1,
    gap: 6,
  },
  title: {
    ...textStyles.heading,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  actionChip: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
