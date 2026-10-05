import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  CapabilityDefinition,
  CapabilityExecutability,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ExecutabilityPreconditions,
  ProviderImplementation,
} from "../src/index.js";
import {
  EXECUTION_MODES,
  ExecutionMode,
  credentialScope,
  evaluateCapabilityExecutability,
} from "../src/index.js";

/**
 * Executability preconditions (FROZEN-ARCHITECTURE §3.D; invariants 7-12).
 * Catalog presence NEVER implies executable authority; execution requires a
 * ConnectedCapabilityInstance plus a current CapabilityObservation; UNKNOWN
 * is not FAILED; provider-specific states are preserved.
 */

const CAPABILITY: CapabilityDefinition = {
  capabilityDefinitionId: "cap.orders.place",
  name: "place order",
  supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
  transportNeutral: true,
};

const IMPLEMENTATION: ProviderImplementation = {
  providerImplementationId: "impl.shopify.orders.v1",
  capabilityDefinitionId: CAPABILITY.capabilityDefinitionId,
  providerId: "provider.shopify",
  supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE],
  transports: ["REST"],
};

const PRECONDITIONS: ExecutabilityPreconditions = {
  requiresConnectedInstance: true,
  requiredCredentialScope: "orders.read orders.write",
  requiredPermissions: ["write_orders"],
  requiredGeography: "GH",
  requiredCurrency: "GHS",
  requiresCommercialTermsAccepted: true,
  requiresCurrentObservation: true,
};

function buildInstance(input: Partial<ConnectedCapabilityInstance> = {}): ConnectedCapabilityInstance {
  return {
    connectedInstanceId: "conn-1",
    providerImplementationId: IMPLEMENTATION.providerImplementationId,
    accountRef: "account://merchant-kantamanto/shopify",
    connectionStatus: "CONNECTED",
    credentialScope: credentialScope("orders.read orders.write"),
    grantedPermissions: ["write_orders", "read_orders"],
    commercialEligibility: {
      supportedGeographies: ["GH", "TG"],
      supportedCurrencies: ["GHS", "USD"],
      commercialTermsAccepted: true,
    },
    authorizedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE],
    ...input,
  };
}

function buildObservation(input: Partial<CapabilityObservation> = {}): CapabilityObservation {
  return {
    observationId: "obs-1",
    connectedInstanceId: "conn-1",
    observedAt: "2026-11-05T07:00:00.000Z",
    status: "NOMINAL",
    freshness: "CURRENT",
    ...input,
  };
}

describe("execution modes are an explicit enum", () => {
  it("declares PASS_THROUGH_NATIVE, COMPOSED and OPTIMIZED_MULTI_PROVIDER", () => {
    expect(EXECUTION_MODES).toEqual(["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"]);
    expect(CAPABILITY.supportedExecutionModes).toContain(ExecutionMode.COMPOSED);
    expectTypeOf<ExecutionMode>().toEqualTypeOf<"PASS_THROUGH_NATIVE" | "COMPOSED" | "OPTIMIZED_MULTI_PROVIDER">();
  });
});

