/**
 * Runtime test — credential vaulting and the model-context boundary
 * (W3-002 acceptance scenario 5, adversarial; INVARIANTS 18/27/50).
 *
 * A credential entering the connector runtime is vaulted and PROVABLY
 * absent from any model-context boundary:
 * - by KEY: the canonical `assertNoCredentialMaterial` scanner (reused, not
 *   re-implemented) rejects credential-shaped keys anywhere in a payload;
 * - by VALUE: the vault's deep scan proves sealed secret VALUES never occur
 *   in runtime-visible artifacts (handles, health, evidence, queues);
 * - the only reader of material is the sealed adapter scope.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { assertNoCredentialMaterial, toModelContextMaterial, type CredentialRef } from "@unicom/agent";
import {
  createCredentialVault,
  CredentialPresentationRefused,
  type CredentialVault,
} from "../src/runtime/connector/vault";
import { createModelContextGate } from "../src/runtime/model-context-gate";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { ModelContextGateRefused } from "../src/runtime/model-context-gate";
import { asPrincipalRef, asConnectedCapabilityInstanceId, asIdempotencyKey, asAuthorizationContextRef, asUtcTimestamp } from "../src/runtime/ids";
import { TestDoubleConnectorAdapter, doubleDescriptor, fixedClock, resetClock } from "./doubles";

const CLOCK_BASE = "2026-10-05T11:00:00Z";
const RAW_SECRET = "live-api-key-do-not-leak-9f3a";
const OTHER_SECRET = "another-vaulted-secret-b7c1";

function buildVault(): CredentialVault {
  return createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
}

describe("credential vault (adversarial)", () => {
  beforeEach(() => resetClock());

  it("seals material and returns only the canonical opaque handle", () => {
    const vault = buildVault();
    const handle = vault.seal({
      kind: "api-secret",
      material: RAW_SECRET,
      forAdapterId: "adapter-1",
      forAccountRef: "account-1",
    });
    expect(typeof handle).toBe("string");
    expect(String(handle)).not.toContain(RAW_SECRET);
    expect(vault.sealedCount).toBe(1);
    // The audit surface exposes kinds and scopes — never material.
    const audit = vault.auditSurface();
    expect(audit[0]?.kind).toBe("api-secret");
    expect(audit[0]?.forAdapterId).toBe("adapter-1");
    expect(JSON.stringify(audit)).not.toContain(RAW_SECRET);
  });

  it("presents material ONLY to the sealed adapter execution boundary", () => {
    const vault = buildVault();
    const handle = vault.seal({
      kind: "api-secret",
      material: RAW_SECRET,
      forAdapterId: "adapter-1",
      forAccountRef: "account-1",
    });
    expect(vault.presentForAdapterExecution(handle, "adapter-1")).toBe(RAW_SECRET);
    expect(() => vault.presentForAdapterExecution(handle, "adapter-2")).toThrow(
      CredentialPresentationRefused,
    );
    expect(() =>
      vault.presentForAdapterExecution("not-a-sealed-handle" as CredentialRef, "adapter-1"),
    ).toThrow(CredentialPresentationRefused);
  });

  it("the canonical structural scanner (reused) rejects credential-shaped keys", () => {
    expect(() => assertNoCredentialMaterial({ note: "fine" })).not.toThrow();
    expect(() => assertNoCredentialMaterial({ accessToken: "x" })).toThrow(/credential-shaped/);
    expect(() => assertNoCredentialMaterial({ nested: { sessionCookie: "y" } })).toThrow(
      /credential-shaped/,
    );
  });

  it("the canonical gate (reused) is the only constructor for cleared material", () => {
    const cleared = toModelContextMaterial({ summary: "connector status: healthy" }, "2026-10-05T11:00:00Z");
    expect(cleared.content).toEqual({ summary: "connector status: healthy" });
  });

  it("MODEL-CONTEXT GATE: sealed values are provably absent (value-level scan)", () => {
    const vault = buildVault();
    vault.seal({ kind: "api-secret", material: RAW_SECRET, forAdapterId: "a", forAccountRef: "acc" });
    const gate = createModelContextGate({ vault, clearedAt: "2026-10-05T11:00:00Z" });
    // Clean material clears.
    const cleared = gate.clear({ connectorStatus: "healthy", note: "all good" });
    expect(cleared.content).toEqual({ connectorStatus: "healthy", note: "all good" });
    // Value smuggled under an innocent key name: REFUSED.
    expect(() => gate.clear({ note: `status ${RAW_SECRET}` })).toThrow(ModelContextGateRefused);
    // Key-shaped smuggling: REFUSED by the canonical scanner.
    expect(() => gate.clear({ password: "whatever" })).toThrow(ModelContextGateRefused);
    // Nested smuggling: REFUSED.
    expect(() => gate.clear({ health: { evidence: [{ token: "x" }] } })).toThrow(ModelContextGateRefused);
  });

  it("END-TO-END: a credential enters the runtime and is provably absent from every visible artifact", async () => {
    const vault = buildVault();
    const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("vaulted-a", "rest"), {
      vaultForPresentation: vault,
    });
    const connector = runtime.register(adapter);
    const connected = await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-1",
      credential: {
        kind: "api-secret",
        material: RAW_SECRET,
        forAdapterId: "vaulted-a",
        forAccountRef: "account-1",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read",
    });
    await runtime.observe(connector.connectorId);
    const connectedInstance = connected.connectedInstances[0];
    if (connectedInstance === undefined) throw new Error("test fixture: no connected instance");
    const { evidence } = await runtime.execute(
      {
        requestId: "req-1",
        connectorId: connector.connectorId,
        capabilityInstanceRef: asConnectedCapabilityInstanceId(connectedInstance.connectedInstanceId),
        transportId: "rest",
        commandRef: "orders.read",
        idempotencyKey: asIdempotencyKey("idem-1"),
        authorization: asAuthorizationContextRef("authz-1"),
        requestedAt: asUtcTimestamp("2026-10-05T11:05:00Z"),
      },
      { requestedBy: asPrincipalRef("principal-1"), payloadRef: "payload-1" },
    );
    // The adapter DID present the secret at its execution boundary — the
    // only reader — proven by the vault's own audit trail (presentation
    // count) and the double's presentation counter. The material value
    // itself never appears in any recorded structure.
    expect(adapter.recordedCalls().presentationCount()).toBe(1);
    expect(vault.auditSurface()[0]?.presentations).toBe(1);
    expect(vault.auditSurface()[0]?.kind).toBe("api-secret");
    // Deep value scan across every runtime-visible artifact: no RAW_SECRET.
    const visibleArtifacts = [
      runtime.healthReport(),
      runtime.executionLog(),
      evidence,
      vault.auditSurface(),
    ];
    for (const artifact of visibleArtifacts) {
      expect(vault.containsSealedMaterial(artifact)).toBe(false);
      expect(JSON.stringify(artifact)).not.toContain(RAW_SECRET);
    }
    // The raw material value is absent even from the INTERNAL connector
    // record (it holds only the opaque handle)...
    expect(vault.containsSealedMaterial(connected)).toBe(false);
    expect(JSON.stringify(connected)).not.toContain(RAW_SECRET);
    const gate = createModelContextGate({ vault, clearedAt: "2026-10-05T11:06:00Z" });
    // ...but the internal record still cannot enter model context: the
    // canonical fail-closed scanner refuses even credential-HANDLE-bearing
    // shapes ("sealedCredential"). Adversarial proof of the boundary.
    expect(() => gate.clear(connected as object)).toThrow(ModelContextGateRefused);
    // And every SURFACED artifact CLEARS the model-context gate.
    for (const artifact of visibleArtifacts) {
      expect(() => gate.clear(artifact as object)).not.toThrow();
    }
  });

  it("multiple sealed secrets are all provably absent (value scan is exhaustive)", () => {
    const vault = buildVault();
    vault.seal({ kind: "api-secret", material: RAW_SECRET, forAdapterId: "a", forAccountRef: "acc" });
    vault.seal({ kind: "cookie", material: OTHER_SECRET, forAdapterId: "a", forAccountRef: "acc" });
    expect(vault.containsSealedMaterial({ a: RAW_SECRET })).toBe(true);
    expect(vault.containsSealedMaterial({ deep: { deeper: [OTHER_SECRET] } })).toBe(true);
    expect(vault.containsSealedMaterial({ clean: "payload" })).toBe(false);
  });
});
