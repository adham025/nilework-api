import { z } from "zod";

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});
export const ApiKeyListSchema = z.array(ApiKeySchema);

export const ApiKeyCreateSchema = z.object({ name: z.string().min(1).max(80) });

/** Returned once at creation — `key` is never retrievable again. */
export const ApiKeyCreatedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  key: z.string(),
});
