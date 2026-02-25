export type ReportUiVariant = 'v1' | 'v2-smart-pro';

export function normalizeRolloutPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function stableBucketFromUserId(userId: number) {
  // Knuth multiplicative hash for deterministic and evenly distributed buckets.
  const hash = (Math.imul(userId >>> 0, 2654435761) >>> 0) % 100;
  return hash;
}

export function resolveReportUiVariant(input: {
  userId: number | null;
  enabled: boolean;
  rolloutPercent: number;
}): { variant: ReportUiVariant; userBucket: number | null } {
  const percent = normalizeRolloutPercent(input.rolloutPercent);
  if (!input.enabled || percent <= 0 || typeof input.userId !== 'number') {
    return { variant: 'v1', userBucket: typeof input.userId === 'number' ? stableBucketFromUserId(input.userId) : null };
  }

  const bucket = stableBucketFromUserId(input.userId);
  return {
    variant: bucket < percent ? 'v2-smart-pro' : 'v1',
    userBucket: bucket,
  };
}
