/**
 * TEST-ONLY W1-010 — shared leaf types (imported by both the evidence-input
 * types in ./types.ts and the certification-output types in
 * ./types-report.ts; kept in a dependency-free base module so the two type
 * files never form an import cycle).
 */

/** A terminal journey outcome (law §1 — backend-only is ABSENT). */
export type JourneyOutcome = "pass" | "fail" | "blocked" | "absent" | "unknown";
