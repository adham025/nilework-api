import { z } from "zod";

export const MilestoneStatusSchema = z.enum(["pending", "delivered", "released"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const MilestoneSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  title: z.string(),
  amount_usd_minor: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  status: MilestoneStatusSchema,
  delivered_at: z.string().nullable(),
  released_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MilestoneListSchema = z.array(MilestoneSchema);

/**
 * Define milestones on a funded order (client). Amounts must sum to the order's
 * net; 2–20 milestones. Order matters → sequence is assigned by position.
 */
export const MilestoneCreateSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        amount_usd_minor: z.number().int().positive(),
      }),
    )
    .min(2)
    .max(20),
});
export type MilestoneCreateInput = z.infer<typeof MilestoneCreateSchema>;
