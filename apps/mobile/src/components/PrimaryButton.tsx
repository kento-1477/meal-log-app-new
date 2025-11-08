import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, onPress, loading, disabled }) => {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [styles.button, pressed && !isDisabled ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      accessibilityLabel={label}
      disabled={isDisabled}
    >
      <LinearGradient
        colors={isDisabled ? ['#d9dbe3', '#cfd2dd'] : [colors.accent, '#FFC857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, isDisabled && styles.disabled]}
      >
        <View style={styles.content}>
          {loading ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.text}>{label}</Text>}
        </View>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.8,
  },
  gradient: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...textStyles.titleMedium,
    color: colors.accentInk,
    fontSize: 18,
    fontWeight: '600',
  },
});
