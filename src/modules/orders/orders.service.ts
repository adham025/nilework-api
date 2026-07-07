import { getDb } from "@/core/db";
import { DomainError } from "@/core/errors";
import { getPublicConfig } from "@/modules/config/config.service";
import { getLatestRate } from "@/modules/fx/fx.service";
import {
  awardAchievement,
  isReferredClientOf,
  qualifyReferral,
} from "@/modules/gamification/gamification.service";
import { freelancerTier, tierCommissionBps, tierHoldDays } from "@/modules/levels/levels.service";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import { checkPromo, recordRedemption } from "@/modules/promo/promo.service";
import { ensureWallet, postLedgerEntry } from "@/modules/wallet/wallet.service";
import type {
  Order,
  OrderDetail,
  OrderEvent,
  OrderListQuery,
  OrderListResponse,
  OrderStatus,
  OrderWithParties,
} from "@nilework/schemas";
import type { TransactionSql } from "postgres";

/** Typed error so routes can map state-machine failures to HTTP codes. */
export class OrderError extends DomainError<"not_found" | "forbidden" | "conflict"> {}

/** The two fields every "is this caller a party to this order" check needs. */
export interface OrderParties {
  client_id: string;
  freelancer_id: string;
}

/** Fetch just the party ids for an order — the minimal read for an ownership check. */
export async function getOrderParties(orderId: string): Promise<OrderParties | null> {
  const sql = getDb();
  const orders = await sql<OrderParties[]>`
    select client_id, freelancer_id from public.orders where id = ${orderId} limit 1
  `;
  return orders[0] ?? null;
}

/**
 * Throw `notFoundCode`/`forbiddenCode` (via the caller's own error class) unless
 * `order` exists and `viewerId` is one of its two parties. Narrows `order` to
 * non-null on return, so callers don't need their own null check afterward.
 * Replaces the identical fetch-then-check block that used to be hand-copied
 * into disputes/milestones/reviews (and any future order-scoped module).
 */
export function assertOrderParty<Code extends string>(
  order: OrderParties | null,
  viewerId: string,
  ErrorCtor: new (code: Code, message: string) => Error,
  notFoundCode: Code,
  forbiddenCode: Code,
): asserts order is OrderParties {
  if (!order) throw new ErrorCtor(notFoundCode, "Order not found");
  if (order.client_id !== viewerId && order.freelancer_id !== viewerId) {
    throw new ErrorCtor(forbiddenCode, "Not your order");
  }
}

const ORDER_COLUMNS = `
  id, client_id, freelancer_id, gig_id, title,
  gross_usd_minor, commission_usd_minor, net_usd_minor, commission_bps,
  fx_rate_id, delivery_days, status, delivered_at, released_at, auto_release_at,
  created_at, updated_at
`;

