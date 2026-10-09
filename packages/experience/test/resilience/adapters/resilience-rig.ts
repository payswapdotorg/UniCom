/**
 * W2-010 RESILIENCE RIG — the composition helper for the fixture-labelled
 * resilience runs (clearly-marked TEST surface; NOT PRODUCTION CODE).
 *
 * Composes REAL product runtimes only:
 * - the REAL `@unicom/commerce` CommerceKernel (command dispatch, idempotent
 *   receipt ledger, append-only journal, policy gate, settlement tri-state)
 *   behind the FaultInjectingPaymentBoundary double (the kernel's ONLY
 *   payment seam is the injected port);
 * - the REAL experience-plane ConnectorRuntime + CredentialVault behind
 *   FaultInjectingConnectorAdapter doubles (the runtime is never mocked);
 * - the REAL offline observation queue runtime where family F02/F10 needs it.
 *
 * Faults enter ONLY through the two adapter files. The typed view builders
 * at the bottom project runtimes onto the SAME typed view contracts a
 * rendered UI would consume — that projection is the "GUI-visible" dimension
 * asserted by the matrix.
 */

import {
  CommerceKernel,
  commandEnvelope,
  countQuantity,
  currency,
  makeId,
  money,
  type AnyRuntimeCommand,
  type CanonicalInventoryLevel,
  type CommandExecution,
  type CommandId,
  type CommerceCommandEnvelope,
  type IdempotencyKey,
  type Money,
  type PrincipalRef,
  type RuntimeCommandPayload,
} from "@unicom/commerce";
import { ExecutionMode } from "@unicom/agent/capability";
import { type CredentialScope } from "@unicom/agent";
import type { ConnectedCapabilityInstance, CapabilityObservation, ProviderImplementation } from "@unicom/agent/capability";
import { createConnectorRuntime, type ConnectorRuntime } from "../../../src/runtime/connector/runtime";
import { createCredentialVault } from "../../../src/runtime/connector/vault";
import type { JourneyDispatchRequest, JourneyStepSpec } from "../../../src/runtime/connector/dispatch";
import {
  asAuthorizationContextRef,
  asCapabilityDefinitionId,
  asPrincipalRef,
} from "../../../src/runtime/ids";
import type { AvailabilityView } from "../../../src/surfaces/storefront";
import type { CheckoutStatusView } from "../../../src/surfaces/storefront";
import type { SecurityIncidentView, TrustCenterView } from "../../../src/surfaces/trust-security";
import type { AutonomousStoreStateView } from "../../../src/surfaces/autonomous-store";
import { fixedClock } from "../../doubles";
import { FaultInjectingConnectorAdapter } from "./fault-connector-adapter";
import { FaultInjectingPaymentBoundary, type FaultPaymentBoundaryScript } from "./fault-payment-boundary";

export const RIG_CLOCK_BASE = "2026-10-10T09:00:00Z";
export const USD = currency("USD");

export const rigMoney = (minor: string): Money => money(minor, USD);

// ---------------------------------------------------------------------------
// Part 1 — commerce kernel rig (real kernel + fault payment boundary)
// ---------------------------------------------------------------------------

export interface ResilienceKernelRig {
  readonly kernel: CommerceKernel;
  readonly paymentBoundary: FaultInjectingPaymentBoundary;
  readonly actor: PrincipalRef;
  readonly buyer: PrincipalRef;
  /** Deterministic, monotonically increasing envelope ids for `exec`. */
  exec(payload: RuntimeCommandPayload, options?: ExecOptions): Promise<CommandExecution>;
  events(): number;
}

export interface ExecOptions {
  readonly actor?: PrincipalRef;
  /** Explicit command + idempotency keys (for replay/conflict scenarios). */
  readonly commandId?: string;
  readonly idempotencyKey?: string;
}

