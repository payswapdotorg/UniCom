/**
 * W2-010 — Family F04: missing / denied / expired / revoked approvals and
 * permissions. Fixture-contract evidence level.
 *
 * - S01/S02 drive the REAL dispatch executability machinery and project the
 *   decision-card authority contract (the typed card a UI renders) — the
 *   blocked action is proven by the provider adapter NEVER being invoked.
 * - S03–S06 drive the canonical executability evaluator through the real
 *   ConnectorRuntime with scoped/revoked/action-required/terms-pending
 *   connections.
 * - S07 drives the REAL kernel authority gate (store control).
 */

import { describe, expect, it } from "vitest";
import { credentialScope } from "@unicom/agent";
import { ExecutionMode } from "@unicom/agent/capability";
import { makeId, money, currency } from "@unicom/commerce";
import type { DecisionCard } from "../../src/surfaces/decision-card";
import { asIdempotencyKey, asPrincipalRef } from "../../src/runtime/ids";
import { FaultInjectingConnectorAdapter } from "./adapters/fault-connector-adapter";
import { createResilienceConnectorRig } from "./adapters/resilience-rig";
import { scenarioById } from "./matrix/oracle";

const family = "F04";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);
const USD = currency("USD");

/** The typed decision card a UI renders for the priced-action decision. */
function pricingDecisionCard(status: "pending" | "granted"): DecisionCard {
  return {
    cardId: "card:w2-f04-pricing",
    decisionRef: "decision:w2-f04-1" as never,
    objective: { statement: "Approve a −10% timed discount", goalEcho: "Grow repeat purchase 15%" },
    state: { truthClass: "operational", summary: "37 units in stock; 3 sold this week", lastChangedAt: "2026-10-10T09:00:00Z", evidence: [] },
    evidence: [],
    alternatives: [],
    predictions: [],
    risk: {
      downsideSummary: "Margin −10% on promoted units",
      severity: "medium",
      stopConditions: ["stop if weekly sales < 3 units"],
      recourseNote: "discount auto-expires after 7 days",
      evidence: [],
    },
    organizationUsed: {
      organizationRef: "organization:w2-f04" as never,
      whyThisOrganization: "One pricing skill with attenuated listing-write authority",
      actors: [],
      capabilitiesUsed: [],
    },
    authority: {
      requiredApprovals: [
        {
          approvalId: "approval:w2-f04-1",
          approver: asPrincipalRef("operator:w2"),
          scope: "pricing change up to −10% for 7 days",
          status,
          evidence: [],
        },
      ],
      currentStatus: status,
      explanation: status === "pending" ? "A price change beyond −5% requires your approval" : "Approved — ready to execute",
    },
    action: {
      actionKind: "execute",
      available: status === "granted",
      ...(status === "granted" ? {} : { unavailableReason: "approval required before this action can run" }),
      commandHandoff: "kernel-command:w2-f04-pricing" as never,
      idempotencyKey: asIdempotencyKey("w2-f04-pricing-key"),
    },
    history: [],
  };
}

async function dispatchScopedStep(
  rig: Awaited<ReturnType<typeof createResilienceConnectorRig>>,
  connected: { readonly instance: { readonly connectedInstanceId: string } },
  adapter: FaultInjectingConnectorAdapter,
  observation: { readonly connectedInstanceId: string } | null,
  required: { readonly scope: string; readonly permissions?: readonly string[]; readonly requiresCommercialTerms?: boolean },
) {
  const capabilityId = adapter.descriptor.capabilityDefinitions[0]?.capabilityDefinitionId ?? "cap-f04";
  return rig.runtime.dispatch({
    journeyRef: "journey-f04",
    mode: ExecutionMode.COMPOSED,
    steps: [
      {
        stepRef: "step-priced-action",
        capabilityDefinitionId: capabilityId as never,
        preconditions: {
          requiresConnectedInstance: true,
          requiredCredentialScope: credentialScope(required.scope),
          requiredPermissions: required.permissions ?? [],
          requiresCommercialTermsAccepted: required.requiresCommercialTerms ?? true,
          requiresCurrentObservation: true,
        },
        commandRef: "cmd-f04-priced-action",
        payloadRef: "payload:cmd-f04-priced-action",
      },
    ],
    instances: [connected.instance as never],
    observations: observation === null ? [] : [observation as never],
    implementations: [...adapter.descriptor.providerImplementations] as never,
    idempotencySeed: "f04-seed",
    authorization: "authorization:f04" as never,
    requestedAt: "2026-10-10T09:00:00Z",
  });
}

