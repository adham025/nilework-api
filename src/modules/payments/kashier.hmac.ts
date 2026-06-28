import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kashier webhook signature verification (the §6 security boundary, Kashier side).
 *
 * Kashier signs each callback by building a query string from the fields named in
 * the payload's own `signatureKeys` array (in order), then HMAC-SHA256 with the
 * merchant secret key, hex-encoded; the digest arrives in `signature`. We recompute
 * and compare in constant time. Using the provider-supplied key list keeps us robust
 * to additive payload changes.
 *
 * NOTE: confirm the field source/order against Kashier's current docs in sandbox —
 * if their signature ever covers a fixed list instead of `signatureKeys`, swap the
 * key source here. This is the one Kashier contract to validate with a real callback.
 */
type Json = Record<string, unknown>;

function toStr(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Compute the expected Kashier signature for a callback `data` object. */
export function computeKashierSignature(data: Json, secret: string): string | null {
  const keys = Array.isArray(data.signatureKeys) ? (data.signatureKeys as string[]) : [];
  if (keys.length === 0) return null;
  const queryString = keys.map((k) => `${k}=${toStr(data[k])}`).join("&");
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

/** Constant-time check that a Kashier callback's `signature` matches its contents. */
export function verifyKashierSignature(data: Json, secret: string): boolean {
  const provided = typeof data.signature === "string" ? data.signature : "";
  if (!provided) return false;
  const expected = computeKashierSignature(data, secret);
  if (!expected) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
