import { getDb } from "@/core/db";
import type { PublicConfig } from "@nilework/schemas";

/** Defaults mirror the 0003 migration seed, so the API still answers if a row is absent. */
const DEFAULTS: PublicConfig = {
  commission_bps: 1000,
  min_withdrawal_usd_minor: 1000,
  payout_hold_days: 3,
};

const PUBLIC_KEYS = Object.keys(DEFAULTS);

/** The publicly safe subset of app_config — drives transparent fee display (§1, §2). */
export async function getPublicConfig(): Promise<PublicConfig> {
  const sql = getDb();
  const rows = await sql<{ key: string; value: number }[]>`
    select key, (value #>> '{}')::int as value
    from public.app_config
    where key in ${sql(PUBLIC_KEYS)}
  `;
  const found = new Map(rows.map((row) => [row.key, row.value]));
  return {
    commission_bps: found.get("commission_bps") ?? DEFAULTS.commission_bps,
    min_withdrawal_usd_minor:
      found.get("min_withdrawal_usd_minor") ?? DEFAULTS.min_withdrawal_usd_minor,
    payout_hold_days: found.get("payout_hold_days") ?? DEFAULTS.payout_hold_days,
  };
}
