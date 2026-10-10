/**
 * peer-tradecycle fixture data + the pure per-leg consent state machine (J9).
 *
 * All participants/items are deterministic committed DEMO fixtures
 * namespaced to this lane (w2tc-*). The consent machine is PURE: every
 * transition returns a new cycle (or an honest rejection) and mirrors the
 * agent-lane engine's laws — authorization belongs to the GIVING
 * participant of each leg; a stop event never commits any other leg.
 */
import { utc } from "../buyer-support/demo-data.js";

/** One synthetic trade participant (the demo buyer plus peers). */
export interface DemoTradeParticipant {
  readonly id: string;
  readonly name: string;
  readonly gives: string;
  readonly wants: string;
  readonly proofLevel: string;
}

/** Consent state of one leg (the GIVING participant's decision only). */
export type LegConsentState = "UNCONSENTED" | "CONSENTED" | "REFUSED" | "EXPIRED" | "WITHDRAWN";

/** Cycle lifecycle: stops are honest stops — never silent commits. */
export type CycleStatus =
  | "PROPOSED"
  | "ALL_LEGS_CONSENTED"
  | "STOPPED_REFUSAL"
  | "STOPPED_EXPIRY"
  | "STOPPED_WITHDRAWAL"
  | "HANDOFF_PREPARED";

export interface DemoTradeLeg {
  readonly legIndex: number;
  /** Giving participant (the only one who may authorize this leg). */
  readonly fromId: string;
  /** Receiving participant (their stated want is satisfied by this item). */
  readonly toId: string;
  /** The item that moves from → to on this leg. */
  readonly item: string;
  readonly consentExpiresAt: ReturnType<typeof utc>;
  consent: LegConsentState;
}

