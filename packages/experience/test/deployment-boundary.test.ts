/**
 * Contract test 7 — deployment boundary provider-agnosticism
 * (W3-001 §6.7/§5.6, FROZEN §18/§22.8, INVARIANTS 51/52).
 *
 * Domain-facing contracts must reference ZERO provider names. This guard
 * scans every source file under src/ and the package manifest for
 * Vercel/Cloudflare/Neon/Upstash/Apify identifiers. Free-tier limits are
 * typed as observations, never domain semantics; adapters are replaceable
 * without domain changes.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  DeploymentCapabilityKind,
  DeploymentProviderAdapter,
  DeploymentQuotaObservation,
} from "../src/deployment/provider-adapter";
import type { MigrationPathwayView } from "../src/deployment/operator";
import { DEPLOYMENT_CAPABILITIES } from "../src/deployment/provider-adapter";
import type { Equal, Expect } from "./type-helpers";
import { adapterId, utc } from "./branded";

// Compile-time: the adapter interface is provider-agnostic.
export type AssertAdapterKeys = Expect<
  Equal<
    keyof DeploymentProviderAdapter,
    "adapterId" | "displayLabel" | "tier" | "providedCapabilities" | "status" | "quotaObservations" | "replaceableWithoutDomainChanges"
  >
>;

// Compile-time: replaceability is a literal guarantee.
export type AssertReplaceable = Expect<Equal<DeploymentProviderAdapter["replaceableWithoutDomainChanges"], true>>;

// Compile-time: migrations never require domain contract changes.
export type AssertMigrationLiteral = Expect<Equal<MigrationPathwayView["domainContractChangesRequired"], false>>;

// Compile-time: quotas are observations only.
export type AssertQuotaSourceNote = Expect<Equal<DeploymentQuotaObservation["sourceNote"], "deployment-observation-only">>;

const PROVIDER_NAME_PATTERN = /vercel|cloudflare|neon|upstash|apify/i;

function walkTsFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsFiles(full, found);
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));

/** Matrix "Deployment coverage" rows mapped to provider-neutral kinds. */
const DEPLOY_FEATURE_TO_KIND: readonly { featureId: string; kind: DeploymentCapabilityKind }[] = [
  { featureId: "deploy-edge-api", kind: "edge-api" },
  { featureId: "deploy-durable-workflows", kind: "durable-workflow" },
  { featureId: "deploy-async-queues", kind: "async-queue" },
  { featureId: "deploy-realtime-coordination", kind: "realtime-coordination" },
  { featureId: "deploy-postgres", kind: "relational-store" },
  { featureId: "deploy-object-evidence-storage", kind: "object-evidence-storage" },
  { featureId: "deploy-cache", kind: "cache" },
  { featureId: "deploy-browser-runtime", kind: "browser-runtime" },
  { featureId: "deploy-local-merchant-edge", kind: "local-merchant-edge" },
  { featureId: "deploy-model-gateway", kind: "model-gateway" },
  { featureId: "deploy-observability", kind: "observability" },
  { featureId: "deploy-replaceable-compute-provider-adapters", kind: "replaceable-compute" },
];

describe("deployment boundary", () => {
  it("references ZERO provider names across all domain-facing source files", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcDir)) {
      const source = readFileSync(file, "utf8");
      if (PROVIDER_NAME_PATTERN.test(source)) offenders.push(file.split("/src/")[1] ?? file);
    }
    expect(offenders).toEqual([]);
  });

  it("declares no provider SDK dependencies in the package manifest", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...manifest.dependencies, ...manifest.devDependencies };
    const offenders = Object.keys(allDeps).filter((dep) => PROVIDER_NAME_PATTERN.test(dep));
    expect(offenders).toEqual([]);
    // Stage-0 law: no @unicom/agent dependency yet (typed seam lands in W3-002).
    expect(Object.keys(allDeps).some((dep) => dep.startsWith("@unicom/"))).toBe(false);
  });

  it("maps every deployment coverage feature to a provider-neutral capability kind", () => {
    const kinds = new Set(DEPLOYMENT_CAPABILITIES.map((capability) => capability.kind));
    expect(DEPLOYMENT_CAPABILITIES.length).toBe(12);
    for (const mapping of DEPLOY_FEATURE_TO_KIND) {
      expect(kinds.has(mapping.kind), `missing deployment capability: ${mapping.kind}`).toBe(true);
    }
    expect(DEPLOY_FEATURE_TO_KIND.length).toBe(12);
  });

  it("types adapters as replaceable without domain changes (fixture)", () => {
    const adapter: DeploymentProviderAdapter = {
      adapterId: adapterId("adapter-prototype-1"),
      displayLabel: "Prototype edge (configured label)",
      tier: "prototype-free",
      providedCapabilities: ["edge-api", "relational-store", "cache"],
      status: "healthy",
      quotaObservations: [
        {
          metricId: "requests-per-day",
          limitDescription: "100k requests/day (observed)",
          usedDescription: "12k requests today",
          observedAt: utc("2026-10-05T00:00:00Z"),
          sourceNote: "deployment-observation-only",
        },
      ],
      replaceableWithoutDomainChanges: true,
    };
    expect(adapter.replaceableWithoutDomainChanges).toBe(true);
    expect(adapter.quotaObservations[0]?.sourceNote).toBe("deployment-observation-only");
    expect(adapter.displayLabel).not.toMatch(PROVIDER_NAME_PATTERN);
  });

  it("keeps free-tier limits as deployment constraints, never domain semantics", () => {
    const migration: MigrationPathwayView = {
      fromAdapterId: adapterId("adapter-a"),
      toAdapterId: adapterId("adapter-b"),
      domainContractChangesRequired: false,
      steps: ["provision target", "replicate state", "switch traffic"],
    };
    expect(migration.domainContractChangesRequired).toBe(false);
  });
});
