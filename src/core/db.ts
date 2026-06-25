import postgres from "postgres";
import { env } from "./env";

/**
 * Service-role Postgres connection (MASTER_PLAN §6.6 data-flow rule):
 * the API connects with a privileged connection and is the only writer to
 * money/trust-sensitive tables. RLS remains the security boundary for direct
 * client reads; this connection is used by business-logic mutations.
 *
 * Lazily created so the server can boot before DATABASE_URL is finalized.
 */
let sql: postgres.Sql | undefined;

export function getDb(): postgres.Sql {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!sql) {
    sql = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // compatible with Supabase's transaction pooler
    });
  }
  return sql;
}

export type DbHealth = "ok" | "degraded" | "unconfigured";

export async function checkDbHealth(): Promise<DbHealth> {
  if (!env.DATABASE_URL) return "unconfigured";
  try {
    await getDb()`select 1`;
    return "ok";
  } catch {
    return "degraded";
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
}
