import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuthorizationDecision, CommerceCommandIntent, ProofPinnedAction, UserTrust } from "../src/index.js";
import {
  ProofLevel,
  PROOF_LEVELS,
  buildCommerceSubmission,
  buildConsequentialSubmission,
  commerceCommandPayloadRef,
  commerceCommandType,
  determineRequiredProofLevel,
  idempotencyKey,
  pinProofSelection,
  proofLevelRank,
} from "../src/index.js";

/**
 * Acceptance scenario 10 — P0–P5 proof selection. The proof level is
 * selected BEFORE consequential execution (invariant 23); trust never
 * substitutes for proof (invariant 22).
 */

const PRINCIPAL = { principalId: "user-amara", kind: "user" } as const;
const AUTHORIZED: AuthorizationDecision = {
  decision: "AUTHORIZED",
  decidedBy: PRINCIPAL,
  policyVersion: "policy-1",
  decidedAt: "2026-11-05T08:00:00.000Z",
};

function buildIntent(commandType: string): CommerceCommandIntent {
  return {
    commandId: `cmd-${commandType}`,
    commandType: commerceCommandType(commandType),
    payloadRef: commerceCommandPayloadRef(`payload://${commandType}`),
    proposedBy: { principalId: "agent-main-7", kind: "agent" },
    onBehalfOf: PRINCIPAL,
    idempotencyKey: idempotencyKey(`idem-${commandType}`),
  };
}

describe("scenario 10 — P0–P5 proof selection before consequential execution", () => {
  it("defines the six ordered proof levels P0..P5", () => {
    expect(PROOF_LEVELS).toEqual(["P0", "P1", "P2", "P3", "P4", "P5"]);
    for (let i = 1; i < PROOF_LEVELS.length; i += 1) {
      expect(proofLevelRank(PROOF_LEVELS[i] as ProofLevel)).toBeGreaterThan(proofLevelRank(PROOF_LEVELS[i - 1] as ProofLevel));
    }
  });

  it("deterministically derives the required level from action class — all six levels reachable", () => {
    expect(determineRequiredProofLevel({ impact: "LOW" })).toBe("P0");
    expect(determineRequiredProofLevel({ impact: "MEDIUM" })).toBe("P1");
    expect(determineRequiredProofLevel({ impact: "HIGH" })).toBe("P2");
    expect(determineRequiredProofLevel({ impact: "MEDIUM", counterpartyExposure: true })).toBe("P2");
    expect(determineRequiredProofLevel({ impact: "HIGH", counterpartyExposure: true })).toBe("P3");
    expect(determineRequiredProofLevel({ impact: "IRREVERSIBLE" })).toBe("P4");
    expect(determineRequiredProofLevel({ impact: "LOW", settlementFinality: true })).toBe("P5");
    // Determinism: same inputs, same output.
    expect(determineRequiredProofLevel({ impact: "IRREVERSIBLE", counterpartyExposure: true })).toBe(
      determineRequiredProofLevel({ impact: "IRREVERSIBLE", counterpartyExposure: true }),
    );
  });

  it("pins a proof selection for each of P0..P5 before execution", () => {
    for (const level of PROOF_LEVELS) {
      const pin = pinProofSelection("action://checkout/77", {
        selectedLevel: level,
        selectedAt: "2026-11-05T07:59:00.000Z",
        requirement: { minimumLevel: level, rationale: `consequential execution requires ${level}` },
        selectorRef: PRINCIPAL,
      });
      expect(pin.proofSelection.selectedLevel).toBe(level);
    }
  });

  it("refuses pins below the declared minimum requirement", () => {
    expect(() =>
      pinProofSelection("action://checkout/78", {
        selectedLevel: "P1",
        selectedAt: "2026-11-05T07:59:00.000Z",
        requirement: { minimumLevel: "P4", rationale: "irreversible economic action" },
        selectorRef: PRINCIPAL,
      }),
    ).toThrow(/minimum/i);
  });

  it("requires the proof pin on the consequential submission path — trust cannot stand in for it", () => {
    const pin = pinProofSelection("action://checkout/79", {
      selectedLevel: "P4",
      selectedAt: "2026-11-05T07:59:00.000Z",
      requirement: { minimumLevel: "P4", rationale: "irreversible" },
      selectorRef: PRINCIPAL,
    });
    const submission = buildConsequentialSubmission({
      intent: buildIntent("payment.execute"),
      authorization: AUTHORIZED,
      proofPin: pin,
      submittedAt: "2026-11-05T08:00:00.000Z",
    });
    expect(submission.proofPin?.proofSelection.selectedLevel).toBe("P4");

    // The non-consequential path carries no pin at all.
    const casual = buildCommerceSubmission({
      intent: buildIntent("catalog.read"),
      authorization: AUTHORIZED,
      submittedAt: "2026-11-05T08:00:00.000Z",
    });
    expect(casual.proofPin).toBeUndefined();

    // A trust record is structurally rejected as a proof pin.
    const userTrust: UserTrust = {
      trustRecordId: "trust-user-1",
      kind: "USER_TRUST",
      subjectRef: PRINCIPAL,
      identityVerification: "STRONG",
      verifiedPurchaseCount: 63,
      disputeRateBps: 120,
      assessedAt: "2026-11-05T00:00:00.000Z",
    };
    expectTypeOf<UserTrust>().not.toMatchTypeOf<ProofPinnedAction>();
    expectTypeOf<ProofPinnedAction>().not.toMatchTypeOf<UserTrust>();
    expect("proofSelection" in userTrust).toBe(false);
  });
});
