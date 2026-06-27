import { randomBytes } from "node:crypto";
import { hashApiKey } from "@/core/auth";
import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { ApiKeyCreatedSchema, ApiKeySchema } from "@nilework/schemas";
import type { z } from "zod";

const COLUMNS = "id, name, prefix, last_used_at, revoked_at, created_at";

export async function listApiKeys(profileId: string): Promise<z.infer<typeof ApiKeySchema>[]> {
  const sql = getDb();
  return sql`
    select ${sql.unsafe(COLUMNS)} from public.api_keys
    where profile_id = ${profileId} order by created_at desc
  `;
}

/** Create a key; the plaintext is returned once and only the hash is stored. */
export async function createApiKey(
  profileId: string,
  name: string,
): Promise<z.infer<typeof ApiKeyCreatedSchema>> {
  await ensureProfile(profileId);
  const key = `nw_${randomBytes(24).toString("hex")}`;
  const prefix = key.slice(0, 11);
  const sql = getDb();
  const rows = await sql<{ id: string }[]>`
    insert into public.api_keys (profile_id, name, key_hash, prefix)
    values (${profileId}, ${name}, ${hashApiKey(key)}, ${prefix})
    returning id
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return { id: rows[0]!.id, name, prefix, key };
}

export async function revokeApiKey(profileId: string, id: string): Promise<void> {
  const sql = getDb();
  await sql`
    update public.api_keys set revoked_at = now()
    where id = ${id} and profile_id = ${profileId} and revoked_at is null
  `;
}
