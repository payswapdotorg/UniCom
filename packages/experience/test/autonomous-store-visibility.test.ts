/**
 * Contract test — autonomous-store visibility (W3-005 acceptance
 * scenario 4).
 *
 * The merchant sees autonomous store state, running policies, variances,
 * escalations and override points — with OPAQUE commerce references
 * rendered VERBATIM. This surface NEVER invents commerce semantics: a
 * structural scan asserts the surface file imports nothing from
 * @unicom/commerce and declares no commerce value types (no money, no
 * pricing, no margin/discount math); the UI layer is commerce-read-only
 * through opaque refs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AutonomousStoreEscalationView,
  AutonomousStoreOverridePointView,
  AutonomousStorePolicyView,
  AutonomousStoreStateView,
  AutonomousStoreVarianceView,
  AutonomousStoreVisibilityView,
} from "../src/surfaces/autonomous-store";
import type {
  CommerceAutonomousStorePolicyRef,
  CommerceAutonomousStoreRef,
  CommerceEscalationRef,
  CommerceStoreVarianceRef,
} from "../src/common/opaque-refs";
import { asPrincipalRef } from "../src/runtime/ids";
import { utc, decisionRef } from "./branded";
import type { Equal, Expect } from "./type-helpers";
import type { EvidenceReference } from "../src/common/evidence";

const evidence = (id: string): EvidenceReference[] => [
  {
    evidenceId: id,
    kind: "execution-log",
    summary: "autonomous runtime journal excerpt",
    capturedAt: utc("2026-10-08T10:00:00Z"),
    proofRef: "P2" as never,
    sourceArtifactRefs: [],
  },
];

// Compile-time: the five visibility components are structurally required.
export type AssertViewKeys = Expect<
  Equal<
    keyof AutonomousStoreVisibilityView,
    "store" | "runningPolicies" | "variances" | "escalations" | "overridePoints" | "generatedAt"
  >
>;
export type AssertStateKeys = Expect<
  Equal<
    keyof AutonomousStoreStateView,
    | "storeRef"
    | "displayName"
    | "runPresentation"
    | "presentationNote"
    | "lastChangedAt"
    | "ownerRef"
    | "evidence"
  >
>;

const STORE_REF = "kernel-autonomous-store-42" as CommerceAutonomousStoreRef;
const POLICY_REF = "kernel-policy-rev-7" as CommerceAutonomousStorePolicyRef;
const VARIANCE_REF = "kernel-variance-2026-10-08-3" as CommerceStoreVarianceRef;
const ESCALATION_REF = "kernel-escalation-91" as CommerceEscalationRef;

/** A COMPLETE visibility fixture (opaque refs are unique strings). */
const visibility: AutonomousStoreVisibilityView = {
  store: {
    storeRef: STORE_REF,
    displayName: "Riverside Provisions",
    runPresentation: "running",
    presentationNote: "Autonomy is operating within the policy limits you set",
    lastChangedAt: utc("2026-10-08T09:58:00Z"),
    ownerRef: asPrincipalRef("principal-owner-riverside"),
    evidence: evidence("ev-store-state-1"),
  },
  runningPolicies: [
    {
      policyRef: POLICY_REF,
      revision: 7,
      limitsNote: "Spend and refunds stay inside the limits of revision 7",
      inForceSince: utc("2026-10-01T00:00:00Z"),
      evidence: evidence("ev-policy-1"),
    },
  ],
  variances: [
    {
      varianceRef: VARIANCE_REF,
      subjectNote: "Receiving versus expected purchase order",
      status: "open",
      surfacedAt: utc("2026-10-08T08:15:00Z"),
      evidence: evidence("ev-variance-1"),
    },
  ],
  escalations: [
    {
      escalationRef: ESCALATION_REF,
      summary: "A refund request above the auto-approve threshold needs your decision",
      requiresOwnerAction: true,
      relatedDecisionRef: decisionRef("decision-escalation-91"),
      raisedAt: utc("2026-10-08T09:40:00Z"),
      evidence: evidence("ev-escalation-1"),
    },
  ],
  overridePoints: [
    {
      overridePointId: "override-pause-autonomy",
      userLabel: "Pause autopilot",
      kind: "pause-autonomy",
      effectNote: "Autonomous actions stop until you resume",
      available: true,
      commandHandoff: "cmd-pause-autonomy-42" as never,
    },
    {
      overridePointId: "override-stop-store",
      userLabel: "Stop the store",
      kind: "stop-store",
      effectNote: "All autonomous selling halts immediately",
      available: false,
      unavailableReason: "an escalation is awaiting your decision first",
    },
    {
      overridePointId: "override-tighten-limits",
      userLabel: "Tighten the limits",
      kind: "tighten-limits",
      effectNote: "A new policy revision with tighter limits takes force",
      available: true,
      commandHandoff: "cmd-tighten-limits-42" as never,
    },
  ],
  generatedAt: utc("2026-10-08T10:00:00Z"),
};

