/**
 * peer-tradecycle fixture data + the kernel-truth view models (J9, W2-013).
 *
 * Everything synthetic stays a deterministic committed DEMO fixture
 * namespaced to this lane (w2tc-*): the participants and their identities,
 * the candidate cycles (discovery is the agent lane's — candidates arrive
 * here as committed fixtures), the items, the proof levels and the consent
 * windows. EXECUTION is no longer a local state machine: the candidate is
 * opened as a `TradeCycleExecution` aggregate of the commerce kernel (its
 * legs validated by the kernel's own cycle-shape laws) and every
 * consent/refusal/withdrawal/lapse/execution travels as a typed kernel
 * command through ./kernel.ts.
 */
import type {
  PrincipalRef,
  TradeCycleExecution,
  TradeCycleExecutionLeg,
} from "@unicom/commerce";
import { makeId, principalRefEquals } from "@unicom/commerce";
import { utc } from "../buyer-support/demo-data.js";
import { TradecycleKernel } from "./kernel.js";

/** One synthetic trade participant (the demo buyer plus peers). */
export interface DemoTradeParticipant {
  readonly id: string;
  readonly name: string;
  readonly gives: string;
  readonly wants: string;
  readonly proofLevel: string;
}

export const DEMO_TRADE_PARTICIPANTS: readonly DemoTradeParticipant[] = [
  {
    id: "harbor-lane",
    name: "Harbor Lane Print Studio (you, demo buyer)",
    gives: "Wide-format A1 printer",
    wants: "Overlock sewing machine (4-thread)",
    proofLevel: "P2",
  },
  {
    id: "two-harbors",
    name: "Two Harbors Design (peer studio)",
    gives: "Overlock sewing machine (4-thread)",
    wants: "Photography light kit (3 heads)",
    proofLevel: "P2",
  },
  {
    id: "northlight",
    name: "Northlight Atelier (peer studio)",
    gives: "Photography light kit (3 heads)",
    wants: "Wide-format A1 printer",
    proofLevel: "P1",
  },
  {
    id: "ferry-road",
    name: "Ferry Road Press (peer studio, re-plan alternative)",
    gives: "Guillotine paper trimmer",
    wants: "Wide-format A1 printer",
    proofLevel: "P2",
  },
];

/** The demo participants as kernel principals (DEMO fixture identities). */
export const DEMO_TRADE_PRINCIPALS: Readonly<Record<string, PrincipalRef>> = Object.fromEntries(
  DEMO_TRADE_PARTICIPANTS.map((participant) => [
    participant.id,
    { kind: "CUSTOMER", customerId: makeId<"CustomerId">(`w2tc-${participant.id}`) } as PrincipalRef,
  ]),
);

export function participantName(principal: PrincipalRef): string {
  const entry = Object.entries(DEMO_TRADE_PRINCIPALS).find(([, ref]) => principalRefEquals(ref, principal));
  return entry ? (DEMO_TRADE_PARTICIPANTS.find((one) => one.id === entry[0])?.name ?? "unknown participant") : "unknown participant";
}

/** The fixture participant id behind a kernel principal (or null). */
export function participantIdOf(principal: PrincipalRef): string | null {
  const entry = Object.entries(DEMO_TRADE_PRINCIPALS).find(([, ref]) => principalRefEquals(ref, principal));
  return entry ? entry[0] : null;
}

export function participant(id: string): string {
  return DEMO_TRADE_PARTICIPANTS.find((one) => one.id === id)?.name ?? id;
}

/** The initiating principal of the demo cycles (the demo buyer). */
export const DEMO_TRADECYCLE_INITIATOR: PrincipalRef = DEMO_TRADE_PRINCIPALS["harbor-lane"]!;

/** Consent windows are fixture data (the demo clock), rendered as such. */
export const TRADECYCLE_CONSENT_WINDOW_ENDS = utc("2026-10-13T18:00:00Z");

/**
 * One fixture candidate: the display data plus the kernel legs in the
 * kernel's canonical closed-cycle order (each receiver is the next giver —
 * `validateTradeCycleLegs` enforces this before the cycle can open).
 */
export interface DemoCycleCandidate {
  readonly cycleId: string;
  readonly label: string;
  /** Kernel leg index shown at each display position (browser-evidenced order). */
  readonly displayOrder: readonly number[];
  /** itemByKernelLeg[legIndex]: the fixture item moving on that kernel leg. */
  readonly itemByKernelLeg: readonly string[];
  readonly alternativeParticipantId: string | null;
}

/**
 * Cycle A fixture. Kernel legs (canonical closed order):
 * 0: Two Harbors → Harbor Lane (overlock machine)
 * 1: Harbor Lane → Northlight (printer — YOUR giving leg)
 * 2: Northlight → Two Harbors (light kit)
 */
export const CYCLE_A: DemoCycleCandidate = {
  cycleId: "w2tc-cycle-a",
  label: "Cycle A — 3 hops (Harbor Lane ⇄ Two Harbors ⇄ Northlight)",
  displayOrder: [0, 2, 1],
  itemByKernelLeg: [
    "Overlock sewing machine (4-thread)",
    "Wide-format A1 printer",
    "Photography light kit (3 heads)",
  ],
  alternativeParticipantId: "ferry-road",
};

/**
 * Cycle B fixture (the re-plan: Ferry Road Press replaces Northlight).
 * Kernel legs: 0: Two Harbors → Harbor Lane (overlock) · 1: Harbor Lane →
 * Ferry Road (printer — YOUR giving leg) · 2: Ferry Road → Two Harbors (trimmer).
 */
