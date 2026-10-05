import { describe, expect, expectTypeOf, it } from "vitest";
import type { SecurityPolicy, SecuritySignal, ThreatSignature } from "../src/index.js";
import {
  classifySecuritySignal,
  decideSecurityPolicy,
  issueDefensiveBroadcast,
  requestSecurityOverride,
  validateThreatSignature,
} from "../src/index.js";

/**
 * Acceptance scenarios 6, 7, 8 — the security immune system:
 *   6. fake review / review-ring signal,
 *   7. seller ships a different product,
 *   8. buyer falsely claims a different product arrived.
 * Pipeline: signal → classify → defensive signature → deterministic policy
 * decision (BLOCK is final; invariant 24). Signatures and broadcasts are
 * DEFENSIVE ONLY (invariants 25/49).
 */

const POLICY: SecurityPolicy = { policyVersion: "sec-pol-1", blockThresholdBps: 8000 };
const AT = "2026-11-05T12:00:00.000Z";

function signal(input: Partial<SecuritySignal> & Pick<SecuritySignal, "domain" | "indicators" | "subjectRefs">): SecuritySignal {
  return { signalId: "signal-1", detectedAt: AT, correlationPolicyRef: "policy://security/correlation-v1", ...input };
}

describe("scenario 6 — fake review / review-ring", () => {
  const ringSignal = signal({
    domain: "REVIEW",
    subjectRefs: [
      { principalId: "acct-1", kind: "user" },
      { principalId: "acct-2", kind: "user" },
      { principalId: "acct-3", kind: "user" },
      { principalId: "acct-4", kind: "user" },
      { principalId: "acct-5", kind: "user" },
    ],
    indicators: [
      { indicatorKind: "duplicate-content-fingerprint", value: "fp:9f2c…", confidenceBps: 9500 },
      { indicatorKind: "shared-device-fingerprint", value: "dev:aa11", confidenceBps: 8800 },
      { indicatorKind: "burst-timing-pattern", value: "window:6h", confidenceBps: 8100 },
    ],
  });

  it("classifies coordinated review manipulation as a review ring", () => {
    const classification = classifySecuritySignal(ringSignal, AT);
    expect(classification.threatClass).toBe("REVIEW_RING");
    expect(classification.classifiedBy).toBe("deterministic-rule");
  });

  it("issues a deterministic BLOCK policy decision that is final", () => {
    const classification = classifySecuritySignal(ringSignal, AT);
    const decision = decideSecurityPolicy(classification, POLICY, AT);
    expect(decision.action).toBe("BLOCK");
    expect(decision.final).toBe(true);

    // Determinism: identical inputs produce identical decisions.
    const again = decideSecurityPolicy(classification, POLICY, AT);
    expect(again).toEqual(decision);
  });

  it("makes BLOCK non-overridable — no model preference can reverse it", () => {
    const classification = classifySecuritySignal(ringSignal, AT);
    const decision = decideSecurityPolicy(classification, POLICY, AT);
    const override = requestSecurityOverride(decision);
    expect(override).toEqual({ granted: false, reason: "BLOCK_IS_FINAL_DETERMINISTIC" });
  });

  it("publishes only a DEFENSIVE signature for the confirmed ring", () => {
    const broadcast = issueDefensiveBroadcast({
      broadcastId: "broadcast-1",
      audienceRefs: [{ principalId: "merchant-kantamanto", kind: "merchant" }],
      issuedAt: AT,
      signature: {
        signatureId: "sig-ring-1",
        threatClass: "REVIEW_RING",
        indicators: [
          { indicatorKind: "behavioral-pattern", value: "same-content-fingerprint-across>=5-accounts" },
          { indicatorKind: "device-fingerprint", value: "dev:aa11" },
        ],
        mitigations: [
          { mitigationKind: "policy-rule", guidance: "hold affected reviews from rating aggregation pending verification" },
          { mitigationKind: "verification-step", guidance: "require purchase-verified review eligibility for flagged accounts" },
        ],
        publishedAt: AT,
      },
    });
    expect(broadcast.signature.threatClass).toBe("REVIEW_RING");
    expect(broadcast.signature.mitigations.length).toBeGreaterThan(0);
  });
});

describe("scenario 7 — seller ships a different product", () => {
  const substitutionSignal = signal({
    domain: "SHIPMENT",
    subjectRefs: [
      { principalId: "merchant-shady", kind: "merchant" },
      { principalId: "order-8812", kind: "user" },
    ],
    indicators: [
      { indicatorKind: "sku-mismatch", value: "declared:SKU-A ordered vs shipped:SKU-B observed at pack station", confidenceBps: 9200 },
      { indicatorKind: "declared-vs-observed-conflict", value: "pack-scan vs order-line mismatch", confidenceBps: 8900 },
    ],
  });

  it("classifies wrong-item shipment and blocks release deterministically", () => {
    const classification = classifySecuritySignal(substitutionSignal, AT);
    expect(classification.threatClass).toBe("WRONG_ITEM_SHIPMENT");
    const decision = decideSecurityPolicy(classification, POLICY, AT);
    expect(decision.action).toBe("BLOCK");
    expect(decision.final).toBe(true);
    expect(requestSecurityOverride(decision).granted).toBe(false);
  });
});