const PARTY_JSON = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'display_name', ${alias}.display_name, 'avatar_url', ${alias}.avatar_url)`;

/**
 * Split a gross amount into platform commission and freelancer net. Commission is
 * floored (the platform never over-charges by a rounding cent), so net absorbs the
 * remainder and gross = commission + net always holds. Pure + unit-tested.
 */
export function splitCommission(
  grossUsdMinor: number,
  commissionBps: number,
): { commission: number; net: number } {
  const commission = Math.floor((grossUsdMinor * commissionBps) / 10000);
  return { commission, net: grossUsdMinor - commission };
}

export interface NewOrderInput {
  clientId: string;
  freelancerId: string;
  gigId: string | null;
  title: string;
  grossUsdMinor: number;
  deliveryDays: number;
  /** Override the commission rate (e.g. a promo fee_waiver); defaults to app config. */
  commissionBpsOverride?: number;
}

/**
 * Insert a pending_payment order + its opening event inside a caller's transaction,
 * snapshotting the commission rate and FX rate at order time. The single shared
 * order-creation path: a gig purchase (createOrder) and an accepted custom offer
 * (offers.acceptOffer) both go through here, so commission/FX/ledger logic lives once.
 */
export async function insertOrder(tx: Tx, input: NewOrderInput): Promise<Order> {
  const commission_bps = input.commissionBpsOverride ?? (await getPublicConfig()).commission_bps;
  const { commission, net } = splitCommission(input.grossUsdMinor, commission_bps);
  const fx = await getLatestRate();

  const rows = await tx<Order[]>`
    insert into public.orders
      (client_id, freelancer_id, gig_id, title, gross_usd_minor, commission_usd_minor,
       net_usd_minor, commission_bps, fx_rate_id, delivery_days)
    values
      (${input.clientId}, ${input.freelancerId}, ${input.gigId}, ${input.title}, ${input.grossUsdMinor},
       ${commission}, ${net}, ${commission_bps}, ${fx?.id ?? null}, ${input.deliveryDays})
    returning ${tx.unsafe(ORDER_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  const created = rows[0]!;
  await recordEvent(
    tx,
    created.id,
    null,
    "pending_payment",
    input.clientId,
    "client",
    "Order created",
  );
  return created;
}

/** Create an order by purchasing an active gig. Status starts at pending_payment. */
export async function createOrder(
  clientId: string,
  gigId: string,
  promoCode?: string,
): Promise<OrderDetail> {
  const sql = getDb();
  await ensureProfile(clientId);

  const gigs = await sql<
    { freelancer_id: string; title: string; price_usd_minor: number; delivery_days: number }[]
  >`
    select freelancer_id, title, price_usd_minor, delivery_days
    from public.gigs
    where id = ${gigId} and status = 'active'
    limit 1
  `;
  const gig = gigs[0];
  if (!gig) throw new OrderError("not_found", "Gig not found or not available");
  if (gig.freelancer_id === clientId) {
    throw new OrderError("conflict", "You cannot order your own gig");
  }

  // Commission starts from the freelancer's Pro Path tier (§5.3 perk); a fee-waiver
  // promo (§4.4) then reduces it further. BYOC beats both: a client the freelancer
  // brought to the platform themselves always trades with them at 0% commission.
  // All resolved before the tx.
  const baseBps = (await getPublicConfig()).commission_bps;
  const tierBps = tierCommissionBps(await freelancerTier(gig.freelancer_id), baseBps);
  const byoc = await isReferredClientOf(clientId, gig.freelancer_id);

  const order = await sql.begin(async (tx) => {
    let commissionBpsOverride: number | undefined = tierBps !== baseBps ? tierBps : undefined;
    let promoId: string | undefined;
    if (byoc) {
      // Fee already 0 — don't validate/consume a promo code for nothing.
      commissionBpsOverride = 0;
    } else if (promoCode) {
      const res = await checkPromo(tx, promoCode, clientId);
      if (!res.ok) throw new OrderError("conflict", `Promo code not valid: ${res.reason}`);
      if (res.promo.type !== "fee_waiver") {
        throw new OrderError("conflict", "This code can't be applied to an order");
      }
      commissionBpsOverride = Math.max(0, tierBps - res.promo.value);
      promoId = res.promo.id;
    }

    const created = await insertOrder(tx, {
      clientId,
      freelancerId: gig.freelancer_id,
      gigId,
      title: gig.title,
      grossUsdMinor: gig.price_usd_minor,
      deliveryDays: gig.delivery_days,
      ...(commissionBpsOverride !== undefined ? { commissionBpsOverride } : {}),
    });
    if (promoId) await recordRedemption(tx, promoId, clientId, created.id);
    return created;
  });

  await awardAchievement(clientId, "first_order");
  return loadDetail(order.id);
}

/**
 * Fund escrow: credit the freelancer's pending balance with the net amount in the
 * same transaction as the pending_payment → funded status change (§6). Authorization
 * happens at the caller: the verified Paymob webhook (actor role 'system') or the
 * dev-simulation checkout (the order's client). Throws conflict if already funded,
 * which keeps webhook retries idempotent.
 */
export async function fundEscrow(
  orderId: string,
  actor: { id: string | null; role: "client" | "system" },
): Promise<OrderDetail> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    const order = await lockOrder(tx, orderId);
    requireStatus(order, "pending_payment");

    const wallet = await ensureWallet(order.freelancer_id);
    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "escrow_fund",
        bucket: "pending",
        amountUsdMinor: order.net_usd_minor,
        referenceType: "order",
        referenceId: order.id,
        fxRateId: order.fx_rate_id,
        memo: "Escrow funded",
      },
      tx,
    );
    await tx`update public.orders set status = 'funded' where id = ${orderId}`;
    await recordEvent(
      tx,
      orderId,
      "pending_payment",
      "funded",
      actor.id,
      actor.role,
      "Payment confirmed",
    );
  });
  const detail = await loadDetail(orderId);
  await notify(detail.freelancer_id, "order_funded", { order_id: orderId });
  return detail;
}

