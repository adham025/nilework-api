import { z } from "zod";

export const SubscriptionSchema = z
  .object({
    plan: z.literal("pro"),
    status: z.enum(["active", "expired"]),
    current_period_end: z.string(),
  })
  .nullable();
export type Subscription = z.infer<typeof SubscriptionSchema>;

/** Public Pro flag for a profile — drives the Pro badge on gigs/profiles. */
export const PlanBadgeSchema = z.object({ pro: z.boolean() });
export type PlanBadge = z.infer<typeof PlanBadgeSchema>;
