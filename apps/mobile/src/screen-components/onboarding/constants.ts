import type { PlanIntensity } from '@meal-log/shared';

export interface GoalOption {
  id: string;
  labelKey: string;
  descriptionKey?: string;
}

export const GOAL_OPTIONS: GoalOption[] = [
  { id: 'WEIGHT_LOSS', labelKey: 'onboarding.goals.weightLoss' },
  { id: 'STRESS_MANAGEMENT', labelKey: 'onboarding.goals.stressManagement' },
  { id: 'HABIT_BUILDING', labelKey: 'onboarding.goals.habitBuilding' },
  { id: 'WEIGHT_MAINTENANCE', labelKey: 'onboarding.goals.weightMaintenance' },
  { id: 'MUSCLE_GAIN', labelKey: 'onboarding.goals.muscleGain' },
];

export interface MarketingOption {
  id: string;
  labelKey: string;
}

export const MARKETING_OPTIONS: MarketingOption[] = [
  { id: 'instagram', labelKey: 'onboarding.marketing.instagram' },
  { id: 'facebook', labelKey: 'onboarding.marketing.facebook' },
  { id: 'tiktok', labelKey: 'onboarding.marketing.tiktok' },
  { id: 'friend', labelKey: 'onboarding.marketing.friend' },
  { id: 'app_store', labelKey: 'onboarding.marketing.appStore' },
  { id: 'other', labelKey: 'onboarding.marketing.other' },
];

export interface ActivityOption {
  id: string;
  labelKey: string;
  descriptionKey: string;
}

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  { id: 'SEDENTARY', labelKey: 'onboarding.activity.sedentary.title', descriptionKey: 'onboarding.activity.sedentary.subtitle' },
  { id: 'LIGHT', labelKey: 'onboarding.activity.light.title', descriptionKey: 'onboarding.activity.light.subtitle' },
  { id: 'MODERATE', labelKey: 'onboarding.activity.moderate.title', descriptionKey: 'onboarding.activity.moderate.subtitle' },
  { id: 'ACTIVE', labelKey: 'onboarding.activity.active.title', descriptionKey: 'onboarding.activity.active.subtitle' },
  { id: 'ATHLETE', labelKey: 'onboarding.activity.athlete.title', descriptionKey: 'onboarding.activity.athlete.subtitle' },
];

export interface PlanIntensityOption {
  id: PlanIntensity;
  labelKey: string;
  descriptionKey: string;
  weeklyRateKg: number;
}

export const PLAN_INTENSITY_OPTIONS: PlanIntensityOption[] = [
  { id: 'GENTLE', labelKey: 'onboarding.plan.gentle.title', descriptionKey: 'onboarding.plan.gentle.subtitle', weeklyRateKg: 0.36 },
  { id: 'STANDARD', labelKey: 'onboarding.plan.standard.title', descriptionKey: 'onboarding.plan.standard.subtitle', weeklyRateKg: 0.74 },
  { id: 'INTENSE', labelKey: 'onboarding.plan.intense.title', descriptionKey: 'onboarding.plan.intense.subtitle', weeklyRateKg: 1.1 },
];
