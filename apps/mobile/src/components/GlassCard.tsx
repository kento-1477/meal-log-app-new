import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors } from '@/theme/colors';

interface GlassCardProps extends ViewProps {
  intensity?: number;
  borderless?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  intensity = 25,
  borderless = false,
  style,
  children,
  ...rest
}) => {
  return (
    <BlurView intensity={intensity} tint="light" style={[styles.blur, style]} {...rest}>
      <View style={[styles.inner, borderless && styles.borderless]}>{children}</View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  blur: {
    overflow: 'hidden',
    borderRadius: 24,
  },
  inner: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  borderless: {
    borderWidth: 0,
  },
});
