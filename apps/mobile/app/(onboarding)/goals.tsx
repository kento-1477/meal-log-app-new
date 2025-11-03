import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_GOAL_SELECTION } from '@meal-log/shared';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { OnboardingScaffold } from '@/screen-components/onboarding/OnboardingScaffold';
import { GOAL_OPTIONS } from '@/screen-components/onboarding/constants';
import { useOnboardingStore } from '@/store/onboarding';
import { useTranslation } from '@/i18n';
import { trackOnboardingGoalsUpdated } from '@/analytics/events';
import { SelectableCard } from '@/components/SelectableCard';
import type { CardIconRenderer } from '@/components/SelectableCard';
import { Feather } from '@expo/vector-icons';

export default function OnboardingGoalsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const goals = useOnboardingStore((state) => state.draft.goals);
  const setGoals = useOnboardingStore((state) => state.setGoals);
  const [error, setError] = useState<string | null>(null);

  useOnboardingStep('goals');

  const selectedSet = useMemo(() => new Set(goals), [goals]);

  const iconMap: Record<string, CardIconRenderer> = {
    WEIGHT_LOSS: (selected) => (
      <Feather name="trending-down" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    STRESS_MANAGEMENT: (selected) => (
      <Feather name="wind" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    HABIT_BUILDING: (selected) => (
      <Feather name="repeat" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    WEIGHT_MAINTENANCE: (selected) => (
      <Feather name="compass" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
    MUSCLE_GAIN: (selected) => (
      <Feather name="activity" size={22} color={selected ? '#fff' : colors.textPrimary} />
    ),
  };

  const toggleGoal = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
      setGoals(Array.from(next));
      trackOnboardingGoalsUpdated({ goals: Array.from(next) });
      setError(null);
      return;
    }
    if (next.size >= MAX_GOAL_SELECTION) {
      setError(t('onboarding.goals.limit', { count: MAX_GOAL_SELECTION }));
      return;
    }
    next.add(id);
    const nextArray = Array.from(next);
    setGoals(nextArray);
    trackOnboardingGoalsUpdated({ goals: nextArray });
    setError(null);
  };

  return (
    <OnboardingScaffold
      step="goals"
      title={t('onboarding.goals.title')}
      subtitle={t('onboarding.goals.subtitle', { count: MAX_GOAL_SELECTION })}
      onNext={() => router.push('/(onboarding)/basic-info')}
      nextLabel={t('common.next')}
      nextDisabled={goals.length === 0}
      onBack={() => router.back()}
    >
      <View style={styles.grid}>
        {GOAL_OPTIONS.map((option) => {
          const selected = selectedSet.has(option.id);
          return (
            <SelectableCard
              key={option.id}
              title={t(option.labelKey)}
              selected={selected}
              onPress={() => toggleGoal(option.id)}
              icon={iconMap[option.id]}
            />
          );
        })}
      </View>
      <View style={styles.feedback}>
        <Text style={styles.selectionCount}>
          {t('onboarding.goals.selected', { current: goals.length, max: MAX_GOAL_SELECTION })}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 14,
  },
  feedback: {
    marginTop: 24,
    gap: 6,
  },
  selectionCount: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  error: {
    ...textStyles.caption,
    color: colors.error,
  },
});
