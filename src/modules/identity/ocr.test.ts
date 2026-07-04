import { describe, expect, it } from "vitest";
import { extractNationalId } from "./ocr";

/**
 * Closed-loop OCR test: render a real (structurally valid) national ID into a
 * PNG with jimp, then require tesseract to read it back and the extractor to
 * find the exact 14-digit candidate. Slow (~seconds; downloads traineddata on
 * first run) but it proves the whole image→digits→parser pipeline with zero
 * mocks. Western digits here — Arabic-Indic on real cards is covered by the
 * digit folding in digitRuns (unit-testable) and manual review remains the
 * decider either way.
 */
describe("extractNationalId — closed loop", () => {
  it("reads a rendered valid ID out of a PNG", async () => {
    const { Jimp, loadFont, HorizontalAlign, VerticalAlign } = await import("jimp");
    const { SANS_32_BLACK } = await import("jimp/fonts");

    const NID = "29001150123456"; // 1990-01-15, Cairo, structurally valid
    const image = new Jimp({ width: 640, height: 160, color: 0xffffffff });
    const font = await loadFont(SANS_32_BLACK);
    image.print({
      font,
      x: 0,
      y: 0,
      text: {
        text: NID,
        alignmentX: HorizontalAlign.CENTER,
        alignmentY: VerticalAlign.MIDDLE,
      },
      maxWidth: 640,
      maxHeight: 160,
    });
    const png = await image.getBuffer("image/png");

    const result = await extractNationalId(png);
    expect(result.candidate).toBe(NID);
    expect(result.confidence).toBeGreaterThan(0);
  }, 120_000);

  it("returns null candidate on an image with no valid ID", async () => {
    const { Jimp } = await import("jimp");
    const blank = new Jimp({ width: 320, height: 80, color: 0xffffffff });
    const png = await blank.getBuffer("image/png");
    const result = await extractNationalId(png);
    expect(result.candidate).toBeNull();
  }, 120_000);
});
