/**
 * W2-010 MATRIX ORACLE LOADER — the committed, versioned matrix is the
 * canonical oracle; tests read it back from
 * `docs/simulations/post-v3/w2-010/resilience-matrix.v1.json` so the
 * executed assertions and the published matrix cannot drift apart.
 */

import { readFileSync } from "node:fs";

export type ExpectedResultClass = "expected-success" | "expected-block";

export type ExecutionStatus = "executed-fixture" | "planned-browser-pending" | "gap-no-seam";

export interface MatrixScenarioExecution {
  readonly status: ExecutionStatus;
  readonly testRef?: string;
}

export interface MatrixScenario {
  readonly scenarioId: string;
  readonly title: string;
  readonly initialConditions: string;
  readonly injectedFault: string;
  readonly expectedStateTransitions: readonly string[];
  readonly expectedVisible: { readonly surface: string; readonly surfaceState: string; readonly message: string };
  readonly permittedAction: string;
  readonly blockedAction: string;
  readonly recoveryPath: string;
  readonly evidenceProofRequirements: string;
  readonly terminalState: string;
  readonly expectedResultClass: ExpectedResultClass;
  readonly invariants: readonly string[];
  readonly execution: MatrixScenarioExecution;
  readonly gap?: string;
}

export interface MatrixFamily {
  readonly familyId: string;
  readonly familyName: string;
  readonly journeyFamilyIds: readonly string[];
  readonly injectionSeam: string;
  readonly scenarios: readonly MatrixScenario[];
}

export interface ResilienceMatrix {
  readonly matrixId: string;
  readonly version: string;
  readonly evidenceLevelDefault: string;
  readonly summary: {
    readonly families: number;
    readonly scenarios: number;
    readonly expectedSuccess: number;
    readonly expectedBlock: number;
  };
  readonly families: readonly MatrixFamily[];
}

const MATRIX_URL = new URL(
  "../../../../../docs/simulations/post-v3/w2-010/resilience-matrix.v1.json",
  import.meta.url,
);

let cached: ResilienceMatrix | undefined;

export function loadResilienceMatrix(): ResilienceMatrix {
  if (cached === undefined) {
    cached = JSON.parse(readFileSync(MATRIX_URL, "utf8")) as ResilienceMatrix;
  }
  return cached;
}

export function allScenarios(): readonly MatrixScenario[] {
  return loadResilienceMatrix().families.flatMap((family) => family.scenarios);
}

export function scenarioById(scenarioId: string): MatrixScenario {
  const scenario = allScenarios().find((entry) => entry.scenarioId === scenarioId);
  if (scenario === undefined) throw new Error(`unknown resilience scenario: ${scenarioId}`);
  return scenario;
}

export function scenariosOfFamily(familyId: string): readonly MatrixScenario[] {
  const family = loadResilienceMatrix().families.find((entry) => entry.familyId === familyId);
  if (family === undefined) throw new Error(`unknown resilience family: ${familyId}`);
  return family.scenarios;
}

/** The test must produce exactly this class of result (oracle side-by-side). */
export function expectResultClass(scenarioId: string): ExpectedResultClass {
  return scenarioById(scenarioId).expectedResultClass;
}

export function scenarioShortId(scenarioId: string): string {
  // "W2-010-F01-S03" → "F01-S03" (assertion labels)
  const match = /W2-010-(F\d+-S\d+)$/.exec(scenarioId);
  return match === null ? scenarioId : (match[1] as string);
}
