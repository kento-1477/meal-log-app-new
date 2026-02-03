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
    <View style={[styles.shell, style]} {...rest}>
      <View pointerEvents="none" style={styles.ambientGlow} />
      <BlurView intensity={intensity} tint="light" style={styles.blur}>
        <View style={[styles.inner, borderless && styles.borderless, contentStyle]}>{children}</View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    borderRadius: 28,
    shadowColor: '#8FA4BC',
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
    overflow: 'visible',
  },
  ambientGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -6,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(143,164,188,0.28)',
    opacity: 0.45,
  },
  blur: {
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  inner: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassStroke,
    padding: 20,
  },
  borderless: {
    borderWidth: 0,
  },
});
