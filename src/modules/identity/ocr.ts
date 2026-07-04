import { createWorker } from "tesseract.js";
import { parseEgyptianNationalId } from "./egyptian-id";

/**
 * OCR assist for national-ID review (closes the Phase-1 deferral). Local
 * tesseract.js (WASM) — no API, no cost. Runs fire-and-forget after
 * submission; output only PRE-FILLS the reviewer's view and cross-checks the
 * typed number. It never approves or rejects anything (identity Req 3.7/4).
 *
 * 'ara+eng' covers both digit scripts on Egyptian cards; extraction folds
 * Arabic-Indic digits and hunts for a 14-digit run that also passes the
 * structural parser.
 */

export interface OcrResult {
  /** Structurally valid 14-digit candidate, or null when none found. */
  candidate: string | null;
  /** Tesseract mean confidence 0–100 for the whole read. */
  confidence: number;
}

/** Fold Arabic-Indic digits and strip everything but digits, keeping order. */
function digitRuns(text: string): string[] {
  let folded = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0660 && cp <= 0x0669) folded += String(cp - 0x0660);
    else if (cp >= 0x06f0 && cp <= 0x06f9) folded += String(cp - 0x06f0);
    else folded += ch;
  }
  return folded.match(/\d[\d\s-]{12,30}\d/g) ?? [];
}

/** Extract a structurally valid national-ID candidate from an image buffer. */
export async function extractNationalId(image: Buffer): Promise<OcrResult> {
  const worker = await createWorker(["ara", "eng"]);
  try {
    const { data } = await worker.recognize(image);
    for (const run of digitRuns(data.text)) {
      const compact = run.replace(/[\s-]/g, "");
      // Slide a 14-char window across longer runs (card numbers sit near other digits).
      for (let start = 0; start + 14 <= compact.length; start++) {
        const window = compact.slice(start, start + 14);
        if (parseEgyptianNationalId(window).valid) {
          return { candidate: window, confidence: Math.round(data.confidence) };
        }
      }
    }
    return { candidate: null, confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
}
