import { getDb } from "@/core/db";
import { type Category, CategoryListSchema, CategoryPriceStatsSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/** Anti-lowball reference: a price below this fraction of the category median is flagged. */
const FLOOR_FRACTION = 0.4;

/** Public category taxonomy (served by the API; RLS stays deny-by-default, §6.6). */
export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/categories",
    {
      schema: {
        tags: ["marketplace"],
        summary: "List active categories",
        response: { 200: CategoryListSchema },
      },
    },
    async () => {
      const sql = getDb();
      return sql<Category[]>`
        select id, slug, name_en, name_ar, sort_order
        from public.categories
        where is_active = true
        order by sort_order asc
      `;
    },
  );

  r.get(
    "/categories/:id/price-stats",
    {
      schema: {
        tags: ["marketplace"],
        summary: "Median active-gig price for a category (anti-lowball reference)",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: CategoryPriceStatsSchema },
      },
    },
    async (req) => {
      const sql = getDb();
      const rows = await sql<{ median: number | null; n: number }[]>`
        select
          percentile_cont(0.5) within group (order by price_usd_minor)::float8 as median,
          count(*)::int as n
        from public.gigs
        where category_id = ${req.params.id} and status = 'active'
      `;
      const median = rows[0]?.median ?? null;
      const sampleSize = rows[0]?.n ?? 0;
      // Require a meaningful sample before offering a floor, to avoid noisy guidance.
      const usable = median !== null && sampleSize >= 3;
      return {
        median_usd_minor: usable ? Math.round(median) : null,
        floor_usd_minor: usable ? Math.round(median * FLOOR_FRACTION) : null,
        sample_size: sampleSize,
      };
    },
  );
}
