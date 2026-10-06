/**
 * The Reality Lab (W2-005; FROZEN-ARCHITECTURE §3.I; invariants 16, 39).
 *
 * Deterministic, SEEDED simulated commerce environments: scenario actors
 * (customers, merchants, providers, adversaries) generate an ordered event
 * trajectory over a tick-derived simulated clock. Laws:
 * - DETERMINISM: the environment is a pure function of the scenario spec —
 *   same seed → identical event stream, identical facts, identical outcome
 *   digest (no Math.random, no wall clock; see sim-random.ts).
 * - NO CANONICAL MUTATION: the environment SERVES simulated facts through
 *   the opaque CommerceEvidenceFactsPort seam (reads only). It exposes no
 *   command port and no write path — canonical commerce truth is Worker 1's
 *   and is never touched (invariants 6/16).
 * - SIMULATION ISOLATION: the facts port implemented here is a REALITY-LAB
 *   ONLY double (invariant 16 — simulation can never be reached as a
 *   production provider; invariant 39 — production paths never depend on
 *   mocks). It exists so evaluation runs exercise the same opaque-seam
 *   reads the runtime plane uses.
 */

import type { PrincipalRef } from "./common.js";
import { timestamp } from "./common.js";
import type {
  CommerceEvidenceFactsPort,
  DeliveryConfirmationFact,
  FactValue,
  OrderSubjectFact,
  ReturnHistoryFact,
  ShipmentContentFact,
} from "./commerce-facts-seam.js";
import {
  COMMERCE_FACTS_INTERFACE_ID,
  COMMERCE_FACTS_INTERFACE_VERSION,
} from "./commerce-facts-seam.js";
import type { ProofLevel } from "./proof.js";
import { structuralHash } from "./lab-promotion.js";
import { SeededRandom, SimClock } from "./sim-random.js";

// ---------------------------------------------------------------------------
// Scenario actors + events
// ---------------------------------------------------------------------------

export type SimActorKind = "customer" | "merchant" | "provider" | "adversary";

export interface SimActor {
  readonly actorId: string;
  readonly kind: SimActorKind;
  readonly principalRef: PrincipalRef;
}

export type RealityEventKind =
  | "ACTOR_INTRODUCED"
  | "BROWSE"
  | "ORDER_PLACED"
  | "SHIPMENT_DECLARED"
  | "CARRIER_OBSERVED"
  | "REVIEW_POSTED"
  | "CLAIM_FILED"
  | "RETURN_COMPLETED"
  | "PROVIDER_QUOTED"
  | "ADVERSARY_ATTEMPT"
  | "SECURITY_SCREENED";

/** One step of the environment trajectory. Hash-chained for tamper evidence. */
export interface RealityEvent {
  readonly sequence: number;
  readonly at: string;
  readonly actorId: string;
  readonly kind: RealityEventKind;
  readonly detail: string;
  readonly eventHash: string;
}

// ---------------------------------------------------------------------------
// Scenario scripts (the deterministic "world" the environment realizes)
// ---------------------------------------------------------------------------

/** The review a scripted order posts (explicit timing — burst control). */
export interface SimReviewScript {
  readonly contentFingerprint: string;
  readonly deviceFingerprint: string;
  readonly reviewedAt: string;
  readonly accountAgeDays: number;
  readonly verifiedPurchase: boolean;
}

export interface SimOrderScript {
  readonly orderRef: string;
  readonly customerIndex: number;
  readonly merchantIndex: number;
  readonly purchasedSkuRef: string;
  readonly declaredSkuRef: string;
  /** undefined → the fulfillment record is UNKNOWN (tri-state preserved). */
  readonly fulfilledSkuRef?: string;
  /** undefined → the carrier content observation is UNKNOWN. */
  readonly observedSkuRef?: string;
  readonly deliveryStatus: "DELIVERED" | "IN_TRANSIT" | "UNKNOWN";
  readonly carrierProofLevel: ProofLevel;
  /** Explicit evidence timestamp for claim/attestation/carrier records. */
  readonly evidenceAt: string;
  readonly postsReview?: SimReviewScript;
  readonly filesClaim?: {
    readonly claimType: "NON_DELIVERY" | "WRONG_ITEM" | "NOT_AS_DESCRIBED";
    readonly claimedSubject?: string;
  };
  readonly returnHistory?: {
    readonly completedReturnCount: number;
    readonly upheldClaimCount: number;
  };
}

export interface RealityScenarioSpec {
  readonly scenarioId: string;
  readonly description: string;
  readonly seed: string;
  readonly baseTimestamp: string;
  readonly customerCount: number;
  readonly merchantCount: number;
  readonly providerCount: number;
  /** Adversary actors introduced into the environment (ids derive from spec). */
  readonly adversaryCount: number;
  readonly orders: readonly SimOrderScript[];
}

// ---------------------------------------------------------------------------
// Simulated commerce facts (opaque-seam double — Reality Lab ONLY)
// ---------------------------------------------------------------------------

