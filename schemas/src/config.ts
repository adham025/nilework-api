import { z } from "zod";

/**
 * Publicly safe platform settings — powers transparent fee display, the §1/§2
 * brand promise ("10% flat, transparent"). Only non-sensitive app_config keys.
 */
export const PublicConfigSchema = z.object({
  commission_bps: z.number().int().nonnegative(),
  min_withdrawal_usd_minor: z.number().int().nonnegative(),
  payout_hold_days: z.number().int().nonnegative(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
