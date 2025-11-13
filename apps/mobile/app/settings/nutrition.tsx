import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { getUserProfile, updateUserProfile } from '@/services/api';
import ProfileField from '@/screen-components/settings/profile-helpers';
import { PrimaryButton } from '@/components/PrimaryButton';

const INITIAL_STATE = {
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
};

export default function NutritionSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL_STATE);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getUserProfile,
  });

  useEffect(() => {
    if (profileQuery.data) {
      const profile = profileQuery.data;
      setForm({
        calories: numericToInput(profile.target_calories),
        protein: numericToInput(profile.target_protein_g),
        fat: numericToInput(profile.target_fat_g),
        carbs: numericToInput(profile.target_carbs_g),
      });
    }
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      const profile = result.profile;
      setForm({
        calories: numericToInput(profile.target_calories),
        protein: numericToInput(profile.target_protein_g),
        fat: numericToInput(profile.target_fat_g),
        carbs: numericToInput(profile.target_carbs_g),
      });
      Alert.alert(t('settings.nutrition.savedTitle'), t('settings.nutrition.savedMessage'));
    },
    onError: () => {
      Alert.alert(t('settings.profile.errorTitle'), t('settings.profile.errorMessage'));
    },
  });

  const handleSave = () => {
    const calories = parsePositiveInteger(form.calories);
    const protein = parsePositiveNumber(form.protein);
    const fat = parsePositiveNumber(form.fat);
    const carbs = parsePositiveNumber(form.carbs);

    if ([calories, protein, fat, carbs].includes(undefined)) {
      Alert.alert(t('settings.profile.validationTitle'), t('settings.profile.validationMessage'));
      return;
    }

    mutation.mutate({
      target_calories: (calories as number | null) ?? null,
      target_protein_g: (protein as number | null) ?? null,
      target_fat_g: (fat as number | null) ?? null,
      target_carbs_g: (carbs as number | null) ?? null,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('settings.nutrition.title')}</Text>
            <Text style={styles.subtitle}>{t('settings.nutrition.subtitle')}</Text>
          </View>

          <View style={styles.formStack}>
            <ProfileField
              label={t('settings.profile.targetCalories')}
              value={form.calories}
              onChangeText={(value) => setForm((prev) => ({ ...prev, calories: value }))}
              placeholder="2000"
              suffix="kcal"
              keyboardType="number-pad"
            />
            <ProfileField
              label={t('settings.profile.targetProtein')}
              value={form.protein}
              onChangeText={(value) => setForm((prev) => ({ ...prev, protein: value }))}
              placeholder="120"
              suffix="g"
            />
            <ProfileField
              label={t('settings.profile.targetFat')}
              value={form.fat}
              onChangeText={(value) => setForm((prev) => ({ ...prev, fat: value }))}
              placeholder="60"
              suffix="g"
            />
            <ProfileField
              label={t('settings.profile.targetCarbs')}
              value={form.carbs}
              onChangeText={(value) => setForm((prev) => ({ ...prev, carbs: value }))}
              placeholder="250"
              suffix="g"
            />
          </View>

          <PrimaryButton
            label={t('settings.nutrition.save')}
            onPress={handleSave}
            loading={mutation.isLoading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function numericToInput(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

function parsePositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
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
  header: {
    gap: spacing.xs,
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  formStack: {
    gap: spacing.md,
  },
});