interface SimulatedOrderFacts {
  readonly orderRef: string;
  readonly customerRef: string;
  readonly purchasedSkuRef: string;
  readonly declaredSkuRef: string;
  readonly fulfilledSkuRef: FactValue<string>;
  readonly observedSkuRef: FactValue<string>;
  readonly deliveryStatus: FactValue<"DELIVERED" | "IN_TRANSIT" | "NOT_DELIVERED">;
  readonly carrierProofLevel: ProofLevel;
  readonly observedAt: string;
}

interface SimulatedReturnHistory {
  readonly customerRef: string;
  readonly completedReturnCount: number;
  readonly upheldClaimCount: number;
  readonly windowBeginsAt: string;
  readonly windowEndsAt: string;
}

/**
 * The simulated commerce environment. READ-ONLY by construction: it
 * implements the opaque CommerceEvidenceFactsPort (the W2-004 evidence seam)
 * over its own sandboxed simulated facts and exposes no mutation path. This
 * class is a Reality-Lab simulation double — it is never a production
 * provider (invariant 16) and never touches canonical commerce state.
 */
export class RealityLabEnvironment implements CommerceEvidenceFactsPort {
  readonly interfaceId = COMMERCE_FACTS_INTERFACE_ID;
  readonly version = COMMERCE_FACTS_INTERFACE_VERSION;

  private readonly orders = new Map<string, SimulatedOrderFacts>();
  private readonly histories = new Map<string, SimulatedReturnHistory>();

  /** @internal realize a scripted order as simulated facts (engine-only). */
  recordSimulatedOrder(facts: SimulatedOrderFacts): void {
    this.orders.set(facts.orderRef, facts);
  }

  /** @internal realize a scripted return history (engine-only). */
  recordSimulatedReturnHistory(history: SimulatedReturnHistory): void {
    this.histories.set(history.customerRef, history);
  }

  deliveryConfirmation(orderRef: string): DeliveryConfirmationFact | undefined {
    const facts = this.orders.get(orderRef);
    if (facts === undefined) return undefined;
    return {
      factId: `fact:${orderRef}:delivery`,
      orderRef,
      deliveryStatus: facts.deliveryStatus,
      carrierProofLevel: facts.carrierProofLevel,
      observedAt: facts.observedAt,
    };
  }

  shipmentContent(orderRef: string): ShipmentContentFact | undefined {
    const facts = this.orders.get(orderRef);
    if (facts === undefined) return undefined;
    return {
      factId: `fact:${orderRef}:content`,
      orderRef,
      declaredSkuRef: facts.declaredSkuRef,
      observedSkuRef: facts.observedSkuRef,
      observedAt: facts.observedAt,
    };
  }

  orderSubject(orderRef: string): OrderSubjectFact | undefined {
    const facts = this.orders.get(orderRef);
    if (facts === undefined) return undefined;
    return {
      factId: `fact:${orderRef}:subject`,
      orderRef,
      customerRef: facts.customerRef,
      purchasedSkuRef: facts.purchasedSkuRef,
      fulfilledSkuRef: facts.fulfilledSkuRef,
      observedAt: facts.observedAt,
    };
  }

  returnHistory(customerRef: string): ReturnHistoryFact | undefined {
    const history = this.histories.get(customerRef);
    if (history === undefined) return undefined;
    return { factId: `fact:${customerRef}:history`, ...history };
  }

  /** Deterministic view of the simulated order refs (script order). */
  orderRefs(): readonly string[] {
    return [...this.orders.keys()];
  }

  /** Deterministic view of the simulated customer refs. */
  customerRefs(): readonly string[] {
    return [...this.histories.keys()].sort();
  }
}

// ---------------------------------------------------------------------------
// Trajectory generation
// ---------------------------------------------------------------------------

export interface RealityTrajectory {
  readonly scenarioId: string;
  readonly seed: string;
  readonly events: readonly RealityEvent[];
  readonly environment: RealityLabEnvironment;
  /** Deterministic fingerprint over events + realized facts + outcomes. */
  readonly outcomeDigest: string;
  readonly actorCount: number;
}

function actorId(kind: SimActorKind, scenarioId: string, index: number): string {
  return `${kind}:${scenarioId}:${index}`;
}

/**
 * The principal reference of a simulated actor (deterministic derivation —
 * consumers journaling scenario evidence use exactly this).
 */
export function simActorPrincipalRef(
  kind: SimActorKind,
  scenarioId: string,
  index: number,
): PrincipalRef {
  return principalFor(kind, actorId(kind, scenarioId, index));
}

function principalFor(kind: SimActorKind, id: string): PrincipalRef {
  switch (kind) {
    case "customer":
      return { principalId: `user:${id}`, kind: "user" };
    case "merchant":
      return { principalId: `merchant:${id}`, kind: "merchant" };
    case "provider":
    case "adversary":
      return { principalId: `platform:${id}`, kind: "platform" };
  }
}

/**
 * Run one Reality-Lab scenario: realize the scripted orders as simulated
 * facts and generate the ordered event trajectory. Pure and deterministic —
 * same spec (same seed) → identical trajectory, record for record.
 */
