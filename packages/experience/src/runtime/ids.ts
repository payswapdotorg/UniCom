/**
 * Sanctioned runtime constructors for experience-plane branded references
 * (W3-002).
 *
 * In Stage 0 (W3-001) these branded strings were constructed only inside
 * tests (`test/branded.ts`). From W3-002 the Connector Runtime owns the real
 * constructors: handles, queue ids, partition refs and timestamps that leave
 * this package are minted here and nowhere else.
 *
 * This file also bridges the typed seam to Worker 2's CANONICAL capability
 * vocabulary (`@unicom/agent`). The bridge converts opaque branded refs
 * (the wire format of the experience plane) to and from the plain-string ids
 * of the canonical vocabulary. It NEVER declares a second vocabulary —
 * invariant 34.
 */

import type {
  AuthorizationContextRef,
  BrowserRouteCapabilityRef,
  BrowserSessionId,
  BrowserStoragePartitionRef,
  CapabilityDefinitionId,
  CapabilityObservationRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  LocalEdgeDeviceId,
  OfflineQueueEntryId,
  PhysicalObservationId,
  PrincipalRef,
  ReconciliationChannelRef,
  ReconciliationHandoffId,
  TransactionProofRef,
} from "../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../common/values";

// ---------------------------------------------------------------------------
// Experience-plane branded refs (see ../common/opaque-refs.ts)
// ---------------------------------------------------------------------------

export const asConnectorInstanceId = (value: string): ConnectorInstanceId =>
  value as ConnectorInstanceId;
export const asBrowserSessionId = (value: string): BrowserSessionId => value as BrowserSessionId;
export const asBrowserStoragePartitionRef = (value: string): BrowserStoragePartitionRef =>
  value as BrowserStoragePartitionRef;
export const asBrowserRouteCapabilityRef = (value: string): BrowserRouteCapabilityRef =>
  value as BrowserRouteCapabilityRef;
export const asLocalEdgeDeviceId = (value: string): LocalEdgeDeviceId =>
  value as LocalEdgeDeviceId;
export const asPhysicalObservationId = (value: string): PhysicalObservationId =>
  value as PhysicalObservationId;
export const asOfflineQueueEntryId = (value: string): OfflineQueueEntryId =>
  value as OfflineQueueEntryId;
export const asReconciliationHandoffId = (value: string): ReconciliationHandoffId =>
  value as ReconciliationHandoffId;
export const asReconciliationChannelRef = (value: string): ReconciliationChannelRef =>
  value as ReconciliationChannelRef;
export const asPrincipalRef = (value: string): PrincipalRef => value as PrincipalRef;
export const asAuthorizationContextRef = (value: string): AuthorizationContextRef =>
  value as AuthorizationContextRef;
export const asTransactionProofRef = (value: string): TransactionProofRef =>
  value as TransactionProofRef;
export const asIdempotencyKey = (value: string): IdempotencyKey => value as IdempotencyKey;
export const asUtcTimestamp = (value: string): UtcIso8601String => value as UtcIso8601String;

// ---------------------------------------------------------------------------
// Typed seam bridges to @unicom/agent's canonical capability vocabulary
// ---------------------------------------------------------------------------

/**
 * Bridge an opaque experience-plane `CapabilityDefinitionId` ref to the
 * canonical `CapabilityDefinition.capabilityDefinitionId` string owned by
 * `@unicom/agent` (same wire value, unbranded for the canonical side).
 */
export const capabilityDefinitionIdOf = (ref: CapabilityDefinitionId): string => ref as string;

/** Bridge a canonical capability-definition id to the opaque experience ref. */
export const asCapabilityDefinitionId = (id: string): CapabilityDefinitionId =>
  id as CapabilityDefinitionId;

/** Bridge an opaque `ConnectedCapabilityInstanceId` ref to the canonical string id. */
export const connectedInstanceIdOf = (ref: ConnectedCapabilityInstanceId): string =>
  ref as string;

/** Bridge a canonical connected-instance id to the opaque experience ref. */
export const asConnectedCapabilityInstanceId = (id: string): ConnectedCapabilityInstanceId =>
  id as ConnectedCapabilityInstanceId;

/** Bridge an opaque `CapabilityObservationRef` to the canonical observation id. */
export const observationIdOf = (ref: CapabilityObservationRef): string => ref as string;

/** Bridge a canonical observation id to the opaque experience ref. */
export const asCapabilityObservationRef = (id: string): CapabilityObservationRef =>
  id as CapabilityObservationRef;