describe("scenario 8 — buyer falsely claims a different product arrived", () => {
  const falseClaimSignal = signal({
    domain: "CLAIM",
    subjectRefs: [{ principalId: "user-deceptive", kind: "user" }],
    indicators: [
      { indicatorKind: "claim-subject-mismatch", value: "claim=item-not-as-described", confidenceBps: 7000 },
      { indicatorKind: "delivery-confirmation-conflict", value: "courier weight+photo evidence matches ordered SKU", confidenceBps: 8400 },
    ],
  });

  it("classifies the false item-not-as-described claim and quarantines it for review", () => {
    const classification = classifySecuritySignal(falseClaimSignal, AT);
    expect(classification.threatClass).toBe("FALSE_ITEM_NOT_AS_DESCRIBED");
    const decision = decideSecurityPolicy(classification, POLICY, AT);
    // Claims require evidence arbitration: quarantine + review, not auto-block.
    expect(decision.action).toBe("QUARANTINE");
    expect(decision.final).toBe(false);
  });

  it("keeps false non-delivery claims a distinct threat class", () => {
    const nonDelivery = signal({
      domain: "CLAIM",
      subjectRefs: [{ principalId: "user-deceptive", kind: "user" }],
      indicators: [
        { indicatorKind: "claim-subject-mismatch", value: "claim=non-delivery", confidenceBps: 7000 },
        { indicatorKind: "delivery-confirmation-conflict", value: "signed delivery proof on file", confidenceBps: 8600 },
      ],
    });
    expect(classifySecuritySignal(nonDelivery, AT).threatClass).toBe("FALSE_NON_DELIVERY");
  });
});

describe("defensive-only threat signatures", () => {
  const VALID_SIGNATURE = {
    signatureId: "sig-1",
    threatClass: "REVIEW_RING",
    indicators: [{ indicatorKind: "behavioral-pattern", value: "duplicate-review-content-fingerprint" }],
    mitigations: [{ mitigationKind: "policy-rule", guidance: "exclude flagged reviews from aggregation" }],
    publishedAt: AT,
  } as const;

  it("accepts a defensive signature carrying indicators and mitigations", () => {
    expect(validateThreatSignature(VALID_SIGNATURE)).toEqual({ valid: true });
  });

  it("rejects weaponized field names — exploit payloads are not expressible in the contract surface", () => {
    const weaponized = {
      ...VALID_SIGNATURE,
      exploitPayload: "<script>stealSession()</script>",
    };
    const result = validateThreatSignature(weaponized);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("WEAPONIZED_FIELD_NAME");
  });

  it("rejects unknown/undeclared fields", () => {
    const smuggled = { ...VALID_SIGNATURE, authorNotes: "internal commentary" };
    const result = validateThreatSignature(smuggled);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("UNKNOWN_FIELD");

    // Reproduction-step fields are weaponization-shaped and rejected as such.
    const repro = { ...VALID_SIGNATURE, stepsToReproduce: "1. …" };
    const reproResult = validateThreatSignature(repro);
    if (!reproResult.valid) expect(reproResult.reason).toBe("WEAPONIZED_FIELD_NAME");
  });

  it("rejects executable weaponized content inside indicator values", () => {
    const injected = {
      ...VALID_SIGNATURE,
      indicators: [{ indicatorKind: "content-fingerprint", value: "<script>alert(document.cookie)</script>" }],
    };
    const result = validateThreatSignature(injected);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("WEAPONIZED_CONTENT");
  });

  it("rejects signatures without defensive mitigations", () => {
    const noMitigation = { ...VALID_SIGNATURE, mitigations: [] };
    const result = validateThreatSignature(noMitigation);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("MISSING_MITIGATION");
  });

  it("refuses to broadcast a weaponized signature", () => {
    expect(() =>
      issueDefensiveBroadcast({
        broadcastId: "broadcast-2",
        audienceRefs: [{ principalId: "merchant-x", kind: "merchant" }],
        issuedAt: AT,
        signature: { ...VALID_SIGNATURE, exploitPayload: "rm -rf /" },
      }),
    ).toThrow(/defensive-only/i);
  });

  it("cannot express weaponized payload fields in the ThreatSignature type itself", () => {
    expectTypeOf<Extract<keyof ThreatSignature, "exploitPayload" | "payload" | "weapon" | "attackScript">>().toEqualTypeOf<never>();
    expectTypeOf<ThreatSignature["indicators"]>().not.toEqualTypeOf<unknown[]>();
  });
});