export function runRealityScenario(spec: RealityScenarioSpec): RealityTrajectory {
  const rng = SeededRandom.fromSeed(spec.seed);
  const clock = new SimClock(Date.parse(timestamp(spec.baseTimestamp)), 3_600_000);
  const environment = new RealityLabEnvironment();
  const events: RealityEvent[] = [];
  const actors: SimActor[] = [];

  const emit = (actor: string, kind: RealityEventKind, detail: string): void => {
    const predecessor = events[events.length - 1];
    const base = { sequence: events.length + 1, at: clock.now(), actorId: actor, kind, detail };
    events.push({
      ...base,
      eventHash: structuralHash({ ...base, prev: predecessor?.eventHash ?? "genesis" }),
    });
    clock.advance();
  };

  const introduce = (kind: SimActorKind, index: number): SimActor => {
    const actor: SimActor = {
      actorId: actorId(kind, spec.scenarioId, index),
      kind,
      principalRef: principalFor(kind, actorId(kind, spec.scenarioId, index)),
    };
    actors.push(actor);
    emit(actor.actorId, "ACTOR_INTRODUCED", `${kind} #${index} enters the simulated environment`);
    return actor;
  };

  for (let index = 1; index <= spec.customerCount; index += 1) introduce("customer", index);
  for (let index = 1; index <= spec.merchantCount; index += 1) introduce("merchant", index);
  for (let index = 1; index <= spec.providerCount; index += 1) introduce("provider", index);
  for (let index = 1; index <= spec.adversaryCount; index += 1) introduce("adversary", index);

  for (const order of spec.orders) {
    const customer = actorId("customer", spec.scenarioId, order.customerIndex);
    const merchant = actorId("merchant", spec.scenarioId, order.merchantIndex);
    const provider = actorId("provider", spec.scenarioId, 1 + rng.nextInt(0, spec.providerCount));
    const browseProduct = `product:catalog:${rng.nextInt(1, 99)}`;
    const quoteMinorUnits = 1000 + rng.nextInt(0, 900);

    emit(customer, "BROWSE", `${customer} browses ${browseProduct}`);
    emit(customer, "ORDER_PLACED", `${order.orderRef} placed for ${order.purchasedSkuRef}`);
    emit(merchant, "SHIPMENT_DECLARED", `${order.orderRef} declared as ${order.declaredSkuRef}`);
    emit(
      provider,
      "CARRIER_OBSERVED",
      `${order.orderRef} observed ${order.observedSkuRef ?? "UNKNOWN"} / ${order.deliveryStatus}`,
    );
    if (order.postsReview !== undefined) {
      emit(
        customer,
        "REVIEW_POSTED",
        `review fp=${order.postsReview.contentFingerprint} device=${order.postsReview.deviceFingerprint}`,
      );
    }
    if (order.filesClaim !== undefined) {
      emit(customer, "CLAIM_FILED", `${order.filesClaim.claimType} claim on ${order.orderRef}`);
    }
    if (order.returnHistory !== undefined) {
      emit(customer, "RETURN_COMPLETED", `return recorded for ${order.orderRef}`);
    }
    emit(provider, "PROVIDER_QUOTED", `quote ${quoteMinorUnits} minor units for ${order.orderRef}`);

    environment.recordSimulatedOrder({
      orderRef: order.orderRef,
      customerRef: principalFor("customer", customer).principalId,
      purchasedSkuRef: order.purchasedSkuRef,
      declaredSkuRef: order.declaredSkuRef,
      fulfilledSkuRef:
        order.fulfilledSkuRef === undefined
          ? { known: false }
          : { known: true, value: order.fulfilledSkuRef },
      observedSkuRef:
        order.observedSkuRef === undefined
          ? { known: false }
          : { known: true, value: order.observedSkuRef },
      deliveryStatus:
        order.deliveryStatus === "UNKNOWN"
          ? { known: false }
          : { known: true, value: order.deliveryStatus },
      carrierProofLevel: order.carrierProofLevel,
      observedAt: order.evidenceAt,
    });
    if (order.returnHistory !== undefined) {
      environment.recordSimulatedReturnHistory({
        customerRef: principalFor("customer", customer).principalId,
        completedReturnCount: order.returnHistory.completedReturnCount,
        upheldClaimCount: order.returnHistory.upheldClaimCount,
        windowBeginsAt: spec.baseTimestamp,
        windowEndsAt: order.evidenceAt,
      });
    }
  }

  for (let index = 1; index <= spec.adversaryCount; index += 1) {
    emit(
      actorId("adversary", spec.scenarioId, index),
      "ADVERSARY_ATTEMPT",
      `adversary #${index} executes its scripted archetype flow`,
    );
  }
  emit(
    "platform:reality-lab",
    "SECURITY_SCREENED",
    "evidence-level security screening over journaled facts",
  );

  const outcomeDigest = structuralHash({
    events: events.map((event) => event.eventHash),
    subjects: spec.orders.map((order) => environment.orderSubject(order.orderRef)),
    histories: environment.customerRefs().map((customer) => environment.returnHistory(customer)),
  });

  return {
    scenarioId: spec.scenarioId,
    seed: spec.seed,
    events,
    environment,
    outcomeDigest,
    actorCount: actors.length,
  };
}
