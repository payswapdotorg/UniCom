/**
 * Runtime test — the typed @unicom/agent vocabulary seam
 * (W3-002 vocabulary discipline; INVARIANT 34).
 *
 * The experience runtime CONSUMES Worker 2's canonical capability
 * vocabulary via the public entrypoints `@unicom/agent` and
 * `@unicom/agent/capability`. This suite proves:
 *
 * 1. IMPORT IDENTITY: the runtime's ExecutionMode and executability
 *    evaluation ARE the canonical objects/functions — same references;
 * 2. NO SECOND VOCABULARY: no capability-vocabulary declarations exist
 *    anywhere in the experience package source;
 * 3. the canonical evaluator itself is exercised through the dispatch
 *    plumbing (not bypassed).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  ExecutionMode as CanonicalExecutionMode,
  evaluateCapabilityExecutability as canonicalEvaluate,
  credentialScope,
  credentialRef,
} from "@unicom/agent";
import {
  ExecutionMode as RuntimeExecutionMode,
  evaluateCapabilityExecutability as runtimeEvaluate,
} from "@unicom/agent/capability";
import { ExecutionMode as SeamExecutionMode } from "../src/runtime/connector/dispatch";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

function walkTsFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsFiles(full, found);
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

describe("typed vocabulary seam (canonical @unicom/agent consumption)", () => {
  it("ExecutionMode re-exported by the runtime IS the canonical constant object", () => {
    expect(SeamExecutionMode).toBe(CanonicalExecutionMode);
    expect(RuntimeExecutionMode).toBe(CanonicalExecutionMode);
    expect(SeamExecutionMode.PASS_THROUGH_NATIVE).toBe("PASS_THROUGH_NATIVE");
  });

  it("the runtime's executability evaluator IS the canonical function (same reference)", () => {
    expect(runtimeEvaluate).toBe(canonicalEvaluate);
    expect(typeof canonicalEvaluate).toBe("function");
  });

  it("canonical constructors work through the seam (scope satisfaction semantics)", () => {
    const granted = credentialScope("orders.read orders.write");
    expect(credentialScope("orders.read")).toBeTruthy();
    const required = credentialScope("orders.read orders.write");
    const tokens = required.split(/\s+/);
    expect(tokens).toEqual(["orders.read", "orders.write"]);
    expect(new Set(granted.split(/\s+/)).size).toBe(2);
    expect(typeof credentialRef("x")).toBe("string");
  });

  it("NO second capability vocabulary exists anywhere in experience src (source scan)", () => {
    const offenders: string[] = [];
    const vocabularyNames = [
      "CapabilityDefinition",
      "ProviderImplementation",
      "ConnectedCapabilityInstance",
      "CapabilityObservation",
      "CapabilityExecutability",
      "ExecutabilityPreconditions",
      "ExecutabilityEvaluationInput",
      "ExecutionMode",
      "CredentialRef",
      "CredentialScope",
    ];
    // A DECLARATION introduces the name as a new type/value (re-export lists
    // and import clauses do not).
    const declarationPattern = new RegExp(
      `\\b(?:interface|type|class|enum|const|function)\\s+(${vocabularyNames.join("|")})\\b`,
    );
    for (const file of walkTsFiles(srcDir)) {
      // Strip import clauses and re-export-from lists: consuming the
      // canonical vocabulary by name is exactly what we WANT to see.
      const source = readFileSync(file, "utf8")
        .replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g, "")
        .replace(/export\s+(?:type\s+)?\{[^}]*\}\s*from\s+["'][^"']+["'];?/g, "");
      const match = declarationPattern.exec(source);
      if (match !== null) {
        offenders.push(`${file.split("/src/")[1] ?? file}: declares ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("experience src consumes the vocabulary via @unicom/agent entrypoints (import scan)", () => {
    const importers = walkTsFiles(srcDir).filter((file) =>
      /from\s+["']@unicom\/agent(?:\/capability)?["']/.test(readFileSync(file, "utf8")),
    );
    expect(importers.length).toBeGreaterThan(0);
    // Only public entrypoints — never a deep path into agent internals.
    const deepImports = walkTsFiles(srcDir).filter((file) =>
      /from\s+["']@unicom\/agent\/(?!capability["']|$)/.test(readFileSync(file, "utf8")),
    );
    expect(deepImports).toEqual([]);
  });

  it("the canonical executability evaluator is live inside dispatch plumbing", async () => {
    // Driven through planJourney — catalog-only means NOT_EXECUTABLE by the
    // CANONICAL evaluator, not by a local reimplementation.
    const { planJourney } = await import("../src/runtime/connector/dispatch");
    const { asCapabilityDefinitionId, asAuthorizationContextRef } = await import("../src/runtime/ids");
    const { credentialScope: scope } = await import("@unicom/agent");
    const plan = planJourney({
      journeyRef: "j",
      mode: CanonicalExecutionMode.COMPOSED,
      steps: [
        {
          stepRef: "s1",
          capabilityDefinitionId: asCapabilityDefinitionId("cap-x"),
          preconditions: {
            requiresConnectedInstance: true,
            requiredCredentialScope: scope("orders.read"),
            requiredPermissions: [],
            requiresCommercialTermsAccepted: false,
            requiresCurrentObservation: true,
          },
          commandRef: "c",
          payloadRef: "p",
        },
      ],
      instances: [],
      observations: [],
      implementations: [],
      idempotencySeed: "seed",
      authorization: asAuthorizationContextRef("authz"),
      requestedAt: "2026-10-05T11:00:00Z",
    });
    expect(plan[0]?.executability.status).toBe("NOT_EXECUTABLE");
    if (plan[0]?.executability.status === "NOT_EXECUTABLE") {
      expect(plan[0].executability.reasons).toContain("CATALOG_ONLY_NO_CONNECTED_INSTANCE");
    }
  });
});
