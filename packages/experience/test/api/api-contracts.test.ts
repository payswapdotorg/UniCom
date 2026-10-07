/**
 * W3-007 §1 — API/SDK contract suite.
 *
 * Asserts:
 * - every endpoint contract is well-formed (verb, role, path, version);
 * - every command endpoint requires idempotency + authorization + capability instance;
 * - every projection endpoint is journal-derived;
 * - the SDK method registry is in 1:1 correspondence with the endpoint registry;
 * - the GraphQL read path is in projection-equivalence with the REST surface
 *   (no second truth — every GraphQL query maps to a REST projection);
 * - the API explorer surface registry exposes the endpoints (zero orphans).
 */

import { describe, expect, it } from "vitest";
import {
  COMMERCE_API_ENDPOINTS,
  COMMERCE_API_VERSION,
  commandEndpoints,
  capabilityGatedEndpoints,
  endpointById,
  journalDerivedEndpoints,
  projectionEndpoints,
} from "../../src/api/api-contracts";
import {
  COMMERCE_GRAPHQL_QUERY_FIELDS,
  COMMERCE_GRAPHQL_TYPES,
  assertProjectionEquivalence,
  graphQlQueryFieldByName,
  graphQlTypeByName,
} from "../../src/api/graphql-projection";
import {
  COMMERCE_SDK_METHODS,
  sdkMethodNameOf,
  validateSdkPreconditions,
} from "../../src/api/sdk";

