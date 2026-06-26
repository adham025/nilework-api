import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { SavedSearch } from "@nilework/schemas";

const COLUMNS = "id, label, query, created_at";
const MAX_SAVED = 30;

export async function listSavedSearches(profileId: string): Promise<SavedSearch[]> {
  const sql = getDb();
  return sql<SavedSearch[]>`
    select ${sql.unsafe(COLUMNS)} from public.saved_searches
    where profile_id = ${profileId} order by created_at desc
  `;
}

/** Save a search; oldest is pruned past the per-user cap so the list stays tidy. */
export async function createSavedSearch(
  profileId: string,
  label: string,
  query: Record<string, string>,
): Promise<SavedSearch> {
  await ensureProfile(profileId);
  const sql = getDb();
  const rows = await sql<SavedSearch[]>`
    insert into public.saved_searches (profile_id, label, query)
    values (${profileId}, ${label}, ${sql.json(query as never)})
    returning ${sql.unsafe(COLUMNS)}
  `;
  await sql`
    delete from public.saved_searches
    where profile_id = ${profileId}
      and id not in (
        select id from public.saved_searches
        where profile_id = ${profileId} order by created_at desc limit ${MAX_SAVED}
      )
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return rows[0]!;
}

export async function deleteSavedSearch(profileId: string, id: string): Promise<void> {
  const sql = getDb();
  await sql`delete from public.saved_searches where id = ${id} and profile_id = ${profileId}`;
}
