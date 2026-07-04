-- 0035_identity_ocr — OCR assist columns for national-ID review (closes the
-- Phase-1 deferral). Populated fire-and-forget after submission by local
-- tesseract.js; shown to the reviewer as a cross-check against the typed
-- number. OCR never approves or rejects — humans decide (identity Req 3.7).

alter table public.id_verifications
  add column if not exists ocr_candidate text,
  add column if not exists ocr_confidence int;
