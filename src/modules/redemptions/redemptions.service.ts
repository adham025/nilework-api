import { getDb } from "@/core/db";
import type { CatalogItem } from "@nilework/schemas";

/** Typed error so routes can map redemption failures to HTTP codes. */
export class RedemptionError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "bad_request",
    message: string,
  ) {
    super(message);
    this.name = "RedemptionError";
  }
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const sql = getDb();
  return sql<CatalogItem[]>`
    select key, title_en, title_ar, cost_points, kind
    from public.redemption_catalog where is_active = true order by cost_points
  `;
}

/**
 * Redeem a reward: append a negative points entry and apply the reward effect in
 * one transaction. Balance is summed inside the tx and must cover the cost (points
 * are status, not money, so a rare race here is low-stakes). Returns remaining points.
 */
export async function redeem(
  profileId: string,
  catalogKey: string,
  gigId: string | undefined,
): Promise<{ ok: boolean; remaining_points: number }> {
  const sql = getDb();
  const items = await sql<{ key: string; cost_points: number; kind: string }[]>`
    select key, cost_points, kind from public.redemption_catalog
    where key = ${catalogKey} and is_active = true limit 1
  `;
  const item = items[0];
  if (!item) throw new RedemptionError("not_found", "Reward not found");
  if (item.kind === "featured_gig" && !gigId) {
    throw new RedemptionError("bad_request", "A gig is required for this reward");
  }

  return sql.begin(async (tx) => {
    const balanceRows = await tx<{ balance: number }[]>`
      select coalesce(sum(points), 0)::int as balance from public.points_ledger
      where profile_id = ${profileId}
    `;
    const balance = balanceRows[0]?.balance ?? 0;
    if (balance < item.cost_points) {
      throw new RedemptionError("conflict", "Not enough points");
    }

    if (item.kind === "featured_gig" && gigId) {
      const gigs = await tx<{ freelancer_id: string }[]>`
        select freelancer_id from public.gigs where id = ${gigId} for update
      `;
      const gig = gigs[0];
      if (!gig) throw new RedemptionError("not_found", "Gig not found");
      if (gig.freelancer_id !== profileId) throw new RedemptionError("forbidden", "Not your gig");
      // Extend from the later of now or any existing window.
      await tx`
        update public.gigs
        set featured_until = greatest(now(), coalesce(featured_until, now())) + interval '7 days'
        where id = ${gigId}
      `;
    }

    const redemptionRows = await tx<{ id: string }[]>`
      insert into public.redemptions (profile_id, catalog_key, cost_points, reference_id)
      values (${profileId}, ${item.key}, ${item.cost_points}, ${gigId ?? null})
      returning id
    `;
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    const redemptionId = redemptionRows[0]!.id;
    await tx`
      insert into public.points_ledger (profile_id, points, reason, reference_type, reference_id)
      values (${profileId}, ${-item.cost_points}, ${`redeem:${item.key}`}, 'redemption', ${redemptionId})
    `;

    return { ok: true, remaining_points: balance - item.cost_points };
  });
}
