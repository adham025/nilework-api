import { getDb } from "@/core/db";
import { DomainError } from "@/core/errors";
import { getPublicConfig } from "@/modules/config/config.service";
import { estimateMinor, getLatestRate } from "@/modules/fx/fx.service";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureWallet, postLedgerEntry } from "@/modules/wallet/wallet.service";
import type {
  PaginationQuery,
  Payout,
  PayoutCreateInput,
  PayoutListResponse,
} from "@nilework/schemas";
import type { TransactionSql } from "postgres";

/** Typed error so routes can map payout failures to HTTP codes. */
export class PayoutError extends DomainError<
  "not_found" | "forbidden" | "conflict" | "unprocessable"
> {}

const PAYOUT_COLUMNS = `
  id, profile_id, amount_usd_minor, amount_egp_minor, fx_rate_id,
  destination_type, destination_details, status, provider_ref, note,
  requested_at, processed_at, created_at, updated_at
`;

/**
 * Validate a requested amount against the available balance and minimum. Pure +
 * unit-tested; the DB CHECK on the wallet is the ultimate backstop, this gives a
 * friendly reason first.
 */
export function payoutAmountError(
  amount: number,
  available: number,
  minWithdrawal: number,
): "below_min" | "insufficient" | null {
  if (amount < minWithdrawal) return "below_min";
  if (amount > available) return "insufficient";
  return null;
}

/**
 * Request a withdrawal: debit the wallet's available balance and create a payout
 * in 'requested', atomically. The funds are reserved immediately so they can't be
 * spent twice while the payout is in flight.
 */
export async function requestPayout(profileId: string, input: PayoutCreateInput): Promise<Payout> {
  const { min_withdrawal_usd_minor } = await getPublicConfig();
  const fx = await getLatestRate();
  if (!fx) throw new PayoutError("conflict", "No FX rate available to settle in EGP");
  const wallet = await ensureWallet(profileId);

  const sql = getDb();
  const payout = await sql.begin(async (tx) => {
    const lockedRows = await tx<{ balance_usd_minor: number }[]>`
      select balance_usd_minor from public.wallets where id = ${wallet.id} for update
    `;
    const available = lockedRows[0]?.balance_usd_minor ?? 0;
    const problem = payoutAmountError(input.amount_usd_minor, available, min_withdrawal_usd_minor);
    if (problem === "below_min") {
      throw new PayoutError("unprocessable", "Amount is below the minimum withdrawal");
    }
    if (problem === "insufficient") {
      throw new PayoutError("unprocessable", "Amount exceeds your available balance");
    }

    const amountEgpMinor = estimateMinor(input.amount_usd_minor, fx.rate);
    const inserted = await tx<Payout[]>`
      insert into public.payouts
        (profile_id, amount_usd_minor, amount_egp_minor, fx_rate_id,
         destination_type, destination_details)
      values
        (${profileId}, ${input.amount_usd_minor}, ${amountEgpMinor}, ${fx.id},
         ${input.destination_type}, ${input.destination_details})
      returning ${tx.unsafe(PAYOUT_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    const created = inserted[0]!;

    await postLedgerEntry(
      {
        walletId: wallet.id,
        entryType: "payout",
        bucket: "available",
        amountUsdMinor: -input.amount_usd_minor,
        referenceType: "payout",
        referenceId: created.id,
        fxRateId: fx.id,
        memo: "Withdrawal requested",
      },
      tx,
    );
    return created;
  });

  return payout;
}

export async function listMyPayouts(
  profileId: string,
  query: PaginationQuery,
): Promise<PayoutListResponse> {
  const sql = getDb();
  const { limit } = query;
  const rows = await sql<Payout[]>`
    select ${sql.unsafe(PAYOUT_COLUMNS)}
    from public.payouts
    where profile_id = ${profileId}
      ${query.cursor ? sql`and created_at < ${query.cursor}` : sql``}
    order by created_at desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

/** Freelancer cancels a still-pending request; the reserved funds return to available. */
export async function cancelPayout(payoutId: string, profileId: string): Promise<Payout> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const payout = await lockPayout(tx, payoutId);
    if (payout.profile_id !== profileId) throw new PayoutError("forbidden", "Not your payout");
    if (payout.status !== "requested") {
      throw new PayoutError("conflict", `Payout is ${payout.status}, cannot cancel`);
    }
    await reverseToWallet(tx, payout, "Withdrawal cancelled");
    return setStatus(tx, payoutId, "cancelled");
  });
}

