import { describe, expect, it } from "vitest";
import type { AuthorizationDecision, CapabilityDefinition, PrincipalRef } from "../src/index.js";
import { ActorCapabilityLedger, validateCapabilityGrant, type OrganizationPosition, type PositionCapabilityGrant } from "../src/index.js";

/**
 * W2-003 acceptance scenario 5 — actor-as-capability:
 * an organization position grants EXACTLY the capabilities it was assigned —
 * no ambient authority, no capability forgery. ONE capability vocabulary
 * (the canonical CapabilityDefinition set) — no second model.
 */

const ORG_AUTHORITY: PrincipalRef = { principalId: "main-agent:org-1", kind: "agent" };
const MAIN_AGENT_HOLDER = { principalId: "main-agent:org-1", kind: "main-agent" as const };
const DELEGATE_HOLDER = { principalId: "delegate:logistics-1", kind: "ephemeral-delegate" as const };

/** The canonical vocabulary (a slice of it) — the ONLY capability model. */
const CANONICAL_VOCABULARY: readonly CapabilityDefinition[] = [
  { capabilityDefinitionId: "capability:commerce.command", name: "Commerce Command Seam", supportedExecutionModes: ["PASS_THROUGH_NATIVE"], transportNeutral: true },
  { capabilityDefinitionId: "capability:groupbuy.coordinate", name: "GroupBuy Coordination", supportedExecutionModes: ["COMPOSED"], transportNeutral: true },
  { capabilityDefinitionId: "capability:tradecycle.propose", name: "TradeCycle Proposal", supportedExecutionModes: ["COMPOSED"], transportNeutral: true },
  { capabilityDefinitionId: "capability:demand.aggregate", name: "Demand Aggregation", supportedExecutionModes: ["COMPOSED"], transportNeutral: true },
];

function authorizedBy(ref: PrincipalRef): AuthorizationDecision {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-1", decidedAt: "2026-11-05T08:00:00.000Z" };
}

function position(positionId: string, holder: OrganizationPosition["holder"], title: string): OrganizationPosition {
  return { positionId, organizationId: "organization-1", title, holder, grantorRef: ORG_AUTHORITY };
}

function grant(grantId: string, positionId: string, capabilityDefinitionId: string, grantedBy: PrincipalRef = ORG_AUTHORITY, authorization: AuthorizationDecision = authorizedBy(ORG_AUTHORITY)): PositionCapabilityGrant {
  return { grantId, positionId, capabilityDefinitionId, grantedBy, authorization, grantedAt: "2026-11-05T08:00:00.000Z" };
}

const COORDINATOR_POSITION = position("position:coordinator", MAIN_AGENT_HOLDER, "Coordination Coordinator");
const LOGISTICS_POSITION = position("position:logistics", DELEGATE_HOLDER, "Logistics Delegate");

describe("scenario 5 — a position grants EXACTLY its assigned capabilities", () => {
  it("the holder commands exactly the granted capabilities — nothing ambient", () => {
    const ledger = new ActorCapabilityLedger(CANONICAL_VOCABULARY);
    ledger.registerPosition(COORDINATOR_POSITION);
    ledger.registerPosition(LOGISTICS_POSITION);
    expect(ledger.grant({ grant: grant("grant-1", "position:coordinator", "capability:groupbuy.coordinate") })).toEqual({ valid: true });
    expect(ledger.grant({ grant: grant("grant-2", "position:coordinator", "capability:tradecycle.propose") })).toEqual({ valid: true });
    expect(ledger.grant({ grant: grant("grant-3", "position:logistics", "capability:commerce.command") })).toEqual({ valid: true });

    // EXACTLY the assigned capabilities:
    expect(ledger.capabilitiesForPosition("position:coordinator")).toEqual([
      "capability:groupbuy.coordinate",
      "capability:tradecycle.propose",
    ]);
    expect(ledger.capabilitiesForPosition("position:logistics")).toEqual(["capability:commerce.command"]);

    // The MAIN AGENT holder itself gets nothing beyond its position grants —
    // even the org authority holds no ambient capability:
    expect(ledger.capabilitiesForHolder("main-agent:org-1")).toEqual([
      "capability:groupbuy.coordinate",
      "capability:tradecycle.propose",
    ]);
    expect(ledger.holdsCapability("main-agent:org-1", "capability:commerce.command")).toBe(false);
    expect(ledger.holdsCapability("main-agent:org-1", "capability:groupbuy.coordinate")).toBe(true);

    // A principal with no position holds NOTHING — catalog presence never
    // implies held authority:
    expect(ledger.capabilitiesForHolder("user-stranger")).toEqual([]);
    expect(ledger.holdsCapability("user-stranger", "capability:groupbuy.coordinate")).toBe(false);

    // A registered position with no grants also holds nothing:
    const empty = new ActorCapabilityLedger(CANONICAL_VOCABULARY);
    empty.registerPosition(COORDINATOR_POSITION);
    expect(empty.capabilitiesForPosition("position:coordinator")).toEqual([]);
  });
});

