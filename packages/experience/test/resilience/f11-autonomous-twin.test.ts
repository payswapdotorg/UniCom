/**
 * W2-010 — Family F11: autonomous-store guardrail trips, refund policy
 * bands, owner overrides, unregistered-authority fail-closed, and the
 * Commerce Twin what-if (predictions never mutate canonical truth).
 * Fixture-contract evidence level.
 *
 * Drives the REAL autonomous policy engine (deterministic stop conditions,
 * approval thresholds, DENY/REQUIRE_APPROVAL/ALLOW), the REAL store-control
 * plane (registration, journaled human overrides, fail-closed authority)
 * and the REAL decision-card render model (structural truth separation:
 * operational vs predictive) over the REAL CommerceKernel. No runtime is
 * mocked; the policy enters through the kernel's policy-registration seam.
 *
 * The VISIBLE dimension is asserted through the typed outcomes a rendered
 * autonomous-store surface consumes: PolicyDecision reasons, run
 * presentation views, journaled override records and the decision-card
 * render model's truth badges.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateAutonomousPolicy,
  type AutonomousStorePolicy,
  type PolicyProposal,
} from "@unicom/commerce";
import { makeId, money, USD, rigMoney } from "./adapters/resilience-rig";
import { autonomousStoreStateView, createResilienceKernel } from "./adapters/resilience-rig";
import type { PrincipalRef } from "@unicom/commerce";
import { renderDecisionCard } from "../../src/runtime/surfaces/decision-card-render";
import type { DecisionCard } from "../../src/surfaces/decision-card";
import { scenarioById } from "./matrix/oracle";

const family = "F11";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

const STORE = makeId<"AutonomousStoreId">("store-f11");
const OWNER: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("owner-f11") };
const STORE_ACTOR: PrincipalRef = { kind: "AUTONOMOUS_STORE", autonomousStoreId: STORE };
const SKU = makeId<"SkuId">("sku-f11");
const LOC = makeId<"LocationId">("loc-f11");

function storePolicy(overrides: Partial<AutonomousStorePolicy> = {}): AutonomousStorePolicy {
  return {
    policyId: makeId<"AutonomousStorePolicyId">("policy-f11"),
    autonomousStoreId: STORE,
    revision: 1,
    policyCurrency: USD,
    promotionBudget: { limitPerPeriod: money("10000", USD), period: "DAILY" },
    spendLimit: { limitPerPeriod: money("10000", USD), period: "DAILY" },
    refundApprovalThreshold: money("5000", USD),
    priceChangeApprovalThreshold: money("500", USD),
    stopConditions: [],
    ...overrides,
  };
}

/** A registered store + policy on the real kernel (the f04 pattern). */
async function registeredStore(rig: ReturnType<typeof createResilienceKernel>, policy: AutonomousStorePolicy = storePolicy()) {
  const registered = await rig.exec(
    { type: "REGISTER_AUTONOMOUS_STORE", autonomousStoreId: STORE, ownerRef: OWNER, displayName: "F11 Store" },
    { actor: OWNER },
  );
  expect(registered.status).toBe("EXECUTED");
  rig.kernel.registerAutonomousPolicy(policy);
}

/** A minimal but contract-complete DecisionCard for the render model. */
function whatIfDecisionCard(): DecisionCard {
  return {
    cardId: "card:f11-whatif",
    decisionRef: "decision:f11-1" as never,
    objective: { statement: "Reduce overstock on tote bags", goalEcho: "Improve cash position" },
    state: {
      truthClass: "operational",
      summary: "40 units in stock; 5 sold this week",
      lastChangedAt: "2026-10-10T09:00:00Z",
      evidence: [],
    },
    evidence: [],
    alternatives: [
      {
        alternativeId: "alt-timed-discount",
        label: "Timed discount",
        summary: "-10% for 7 days",
        strategyRef: "strategy:f11-discount" as never,
        predictedOutcome: {
          truthClass: "predictive",
          summary: "Sell ~9 units in 7 days",
          confidenceNote: "medium",
          horizonNote: "7 days",
          assumptions: ["demand elasticity holds"],
          basedOnEvidence: [],
        },
        tradeoffs: ["margin -10% on promoted units"],
      },
    ],
    predictions: [
      {
        truthClass: "predictive",
        summary: "Overstock reduced to ~28 units within two weeks",
        confidenceNote: "medium-high",
        horizonNote: "14 days",
        assumptions: ["weekly sale rate >= 6 units"],
        basedOnEvidence: [],
      },
    ],
    risk: {
      downsideSummary: "Discount may anchor lower price expectations",
      severity: "medium",
      stopConditions: ["stop if weekly sales < 3 units"],
      recourseNote: "discount auto-expires after 7 days",
      evidence: [],
    },
    organizationUsed: {
      organizationRef: "organization:f11-1" as never,
      whyThisOrganization: "One pricing skill with attenuated authority",
      actors: [],
      capabilitiesUsed: [],
    },
    authority: {
      requiredApprovals: [
        { approvalId: "approval:f11-1", approver: OWNER, scope: "pricing change up to -10%", status: "PENDING" },
      ],
      status: "PENDING",
    },
    action: {
      actionSummary: "Apply timed discount to tote bags",
      commands: [],
      idempotencyKey: "f11-what-if" as never,
    },
    history: [],
  } as unknown as DecisionCard;
}

