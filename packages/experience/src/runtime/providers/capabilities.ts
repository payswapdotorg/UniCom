/**
 * First-adapter capability catalog entries (W3-003).
 *
 * Every entry is an instance of Worker 2's CANONICAL
 * `CapabilityDefinition` type from `@unicom/agent/capability` — this file
 * declares catalog DATA, never a second vocabulary (INVARIANT 34). The
 * vocabulary's executability law still applies: catalog presence never
 * implies executable account authority; per-journey authority comes from a
 * ConnectedCapabilityInstance plus a current CapabilityObservation, both
 * enforced by the canonical W2-002 kernel gate.
 */

import type { CapabilityDefinition, ProviderImplementation, TransportKind } from "@unicom/agent/capability";
import { ExecutionMode } from "@unicom/agent/capability";
import { permittedModesFor, type FirstProviderId } from "./matrix";

const ALL_MODES = [
  ExecutionMode.PASS_THROUGH_NATIVE,
  ExecutionMode.COMPOSED,
  ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
] as const;

/** Observe provider catalog state (products, listings, shows). */
export const CAPABILITY_CATALOG_OBSERVE: CapabilityDefinition = {
  capabilityDefinitionId: "commerce.catalog.observe",
  name: "Observe provider catalog state",
  description: "Read-only provider catalog/listing observations (third-party content, untrusted).",
  supportedExecutionModes: [...ALL_MODES],
  transportNeutral: true,
};

/** Consequential order creation/fulfillment on a provider. */
export const CAPABILITY_ORDERS_EXECUTE: CapabilityDefinition = {
  capabilityDefinitionId: "commerce.orders.execute",
  name: "Execute order operations",
  description: "Create/fulfill orders on the connected provider account (consequential).",
  supportedExecutionModes: [...ALL_MODES],
  transportNeutral: true,
};

/** Consequential listing create/update on a provider. */
export const CAPABILITY_LISTINGS_MANAGE: CapabilityDefinition = {
  capabilityDefinitionId: "commerce.listings.manage",
  name: "Manage listings",
  description: "Create or update listings/inventory items on the provider (consequential).",
  supportedExecutionModes: [...ALL_MODES],
  transportNeutral: true,
};

/** Execute inside a live commerce stream (bid / buy-now / claim). */
export const CAPABILITY_LIVE_EXECUTE: CapabilityDefinition = {
  capabilityDefinitionId: "live.commerce.execute",
  name: "Execute in live stream",
  description: "Bid, buy-now or claim inside a live commerce stream (time-ordered, stream-scoped).",
  supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE],
  transportNeutral: true,
};

/**
 * Import catalog and inventory snapshots from a POS/back office (W3-004).
 * A read-heavy batch pull whose rows ingest exactly-once downstream as
 * `file-import` observations — catalog/inventory imports never mutate
 * commerce state directly; they are evidence for commerce-lane
 * reconciliation.
 */
export const CAPABILITY_POS_IMPORT: CapabilityDefinition = {
  capabilityDefinitionId: "physical.pos.import",
  name: "Import POS catalog and inventory snapshots",
  description:
    "Pull catalog and inventory export batches from a POS/back office over the local API and ingest rows exactly-once as observations.",
  supportedExecutionModes: [...ALL_MODES],
  transportNeutral: true,
};

/** The catalog used by the first six adapters. */
export const FIRST_ADAPTER_CAPABILITIES: readonly CapabilityDefinition[] = [
  CAPABILITY_CATALOG_OBSERVE,
  CAPABILITY_ORDERS_EXECUTE,
  CAPABILITY_LISTINGS_MANAGE,
  CAPABILITY_LIVE_EXECUTE,
  CAPABILITY_POS_IMPORT,
];

/**
 * Build the canonical `ProviderImplementation` for one provider capability,
 * with execution modes intersected against the provider's permission-matrix
 * row — the typed form of the documented matrix.
 */
export function providerImplementationOf(
  providerId: FirstProviderId,
  capability: CapabilityDefinition,
  transports: readonly TransportKind[],
): ProviderImplementation {
  const permitted = new Set(permittedModesFor(providerId));
  const modes = capability.supportedExecutionModes.filter((mode) => permitted.has(mode));
  return {
    providerImplementationId: `impl:${providerId}:${capability.capabilityDefinitionId}`,
    capabilityDefinitionId: capability.capabilityDefinitionId,
    providerId,
    supportedExecutionModes: modes,
    transports,
  };
}
