export const DASHBOARD_TIMEZONE = process.env.DASHBOARD_TIMEZONE ?? 'Asia/Tokyo';

// Default daily targets. Will be user-specific in the future.
export const DASHBOARD_TARGETS = {
  calories: { unit: 'kcal', value: 2200, decimals: 0 },
  protein_g: { unit: 'g', value: 130, decimals: 1 },
  fat_g: { unit: 'g', value: 70, decimals: 1 },
  carbs_g: { unit: 'g', value: 260, decimals: 1 },
};

export const DASHBOARD_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
