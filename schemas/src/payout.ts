import { z } from "zod";

/** Payout lifecycle (§6). requested → processing → paid/failed; requested → cancelled. */
export const PayoutStatusSchema = z.enum([
  "requested",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

/** Supported EGP payout rails (§1). */
export const PayoutDestinationTypeSchema = z.enum(["instapay", "vodafone_cash", "bank"]);
export type PayoutDestinationType = z.infer<typeof PayoutDestinationTypeSchema>;

export const PayoutSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  amount_usd_minor: z.number().int().positive(),
  amount_egp_minor: z.number().int().nonnegative(),
  fx_rate_id: z.string().uuid().nullable(),
  destination_type: PayoutDestinationTypeSchema,
  destination_details: z.string(),
  status: PayoutStatusSchema,
  provider_ref: z.string().nullable(),
  note: z.string().nullable(),
  requested_at: z.string(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Payout = z.infer<typeof PayoutSchema>;

/** Request a withdrawal of part of the available balance. */
export const PayoutCreateSchema = z.object({
  amount_usd_minor: z.number().int().positive(),
  destination_type: PayoutDestinationTypeSchema,
  destination_details: z.string().min(3).max(200),
});
export type PayoutCreateInput = z.infer<typeof PayoutCreateSchema>;

export const PayoutListResponseSchema = z.object({
  items: z.array(PayoutSchema),
  next_cursor: z.string().nullable(),
});
export type PayoutListResponse = z.infer<typeof PayoutListResponseSchema>;

/** Staff: record an external disbursement reference when marking a payout paid. */
export const PayoutMarkPaidSchema = z.object({
  provider_ref: z.string().min(1).max(200),
});

/** Staff: reason when marking a payout failed (funds are returned to the wallet). */
export const PayoutMarkFailedSchema = z.object({
  note: z.string().min(1).max(500),
});
