import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Gender } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import {
  onboardingCardStyle,
  onboardingInputStyle,
  onboardingTypography,
  onboardingJapaneseTypography,
} from '@/theme/onboarding';
import { isJapaneseLocale } from '@/theme/localeTypography';

const GENDER_ORDER: Gender[] = ['FEMALE', 'MALE', 'NON_BINARY', 'UNSPECIFIED'];
const MAX_AGE = 120;

export default function OnboardingBasicInfoScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const isJapanese = isJapaneseLocale(locale);
  const draft = useOnboardingStore((state) => state.draft);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('basic-info');

  const [name, setName] = useState(draft.displayName ?? '');
  const [gender, setGender] = useState<Gender | null>(draft.gender ?? null);
  const initialAge = calculateAgeFromBirthdate(draft.birthdate);
  const [ageInput, setAgeInput] = useState(initialAge ? `${initialAge}` : '');
  const [age, setAge] = useState<number | null>(initialAge);
  const [heightInput, setHeightInput] = useState(
    draft.heightCm ? Math.round(draft.heightCm).toString() : '',
  );

  const [heightCm, setHeightCm] = useState<number | null>(draft.heightCm ?? null);

  const handleNameChange = (value: string) => {
    setName(value);
    updateDraft({ displayName: value });
  };

  const handleGenderSelect = (value: Gender) => {
    const next = gender === value ? null : value;
    setGender(next);
    updateDraft({ gender: next });
  };

  const handleAgeChange = (value: string) => {
    const normalized = value.replace(/[^\d]/g, '');
    setAgeInput(normalized);
    if (!normalized) {
      setAge(null);
      updateDraft({ birthdate: null });
      return;
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_AGE) {
      setAge(null);
      updateDraft({ birthdate: null });
      return;
    }
    setAge(numeric);
    updateDraft({ birthdate: buildBirthdateFromAge(numeric).toISOString() });
  };

  const handleHeightChange = (value: string) => {
    setHeightInput(value);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      setHeightCm(numeric);
      updateDraft({ heightCm: numeric });
    } else if (!value) {
      setHeightCm(null);
      updateDraft({ heightCm: null });
    }
  };

  const genderOptions = useMemo(
    () =>
      GENDER_ORDER.map((id) => ({
        id,
        label: t(`onboarding.gender.${id.toLowerCase()}` as const),
      })),
    [t],
  );

  const canProceed = age != null && heightCm != null;

  return (
    <>
      <OnboardingScaffold
        step="basic-info"
        title={t('onboarding.basicInfo.title')}
        subtitle={t('onboarding.basicInfo.subtitle')}
        onNext={() => router.push('/(onboarding)/marketing')}
        nextLabel={t('common.next')}
        nextDisabled={!canProceed}
        onBack={() => router.back()}
      >
        <View style={styles.form}>
          <View style={styles.card}>
            <Text style={[onboardingTypography.label, isJapanese && onboardingJapaneseTypography.label]}>
              {t('onboarding.basicInfo.name')}
            </Text>
            <Text style={[onboardingTypography.helper, isJapanese && onboardingJapaneseTypography.helper]}>
              {t('onboarding.basicInfo.nameHelper')}
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={handleNameChange}
              placeholder={t('onboarding.basicInfo.namePlaceholder')}
            />
          </View>

          <View style={styles.card}>
            <Text style={[onboardingTypography.label, isJapanese && onboardingJapaneseTypography.label]}>
              {t('onboarding.basicInfo.gender')}
            </Text>
            <Text style={[onboardingTypography.helper, isJapanese && onboardingJapaneseTypography.helper]}>
              {t('onboarding.basicInfo.genderHelper')}
            </Text>
            <View style={styles.chipRow}>
              {genderOptions.map((option) => {
                const selected = option.id === gender;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.chip, selected ? styles.chipSelected : null]}
                    onPress={() => handleGenderSelect(option.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={[onboardingTypography.label, isJapanese && onboardingJapaneseTypography.label]}>
              {t('onboarding.basicInfo.birthdate')}
            </Text>
            <Text style={[onboardingTypography.helper, isJapanese && onboardingJapaneseTypography.helper]}>
              {t('onboarding.basicInfo.birthdateHelper')}
            </Text>
            <View style={styles.inlineField}>
              <TextInput
                style={[styles.input, styles.inlineInput]}
                value={ageInput}
                onChangeText={handleAgeChange}
                keyboardType="numeric"
                placeholder={t('onboarding.basicInfo.birthdatePlaceholder')}
                maxLength={3}
              />
              <Text style={styles.inlineSuffix}>{t('onboarding.basicInfo.ageSuffix')}</Text>
            </View>
            {ageInput.length > 0 && age == null ? (
              <Text style={styles.error}>{t('onboarding.basicInfo.birthdateError')}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={[onboardingTypography.label, isJapanese && onboardingJapaneseTypography.label]}>
              {t('onboarding.basicInfo.height')}
            </Text>
            <Text style={[onboardingTypography.helper, isJapanese && onboardingJapaneseTypography.helper]}>
              {t('onboarding.basicInfo.heightHelper')}
            </Text>
            <View style={styles.inlineField}>
              <TextInput
                style={[styles.input, styles.inlineInput]}
                value={heightInput}
                onChangeText={handleHeightChange}
                keyboardType="numeric"
                placeholder="170"
              />
              <Text style={styles.inlineSuffix}>{t('onboarding.basicInfo.cm')}</Text>
            </View>
          </View>
        </View>
      </OnboardingScaffold>
    </>
  );
}

function calculateAgeFromBirthdate(birthdate: string | Date | null | undefined) {
  if (!birthdate) return null;
  const date = typeof birthdate === 'string' ? new Date(birthdate) : birthdate;
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let computed = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
    computed -= 1;
  }
  return computed;
}

function buildBirthdateFromAge(age: number) {
  const today = new Date();
  return new Date(today.getFullYear() - age, today.getMonth(), today.getDate());
}

const styles = StyleSheet.create({
  form: {
    gap: 24,
  },
  card: {
    gap: 16,
    ...onboardingCardStyle,
  },
  input: {
    ...onboardingInputStyle,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(28,28,30,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  chipSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  chipLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  chipLabelSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  inlineSuffix: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
  },
});
