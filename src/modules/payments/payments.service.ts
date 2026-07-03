import { getDb } from "@/core/db";
import { activePaymentProvider, env, isKashierConfigured, isPaymobConfigured } from "@/core/env";
import { estimateMinor, getLatestRate } from "@/modules/fx/fx.service";
import { OrderError, fundEscrow } from "@/modules/orders/orders.service";
import { getProfile } from "@/modules/profiles/profiles.service";
import type { CheckoutResponse } from "@nilework/schemas";
import { kashierAmountMajor, kashierCheckoutUrl, kashierRefund } from "./kashier.client";
import { verifyKashierSignature } from "./kashier.hmac";
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
  const provider = activePaymentProvider();

  if (provider === "simulated") {
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

  if (provider === "kashier") {
    await sql`
      insert into public.payments
        (order_id, provider, merchant_ref, amount_usd_minor, amount_egp_minor, fx_rate_id, status)
      values
        (${orderId}, 'kashier', ${merchantRef}, ${order.gross_usd_minor},
         ${amountEgpMinor}, ${fx.id}, 'initiated')
    `;
    const redirectUrl = kashierCheckoutUrl({
      orderId: merchantRef,
      amountMajor: kashierAmountMajor(amountEgpMinor),
      redirectUrl: `${env.WEB_BASE_URL}/dashboard/orders/${orderId}`,
      ...(env.API_BASE_URL
        ? { webhookUrl: `${env.API_BASE_URL}/v1/payments/kashier/webhook` }
        : {}),
    });
    return { provider: "kashier", redirect_url: redirectUrl };
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

type KashierCallback = Record<string, unknown> & {
  merchantOrderId?: unknown;
  orderId?: unknown;
  transactionId?: unknown;
  paymentStatus?: unknown;
  status?: unknown;
};

/**
 * Handle a Kashier payment callback. Verifies the signature, then — if the payment
 * succeeded and hasn't been applied — marks the payment paid and funds escrow. The
 * order is matched by our own merchantOrderId (the merchant_ref we sent). Idempotent
 * the same way the Paymob webhook is (Kashier retries).
 */
export async function handleKashierWebhook(
  body: Record<string, unknown>,
): Promise<{ handled: boolean }> {
  if (!isKashierConfigured) {
    throw new PaymentError("bad_request", "Kashier is not configured");
  }
  // Kashier nests the signed fields under `data`; tolerate a flat body too.
  const data = (body.data && typeof body.data === "object" ? body.data : body) as KashierCallback;
  const secret = env.KASHIER_SECRET_KEY || env.KASHIER_API_KEY || "";
  if (!verifyKashierSignature(data, secret)) {
    throw new PaymentError("unauthorized", "Invalid signature");
  }

  const merchantRef = data.merchantOrderId === undefined ? "" : String(data.merchantOrderId);
  if (!merchantRef) throw new PaymentError("bad_request", "Missing merchantOrderId");
  const txnId = data.transactionId === undefined ? null : String(data.transactionId);
  const providerOrderId = data.orderId === undefined ? null : String(data.orderId);
  const rawStatus = String(data.paymentStatus ?? data.status ?? "").toUpperCase();
  const success = rawStatus === "SUCCESS";

  const sql = getDb();
  const rows = await sql<{ id: string; order_id: string; status: string }[]>`
    select id, order_id, status from public.payments where merchant_ref = ${merchantRef} limit 1
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
    update public.payments
    set status = 'paid', provider_txn_id = ${txnId}, provider_order_id = ${providerOrderId}
    where id = ${payment.id}
  `;
  try {
    await fundEscrow(payment.order_id, { id: null, role: "system" });
  } catch (err) {
    if (!(err instanceof OrderError && err.code === "conflict")) throw err;
  }
  return { handled: true };
}

// --- refunds + webhook audit (Kashier-primary hardening, spec phase1) ---------

/**
 * Persist a provider callback for audit/replay (Req 4.1/14). Never blocks the
 * money path: an audit-table hiccup must not stop escrow funding, so failures
 * are swallowed after a console error.
 */
export async function recordWebhook(entry: {
  provider: "paymob" | "kashier" | "simulated";
  paymentId: string | null;
  payload: unknown;
  signature: string | null;
  verified: boolean;
  processed: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      insert into public.payment_webhooks
        (provider, payment_id, payload, signature, verified, processed, processing_error, processed_at)
      values
        (${entry.provider}, ${entry.paymentId}, ${sql.json(entry.payload as never)},
         ${entry.signature}, ${entry.verified}, ${entry.processed},
         ${entry.error ?? null}, ${entry.processed ? new Date() : null})
    `;
  } catch (err) {
    console.error("payment_webhooks audit insert failed", err);
  }
}

export interface RefundResult {
  payment_id: string;
  order_id: string;
  status: "refunded";
  refund_ref: string | null;
}

/**
 * Refund the captured payment on an order (staff-only; Req 8). Kashier is the
 * launch gateway: the refund goes to Kashier's order-operation API using the
 * provider_order_id captured by the webhook. The 'simulated' provider refunds
 * locally so the loop is testable without keys. Idempotent: an already-refunded
 * payment returns as-is. This returns the client's money at the provider; the
 * internal escrow reversal stays with dispute resolution (one ledger authority).
 */
export async function refundPayment(orderId: string): Promise<RefundResult> {
  const sql = getDb();
  const rows = await sql<
    {
      id: string;
      order_id: string;
      provider: string;
      status: string;
      amount_egp_minor: number;
      provider_order_id: string | null;
      refund_ref: string | null;
    }[]
  >`
    select id, order_id, provider, status, amount_egp_minor, provider_order_id, refund_ref
    from public.payments
    where order_id = ${orderId} and status in ('paid', 'refunded')
    order by created_at desc
    limit 1
  `;
  const payment = rows[0];
  if (!payment) throw new PaymentError("not_found", "No captured payment on this order");
  if (payment.status === "refunded") {
    return {
      payment_id: payment.id,
      order_id: payment.order_id,
      status: "refunded",
      refund_ref: payment.refund_ref,
    };
  }

  let refundRef: string | null = null;
  if (payment.provider === "kashier") {
    if (!payment.provider_order_id) {
      throw new PaymentError("bad_request", "Payment has no Kashier order reference");
    }
    const result = await kashierRefund(payment.provider_order_id, payment.amount_egp_minor);
    if (!result.ok) {
      throw new PaymentError(
        "bad_request",
        `Kashier refund failed (HTTP ${result.status}) — check the Kashier dashboard`,
      );
    }
    refundRef = result.reference;
  } else if (payment.provider !== "simulated") {
    // Paymob refunds are dormant until Paymob is (re)activated as a gateway.
    throw new PaymentError(
      "bad_request",
      `Refunds not implemented for provider ${payment.provider}`,
    );
  }

  await sql`
    update public.payments
    set status = 'refunded', refunded_at = now(), refund_ref = ${refundRef}
    where id = ${payment.id}
  `;
  return {
    payment_id: payment.id,
    order_id: payment.order_id,
    status: "refunded",
    refund_ref: refundRef,
  };
}
