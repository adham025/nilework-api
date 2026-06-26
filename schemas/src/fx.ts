import { z } from "zod";
import { CurrencySchema } from "./common.js";

/** A point-in-time FX snapshot. Rates are append-only history (§6). */
export const FxRateSchema = z.object({
  id: z.string().uuid(),
  base_currency: CurrencySchema,
  quote_currency: CurrencySchema,
  rate: z.number().positive(),
  source: z.string(),
  captured_at: z.string(),
});
export type FxRate = z.infer<typeof FxRateSchema>;
