import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeDigits, parseEgyptianNationalId } from "./egyptian-id";

/** Governorate codes the parser accepts (mirror of the module's registry). */
const GOVS = [
  "01",
  "02",
  "03",
  "04",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "31",
  "32",
  "33",
  "34",
  "35",
  "88",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Arbitrary generating a structurally valid Egyptian national ID + its facts. */
const validIdArb = fc
  .record({
    year: fc.integer({ min: 1930, max: 2020 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // ≤28 keeps every month valid
    gov: fc.constantFrom(...GOVS),
    seq: fc.integer({ min: 0, max: 999 }),
    genderDigit: fc.integer({ min: 0, max: 9 }),
    check: fc.integer({ min: 0, max: 9 }),
  })
  .map(({ year, month, day, gov, seq, genderDigit, check }) => {
    const century = year < 2000 ? "2" : "3";
    const id = `${century}${pad(year % 100)}${pad(month)}${pad(day)}${gov}${String(seq).padStart(
      3,
      "0",
    )}${genderDigit}${check}`;
    return { id, year, month, day, gov, genderDigit };
  });

/** Map Western digits to Arabic-Indic (٠-٩). */
function toArabicIndic(western: string): string {
  return [...western].map((c) => String.fromCodePoint(0x0660 + Number(c))).join("");
}

describe("parseEgyptianNationalId — properties", () => {
  it("Property 1: all well-formed IDs parse valid with correct birthdate/governorate/gender", () => {
    fc.assert(
      fc.property(validIdArb, ({ id, year, month, day, gov, genderDigit }) => {
        const result = parseEgyptianNationalId(id);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.birthdate).toBe(`${year}-${pad(month)}-${pad(day)}`);
          expect(result.governorate).toBe(gov);
          expect(result.gender).toBe(genderDigit % 2 === 1 ? "M" : "F");
          expect(result.normalized).toBe(id);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("Property 2: any string that is not exactly 14 digits fails with 'length'", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }).filter((s) => !/^\s*[\d٠-٩۰-۹ ]{14}\s*$/.test(s)),
        (s) => {
          const result = parseEgyptianNationalId(s);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("Property 3a: invalid century marker fails with 'century'", () => {
    fc.assert(
      fc.property(
        validIdArb,
        fc.constantFrom("0", "1", "4", "5", "6", "7", "8", "9"),
        ({ id }, badCentury) => {
          const mutated = badCentury + id.slice(1);
          const result = parseEgyptianNationalId(mutated);
          expect(result).toEqual({ valid: false, reason: "century" });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3b: impossible birth month fails with 'birthdate'", () => {
    fc.assert(
      fc.property(validIdArb, fc.integer({ min: 13, max: 99 }), ({ id }, badMonth) => {
        const mutated = id.slice(0, 3) + pad(badMonth) + id.slice(5);
        const result = parseEgyptianNationalId(mutated);
        expect(result).toEqual({ valid: false, reason: "birthdate" });
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3c: unknown governorate code fails with 'governorate'", () => {
    const badGovs = ["00", "05", "10", "20", "30", "36", "50", "99"];
    fc.assert(
      fc.property(validIdArb, fc.constantFrom(...badGovs), ({ id }, badGov) => {
        const mutated = id.slice(0, 7) + badGov + id.slice(9);
        const result = parseEgyptianNationalId(mutated);
        expect(result).toEqual({ valid: false, reason: "governorate" });
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: Arabic-Indic digit input parses identically to Western digits", () => {
    fc.assert(
      fc.property(validIdArb, ({ id }) => {
        const western = parseEgyptianNationalId(id);
        const arabic = parseEgyptianNationalId(toArabicIndic(id));
        expect(arabic).toEqual(western);
      }),
      { numRuns: 150 },
    );
  });

  it("Property 5: the parser is deterministic", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (s) => {
        expect(parseEgyptianNationalId(s)).toEqual(parseEgyptianNationalId(s));
      }),
      { numRuns: 150 },
    );
  });
});

describe("parseEgyptianNationalId — examples", () => {
  it("parses a canonical 1990s Cairo ID", () => {
    // 2 90 01 15 01 234 5 6 → born 1990-01-15, Cairo, digit 13 = 5 (odd → M)
    const result = parseEgyptianNationalId("29001150123456");
    expect(result).toEqual({
      valid: true,
      birthdate: "1990-01-15",
      governorate: "01",
      gender: "M",
      normalized: "29001150123456",
    });
  });

  it("parses a 2000s ID with even gender digit as female", () => {
    // 3 05 06 20 21 111 2 0 → born 2005-06-20, Giza, digit 13 = 2 (even → F)
    const result = parseEgyptianNationalId("30506202111120");
    expect(result).toMatchObject({ valid: true, birthdate: "2005-06-20", gender: "F" });
  });

  it("rejects Feb 30", () => {
    expect(parseEgyptianNationalId("29002300123456")).toEqual({
      valid: false,
      reason: "birthdate",
    });
  });

  it("accepts Feb 29 in a leap year and rejects it otherwise", () => {
    // 1996 is a leap year (296 02 29...), 1995 is not
    expect(parseEgyptianNationalId("29602290123456").valid).toBe(true);
    expect(parseEgyptianNationalId("29502290123456")).toEqual({
      valid: false,
      reason: "birthdate",
    });
  });

  it("rejects future birthdates", () => {
    // Century 3, year 99 → 2099
    expect(parseEgyptianNationalId("39901010123456")).toEqual({
      valid: false,
      reason: "birthdate",
    });
  });

  it("strips spaces and normalizes before validating", () => {
    expect(parseEgyptianNationalId(" 29001150123456 ").valid).toBe(true);
  });
});

describe("normalizeDigits", () => {
  it("maps Arabic-Indic and Extended Arabic-Indic to Western", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
});
