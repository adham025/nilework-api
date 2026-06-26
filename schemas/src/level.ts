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

/** Client loyalty tiers (§5.3) — airline-status style, driven by lifetime spend. */
export const ClientTierSchema = z.enum(["standard", "silver", "gold", "platinum"]);
export type ClientTier = z.infer<typeof ClientTierSchema>;

export const ClientLevelSchema = z.object({
  level: ClientTierSchema,
  total_spent_usd_minor: z.number().int().nonnegative(),
  completed_orders: z.number().int().nonnegative(),
  next_level: ClientTierSchema.nullable(),
  spend_to_next_usd_minor: z.number().int().nonnegative().nullable(),
});
export type ClientLevel = z.infer<typeof ClientLevelSchema>;
