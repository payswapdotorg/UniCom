import { describe, expect, it } from "vitest";
import type { BuyerCommerceIntent, PrincipalRef } from "../src/index.js";
import {
  adversarialReconstruction,
  discloseCoordination,
  enforceMinimumNecessary,
  MINIMUM_NECESSARY_DISCLOSURE_POLICY,
  type CoordinationDisclosureView,
} from "../src/index.js";

/**
 * W2-003 acceptance scenario 4 — privacy-aware coordination:
 * an adversarial observer holding every disclosed view reconstructs NO more
 * buyer-intent information than the coordination contract explicitly
 * discloses (cross-principal inference blocked).
 */

const BUYER_A: PrincipalRef = { principalId: "user-amara", kind: "user" };
const BUYER_B: PrincipalRef = { principalId: "user-kwesi", kind: "user" };
const MERCHANT: PrincipalRef = { principalId: "merchant-makola", kind: "merchant" };

function intent(id: string, buyer: PrincipalRef, desired: readonly string[], deadline: string): BuyerCommerceIntent {
  return {
    intentId: id,
    buyerRef: buyer,
    desired,
    hardConstraints: {
      deadline,
      maxTotalCost: { currency: "GHS", minorUnits: id.endsWith("a") ? "150000" : "275000" },
      privacyRequirements: ["MINIMIZE_DATA_COLLECTION"],
      groupBuyWillingness: "ACCEPTED",
    },
    statedAt: "2026-11-02T08:00:00.000Z",
  };
}

const INTENTS: readonly BuyerCommerceIntent[] = [
  intent("intent-a", BUYER_A, ["item://sewing-machine"], "2026-11-20T00:00:00.000Z"),
  intent("intent-b", BUYER_B, ["item://serger"], "2026-11-25T00:00:00.000Z"),
];

describe("scenario 4 — minimum-necessary disclosure at every step", () => {
  it("builds recipient views containing ONLY whitelisted fields", () => {
    const material = {
      COORDINATION_ID: "coordination-1",
      COORDINATION_KIND: "GROUP_BUY" as const,
      PARTICIPANT_COUNT: 2,
      MERCHANT_REF: MERCHANT,
      GROUP_BUY_TERMS: { minimumParticipants: 2, windowOpensAt: "2026-11-06T00:00:00.000Z", windowClosesAt: "2026-11-16T00:00:00.000Z", discount: { kind: "PERCENTAGE" as const, value: "1500" } },
      OPAQUE_ITEM_REFS: ["item://sewing-machine"],
      AGGREGATE_DEMAND: { aggregateParticipantCount: 2 },
      INTEREST_WINDOW: { opensOn: "2026-11-02", closesOn: "2026-11-02" },
      // Raw identity material must NOT survive disclosure:
      BUYER_IDENTITIES: [BUYER_A, BUYER_B],
      BUYER_DEADLINES: ["2026-11-20T00:00:00.000Z", "2026-11-25T00:00:00.000Z"],
    };
    const merchantView = discloseCoordination({
      coordinationId: "coordination-1",
      recipientKind: "MERCHANT",
      policy: MINIMUM_NECESSARY_DISCLOSURE_POLICY,
      material,
    });
    // The merchant sees the demand aggregate + item refs, never buyer identities.
    expect(Object.keys(merchantView.disclosed).sort()).toEqual([
      "AGGREGATE_DEMAND",
      "COORDINATION_ID",
      "COORDINATION_KIND",
      "INTEREST_WINDOW",
      "MERCHANT_REF",
      "OPAQUE_ITEM_REFS",
    ]);
    expect(JSON.stringify(merchantView.disclosed)).not.toContain("user-amara");
    expect(JSON.stringify(merchantView.disclosed)).not.toContain("2026-11-20");

    const buyerView = discloseCoordination({
      coordinationId: "coordination-1",
      recipientKind: "BUYER_PARTICIPANT",
      policy: MINIMUM_NECESSARY_DISCLOSURE_POLICY,
      material,
    });
    expect(Object.keys(buyerView.disclosed).sort()).toEqual([
      "COORDINATION_ID",
      "COORDINATION_KIND",
      "GROUP_BUY_TERMS",
      "OPAQUE_ITEM_REFS",
      "PARTICIPANT_COUNT",
    ]);
    expect(JSON.stringify(buyerView.disclosed)).not.toContain("user-amara");
  });

  it("enforceMinimumNecessary flags smuggled fields as typed violations", () => {
    const leaky: CoordinationDisclosureView = {
      coordinationId: "coordination-1",
      recipientKind: "OTHER_PARTICIPANT",
      disclosed: {
        COORDINATION_ID: "coordination-1",
        COORDINATION_KIND: "GROUP_BUY",
        PARTICIPANT_COUNT: 2, // not allowed for OTHER_PARTICIPANT
        GROUP_BUY_TERMS: { minimumParticipants: 2 },
      },
    };
    const check = enforceMinimumNecessary(leaky, MINIMUM_NECESSARY_DISCLOSURE_POLICY);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.violations).toEqual([{ field: "PARTICIPANT_COUNT", reason: "UNDISCLOSED_FIELD" }]);
    }
    const clean = enforceMinimumNecessary(
      { ...leaky, disclosed: { COORDINATION_ID: "coordination-1", COORDINATION_KIND: "GROUP_BUY" } },
      MINIMUM_NECESSARY_DISCLOSURE_POLICY,
    );
    expect(clean.ok).toBe(true);
  });
});

