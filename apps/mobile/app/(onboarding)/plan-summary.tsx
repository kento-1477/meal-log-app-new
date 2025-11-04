import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { estimateTargetDate } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { roundTo } from '@/utils/units';
import { onboardingCardStyle, onboardingInputStyle, onboardingTypography } from '@/theme/onboarding';

export default function OnboardingPlanSummaryScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const updateDraft = useOnboardingStore((state) => state.updateDraft);

  useOnboardingStep('plan-summary');

  const plan = PLAN_INTENSITY_OPTIONS.find((item) => item.id === draft.planIntensity) ?? null;

  const [targetInput, setTargetInput] = useState(() =>
    draft.targetWeightKg ? String(roundTo(draft.targetWeightKg, 1)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const handleTargetChange = (value: string) => {
    setTargetInput(value);
    const parsed = Number(value);
    if (parsed == null || parsed <= 0) {
      if (!value) {
        updateDraft({ targetWeightKg: null });
        setError(null);
      } else {
        setError(t('onboarding.summary.invalidTarget'));
      }
      return;
    }
    setError(null);
    updateDraft({ targetWeightKg: parsed });
  };

  const summary = useMemo(() => {
    if (!draft.currentWeightKg || !draft.targetWeightKg || !plan) {
      return null;
    }
    const difference = draft.currentWeightKg - draft.targetWeightKg;
    if (Math.abs(difference) < 0.001) {
      return {
        difference,
        weeks: 0,
        targetDate: new Date(),
      };
    }
    const weeklyRate = plan.weeklyRateKg;
    if (weeklyRate <= 0) return null;
    const weeks = Math.abs(difference) / weeklyRate;
    const iso = estimateTargetDate({
      currentWeightKg: draft.currentWeightKg,
      targetWeightKg: draft.targetWeightKg,
      weeklyRateKg: weeklyRate,
      startDate: new Date(),
    });
    return {
      difference,
      weeks,
      targetDate: iso ? new Date(iso) : null,
    };
  }, [draft.currentWeightKg, draft.targetWeightKg, plan]);

  const canProceed = Boolean(plan && draft.targetWeightKg && !error);

  const targetDateIsoMemo = summary?.targetDate?.toISOString() ?? null;

  useEffect(() => {
    if (targetDateIsoMemo !== draft.targetDate) {
      updateDraft({ targetDate: targetDateIsoMemo });
    }
  }, [draft.targetDate, targetDateIsoMemo, updateDraft]);

  const targetDateText = summary?.targetDate
    ? summary.targetDate.toLocaleDateString(locale === 'ja-JP' ? 'ja-JP' : undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '--';

  const weeklyChange = summary ? roundTo(summary.difference / Math.max(summary.weeks, 1), 2) : null;

  return (
    <OnboardingScaffold
      step="plan-summary"
      title={t('onboarding.summary.title')}
      subtitle={t('onboarding.summary.subtitle')}
      onNext={() => router.push('/(onboarding)/analysis')}
      nextLabel={t('onboarding.summary.cta')}
      nextDisabled={!canProceed}
      onBack={() => router.back()}
    >
      <View style={styles.stack}>
        <View style={styles.card}>
          <Text style={onboardingTypography.label}>{t('onboarding.summary.targetWeight')}</Text>
          <Text style={onboardingTypography.helper}>{t('onboarding.summary.targetHelper')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={targetInput}
              onChangeText={handleTargetChange}
              keyboardType="decimal-pad"
              placeholder="60"
            />
            <Text style={styles.unit}>{t('onboarding.weight.kg')}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={[styles.card, styles.summaryCard]}>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.planMode')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>
              {plan ? t(plan.labelKey) : t('onboarding.summary.unselected')}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.weeklyChange')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>
              {weeklyChange != null ? `${roundTo(Math.abs(weeklyChange), 2)} kg / ${t('common.week')}` : '--'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={onboardingTypography.cardDetail}>{t('onboarding.summary.projectedDate')}</Text>
            <Text style={[onboardingTypography.cardTitle, styles.summaryValue]}>{targetDateText}</Text>
          </View>
          <Text style={onboardingTypography.helper}>{t('onboarding.summary.note')}</Text>
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 24,
  },
  card: {
    gap: 16,
    ...onboardingCardStyle,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    ...onboardingInputStyle,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  unit: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryCard: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryValue: {
    textAlign: 'right',
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
  },
});