describe("scenario 5 — no capability forgery", () => {
  it("rejects a grant for a capability outside the canonical vocabulary (one vocabulary, no second model)", () => {
    const validation = validateCapabilityGrant({
      grant: grant("grant-x", "position:coordinator", "capability:shadow.capsule"),
      position: COORDINATOR_POSITION,
      canonicalVocabulary: CANONICAL_VOCABULARY,
      existingGrantIds: new Set(),
    });
    expect(validation).toEqual({
      valid: false,
      violations: ["CAPABILITY_NOT_IN_CANONICAL_VOCABULARY"],
    });
  });

  it("rejects a grant signed by someone other than the position's declared grantor", () => {
    const foreign: PrincipalRef = { principalId: "user-impostor", kind: "user" };
    const validation = validateCapabilityGrant({
      grant: grant("grant-x", "position:coordinator", "capability:groupbuy.coordinate", foreign, authorizedBy(foreign)),
      position: COORDINATOR_POSITION,
      canonicalVocabulary: CANONICAL_VOCABULARY,
      existingGrantIds: new Set(),
    });
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.violations).toContain("GRANT_AUTHORITY_MISMATCH");
    }
  });

  it("rejects an unauthorized grant decision", () => {
    const validation = validateCapabilityGrant({
      grant: grant("grant-x", "position:coordinator", "capability:groupbuy.coordinate", ORG_AUTHORITY, {
        decision: "UNKNOWN",
        decidedBy: ORG_AUTHORITY,
        policyVersion: "policy-1",
        decidedAt: "2026-11-05T08:00:00.000Z",
      }),
      position: COORDINATOR_POSITION,
      canonicalVocabulary: CANONICAL_VOCABULARY,
      existingGrantIds: new Set(),
    });
    expect(validation).toEqual({ valid: false, violations: ["GRANT_NOT_AUTHORIZED"] });
  });

  it("rejects grants for unknown positions and duplicate grant ids", () => {
    const unknownPosition = validateCapabilityGrant({
      grant: grant("grant-x", "position:ghost", "capability:groupbuy.coordinate"),
      position: undefined,
      canonicalVocabulary: CANONICAL_VOCABULARY,
      existingGrantIds: new Set(),
    });
    expect(unknownPosition).toEqual({ valid: false, violations: ["UNKNOWN_POSITION"] });

    const duplicate = validateCapabilityGrant({
      grant: grant("grant-1", "position:coordinator", "capability:groupbuy.coordinate"),
      position: COORDINATOR_POSITION,
      canonicalVocabulary: CANONICAL_VOCABULARY,
      existingGrantIds: new Set(["grant-1"]),
    });
    expect(duplicate).toEqual({ valid: false, violations: ["DUPLICATE_GRANT"] });
  });

  it("the ledger refuses to record invalid grants at all", () => {
    const ledger = new ActorCapabilityLedger(CANONICAL_VOCABULARY);
    ledger.registerPosition(COORDINATOR_POSITION);
    const forged = ledger.grant({
      grant: grant("grant-x", "position:coordinator", "capability:commerce.command", { principalId: "user-impostor", kind: "user" }, authorizedBy({ principalId: "user-impostor", kind: "user" })),
    });
    expect(forged.valid).toBe(false);
    expect(ledger.capabilitiesForPosition("position:coordinator")).toEqual([]);
    expect(ledger.listGrants()).toEqual([]);
  });
});

describe("scenario 5 — deterministic snapshots across organizations", () => {
  it("lists positions sorted with exactly their granted capabilities", () => {
    const ledger = new ActorCapabilityLedger(CANONICAL_VOCABULARY);
    ledger.registerPosition(LOGISTICS_POSITION);
    ledger.registerPosition(COORDINATOR_POSITION);
    ledger.grant({ grant: grant("grant-2", "position:coordinator", "capability:tradecycle.propose") });
    ledger.grant({ grant: grant("grant-1", "position:coordinator", "capability:groupbuy.coordinate") });
    ledger.grant({ grant: grant("grant-3", "position:logistics", "capability:commerce.command") });

    const snapshots = ledger.listPositions();
    expect(snapshots.map((snapshot) => snapshot.position.positionId)).toEqual([
      "position:coordinator",
      "position:logistics",
    ]);
    expect(snapshots[0]?.capabilities).toEqual(["capability:groupbuy.coordinate", "capability:tradecycle.propose"]);
    expect(ledger.listGrants().map((entry) => entry.grantId)).toEqual(["grant-1", "grant-2", "grant-3"]);

    // A holder spanning organizations unions ONLY its positions' grants.
    const otherOrgPosition: OrganizationPosition = {
      ...COORDINATOR_POSITION,
      positionId: "position:org2-auditor",
      organizationId: "organization-2",
    };
    ledger.registerPosition(otherOrgPosition);
    ledger.grant({ grant: grant("grant-4", "position:org2-auditor", "capability:demand.aggregate") });
    expect(ledger.capabilitiesForHolder("main-agent:org-1")).toEqual([
      "capability:demand.aggregate",
      "capability:groupbuy.coordinate",
      "capability:tradecycle.propose",
    ]);
  });
});
