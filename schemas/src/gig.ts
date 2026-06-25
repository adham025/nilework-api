import { z } from "zod";

export const GigStatusSchema = z.enum(["draft", "active", "paused", "removed"]);
export type GigStatus = z.infer<typeof GigStatusSchema>;

/** A gig row as stored (canonical USD minor units for price, §6). */
export const GigSchema = z.object({
  id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  category_id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  price_usd_minor: z.number().int().nonnegative(),
  delivery_days: z.number().int().positive(),
  status: GigStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Gig = z.infer<typeof GigSchema>;

/** Embedded refs for public listings (privacy-filtered freelancer info). */
export const GigCategoryRefSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
});

export const GigFreelancerRefSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const GigListItemSchema = GigSchema.extend({
  category: GigCategoryRefSchema,
  freelancer: GigFreelancerRefSchema,
});
export type GigListItem = z.infer<typeof GigListItemSchema>;

export const GigListResponseSchema = z.object({
  items: z.array(GigListItemSchema),
  next_cursor: z.string().nullable(),
});
export type GigListResponse = z.infer<typeof GigListResponseSchema>;

/** Input for creating a gig. Min price $5 (500 minor units). */
export const GigCreateSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(8).max(120),
  description: z.string().min(30).max(5000),
  price_usd_minor: z.number().int().min(500),
  delivery_days: z.number().int().min(1).max(90),
});
export type GigCreateInput = z.infer<typeof GigCreateSchema>;

export const GigStatusUpdateSchema = z.object({ status: GigStatusSchema });

/** Browse query params for the public gig listing. */
export const GigListQuerySchema = z.object({
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type GigListQuery = z.infer<typeof GigListQuerySchema>;