export interface DemoTradeCycle {
  readonly cycleId: string;
  readonly label: string;
  status: CycleStatus;
  readonly legs: DemoTradeLeg[];
  /** The participant available as the re-plan alternative (or null). */
  readonly alternativeParticipantId: string | null;
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

const EXPIRY = utc("2026-10-13T18:00:00Z");

function leg(legIndex: number, fromId: string, toId: string, item: string): DemoTradeLeg {
  return {
    legIndex,
    fromId,
    toId,
    item,
    consentExpiresAt: EXPIRY,
    consent: "UNCONSENTED",
  };
}

/** The committed demo candidate cycles (the discovery engine is agent-lane). */
export function initialCycle(): DemoTradeCycle {
  return {
    cycleId: "w2tc-cycle-a",
    label: "Cycle A — 3 hops (Harbor Lane ⇄ Two Harbors ⇄ Northlight)",
    status: "PROPOSED",
    legs: [
      leg(0, "two-harbors", "harbor-lane", "Overlock sewing machine (4-thread)"),
      leg(1, "northlight", "two-harbors", "Photography light kit (3 heads)"),
      leg(2, "harbor-lane", "northlight", "Wide-format A1 printer"),
    ],
    alternativeParticipantId: "ferry-road",
  };
}

/** The re-plan candidate: the refused participant swapped for the alternative. */
export function rePlanCycle(): DemoTradeCycle {
  return {
    cycleId: "w2tc-cycle-b",
    label: "Cycle B (re-plan) — 3 hops with Ferry Road Press instead of Northlight",
    status: "PROPOSED",
    legs: [
      leg(0, "two-harbors", "harbor-lane", "Overlock sewing machine (4-thread)"),
      leg(1, "ferry-road", "two-harbors", "Guillotine paper trimmer"),
      leg(2, "harbor-lane", "ferry-road", "Wide-format A1 printer"),
    ],
    alternativeParticipantId: null,
  };
}

export type CycleStep =
  | { readonly ok: true; readonly cycle: DemoTradeCycle }
  | { readonly ok: false; readonly error: string };

function clone(cycle: DemoTradeCycle): DemoTradeCycle {
  return { ...cycle, legs: cycle.legs.map((one) => ({ ...one })) };
}

function legOf(cycle: DemoTradeCycle, legIndex: number): DemoTradeLeg | null {
  return cycle.legs.find((one) => one.legIndex === legIndex) ?? null;
}

/** The giving participant records consent for their leg (PROPOSED cycles only). */
export function consentLeg(cycle: DemoTradeCycle, legIndex: number): CycleStep {
  if (cycle.status !== "PROPOSED") {
    return { ok: false, error: `cycle is ${cycle.status} — consent is only collected while PROPOSED` };
  }
  const target = legOf(cycle, legIndex);
  if (!target) return { ok: false, error: `no leg ${legIndex}` };
  if (target.consent !== "UNCONSENTED") {
    return { ok: false, error: `leg ${legIndex} is ${target.consent} — consent was already recorded or the leg is stopped` };
  }
  const next = clone(cycle);
  const nextLeg = legOf(next, legIndex)!;
  nextLeg.consent = "CONSENTED";
  if (next.legs.every((one) => one.consent === "CONSENTED")) next.status = "ALL_LEGS_CONSENTED";
  return { ok: true, cycle: next };
}

/** The giving participant refuses: the cycle stops; NO other leg is committed. */
export function refuseLeg(cycle: DemoTradeCycle, legIndex: number): CycleStep {
  if (cycle.status !== "PROPOSED" && cycle.status !== "ALL_LEGS_CONSENTED") {
    return { ok: false, error: `cycle is ${cycle.status} — it has already stopped or moved on` };
  }
  const target = legOf(cycle, legIndex);
  if (!target) return { ok: false, error: `no leg ${legIndex}` };
  if (target.consent === "REFUSED" || target.consent === "EXPIRED" || target.consent === "WITHDRAWN") {
    return { ok: false, error: `leg ${legIndex} is already ${target.consent}` };
  }
  const next = clone(cycle);
  const nextLeg = legOf(next, legIndex)!;
  nextLeg.consent = "REFUSED";
  next.status = "STOPPED_REFUSAL";
  return { ok: true, cycle: next };
}

/** The consent window lapses on a leg: the cycle stops; nothing commits. */
export function lapseLeg(cycle: DemoTradeCycle, legIndex: number): CycleStep {
  if (cycle.status !== "PROPOSED" && cycle.status !== "ALL_LEGS_CONSENTED") {
    return { ok: false, error: `cycle is ${cycle.status} — it has already stopped or moved on` };
  }
  const target = legOf(cycle, legIndex);
  if (!target) return { ok: false, error: `no leg ${legIndex}` };
  if (target.consent !== "UNCONSENTED") {
    return { ok: false, error: `leg ${legIndex} is ${target.consent} — only an unanswered leg can lapse` };
  }
  const next = clone(cycle);
  const nextLeg = legOf(next, legIndex)!;
  nextLeg.consent = "EXPIRED";
  next.status = "STOPPED_EXPIRY";
  return { ok: true, cycle: next };
}

/** A consented giver drops out before execution: the cycle stops; nothing commits. */
export function withdrawLeg(cycle: DemoTradeCycle, legIndex: number): CycleStep {
  if (cycle.status !== "PROPOSED" && cycle.status !== "ALL_LEGS_CONSENTED") {
    return { ok: false, error: `cycle is ${cycle.status} — it has already stopped or moved on` };
  }
  const target = legOf(cycle, legIndex);
  if (!target) return { ok: false, error: `no leg ${legIndex}` };
  if (target.consent !== "CONSENTED") {
    return { ok: false, error: `leg ${legIndex} is ${target.consent} — only a consented leg can be withdrawn` };
  }
  const next = clone(cycle);
  const nextLeg = legOf(next, legIndex)!;
  nextLeg.consent = "WITHDRAWN";
  next.status = "STOPPED_WITHDRAWAL";
  return { ok: true, cycle: next };
}

/**
 * Execution hand-off: prepared only when EVERY leg is consented. This never
 * executes anything — the commerce seam + per-leg authorizations live in the
 * agent lane (blocker); the demo records the hand-off request honestly.
 */
export function prepareHandoff(cycle: DemoTradeCycle): CycleStep {
  if (cycle.status !== "ALL_LEGS_CONSENTED") {
    return { ok: false, error: `cycle is ${cycle.status} — hand-off needs every leg consented` };
  }
  const next = clone(cycle);
  next.status = "HANDOFF_PREPARED";
  return { ok: true, cycle: next };
}

/** Which stop reasons may re-plan (a refusal/withdrawal/expiry may, a prepared hand-off may not). */
export function canRePlan(cycle: DemoTradeCycle): boolean {
  return (
    (cycle.status === "STOPPED_REFUSAL" ||
      cycle.status === "STOPPED_EXPIRY" ||
      cycle.status === "STOPPED_WITHDRAWAL") &&
    cycle.alternativeParticipantId !== null
  );
}
