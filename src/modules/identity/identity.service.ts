import { createHash, createHmac, randomInt } from "node:crypto";
import { getDb } from "@/core/db";
import { env } from "@/core/env";
import { supabaseAdmin } from "@/core/supabase";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { IdVerification, IdentitySubmitInput, VerificationStatus } from "@nilework/schemas";
import { parseEgyptianNationalId } from "./egyptian-id";
import { isOtpDevMode, sendOtp } from "./otp";

/** Typed error so routes can map identity failures to HTTP codes. */
export class IdentityError extends Error {
  constructor(
    public code: "not_found" | "conflict" | "too_many" | "invalid_national_id",
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const ID_COLUMNS = `
  id, profile_id, full_name, national_id_number, front_path, back_path,
  status, review_note, reviewed_at, created_at, flagged_duplicate
`;

function hashCode(code: string, profileId: string): string {
  return createHash("sha256").update(`${profileId}:${code}`).digest("hex");
}

/**
 * Keyed hash of a national ID for duplicate lookup (identity Req 8): supports
 * exact-match detection across accounts without ever comparing/exposing
 * plaintext. HMAC key comes from ID_HASH_KEY (falls back to the service-role
 * key so dev needs no extra config).
 */
export function hashNationalId(normalizedId: string): string {
  const key = env.ID_HASH_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return createHmac("sha256", key).update(normalizedId).digest("hex");
}

// --- phone OTP -------------------------------------------------------------

export async function startPhoneVerification(
  profileId: string,
  phone: string,
): Promise<{ sent: boolean; dev_code: string | null }> {
  await ensureProfile(profileId);
  const sql = getDb();

  const recent = await sql<{ c: number }[]>`
    select count(*)::int as c from public.phone_verifications
    where profile_id = ${profileId} and created_at > now() - interval '1 hour'
  `;
  if ((recent[0]?.c ?? 0) >= MAX_SENDS_PER_HOUR) {
    throw new IdentityError("too_many", "Too many code requests — try again later");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await sql`
    insert into public.phone_verifications (profile_id, phone, code_hash, expires_at)
    values (${profileId}, ${phone}, ${hashCode(code, profileId)}, ${expiresAt})
  `;
  await sendOtp(phone, code);
  return { sent: true, dev_code: isOtpDevMode ? code : null };
}

export async function verifyPhone(profileId: string, code: string): Promise<void> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; phone: string; code_hash: string; attempts: number }[]>`
      select id, phone, code_hash, attempts from public.phone_verifications
      where profile_id = ${profileId} and consumed_at is null and expires_at > now()
      order by created_at desc limit 1
      for update
    `;
    const v = rows[0];
    if (!v) throw new IdentityError("conflict", "No active code — request a new one");
    if (v.attempts >= MAX_ATTEMPTS) throw new IdentityError("too_many", "Too many attempts");
    if (v.code_hash !== hashCode(code, profileId)) {
      await tx`update public.phone_verifications set attempts = attempts + 1 where id = ${v.id}`;
      throw new IdentityError("conflict", "Incorrect code");
    }
    await tx`update public.phone_verifications set consumed_at = now() where id = ${v.id}`;
    await tx`update public.profiles set phone = ${v.phone}, phone_verified = true where id = ${profileId}`;
  });
}

// --- national ID -----------------------------------------------------------