describe("executability preconditions", () => {
  it("treats catalog presence WITHOUT a connected instance as NOT executable — never as executable authority", () => {
    const result = evaluateCapabilityExecutability({ preconditions: PRECONDITIONS });
    expect(result.status).toBe("NOT_EXECUTABLE");
    expect(result).toEqual({
      status: "NOT_EXECUTABLE",
      reasons: ["CATALOG_ONLY_NO_CONNECTED_INSTANCE"],
    });
  });

  it("marks a fully connected, currently observed instance executable", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation(),
      implementation: IMPLEMENTATION,
      requestedExecutionMode: ExecutionMode.PASS_THROUGH_NATIVE,
    });
    expect(result).toEqual({
      status: "EXECUTABLE",
      connectedInstanceId: "conn-1",
      observationId: "obs-1",
      executionMode: "PASS_THROUGH_NATIVE",
    });
  });

  it("reports UNKNOWN — not FAILED/not-executable — when the provider observation itself is UNKNOWN", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ status: "UNKNOWN" }),
    });
    expect(result.status).toBe("UNKNOWN");
    if (result.status === "UNKNOWN") expect(result.cause).toBe("OBSERVATION_STATUS_UNKNOWN");
  });

  it("reports UNKNOWN when the connection status is UNKNOWN (ambiguous, not failed)", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance({ connectionStatus: "UNKNOWN" }),
      observation: buildObservation(),
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("reports UNKNOWN when the observation is missing or stale", () => {
    const missing = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
    });
    expect(missing.status).toBe("UNKNOWN");

    const stale = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ freshness: "STALE" }),
    });
    expect(stale.status).toBe("UNKNOWN");
    if (stale.status === "UNKNOWN") expect(stale.cause).toBe("STALE_OBSERVATION");
  });

  it("preserves provider-specific states — an uninterpreted provider state is UNKNOWN and carries the provider state code", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ status: "PROVIDER_SPECIFIC", providerStateCode: "SHOPIFY_GDPR_HOLD" }),
    });
    expect(result.status).toBe("UNKNOWN");
    if (result.status === "UNKNOWN") {
      expect(result.cause).toBe("PROVIDER_STATE_UNINTERPRETED");
      expect(result.providerStateCode).toBe("SHOPIFY_GDPR_HOLD");
    }
  });

  it("preserves customer-action-required as a distinct known state that blocks execution", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ status: "CUSTOMER_ACTION_REQUIRED", providerStateCode: "MFA_REVERIFY_REQUIRED" }),
    });
    expect(result.status).toBe("NOT_EXECUTABLE");
    if (result.status === "NOT_EXECUTABLE") expect(result.reasons).toContain("CUSTOMER_ACTION_REQUIRED");
  });

  it("lists typed rejection reasons for every failed precondition", () => {
    const insufficient = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance({
        credentialScope: credentialScope("orders.read"),
        grantedPermissions: ["read_orders"],
        commercialEligibility: { supportedGeographies: ["US"], supportedCurrencies: ["USD"], commercialTermsAccepted: false },
      }),
      observation: buildObservation(),
    });
    expect(insufficient.status).toBe("NOT_EXECUTABLE");
    if (insufficient.status === "NOT_EXECUTABLE") {
      expect(insufficient.reasons).toEqual(
        expect.arrayContaining([
          "INSUFFICIENT_CREDENTIAL_SCOPE",
          "MISSING_PERMISSION",
          "GEOGRAPHY_INELIGIBLE",
          "CURRENCY_INELIGIBLE",
          "COMMERCIAL_TERMS_NOT_ACCEPTED",
        ]),
      );
    }
  });

  it("rejects an execution mode the connected instance is not authorized for", () => {
    const result = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance({ authorizedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE] }),
      observation: buildObservation(),
      implementation: IMPLEMENTATION,
      requestedExecutionMode: ExecutionMode.COMPOSED,
    });
    expect(result.status).toBe("NOT_EXECUTABLE");
    if (result.status === "NOT_EXECUTABLE") expect(result.reasons).toContain("EXECUTION_MODE_NOT_SUPPORTED");
  });

  it("treats a FAILED provider observation as not executable — distinct from UNKNOWN", () => {
    const failed = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ status: "FAILED" }),
    });
    expect(failed.status).toBe("NOT_EXECUTABLE");

    const unknown = evaluateCapabilityExecutability({
      preconditions: PRECONDITIONS,
      connectedInstance: buildInstance(),
      observation: buildObservation({ status: "UNKNOWN" }),
    });
    expect((unknown as { status: string }).status).not.toBe((failed as { status: string }).status);
    expectTypeOf<CapabilityExecutability["status"]>().toEqualTypeOf<"EXECUTABLE" | "NOT_EXECUTABLE" | "UNKNOWN">();
  });
});
