import { z } from "zod";

/** USD canonical money is stored as integer minor units (cents) everywhere — MASTER_PLAN §6. */
export const MoneyMinorSchema = z.number().int().nonnegative();

/** Supported display/settlement currencies (MVP: USD canonical, EGP settlement). */
export const CurrencySchema = z.enum(["USD", "EGP"]);
export type Currency = z.infer<typeof CurrencySchema>;

/** Supported UI locales — Arabic-first, English second (MASTER_PLAN §2.1). */
export const LocaleSchema = z.enum(["ar", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

/** User-facing roles; a person may hold both (MASTER_PLAN §6.2). */
export const UserRoleSchema = z.enum(["client", "freelancer"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Cursor-based pagination envelope — MASTER_PLAN §6.4 (never offset pagination). */
export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Standard error response shape returned by every endpoint. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** A single UUID route param named `id` — the most common param shape by far. */
export const IdParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof IdParamSchema>;

/** Plain acknowledgement response for actions with no richer return value. */
export const OkResponseSchema = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof OkResponseSchema>;

/** Cursor-paginated list envelope for a given item schema — pairs with PaginationQuerySchema. */
export function cursorPage<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
  });
}
