import { getDb } from "@/core/db";
import { env, isPaymobConfigured } from "@/core/env";
import { estimateMinor, getLatestRate } from "@/modules/fx/fx.service";
import { OrderError, fundEscrow } from "@/modules/orders/orders.service";
import { getProfile } from "@/modules/profiles/profiles.service";
import type { CheckoutResponse } from "@nilework/schemas";
import {
  type PaymobBilling,
  authenticate,
  iframeUrl,
  registerOrder,
  requestPaymentKey,
} from "./paymob.client";
import { verifyPaymobHmac } from "./paymob.hmac";

/** Typed error so the webhook route maps gateway failures to the right HTTP code. */
export class PaymentError extends Error {
  constructor(
    public code: "unauthorized" | "bad_request" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

interface CheckoutOrder {
  id: string;
  client_id: string;
  status: string;
  gross_usd_minor: number;
}

/** Convert an order's USD gross to the EGP minor (piaster) amount Paymob charges. */
export function egpChargeMinor(grossUsdMinor: number, rate: number): number {
  return estimateMinor(grossUsdMinor, rate);
}

function billingFor(
  displayName: string | null,
  phone: string | null,
  clientId: string,
): PaymobBilling {
  const name = (displayName ?? "Nilework Client").trim();
  const [first, ...rest] = name.split(/\s+/);
  return {
    first_name: first || "Nilework",
    last_name: rest.join(" ") || "Client",
    email: `${clientId}@checkout.nilework.app`,
    phone_number: phone ?? "+201000000000",
  };
}

/**
 * Start checkout for a pending order (client only). With Paymob configured, returns
 * a hosted-iframe URL and waits for the webhook to fund escrow. Without keys (dev),
 * funds escrow immediately so the loop is testable locally.
 */
export async function initiateCheckout(
  orderId: string,
  clientId: string,
): Promise<CheckoutResponse> {
  const sql = getDb();
  const rows = await sql<CheckoutOrder[]>`
    select id, client_id, status, gross_usd_minor from public.orders where id = ${orderId} limit 1
  `;
  const order = rows[0];
  if (!order) throw new OrderError("not_found", "Order not found");
  if (order.client_id !== clientId) throw new OrderError("forbidden", "Not your order");
  if (order.status !== "pending_payment") {
    throw new OrderError("conflict", `Order is ${order.status}, cannot pay`);
  }

  const fx = await getLatestRate();
  if (!fx) throw new OrderError("conflict", "No FX rate available to charge in EGP");
  const amountEgpMinor = egpChargeMinor(order.gross_usd_minor, fx.rate);
  const merchantRef = `${orderId}-${Date.now().toString(36)}`;

  if (!isPaymobConfigured) {
    await sql`
      insert into public.payments
        (order_id, provider, merchant_ref, amount_usd_minor, amount_egp_minor, fx_rate_id, status)
      values
        (${orderId}, 'simulated', ${merchantRef}, ${order.gross_usd_minor},
         ${amountEgpMinor}, ${fx.id}, 'paid')
    `;
    await fundEscrow(orderId, { id: clientId, role: "client" });
    return { provider: "simulated", redirect_url: null };
  }

  await sql`
    insert into public.payments
      (order_id, provider, merchant_ref, amount_usd_minor, amount_egp_minor, fx_rate_id, status)
    values
      (${orderId}, 'paymob', ${merchantRef}, ${order.gross_usd_minor},
       ${amountEgpMinor}, ${fx.id}, 'initiated')
  `;

  const profile = await getProfile(clientId);
  const billing = billingFor(profile?.display_name ?? null, profile?.phone ?? null, clientId);

  const authToken = await authenticate();
  const paymobOrderId = await registerOrder(authToken, amountEgpMinor, merchantRef);
  await sql`
    update public.payments set provider_order_id = ${paymobOrderId} where merchant_ref = ${merchantRef}
  `;
  const paymentToken = await requestPaymentKey(authToken, amountEgpMinor, paymobOrderId, billing);

  return { provider: "paymob", redirect_url: iframeUrl(paymentToken) };
}

type PaymobTransaction = Record<string, unknown> & {
  order?: { id?: unknown };
  id?: unknown;
  success?: unknown;
};

/**
 * Handle a Paymob "transaction processed" callback. Verifies the HMAC, then — if the
 * payment succeeded and hasn't been applied — marks the payment paid and funds escrow.
 * Idempotent: a duplicate callback for an already-paid payment is a no-op (Paymob
 * retries), and funding an already-funded order is swallowed.
 */
export async function handlePaymobWebhook(
  transaction: PaymobTransaction,
  hmac: string,
): Promise<{ handled: boolean }> {
  if (!isPaymobConfigured || !env.PAYMOB_HMAC_SECRET) {
    throw new PaymentError("bad_request", "Paymob is not configured");
  }
  if (!verifyPaymobHmac(transaction, env.PAYMOB_HMAC_SECRET, hmac)) {
    throw new PaymentError("unauthorized", "Invalid HMAC signature");
  }

  const paymobOrderId = transaction.order?.id;
  if (paymobOrderId === undefined || paymobOrderId === null) {
    throw new PaymentError("bad_request", "Missing order id");
  }
  const providerOrderId = String(paymobOrderId);
  const txnId = transaction.id === undefined ? null : String(transaction.id);
  const success = transaction.success === true;

  const sql = getDb();
  const rows = await sql<{ id: string; order_id: string; status: string }[]>`
    select id, order_id, status from public.payments where provider_order_id = ${providerOrderId} limit 1
  `;
  const payment = rows[0];
  if (!payment) return { handled: false };
  if (payment.status === "paid") return { handled: true };

  if (!success) {
    await sql`
      update public.payments set status = 'failed', provider_txn_id = ${txnId} where id = ${payment.id}
    `;
    return { handled: true };
  }

  await sql`
    update public.payments set status = 'paid', provider_txn_id = ${txnId} where id = ${payment.id}
  `;
  try {
    await fundEscrow(payment.order_id, { id: null, role: "system" });
  } catch (err) {
    // Already funded (e.g. a retried callback) — payment is recorded paid, that's fine.
    if (!(err instanceof OrderError && err.code === "conflict")) throw err;
  }
  return { handled: true };
}