export async function submitIdentity(
  profileId: string,
  input: IdentitySubmitInput,
): Promise<IdVerification> {
  await ensureProfile(profileId);
  const sql = getDb();

  // Structural validation of the Egyptian national ID (onboarding task 1.3 /
  // identity Req 3): reject malformed numbers at submission so typos never
  // burn a slot in the 48h human review queue. The parser never auto-approves —
  // a structurally valid ID still goes to manual review. Arabic-Indic digits
  // are normalized so the stored value is always the Western-digit form.
  const parsed = parseEgyptianNationalId(input.national_id_number);
  if (!parsed.valid) {
    throw new IdentityError(
      "invalid_national_id",
      `National ID failed structural validation (${parsed.reason})`,
    );
  }

  const prof = await sql<{ id_verification_status: string }[]>`
    select id_verification_status from public.profiles where id = ${profileId}
  `;
  if (prof[0]?.id_verification_status === "verified") {
    throw new IdentityError("conflict", "Identity is already verified");
  }
  if (prof[0]?.id_verification_status === "pending") {
    throw new IdentityError("conflict", "A verification is already under review");
  }

  // Duplicate detection (Req 8): the same national ID approved on ANOTHER
  // account flags this submission for the reviewer. The submission still goes
  // to the queue — approval is a human decision and the reviewer sees both
  // sides — but it can never slip through unmarked. Hash-only lookup; the
  // plaintext ID is never compared across accounts.
  const idHash = hashNationalId(parsed.normalized);
  const dupes = await sql<{ id: string }[]>`
    select id from public.id_verifications
    where national_id_hash = ${idHash}
      and status = 'approved'
      and profile_id <> ${profileId}
    limit 1
  `;
  const flaggedDuplicate = dupes.length > 0;
  if (flaggedDuplicate) {
    console.warn(
      `identity: national-ID hash collision — profile ${profileId} submitted an ID already approved elsewhere (flagged for review)`,
    );
  }

  return sql.begin(async (tx) => {
    const rows = await tx<IdVerification[]>`
      insert into public.id_verifications
        (profile_id, full_name, national_id_number, front_path, back_path,
         national_id_hash, flagged_duplicate)
      values
        (${profileId}, ${input.full_name}, ${parsed.normalized},
         ${input.front_path}, ${input.back_path ?? null},
         ${idHash}, ${flaggedDuplicate})
      returning ${tx.unsafe(ID_COLUMNS)}
    `;
    await tx`update public.profiles set id_verification_status = 'pending' where id = ${profileId}`;
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    return rows[0]!;
  });
}

export async function getVerificationStatus(profileId: string): Promise<VerificationStatus> {
  await ensureProfile(profileId);
  const sql = getDb();
  const prof = await sql<
    { phone: string | null; phone_verified: boolean; id_verification_status: string }[]
  >`
    select phone, phone_verified, id_verification_status from public.profiles where id = ${profileId}
  `;
  const latest = await sql<IdVerification[]>`
    select ${sql.unsafe(ID_COLUMNS)} from public.id_verifications
    where profile_id = ${profileId} order by created_at desc limit 1
  `;
  const p = prof[0];
  return {
    phone: p?.phone ?? null,
    phone_verified: p?.phone_verified ?? false,
    id_verification_status:
      (p?.id_verification_status as VerificationStatus["id_verification_status"]) ?? "unverified",
    latest_id: latest[0] ?? null,
  };
}

// --- staff review ----------------------------------------------------------

export async function listPendingIdentity(): Promise<IdVerification[]> {
  const sql = getDb();
  return sql<IdVerification[]>`
    select ${sql.unsafe(ID_COLUMNS)} from public.id_verifications
    where status = 'pending' order by created_at limit 200
  `;
}

export async function reviewIdentity(
  id: string,
  staffId: string,
  approve: boolean,
  note: string | null,
): Promise<IdVerification> {
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    const locked = await tx<{ profile_id: string; status: string }[]>`
      select profile_id, status from public.id_verifications where id = ${id} for update
    `;
    const row = locked[0];
    if (!row) throw new IdentityError("not_found", "Verification not found");
    if (row.status !== "pending") throw new IdentityError("conflict", "Already reviewed");

    const updated = await tx<IdVerification[]>`
      update public.id_verifications
      set status = ${approve ? "approved" : "rejected"}, review_note = ${note},
          reviewed_by = ${staffId}, reviewed_at = now()
      where id = ${id}
      returning ${tx.unsafe(ID_COLUMNS)}
    `;
    await tx`
      update public.profiles set id_verification_status = ${approve ? "verified" : "rejected"}
      where id = ${row.profile_id}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    return { verification: updated[0]!, profileId: row.profile_id };
  });

  await notify(result.profileId, approve ? "identity_approved" : "identity_rejected", {});
  return result.verification;
}

/** Mint a short-lived signed URL for a stored document (staff review). */
export async function signDocUrl(id: string, which: "front" | "back"): Promise<string> {
  const sql = getDb();
  const rows = await sql<{ front_path: string; back_path: string | null }[]>`
    select front_path, back_path from public.id_verifications where id = ${id} limit 1
  `;
  const row = rows[0];
  if (!row) throw new IdentityError("not_found", "Verification not found");
  const path = which === "back" ? row.back_path : row.front_path;
  if (!path) throw new IdentityError("not_found", "Document not found");

  const { data, error } = await supabaseAdmin.storage
    .from("identity-docs")
    .createSignedUrl(path, 300);
  if (error || !data) throw new IdentityError("not_found", "Could not sign document URL");
  return data.signedUrl;
}
