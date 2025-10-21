const FALLBACK_TIMEZONE = 'UTC';

export function getDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.trim().length > 0) {
      return tz;
    }
  } catch (_error) {
    // Ignore and fall back.
  }
  return FALLBACK_TIMEZONE;
}
