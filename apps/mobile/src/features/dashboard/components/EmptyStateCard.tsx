import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

interface Props {
  message: string;
}

export function EmptyStateCard({ message }: Props) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/chat')}>
        <Text style={styles.buttonLabel}>{t('button.record')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  message: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});
