/**
 * Egyptian national-ID structural parser (freelancer-onboarding task 1.3 /
 * identity-verification Req 3). Pure and deterministic — no I/O, no side
 * effects — so it is property-testable and shareable between the submission
 * validator, the OCR assist, and the admin review view.
 *
 * 14-digit layout `C YYMMDD GG SSSG K`:
 *  - digit 1        century marker: 2 → 1900s, 3 → 2000s
 *  - digits 2–7     birthdate YYMMDD (must be a real, non-future date)
 *  - digits 8–9     governorate code (official registry set below)
 *  - digits 10–13   birth sequence; digit 13's parity encodes gender (odd = M)
 *  - digit 14       check digit — the algorithm is not officially published,
 *                    so it is accepted as-is rather than risking false rejects
 *                    (deviation from "checksum validation" documented in spec).
 *
 * Parser output only ever ASSISTS review — approval is always a human decision
 * (identity-verification Req 3.7).
 */

/** Valid governorate codes per the civil registry (88 = born abroad). */
const GOVERNORATE_CODES = new Set([
  "01", // Cairo
  "02", // Alexandria
  "03", // Port Said
  "04", // Suez
  "11", // Damietta
  "12", // Dakahlia
  "13", // Sharqia
  "14", // Qalyubia
  "15", // Kafr El Sheikh
  "16", // Gharbia
  "17", // Monufia
  "18", // Beheira
  "19", // Ismailia
  "21", // Giza
  "22", // Beni Suef
  "23", // Fayoum
  "24", // Minya
  "25", // Assiut
  "26", // Sohag
  "27", // Qena
  "28", // Aswan
  "29", // Luxor
  "31", // Red Sea
  "32", // New Valley
  "33", // Matrouh
  "34", // North Sinai
  "35", // South Sinai
  "88", // Born abroad
]);

export type EgyptianIdParseResult =
  | {
      valid: true;
      /** ISO date (YYYY-MM-DD) decoded from the century marker + YYMMDD. */
      birthdate: string;
      /** Two-digit governorate code (see GOVERNORATE_CODES). */
      governorate: string;
      gender: "M" | "F";
      /** The normalized (Western-digit) 14-character ID. */
      normalized: string;
    }
  | {
      valid: false;
      reason: "length" | "century" | "birthdate" | "governorate";
    };

/**
 * Normalize Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to
 * Western digits, and strip whitespace — users paste IDs in either script.
 */
export function normalizeDigits(raw: string): string {
  let out = "";
  for (const ch of raw.trim()) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0660 && cp <= 0x0669) {
      out += String(cp - 0x0660); // Arabic-Indic
    } else if (cp >= 0x06f0 && cp <= 0x06f9) {
      out += String(cp - 0x06f0); // Extended Arabic-Indic
    } else if (ch !== " " && ch !== " ") {
      out += ch;
    }
  }
  return out;
}

/** Days per month, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse and structurally validate an Egyptian national ID. Pure. */
export function parseEgyptianNationalId(raw: string): EgyptianIdParseResult {
  const id = normalizeDigits(raw);

  if (!/^\d{14}$/.test(id)) return { valid: false, reason: "length" };

  const century = id[0];
  if (century !== "2" && century !== "3") return { valid: false, reason: "century" };

  const yy = Number(id.slice(1, 3));
  const mm = Number(id.slice(3, 5));
  const dd = Number(id.slice(5, 7));
  const year = (century === "2" ? 1900 : 2000) + yy;

  if (mm < 1 || mm > 12) return { valid: false, reason: "birthdate" };
  if (dd < 1 || dd > daysInMonth(year, mm)) return { valid: false, reason: "birthdate" };

  const birthdate = new Date(Date.UTC(year, mm - 1, dd));
  if (birthdate.getTime() > Date.now()) return { valid: false, reason: "birthdate" };

  const governorate = id.slice(7, 9);
  if (!GOVERNORATE_CODES.has(governorate)) return { valid: false, reason: "governorate" };

  // Digit 13 (index 12) parity: odd = male, even = female.
  const gender = Number(id[12]) % 2 === 1 ? "M" : "F";

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    valid: true,
    birthdate: `${year}-${pad(mm)}-${pad(dd)}`,
    governorate,
    gender,
    normalized: id,
  };
}
