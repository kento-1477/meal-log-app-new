import postgres from 'postgres';
import { getEnv } from './env.ts';

const connectionString =
  getEnv('SUPABASE_DB_URL', { optional: true }) ||
  getEnv('DATABASE_URL', { optional: true }) ||
  '';

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL or DATABASE_URL must be set for Edge Functions');
}

const sql = postgres(connectionString, {
  ssl: { rejectUnauthorized: false },
  idle_timeout: 20,
  connection: { application_name: 'meal-log-edge' },
  transform: postgres.camel,
});

export type SqlClient = typeof sql;
export type TransactionSql = postgres.TransactionSql<Record<string, unknown>>;

export async function withTransaction<T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(callback);
}

export { sql };
