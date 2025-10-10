import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';

interface ErrorBannerProps {
  message: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => (
  <View style={styles.container}>
    <Text style={styles.text}>⚠️ {message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: `${colors.error}15`,
    borderColor: colors.error,
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  text: {
    ...textStyles.body,
    color: colors.error,
  },
});
