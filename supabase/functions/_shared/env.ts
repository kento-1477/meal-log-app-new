export function getEnv(key: string, options: { optional?: boolean } = {}) {
  const value = Deno.env.get(key);
  if (!value && !options.optional) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value ?? '';
}

export function boolEnv(key: string, defaultValue = false) {
  const raw = Deno.env.get(key);
  if (raw === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}
