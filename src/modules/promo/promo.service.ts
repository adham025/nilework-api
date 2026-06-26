import { getDb } from "@/core/db";
import { grantPoints } from "@/modules/gamification/gamification.service";
import { notify } from "@/modules/notifications/notifications.service";
import type { PromoCode, PromoCreateInput, PromoValidation } from "@nilework/schemas";
import type { Sql, TransactionSql } from "postgres";

/** Typed error so routes can map promo failures to HTTP codes. */
export class PromoError extends Error {
  constructor(
    public code: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PromoError";
  }
}

const PROMO_COLUMNS = `
  id, code, type, value, max_redemptions, redeemed_count, per_user_limit,
  starts_at, expires_at, is_active, created_at
`;

type Db = Sql | TransactionSql;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

type CheckResult = { ok: true; promo: PromoCode } | { ok: false; reason: string };

/**
 * Validate a code for a user against a connection (pool or transaction): active,
 * within its window, global cap not hit, and the user is under their per-user limit.
 */
export async function checkPromo(db: Db, code: string, userId: string): Promise<CheckResult> {
  const rows = await db<PromoCode[]>`
    select ${db.unsafe(PROMO_COLUMNS)} from public.promo_codes where code = ${normalizeCode(code)} limit 1
  `;
  const promo = rows[0];
  if (!promo) return { ok: false, reason: "not_found" };

  const now = Date.now();
  if (!promo.is_active) return { ok: false, reason: "inactive" };
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
    return { ok: false, reason: "not_started" };
  }
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
    return { ok: false, reason: "expired" };
  }
  if (promo.max_redemptions !== null && promo.redeemed_count >= promo.max_redemptions) {
    return { ok: false, reason: "exhausted" };
  }

  const used = await db<{ c: number }[]>`
    select count(*)::int as c from public.promo_redemptions
    where promo_code_id = ${promo.id} and user_id = ${userId}
  `;
  if ((used[0]?.c ?? 0) >= promo.per_user_limit) return { ok: false, reason: "already_used" };

  return { ok: true, promo };
}

/** Lightweight validity for the checkout/redeem UI. */
export async function validatePromo(code: string, userId: string): Promise<PromoValidation> {
  const res = await checkPromo(getDb(), code, userId);
  if (!res.ok) return { valid: false, type: null, value: null, reason: res.reason };
  return { valid: true, type: res.promo.type, value: res.promo.value, reason: null };
}

/** Record a redemption + bump the global count (within a transaction). */
export async function recordRedemption(
  tx: TransactionSql,
  promoId: string,
  userId: string,
  orderId: string | null,
): Promise<void> {
  await tx`
    insert into public.promo_redemptions (promo_code_id, user_id, order_id)
    values (${promoId}, ${userId}, ${orderId})
  `;
  await tx`update public.promo_codes set redeemed_count = redeemed_count + 1 where id = ${promoId}`;
}

/** Redeem a points-type code: grant points once, atomically. */
export async function redeemPoints(
  userId: string,
  code: string,
): Promise<{ ok: boolean; points_awarded: number }> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const res = await checkPromo(tx, code, userId);
    if (!res.ok) throw new PromoError("conflict", `Code not valid: ${res.reason}`);
    if (res.promo.type !== "points") {
      throw new PromoError("conflict", "This code is applied at checkout, not redeemed here");
    }
    await recordRedemption(tx, res.promo.id, userId, null);
    await grantPoints(userId, res.promo.value, `promo:${res.promo.code}`, "promo", res.promo.id);
    await notify(userId, "promo_redeemed", { points: res.promo.value });
    return { ok: true, points_awarded: res.promo.value };
  });
}

// --- staff -----------------------------------------------------------------

export async function createPromo(input: PromoCreateInput): Promise<PromoCode> {
  const sql = getDb();
  const rows = await sql<PromoCode[]>`
    insert into public.promo_codes (code, type, value, max_redemptions, per_user_limit, expires_at)
    values (${normalizeCode(input.code)}, ${input.type}, ${input.value},
            ${input.max_redemptions ?? null}, ${input.per_user_limit}, ${input.expires_at ?? null})
    returning ${sql.unsafe(PROMO_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return rows[0]!;
}

export async function listPromos(): Promise<PromoCode[]> {
  const sql = getDb();
  return sql<PromoCode[]>`
    select ${sql.unsafe(PROMO_COLUMNS)} from public.promo_codes order by created_at desc limit 200
  `;
}
