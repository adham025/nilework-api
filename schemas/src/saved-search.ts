import { z } from "zod";

export const SavedSearchSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  query: z.record(z.string()),
  created_at: z.string(),
});
export type SavedSearch = z.infer<typeof SavedSearchSchema>;

export const SavedSearchListSchema = z.array(SavedSearchSchema);

/** Save the current browse filters under a label. query is a param→value map. */
export const SavedSearchCreateSchema = z.object({
  label: z.string().min(1).max(80),
  query: z.record(z.string()).default({}),
});
export type SavedSearchCreateInput = z.infer<typeof SavedSearchCreateSchema>;
