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
  };
};

interface PlanComputationContext {
  gender: Gender;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityFactor: number;
  planIntensity: PlanIntensity;
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

  return {
    gender,
    age,
    heightCm,
    currentWeightKg,
    targetWeightKg,
    activityFactor,
    planIntensity: input.planIntensity,
  };
}

export function calculateBasalMetabolicRate(context: PlanComputationContext) {
  const coef = resolveGenderCoefficient(context.gender);
  return 10 * context.currentWeightKg + 6.25 * context.heightCm - 5 * context.age + coef;
}

function determineCalorieAdjustment(context: PlanComputationContext, maintenance: number) {
  const weightDelta = context.targetWeightKg - context.currentWeightKg;
  if (Math.abs(weightDelta) < 0.1) {
    return 0;
  }
  const table = weightDelta < 0 ? PLAN_INTENSITY_DEFICIT : PLAN_INTENSITY_SURPLUS;
  const adjustment = table[context.planIntensity];
  // 調整幅はメンテナンスの40%を超えないようにする
  const maxAdjustment = maintenance * 0.4;
  return Math.sign(weightDelta) * Math.min(adjustment, maxAdjustment);
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
  const proteinFactor = weightDelta > 0.5 ? 2.2 : weightDelta < -0.5 ? 2 : 1.8;
  const minProteinFactor = 1.4;
  const maxProteinCaloriesRatio = 0.35;

  const baseProteinGrams = context.currentWeightKg * proteinFactor;
  const minProteinGrams = context.currentWeightKg * minProteinFactor;
  const maxProteinGrams = (targetCalories * maxProteinCaloriesRatio) / 4;
  let proteinGrams = clamp(baseProteinGrams, minProteinGrams, maxProteinGrams);
  proteinGrams = clamp(proteinGrams, 60, 220);
  let proteinCalories = proteinGrams * 4;

  const minFatCalories = targetCalories * 0.2;
  const preferredFatCalories = targetCalories * 0.25;
  const maxFatCalories = targetCalories * 0.3;
  let fatCalories = clamp(preferredFatCalories, minFatCalories, maxFatCalories);
  let fatGrams = fatCalories / 9;

  let carbCalories = targetCalories - proteinCalories - fatCalories;
  const minCarbCalories = 100 * 4;

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
    targetCalories: Math.round(targetCalories),
    maintenanceCalories: Math.round(maintenanceCalories),
    proteinGrams: Math.round(proteinGrams),
    fatGrams: Math.round(fatGrams),
    carbGrams: Math.round(carbGrams),
    method: 'auto',
    meta: {
      bmr: Math.round(bmr),
      activityFactor: context.activityFactor,
      calorieAdjustment: Math.round(adjustment),
    },
  };
}
