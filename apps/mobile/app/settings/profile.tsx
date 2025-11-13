import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_GOAL_SELECTION, type PlanIntensity } from '@meal-log/shared';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import {
  getUserProfile,
  updateUserProfile,
  getPremiumStatus,
  type UpdateUserProfileRequest,
  type UserProfile,
} from '@/services/api';
import { usePremiumStore } from '@/store/premium';
import ProfileField from '@/screen-components/settings/profile-helpers';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GOAL_OPTIONS, ACTIVITY_OPTIONS, PLAN_INTENSITY_OPTIONS } from '@/screen-components/onboarding/constants';

type FormState = {
  displayName: string;
  height: string;
  currentWeight: string;
  targetWeight: string;
  bodyWeight: string;
  activityLevel: string;
  planIntensity: PlanIntensity | '';
  goals: Set<string>;
  referralCode: string;
};

type Snapshot = {
  height: string;
  currentWeight: string;
  targetWeight: string;
  bodyWeight: string;
  activityLevel: string;
  planIntensity: string;
  goalsKey: string;
};

const EMPTY_FORM: FormState = {
  displayName: '',
  height: '',
  currentWeight: '',
  targetWeight: '',
  bodyWeight: '',
  activityLevel: 'MODERATE',
  planIntensity: 'STANDARD',
  goals: new Set(),
  referralCode: '',
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const setPremiumStatus = usePremiumStore((state) => state.setStatus);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getUserProfile,
  });

  useEffect(() => {
    if (profileQuery.data) {
      const mapped = mapProfileToForm(profileQuery.data);
      setForm(mapped);
      setSnapshot(createSnapshot(mapped));
    }
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: UpdateUserProfileRequest) => updateUserProfile(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      const mapped = mapProfileToForm(result.profile);
      setForm(mapped);
      setSnapshot(createSnapshot(mapped));
      Alert.alert(t('settings.profile.savedTitle'), t('settings.profile.savedMessage'));
      if (result.referralClaimed && result.referralResult) {
        Alert.alert(
          '🎉 プレミアムを獲得しました！',
          `${result.referralResult.premiumDays}日間のプレミアムが付与されました。${result.referralResult.referrerUsername ?? ''}`.trim(),
        );
        getPremiumStatus()
          .then((status) => setPremiumStatus(status))
          .catch((error) => console.warn('Failed to refresh premium status', error));
      }
    },
    onError: () => {
      Alert.alert(t('settings.profile.errorTitle'), t('settings.profile.errorMessage'));
    },
  });

  const selectedGoalCount = form.goals.size;

  const handleToggleGoal = (goalId: string) => {
    setForm((prev) => {
      const nextGoals = new Set(prev.goals);
      if (nextGoals.has(goalId)) {
        nextGoals.delete(goalId);
        return { ...prev, goals: nextGoals };
      }
      if (nextGoals.size >= MAX_GOAL_SELECTION) {
        Alert.alert(t('settings.profile.goalLimit', { count: MAX_GOAL_SELECTION }));
        return prev;
      }
      nextGoals.add(goalId);
      return { ...prev, goals: nextGoals };
    });
  };

  const buildPayload = (): UpdateUserProfileRequest | null => {
    const displayName = form.displayName.trim();

    const height = parseNumber(form.height);
    const currentWeight = parseNumber(form.currentWeight);
    const targetWeight = parseNumber(form.targetWeight);
    const bodyWeight = parseNumber(form.bodyWeight);

    if ([height, currentWeight, targetWeight, bodyWeight].includes(undefined)) {
      return null;
    }

    return {
      display_name: displayName || null,
      height_cm: (height as number | null) ?? null,
      current_weight_kg: (currentWeight as number | null) ?? null,
      target_weight_kg: (targetWeight as number | null) ?? null,
      body_weight_kg: (bodyWeight as number | null) ?? null,
      activity_level: form.activityLevel || null,
      plan_intensity: (form.planIntensity as PlanIntensity | null) ?? null,
      goals: Array.from(form.goals),
      marketing_referral_code: form.referralCode.trim() || null,
    };
  };

  const handleSave = () => {
    const payload = buildPayload();
    if (!payload) {
      Alert.alert(t('settings.profile.validationTitle'), t('settings.profile.validationMessage'));
      return;
    }

    const requiresRecalc = snapshot ? hasRecalcChanges(snapshot, form) : false;

    const submit = (autoRecalc: boolean) => mutation.mutate(autoRecalc ? { ...payload, auto_recalculate: true } : payload);

    if (requiresRecalc) {
      Alert.alert(t('settings.profile.recalcTitle'), t('settings.profile.recalcMessage'), [
        { text: t('common.no'), style: 'cancel', onPress: () => submit(false) },
        { text: t('common.yes'), onPress: () => submit(true) },
      ]);
    } else {
      submit(false);
    }
  };

  const renderActivityOptions = () =>
    ACTIVITY_OPTIONS.map((option) => {
      const selected = form.activityLevel === option.id;
      return (
        <TouchableOpacity
          key={option.id}
          style={[styles.optionCard, selected && styles.optionCardSelected]}
          onPress={() => setForm((prev) => ({ ...prev, activityLevel: option.id }))}
        >
          <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{t(option.labelKey)}</Text>
          <Text style={styles.optionDescription}>{t(option.descriptionKey)}</Text>
        </TouchableOpacity>
      );
    });

  const renderPlanIntensityOptions = () =>
    PLAN_INTENSITY_OPTIONS.map((option) => {
      const selected = form.planIntensity === option.id;
      return (
        <TouchableOpacity
          key={option.id}
          style={[styles.optionCard, selected && styles.optionCardSelected]}
          onPress={() => setForm((prev) => ({ ...prev, planIntensity: option.id }))}
        >
          <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{t(option.labelKey)}</Text>
          <Text style={styles.optionDescription}>{t(option.descriptionKey)}</Text>
        </TouchableOpacity>
      );
    });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t('settings.profile.screenTitle')}</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.profile.metricsSection')}</Text>
            <ProfileField
              label={t('settings.profile.displayName')}
              value={form.displayName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, displayName: value }))}
              placeholder="meal 太郎"
              keyboardType="default"
            />
            <ProfileField
              label={t('settings.profile.height')}
              value={form.height}
              onChangeText={(value) => setForm((prev) => ({ ...prev, height: value }))}
              placeholder="170"
              suffix="cm"
            />
            <ProfileField
              label={t('settings.profile.currentWeight')}
              value={form.currentWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, currentWeight: value }))}
              placeholder="65"
              suffix="kg"
            />
            <ProfileField
              label={t('settings.profile.targetWeight')}
              value={form.targetWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, targetWeight: value }))}
              placeholder="60"
              suffix="kg"
            />
            <ProfileField
              label={t('settings.profile.bodyWeight')}
              value={form.bodyWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, bodyWeight: value }))}
              placeholder="60"
              suffix="kg"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.profile.activitySection')}</Text>
            <Text style={styles.sectionHelper}>{t('settings.profile.activityHint')}</Text>
            <View style={styles.optionStack}>{renderActivityOptions()}</View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.profile.planSection')}</Text>
            <Text style={styles.sectionHelper}>{t('settings.profile.planHint')}</Text>
            <View style={styles.optionStack}>{renderPlanIntensityOptions()}</View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.profile.goalsSection')}</Text>
            <Text style={styles.sectionHelper}>{t('settings.profile.goalsHint', { count: MAX_GOAL_SELECTION })}</Text>
            <View style={styles.goalRows}>
              {GOAL_OPTIONS.map((goal) => {
                const selected = form.goals.has(goal.id);
                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={[styles.goalChip, selected && styles.goalChipSelected]}
                    onPress={() => handleToggleGoal(goal.id)}
                  >
                    <Text style={[styles.goalChipLabel, selected && styles.goalChipLabelSelected]}>
                      {t(goal.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.goalCount}>
              {t('settings.profile.goalCount', { current: selectedGoalCount, max: MAX_GOAL_SELECTION })}
            </Text>
            <ProfileField
              label={t('settings.profile.referralCode')}
              value={form.referralCode}
              onChangeText={(value) => setForm((prev) => ({ ...prev, referralCode: value }))}
              placeholder={t('settings.profile.referralPlaceholder')}
              keyboardType="default"
            />
          </View>

          <PrimaryButton
            label={t('settings.profile.save')}
            onPress={handleSave}
            loading={mutation.isLoading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function mapProfileToForm(profile: UserProfile): FormState {
  return {
    displayName: profile.display_name ?? '',
    height: numericToInput(profile.height_cm),
    currentWeight: numericToInput(profile.current_weight_kg ?? profile.body_weight_kg ?? null),
    targetWeight: numericToInput(profile.target_weight_kg),
    bodyWeight: numericToInput(profile.body_weight_kg),
    activityLevel: profile.activity_level ?? 'MODERATE',
    planIntensity: (profile.plan_intensity as PlanIntensity | null) ?? 'STANDARD',
    goals: new Set(profile.goals ?? []),
    referralCode: profile.marketing_referral_code ?? '',
  };
}

function createSnapshot(form: FormState): Snapshot {
  return {
    height: form.height.trim(),
    currentWeight: form.currentWeight.trim(),
    targetWeight: form.targetWeight.trim(),
    bodyWeight: form.bodyWeight.trim(),
    activityLevel: form.activityLevel,
    planIntensity: form.planIntensity ?? '',
    goalsKey: Array.from(form.goals).sort().join(','),
  };
}

function hasRecalcChanges(prev: Snapshot, form: FormState) {
  const current: Snapshot = createSnapshot(form);
  return (
    prev.height !== current.height ||
    prev.currentWeight !== current.currentWeight ||
    prev.targetWeight !== current.targetWeight ||
    prev.bodyWeight !== current.bodyWeight ||
    prev.activityLevel !== current.activityLevel ||
    prev.planIntensity !== current.planIntensity ||
    prev.goalsKey !== current.goalsKey
  );
}

function numericToInput(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
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
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surfaceStrong,
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  sectionHelper: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  optionStack: {
    gap: spacing.sm,
  },
  optionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: '#fff',
  },
  optionCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(245,178,37,0.08)',
  },
  optionTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  optionTitleSelected: {
    color: colors.accentInk,
  },
  optionDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  goalRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  goalChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  goalChipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(245,178,37,0.15)',
  },
  goalChipLabel: {
    ...textStyles.caption,
    color: colors.textPrimary,
  },
  goalChipLabelSelected: {
    fontWeight: '600',
    color: colors.accentInk,
  },
  goalCount: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