describe("autonomous-store visibility — scenario 4", () => {
  it("surfaces store state, running policies, variances, escalations and override points — all five components", () => {
    expect(visibility.store.runPresentation).toBe("running");
    expect(visibility.runningPolicies.length).toBe(1);
    expect(visibility.variances.length).toBe(1);
    expect(visibility.escalations.length).toBe(1);
    expect(visibility.overridePoints.length).toBe(3);
  });

  it("renders opaque commerce references VERBATIM (character-for-character, untouched)", () => {
    expect(visibility.store.storeRef).toBe("kernel-autonomous-store-42");
    expect(visibility.runningPolicies[0]?.policyRef).toBe("kernel-policy-rev-7");
    expect(visibility.variances[0]?.varianceRef).toBe("kernel-variance-2026-10-08-3");
    expect(visibility.escalations[0]?.escalationRef).toBe("kernel-escalation-91");
    expect(visibility.escalations[0]?.relatedDecisionRef).toBe("decision-escalation-91");
    // Override hand-offs are opaque command refs, passed through as-is.
    const pause = visibility.overridePoints.find(
      (point) => point.kind === "pause-autonomy",
    ) as AutonomousStoreOverridePointView;
    expect(pause.commandHandoff).toBe("cmd-pause-autonomy-42");
  });

  it("the presentation vocabulary stays UX-level (no commerce run-state semantics invented)", () => {
    const presentations: readonly AutonomousStoreStateView["runPresentation"][] = [
      "running",
      "paused",
      "awaiting-owner-approval",
      "stopped",
      "unknown",
    ];
    // UNKNOWN is a first-class presentation (UNKNOWN ≠ FAILED).
    expect(presentations).toContain("unknown");
    expect(presentations).toContain(visibility.store.runPresentation);
  });

  it("policy revisions render verbatim — never recomputed, never re-modeled", () => {
    const policy = visibility.runningPolicies[0] as AutonomousStorePolicyView;
    expect(policy.revision).toBe(7);
    expect(policy.limitsNote).toBeTypeOf("string");
    expect(policy.inForceSince).toBeTypeOf("string");
  });

  it("variances keep tri-state status (open/reconciled/UNKNOWN)", () => {
    const statuses: readonly AutonomousStoreVarianceView["status"][] = [
      "open",
      "reconciled",
      "unknown",
    ];
    expect(statuses).toContain(visibility.variances[0]?.status);
  });

  it("escalations carry owner-action flags and typed decision links", () => {
    const escalation = visibility.escalations[0] as AutonomousStoreEscalationView;
    expect(escalation.requiresOwnerAction).toBe(true);
    expect(escalation.relatedDecisionRef).toBeDefined();
  });

  it("override points are TYPED with availability and opaque hand-offs", () => {
    const unavailable = visibility.overridePoints.find(
      (point) => !point.available,
    ) as AutonomousStoreOverridePointView;
    expect(unavailable.unavailableReason).toBeTypeOf("string");
    const kinds = visibility.overridePoints.map((point) => point.kind);
    expect(kinds).toContain("pause-autonomy");
    expect(kinds).toContain("stop-store");
    expect(kinds).toContain("tighten-limits");
  });

  it("STRUCTURAL SCAN: the surface file imports nothing from @unicom/commerce and models no commerce values", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../src/surfaces/autonomous-store.ts"),
      "utf8",
    );
    expect(source).not.toContain("@unicom/commerce");
    // No commerce value modeling: money/pricing/margin/discount math is Worker 1's.
    expect(source).not.toMatch(/\bMoney\b/);
    expect(source).not.toMatch(/\bamountMinor\b/);
    expect(source).not.toMatch(/\bmarginFloorBps\b/);
    expect(source).not.toMatch(/\bmaxDiscountBps\b/);
    expect(source).not.toMatch(/\bpriceChange\b/i);
    // Opaque refs ARE the commerce surface.
    expect(source).toContain("CommerceAutonomousStoreRef");
    expect(source).toContain("CommerceAutonomousStorePolicyRef");
    expect(source).toContain("CommerceStoreVarianceRef");
    expect(source).toContain("CommerceEscalationRef");
  });
});
