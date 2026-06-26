import { z } from "zod";

/** Which wallet balance an entry moves: withdrawable vs. held in escrow (§6). */
export const LedgerBucketSchema = z.enum(["available", "pending"]);
export type LedgerBucket = z.infer<typeof LedgerBucketSchema>;

/** The money events recorded in the append-only ledger (§5.1, §6). */
export const LedgerEntryTypeSchema = z.enum([
  "escrow_fund",
  "escrow_release",
  "escrow_refund",
  "commission",
  "payout",
  "payout_reversal",
  "promo_credit",
  "adjustment",
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

/** A user's wallet. balance = withdrawable, pending = held in escrow (§6). */
export const WalletSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  balance_usd_minor: z.number().int().nonnegative(),
  pending_usd_minor: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Wallet = z.infer<typeof WalletSchema>;

/** An immutable ledger row. Signed amount: + credits the bucket, − debits it. */
export const LedgerEntrySchema = z.object({
  id: z.string().uuid(),
  wallet_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  entry_type: LedgerEntryTypeSchema,
  bucket: LedgerBucketSchema,
  amount_usd_minor: z.number().int(),
  reference_type: z.string().nullable(),
  reference_id: z.string().uuid().nullable(),
  fx_rate_id: z.string().uuid().nullable(),
  memo: z.string().nullable(),
  created_at: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

/** Cursor-paginated ledger history (newest first). */
export const LedgerListResponseSchema = z.object({
  items: z.array(LedgerEntrySchema),
  next_cursor: z.string().nullable(),
});
export type LedgerListResponse = z.infer<typeof LedgerListResponseSchema>;
