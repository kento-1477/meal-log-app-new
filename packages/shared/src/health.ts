import { z } from 'zod';
import type { ActivityLevelString, Gender, PlanIntensity } from './index';

export function calculateBmi(weightKg: number | null | undefined, heightCm: number | null | undefined) {
  if (!weightKg || !heightCm) {
    return null;
  }
  if (weightKg <= 0 || heightCm <= 0) {
    return null;
  }
  const meters = heightCm / 100;
  const bmi = weightKg / (meters * meters);
  return Number.isFinite(bmi) ? bmi : null;
}

export function calculateIdealWeightRange(
  heightCm: number | null | undefined,
  options: { lowerBmi?: number; upperBmi?: number } = {},
) {
  if (!heightCm || heightCm <= 0) {
    return null;
  }
  const { lowerBmi = 18.5, upperBmi = 24.9 } = options;
  const meters = heightCm / 100;
  const minKg = lowerBmi * meters * meters;
  const maxKg = upperBmi * meters * meters;
  if (!Number.isFinite(minKg) || !Number.isFinite(maxKg)) {
    return null;
  }
  return { minKg, maxKg } as const;
}

export const EstimateTargetDateInputSchema = z.object({
  currentWeightKg: z.number().positive(),
  targetWeightKg: z.number().positive(),
  weeklyRateKg: z.number().positive(),
  startDate: z
    .union([z.instanceof(Date), z.string().datetime()])
    .default(() => new Date()),
});

export type EstimateTargetDateInput = z.infer<typeof EstimateTargetDateInputSchema>;

export function estimateTargetDate(input: EstimateTargetDateInput) {
  const parsed = EstimateTargetDateInputSchema.parse(input);
  const { currentWeightKg, targetWeightKg, weeklyRateKg } = parsed;
  const startDate = typeof parsed.startDate === 'string' ? new Date(parsed.startDate) : parsed.startDate;

  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const remaining = Math.abs(targetWeightKg - currentWeightKg);
  if (remaining === 0) {
    return startDate.toISOString();
  }

  const weeksNeeded = remaining / weeklyRateKg;
  if (!Number.isFinite(weeksNeeded) || weeksNeeded <= 0) {
    return null;
  }

  const daysNeeded = Math.ceil(weeksNeeded * 7);
  const targetDate = new Date(startDate);
  targetDate.setDate(targetDate.getDate() + daysNeeded);
  return targetDate.toISOString();
}

const ACTIVITY_LEVEL_FACTORS: Record<string, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  ATHLETE: 1.9,
};

const PLAN_INTENSITY_DEFICIT: Record<PlanIntensity, number> = {
  GENTLE: 300,
  STANDARD: 500,
  INTENSE: 750,
};

const PLAN_INTENSITY_SURPLUS: Record<PlanIntensity, number> = {
  GENTLE: 200,
  STANDARD: 350,
  INTENSE: 500,
};

const WEIGHT_RANGE_KG = { min: 35, max: 250 } as const;
const HEIGHT_RANGE_CM = { min: 130, max: 220 } as const;

