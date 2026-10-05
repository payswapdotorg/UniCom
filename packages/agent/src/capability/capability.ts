/**
 * CANONICAL capability vocabulary — part 1: definitions and provider
 * implementations (FROZEN-ARCHITECTURE §3.D, §17).
 *
 * This file (via ../capability/index.ts, re-exported from the package index)
 * is the ONLY capability vocabulary in the repository (invariant 34).
 * Worker 3 consumes these types by name.
 */

/** Explicit execution-mode enum (invariant 12). */
export const ExecutionMode = {
  PASS_THROUGH_NATIVE: "PASS_THROUGH_NATIVE",
  COMPOSED: "COMPOSED",
  OPTIMIZED_MULTI_PROVIDER: "OPTIMIZED_MULTI_PROVIDER",
} as const;
export type ExecutionMode = (typeof ExecutionMode)[keyof typeof ExecutionMode];

export const EXECUTION_MODES: readonly ExecutionMode[] = [
  ExecutionMode.PASS_THROUGH_NATIVE,
  ExecutionMode.COMPOSED,
  ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
];

/** Transport kinds a provider implementation may use (§3.D). */
export type TransportKind =
  | "REST"
  | "GRAPHQL"
  | "SDK"
  | "WEBHOOK"
  | "CLI"
  | "FILE_FEED"
  | "EDI_SFTP"
  | "EMAIL"
  | "BROWSER_AUTOMATION"
  | "LIVE_COMMERCE_STREAM"
  | "POS"
  | "SENSOR"
  | "LOCAL_EDGE";

/**
 * What a capability IS — a catalog entry. Catalog presence NEVER implies
 * executable account authority (invariant 9); executability is decided by
 * capability/executability.ts over connected instances and observations.
 */
export interface CapabilityDefinition {
  readonly capabilityDefinitionId: string;
  readonly name: string;
  readonly description?: string;
  readonly supportedExecutionModes: readonly ExecutionMode[];
  /** Canonical capability semantics are transport-neutral (§17). */
  readonly transportNeutral: true;
  /**
   * Provider-native optimization is itself represented as a capability and
   * remains a valid incumbent Lab baseline (invariant 33).
   */
  readonly providerNativeOptimization?: boolean;
}

/** A provider's implementation of a capability definition. */
export interface ProviderImplementation {
  readonly providerImplementationId: string;
  readonly capabilityDefinitionId: string;
  readonly providerId: string;
  readonly supportedExecutionModes: readonly ExecutionMode[];
  readonly transports: readonly TransportKind[];
}
