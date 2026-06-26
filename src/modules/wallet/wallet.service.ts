import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type {
  LedgerBucket,
  LedgerEntry,
  LedgerEntryType,
  LedgerListResponse,
  PaginationQuery,
  Wallet,
} from "@nilework/schemas";
import type { Sql, TransactionSql } from "postgres";

const WALLET_COLUMNS = `
  id, profile_id, balance_usd_minor, pending_usd_minor, created_at, updated_at
`;
const LEDGER_COLUMNS = `
  id, wallet_id, profile_id, entry_type, bucket, amount_usd_minor,
  reference_type, reference_id, fx_rate_id, memo, created_at
`;

/**
 * Ensure a wallet row exists for the user, creating it on first access — same
 * lazy-create pattern as profiles (§6.1). Idempotent via ON CONFLICT, so it is
 * safe under concurrent first requests.
 */
export async function ensureWallet(profileId: string): Promise<Wallet> {
  const sql = getDb();
  await ensureProfile(profileId);
  const rows = await sql<Wallet[]>`
    insert into public.wallets (profile_id)
    values (${profileId})
    on conflict (profile_id) do update set updated_at = public.wallets.updated_at
    returning ${sql.unsafe(WALLET_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return rows[0]!;
}

/** The caller's wallet balances (lazily created on first read). */
export async function getWallet(profileId: string): Promise<Wallet> {
  return ensureWallet(profileId);
}

/** The caller's ledger history, newest first, cursor-paginated. */
export async function listLedger(
  profileId: string,
  query: PaginationQuery,
): Promise<LedgerListResponse> {
  const sql = getDb();
  await ensureWallet(profileId);
  const { limit } = query;

  const rows = await sql<LedgerEntry[]>`
    select ${sql.unsafe(LEDGER_COLUMNS)}
    from public.ledger_entries
    where profile_id = ${profileId}
      ${query.cursor ? sql`and created_at < ${query.cursor}` : sql``}
    order by created_at desc
    limit ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

export interface PostLedgerEntryParams {
  walletId: string;
  entryType: LedgerEntryType;
  bucket: LedgerBucket;
  /** Signed: positive credits the bucket, negative debits it. */
  amountUsdMinor: number;
  referenceType?: string | null;
  referenceId?: string | null;
  fxRateId?: string | null;
  memo?: string | null;
}

/**
 * Post an immutable ledger entry and shift the wallet's matching balance in one
 * transaction, via the post_ledger_entry() SQL function — the ONLY sanctioned way
 * money moves (§5.1, §6). Escrow/payout/promo flows call this and never write a
 * wallet balance by hand. Overdrafts are rejected atomically by the wallet's CHECK
 * constraints (the call throws). Pass a transaction handle (`db`) to compose this
 * with other writes — e.g. an order status change — in a single atomic unit.
 */
export async function postLedgerEntry(
  params: PostLedgerEntryParams,
  db: Sql | TransactionSql = getDb(),
): Promise<LedgerEntry> {
  const sql = db;
  const rows = await sql<LedgerEntry[]>`
    select ${sql.unsafe(LEDGER_COLUMNS)}
    from public.post_ledger_entry(
      ${params.walletId},
      ${params.entryType},
      ${params.bucket},
      ${params.amountUsdMinor},
      ${params.referenceType ?? null},
      ${params.referenceId ?? null},
      ${params.fxRateId ?? null},
      ${params.memo ?? null}
    )
  `;
  // biome-ignore lint/style/noNonNullAssertion: the function returns exactly one row.
  return rows[0]!;
}
