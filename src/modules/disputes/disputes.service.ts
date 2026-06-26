import { getDb } from "@/core/db";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureWallet, postLedgerEntry } from "@/modules/wallet/wallet.service";
import type { Dispute, DisputeResolution } from "@nilework/schemas";
import type { TransactionSql } from "postgres";

/** Typed error so routes can map dispute failures to HTTP codes. */
export class DisputeError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "DisputeError";
  }
}

const DISPUTE_COLUMNS = `
  id, order_id, opened_by, opener_role, reason, status, resolution,
  resolution_note, resolved_at, created_at, updated_at
`;

interface OrderRow {
  client_id: string;
  freelancer_id: string;
  status: string;
  net_usd_minor: number;
  fx_rate_id: string | null;
}

async function recordOrderEvent(
  tx: TransactionSql,
  orderId: string,
  from: string,
  to: string,
  actorId: string | null,
  actorRole: "client" | "freelancer" | "system",
  note: string,
): Promise<void> {
  await tx`
    insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
    values (${orderId}, ${from}, ${to}, ${actorId}, ${actorRole}, ${note})
  `;
}

/** Open a dispute on a funded/delivered order; moves it to 'disputed' (pauses auto-release). */
export async function openDispute(
  orderId: string,
  userId: string,
  reason: string,
): Promise<Dispute> {
  const sql = getDb();
  const dispute = await sql.begin(async (tx) => {
    const orders = await tx<OrderRow[]>`
      select client_id, freelancer_id, status, net_usd_minor, fx_rate_id
      from public.orders where id = ${orderId} for update
    `;
    const order = orders[0];
    if (!order) throw new DisputeError("not_found", "Order not found");
    const isClient = order.client_id === userId;
    const isFreelancer = order.freelancer_id === userId;
    if (!isClient && !isFreelancer) throw new DisputeError("forbidden", "Not your order");
    if (order.status !== "funded" && order.status !== "delivered") {
      throw new DisputeError("conflict", `Cannot dispute an order that is ${order.status}`);
    }

    const rows = await tx<Dispute[]>`
      insert into public.disputes (order_id, opened_by, opener_role, reason)
      values (${orderId}, ${userId}, ${isClient ? "client" : "freelancer"}, ${reason})
      returning ${tx.unsafe(DISPUTE_COLUMNS)}
    `;
    await tx`update public.orders set status = 'disputed' where id = ${orderId}`;
    await recordOrderEvent(
      tx,
      orderId,
      order.status,
      "disputed",
      userId,
      isClient ? "client" : "freelancer",
      "Dispute opened",
    );
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    return { dispute: rows[0]!, counterparty: isClient ? order.freelancer_id : order.client_id };
  });

  await notify(dispute.counterparty, "dispute_opened", { order_id: orderId });
  return dispute.dispute;
}

/** Party-scoped fetch of an order's dispute (or null). */
export async function getDisputeForOrder(orderId: string, userId: string): Promise<Dispute | null> {
  const sql = getDb();
  const orders = await sql<{ client_id: string; freelancer_id: string }[]>`
    select client_id, freelancer_id from public.orders where id = ${orderId} limit 1
  `;
  const order = orders[0];
  if (!order) throw new DisputeError("not_found", "Order not found");
  if (order.client_id !== userId && order.freelancer_id !== userId) {
    throw new DisputeError("forbidden", "Not your order");
  }
  const rows = await sql<Dispute[]>`
    select ${sql.unsafe(DISPUTE_COLUMNS)} from public.disputes where order_id = ${orderId} limit 1
  `;
  return rows[0] ?? null;
}

// --- staff -----------------------------------------------------------------

export async function listOpenDisputes(): Promise<Dispute[]> {
  const sql = getDb();
  return sql<Dispute[]>`
    select ${sql.unsafe(DISPUTE_COLUMNS)} from public.disputes
    where status = 'open' order by created_at limit 200
  `;
}

/**
 * Resolve a dispute: release escrow to the freelancer (pending → available) or
 * refund the client (remove the freelancer's pending hold) — atomic with the order
 * status change. Client refund disbursement itself is an off-platform/Paymob step.
 */
export async function resolveDispute(
  disputeId: string,
  staffId: string,
  resolution: DisputeResolution,
  note: string,
): Promise<Dispute> {
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    const disputes = await tx<{ id: string; order_id: string; status: string }[]>`
      select id, order_id, status from public.disputes where id = ${disputeId} for update
    `;
    const dispute = disputes[0];
    if (!dispute) throw new DisputeError("not_found", "Dispute not found");
    if (dispute.status !== "open") throw new DisputeError("conflict", "Dispute already resolved");

    const orders = await tx<OrderRow[]>`
      select client_id, freelancer_id, status, net_usd_minor, fx_rate_id
      from public.orders where id = ${dispute.order_id} for update
    `;
    // biome-ignore lint/style/noNonNullAssertion: dispute references a real order.
    const order = orders[0]!;
    const wallet = await ensureWallet(order.freelancer_id);

    if (resolution === "release") {
      await postLedgerEntry(
        {
          walletId: wallet.id,
          entryType: "escrow_release",
          bucket: "pending",
          amountUsdMinor: -order.net_usd_minor,
          referenceType: "order",
          referenceId: dispute.order_id,
          fxRateId: order.fx_rate_id,
          memo: "Dispute resolved — released",
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
          referenceId: dispute.order_id,
          fxRateId: order.fx_rate_id,
          memo: "Dispute resolved — now withdrawable",
        },
        tx,
      );
      await tx`update public.orders set status = 'released', released_at = now() where id = ${dispute.order_id}`;
      await recordOrderEvent(
        tx,
        dispute.order_id,
        "disputed",
        "released",
        staffId,
        "system",
        "Dispute resolved: released",
      );
    } else {
      await postLedgerEntry(
        {
          walletId: wallet.id,
          entryType: "escrow_refund",
          bucket: "pending",
          amountUsdMinor: -order.net_usd_minor,
          referenceType: "order",
          referenceId: dispute.order_id,
          fxRateId: order.fx_rate_id,
          memo: "Dispute resolved — refunded",
        },
        tx,
      );
      await tx`update public.orders set status = 'refunded' where id = ${dispute.order_id}`;
      await recordOrderEvent(
        tx,
        dispute.order_id,
        "disputed",
        "refunded",
        staffId,
        "system",
        "Dispute resolved: refunded",
      );
    }

    const updated = await tx<Dispute[]>`
      update public.disputes
      set status = 'resolved', resolution = ${resolution}, resolution_note = ${note},
          resolved_by = ${staffId}, resolved_at = now()
      where id = ${disputeId}
      returning ${tx.unsafe(DISPUTE_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    return { dispute: updated[0]!, clientId: order.client_id, freelancerId: order.freelancer_id };
  });

  await notify(result.clientId, "dispute_resolved", { order_id: result.dispute.order_id });
  await notify(result.freelancerId, "dispute_resolved", { order_id: result.dispute.order_id });
  return result.dispute;
}
