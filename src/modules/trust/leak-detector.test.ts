import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectOffPlatformSignals } from "./leak-detector";

/** Map Western digits to Arabic-Indic for adversarial inputs. */
function toArabicIndic(s: string): string {
  return [...s].map((c) => (/\d/.test(c) ? String.fromCodePoint(0x0660 + Number(c)) : c)).join("");
}

const hasPattern = (hits: ReturnType<typeof detectOffPlatformSignals>, p: string) =>
  hits.some((h) => h.pattern === p);

describe("detectOffPlatformSignals — properties", () => {
  const egPhoneArb = fc
    .record({
      prefix: fc.constantFrom("010", "011", "012", "015"),
      rest: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
    })
    .map(({ prefix, rest }) => prefix + rest.join(""));

  it("Property 1: any Egyptian mobile number embedded in text is caught", () => {
    fc.assert(
      fc.property(egPhoneArb, fc.string({ maxLength: 30 }), (phone, noise) => {
        const clean = noise.replace(/[\d@]/g, "");
        const hits = detectOffPlatformSignals(`${clean} call me ${phone} ok`);
        expect(hasPattern(hits, "egyptian_phone")).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 2: the same number in Arabic-Indic digits is caught identically", () => {
    fc.assert(
      fc.property(egPhoneArb, (phone) => {
        const western = detectOffPlatformSignals(`رقمي ${phone}`);
        const arabic = detectOffPlatformSignals(`رقمي ${toArabicIndic(phone)}`);
        expect(hasPattern(western, "egyptian_phone")).toBe(true);
        expect(hasPattern(arabic, "egyptian_phone")).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 3: spacing/dashes inside the number do not evade detection", () => {
    fc.assert(
      fc.property(egPhoneArb, fc.constantFrom(" ", "-", "  "), (phone, sep) => {
        const spaced = phone.split("").join(sep);
        const hits = detectOffPlatformSignals(`whats my number? ${spaced}`);
        expect(hasPattern(hits, "egyptian_phone")).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 4: determinism — same text, same hits", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        expect(detectOffPlatformSignals(text)).toEqual(detectOffPlatformSignals(text));
      }),
      { numRuns: 300 },
    );
  });

  it("Property 5: digit-free, keyword-free prose never fires", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-hj-z .,!?]{0,120}$/), // no digits, no @, no 'i' (avoids insta/whatsapp letters aligning)
        (text) => {
          fc.pre(!/whats|telegram|insta|facebook|fb\.com|cash|instapay|pay/.test(text));
          expect(detectOffPlatformSignals(text)).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("detectOffPlatformSignals — bilingual examples", () => {
  it("catches WhatsApp luring in Arabic and English", () => {
    expect(hasPattern(detectOffPlatformSignals("كلمني واتساب احسن"), "whatsapp")).toBe(true);
    expect(hasPattern(detectOffPlatformSignals("add me on WhatsApp"), "whatsapp")).toBe(true);
    expect(hasPattern(detectOffPlatformSignals("whats app me bro"), "whatsapp")).toBe(true);
  });

  it("catches wallet-transfer luring in Arabic and English", () => {
    expect(hasPattern(detectOffPlatformSignals("ابعت الفلوس فودافون كاش"), "wallet_transfer")).toBe(
      true,
    );
    expect(
      hasPattern(detectOffPlatformSignals("send it via Vodafone Cash"), "wallet_transfer"),
    ).toBe(true);
    expect(hasPattern(detectOffPlatformSignals("حولها انستا باي"), "wallet_transfer")).toBe(true);
  });

  it("catches pay-outside phrasing in Arabic and English", () => {
    expect(
      hasPattern(detectOffPlatformSignals("ندفع خارج المنصة ونوفر العمولة"), "pay_outside"),
    ).toBe(true);
    expect(
      hasPattern(detectOffPlatformSignals("just pay me directly and save the fee"), "pay_outside"),
    ).toBe(true);
  });

  it("catches IBANs and emails", () => {
    expect(
      hasPattern(detectOffPlatformSignals("EG380019000500000000263180002 is my account"), "iban"),
    ).toBe(true);
    expect(
      hasPattern(detectOffPlatformSignals("mail me at amira@example.com"), "email_address"),
    ).toBe(true);
  });

  it("stays quiet on normal work chat (ar + en)", () => {
    expect(detectOffPlatformSignals("تمام، هبعت التصميم بكرة الصبح إن شاء الله")).toEqual([]);
    expect(
      detectOffPlatformSignals("The logo draft looks great, please tweak the colors."),
    ).toEqual([]);
  });
});
