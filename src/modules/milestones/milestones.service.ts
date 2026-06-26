import { getDb } from "@/core/db";
import { qualifyReferral } from "@/modules/gamification/gamification.service";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureWallet, postLedgerEntry } from "@/modules/wallet/wallet.service";
import type { Milestone, MilestoneCreateInput } from "@nilework/schemas";

/** Typed error so routes can map milestone failures to HTTP codes. */
export class MilestoneError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "unprocessable",
    message: string,
  ) {
    super(message);
    this.name = "MilestoneError";
  }
}

const M_COLUMNS = `
  id, order_id, title, amount_usd_minor, sequence, status, delivered_at, released_at,
  created_at, updated_at
`;

interface OrderRow {
  client_id: string;
  freelancer_id: string;
  status: string;
  net_usd_minor: number;
  fx_rate_id: string | null;
}

/** Define milestones on a funded order (client). Amounts must sum to the order net. */
export async function createMilestones(
  orderId: string,
  clientId: string,
  input: MilestoneCreateInput,
): Promise<Milestone[]> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const orders = await tx<OrderRow[]>`
      select client_id, freelancer_id, status, net_usd_minor, fx_rate_id
      from public.orders where id = ${orderId} for update
    `;
    const order = orders[0];
    if (!order) throw new MilestoneError("not_found", "Order not found");
    if (order.client_id !== clientId) throw new MilestoneError("forbidden", "Not your order");
    if (order.status !== "funded") {
      throw new MilestoneError("conflict", "Milestones can only be set on a funded order");
    }

    const existing = await tx<{ c: number }[]>`
      select count(*)::int as c from public.milestones where order_id = ${orderId}
    `;
    if ((existing[0]?.c ?? 0) > 0) {
      throw new MilestoneError("conflict", "Milestones already defined for this order");
    }

    const total = input.milestones.reduce((sum, m) => sum + m.amount_usd_minor, 0);
    if (total !== order.net_usd_minor) {
      throw new MilestoneError("unprocessable", "Milestone amounts must sum to the order net");
    }

    const created: Milestone[] = [];
    for (let i = 0; i < input.milestones.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index is within the validated array.
      const m = input.milestones[i]!;
      const rows = await tx<Milestone[]>`
        insert into public.milestones (order_id, title, amount_usd_minor, sequence)
        values (${orderId}, ${m.title}, ${m.amount_usd_minor}, ${i + 1})
        returning ${tx.unsafe(M_COLUMNS)}
      `;
      // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
      created.push(rows[0]!);
    }
    return created;
  });
}

export async function listMilestones(orderId: string, viewerId: string): Promise<Milestone[]> {
  const sql = getDb();
  const orders = await sql<{ client_id: string; freelancer_id: string }[]>`
    select client_id, freelancer_id from public.orders where id = ${orderId} limit 1
  `;
  const order = orders[0];
  if (!order) throw new MilestoneError("not_found", "Order not found");
  if (order.client_id !== viewerId && order.freelancer_id !== viewerId) {
    throw new MilestoneError("forbidden", "Not your order");
  }
  return sql<Milestone[]>`
    select ${sql.unsafe(M_COLUMNS)} from public.milestones where order_id = ${orderId} order by sequence
  `;
}

/** Freelancer marks a milestone delivered. */
export async function deliverMilestone(
  orderId: string,
  milestoneId: string,
  freelancerId: string,
): Promise<Milestone> {
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    const orders = await tx<OrderRow[]>`
      select client_id, freelancer_id, status, net_usd_minor, fx_rate_id
      from public.orders where id = ${orderId} for update
    `;
    const order = orders[0];
    if (!order) throw new MilestoneError("not_found", "Order not found");
    if (order.freelancer_id !== freelancerId)
      throw new MilestoneError("forbidden", "Not your order");

    const ms = await tx<Milestone[]>`
      select ${tx.unsafe(M_COLUMNS)} from public.milestones
      where id = ${milestoneId} and order_id = ${orderId} for update
    `;
    const m = ms[0];
    if (!m) throw new MilestoneError("not_found", "Milestone not found");
    if (m.status !== "pending") throw new MilestoneError("conflict", `Milestone is ${m.status}`);

    const rows = await tx<Milestone[]>`
      update public.milestones set status = 'delivered', delivered_at = now()
      where id = ${milestoneId} returning ${tx.unsafe(M_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    return { milestone: rows[0]!, clientId: order.client_id };
  });

  await notify(result.clientId, "order_delivered", { order_id: orderId });
  return result.milestone;
}

/** Client releases a delivered milestone: its amount moves pending → available. */
export async function releaseMilestone(
  orderId: string,
  milestoneId: string,
  clientId: string,
): Promise<Milestone> {
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    const orders = await tx<OrderRow[]>`
      select client_id, freelancer_id, status, net_usd_minor, fx_rate_id
      from public.orders where id = ${orderId} for update
    `;
    const order = orders[0];
    if (!order) throw new MilestoneError("not_found", "Order not found");
    if (order.client_id !== clientId) throw new MilestoneError("forbidden", "Not your order");

    const ms = await tx<Milestone[]>`
      select ${tx.unsafe(M_COLUMNS)} from public.milestones
      where id = ${milestoneId} and order_id = ${orderId} for update
    `;
    const m = ms[0];
    if (!m) throw new MilestoneError("not_found", "Milestone not found");
    if (m.status !== "delivered") {
      throw new MilestoneError(
        "conflict",
        `Milestone is ${m.status}, must be delivered to release`,
      );
    }

    const wallet = await ensureWallet(order.freelancer_id);
    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "escrow_release",
        bucket: "pending",
        amountUsdMinor: -m.amount_usd_minor,
        referenceType: "milestone",
        referenceId: m.id,
        fxRateId: order.fx_rate_id,
        memo: "Milestone released (out of hold)",
      },
      tx,
    );
    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "escrow_release",
        bucket: "available",
        amountUsdMinor: m.amount_usd_minor,
        referenceType: "milestone",
        referenceId: m.id,
        fxRateId: order.fx_rate_id,
        memo: "Milestone released (now withdrawable)",
      },
      tx,
    );
    const rows = await tx<Milestone[]>`
      update public.milestones set status = 'released', released_at = now()
      where id = ${milestoneId} returning ${tx.unsafe(M_COLUMNS)}
    `;

    const remaining = await tx<{ c: number }[]>`
      select count(*)::int as c from public.milestones
      where order_id = ${orderId} and status <> 'released'
    `;
    const allReleased = (remaining[0]?.c ?? 0) === 0;
    if (allReleased) {
      await tx`update public.orders set status = 'released', released_at = now() where id = ${orderId}`;
      await tx`
        insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
        values (${orderId}, 'funded', 'released', ${clientId}, 'client', 'All milestones released')
      `;
    }
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    const milestone = rows[0]!;
    return { milestone, allReleased, clientId: order.client_id, freelancerId: order.freelancer_id };
  });

  await notify(result.freelancerId, "order_released", { order_id: orderId });
  if (result.allReleased) {
    await qualifyReferral(result.clientId);
    await qualifyReferral(result.freelancerId);
  }
  return result.milestone;
}
