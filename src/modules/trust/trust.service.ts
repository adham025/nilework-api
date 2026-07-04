import { getDb } from "@/core/db";
import { type RiskHit, detectOffPlatformSignals } from "./leak-detector";

/**
 * Risk-signal recording (Phase 4). Best-effort by design: signal storage must
 * never break the user action that triggered the scan — a chat message sends
 * even if the risk insert fails (logged loudly instead).
 */
export async function recordRiskSignals(
  profileId: string,
  sourceType: "message" | "offer" | "proposal" | "system",
  sourceId: string | null,
  hits: RiskHit[],
): Promise<void> {
  if (hits.length === 0) return;
  try {
    const sql = getDb();
    for (const hit of hits) {
      await sql`
        insert into public.risk_signals (profile_id, kind, severity, source_type, source_id, detail)
        values (${profileId}, ${hit.kind}, ${hit.severity}, ${sourceType}, ${sourceId},
                ${sql.json({ pattern: hit.pattern, excerpt: hit.excerpt } as never)})
      `;
    }
  } catch (err) {
    console.error(`risk_signals insert failed (${sourceType}/${sourceId}):`, err);
  }
}

/** Scan text and record any hits — the one-call hook for message/offer paths. */
export async function scanAndRecord(
  profileId: string,
  sourceType: "message" | "offer" | "proposal",
  sourceId: string | null,
  text: string,
): Promise<void> {
  await recordRiskSignals(profileId, sourceType, sourceId, detectOffPlatformSignals(text));
}

export interface RiskSignalRow {
  id: string;
  profile_id: string;
  display_name: string | null;
  kind: string;
  severity: string;
  source_type: string;
  source_id: string | null;
  detail: { pattern?: string; excerpt?: string };
  created_at: string;
}

/** Staff review queue: recent signals, newest first, with the profile name. */
export async function listRiskSignals(limit = 100): Promise<RiskSignalRow[]> {
  const sql = getDb();
  return sql<RiskSignalRow[]>`
    select r.id, r.profile_id, p.display_name, r.kind, r.severity,
           r.source_type, r.source_id, r.detail, r.created_at
    from public.risk_signals r
    join public.profiles p on p.id = r.profile_id
    order by r.created_at desc
    limit ${limit}
  `;
}
