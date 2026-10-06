/**
 * @unicom/experience — public boundary contracts (Stage 0, W3-001).
 *
 * EXPERIENCE / CONNECTOR / PHYSICAL EDGE / DEPLOYMENT boundaries.
 * CONTRACTS ONLY: types, interfaces and const registries. No React
 * components, no adapter implementations, no runtime code.
 *
 * Consumption laws (see README.md):
 * - capability references are OPAQUE refs into @unicom/agent (Worker 2);
 * - commerce truth is rendered as read-side projections and command
 *   hand-offs (Worker 1 owns the models);
 * - browser/local secrets never cross these boundaries;
 * - third-party content is untrusted data, never instructions;
 * - offline observations queue and hand off — never promote directly;
 * - domain-facing contracts reference zero provider names.
 */

export * from "./common/values";
export * from "./common/opaque-refs";
export * from "./common/evidence";
export * from "./common/untrusted";

export * from "./navigation/navigation";
export * from "./navigation/feature-matrix";
export * from "./navigation/surfaces";
export * from "./navigation/discoverability";
export * from "./navigation/roles";
export * from "./navigation/universal-intent";

export * from "./surfaces/command-center";
export * from "./surfaces/intent-canvas";
export * from "./surfaces/opportunity-inbox";
export * from "./surfaces/decision-card";
export * from "./surfaces/decision-card-render";
export * from "./surfaces/storefront";
export * from "./surfaces/operations";
export * from "./surfaces/connector-studio";
export * from "./surfaces/trust-security";
export * from "./surfaces/explore";
export * from "./surfaces/live-commerce-ux";
export * from "./surfaces/surface-state";
export * from "./surfaces/surface-state-manifests";
export * from "./surfaces/autonomous-store";

export * from "./connector/transports";
export * from "./connector/browser-session";
export * from "./connector/observability";
export * from "./connector/health-surface";
export * from "./connector/live-commerce";
export * from "./connector/webhook-events";
export * from "./connector/feed-file";

export * from "./edge/observation";
export * from "./edge/offline-queue";
export * from "./edge/local-edge";
export * from "./edge/weighted";

export * from "./deployment/provider-adapter";
export * from "./deployment/realtime";
export * from "./deployment/operator";