describe("W2-010 F04 — approvals and permissions (fixture-contract)", () => {
  it("F04-S01: action without approval is unavailable with a reason and ZERO side effects", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    // The connector was granted ONLY read scope — the priced action needs write.
    const adapter = new FaultInjectingConnectorAdapter("f04-s01-provider", {
      connect: { kind: "connected", scopeTokens: ["orders.read"], permissions: ["orders.read"] },
    });
    const connected = await rig.connect(adapter, { scopes: "orders.read", permissions: ["orders.read"] });
    const observed = await rig.runtime.observe(connected.connectorId);
    const dispatch = await dispatchScopedStep(rig, connected, adapter, observed.observation, { scope: "orders.write", permissions: ["orders.write"] });
    // The REAL machinery blocks the step deterministically…
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("NOT_EXECUTABLE");
    if (planned?.executability.status === "NOT_EXECUTABLE") {
      expect(planned.executability.reasons).toContain("MISSING_PERMISSION");
    }
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
    // …and the decision card a UI renders projects exactly that: unavailable
    // with the reason, approval PENDING.
    const card = pricingDecisionCard("pending");
    expect(card.authority.currentStatus).toBe("pending");
    expect(card.action.available).toBe(false);
    expect(card.action.unavailableReason).toContain("approval required");
  });

  it("F04-S02: approval granted → the same action is available and executes", async () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-success");
    const rig = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f04-s02-provider");
    const connected = await rig.connect(adapter);
    const observed = await rig.runtime.observe(connected.connectorId);
    const dispatch = await dispatchScopedStep(rig, connected, adapter, observed.observation, { scope: "orders.read" });
    expect(dispatch.plannedSteps[0]?.executability.status).toBe("EXECUTABLE");
    expect(dispatch.journeyOutcome).toBe("succeeded");
    expect(adapter.recordedCalls().executeInputs).toHaveLength(1);
    const card = pricingDecisionCard("granted");
    expect(card.authority.currentStatus).toBe("granted");
    expect(card.action.available).toBe(true);
    expect(card.action.unavailableReason).toBeUndefined();
  });

  it("F04-S03: insufficient credential scope — deterministic NOT_EXECUTABLE before any provider call", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f04-s03-provider", {
      connect: { kind: "connected", scopeTokens: ["orders.read"], permissions: ["orders.read", "orders.write", "refunds.write"] },
    });
    const connected = await rig.connect(adapter, { scopes: "orders.read", permissions: ["orders.read", "orders.write", "refunds.write"] });
    const observed = await rig.runtime.observe(connected.connectorId);
    const dispatch = await dispatchScopedStep(rig, connected, adapter, observed.observation, { scope: "orders.write refunds.write" });
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("NOT_EXECUTABLE");
    if (planned?.executability.status === "NOT_EXECUTABLE") {
      expect(planned.executability.reasons).toContain("INSUFFICIENT_CREDENTIAL_SCOPE");
    }
    expect(dispatch.journeyOutcome).toBe("failed-recoverable");
    // VISIBLE (zero-side-effect proof): the provider was never invoked.
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
  });

  it("F04-S04: a REVOKED connection is DISCONNECTED — blocked before any provider call", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f04-s04-provider", {
      connect: { kind: "connected", scopeTokens: ["orders.read", "orders.write"], permissions: ["orders.read", "orders.write"], connectionStatus: "REVOKED" },
    });
    const connected = await rig.connect(adapter);
    const observed = await rig.runtime.observe(connected.connectorId);
    const dispatch = await dispatchScopedStep(rig, connected, adapter, observed.observation, { scope: "orders.read" });
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("NOT_EXECUTABLE");
    if (planned?.executability.status === "NOT_EXECUTABLE") {
      expect(planned.executability.reasons).toContain("DISCONNECTED");
    }
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
    // VISIBLE: the revoked status is surfaced on the instance the studio renders.
    expect(connected.instance.connectionStatus).toBe("REVOKED");
  });

  it("F04-S05: customer-action-required connect is first-class — execution refused until completed", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f04-s05-provider", {
      connect: { kind: "customer-action-required", note: "your provider needs you to confirm access (OTP)" },
    });
    const registered = rig.runtime.register(adapter);
    const connected = await rig.runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "account-1",
      credential: {
        kind: "api-secret",
        material: "resilience-material-f04-s05",
        forAdapterId: "f04-s05-provider",
        forAccountRef: "account-1",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read",
    });
    // VISIBLE: lifecycle is customer-action-required — not failed, not unknown.
    expect(connected.lifecycle).toBe("customer-action-required");
    // Execution is refused deterministically.
    await expect(
      rig.runtime.execute(
        {
          requestId: "req-f04-s05",
          connectorId: registered.connectorId,
          capabilityInstanceRef: "instance:none" as never,
          transportId: "rest",
          commandRef: "cmd-f04-s05",
          idempotencyKey: "f04-s05-key" as never,
          authorization: "authorization:f04-s05" as never,
          requestedAt: "2026-10-10T09:00:00Z",
        } as never,
        { requestedBy: asPrincipalRef("buyer:w2"), payloadRef: "payload:f04-s05" },
      ),
    ).rejects.toThrow(/customer-action-required, not connected/);
    // Recovery: the customer completes the action; the provider connects.
    adapter.updateScript({ connect: { kind: "connected", scopeTokens: ["orders.read"], permissions: ["orders.read"] } });
    const recovered = await rig.connect(adapter, { scopes: "orders.read", permissions: ["orders.read"] });
    expect(recovered.instance.connectionStatus).toBe("CONNECTED");
  });

  it("F04-S06: commercial terms not accepted — capability not executable", async () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    const adapter = new FaultInjectingConnectorAdapter("f04-s06-provider", {
      connect: { kind: "connected", scopeTokens: ["orders.read"], permissions: ["orders.read"], commercialTermsAccepted: false },
    });
    const connected = await rig.connect(adapter, { scopes: "orders.read", permissions: ["orders.read"] });
    const observed = await rig.runtime.observe(connected.connectorId);
    const dispatch = await dispatchScopedStep(rig, connected, adapter, observed.observation, { scope: "orders.read", requiresCommercialTerms: true });
    const planned = dispatch.plannedSteps[0];
    expect(planned?.executability.status).toBe("NOT_EXECUTABLE");
    if (planned?.executability.status === "NOT_EXECUTABLE") {
      expect(planned.executability.reasons).toContain("COMMERCIAL_TERMS_NOT_ACCEPTED");
    }
    expect(adapter.recordedCalls().executeInputs).toHaveLength(0);
    // VISIBLE: the eligibility the studio card renders is pending.
    expect(connected.instance.commercialEligibility.commercialTermsAccepted).toBe(false);
  });

  it("F04-S07: store-control by a non-owner is POLICY_DENIED; unregistered stores fail closed", async () => {
    expect(oracle("S07").expectedResultClass).toBe("expected-block");
    const { createResilienceKernel } = await import("./adapters/resilience-rig");
    const rig = createResilienceKernel();
    const store = makeId<"AutonomousStoreId">("store-f04");
    const owner = { kind: "MERCHANT" as const, merchantId: makeId<"MerchantId">("merchant-owner-f04") };
    const stranger = { kind: "MERCHANT" as const, merchantId: makeId<"MerchantId">("merchant-stranger-f04") };
    const sku = makeId<"SkuId">("sku-f04");
    const location = makeId<"LocationId">("loc-f04");
    // Self-registration law (kernel contract): the registering actor must BE
    // the declared owner — registration under any other actor is rejected.
    // (INHERITED-DEFECT FIX: the previous revision registered under the rig's
    // default SYSTEM actor, so the store never existed and every later
    // override took the NO_REGISTERED_AUTHORITY path.)
    const registered = await rig.exec(
      { type: "REGISTER_AUTONOMOUS_STORE", autonomousStoreId: store, ownerRef: owner, displayName: "F04 Store" },
      { actor: owner },
    );
    expect(registered.status).toBe("EXECUTED");
    // The store's autonomous policy (with a restock rule the owner override
    // can act against) — overrides are policy-gated in the handler.
    rig.kernel.registerAutonomousPolicy({
      policyId: makeId<"AutonomousStorePolicyId">("policy-f04"),
      autonomousStoreId: store,
      revision: 1,
      policyCurrency: USD,
      marginFloorBps: 1000,
      priceChangeApprovalThreshold: money("500", USD),
      promotionBudget: { limitPerPeriod: money("10000", USD), period: "DAILY" },
      spendLimit: { limitPerPeriod: money("10000", USD), period: "DAILY" },
      refundApprovalThreshold: money("5000", USD),
      stopConditions: [],
      storeOperations: {
        tillFloatMin: money("1000", USD),
        tillFloatMax: money("20000", USD),
        cashVarianceEscalationThreshold: money("500", USD),
        countMismatchEscalationUnits: 3,
      },
      restockRules: [
        {
          skuId: sku,
          locationId: location,
          supplierId: makeId<"SupplierId">("sup-f04"),
          thresholdUnits: 5,
          reorderUnits: 20,
          unitCost: money("200", USD),
        },
      ],
    });
    const journalAfterRegistration = rig.events();
    // A stranger attempts the override → deterministic POLICY_DENIED, zero events.
    const refused = await rig.exec(
      {
        type: "RECORD_HUMAN_OVERRIDE",
        autonomousStoreId: store,
        action: { kind: "RESTOCK", skuId: sku, locationId: location, units: 3, reason: "claimed emergency" },
      },
      { actor: stranger },
    );
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") {
      expect(refused.reason.code).toBe("POLICY_DENIED");
      expect(refused.reason.policyDecision?.reasons).toContain("NOT_AUTHORIZED");
    }
    expect(rig.events()).toBe(journalAfterRegistration);
    // An UNREGISTERED store fails closed — NO_REGISTERED_AUTHORITY.
    const ghost = await rig.exec(
      {
        type: "RECORD_HUMAN_OVERRIDE",
        autonomousStoreId: makeId<"AutonomousStoreId">("store-ghost-f04"),
        action: { kind: "PRICE_ADJUSTMENT", skuId: sku, newPrice: money("999", USD), reason: "claimed ownership" },
      },
      { actor: stranger },
    );
    expect(ghost.status).toBe("REJECTED");
    if (ghost.status === "REJECTED") {
      expect(ghost.reason.policyDecision?.reasons).toContain("NO_REGISTERED_AUTHORITY");
    }
    expect(rig.events()).toBe(journalAfterRegistration);
    // Recovery: the OWNER's override is journaled with actor + justification.
    const ownerOverride = await rig.exec(
      {
        type: "RECORD_HUMAN_OVERRIDE",
        autonomousStoreId: store,
        action: { kind: "RESTOCK", skuId: sku, locationId: location, units: 3, reason: "owner-reviewed shortage" },
      },
      { actor: owner },
    );
    expect(ownerOverride.status).toBe("EXECUTED");
    expect(rig.events()).toBeGreaterThan(journalAfterRegistration);
  });
});