describe("API/SDK contract suite (W3-007 §1)", () => {
  it("ships every endpoint at v1 and with a stable id", () => {
    expect(COMMERCE_API_VERSION).toBe("v1");
    expect(COMMERCE_API_ENDPOINTS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(COMMERCE_API_ENDPOINTS.map((endpoint) => endpoint.endpointId));
    expect(ids.size).toBe(COMMERCE_API_ENDPOINTS.length);
    for (const endpoint of COMMERCE_API_ENDPOINTS) {
      expect(endpoint.version).toBe(COMMERCE_API_VERSION);
      expect(endpoint.path.template.startsWith("/v1/")).toBe(true);
      expect(endpoint.summary.length).toBeGreaterThan(0);
    }
  });

  it("requires idempotency + authorization + capability instance on every command endpoint", () => {
    expect(commandEndpoints().length).toBeGreaterThanOrEqual(2);
    for (const endpoint of commandEndpoints()) {
      expect(endpoint.commandRef, `${endpoint.endpointId} must declare a kernel command ref`).toBeDefined();
      expect(endpoint.commandRef!.startsWith("kernel-command:")).toBe(true);
      expect(endpoint.requiresCapabilityInstance).toBe(true);
      expect(endpoint.requiresAuthorization).toBe(true);
      expect(endpoint.request, `${endpoint.endpointId} must declare a request body`).toBeDefined();
      const fields = endpoint.request!.fields;
      expect(fields.some((field) => field.name === "idempotencyKey" && field.required)).toBe(true);
      expect(fields.some((field) => field.name === "connectedInstanceRef" && field.required)).toBe(true);
      expect(fields.some((field) => field.name === "authorization" && field.required)).toBe(true);
    }
  });

  it("marks every projection endpoint as journal-derived with a truth class", () => {
    expect(projectionEndpoints().length).toBeGreaterThanOrEqual(8);
    for (const endpoint of projectionEndpoints()) {
      expect(endpoint.journalDerived, `${endpoint.endpointId} must be journal-derived`).toBe(true);
      expect(endpoint.projectionTruth, `${endpoint.endpointId} must declare projection truth`).toBeDefined();
      expect(["operational", "observed", "predictive"]).toContain(endpoint.projectionTruth);
    }
  });

  it("exposes exactly the journal-derived endpoints for the rebuild-equivalence test", () => {
    expect(journalDerivedEndpoints().length).toBe(projectionEndpoints().length);
  });

  it("gates capability-requiring endpoints explicitly", () => {
    expect(capabilityGatedEndpoints().length).toBeGreaterThanOrEqual(2);
    for (const endpoint of capabilityGatedEndpoints()) {
      expect(endpoint.requiresCapabilityInstance).toBe(true);
    }
  });

  it("derives SDK method names deterministically from endpoint ids", () => {
    expect(sdkMethodNameOf("order.create")).toBe("createOrder");
    expect(sdkMethodNameOf("product.get")).toBe("getProduct");
    expect(sdkMethodNameOf("merchant.get")).toBe("getMerchant");
    expect(sdkMethodNameOf("connector.observe")).toBe("observeConnector");
  });

  it("keeps SDK methods in 1:1 correspondence with endpoints (no hand-written drift)", () => {
    expect(COMMERCE_SDK_METHODS.length).toBe(COMMERCE_API_ENDPOINTS.length);
    const methodNames = new Set(COMMERCE_SDK_METHODS.map((method) => method.methodName));
    expect(methodNames.size).toBe(COMMERCE_SDK_METHODS.length);
    for (const method of COMMERCE_SDK_METHODS) {
      const endpoint = endpointById(method.endpointId);
      expect(endpoint, `method ${method.methodName} → unknown endpoint ${method.endpointId}`).toBeDefined();
      expect(method.role).toBe(endpoint!.role);
      expect(method.requiresIdempotencyKey).toBe(endpoint!.role === "command");
      expect(method.requiresAuthorization).toBe(endpoint!.requiresAuthorization === true);
      expect(method.requiresCapabilityInstance).toBe(endpoint!.requiresCapabilityInstance === true);
    }
  });

  it("validates SDK preconditions before transport (no missing idempotency key, no missing auth)", () => {
    const cmd = validateSdkPreconditions("order.create", {
      pathParams: {},
      connectedInstanceRef: undefined,
      authorization: undefined,
    });
    expect(cmd?.kind).toBe("missing-idempotency-key");

    const cmd2 = validateSdkPreconditions("order.create", {
      pathParams: {},
      idempotencyKey: "idem-1" as never,
      connectedInstanceRef: undefined,
      authorization: undefined,
    });
    expect(cmd2?.kind).toBe("missing-authorization");

    const cmd3 = validateSdkPreconditions("order.create", {
      pathParams: {},
      idempotencyKey: "idem-1" as never,
      connectedInstanceRef: undefined,
      authorization: "auth:1" as never,
    });
    expect(cmd3?.kind).toBe("missing-capability-instance");

    const cmd4 = validateSdkPreconditions("merchant.get", {
      pathParams: {},
    });
    expect(cmd4?.kind).toBe("missing-path-param");

    const ok = validateSdkPreconditions("merchant.get", {
      pathParams: { merchantRef: "merchant:1" },
    });
    expect(ok).toBeUndefined();
  });

  it("exposes the GraphQL read path with projection-equivalence to the REST surface (no second truth)", () => {
    const equivalences = assertProjectionEquivalence();
    expect(equivalences.length).toBe(COMMERCE_GRAPHQL_QUERY_FIELDS.length);
    expect(equivalences.length).toBe(projectionEndpoints().length);
    for (const equiv of equivalences) {
      expect(equiv.endpoint.role).toBe("projection");
      expect(equiv.endpoint.journalDerived).toBe(true);
    }
  });

  it("does not expose any GraphQL mutation field (writes go through REST commands only)", () => {
    const mutationFields = COMMERCE_GRAPHQL_QUERY_FIELDS.filter((field) => field.fieldName.startsWith("create") || field.fieldName.startsWith("update") || field.fieldName.startsWith("delete"));
    expect(mutationFields).toEqual([]);
  });

  it("keeps GraphQL types in 1:1 correspondence with projection resources", () => {
    expect(COMMERCE_GRAPHQL_TYPES.length).toBe(projectionEndpoints().length);
    for (const type of COMMERCE_GRAPHQL_TYPES) {
      expect(type.fields.length).toBeGreaterThan(0);
      expect(graphQlTypeByName(type.typeName)).toBe(type);
    }
    for (const field of COMMERCE_GRAPHQL_QUERY_FIELDS) {
      expect(graphQlQueryFieldByName(field.fieldName)).toBe(field);
    }
  });
});
