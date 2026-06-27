import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { Subscription } from "@nilework/schemas";

const PERIOD_DAYS = 30;

export async function getMySubscription(profileId: string): Promise<Subscription> {
  const sql = getDb();
  const rows = await sql<{ status: "active" | "expired"; current_period_end: string }[]>`
    select status, current_period_end from public.subscriptions where profile_id = ${profileId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  // Reflect expiry without a background job: a lapsed window reads as expired.
  const active = row.status === "active" && new Date(row.current_period_end).getTime() > Date.now();
  return {
    plan: "pro",
    status: active ? "active" : "expired",
    current_period_end: row.current_period_end,
  };
}

/** True when the profile has an active Pro window. */
export async function isPro(profileId: string): Promise<boolean> {
  const sub = await getMySubscription(profileId);
  return sub?.status === "active";
}

/**
 * Activate (or extend) Pro for 30 days. NOTE: in production this must be called by
 * a verified Paymob payment webhook — here it activates directly so the value-add
 * tier is usable in dev, exactly like the order-checkout dev simulation. Recurring
 * billing (dunning/proration) is deferred until live Paymob (§5.1).
 */
export async function activatePro(profileId: string): Promise<Subscription> {
  await ensureProfile(profileId);
  const sql = getDb();
  await sql`
    insert into public.subscriptions (profile_id, plan, status, current_period_end)
    values (${profileId}, 'pro', 'active', now() + (${PERIOD_DAYS} || ' days')::interval)
    on conflict (profile_id) do update set
      status = 'active',
      current_period_end =
        greatest(now(), public.subscriptions.current_period_end) + (${PERIOD_DAYS} || ' days')::interval
  `;
  // biome-ignore lint/style/noNonNullAssertion: just upserted an active row.
  return (await getMySubscription(profileId))!;
}
