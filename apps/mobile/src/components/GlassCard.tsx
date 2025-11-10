import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';

interface GlassCardProps extends ViewProps {
  intensity?: number;
  borderless?: boolean;
  contentStyle?: ViewStyle;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  intensity = 35,
  borderless = false,
  style,
  contentStyle,
  children,
  ...rest
}) => {
  return (
    <BlurView intensity={intensity} tint="light" style={[styles.blur, style]} {...rest}>
      <View style={[styles.inner, borderless && styles.borderless, contentStyle]}>{children}</View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  blur: {
    overflow: 'hidden',
    borderRadius: 28,
  },
  inner: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassStroke,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  borderless: {
    borderWidth: 0,
  },
});