describe("scenario 4 — adversarial observer reconstruction", () => {
  it("reconstructs NOTHING beyond the explicitly disclosed fields from clean views", () => {
    const views = [
      discloseCoordination({
        coordinationId: "coordination-1",
        recipientKind: "MERCHANT",
        policy: MINIMUM_NECESSARY_DISCLOSURE_POLICY,
        material: {
          COORDINATION_ID: "coordination-1",
          COORDINATION_KIND: "GROUP_BUY",
          AGGREGATE_DEMAND: { aggregateParticipantCount: 2 },
          OPAQUE_ITEM_REFS: ["item://sewing-machine", "item://serger"],
          INTEREST_WINDOW: { opensOn: "2026-11-02", closesOn: "2026-11-02" },
          MERCHANT_REF: MERCHANT,
        },
      }),
      discloseCoordination({
        coordinationId: "coordination-1",
        recipientKind: "BUYER_PARTICIPANT",
        policy: MINIMUM_NECESSARY_DISCLOSURE_POLICY,
        material: {
          COORDINATION_ID: "coordination-1",
          COORDINATION_KIND: "GROUP_BUY",
          PARTICIPANT_COUNT: 2,
          GROUP_BUY_TERMS: { minimumParticipants: 2, windowOpensAt: "2026-11-06T00:00:00.000Z", windowClosesAt: "2026-11-16T00:00:00.000Z", discount: { kind: "PERCENTAGE", value: "1500" } },
          OPAQUE_ITEM_REFS: ["item://sewing-machine"],
        },
      }),
    ];
    const reconstruction = adversarialReconstruction({
      views,
      sourceIntents: INTENTS,
      permittedRawFieldPaths: ["desired"],
    });
    expect(reconstruction.attributions).toEqual([]);
    // The only unique-value observations fall inside the disclosed subject refs.
    for (const observation of reconstruction.permittedObservations) {
      expect(observation.fieldPath).toBe("desired");
    }
  });

  it("flags identity material the moment it crosses (the observer model has teeth)", () => {
    const leaky: CoordinationDisclosureView = {
      coordinationId: "coordination-1",
      recipientKind: "MERCHANT",
      disclosed: {
        COORDINATION_ID: "coordination-1",
        COORDINATION_KIND: "GROUP_BUY",
        // A buyer principal id smuggled into an undisclosed field:
        PARTICIPANT_ROSTER: [BUYER_A],
      },
    };
    const reconstruction = adversarialReconstruction({
      views: [leaky],
      sourceIntents: INTENTS,
      permittedRawFieldPaths: ["desired"],
    });
    expect(reconstruction.attributions.length).toBeGreaterThan(0);
    // Identity material attributes EVERY raw fact of that intent.
    const amaraFacts = reconstruction.attributions.filter((attribution) => attribution.intentId === "intent-a");
    expect(amaraFacts.some((fact) => fact.fieldPath === "hardConstraints.deadline")).toBe(true);
    expect(amaraFacts.some((fact) => fact.fieldPath === "hardConstraints.maxTotalCost.minorUnits")).toBe(true);
    expect(amaraFacts.every((fact) => fact.how === "IDENTITY_MATERIAL_PRESENT")).toBe(true);
  });

  it("flags a unique raw constraint value smuggled into a view", () => {
    const leaky: CoordinationDisclosureView = {
      coordinationId: "coordination-1",
      recipientKind: "OTHER_PARTICIPANT",
      disclosed: {
        COORDINATION_ID: "coordination-1",
        COORDINATION_KIND: "GROUP_BUY",
        // Amara's unique budget, disguised as a "hint":
        PRICE_HINT: "150000",
      },
    };
    const reconstruction = adversarialReconstruction({
      views: [leaky],
      sourceIntents: INTENTS,
      permittedRawFieldPaths: ["desired"],
    });
    expect(reconstruction.attributions).toContainEqual({
      intentId: "intent-a",
      fieldPath: "hardConstraints.maxTotalCost.minorUnits",
      value: "150000",
      how: "UNIQUE_VALUE_BOUND",
    });
  });

  it("flags combination attacks binding two non-disclosed values to one intent", () => {
    const leaky: CoordinationDisclosureView = {
      coordinationId: "coordination-1",
      recipientKind: "OTHER_PARTICIPANT",
      disclosed: {
        COORDINATION_ID: "coordination-1",
        COORDINATION_KIND: "GROUP_BUY",
        HINTS: ["150000", "2026-11-20T00:00:00.000Z"], // budget + deadline of ONE intent
      },
    };
    const reconstruction = adversarialReconstruction({
      views: [leaky],
      sourceIntents: INTENTS,
      permittedRawFieldPaths: ["desired"],
    });
    const combination = reconstruction.attributions.filter((attribution) => attribution.how === "COMBINATION_BOUND");
    expect(combination.length).toBeGreaterThan(0);
    expect(combination.every((attribution) => attribution.intentId === "intent-a")).toBe(true);
  });
});
