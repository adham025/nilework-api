import { z } from "zod";

/** Freelancer Pro Path tiers (§5.3) — transparent, earned from real outcomes. */
export const FreelancerTierSchema = z.enum(["new", "rising", "pro", "elite"]);
export type FreelancerTier = z.infer<typeof FreelancerTierSchema>;

export const FreelancerLevelSchema = z.object({
  level: FreelancerTierSchema,
  completed_orders: z.number().int().nonnegative(),
  avg_rating: z.number().nullable(),
  review_count: z.number().int().nonnegative(),
  next_level: FreelancerTierSchema.nullable(),
  orders_to_next: z.number().int().nonnegative().nullable(),
});
export type FreelancerLevel = z.infer<typeof FreelancerLevelSchema>;
