/**
 * Branded-value construction helpers for test fixtures.
 *
 * In production these branded strings are constructed only by the runtime
 * layers (Connector Runtime W3-002, Commerce Kernel W1, agent plane W2);
 * tests construct them locally to build valid fixtures.
 */

import type {
  BrowserRouteCapabilityRef,
  BrowserSessionId,
  BrowserStoragePartitionRef,
  CommerceLocationRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  DeploymentAdapterId,
  IdempotencyKey,
  LocalEdgeDeviceId,
  MoneyString,
  OfflineQueueEntryId,
  OrganizationRef,
  PhysicalObservationId,
  PrincipalRef,
  ReconciliationChannelRef,
  ReconciliationHandoffId,
  StrategyRef,
  UtcIso8601String,
} from "../src/contract";

export const utc = (value: string): UtcIso8601String => value as UtcIso8601String;
export const money = (value: string): MoneyString => value as MoneyString;
export const idem = (value: string): IdempotencyKey => value as IdempotencyKey;
export const edgeId = (value: string): LocalEdgeDeviceId => value as LocalEdgeDeviceId;
export const obsId = (value: string): PhysicalObservationId => value as PhysicalObservationId;
export const entryId = (value: string): OfflineQueueEntryId => value as OfflineQueueEntryId;
export const handoffId = (value: string): ReconciliationHandoffId => value as ReconciliationHandoffId;
export const locationRef = (value: string): CommerceLocationRef => value as CommerceLocationRef;
export const productRef = (value: string): CommerceProductRef => value as CommerceProductRef;
export const sessionId = (value: string): BrowserSessionId => value as BrowserSessionId;
export const routeCapability = (value: string): BrowserRouteCapabilityRef => value as BrowserRouteCapabilityRef;
export const partitionRef = (value: string): BrowserStoragePartitionRef => value as BrowserStoragePartitionRef;
export const decisionRef = (value: string): DecisionRef => value as DecisionRef;
export const strategyRef = (value: string): StrategyRef => value as StrategyRef;
export const organizationRef = (value: string): OrganizationRef => value as OrganizationRef;
export const principalRef = (value: string): PrincipalRef => value as PrincipalRef;
export const connectorId = (value: string): ConnectorInstanceId => value as ConnectorInstanceId;
export const capabilityInstance = (value: string): ConnectedCapabilityInstanceId =>
  value as ConnectedCapabilityInstanceId;
export const adapterId = (value: string): DeploymentAdapterId => value as DeploymentAdapterId;
export const reconciliationChannel = (value: string): ReconciliationChannelRef =>
  value as ReconciliationChannelRef;
