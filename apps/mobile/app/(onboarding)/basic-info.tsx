import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { Gender, MeasurementSystem } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { cmToFeetInches, feetInchesToCm } from '@/utils/units';

const GENDER_ORDER: Gender[] = ['FEMALE', 'MALE', 'NON_BINARY', 'UNSPECIFIED'];

export default function OnboardingBasicInfoScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('basic-info');

  const [name, setName] = useState(draft.displayName ?? '');
  const [gender, setGender] = useState<Gender | null>(draft.gender ?? null);
  const [unit, setUnit] = useState<MeasurementSystem>(draft.unitPreference ?? 'METRIC');
  const initialBirthdate = draft.birthdate ? new Date(draft.birthdate) : null;
  const defaultBirthdate = initialBirthdate ?? buildDefaultBirthdate();
  const [birthdate, setBirthdate] = useState<Date | null>(initialBirthdate);
  const [birthdateInput, setBirthdateInput] = useState(initialBirthdate ? formatDate(initialBirthdate) : '');
  const [birthdatePickerVisible, setBirthdatePickerVisible] = useState(false);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - 100;
    const list: number[] = [];
    for (let year = currentYear; year >= minYear; year -= 1) {
      list.push(year);
    }
    return list;
  }, []);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []); // 0-based

  const findYearIndex = (target: number) => {
    const idx = years.indexOf(target);
    return idx >= 0 ? idx : 0;
  };

  const birthdateYearIndex = findYearIndex(defaultBirthdate.getFullYear());

  const [pickerYearIndex, setPickerYearIndex] = useState(birthdateYearIndex);
  const [pickerMonthIndex, setPickerMonthIndex] = useState(defaultBirthdate.getMonth());
  const [pickerDayIndex, setPickerDayIndex] = useState(defaultBirthdate.getDate() - 1);
  const days = useMemo(() => {
    const year = years[pickerYearIndex] ?? years[0];
    const total = getDaysInMonth(year, pickerMonthIndex);
    return Array.from({ length: total }, (_, index) => index + 1);
  }, [pickerYearIndex, pickerMonthIndex, years]);

  useEffect(() => {
    const total = days.length;
    setPickerDayIndex((prev) => {
      if (total === 0) return 0;
      return Math.min(prev, total - 1);
    });
  }, [days.length]);
  const [heightMetricInput, setHeightMetricInput] = useState(
    draft.heightCm ? Math.round(draft.heightCm).toString() : '',
  );
  const initialFeetInches = useMemo(() => {
    if (!draft.heightCm) return { feet: '', inches: '' };
    const { feet, inches } = cmToFeetInches(draft.heightCm);
    return {
      feet: String(feet),
      inches: String(Math.round(inches)),
    } as const;
  }, [draft.heightCm]);
  const [heightFeetInput, setHeightFeetInput] = useState(initialFeetInches.feet);
  const [heightInchesInput, setHeightInchesInput] = useState(initialFeetInches.inches);

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

  const handleUnitToggle = (value: MeasurementSystem) => {
    setUnit(value);
    updateDraft({ unitPreference: value });
    if (value === 'IMPERIAL' && heightCm != null) {
      const { feet, inches } = cmToFeetInches(heightCm);
      setHeightFeetInput(String(feet));
      setHeightInchesInput(String(Math.round(inches)));
    } else if (value === 'IMPERIAL') {
      setHeightFeetInput('');
      setHeightInchesInput('');
    }
    if (value === 'METRIC' && heightCm != null) {
      setHeightMetricInput(Math.round(heightCm).toString());
    } else if (value === 'METRIC') {
      setHeightMetricInput('');
    }
  };

  const openBirthdatePicker = () => {
    const target = birthdate ?? buildDefaultBirthdate();
    const yearIdx = findYearIndex(target.getFullYear());
    const monthIdx = target.getMonth();
    const maxDays = getDaysInMonth(years[yearIdx] ?? years[0], monthIdx);
    const dayIdx = Math.min(target.getDate() - 1, Math.max(0, maxDays - 1));
    setPickerYearIndex(yearIdx);
    setPickerMonthIndex(monthIdx);
    setPickerDayIndex(dayIdx);
    setBirthdatePickerVisible(true);
  };

  const closeBirthdatePicker = () => {
    setBirthdatePickerVisible(false);
  };

  const handleBirthdateConfirm = (date: Date) => {
    setBirthdate(date);
    const formatted = formatDate(date);
    setBirthdateInput(formatted);
    updateDraft({ birthdate: date.toISOString() });
    setBirthdatePickerVisible(false);
  };

  const handleBirthdateConfirmFromPicker = () => {
    const year = years[pickerYearIndex] ?? years[0];
    const month = pickerMonthIndex;
    const day = days[pickerDayIndex] ?? 1;
    const selected = new Date(year, month, day);
    handleBirthdateConfirm(selected);
  };

  const handleMetricHeightChange = (value: string) => {
    setHeightMetricInput(value);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      setHeightCm(numeric);
      updateDraft({ heightCm: numeric });
    } else if (!value) {
      setHeightCm(null);
      updateDraft({ heightCm: null });
    }
  };

  const handleImperialHeightChange = (feetInput: string, inchesInput: string) => {
    setHeightFeetInput(feetInput);
    setHeightInchesInput(inchesInput);
    const feet = Number(feetInput || '0');
    const inches = Number(inchesInput || '0');
    if (Number.isFinite(feet) && Number.isFinite(inches) && (feet > 0 || inches > 0)) {
      const cm = feetInchesToCm(feet, inches);
      setHeightCm(cm);
      updateDraft({ heightCm: cm });
    } else if (!feetInput && !inchesInput) {
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

  const canProceed = Boolean(name.trim()) && Boolean(birthdate) && heightCm != null;

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
        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.basicInfo.name')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={handleNameChange}
            placeholder={t('onboarding.basicInfo.namePlaceholder')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.basicInfo.gender')}</Text>
          <View style={styles.chipRow}>
            {genderOptions.map((option) => {
              const selected = option.id === gender;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                  onPress={() => handleGenderSelect(option.id)}
                >
                  <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.basicInfo.birthdate')}</Text>
          <TouchableOpacity
            style={styles.inputButton}
            onPress={openBirthdatePicker}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.inputButtonText,
                birthdate ? styles.inputButtonValue : styles.inputButtonPlaceholder,
              ]}
            >
              {birthdate ? birthdateInput : t('onboarding.basicInfo.birthdatePlaceholder')}
            </Text>
          </TouchableOpacity>
          {/* Reserved for future validation errors */}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.basicInfo.unit')}</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, unit === 'METRIC' ? styles.chipSelected : null]}
              onPress={() => handleUnitToggle('METRIC')}
            >
              <Text style={[styles.chipLabel, unit === 'METRIC' ? styles.chipLabelSelected : null]}>
                {t('onboarding.basicInfo.metric')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, unit === 'IMPERIAL' ? styles.chipSelected : null]}
              onPress={() => handleUnitToggle('IMPERIAL')}
            >
              <Text style={[styles.chipLabel, unit === 'IMPERIAL' ? styles.chipLabelSelected : null]}>
                {t('onboarding.basicInfo.imperial')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>{t('onboarding.basicInfo.healthNote')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('onboarding.basicInfo.height')}</Text>
          {unit === 'METRIC' ? (
            <View style={styles.inlineField}>
              <TextInput
                style={[styles.input, styles.inlineInput]}
                value={heightMetricInput}
                onChangeText={handleMetricHeightChange}
                keyboardType="numeric"
                placeholder="170"
              />
              <Text style={styles.inlineSuffix}>{t('onboarding.basicInfo.cm')}</Text>
            </View>
          ) : (
            <View style={styles.inlineSplit}>
              <View style={styles.inlineField}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  value={heightFeetInput}
                  onChangeText={(value) => handleImperialHeightChange(value, heightInchesInput)}
                  keyboardType="numeric"
                  placeholder="5"
                />
                <Text style={styles.inlineSuffix}>{t('onboarding.basicInfo.ft')}</Text>
              </View>
              <View style={styles.inlineField}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  value={heightInchesInput}
                  onChangeText={(value) => handleImperialHeightChange(heightFeetInput, value)}
                  keyboardType="numeric"
                  placeholder="7"
                />
                <Text style={styles.inlineSuffix}>{t('onboarding.basicInfo.in')}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      </OnboardingScaffold>

      <Modal
        visible={birthdatePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={closeBirthdatePicker}
      >
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={closeBirthdatePicker}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('onboarding.basicInfo.birthdate')}</Text>
            <View style={styles.wheelContainer}>
              <View style={styles.wheelHighlight} pointerEvents="none" />
              <WheelColumn
                data={years}
                selectedIndex={pickerYearIndex}
                onSelect={setPickerYearIndex}
                formatItem={(value) => `${value}`}
              />
              <WheelColumn
                data={months}
                selectedIndex={pickerMonthIndex}
                onSelect={setPickerMonthIndex}
                formatItem={(value) => `${value + 1}`}
              />
              <WheelColumn
                data={days}
                selectedIndex={pickerDayIndex}
                onSelect={setPickerDayIndex}
                formatItem={(value) => `${value}`}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeBirthdatePicker}>
                <Text style={styles.modalButtonSecondaryLabel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleBirthdateConfirmFromPicker}>
                <Text style={styles.modalButtonPrimaryLabel}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDefaultBirthdate() {
  const today = new Date();
  today.setFullYear(today.getFullYear() - 25);
  return today;
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const WHEEL_ITEM_HEIGHT = 44;

interface WheelColumnProps<T> {
  data: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  formatItem: (value: T) => string;
}

function WheelColumn<T>({ data, selectedIndex, onSelect, formatItem }: WheelColumnProps<T>) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: false });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={styles.wheelContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={(event) => {
        const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(data.length - 1, index));
        onSelect(clamped);
      }}
    >
      {data.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <View key={`${item}-${index}`} style={[styles.wheelItem, active && styles.wheelItemActive]}>
            <Text style={[styles.wheelItemLabel, active && styles.wheelItemLabelActive]}>
              {formatItem(item)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 20,
  },
  field: {
    gap: 12,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  inputButton: {
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inputButtonText: {
    ...textStyles.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputButtonPlaceholder: {
    color: colors.textSecondary,
  },
  inputButtonValue: {
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  chipLabelSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineSplit: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineInput: {
    flex: 1,
  },
  inlineSuffix: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
  },
  helperText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    ...textStyles.body,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  wheelContainer: {
    flexDirection: 'row',
    position: 'relative',
    marginHorizontal: 4,
    marginBottom: 16,
    height: WHEEL_ITEM_HEIGHT * 5,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (WHEEL_ITEM_HEIGHT * 5 - WHEEL_ITEM_HEIGHT) / 2,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: 'rgba(10,132,255,0.08)',
  },
  wheelColumn: {
    flex: 1,
  },
  wheelContent: {
    paddingVertical: (WHEEL_ITEM_HEIGHT * 5 - WHEEL_ITEM_HEIGHT) / 2,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelItemActive: {},
  wheelItemLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 18,
  },
  wheelItemLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButtonSecondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonSecondaryLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalButtonPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonPrimaryLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
