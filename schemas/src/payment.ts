import { z } from "zod";

/**
 * Checkout result. provider 'paymob' returns a hosted-iframe redirect_url the
 * client opens to pay; provider 'simulated' (dev, no gateway keys) means escrow
 * was funded directly and the client just refreshes the order.
 */
export const CheckoutResponseSchema = z.object({
  provider: z.enum(["paymob", "simulated"]),
  redirect_url: z.string().nullable(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
