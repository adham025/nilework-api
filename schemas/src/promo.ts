import { z } from "zod";

export const PromoTypeSchema = z.enum(["fee_waiver", "points"]);
export type PromoType = z.infer<typeof PromoTypeSchema>;

export const PromoCodeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: PromoTypeSchema,
  value: z.number().int().positive(),
  max_redemptions: z.number().int().positive().nullable(),
  redeemed_count: z.number().int().nonnegative(),
  per_user_limit: z.number().int().positive(),
  starts_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});
export type PromoCode = z.infer<typeof PromoCodeSchema>;

export const PromoCodeListSchema = z.array(PromoCodeSchema);

/** Staff: create a promo code. value is bps-to-waive (fee_waiver) or points (points). */
export const PromoCreateSchema = z.object({
  code: z.string().min(3).max(40),
  type: PromoTypeSchema,
  value: z.number().int().positive(),
  max_redemptions: z.number().int().positive().optional(),
  per_user_limit: z.number().int().positive().default(1),
  expires_at: z.string().datetime().optional(),
});
export type PromoCreateInput = z.infer<typeof PromoCreateSchema>;

/** Lightweight validity result for the checkout/redeem UI. */
export const PromoValidationSchema = z.object({
  valid: z.boolean(),
  type: PromoTypeSchema.nullable(),
  value: z.number().int().nullable(),
  reason: z.string().nullable(),
});
export type PromoValidation = z.infer<typeof PromoValidationSchema>;

export const PromoRedeemSchema = z.object({ code: z.string().min(3).max(40) });

export const PromoRedeemResultSchema = z.object({
  ok: z.boolean(),
  points_awarded: z.number().int().nonnegative(),
});
