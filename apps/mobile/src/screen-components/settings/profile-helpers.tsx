import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import type { UpdateUserProfileRequest, UserProfile } from '@/services/api';

export const INITIAL_FORM_STATE = {
  targetCalories: '',
  targetProtein: '',
  targetFat: '',
  targetCarbs: '',
  bodyWeight: '',
  activityLevel: '',
};

export function mapProfileToForm(profile: UserProfile) {
  return {
    targetCalories: toInput(profile.target_calories),
    targetProtein: toInput(profile.target_protein_g),
    targetFat: toInput(profile.target_fat_g),
    targetCarbs: toInput(profile.target_carbs_g),
    bodyWeight: toInput(profile.body_weight_kg),
    activityLevel: profile.activity_level ?? '',
  } satisfies typeof INITIAL_FORM_STATE;
}

export function buildProfilePayload(form: typeof INITIAL_FORM_STATE): UpdateUserProfileRequest | null {
  const payload: UpdateUserProfileRequest = {};
  const calories = parseNullableNumber(form.targetCalories, true);
  const protein = parseNullableNumber(form.targetProtein, false);
  const fat = parseNullableNumber(form.targetFat, false);
  const carbs = parseNullableNumber(form.targetCarbs, false);
  const weight = parseNullableNumber(form.bodyWeight, false);

  if (calories === undefined || protein === undefined || fat === undefined || carbs === undefined || weight === undefined) {
    return null;
  }

  payload.target_calories = calories ?? null;
  payload.target_protein_g = protein ?? null;
  payload.target_fat_g = fat ?? null;
  payload.target_carbs_g = carbs ?? null;
  payload.body_weight_kg = weight ?? null;
  payload.activity_level = form.activityLevel.trim() ? form.activityLevel.trim() : null;

  return payload;
}

function toInput(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parseNullableNumber(value: string, integerOnly: boolean) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  if (integerOnly && !Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

export default function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  suffix,
  row = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  suffix?: string;
  row?: boolean;
}) {
  return (
    <View style={[styles.fieldContainer, row && styles.fieldContainerRow]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType="decimal-pad"
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldContainer: {
    gap: spacing.xs,
  },
  fieldContainerRow: {
    flex: 1,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  suffix: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