/** Freelancer marks the order delivered, starting the client review / auto-release window. */
export async function markDelivered(orderId: string, actorId: string): Promise<OrderDetail> {
  const sql = getDb();
  const baseDays = (await getPublicConfig()).payout_hold_days;
  // Pro Path perk (§5.3): higher tiers get a shorter review/auto-release window.
  const holdDays = tierHoldDays(await freelancerTier(actorId), baseDays);
  await sql.begin(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.freelancer_id !== actorId) throw new OrderError("forbidden", "Not your order");
    requireStatus(order, "funded");

    const ms = await tx<{ one: number }[]>`
      select 1 as one from public.milestones where order_id = ${orderId} limit 1
    `;
    if (ms.length > 0) {
      throw new OrderError("conflict", "This order uses milestones — deliver them individually");
    }

    await tx`
      update public.orders
      set status = 'delivered',
          delivered_at = now(),
          auto_release_at = now() + (${holdDays} || ' days')::interval
      where id = ${orderId}
    `;
    await recordEvent(tx, orderId, "funded", "delivered", actorId, "freelancer", "Work delivered");
  });
  const detail = await loadDetail(orderId);
  await notify(detail.client_id, "order_delivered", { order_id: orderId });
  await awardAchievement(detail.freelancer_id, "first_delivery");
  return detail;
}

/**
 * Release escrow to the freelancer: move net from pending → available (two ledger
 * entries) and mark the order released — all atomic. Callable by the client, or by
 * the settle-holds sweep once the review window lapses (actorRole 'system').
 */
export async function releaseEscrow(
  orderId: string,
  actorId: string | null,
  actorRole: "client" | "system",
): Promise<OrderDetail> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (actorRole === "client" && order.client_id !== actorId) {
      throw new OrderError("forbidden", "Not your order");
    }
    requireStatus(order, "delivered");

    const wallet = await ensureWallet(order.freelancer_id);
    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "escrow_release",
        bucket: "pending",
        amountUsdMinor: -order.net_usd_minor,
        referenceType: "order",
        referenceId: order.id,
        fxRateId: order.fx_rate_id,
        memo: "Escrow released (out of hold)",
      },
      tx,
    );
    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "escrow_release",
        bucket: "available",
        amountUsdMinor: order.net_usd_minor,
        referenceType: "order",
        referenceId: order.id,
        fxRateId: order.fx_rate_id,
        memo: "Escrow released (now withdrawable)",
      },
      tx,
    );
    await tx`update public.orders set status = 'released', released_at = now() where id = ${orderId}`;
    await recordEvent(
      tx,
      orderId,
      "delivered",
      "released",
      actorId,
      actorRole,
      actorRole === "system" ? "Auto-released after review window" : "Client released payment",
    );
  });
  const detail = await loadDetail(orderId);
  await notify(detail.freelancer_id, "order_released", { order_id: orderId });
  // A completed order qualifies a pending referral on either side (§5.3).
  await qualifyReferral(detail.client_id);
  await qualifyReferral(detail.freelancer_id);
  return detail;
}

/** Client cancels an order that was never funded. No money has moved, so no ledger entry. */
export async function cancelOrder(orderId: string, actorId: string): Promise<OrderDetail> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.client_id !== actorId) throw new OrderError("forbidden", "Not your order");
    requireStatus(order, "pending_payment");
    await tx`update public.orders set status = 'cancelled' where id = ${orderId}`;
    await recordEvent(
      tx,
      orderId,
      "pending_payment",
      "cancelled",
      actorId,
      "client",
      "Order cancelled",
    );
  });
  return loadDetail(orderId);
}

