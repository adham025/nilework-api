import { z } from "zod";

export const CategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  sort_order: z.number().int(),
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryListSchema = z.array(CategorySchema);

/** Category price reference — drives the anti-lowball guidance at gig creation (§5). */
export const CategoryPriceStatsSchema = z.object({
  median_usd_minor: z.number().int().nonnegative().nullable(),
  floor_usd_minor: z.number().int().nonnegative().nullable(),
  sample_size: z.number().int().nonnegative(),
});
export type CategoryPriceStats = z.infer<typeof CategoryPriceStatsSchema>;
