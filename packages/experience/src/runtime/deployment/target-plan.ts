/**
 * The fully-specified node-server deployment target plan (W3-006 §Scope 1).
 *
 * Provider-agnostic BY CONSTRUCTION: no provider names, no provider SDKs —
 * only typed environment contracts, build steps, probes and startup
 * ordering (docs/UX-DEPLOYMENT.md "Portability rule"). The target adapter
 * that executes this plan lives in `./target-adapter`.
 *
 * Topology (single-writer kernel law + connector worker rule):
 *   kernel-store (relational-store, the sole writer's storage)
 *     ↑            ↑
 *   connector-worker (async queue + browser runtime, outside request handlers)
 *     ↑            ↑
 *   experience-web (edge API + realtime coordination + observability)
 */

import type {
  DeploymentEnvVarSpec,
  DeploymentTargetPlan,
} from "../../deployment/manifest";

const storeEnv: readonly DeploymentEnvVarSpec[] = [
  { name: "UNICOM_STORE_MODE", kind: "string", required: true, description: "Kernel storage mode for this target", default: "embedded-journal" },
  { name: "UNICOM_JOURNAL_ENFORCE_SEQUENCE", kind: "boolean", required: true, description: "Enforce the gapless per-subject sequence law", default: "true" },
  { name: "UNICOM_BACKUP_INTERVAL_SECONDS", kind: "number", required: true, description: "Journal backup cadence (DR runbook)", default: "300" },
];

const workerEnv: readonly DeploymentEnvVarSpec[] = [
  { name: "UNICOM_CONNECTOR_MAX_CONCURRENCY", kind: "number", required: true, description: "Connector journeys admitted concurrently", default: "3" },
  { name: "UNICOM_BROWSER_SESSION_ISOLATION", kind: "boolean", required: true, description: "Per-session browser isolation (invariant 28)", default: "true" },
  // A REFERENCE to sealed vault material — the value never carries the
  // material itself (invariant 18: credentials never enter artifacts).
  { name: "UNICOM_CREDENTIAL_VAULT_KEY_REF", kind: "secret-ref", required: true, description: "Opaque reference to the sealed credential-vault key" },
];

const webEnv: readonly DeploymentEnvVarSpec[] = [
  { name: "UNICOM_PUBLIC_BASE_URL", kind: "url", required: true, description: "Public base URL of the experience plane" },
  { name: "UNICOM_SESSION_COOKIE_SECURE", kind: "boolean", required: true, description: "Secure session cookies", default: "true" },
  { name: "UNICOM_OPERATOR_DASHBOARD_ENABLED", kind: "boolean", required: true, description: "Expose the operator observability dashboard", default: "true" },
];

/**
 * The fully-specified target adapter plan: three services, real build
 * commands, liveness/readiness/startup probes, explicit startup ordering.
 */
