/**
 * W3-006 acceptance scenario 1 — the fully-specified node-server target
 * adapter builds + boots + passes health/readiness probes END-TO-END in a
 * headless test: typed environment resolution (contracts enforced), REAL
 * build commands through the node command executor, REAL loopback HTTP
 * servers, real fetch probes, startup ordering with readiness gating, and
 * graceful shutdown. No mocks of the surfaces under test.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploymentTargetPlan } from "../src/deployment/manifest";
import {
  DeploymentEnvironmentError,
  DeploymentPlanError,
} from "../src/deployment/manifest";
import {
  NODE_SERVER_TARGET_PLAN,
  resolveDeploymentEnvironment,
  resolveStartupOrder,
} from "../src/runtime/deployment/target-plan";
import {
  createTargetDeploymentAdapter,
  type TargetDeploymentAdapter,
} from "../src/runtime/deployment/target-adapter";
import { fixedUtcClock } from "./doubles";

const CLOCK = fixedUtcClock("2026-10-09T07:00:00Z");

const PLAN_ENV: Record<string, Record<string, string>> = {
  "kernel-store": {},
  "connector-worker": { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-1" },
  "experience-web": { UNICOM_PUBLIC_BASE_URL: "https://unicom.example.test" },
};

describe("deployment target adapter (scenario 1, end-to-end)", () => {
  let adapter: TargetDeploymentAdapter;

  beforeEach(() => {
    adapter = createTargetDeploymentAdapter({ plan: NODE_SERVER_TARGET_PLAN, clock: CLOCK });
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  it("exposes a fully-specified provider-agnostic plan (3 services, probes, ordering)", () => {
    expect(NODE_SERVER_TARGET_PLAN.services).toHaveLength(3);
    expect(NODE_SERVER_TARGET_PLAN.services.map((service) => service.serviceId)).toEqual([
      "kernel-store",
      "connector-worker",
      "experience-web",
    ]);
    for (const service of NODE_SERVER_TARGET_PLAN.services) {
      expect(service.probes.map((probe) => probe.kind).sort()).toEqual(["liveness", "readiness", "startup"]);
      expect(service.environment.variables.length).toBeGreaterThan(0);
      expect(service.buildSteps.length).toBeGreaterThan(0);
    }
    // Startup ordering: web tier depends on store + worker; worker on store.
    const web = NODE_SERVER_TARGET_PLAN.services.find((service) => service.serviceId === "experience-web");
    expect(web?.dependsOn).toEqual(["kernel-store", "connector-worker"]);
  });

  it("resolves startup order topologically and rejects cycles + unknown dependencies", () => {
    expect(resolveStartupOrder(NODE_SERVER_TARGET_PLAN)).toEqual([
      "kernel-store",
      "connector-worker",
      "experience-web",
    ]);
    const cyclic: DeploymentTargetPlan = {
      ...NODE_SERVER_TARGET_PLAN,
      services: [
        ...NODE_SERVER_TARGET_PLAN.services.filter((service) => service.serviceId !== "kernel-store"),
        {
          ...(NODE_SERVER_TARGET_PLAN.services[0] as (typeof NODE_SERVER_TARGET_PLAN.services)[number]),
          dependsOn: ["experience-web"],
        },
      ],
    };
    expect(() => resolveStartupOrder(cyclic)).toThrow(DeploymentPlanError);
    const unknownDep: DeploymentTargetPlan = {
      ...NODE_SERVER_TARGET_PLAN,
      services: [
        ...(NODE_SERVER_TARGET_PLAN.services[0] as (typeof NODE_SERVER_TARGET_PLAN.services)[number]).dependsOn.includes("x")
          ? []
          : [],
        {
          ...(NODE_SERVER_TARGET_PLAN.services[0] as (typeof NODE_SERVER_TARGET_PLAN.services)[number]),
          dependsOn: ["no-such-service"],
        },
        ...NODE_SERVER_TARGET_PLAN.services.slice(1),
      ],
    };
    expect(() => resolveStartupOrder(unknownDep)).toThrow(DeploymentPlanError);
  });

  it("enforces the typed environment contracts (missing + invalid rejected, defaults applied)", () => {
    const workerContract = NODE_SERVER_TARGET_PLAN.services
      .find((service) => service.serviceId === "connector-worker")
      ?.environment;
    if (workerContract === undefined) throw new Error("missing worker contract");
    // Missing required secret-ref → typed error.
    expect(() => resolveDeploymentEnvironment(workerContract, {}, "127.0.0.1")).toThrow(DeploymentEnvironmentError);
    // Wrong kind (number field given non-numeric) → typed error.
    expect(() =>
      resolveDeploymentEnvironment(
        workerContract,
        { UNICOM_CREDENTIAL_VAULT_KEY_REF: "ref-1", UNICOM_CONNECTOR_MAX_CONCURRENCY: "many" },
        "127.0.0.1",
      ),
    ).toThrow(DeploymentEnvironmentError);
    // Valid input: defaults applied, loopback derived, secret stays a REF.
    const resolved = resolveDeploymentEnvironment(
      workerContract,
      { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-1" },
      "127.0.0.1",
    );
    const byName = new Map(resolved.values.map((value) => [value.name, value]));
    expect(byName.get("UNICOM_CONNECTOR_MAX_CONCURRENCY")).toMatchObject({ value: "3", origin: "default" });
    expect(byName.get("UNICOM_BIND_HOST")).toMatchObject({ value: "127.0.0.1", origin: "derived-loopback" });
    expect(byName.get("UNICOM_CREDENTIAL_VAULT_KEY_REF")?.value).not.toContain("secret");
  });

  it("builds every service through the REAL node command executor (exit 0, artifacts)", async () => {
    const buildResults = await adapter.build(PLAN_ENV);
    expect(buildResults).toHaveLength(5);
    for (const result of buildResults) {
      expect(result.exitCode).toBe(0);
      expect(result.producedArtifacts.length).toBeGreaterThan(0);
    }
    const stdout = buildResults.map((result) => result.stdout).join(" ");
    expect(stdout).toContain("kernel-store: compiled");
    expect(stdout).toContain("connector-worker: linked");
    expect(stdout).toContain("experience-web: linked");
  });

  it("rejects a build with an unmet required environment variable", async () => {
    await expect(
      adapter.build({
        "kernel-store": {},
        "connector-worker": {},
        "experience-web": { UNICOM_PUBLIC_BASE_URL: "https://unicom.example.test" },
      }),
    ).rejects.toThrow(DeploymentEnvironmentError);
  });

  it("boots in startup order and passes liveness + readiness + startup probes over REAL HTTP", async () => {
    await adapter.build(PLAN_ENV);
    const probeResults = await adapter.boot();
    expect(probeResults).toHaveLength(9);
    for (const result of probeResults) {
      expect(result.passed).toBe(true);
      expect(result.httpStatus).toBe(200);
    }
    const status = adapter.status();
    expect(status.allReady).toBe(true);
    expect(status.services.every((service) => service.state === "ready")).toBe(true);
    // Real loopback ports were assigned (ephemeral).
    for (const service of status.services) {
      expect(typeof service.port).toBe("number");
    }
  });

  it("readiness of a dependent goes 503 when a dependency is terminated (startup-order law, live)", async () => {
    await adapter.build(PLAN_ENV);
    await adapter.boot();
    // Terminate the store (pod loss) — the web tier's readiness must drop.
    await adapter.terminateService("kernel-store");
    const webReady = await adapter.probe("experience-web", "probe:experience-web:readiness");
    expect(webReady.passed).toBe(false);
    expect(webReady.httpStatus).toBe(503);
    const status = adapter.status();
    const web = status.services.find((service) => service.serviceId === "experience-web");
    expect(web?.readinessBlockedBy).toEqual(["kernel-store"]);
    // Liveness of the web tier is unaffected (the process itself is alive).
    const webLive = await adapter.probe("experience-web", "probe:experience-web:liveness");
    expect(webLive.passed).toBe(true);
  });

  it("recovers a terminated service through restartService (probes pass again)", async () => {
    await adapter.build(PLAN_ENV);
    await adapter.boot();
    await adapter.terminateService("connector-worker");
    const dead = await adapter.probe("connector-worker", "probe:connector-worker:liveness");
    expect(dead.passed).toBe(false);
    expect(dead.httpStatus).toBe("connection-failed");
    const restarted = await adapter.restartService("connector-worker");
    expect(restarted.every((result) => result.passed)).toBe(true);
    expect(adapter.status().allReady).toBe(true);
  });

  it("projects itself into the provider-agnostic W3-001 adapter view", async () => {
    await adapter.build(PLAN_ENV);
    await adapter.boot();
    const view = adapter.providerAdapterView();
    expect(view.status).toBe("healthy");
    expect(view.tier).toBe("self-hosted");
    expect(view.replaceableWithoutDomainChanges).toBe(true);
    expect(view.providedCapabilities).toContain("relational-store");
    expect(view.providedCapabilities).toContain("observability");
    // Provider-name law: the view stays provider-agnostic.
    expect(view.displayLabel).not.toMatch(/vercel|cloudflare|neon|upstash|apify/i);
  });

  it("fails probes after shutdown (connection refused, never fabricated health)", async () => {
    await adapter.build(PLAN_ENV);
    await adapter.boot();
    await adapter.shutdown();
    const probe = await adapter.probe("kernel-store", "probe:kernel-store:liveness");
    expect(probe.passed).toBe(false);
    expect(probe.httpStatus).toBe("connection-failed");
    expect(adapter.status().allReady).toBe(false);
  });

  it("restores the deployment CONFIGURATION state deterministically (same plan + env → identical environments, plane green again)", async () => {
    await adapter.build(PLAN_ENV);
    await adapter.boot();
    await adapter.shutdown();
    // "Configuration restore": a fresh adapter over the SAME plan resolves
    // the SAME environment contracts (byte-identical values + origins) and
    // the plane comes back green — deployment config is reproducible.
    const fresh = createTargetDeploymentAdapter({ plan: NODE_SERVER_TARGET_PLAN, clock: CLOCK });
    await fresh.build(PLAN_ENV);
    const probes = await fresh.boot();
    try {
      expect(probes.every((probe) => probe.passed)).toBe(true);
      expect(fresh.status().allReady).toBe(true);
      const environmentOne = resolveDeploymentEnvironment(
        NODE_SERVER_TARGET_PLAN.services
          .find((service) => service.serviceId === "connector-worker")
          ?.environment as (typeof NODE_SERVER_TARGET_PLAN.services)[number]["environment"],
        { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-1" },
        "127.0.0.1",
      );
      const environmentTwo = resolveDeploymentEnvironment(
        NODE_SERVER_TARGET_PLAN.services
          .find((service) => service.serviceId === "connector-worker")
          ?.environment as (typeof NODE_SERVER_TARGET_PLAN.services)[number]["environment"],
        { UNICOM_CREDENTIAL_VAULT_KEY_REF: "vault-key-ref-opaque-1" },
        "127.0.0.1",
      );
      expect(environmentOne).toEqual(environmentTwo);
    } finally {
      await fresh.shutdown();
    }
  });
});
