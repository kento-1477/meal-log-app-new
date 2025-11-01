import type { MeasurementSystem } from '@meal-log/shared';

export function kgToLbs(kg: number) {
  return kg * 2.20462;
}

export function lbsToKg(lbs: number) {
  return lbs / 2.20462;
}

export function cmToFeetInches(cm: number) {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return { feet, inches } as const;
}

export function feetInchesToCm(feet: number, inches: number) {
  const totalInches = feet * 12 + inches;
  return totalInches * 2.54;
}

export function formatWeight(valueKg: number | null | undefined, unit: MeasurementSystem, fractionDigits = 1) {
  if (valueKg == null) return '';
  if (unit === 'IMPERIAL') {
    return roundTo(kgToLbs(valueKg), fractionDigits).toString();
  }
  return roundTo(valueKg, fractionDigits).toString();
}

export function parseWeightInput(text: string, unit: MeasurementSystem) {
  const numeric = Number(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return unit === 'IMPERIAL' ? lbsToKg(numeric) : numeric;
}

export function roundTo(value: number, fractionDigits = 1) {
  const power = 10 ** fractionDigits;
  return Math.round(value * power) / power;
}

export function formatHeight(valueCm: number | null | undefined, unit: MeasurementSystem) {
  if (valueCm == null) return '';
  if (unit === 'IMPERIAL') {
    const { feet, inches } = cmToFeetInches(valueCm);
    return `${feet}'${roundTo(inches, 0)}"`;
  }
  return `${roundTo(valueCm, 0)}`;
}

export function parseHeightInput(params: { feet?: string; inches?: string; centimeters?: string }, unit: MeasurementSystem) {
  if (unit === 'IMPERIAL') {
    const feet = Number(params.feet ?? '0');
    const inches = Number(params.inches ?? '0');
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      return null;
    }
    return feetInchesToCm(feet, inches);
  }
  const centimeters = Number(params.centimeters ?? '0');
  if (!Number.isFinite(centimeters)) {
    return null;
  }
  return centimeters;
}
