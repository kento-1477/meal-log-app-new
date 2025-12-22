import { create } from 'zustand';
import type { ActivityLevelString, Gender, PlanIntensity, UserProfile } from '@meal-log/shared';

export type OnboardingStep =
  | 'welcome'
  | 'goals'
  | 'basic-info'
  | 'marketing'
  | 'current-weight'
  | 'activity'
  | 'plan-mode'
  | 'analysis';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'goals',
  'basic-info',
  'marketing',
  'current-weight',
  'activity',
  'plan-mode',
  'analysis',
] as const;

export interface OnboardingDraft {
  displayName: string;
  gender: Gender | null;
  birthdate: string | null;
  heightCm: number | null;
  marketingSource: string;
  marketingReferralCode: string;
  goals: string[];
  targetCalories: number | null;
  targetProtein: number | null;
  targetFat: number | null;
  targetCarbs: number | null;
  bodyWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  planIntensity: PlanIntensity | null;
  targetDate: string | null;
  activityLevel: ActivityLevelString | null;
  language: string | null;
}

const createDefaultDraft = (): OnboardingDraft => ({
  displayName: '',
  gender: null,
  birthdate: null,
  heightCm: null,
  marketingSource: '',
  marketingReferralCode: '',
  goals: [],
  targetCalories: null,
  targetProtein: null,
  targetFat: null,
  targetCarbs: null,
  bodyWeightKg: null,
  currentWeightKg: null,
  targetWeightKg: null,
  planIntensity: null,
  targetDate: null,
  activityLevel: null,
  language: null,
});

interface OnboardingState {
  draft: OnboardingDraft;
  currentStep: OnboardingStep;
  startedAt: number | null;
  updateDraft: (patch: Partial<OnboardingDraft>) => void;
  setGoals: (goals: string[]) => void;
  setStep: (step: OnboardingStep) => void;
  hydrateFromProfile: (profile: UserProfile | null) => void;
  reset: () => void;
  markStarted: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  draft: createDefaultDraft(),
  currentStep: 'welcome',
  startedAt: null,
  updateDraft: (patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        ...patch,
      },
    })),
  setGoals: (goals) =>
    set((state) => ({
      draft: {
        ...state.draft,
        goals,
      },
    })),
  setStep: (step) => set({ currentStep: step }),
  hydrateFromProfile: (profile) =>
    set((state) => {
      if (!profile) {
        return { draft: createDefaultDraft() };
      }

      return {
        draft: {
          ...state.draft,
          displayName: profile.display_name ?? state.draft.displayName,
          gender: (profile.gender as Gender | null | undefined) ?? state.draft.gender,
          birthdate: profile.birthdate ?? state.draft.birthdate,
          heightCm: profile.height_cm ?? state.draft.heightCm,
          marketingSource: profile.marketing_source ?? state.draft.marketingSource,
          marketingReferralCode: state.draft.marketingReferralCode,
          goals: Array.isArray(profile.goals) ? profile.goals : state.draft.goals,
          targetCalories: profile.target_calories ?? state.draft.targetCalories,
          targetProtein: profile.target_protein_g ?? state.draft.targetProtein,
          targetFat: profile.target_fat_g ?? state.draft.targetFat,
          targetCarbs: profile.target_carbs_g ?? state.draft.targetCarbs,
          bodyWeightKg: profile.body_weight_kg ?? state.draft.bodyWeightKg,
          currentWeightKg: profile.current_weight_kg ?? state.draft.currentWeightKg,
          targetWeightKg: profile.target_weight_kg ?? state.draft.targetWeightKg,
          planIntensity: (profile.plan_intensity as PlanIntensity | null | undefined) ?? state.draft.planIntensity,
          targetDate: profile.target_date ?? state.draft.targetDate,
          activityLevel: (profile.activity_level as ActivityLevelString | null | undefined) ?? state.draft.activityLevel,
          language: profile.language ?? state.draft.language,
        },
      };
    }),
  reset: () => set({ draft: createDefaultDraft(), currentStep: 'welcome', startedAt: null }),
  markStarted: () =>
    set((state) => (state.startedAt ? {} : { startedAt: Date.now() })),
}));
