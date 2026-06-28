import { createHmac } from "node:crypto";
import { env } from "@/core/env";

/**
 * Kashier hosted-payment-page (HPP) client — mirrors the Paymob client's role but
 * for Kashier's redirect flow:
 *   1. kashierOrderHash() signs the order with the payment key.
 *   2. kashierCheckoutUrl() builds the URL the buyer opens to pay.
 * Then Kashier calls our webhook (verified in kashier.hmac) and redirects the buyer
 * back. Kept thin/isolated so the payments service stays gateway-agnostic.
 *
 * NOTE: Kashier's exact HPP parameter set and the order-hash path are their
 * integration contract — confirm against Kashier's current docs/sandbox before
 * going live. The pieces below follow Kashier's documented Node example.
 */
const HPP_BASE = "https://checkout.kashier.io/";

/** Kashier expects the amount in major units (EGP), e.g. "2450.00". */
export function kashierAmountMajor(amountEgpMinor: number): string {
  return (amountEgpMinor / 100).toFixed(2);
}

/** Order hash: HMAC-SHA256 of the payment path, signed with the payment API key. */
export function kashierOrderHash(
  orderId: string,
  amountMajor: string,
  currency = "EGP",
  merchantId: string = env.KASHIER_MERCHANT_ID ?? "",
  apiKey: string = env.KASHIER_API_KEY ?? "",
): string {
  const path = `/?payment=${merchantId}.${orderId}.${amountMajor}.${currency}`;
  return createHmac("sha256", apiKey).update(path).digest("hex");
}

/** Build the hosted-payment-page redirect URL the buyer opens to pay. */
export function kashierCheckoutUrl(params: {
  orderId: string;
  amountMajor: string;
  redirectUrl: string;
  webhookUrl?: string;
  currency?: string;
}): string {
  const currency = params.currency ?? "EGP";
  const q = new URLSearchParams({
    merchantId: env.KASHIER_MERCHANT_ID ?? "",
    orderId: params.orderId,
    amount: params.amountMajor,
    currency,
    hash: kashierOrderHash(params.orderId, params.amountMajor, currency),
    mode: env.KASHIER_MODE,
    merchantRedirect: params.redirectUrl,
    allowedMethods: "card",
    display: "en",
  });
  if (params.webhookUrl) q.set("serverWebhook", params.webhookUrl);
  return `${HPP_BASE}?${q.toString()}`;
}
