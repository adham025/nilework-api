import { getDb } from "@/core/db";
import { type Category, CategoryListSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/** Public category taxonomy (served by the API; RLS stays deny-by-default, §6.6). */
export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
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
}
