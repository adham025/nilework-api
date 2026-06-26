import { getDb } from "@/core/db";
import type { Currency, FxRate } from "@nilework/schemas";

/**
 * Latest FX snapshot for a currency pair, or null if none recorded yet. rate is
 * cast to float8 so it returns as a JS number (numeric would arrive as a string).
 */
export async function getLatestRate(
  base: Currency = "USD",
  quote: Currency = "EGP",
): Promise<FxRate | null> {
  const sql = getDb();
  const rows = await sql<FxRate[]>`
    select id, base_currency, quote_currency, rate::float8 as rate, source, captured_at
    from public.fx_rates
    where base_currency = ${base} and quote_currency = ${quote}
    order by captured_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

/** Convert a USD minor amount to a settlement-currency minor estimate at a rate. */
export function estimateMinor(usdMinor: number, rate: number): number {
  return Math.round(usdMinor * rate);
}