// --- staff/ops actions (§6.2) ----------------------------------------------

export async function listPendingPayouts(query: PaginationQuery): Promise<PayoutListResponse> {
  const sql = getDb();
  const { limit } = query;
  const rows = await sql<Payout[]>`
    select ${sql.unsafe(PAYOUT_COLUMNS)}
    from public.payouts
    where status in ('requested', 'processing')
      ${query.cursor ? sql`and created_at > ${query.cursor}` : sql``}
    order by created_at
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

export async function markPayoutProcessing(payoutId: string): Promise<Payout> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const payout = await lockPayout(tx, payoutId);
    if (payout.status !== "requested") {
      throw new PayoutError("conflict", `Payout is ${payout.status}, expected requested`);
    }
    return setStatus(tx, payoutId, "processing");
  });
}

/** Mark a payout paid after an external disbursement. No ledger change — money already left on request. */
export async function markPayoutPaid(payoutId: string, providerRef: string): Promise<Payout> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const payout = await lockPayout(tx, payoutId);
    if (payout.status !== "requested" && payout.status !== "processing") {
      throw new PayoutError("conflict", `Payout is ${payout.status}, cannot mark paid`);
    }
    const rows = await tx<Payout[]>`
      update public.payouts
      set status = 'paid', provider_ref = ${providerRef}, processed_at = now()
      where id = ${payoutId}
      returning ${tx.unsafe(PAYOUT_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    const paid = rows[0]!;
    await notify(paid.profile_id, "payout_paid", {
      payout_id: paid.id,
      amount_usd_minor: paid.amount_usd_minor,
    });
    return paid;
  });
}

/** Mark a payout failed; the reserved funds are returned to the wallet's available balance. */
export async function markPayoutFailed(payoutId: string, note: string): Promise<Payout> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const payout = await lockPayout(tx, payoutId);
    if (payout.status === "paid" || payout.status === "cancelled" || payout.status === "failed") {
      throw new PayoutError("conflict", `Payout is ${payout.status}, cannot mark failed`);
    }
    await reverseToWallet(tx, payout, "Withdrawal failed");
    const rows = await tx<Payout[]>`
      update public.payouts
      set status = 'failed', note = ${note}, processed_at = now()
      where id = ${payoutId}
      returning ${tx.unsafe(PAYOUT_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    return rows[0]!;
  });
}

// --- internals -------------------------------------------------------------

type Tx = TransactionSql;

async function lockPayout(tx: Tx, payoutId: string): Promise<Payout> {
  const rows = await tx<Payout[]>`
    select ${tx.unsafe(PAYOUT_COLUMNS)} from public.payouts where id = ${payoutId} for update
  `;
  const payout = rows[0];
  if (!payout) throw new PayoutError("not_found", "Payout not found");
  return payout;
}

async function reverseToWallet(tx: Tx, payout: Payout, memo: string): Promise<void> {
  const wallet = await ensureWallet(payout.profile_id);
  await postLedgerEntry(
    {
      walletId: wallet.id,
      entryType: "payout_reversal",
      bucket: "available",
      amountUsdMinor: payout.amount_usd_minor,
      referenceType: "payout",
      referenceId: payout.id,
      fxRateId: payout.fx_rate_id,
      memo,
    },
    tx,
  );
}

async function setStatus(tx: Tx, payoutId: string, status: Payout["status"]): Promise<Payout> {
  const rows = await tx<Payout[]>`
    update public.payouts set status = ${status} where id = ${payoutId}
    returning ${tx.unsafe(PAYOUT_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
  return rows[0]!;
}
