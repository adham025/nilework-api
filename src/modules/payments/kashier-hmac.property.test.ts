import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeKashierSignature, verifyKashierSignature } from "./kashier.hmac";

/**
 * Property suite for the Kashier webhook signature (payment-integration-phase1
 * Req 4/16) — the security boundary between the internet and escrow funding.
 */

const fieldValueArb = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
);

/** A payload whose signatureKeys name a subset of its own fields, plus a valid signature. */
const signedPayloadArb = fc
  .record({
    fields: fc.dictionary(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/), fieldValueArb, {
      minKeys: 1,
      maxKeys: 8,
    }),
    secret: fc.string({ minLength: 8, maxLength: 64 }),
  })
  .map(({ fields, secret }) => {
    const keys = Object.keys(fields).filter((k) => k !== "signature" && k !== "signatureKeys");
    const data: Record<string, unknown> = { ...fields, signatureKeys: keys };
    const signature = computeKashierSignature(data, secret);
    data.signature = signature;
    return { data, secret, keys };
  })
  .filter(({ keys }) => keys.length > 0);

describe("Kashier signature — properties", () => {
  it("Property 1 (round-trip): a payload signed with the secret always verifies", () => {
    fc.assert(
      fc.property(signedPayloadArb, ({ data, secret }) => {
        expect(verifyKashierSignature(data, secret)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 2 (wrong secret): verification always fails with a different secret", () => {
    fc.assert(
      fc.property(signedPayloadArb, fc.string({ minLength: 8, maxLength: 64 }), (signed, other) => {
        fc.pre(other !== signed.secret);
        expect(verifyKashierSignature(signed.data, other)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 3 (tamper detection): changing any signed field breaks verification", () => {
    fc.assert(
      fc.property(
        signedPayloadArb,
        fc.nat(),
        fc.string({ minLength: 1 }),
        (signed, pick, extra) => {
          const key = signed.keys[pick % signed.keys.length] as string;
          const tampered = { ...signed.data, [key]: `${String(signed.data[key] ?? "")}${extra}` };
          expect(verifyKashierSignature(tampered, signed.secret)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property 4 (missing pieces): no signature or no signatureKeys never verifies", () => {
    fc.assert(
      fc.property(signedPayloadArb, ({ data, secret }) => {
        const noSig = { ...data };
        noSig.signature = undefined;
        expect(verifyKashierSignature(noSig, secret)).toBe(false);
        const noKeys = { ...data };
        noKeys.signatureKeys = undefined;
        expect(verifyKashierSignature(noKeys, secret)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 5 (no forgery from garbage): random unsigned payloads never verify", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fieldValueArb, { maxKeys: 6 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (payload, secret) => {
          // Unless it accidentally contains a valid signature (astronomically unlikely),
          // verification must fail rather than throw.
          expect(verifyKashierSignature(payload, secret)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("Kashier signature — header source (real webhook shape)", () => {
  it("verifies when the digest arrives via the x-kashier-signature header (no data.signature)", () => {
    fc.assert(
      fc.property(signedPayloadArb, ({ data, secret }) => {
        const headerSig = data.signature as string;
        const bodyOnly = { ...data };
        bodyOnly.signature = undefined; // server webhooks carry no body signature
        expect(verifyKashierSignature(bodyOnly, secret, headerSig)).toBe(true);
        expect(verifyKashierSignature(bodyOnly, secret)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
