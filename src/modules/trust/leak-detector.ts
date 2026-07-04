/**
 * Off-platform-luring detector (Phase 4: backend intelligence, fraud/scam).
 *
 * The #1 marketplace fraud vector is moving the deal off-platform — "add me on
 * WhatsApp", "pay me on Vodafone Cash directly" — which strips both sides of
 * escrow protection. This pure, deterministic scanner flags those signals in
 * user text (Arabic + English, Arabic-Indic digits normalized) so staff can
 * review. It never blocks the message: false positives are cheap for a
 * reviewer and fatal for chat UX.
 *
 * No LLM/API: pattern rules are free, fast, explainable to the reviewer, and
 * property-testable — the right tool at this scale.
 */

export type RiskKind = "off_platform_contact" | "off_platform_payment";
export type RiskSeverity = "low" | "medium" | "high";

export interface RiskHit {
  kind: RiskKind;
  severity: RiskSeverity;
  /** Stable label of the rule that fired (shown to reviewers). */
  pattern: string;
  /** Short excerpt around the match (max ~60 chars, for reviewer context). */
  excerpt: string;
}

interface Rule {
  kind: RiskKind;
  severity: RiskSeverity;
  pattern: string;
  regex: RegExp;
}

const RULES: Rule[] = [
  // --- contact leakage -------------------------------------------------------
  {
    kind: "off_platform_contact",
    severity: "high",
    pattern: "egyptian_phone",
    // 01[0125] + 8 digits, tolerating spaces/dashes between ANY digits
    // (property-tested: separator-splitting the whole number must not evade),
    // or the +20 international form.
    regex: /(?:\+?2[\s-]*0[\s-]*)?0?[\s-]*1[\s-]*[0125](?:[\s-]*\d){8}/,
  },
  {
    kind: "off_platform_contact",
    severity: "high",
    pattern: "whatsapp",
    regex: /whats\s?app|wh?ats?app|واتس\s?اب|واتساب|وتساب/i,
  },
  {
    kind: "off_platform_contact",
    severity: "medium",
    pattern: "telegram_or_signal",
    regex: /telegram|t\.me\/|تليجرام|تلغرام|سيجنال/i,
  },
  {
    kind: "off_platform_contact",
    severity: "low",
    pattern: "social_handle",
    regex: /instagram|insta\b|فيسبوك|facebook|انستجرام|انستقرام|fb\.com/i,
  },
  {
    kind: "off_platform_contact",
    severity: "medium",
    pattern: "email_address",
    regex: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  },
  // --- payment leakage -------------------------------------------------------
  {
    kind: "off_platform_payment",
    severity: "high",
    pattern: "wallet_transfer",
    regex:
      /vodafone\s?cash|فودافون\s?كاش|orange\s?(cash|money)|اورنج\s?كاش|etisalat\s?cash|اتصالات\s?كاش|instapay|انستا\s?باي/i,
  },
  {
    kind: "off_platform_payment",
    severity: "high",
    pattern: "iban",
    regex: /\bEG\s?(?:\d\s?){25,27}\b/i,
  },
  {
    kind: "off_platform_payment",
    severity: "high",
    pattern: "pay_outside",
    regex:
      /pay\s+(me\s+)?(outside|directly|off)|خارج\s+(الموقع|المنصة|التطبيق)|(الدفع|ادفع|حول|حوّل)\s+(لي\s+)?(مباشرة|برة|بره)/i,
  },
];

/**
 * Fold Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to Western,
 * preserving every other character (unlike the identity module's normalizer,
 * which also strips whitespace — wrong for prose).
 */
function foldDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0660 && cp <= 0x0669) out += String(cp - 0x0660);
    else if (cp >= 0x06f0 && cp <= 0x06f9) out += String(cp - 0x06f0);
    else out += ch;
  }
  return out;
}

/** Excerpt around a match: enough context to review, short enough to store. */
function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/**
 * Scan a piece of user text for off-platform signals. Pure + deterministic.
 * Arabic-Indic digits are normalized first so "٠١٠١٢٣٤٥٦٧٨" is caught like
 * "01012345678". Returns at most one hit per rule (the first occurrence).
 */
export function detectOffPlatformSignals(rawText: string): RiskHit[] {
  const text = foldDigits(rawText);
  const hits: RiskHit[] = [];
  for (const rule of RULES) {
    const match = rule.regex.exec(text);
    if (match) {
      hits.push({
        kind: rule.kind,
        severity: rule.severity,
        pattern: rule.pattern,
        excerpt: excerptAround(text, match.index, match[0].length).slice(0, 120),
      });
    }
  }
  return hits;
}