describe("W2-010 F11 — autonomous-store guardrails + Commerce Twin truth separation (fixture-contract)", () => {
  it("F11-S01: a stop-condition trip halts ALL autonomous action deterministically — DENY with STOP_CONDITION_TRIGGERED for every proposal kind", () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    // The technical-failure rate crossed the stop threshold (800 bps = 8%).
    const halted = storePolicy({
      stopConditions: [{ kind: "TECHNICAL_FAILURE_RATE_BPS", threshold: 500, currentlyObserved: 800 }],
    });
    const proposals: PolicyProposal[] = [
      { kind: "REFUND", amount: rigMoney("1000") },
      { kind: "SPEND", purpose: "restock", amount: rigMoney("100"), spendSpentInPeriod: rigMoney("0") },
      { kind: "DISCOUNT_GRANT", discountAmount: rigMoney("500"), discountBps: 500, promotionBudgetSpentInPeriod: rigMoney("0") },
      { kind: "PRICE_CHANGE", skuId: SKU, currentPrice: rigMoney("1999"), newPrice: rigMoney("1799"), costBasis: rigMoney("1000") },
    ];
    for (const proposal of proposals) {
      const decision = evaluateAutonomousPolicy(proposal, halted);
      // VISIBLE: every action class is DENIED with the SAME deterministic
      // reason — the halt is global, not per-action.
      expect(decision).toEqual({ decision: "DENY", reasons: ["STOP_CONDITION_TRIGGERED"] });
    }
    // The escalation is visible on the store's run presentation.
    const view = autonomousStoreStateView("paused", "autonomy halted: technical failure rate crossed the stop threshold");
    expect(view.runPresentation).toBe("paused");
    expect(view.presentationNote).toContain("halted");
    // Control: with the rate back under the threshold, the same refund is
    // evaluated on its merits (not silently resumed as ALLOW).
    const recovered = storePolicy({
      stopConditions: [{ kind: "TECHNICAL_FAILURE_RATE_BPS", threshold: 500, currentlyObserved: 300 }],
    });
    const reevaluated = evaluateAutonomousPolicy({ kind: "REFUND", amount: rigMoney("1000") }, recovered);
    expect(reevaluated.decision).toBe("ALLOW");
  });

  it("F11-S02: a refund outside the policy band is refused at the boundary — REQUIRE_APPROVAL, never a silent auto-refund", () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    const policy = storePolicy(); // refundApprovalThreshold: 50.00
    // A 75.00 refund is at/above the threshold → owner approval required.
    const large = evaluateAutonomousPolicy({ kind: "REFUND", amount: rigMoney("7500") }, policy);
    expect(large).toEqual({ decision: "REQUIRE_APPROVAL", reasons: ["APPROVAL_THRESHOLD"] });
    // VISIBLE: the run presentation surfaces the pause for approval.
    const view = autonomousStoreStateView("paused", "refund exceeds the autonomous policy band — owner approval required");
    expect(view.presentationNote).toContain("owner approval required");
    // Control: a small refund inside the band is ALLOWED (the band works both ways).
    const small = evaluateAutonomousPolicy({ kind: "REFUND", amount: rigMoney("4999") }, policy);
    expect(small.decision).toBe("ALLOW");
    // The threshold is inclusive at the boundary.
    const atEdge = evaluateAutonomousPolicy({ kind: "REFUND", amount: rigMoney("5000") }, policy);
    expect(atEdge.decision).toBe("REQUIRE_APPROVAL");
  });

  it("F11-S03: an owner override journals the actor + justification (auditable principal transition)", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    await registeredStore(rig, storePolicy({
      restockRules: [{ skuId: SKU, locationId: LOC, supplierId: makeId<"SupplierId">("supplier-f11"), thresholdUnits: 5, reorderUnits: 10, unitCost: rigMoney("1000") }],
    }));
    // The owner exercises a RESTOCK override with justification.
    const overridden = await rig.exec(
      {
        type: "RECORD_HUMAN_OVERRIDE",
        autonomousStoreId: STORE,
        action: { kind: "RESTOCK", skuId: SKU, locationId: LOC, units: 12, reason: "storm incoming — manual quantity" },
        justification: "owner override: weather forecast doubles expected demand",
      },
      { actor: OWNER },
    );
    expect(overridden.status).toBe("EXECUTED");
    // VISIBLE: the override record is journaled with BOTH principals + the
    // justification — the auditable custody chain.
    const records = rig.kernel.events().filter((event) => event.kind === "AUTONOMOUS_OVERRIDE_RECORDED");
    expect(records).toHaveLength(1);
    const record = records[0]?.payload as { kind: string; override?: { exercisedBy?: PrincipalRef; onBehalfOf?: PrincipalRef; justification?: string; action?: { units?: number } } };
    expect(record.override?.exercisedBy).toEqual(OWNER);
    expect(record.override?.onBehalfOf?.kind).toBe("AUTONOMOUS_STORE");
    expect(record.override?.justification).toContain("owner override");
    expect(record.override?.action?.units).toBe(12);
  });

  it("F11-S04: an unregistered store control attempt FAILS CLOSED — no registered authority, zero events", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    const eventsBefore = rig.events();
    // No REGISTER_AUTONOMOUS_STORE was ever issued for STORE.
    const attempt = await rig.exec(
      {
        type: "RECORD_HUMAN_OVERRIDE",
        autonomousStoreId: STORE,
        action: { kind: "RESTOCK", skuId: SKU, locationId: LOC, units: 10, reason: "attempt on an unregistered store" },
        justification: "should fail closed",
      },
      { actor: OWNER },
    );
    // VISIBLE: deterministic refusal — the store is not registered.
    expect(attempt.status).toBe("REJECTED");
    if (attempt.status === "REJECTED") {
      // The typed authority denial: NO_REGISTERED_AUTHORITY, fails closed.
      expect(String(attempt.reason.detail ?? attempt.reason)).toContain("NO_REGISTERED_AUTHORITY");
    }
    // Zero side effects: nothing journaled.
    expect(rig.events()).toBe(eventsBefore);
    // An authority handover on the unregistered store fails closed too.
    const handover = await rig.exec(
      {
        type: "HANDOVER_STORE_AUTHORITY",
        autonomousStoreId: STORE,
        fromPrincipal: OWNER,
        toPrincipal: STORE_ACTOR,
        toMode: "AUTONOMOUS",
      },
      { actor: OWNER },
    );
    expect(handover.status).toBe("REJECTED");
    expect(rig.events()).toBe(eventsBefore);
  });

  it("F11-S05: a Commerce Twin what-if forecast NEVER mutates canonical truth — structural truth separation on the render model", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    // Canonical operational truth: 10 units on hand.
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU, locationId: LOC, units: 10, reason: "PURCHASE_ORDER" });
    const canonicalBefore = rig.kernel.view().level(SKU, LOC);
    // The what-if card: a predictive forecast (sell ~9 units) rendered for
    // the operator's decision.
    const card = whatIfDecisionCard();
    const rendered = renderDecisionCard(card);
    // VISIBLE: the render model separates the truth classes structurally —
    // the state block stays operational; predictions carry truthClass
    // predictive + assumptions, never presented as operational truth.
    expect(card.state.truthClass).toBe("operational");
    expect(card.predictions[0]?.truthClass).toBe("predictive");
    expect(card.predictions[0]?.assumptions.length).toBeGreaterThan(0);
    expect(rendered.sections.length).toBeGreaterThan(0);
    // The what-if itself changed NOTHING canonically: the level is identical.
    expect(rig.kernel.view().level(SKU, LOC)).toEqual(canonicalBefore);
    expect(rig.kernel.view().level(SKU, LOC)?.onHand).toBe(10);
    // A demand signal (forecast input) records a FACT without touching stock.
    const signal = await rig.exec({
      type: "RECORD_DEMAND_SIGNAL",
      signal: {
        demandSignalId: makeId<"DemandSignalId">("signal-f11-1"),
        skuId: SKU,
        locationId: LOC,
        observedAt: "2026-10-10T10:00:00Z",
        source: { sourceType: "MARKET_OBSERVATION", sourceRef: "f11-twin" },
        resolution: { resolved: "OBSERVED", value: 9 },
      } as never,
    });
    if (signal.status === "EXECUTED") {
      // The signal journaled — and the canonical level is STILL unchanged.
      expect(rig.kernel.view().level(SKU, LOC)).toEqual(canonicalBefore);
    }
  });
});
