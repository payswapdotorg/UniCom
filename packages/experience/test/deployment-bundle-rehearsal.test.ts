/**
 * W1-019 — bundle-definition + rehearsal tests.
 *
 * Covers:
 * - the capability declarations (all 12 kinds declared, replaceable, no provider names)
 * - the config-surface classification (every key classified, no live-gated values)
 * - the rehearsal assembly + verification (determinism, coverage, boot-smoke)
 * - the boot-smoke contract (NON-LIVE guarantees)
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_DECLARATIONS,
  CONFIG_SURFACE_ENTRIES,
  type BundleInventory,
  type BundleLineage,
} from "../src/deployment/bundle-definition.js";
import {
  assembleBundle,
  computeInventoryDigest,
  verifyBundle,
  rehearseBundle,
  BOOT_SMOKE_CONTRACT,
} from "../src/deployment/rehearsal.js";
import { DEPLOYMENT_CAPABILITIES } from "../src/deployment/provider-adapter.js";

const ALL_KINDS = DEPLOYMENT_CAPABILITIES.map((c) => c.kind);

describe("W1-019 bundle-definition — capability declarations", () => {
  it("all 12 DeploymentCapabilityKinds are declared", () => {
    expect(CAPABILITY_DECLARATIONS).toHaveLength(12);
    const declaredKinds = new Set(CAPABILITY_DECLARATIONS.map((d) => d.kind));
    for (const kind of ALL_KINDS) {
      expect(declaredKinds.has(kind)).toBe(true);
    }
  });

  it("every capability declares replaceableWithoutDomainChanges: true", () => {
    for (const decl of CAPABILITY_DECLARATIONS) {
      expect(decl.replaceableWithoutDomainChanges).toBe(true);
    }
  });

  it("every capability has an adapter pointer (non-empty string)", () => {
    for (const decl of CAPABILITY_DECLARATIONS) {
      expect(decl.adapterPointer.length).toBeGreaterThan(0);
    }
  });

  it("NO provider names in the capability declarations (INVARIANTS 51/52)", () => {
    const json = JSON.stringify(CAPABILITY_DECLARATIONS);
    for (const name of ["vercel", "cloudflare", "neon", "upstash", "apify", "shopify", "stripe", "amazon"]) {
      expect(json.toLowerCase()).not.toContain(name);
    }
  });
});

describe("W1-019 bundle-definition — config-surface classification", () => {
  it("every config key is classified (demo | live-gated | neutral)", () => {
    for (const entry of CONFIG_SURFACE_ENTRIES) {
      expect(["demo", "live-gated", "neutral"]).toContain(entry.classification);
    }
  });

  it("no live-gated config key carries a value (non-live guarantee)", () => {
    for (const entry of CONFIG_SURFACE_ENTRIES) {
      if (entry.classification === "live-gated") {
        expect("value" in entry).toBe(false);
      }
    }
  });

  it("the config surface includes the key boundary keys (payment, connector, database, model, realtime)", () => {
    const keys = new Set(CONFIG_SURFACE_ENTRIES.map((e) => e.key));
    expect(keys.has("PAYMENT_BOUNDARY_PROVIDER_TOKEN")).toBe(true);
    expect(keys.has("CONNECTOR_PROVIDER_TOKEN")).toBe(true);
    expect(keys.has("DATABASE_URL")).toBe(true);
    expect(keys.has("MODEL_GATEWAY_API_KEY")).toBe(true);
    expect(keys.has("REALTIME_COORDINATION_ENDPOINT")).toBe(true);
  });
});

describe("W1-019 rehearsal — assembly + verification", () => {
  const testInventory: BundleInventory = {
    entries: [
      { fileClass: "entrypoint", path: "packages/web/src/index.ts", digest: "sha256:abc123" },
      { fileClass: "contract-barrel", path: "packages/commerce/src/contract.ts", digest: "sha256:def456" },
    ],
    inventoryDigest: "sha256:test-digest",
  };
  const testLineage: BundleLineage = {
    commit: "abc1234",
    generatedAt: "2026-10-15T00:00:00Z",
    toolchain: "node v24",
  };

  it("assembleBundle produces a DeployableBundleDefinition with inventory + capabilities + configSurface", () => {
    const bundle = assembleBundle(testInventory, testLineage);
    expect(bundle.inventory).toEqual(testInventory);
    expect(bundle.lineage).toEqual(testLineage);
    expect(bundle.capabilities.declarations).toHaveLength(12);
    expect(bundle.configSurface.entries.length).toBeGreaterThan(0);
  });

  it("computeInventoryDigest is deterministic (same inputs = same digest)", () => {
    const entries = [
      { path: "b.ts", digest: "sha256:bbb" },
      { path: "a.ts", digest: "sha256:aaa" },
    ];
    const d1 = computeInventoryDigest(entries);
    const d2 = computeInventoryDigest(entries);
    expect(d1).toBe(d2);
  });

  it("verifyBundle: all checks PASS on a valid bundle", () => {
    const first = assembleBundle(testInventory, testLineage);
    const second = assembleBundle(testInventory, testLineage);
    const checks = verifyBundle(first, second);
    const fails = checks.filter((c) => c.result === "FAIL");
    expect(fails, `failing checks: ${fails.map((f) => f.check).join(", ")}`).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(7);
  });

  it("rehearseBundle: allPassed is true, nonLive is true, standingGatesNote is present", () => {
    const result = rehearseBundle(testInventory, testLineage);
    expect(result.allPassed).toBe(true);
    expect(result.nonLive).toBe(true);
    expect(result.standingGatesNote).toContain("NOT_AUTHORIZED");
    expect(result.verification.length).toBeGreaterThanOrEqual(7);
  });

  it("rehearseBundle: a FAIL on hash-determinism when digests differ", () => {
    const inv1: BundleInventory = { ...testInventory, inventoryDigest: "sha256:different1" };
    const inv2: BundleInventory = { ...testInventory, inventoryDigest: "sha256:different2" };
    const first = assembleBundle(inv1, testLineage);
    const second = assembleBundle(inv2, testLineage);
    const checks = verifyBundle(first, second);
    const detCheck = checks.find((c) => c.check === "hash-determinism");
    expect(detCheck?.result).toBe("FAIL");
  });
});

describe("W1-019 boot-smoke contract — NON-LIVE guarantees", () => {
  it("the boot-smoke contract declares required services with contracts", () => {
    expect(BOOT_SMOKE_CONTRACT.requiredServices.length).toBeGreaterThanOrEqual(4);
    for (const s of BOOT_SMOKE_CONTRACT.requiredServices) {
      expect(s.service.length).toBeGreaterThan(0);
      expect(s.contract.length).toBeGreaterThan(0);
    }
  });

  it("the non-live guarantees include NO provider calls, NO credentials, NO database", () => {
    const guarantees = BOOT_SMOKE_CONTRACT.nonLiveGuarantees.join(" ");
    expect(guarantees).toContain("NO provider HTTP calls");
    expect(guarantees).toContain("NO credentials");
    expect(guarantees).toContain("NO database connections");
    expect(guarantees).toContain("NO model provider");
    expect(guarantees).toContain("NO realtime coordination endpoint");
  });
});
