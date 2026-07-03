import { getDb } from "@/core/db";
import { getLatestRate } from "@/modules/fx/fx.service";

/**
 * Financial reconciliation summary (admin-ops-portal-phase1) — the finance
 * view over the escrow engine. Definitions are deliberate and documented:
 *
 * - GMV: gross of every order that actually reached funding (funded,
 *   delivered, released, refunded, disputed) — money that moved through the
 *   platform. pending_payment/cancelled never funded, so they don't count.
 * - Platform revenue: commission on RELEASED orders only — revenue is earned
 *   when escrow releases, not before.
 * - Pending escrow: gross currently held (funded, delivered, disputed) —
 *   the platform's escrow liability right now.
 * - Pending payouts: requested + processing payout volume — cash owed to
 *   freelancers that hasn't left yet.
 *
 * All USD minor units (§8: USD canonical); the latest FX snapshot is included
 * so the UI can show EGP context without a second call.
 */
export interface FinancialSummary {
  gmv_usd_minor: number;
  gmv_order_count: number;
  revenue_usd_minor: number;
  released_order_count: number;
  pending_escrow_usd_minor: number;
  pending_escrow_order_count: number;
  refunded_usd_minor: number;
  refunded_order_count: number;
  pending_payouts_usd_minor: number;
  pending_payout_count: number;
  paid_payouts_usd_minor: number;
  paid_payout_count: number;
  orders_by_status: Record<string, number>;
  fx_rate: number | null;
  fx_captured_at: string | null;
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const sql = getDb();

  const [orderAgg, statusRows, payoutAgg, fx] = await Promise.all([
    sql<
      {
        gmv: string;
        gmv_count: string;
        revenue: string;
        released_count: string;
        pending_escrow: string;
        pending_escrow_count: string;
        refunded: string;
        refunded_count: string;
      }[]
    >`
      select
        coalesce(sum(gross_usd_minor) filter (where status in ('funded','delivered','released','refunded','disputed')), 0) as gmv,
        count(*) filter (where status in ('funded','delivered','released','refunded','disputed')) as gmv_count,
        coalesce(sum(commission_usd_minor) filter (where status = 'released'), 0) as revenue,
        count(*) filter (where status = 'released') as released_count,
        coalesce(sum(gross_usd_minor) filter (where status in ('funded','delivered','disputed')), 0) as pending_escrow,
        count(*) filter (where status in ('funded','delivered','disputed')) as pending_escrow_count,
        coalesce(sum(gross_usd_minor) filter (where status = 'refunded'), 0) as refunded,
        count(*) filter (where status = 'refunded') as refunded_count
      from public.orders
    `,
    sql<{ status: string; n: string }[]>`
      select status, count(*) as n from public.orders group by status
    `,
    sql<
      {
        pending: string;
        pending_count: string;
        paid: string;
        paid_count: string;
      }[]
    >`
      select
        coalesce(sum(amount_usd_minor) filter (where status in ('requested','processing')), 0) as pending,
        count(*) filter (where status in ('requested','processing')) as pending_count,
        coalesce(sum(amount_usd_minor) filter (where status = 'paid'), 0) as paid,
        count(*) filter (where status = 'paid') as paid_count
      from public.payouts
    `,
    getLatestRate("USD", "EGP"),
  ]);

  // biome-ignore lint/style/noNonNullAssertion: aggregate queries always yield one row.
  const o = orderAgg[0]!;
  // biome-ignore lint/style/noNonNullAssertion: aggregate queries always yield one row.
  const p = payoutAgg[0]!;

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusRows) ordersByStatus[row.status] = Number(row.n);

  return {
    gmv_usd_minor: Number(o.gmv),
    gmv_order_count: Number(o.gmv_count),
    revenue_usd_minor: Number(o.revenue),
    released_order_count: Number(o.released_count),
    pending_escrow_usd_minor: Number(o.pending_escrow),
    pending_escrow_order_count: Number(o.pending_escrow_count),
    refunded_usd_minor: Number(o.refunded),
    refunded_order_count: Number(o.refunded_count),
    pending_payouts_usd_minor: Number(p.pending),
    pending_payout_count: Number(p.pending_count),
    paid_payouts_usd_minor: Number(p.paid),
    paid_payout_count: Number(p.paid_count),
    orders_by_status: ordersByStatus,
    fx_rate: fx?.rate ?? null,
    fx_captured_at: fx?.captured_at ?? null,
  };
}
