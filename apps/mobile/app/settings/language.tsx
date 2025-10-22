import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation, SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { describeLocale } from '@/utils/locale';

export default function LanguageScreen() {
  const { t } = useTranslation();
  const currentLocale = useSessionStore((state) => state.locale);
  const setLocale = useSessionStore((state) => state.setLocale);

  const handleChange = (locale: Locale) => {
    if (locale === currentLocale) return;
    setLocale(locale);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('settings.section.language')}</Text>
        <View style={styles.card}>
          {SUPPORTED_LOCALES.map((locale) => (
            <TouchableOpacity
              key={locale}
              style={styles.row}
              onPress={() => handleChange(locale)}
              accessibilityRole="radio"
              accessibilityState={{ checked: locale === currentLocale }}
            >
              <View style={[styles.radioOuter, locale === currentLocale && styles.radioOuterActive]}>
                {locale === currentLocale ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.label}>{describeLocale(locale)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  label: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
});
