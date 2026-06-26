import { getDb } from "@/core/db";
import { env } from "@/core/env";
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

/** Append a new FX snapshot (append-only history — §6). */
export async function recordFxRate(
  rate: number,
  source: string,
  base: Currency = "USD",
  quote: Currency = "EGP",
): Promise<void> {
  const sql = getDb();
  await sql`
    insert into public.fx_rates (base_currency, quote_currency, rate, source)
    values (${base}, ${quote}, ${rate}, ${source})
  `;
}

/**
 * Pull a live USD→EGP rate from the configured feed and record it (the worker's
 * scheduled job — replaces the placeholder seed, §6). Best-effort: a feed failure
 * is logged, never thrown, so the cron keeps running. Tolerates two common shapes:
 * `{ rate }` and `{ rates: { EGP } }` (e.g. exchangerate.host).
 */
export async function refreshFxRate(): Promise<void> {
  if (!env.FX_API_URL) {
    console.log("fx-refresh: FX_API_URL not set — skipping");
    return;
  }
  try {
    const res = await fetch(env.FX_API_URL, {
      headers: env.FX_API_KEY ? { Authorization: `Bearer ${env.FX_API_KEY}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`fx feed responded ${res.status}`);
    const data = (await res.json()) as { rate?: number; rates?: Record<string, number> };
    const rate = data.rate ?? data.rates?.EGP;
    if (!rate || rate <= 0) throw new Error("fx feed had no positive EGP rate");
    await recordFxRate(rate, "live");
    console.log(`fx-refresh: recorded USD->EGP ${rate}`);
  } catch (err) {
    console.error("fx-refresh failed:", err);
  }
}