export function createResilienceKernel(script: FaultPaymentBoundaryScript = {}): ResilienceKernelRig {
  const paymentBoundary = new FaultInjectingPaymentBoundary(script);
  let ticks = 0;
  const kernel = new CommerceKernel({
    paymentBoundary,
    timeSource: () => new Date(Date.parse(RIG_CLOCK_BASE) + ticks++ * 1000).toISOString(),
  });
  const actor: PrincipalRef = { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("resilience-rig") };
  const buyer: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("resilience-buyer") };
  let seq = 0;
  const exec = (payload: RuntimeCommandPayload, options: ExecOptions = {}): Promise<CommandExecution> => {
    seq += 1;
    const commandId = makeId<CommandId>(options.commandId ?? `rig-cmd-${seq}`);
    const idempotencyKey = makeId<IdempotencyKey>(options.idempotencyKey ?? `rig-key-${seq}`);
    const envelope = commandEnvelope(
      commandId,
      idempotencyKey,
      options.actor ?? actor,
      new Date(Date.parse(RIG_CLOCK_BASE) + ticks++ * 1000).toISOString(),
      payload,
    ) as CommerceCommandEnvelope as unknown as AnyRuntimeCommand;
    return kernel.execute(envelope);
  };
  return { kernel, paymentBoundary, actor, buyer, exec, events: () => kernel.events().length };
}

// ---------------------------------------------------------------------------
// Part 2 — connector runtime rig (real runtime + fault adapters)
// ---------------------------------------------------------------------------

export interface ConnectedFaultAdapter {
  readonly adapter: FaultInjectingConnectorAdapter;
  readonly connectorId: string;
  readonly instance: ConnectedCapabilityInstance;
}

export interface ResilienceConnectorRig {
  readonly runtime: ConnectorRuntime;
  readonly clock: () => string;
  connect(adapter: FaultInjectingConnectorAdapter, options?: { readonly scopes?: string; readonly permissions?: readonly string[] }): Promise<ConnectedFaultAdapter>;
}

export async function createResilienceConnectorRig(): Promise<ResilienceConnectorRig> {
  const clock = fixedClock(RIG_CLOCK_BASE);
  const vault = createCredentialVault({ clock });
  const runtime = createConnectorRuntime({ vault, clock });
  const connect = async (
    adapter: FaultInjectingConnectorAdapter,
    options: { readonly scopes?: string; readonly permissions?: readonly string[] } = {},
  ) => {
    const registered = runtime.register(adapter);
    // accountRef is "account-1" so the adapter's observations (keyed by
    // `fault-instance-<adapterId>-account-1`) bind to the connected instance.
    const connected = await runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "account-1",
      credential: {
        kind: "api-secret",
        material: `resilience-material-${adapter.descriptor.adapterId}`,
        forAdapterId: adapter.descriptor.adapterId,
        forAccountRef: "account-1",
      },
      grantedPermissions: options.permissions ?? ["orders.read", "orders.write"],
      credentialScope: options.scopes ?? "orders.read orders.write",
    });
    const instance = connected.connectedInstances[0];
    if (instance === undefined) {
      throw new Error(`fault adapter ${adapter.descriptor.adapterId} did not connect (${connected.lifecycle})`);
    }
    return { adapter, connectorId: registered.connectorId, instance };
  };
  return { runtime, clock, connect };
}

// ---------------------------------------------------------------------------
// Part 3 — multi-hop journey dispatch helper (F06 TradeCycle)
// ---------------------------------------------------------------------------

export interface TradeCycleLeg {
  readonly stepRef: string;
  readonly commandRef: string;
  readonly capabilityDefinitionId: string;
  /** Per-leg consent: the scope this leg REQUIRES (its own authorization). */
  readonly requiredScope: CredentialScope;
  readonly requiredPermissions?: readonly string[];
  readonly requiresCommercialTerms?: boolean;
  readonly participant: ConnectedFaultAdapter;
}

