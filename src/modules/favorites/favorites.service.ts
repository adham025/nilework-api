import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { GigListItem } from "@nilework/schemas";

export async function addFavorite(profileId: string, gigId: string): Promise<void> {
  await ensureProfile(profileId);
  const sql = getDb();
  await sql`
    insert into public.favorites (profile_id, gig_id)
    values (${profileId}, ${gigId})
    on conflict (profile_id, gig_id) do nothing
  `;
}

export async function removeFavorite(profileId: string, gigId: string): Promise<void> {
  const sql = getDb();
  await sql`delete from public.favorites where profile_id = ${profileId} and gig_id = ${gigId}`;
}

export async function isFavorited(profileId: string, gigId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql<{ one: number }[]>`
    select 1 as one from public.favorites where profile_id = ${profileId} and gig_id = ${gigId} limit 1
  `;
  return rows.length > 0;
}

/** The caller's saved gigs, newest-saved first, in the public gig-listing shape. */
export async function listFavorites(profileId: string): Promise<GigListItem[]> {
  const sql = getDb();
  return sql<GigListItem[]>`
    select
      g.id, g.freelancer_id, g.category_id, g.title, g.slug, g.description,
      g.price_usd_minor, g.delivery_days, g.status, g.created_at, g.updated_at,
      json_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar)
        as category,
      json_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
        as freelancer
    from public.favorites f
    join public.gigs g on g.id = f.gig_id
    join public.categories c on c.id = g.category_id
    join public.profiles p on p.id = g.freelancer_id
    where f.profile_id = ${profileId}
    order by f.created_at desc
  `;
}
