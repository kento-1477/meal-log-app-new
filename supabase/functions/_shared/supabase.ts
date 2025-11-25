import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.ts';

const supabaseUrl = getEnv('SUPABASE_URL');
// Allow both the recommended SERVICE_ROLE_KEY and the older SUPABASE_SERVICE_ROLE_KEY for compatibility
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', { optional: true }) || getEnv('SERVICE_ROLE_KEY');

// Service role client for Edge Functions (no session persistence needed)
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': 'meal-log-edge' },
  },
});