function calculateAge(birthdate: string | Date | null | undefined) {
  if (!birthdate) return null;
  const date = typeof birthdate === 'string' ? new Date(birthdate) : birthdate;
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

function resolveGenderCoefficient(gender: Gender | null | undefined) {
  switch (gender) {
    case 'MALE':
      return 5;
    case 'FEMALE':
      return -161;
    case 'NON_BINARY':
    case 'UNSPECIFIED':
    default:
      return (5 - 161) / 2; // 平均値を採用
  }
}

export interface NutritionPlanInput {
  gender: Gender | null | undefined;
  birthdate: string | Date | null | undefined;
  heightCm: number | null | undefined;
  currentWeightKg: number | null | undefined;
  targetWeightKg: number | null | undefined;
  activityLevel: ActivityLevelString | null | undefined;
  planIntensity: PlanIntensity | null | undefined;
  goals?: readonly string[] | null | undefined;
}

export interface NutritionPlanResult {
  targetCalories: number;
  maintenanceCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbGrams: number;
  method: 'auto';
}

export type NutritionPlanComputation = NutritionPlanResult & {
  meta: {
    bmr: number;
    activityFactor: number;
    calorieAdjustment: number;
    goalFocus: GoalFocus;
  };
};

type GoalFocus = 'LOSS' | 'GAIN' | 'MAINTAIN' | 'BALANCE';

const WEIGHT_LOSS_GOALS = new Set(['WEIGHT_LOSS']);
const MUSCLE_GAIN_GOALS = new Set(['MUSCLE_GAIN']);
const MAINTAIN_GOALS = new Set(['WEIGHT_MAINTENANCE']);

interface PlanComputationContext {
  gender: Gender;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityFactor: number;
  planIntensity: PlanIntensity;
  goalFocus: GoalFocus;
}

function determineGoalFocus(
  goals: readonly string[] | null | undefined,
  currentWeightKg: number,
  targetWeightKg: number,
): GoalFocus {
  const list = Array.isArray(goals) ? goals : [];
  const hasLossGoal = list.some((goal) => WEIGHT_LOSS_GOALS.has(goal));
  const hasGainGoal = list.some((goal) => MUSCLE_GAIN_GOALS.has(goal));
  const hasMaintainGoal = list.some((goal) => MAINTAIN_GOALS.has(goal));

  if (hasLossGoal) return 'LOSS';
  if (hasGainGoal) return 'GAIN';
  if (hasMaintainGoal) return 'MAINTAIN';

  const delta = targetWeightKg - currentWeightKg;
  if (delta < -0.5) return 'LOSS';
  if (delta > 0.5) return 'GAIN';
  return 'BALANCE';
}

function guardInputs(input: NutritionPlanInput): PlanComputationContext | null {
  if (
    input.gender == null ||
    input.heightCm == null ||
    input.currentWeightKg == null ||
    input.planIntensity == null ||
    input.activityLevel == null
  ) {
    return null;
  }

  const gender = input.gender;
  const heightCm = input.heightCm ?? null;
  const currentWeightKg = input.currentWeightKg ?? null;
  const targetWeightKg = input.targetWeightKg ?? currentWeightKg;
  const age = calculateAge(input.birthdate);

  if (
    heightCm == null ||
    currentWeightKg == null ||
    age == null ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(currentWeightKg) ||
    !Number.isFinite(targetWeightKg)
  ) {
    return null;
  }

  if (
    heightCm < HEIGHT_RANGE_CM.min ||
    heightCm > HEIGHT_RANGE_CM.max ||
    currentWeightKg < WEIGHT_RANGE_KG.min ||
    currentWeightKg > WEIGHT_RANGE_KG.max
  ) {
    return null;
  }

  const upperActivityKey = typeof input.activityLevel === 'string' ? input.activityLevel.toUpperCase() : 'MODERATE';
  const activityFactor = ACTIVITY_LEVEL_FACTORS[upperActivityKey] ?? 1.45;
  const goalFocus = determineGoalFocus(input.goals, currentWeightKg, targetWeightKg);

  return {
    gender,
    age,
    heightCm,
    currentWeightKg,
    targetWeightKg,
    activityFactor,
    planIntensity: input.planIntensity,
    goalFocus,
  };
}

export function calculateBasalMetabolicRate(context: PlanComputationContext) {
  const coef = resolveGenderCoefficient(context.gender);
  return 10 * context.currentWeightKg + 6.25 * context.heightCm - 5 * context.age + coef;
}

function determineCalorieAdjustment(context: PlanComputationContext, maintenance: number) {
  let direction: number;

  switch (context.goalFocus) {
    case 'LOSS':
      direction = -1;
      break;
    case 'GAIN':
      direction = 1;
      break;
    case 'MAINTAIN':
      return 0;
    default: {
      const delta = context.targetWeightKg - context.currentWeightKg;
      direction = Math.sign(delta);
    }
  }

  if (direction === 0) {
    return 0;
  }

  const table = direction < 0 ? PLAN_INTENSITY_DEFICIT : PLAN_INTENSITY_SURPLUS;
  const adjustment = table[context.planIntensity];
  const maxAdjustment = maintenance * 0.35;
  return direction * Math.min(adjustment, maxAdjustment);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
export function computeNutritionPlan(input: NutritionPlanInput): NutritionPlanComputation | null {
  const context = guardInputs(input);
  if (!context) return null;

  const bmr = calculateBasalMetabolicRate(context);
  if (!Number.isFinite(bmr) || bmr <= 0) {
    return null;
  }

  const maintenanceCalories = bmr * context.activityFactor;
  const adjustment = determineCalorieAdjustment(context, maintenanceCalories);

  const minCalories = Math.max(bmr * 1.2, 1200);
  const maxCalories = Math.min(maintenanceCalories + 1000, 4500);

  let targetCalories = maintenanceCalories + adjustment;
  targetCalories = clamp(targetCalories, minCalories, maxCalories);

  const weightDelta = context.targetWeightKg - context.currentWeightKg;
  const goalFocus = context.goalFocus;

  const defaultProteinFactor = weightDelta > 0.5 ? 2.2 : weightDelta < -0.5 ? 2 : 1.8;
  const proteinFactor =
    goalFocus === 'GAIN' ? 2.2 : goalFocus === 'LOSS' ? 2 : goalFocus === 'MAINTAIN' ? 1.7 : defaultProteinFactor;
  const minProteinFactor = goalFocus === 'GAIN' ? 1.8 : 1.4;
  const maxProteinCaloriesRatio = goalFocus === 'GAIN' ? 0.4 : 0.35;

  const baseProteinGrams = context.currentWeightKg * proteinFactor;
  const minProteinGrams = context.currentWeightKg * minProteinFactor;
  const maxProteinGrams = (targetCalories * maxProteinCaloriesRatio) / 4;
  let proteinGrams = clamp(baseProteinGrams, minProteinGrams, maxProteinGrams);
  proteinGrams = clamp(proteinGrams, 60, 220);
  let proteinCalories = proteinGrams * 4;

  const minFatRatio = goalFocus === 'LOSS' ? 0.22 : 0.2;
  const preferredFatRatio = goalFocus === 'GAIN' ? 0.27 : 0.25;
  const maxFatRatio = goalFocus === 'GAIN' ? 0.32 : 0.3;
  const minFatCalories = targetCalories * minFatRatio;
  const preferredFatCalories = targetCalories * preferredFatRatio;
  const maxFatCalories = targetCalories * maxFatRatio;
  let fatCalories = clamp(preferredFatCalories, minFatCalories, maxFatCalories);
  let fatGrams = fatCalories / 9;

  let carbCalories = targetCalories - proteinCalories - fatCalories;
  const minCarbCalories = (goalFocus === 'GAIN' ? 160 : goalFocus === 'LOSS' ? 120 : 130) * 4;

  if (carbCalories < minCarbCalories) {
    const deficit = minCarbCalories - carbCalories;
    const reducibleFat = fatCalories - minFatCalories;
    const fromFat = Math.min(deficit, Math.max(0, reducibleFat));
    fatCalories -= fromFat;
    fatGrams = fatCalories / 9;
    carbCalories += fromFat;

    const remainingDeficit = deficit - fromFat;
    if (remainingDeficit > 0) {
      const minProteinCalories = minProteinGrams * 4;
      const reducibleProtein = proteinCalories - minProteinCalories;
      const fromProtein = Math.min(remainingDeficit, Math.max(0, reducibleProtein));
      proteinCalories -= fromProtein;
      proteinGrams = proteinCalories / 4;
      carbCalories += fromProtein;
    }
  }

  if (carbCalories < 0) {
    // 総カロリーの再配分（不足が大きい場合）
    const macroTotal = proteinCalories + fatCalories;
    if (macroTotal > 0) {
      const scale = targetCalories / macroTotal;
      proteinCalories *= scale;
      fatCalories *= scale;
      proteinGrams = proteinCalories / 4;
      fatGrams = fatCalories / 9;
    }
    carbCalories = targetCalories - proteinCalories - fatCalories;
  }

  const carbGrams = Math.max(0, carbCalories / 4);

  return {
    targetCalories: clamp(Math.round(targetCalories), 800, 7000),
    maintenanceCalories: Math.round(maintenanceCalories),
    proteinGrams: clamp(Math.round(proteinGrams), 40, 500),
    fatGrams: clamp(Math.round(fatGrams), 20, 300),
    carbGrams: clamp(Math.round(carbGrams), 80, 900),
    method: 'auto',
    meta: {
      bmr: Math.round(bmr),
      activityFactor: context.activityFactor,
      calorieAdjustment: Math.round(adjustment),
      goalFocus,
    },
  };
}
