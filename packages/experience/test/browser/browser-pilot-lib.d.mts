// Type declarations for browser-pilot-lib.mjs so the vitest suites (and any
// TS consumer) typecheck against the shared runner logic.
export type JourneyOutcome = "pass" | "fail" | "blocked" | "absent" | "unknown";
export type FirmProfile = "small" | "medium" | "large";

export const MANIFEST_SCHEMA_VERSION: 1;
export const BROWSER_EXTENSION_VERSION: 1;
export const PILOT_KIND: string;
export const JOURNEY_FAMILY_IDS: readonly string[];
export const PROTOCOL_REFS: Readonly<Record<string, string>>;
export const FAMILY_VISIBLE_SIGNS: Readonly<Record<string, readonly string[]>>;
export const FIRM_PROFILES: readonly FirmProfile[];
export const OUTCOMES: readonly JourneyOutcome[];

export interface SignScanEntry {
  present: boolean;
}
export type SignScan = Record<string, SignScanEntry>;

export function scanTerms(haystack: string, terms: readonly string[]): Record<string, SignScanEntry>;
export function signsFound(signScan: Record<string, SignScanEntry>): boolean;
export function classifyFamilyDiscovery(input: {
  signScan: Record<string, SignScanEntry>;
  surfacesRendered: boolean;
}): JourneyOutcome;
export function scrubConsoleLine(line: string): string;
export function scrubConsoleLines(lines: readonly string[]): string[];

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

export interface GuiOnlyProof {
  deepLinkUsedForDiscovery: false;
  directApiCallsDuringJourney: never[];
  directServiceInvocationsDuringJourney: never[];
  dbMutationsDuringJourney: never[];
  hiddenRouteTouchesDuringJourney: never[];
  violations: never[];
  instrumentationOnly: true;
}
export function emptyGuiOnlyProof(): GuiOnlyProof;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
export function validateManifest(manifest: unknown): ValidationResult;

export interface ParsedArgs {
  help: boolean;
  dryRun: boolean;
  startEnv: boolean;
  baseUrl: string | null;
  outDir: string | null;
  manifestPath: string | null;
  errors: string[];
}
export function parseArgs(argv: readonly string[]): ParsedArgs;
