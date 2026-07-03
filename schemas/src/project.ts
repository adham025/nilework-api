import { z } from "zod";

/**
 * Client-posted projects + freelancer proposals (client-projects-week3b).
 * The reverse marketplace to the gig catalog: budgets are USD minor units
 * (§8: USD canonical); accepting a proposal creates a normal escrow order.
 */

export const ProjectStatusSchema = z.enum(["open", "in_review", "awarded", "closed", "cancelled"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  category_id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  budget_min_usd_minor: z.number().int().nonnegative(),
  budget_max_usd_minor: z.number().int().nonnegative(),
  expected_delivery_days: z.number().int().positive(),
  status: ProjectStatusSchema,
  awarded_order_id: z.string().uuid().nullable(),
  proposal_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Browse item includes denormalized category + client display info. */
export const ProjectListItemSchema = ProjectSchema.extend({
  category: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name_en: z.string(),
    name_ar: z.string(),
  }),
  client: z.object({
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectListItemSchema),
  next_cursor: z.string().nullable(),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

export const ProjectListQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  budget_min: z.coerce.number().int().nonnegative().optional(),
  budget_max: z.coerce.number().int().nonnegative().optional(),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

/** Fixed budget = min == max; range requires max >= min (Req 2). Min $5. */
export const ProjectCreateSchema = z
  .object({
    category_id: z.string().uuid(),
    title: z.string().min(8).max(120),
    description: z.string().min(30).max(5000),
    budget_min_usd_minor: z.number().int().min(500),
    budget_max_usd_minor: z.number().int().min(500),
    expected_delivery_days: z.number().int().min(1).max(365),
  })
  .refine((p) => p.budget_max_usd_minor >= p.budget_min_usd_minor, {
    message: "budget_max_usd_minor must be >= budget_min_usd_minor",
    path: ["budget_max_usd_minor"],
  });
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

/** Client-driven status moves; awarding happens only via proposal acceptance. */
export const ProjectStatusUpdateSchema = z.object({
  status: z.enum(["open", "in_review", "closed", "cancelled"]),
});
export type ProjectStatusUpdateInput = z.infer<typeof ProjectStatusUpdateSchema>;

// --- proposals ---------------------------------------------------------------

export const ProposalStatusSchema = z.enum([
  "pending",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn",
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  cover_letter: z.string(),
  price_usd_minor: z.number().int().nonnegative(),
  delivery_days: z.number().int().positive(),
  status: ProposalStatusSchema,
  order_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** Client review view: proposal + freelancer public card. */
export const ProposalListItemSchema = ProposalSchema.extend({
  freelancer: z.object({
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
});
export type ProposalListItem = z.infer<typeof ProposalListItemSchema>;

export const ProposalListSchema = z.array(ProposalListItemSchema);

export const ProposalCreateSchema = z.object({
  cover_letter: z.string().min(30).max(3000),
  price_usd_minor: z.number().int().min(500),
  delivery_days: z.number().int().min(1).max(365),
});
export type ProposalCreateInput = z.infer<typeof ProposalCreateSchema>;