export const CYCLE_B: DemoCycleCandidate = {
  cycleId: "w2tc-cycle-b",
  label: "Cycle B (re-plan) — 3 hops with Ferry Road Press instead of Northlight",
  displayOrder: [0, 2, 1],
  itemByKernelLeg: [
    "Overlock sewing machine (4-thread)",
    "Wide-format A1 printer",
    "Guillotine paper trimmer",
  ],
  alternativeParticipantId: null,
};

/** Kernel giver/taker of each leg, in canonical leg order, per candidate. */
const CYCLE_LEG_PARTICIPANTS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  [CYCLE_A.cycleId]: [
    ["two-harbors", "harbor-lane"],
    ["harbor-lane", "northlight"],
    ["northlight", "two-harbors"],
  ],
  [CYCLE_B.cycleId]: [
    ["two-harbors", "harbor-lane"],
    ["harbor-lane", "ferry-road"],
    ["ferry-road", "two-harbors"],
  ],
};

/** Per-leg proof level (the giver's fixture proof level). */
function proofLevelOf(participantId: string): TradeCycleExecutionLeg["requiredProofLevel"] {
  const level = DEMO_TRADE_PARTICIPANTS.find((one) => one.id === participantId)?.proofLevel ?? "P0";
  return level as TradeCycleExecutionLeg["requiredProofLevel"];
}

/** Build the kernel aggregate for a fixture candidate (all legs PENDING). */
export function kernelCycleOf(candidate: DemoCycleCandidate): TradeCycleExecution {
  const pairs = CYCLE_LEG_PARTICIPANTS[candidate.cycleId]!;
  const legs: TradeCycleExecutionLeg[] = pairs.map(([fromId, toId], kernelLegIndex) => ({
    legIndex: kernelLegIndex,
    fromRef: DEMO_TRADE_PRINCIPALS[fromId]!,
    toRef: DEMO_TRADE_PRINCIPALS[toId]!,
    offeredItemRef: `w2tc-item:${candidate.itemByKernelLeg[kernelLegIndex]}`,
    requiredProofLevel: proofLevelOf(fromId),
    consentState: "PENDING",
    revision: 1,
  }));
  return {
    tradeCycleId: makeId<"TradeCycleId">(candidate.cycleId),
    initiatingRef: DEMO_TRADECYCLE_INITIATOR,
    legs,
    executionMode: "ATOMIC",
    bounds: { maxHops: 5, environment: "LAB" },
    state: "OPEN",
    revision: 1,
  };
}

/** The fixture candidate metadata of a kernel cycle id. */
export function candidateOf(cycleId: string): DemoCycleCandidate | null {
  if (cycleId === CYCLE_A.cycleId) return CYCLE_A;
  if (cycleId === CYCLE_B.cycleId) return CYCLE_B;
  return null;
}

/**
 * Seed the demo kernel: cycle A is opened through the kernel command path
 * (validateTradeCycleLegs runs inside OPEN — the fixture candidate must pass
 * the kernel's own cycle-shape laws or the seed fails honestly).
 */
export function seedTradecycleDemo(): TradecycleKernel {
  const kernel = new TradecycleKernel();
  const opened = kernel.apply(DEMO_TRADECYCLE_INITIATOR, {
    type: "OPEN_TRADE_CYCLE",
    cycle: kernelCycleOf(CYCLE_A),
  });
  if (opened.status !== "EXECUTED") {
    throw new Error(`demo seed failed honestly: ${opened.status === "REJECTED" ? opened.reason.detail : opened.status}`);
  }
  return kernel;
}

/** Re-open a fresh kernel with the re-plan candidate (cycle B). */
export function rePlanSeed(): TradecycleKernel {
  const kernel = new TradecycleKernel();
  const opened = kernel.apply(DEMO_TRADECYCLE_INITIATOR, {
    type: "OPEN_TRADE_CYCLE",
    cycle: kernelCycleOf(CYCLE_B),
  });
  if (opened.status !== "EXECUTED") {
    throw new Error(`demo seed failed honestly: ${opened.status === "REJECTED" ? opened.reason.detail : opened.status}`);
  }
  return kernel;
}

/** Opaque per-leg authorization references (DEMO fixture references). */
export function authorizationRefOf(participantId: string): string {
  return `w2tc-authz-${participantId}`;
}

/** Human label for a kernel cycle state (kernel vocabulary, spelled out). */
export const TRADECYCLE_STATE_LABELS: Readonly<Record<TradeCycleExecution["state"], string>> = {
  OPEN: "OPEN — awaiting each giver's consent",
  ALL_LEGS_AUTHORIZED: "ALL_LEGS_AUTHORIZED — every leg carries its giver's consent",
  COMMITTED: "COMMITTED — executed by the commerce kernel",
  STOPPED_REFUSAL: "STOPPED_REFUSAL",
  STOPPED_WITHDRAWAL: "STOPPED_WITHDRAWAL",
  STOPPED_EXPIRY: "STOPPED_EXPIRY",
  RECOURSE_OPEN: "RECOURSE_OPEN",
  ROLLED_BACK: "ROLLED_BACK",
};

/** Is this kernel state a stop (nothing may progress from here)? */
export function isStoppedCycle(state: TradeCycleExecution["state"]): boolean {
  return (
    state === "STOPPED_REFUSAL" || state === "STOPPED_WITHDRAWAL" || state === "STOPPED_EXPIRY" || state === "ROLLED_BACK"
  );
}