/**
 * Settle-holds sweep (worker): auto-release every delivered order whose review
 * window has lapsed. Each release is its own transaction, so one failure can't
 * block the rest. Returns the number released.
 */
export async function settleHolds(): Promise<number> {
  const sql = getDb();
  const due = await sql<{ id: string }[]>`
    select id from public.orders
    where status = 'delivered' and auto_release_at is not null and auto_release_at <= now()
    order by auto_release_at
    limit 200
  `;
  let released = 0;
  for (const { id } of due) {
    try {
      await releaseEscrow(id, null, "system");
      released++;
    } catch {
      // Skip and let the next sweep retry; never let one bad row stall the batch.
    }
  }
  return released;
}

export async function listMyOrders(
  viewerId: string,
  query: OrderListQuery,
): Promise<OrderListResponse> {
  const sql = getDb();
  const { limit } = query;
  const roleFilter =
    query.role === "client"
      ? sql`o.client_id = ${viewerId}`
      : query.role === "freelancer"
        ? sql`o.freelancer_id = ${viewerId}`
        : sql`(o.client_id = ${viewerId} or o.freelancer_id = ${viewerId})`;

  const rows = await sql<OrderWithParties[]>`
    select
      ${sql.unsafe(prefixed(ORDER_COLUMNS, "o"))},
      ${sql.unsafe(PARTY_JSON("c"))} as client,
      ${sql.unsafe(PARTY_JSON("f"))} as freelancer
    from public.orders o
    join public.profiles c on c.id = o.client_id
    join public.profiles f on f.id = o.freelancer_id
    where ${roleFilter}
      ${query.cursor ? sql`and o.created_at < ${query.cursor}` : sql``}
    order by o.created_at desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

/** Party-scoped order detail with the full event timeline. */
export async function getOrder(orderId: string, viewerId: string): Promise<OrderDetail> {
  const detail = await loadDetail(orderId);
  if (detail.client_id !== viewerId && detail.freelancer_id !== viewerId) {
    throw new OrderError("not_found", "Order not found");
  }
  return detail;
}

// --- internals -------------------------------------------------------------

type Tx = TransactionSql;

function prefixed(columns: string, alias: string): string {
  return columns
    .split(",")
    .map((c) => `${alias}.${c.trim()}`)
    .join(", ");
}

function requireStatus(order: Order, expected: OrderStatus): void {
  if (order.status !== expected) {
    throw new OrderError("conflict", `Order is ${order.status}, expected ${expected}`);
  }
}

async function lockOrder(tx: Tx, orderId: string): Promise<Order> {
  const rows = await tx<Order[]>`
    select ${tx.unsafe(ORDER_COLUMNS)} from public.orders where id = ${orderId} for update
  `;
  const order = rows[0];
  if (!order) throw new OrderError("not_found", "Order not found");
  return order;
}

async function recordEvent(
  tx: Tx,
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  actorId: string | null,
  actorRole: "client" | "freelancer" | "system",
  note: string,
): Promise<void> {
  await tx`
    insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
    values (${orderId}, ${fromStatus}, ${toStatus}, ${actorId}, ${actorRole}, ${note})
  `;
}

async function loadDetail(orderId: string): Promise<OrderDetail> {
  const sql = getDb();
  const rows = await sql<OrderWithParties[]>`
    select
      ${sql.unsafe(prefixed(ORDER_COLUMNS, "o"))},
      ${sql.unsafe(PARTY_JSON("c"))} as client,
      ${sql.unsafe(PARTY_JSON("f"))} as freelancer
    from public.orders o
    join public.profiles c on c.id = o.client_id
    join public.profiles f on f.id = o.freelancer_id
    where o.id = ${orderId}
    limit 1
  `;
  const order = rows[0];
  if (!order) throw new OrderError("not_found", "Order not found");

  const events = await sql<OrderEvent[]>`
    select id, order_id, from_status, to_status, actor_id, actor_role, note, created_at
    from public.order_events
    where order_id = ${orderId}
    order by created_at
  `;
  return { ...order, events };
}
