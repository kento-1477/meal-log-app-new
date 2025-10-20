import { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SUPPORTED_LOCALES, type Locale, useTranslation } from '@/i18n';
import { describeLocale } from '@/utils/locale';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const currentLocale = useSessionStore((state) => state.locale);
  const setLocale = useSessionStore((state) => state.setLocale);
  const user = useSessionStore((state) => state.user);

  const localeOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((locale) => ({
        value: locale,
        label: describeLocale(locale),
      })),
    [],
  );

  const handleLocaleChange = (locale: Locale) => {
    if (locale === currentLocale) {
      return;
    }
    setLocale(locale);
    Alert.alert(t('settings.language.changedTitle'), t('settings.language.changedMessage'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.heading}>{t('settings.title')}</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.language.heading')}</Text>
        {localeOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={styles.localeOption}
            onPress={() => handleLocaleChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === currentLocale }}
          >
            <View style={[styles.radioOuter, option.value === currentLocale && styles.radioOuterActive]}>
              {option.value === currentLocale ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.localeLabel}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.plan.heading')}</Text>
        <Text style={styles.planDescription}>
          {user?.plan === 'STANDARD' ? t('settings.plan.standard') : t('settings.plan.free')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  heading: {
    ...textStyles.heading,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...textStyles.subheading,
    marginBottom: spacing.md,
  },
  localeOption: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: spacing.md,
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
  localeLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  planDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
});
