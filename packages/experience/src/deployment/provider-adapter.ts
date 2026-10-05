/**
 * Deployment provider adapter boundary (interface only)
 * (FROZEN-ARCHITECTURE §18, §22.8, docs/UX-DEPLOYMENT.md "Deployment",
 * INVARIANTS 51/52, W3-001 §3).
 *
 * Hard rule enforced by shape and by tests: domain-facing contracts in this
 * package reference ZERO hosting provider names. Provider names appear only
 * in deployment configuration at runtime, never in domain contracts. Free-tier
 * limits are deployment constraints (observations), never domain semantics.
 * Prototype providers implement this interface behind the boundary;
 * commercial production can replace any of them without changing domain
 * contracts (`replaceableWithoutDomainChanges: true`).
 */

import type { DeploymentAdapterId } from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** Provider-neutral deployment capability kinds (matrix "Deployment coverage"). */
export type DeploymentCapabilityKind =
  | "edge-api"
  | "durable-workflow"
  | "async-queue"
  | "realtime-coordination"
  | "relational-store"
  | "object-evidence-storage"
  | "cache"
  | "browser-runtime"
  | "local-merchant-edge"
  | "model-gateway"
  | "observability"
  | "replaceable-compute";

/** Registry of deployment capabilities with plain-language labels. */
export const DEPLOYMENT_CAPABILITIES: readonly {
  readonly kind: DeploymentCapabilityKind;
  readonly userLabel: string;
  readonly description: string;
}[] = [
  { kind: "edge-api", userLabel: "Global API endpoints", description: "Fast access from anywhere" },
  { kind: "durable-workflow", userLabel: "Durable workflows", description: "Long-running jobs that survive restarts" },
  { kind: "async-queue", userLabel: "Async queues", description: "Background processing of events and connectors" },
  { kind: "realtime-coordination", userLabel: "Realtime coordination", description: "Live sessions and live channels" },
  { kind: "relational-store", userLabel: "Commerce records database", description: "Operational truth storage" },
  { kind: "object-evidence-storage", userLabel: "Object & evidence storage", description: "Media and evidence artifacts" },
  { kind: "cache", userLabel: "Cache", description: "Fast access to hot state" },
  { kind: "browser-runtime", userLabel: "Browser runtime", description: "Runs browser connectors outside request handlers" },
  { kind: "local-merchant-edge", userLabel: "Local merchant edge", description: "Runs on the merchant's own hardware" },
  { kind: "model-gateway", userLabel: "Model gateway", description: "Access to AI models" },
  { kind: "observability", userLabel: "Observability", description: "Task/run/evidence trail" },
  { kind: "replaceable-compute", userLabel: "Replaceable compute", description: "Swappable execution tiers" },
];

/** Deployment tier. Free tiers are prototype/staging targets only. */
export type DeploymentTier = "prototype-free" | "commercial" | "self-hosted";

/** Adapter status (UNKNOWN preserved). */
export type DeploymentAdapterStatus =
  | "healthy"
  | "degraded"
  | "saturated"
  | "customer-action-required"
  | "unknown";

/** Observed quota/limit. An observation, never a domain input. */
export interface DeploymentQuotaObservation {
  readonly metricId: string;
  readonly limitDescription: string;
  readonly usedDescription: string;
  readonly observedAt: UtcIso8601String;
  readonly sourceNote: "deployment-observation-only";
}

/**
 * The deployment provider adapter interface. Implementations are isolated
 * under infrastructure/adapters and are referenced only by opaque adapter
 * ids and configured display labels.
 */
export interface DeploymentProviderAdapter {
  readonly adapterId: DeploymentAdapterId;
  readonly displayLabel: string;
  readonly tier: DeploymentTier;
  readonly providedCapabilities: readonly DeploymentCapabilityKind[];
  readonly status: DeploymentAdapterStatus;
  readonly quotaObservations: readonly DeploymentQuotaObservation[];
  readonly replaceableWithoutDomainChanges: true;
}

/** The deployment manifest: adapters plus free-tier policy marker. */
export interface DeploymentManifest {
  readonly adapters: readonly DeploymentProviderAdapter[];
  readonly freeTierPolicy: "prototype-staging-only";
}
