import { z } from "zod";

export const CatalogItemSchema = z.object({
  key: z.string(),
  title_en: z.string(),
  title_ar: z.string(),
  cost_points: z.number().int().positive(),
  kind: z.string(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogListSchema = z.array(CatalogItemSchema);

/** Redeem a catalog reward. featured_gig requires a gig_id to feature. */
export const RedeemSchema = z.object({
  catalog_key: z.string().min(1).max(60),
  gig_id: z.string().uuid().optional(),
});
export type RedeemInput = z.infer<typeof RedeemSchema>;

export const RedeemResultSchema = z.object({
  ok: z.boolean(),
  remaining_points: z.number().int(),
});