/** Build a JourneyDispatchRequest with per-leg preconditions (F06). */
export function tradeCycleRequest(
  journeyRef: string,
  legs: readonly TradeCycleLeg[],
  observations: readonly CapabilityObservation[],
  implementations: readonly ProviderImplementation[],
  idempotencySeed = "trade-cycle-seed",
): JourneyDispatchRequest {
  const steps: readonly JourneyStepSpec[] = legs.map((leg) => ({
    stepRef: leg.stepRef,
    capabilityDefinitionId: asCapabilityDefinitionId(leg.capabilityDefinitionId),
    preconditions: {
      requiresConnectedInstance: true,
      requiredCredentialScope: leg.requiredScope,
      requiredPermissions: leg.requiredPermissions ?? [],
      requiresCommercialTermsAccepted: leg.requiresCommercialTerms ?? true,
      requiresCurrentObservation: true,
    },
    commandRef: leg.commandRef,
    payloadRef: `payload:${leg.commandRef}`,
  }));
  return {
    journeyRef,
    mode: ExecutionMode.COMPOSED,
    steps,
    instances: legs.map((leg) => leg.participant.instance),
    observations,
    implementations,
    idempotencySeed,
    authorization: asAuthorizationContextRef(`authorization:${journeyRef}`),
    requestedAt: RIG_CLOCK_BASE,
  };
}

// ---------------------------------------------------------------------------
// Part 4 — the VISIBLE dimension: typed view-contract projections
// (exactly what a rendered UI would consume; asserted by the matrix oracle)
// ---------------------------------------------------------------------------

/** Storefront availability projection of a canonical inventory level. */
export function availabilityViewOf(level: CanonicalInventoryLevel | undefined): AvailabilityView {
  if (level === undefined) return { truthClass: "operational", displayStatus: "unknown", note: "no inventory record yet" };
  if (level.onHand - level.reserved <= 0) return { truthClass: "operational", displayStatus: "out-of-stock", note: "system count is zero" };
  if (level.onHand - level.reserved <= 5) {
    return { truthClass: "operational", displayStatus: "low-stock", note: `${level.onHand - level.reserved} units left` };
  }
  return { truthClass: "operational", displayStatus: "in-stock", note: `${level.onHand - level.reserved} units available` };
}

/** Checkout status view — UNKNOWN is a first-class step, never "done". */
export function checkoutStatusView(
  checkoutRef: string,
  step: CheckoutStatusView["currentStep"],
  blockerNote?: string,
): CheckoutStatusView {
  return {
    checkoutRef,
    currentStep: step,
    selectedProofLevel: makeId<"TransactionProofRef">("P4") as never,
    ...(blockerNote === undefined ? {} : { blockerNote }),
    evidence: [],
  };
}

/** Trust-center incident view (fake review ring etc.). */
export function reviewRingIncidentView(overrides: Partial<SecurityIncidentView> = {}): SecurityIncidentView {
  return {
    incidentId: "incident-w2-review-ring",
    securityEventRef: "security-event:w2-ring-1" as never,
    signal: "12 five-star reviews within 4 hours from new accounts",
    reason: "Coordinated review pattern consistent with a review ring",
    effect: "Seller rating temporarily excluded from ranking",
    mitigation: "Accounts quarantined; seller notified with evidence",
    nextAction: "Independent observation window opened for 7 days",
    severity: "high",
    decision: "quarantined",
    pipelineStage: "mitigation",
    evidence: [],
    defensiveBroadcast: "prepared",
    updatedAt: RIG_CLOCK_BASE,
    ...overrides,
  };
}

export function trustCenterViewOf(incidents: readonly SecurityIncidentView[]): TrustCenterView {
  return {
    components: [],
    trustSignals: [],
    incidents,
    proofLegend: [],
  };
}

/** Autonomous-store state view — run presentation with note. */
export function autonomousStoreStateView(
  runPresentation: AutonomousStoreStateView["runPresentation"],
  presentationNote: string,
): AutonomousStoreStateView {
  return {
    storeRef: "store:resilience-1" as never,
    displayName: "Resilience Store",
    runPresentation,
    presentationNote,
    lastChangedAt: RIG_CLOCK_BASE,
    ownerRef: asPrincipalRef("merchant:resilience-owner"),
    evidence: [],
  };
}

/** Receipt total for a refund-bound assertion (exact BigInt math). */
export function minorTotalOf(view: { amountMinor: string }): bigint {
  return BigInt(view.amountMinor);
}

export { countQuantity, makeId, money, currency };
