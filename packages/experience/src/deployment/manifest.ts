/**
 * Deployment manifests as code (W3-006 §Scope 1).
 *
 * A deployment plan is a typed, provider-agnostic artifact: environment
 * contracts, build steps, health/readiness probes and startup ordering —
 * everything an operator (or a release gate) needs to build, boot and verify
 * a target WITHOUT provider SDKs or provider names in domain contracts
 * (docs/UX-DEPLOYMENT.md "Portability rule"; INVARIANTS 51/52). The concrete
 * target adapter that executes a plan lives in
 * `runtime/deployment/target-adapter` (runtime, not contract).
 */

import type { DeploymentCapabilityKind } from "./provider-adapter";
import type { UtcIso8601String } from "../common/values";

/** Target execution kinds a plan may declare (provider-agnostic). */
export type DeploymentTargetKind = "node-server" | "container";

/** Typed environment variable specification. */
export interface DeploymentEnvVarSpec {
  readonly name: string;
  readonly kind: "string" | "number" | "boolean" | "url" | "secret-ref";
  readonly required: boolean;
  readonly description: string;
  readonly default?: string;
}

/** The full environment contract of one service. */
export interface DeploymentEnvironmentContract {
  readonly envId: string;
  readonly serviceId: string;
  readonly variables: readonly DeploymentEnvVarSpec[];
}

/** One typed build step (command + artifact contract). */
export interface DeploymentBuildStep {
  readonly stepId: string;
  readonly name: string;
  readonly command: readonly string[];
  readonly requiresArtifacts: readonly string[];
  readonly producesArtifacts: readonly string[];
}

/** Probe kinds (container/liveness semantics, provider-neutral). */
export type DeploymentProbeKind = "liveness" | "readiness" | "startup";

/** A health/readiness probe contract exposed over HTTP by a booted service. */
export interface DeploymentProbeContract {
  readonly probeId: string;
  readonly kind: DeploymentProbeKind;
  readonly path: string;
  readonly method: "GET" | "HEAD";
  readonly successStatus: 200;
  readonly failureStatus: 503;
  readonly successThreshold: number;
  readonly failureThreshold: number;
}

/** How one service's process is launched on the target. */
export interface DeploymentProcessSpec {
  readonly kind: "node-server";
  readonly entrypoint: string;
  /** Bind host is loopback for the embedded target; port 0 = ephemeral. */
  readonly bindHost: "127.0.0.1";
  readonly bindPort: number;
}

/** One service node of a deployment plan. */
export interface DeploymentServiceSpec {
  readonly serviceId: string;
  readonly displayLabel: string;
  readonly capabilityKinds: readonly DeploymentCapabilityKind[];
  readonly environment: DeploymentEnvironmentContract;
  readonly buildSteps: readonly DeploymentBuildStep[];
  readonly probes: readonly DeploymentProbeContract[];
  /** Startup ordering: this service boots only after these are READY. */
  readonly dependsOn: readonly string[];
  readonly process: DeploymentProcessSpec;
}

/** A complete, provider-agnostic deployment plan. */
export interface DeploymentTargetPlan {
  readonly planId: string;
  readonly targetKind: DeploymentTargetKind;
  readonly displayLabel: string;
  readonly tierNote: string;
  readonly services: readonly DeploymentServiceSpec[];
}

/** Resolved (validated) environment for one service. */
export interface ResolvedDeploymentEnvironment {
  readonly envId: string;
  readonly serviceId: string;
  readonly values: readonly {
    readonly name: string;
    readonly kind: DeploymentEnvVarSpec["kind"];
    readonly value: string;
    readonly origin: "provided" | "default" | "derived-loopback";
  }[];
}

/** Outcome of executing a build step. */
export interface BuildStepExecutionResult {
  readonly stepId: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly producedArtifacts: readonly string[];
}

/** Result of probing one probe contract against a live service. */
export interface ProbeCheckResult {
  readonly probeId: string;
  readonly serviceId: string;
  readonly kind: DeploymentProbeKind;
  readonly httpStatus: number | "connection-failed";
  readonly passed: boolean;
  readonly checkedAt: UtcIso8601String;
}

/** Boot state of one service on the target adapter. */
export type ServiceBootState =
  | "pending"
  | "building"
  | "starting"
  | "ready"
  | "failed"
  | "stopped";

/** Live status of one booted service. */
export interface DeployedServiceStatus {
  readonly serviceId: string;
  readonly state: ServiceBootState;
  readonly port?: number;
  readonly lastProbe?: ProbeCheckResult;
  readonly readinessBlockedBy?: readonly string[];
}

/** Status of the whole deployment plane (projection of adapter state). */
export interface DeploymentPlaneStatus {
  readonly planId: string;
  readonly targetKind: DeploymentTargetKind;
  readonly services: readonly DeployedServiceStatus[];
  readonly allReady: boolean;
}

/** Thrown when environment resolution fails (typed, never silent). */
export class DeploymentEnvironmentError extends Error {
  constructor(detail: string) {
    super(`deployment environment contract violation: ${detail}`);
    this.name = "DeploymentEnvironmentError";
  }
}

/** Thrown when a deployment plan violates the startup-ordering law (cycles). */
export class DeploymentPlanError extends Error {
  constructor(detail: string) {
    super(`deployment plan violation: ${detail}`);
    this.name = "DeploymentPlanError";
  }
}