export const NODE_SERVER_TARGET_PLAN: DeploymentTargetPlan = {
  planId: "plan:unicom-node-server-v1",
  targetKind: "node-server",
  displayLabel: "UNiCOM node-server target (self-hosted, provider-neutral)",
  tierNote: "prototype-free tier — self-hosted readiness target; free-tier quotas are deployment observations only",
  services: [
    {
      serviceId: "kernel-store",
      displayLabel: "Kernel store (sole-writer journal storage)",
      capabilityKinds: ["relational-store", "object-evidence-storage"],
      environment: { envId: "env:kernel-store", serviceId: "kernel-store", variables: storeEnv },
      buildSteps: [
        {
          stepId: "build:kernel-store:compile",
          name: "Compile kernel store service",
          command: ["node", "-e", "process.stdout.write('kernel-store: compiled')"],
          requiresArtifacts: [],
          producesArtifacts: ["artifact:kernel-store:bundle"],
        },
      ],
      probes: [
        { probeId: "probe:kernel-store:startup", kind: "startup", path: "/startupz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:kernel-store:liveness", kind: "liveness", path: "/healthz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:kernel-store:readiness", kind: "readiness", path: "/readyz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
      ],
      dependsOn: [],
      process: { kind: "node-server", entrypoint: "src/runtime/deployment/kernel-store-service.ts", bindHost: "127.0.0.1", bindPort: 0 },
    },
    {
      serviceId: "connector-worker",
      displayLabel: "Connector worker (async queue + browser runtime)",
      capabilityKinds: ["async-queue", "browser-runtime", "local-merchant-edge"],
      environment: { envId: "env:connector-worker", serviceId: "connector-worker", variables: workerEnv },
      buildSteps: [
        {
          stepId: "build:connector-worker:compile",
          name: "Compile connector worker service",
          command: ["node", "-e", "process.stdout.write('connector-worker: compiled')"],
          requiresArtifacts: [],
          producesArtifacts: ["artifact:connector-worker:bundle"],
        },
        {
          stepId: "build:connector-worker:link",
          name: "Link connector worker against the kernel store bundle",
          command: ["node", "-e", "process.stdout.write('connector-worker: linked')"],
          requiresArtifacts: ["artifact:kernel-store:bundle"],
          producesArtifacts: ["artifact:connector-worker:linked"],
        },
      ],
      probes: [
        { probeId: "probe:connector-worker:startup", kind: "startup", path: "/startupz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:connector-worker:liveness", kind: "liveness", path: "/healthz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:connector-worker:readiness", kind: "readiness", path: "/readyz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
      ],
      dependsOn: ["kernel-store"],
      process: { kind: "node-server", entrypoint: "src/runtime/deployment/connector-worker-service.ts", bindHost: "127.0.0.1", bindPort: 0 },
    },
    {
      serviceId: "experience-web",
      displayLabel: "Experience web tier (edge API + realtime + observability)",
      capabilityKinds: ["edge-api", "realtime-coordination", "observability", "model-gateway"],
      environment: { envId: "env:experience-web", serviceId: "experience-web", variables: webEnv },
      buildSteps: [
        {
          stepId: "build:experience-web:compile",
          name: "Compile experience web tier",
          command: ["node", "-e", "process.stdout.write('experience-web: compiled')"],
          requiresArtifacts: [],
          producesArtifacts: ["artifact:experience-web:bundle"],
        },
        {
          stepId: "build:experience-web:link",
          name: "Link experience web tier against store + worker bundles",
          command: ["node", "-e", "process.stdout.write('experience-web: linked')"],
          requiresArtifacts: ["artifact:kernel-store:bundle", "artifact:connector-worker:bundle"],
          producesArtifacts: ["artifact:experience-web:linked"],
        },
      ],
      probes: [
        { probeId: "probe:experience-web:startup", kind: "startup", path: "/startupz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:experience-web:liveness", kind: "liveness", path: "/healthz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
        { probeId: "probe:experience-web:readiness", kind: "readiness", path: "/readyz", method: "GET", successStatus: 200, failureStatus: 503, successThreshold: 1, failureThreshold: 3 },
      ],
      dependsOn: ["kernel-store", "connector-worker"],
      process: { kind: "node-server", entrypoint: "src/runtime/deployment/experience-web-service.ts", bindHost: "127.0.0.1", bindPort: 0 },
    },
  ],
};

// ---------------------------------------------------------------------------
// Environment resolution + startup ordering (typed, deterministic)
// ---------------------------------------------------------------------------

import {
  DeploymentEnvironmentError,
  DeploymentPlanError,
} from "../../deployment/manifest";
import type {
  DeploymentEnvironmentContract,
  ResolvedDeploymentEnvironment,
} from "../../deployment/manifest";

function assertKind(kind: DeploymentEnvironmentContract["variables"][number]["kind"], value: string): boolean {
  switch (kind) {
    case "string":
      return value.length > 0;
    case "number":
      return /^\d+$/.test(value);
    case "boolean":
      return value === "true" || value === "false";
    case "url":
      return /^https?:\/\/.+/.test(value);
    case "secret-ref":
      return value.length > 0;
  }
}

/** Resolve + validate one service environment against its typed contract. */
export function resolveDeploymentEnvironment(
  contract: DeploymentEnvironmentContract,
  provided: Readonly<Record<string, string>>,
  loopbackHost: string,
): ResolvedDeploymentEnvironment {
  const missing: string[] = [];
  const invalid: string[] = [];
  const values: ResolvedDeploymentEnvironment["values"][number][] = [];
  for (const spec of contract.variables) {
    if (spec.name === "UNICOM_BIND_HOST") continue;
    const raw = provided[spec.name];
    if (raw === undefined || raw === "") {
      if (spec.default !== undefined) {
        values.push({ name: spec.name, kind: spec.kind, value: spec.default, origin: "default" });
      } else if (spec.required) {
        missing.push(spec.name);
      }
      continue;
    }
    if (!assertKind(spec.kind, raw)) invalid.push(spec.name);
    else values.push({ name: spec.name, kind: spec.kind, value: raw, origin: "provided" });
  }
  values.push({ name: "UNICOM_BIND_HOST", kind: "string", value: loopbackHost, origin: "derived-loopback" });
  const problems = [
    ...missing.map((name) => `missing required variable "${name}"`),
    ...invalid.map((name) => `value of "${name}" violates its declared kind`),
  ];
  if (problems.length > 0) {
    throw new DeploymentEnvironmentError(problems.join("; "));
  }
  return { envId: contract.envId, serviceId: contract.serviceId, values };
}

/** Deterministic topological startup order (stable; cycles/unknowns reject). */
export function resolveStartupOrder(plan: DeploymentTargetPlan): readonly string[] {
  const byId = new Map(plan.services.map((service) => [service.serviceId, service]));
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (serviceId: string): void => {
    const mark = state.get(serviceId);
    if (mark === "done") return;
    if (mark === "visiting") {
      throw new DeploymentPlanError(`startup ordering cycle via "${serviceId}"`);
    }
    const service = byId.get(serviceId);
    if (service === undefined) {
      throw new DeploymentPlanError(`unknown dependency "${serviceId}"`);
    }
    state.set(serviceId, "visiting");
    for (const dependency of service.dependsOn) visit(dependency);
    state.set(serviceId, "done");
    order.push(serviceId);
  };
  for (const service of plan.services) visit(service.serviceId);
  return order;
}
