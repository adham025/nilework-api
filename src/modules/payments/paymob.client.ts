import { env } from "@/core/env";

/**
 * Paymob Accept client — the classic three-step flow (§6):
 *   1. authenticate()      → auth token
 *   2. registerOrder()     → Paymob order id
 *   3. requestPaymentKey() → payment token for the hosted iframe
 * Then iframeUrl() builds the redirect the buyer opens to pay. Kept thin and
 * isolated so the payments service stays gateway-agnostic.
 */
const BASE_URL = "https://accept.paymob.com/api";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Paymob ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function authenticate(): Promise<string> {
  const data = await post<{ token: string }>("/auth/tokens", { api_key: env.PAYMOB_API_KEY });
  return data.token;
}

export async function registerOrder(
  authToken: string,
  amountEgpMinor: number,
  merchantRef: string,
): Promise<string> {
  const data = await post<{ id: number }>("/ecommerce/orders", {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountEgpMinor,
    currency: "EGP",
    merchant_order_id: merchantRef,
    items: [],
  });
  return String(data.id);
}

export interface PaymobBilling {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
}

export async function requestPaymentKey(
  authToken: string,
  amountEgpMinor: number,
  paymobOrderId: string,
  billing: PaymobBilling,
): Promise<string> {
  const data = await post<{ token: string }>("/acceptance/payment_keys", {
    auth_token: authToken,
    amount_cents: amountEgpMinor,
    expiration: 3600,
    order_id: paymobOrderId,
    currency: "EGP",
    integration_id: env.PAYMOB_INTEGRATION_ID,
    billing_data: {
      apartment: "NA",
      email: billing.email,
      floor: "NA",
      first_name: billing.first_name,
      street: "NA",
      building: "NA",
      phone_number: billing.phone_number,
      shipping_method: "NA",
      postal_code: "NA",
      city: "NA",
      country: "EG",
      last_name: billing.last_name,
      state: "NA",
    },
  });
  return data.token;
}

/** The hosted-iframe URL the buyer is redirected to in order to pay. */
export function iframeUrl(paymentToken: string): string {
  return `${BASE_URL}/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
}
