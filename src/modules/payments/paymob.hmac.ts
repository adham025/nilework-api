import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paymob "transaction processed" callback HMAC (§6 security boundary).
 *
 * Paymob signs each callback by concatenating a FIXED, lexically-ordered subset
 * of the transaction object's fields (booleans as "true"/"false"), then HMAC-SHA512
 * with the merchant's HMAC secret, hex-encoded. We recompute and compare in
 * constant time. The field order below is Paymob's documented contract — do not
 * reorder it; the signature breaks if a single field moves.
 */
const HMAC_FIELD_PATHS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

type Json = Record<string, unknown>;

function resolvePath(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Json)[key];
    return undefined;
  }, obj);
}

/** Stringify a field value the way Paymob does for the HMAC concatenation. */
function toHmacString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Compute the expected HMAC hex digest for a Paymob transaction object. */
export function computePaymobHmac(transaction: Json, secret: string): string {
  const concatenated = HMAC_FIELD_PATHS.map((path) =>
    toHmacString(resolvePath(transaction, path)),
  ).join("");
  return createHmac("sha512", secret).update(concatenated).digest("hex");
}

/** Constant-time check that a provided HMAC matches the transaction object. */
export function verifyPaymobHmac(transaction: Json, secret: string, provided: string): boolean {
  if (!provided) return false;
  const expected = computePaymobHmac(transaction, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
