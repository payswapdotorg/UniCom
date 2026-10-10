// Type declarations for commerce-evidence-lib.mjs so the vitest suite (and
// any TS consumer) typechecks against the shared runner logic (same pattern
// as the W1-010 pilot's browser-pilot-lib.d.mts).
export type Outcome = "PASS" | "FAIL" | "ABSENT" | "BLOCKED" | "UNKNOWN" | "SKIPPED";

export const EVIDENCE_KIND: "w1-011-commerce-host-evidence";
export const SCHEMA_VERSION: 1;
export const OUTCOMES: readonly Outcome[];
export const JOURNEY_IDS: readonly string[];
export const READY_JOURNEYS: readonly string[];
export const EXPLORE_GROUP_TITLES: readonly string[];
export const JOURNEY_FAMILY_META: Readonly<Record<string, readonly [string, string]>>;

export function expectedJourneyState(journeyId: string): "ready" | "in-development";
export function worstOutcome(outcomes: readonly string[]): string;

export interface JourneyRowCapture {
  readonly journeyId: string;
  readonly chipKind?: "ok" | "warn" | "err" | "muted" | null;
  readonly chipText?: string;
}
export interface JourneyCoverageEntry {
  readonly journeyId: string;
  readonly familyName: string;
  readonly owningLane: string;
  readonly expectedState: "ready" | "in-development";
  readonly homeEntry: Record<string, unknown>;
  readonly exploreEntry: Record<string, unknown>;
  readonly outcome: Outcome;
  readonly reason: string;
  readonly evidenceScreenshots: readonly string[];
}
export function buildJourneyCoverage(input: {
  homeRows?: readonly JourneyRowCapture[];
  exploreRows?: readonly JourneyRowCapture[];
}): JourneyCoverageEntry[];

export interface StepCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
export interface ClassifyStepInput {
  attempted?: boolean;
  rendered?: boolean | null;
  envError?: string | null;
  checks?: readonly StepCheck[];
}
export function classifyStepOutcome(input: ClassifyStepInput): Outcome;

export interface JourneyRowShape {
  readonly present: boolean;
  readonly chipKind?: "ok" | "warn" | "err" | "muted" | null;
  readonly chipText?: string;
}
export interface JourneyRowClassification {
  readonly outcome: Outcome;
  readonly expected: "ready" | "in-development";
  readonly reason: string;
}
export function classifyJourneyRow(journeyId: string, row: JourneyRowShape | null): JourneyRowClassification;

export interface DenominatorInput {
  planned: number;
  executed: number;
  blocked: number;
  skipped: number;
  byOutcome?: Record<string, number>;
}
export interface DenominatorResult extends DenominatorInput {
  recomputed: number;
  outcomeSum: number;
  zeroDrift: boolean;
  reconciliation: string;
}
export function reconcileDenominator(input: DenominatorInput): DenominatorResult;
export function tallyOutcomes(outcomeLists: readonly (readonly string[])[]): Record<string, number>;

export function scrubConsoleLine(line: string): string;
export function scrubConsoleLines(lines: readonly string[]): string[];

export function collectEvidencePointers(manifest: unknown): string[];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
export function validateManifest(manifest: unknown): ValidationResult;

export interface ParsedArgs {
  help: boolean;
  dryRun: boolean;
  startEnv: boolean;
  preview: boolean;
  baseUrl: string | null;
  outDir: string | null;
  manifestPath: string | null;
  port: number | null;
  errors: string[];
}
export function parseArgs(argv: readonly string[]): ParsedArgs;
