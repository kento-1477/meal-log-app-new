import { z } from 'zod';

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
