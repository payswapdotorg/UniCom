/**
 * Universal intent / command surface (W3-005; docs/FEATURE-COMPLETENESS-
 * MATRIX.md "UX discoverability requirement" path 2: universal
 * intent/command).
 *
 * Every feature is addressable through a TYPED intent/command path. The
 * command vocabulary is typed end-to-end — verb, target (matrix feature row
 * or registered surface), resolution — there is NO freeform command string
 * dispatched anywhere. The user's utterance is DATA matched deterministically
 * against the registered typed command catalog (runtime: `runtime/surfaces/
 * universal-intent.ts`); a match resolves to a typed command, a non-match is
 * UNKNOWN, never an error (INVARIANT 10).
 *
 * Contract laws:
 * - typed contracts only: no freeform command strings, no stringly-typed
 *   dispatch; targets are validated against the feature matrix and the
 *   surface registry by contract tests;
 * - resolution is deterministic: identical utterances resolve identically;
 * - UNKNOWN is preserved: an unmatched utterance resolves to
 *   "no-match-unknown", not to an error or a guess.
 */

import type { NavigationSurfaceId } from "./surfaces";
import type { PrimaryNavAreaId } from "./navigation";
import type { PrincipalRef } from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** What the command asks UNiCOM to do (typed verb vocabulary). */
export type UniversalIntentVerb =
  | "show"
  | "find"
  | "create"
  | "connect"
  | "run"
  | "review"
  | "configure"
  | "learn";

/** What a typed command addresses: a matrix feature row, or a whole surface. */
export type UniversalIntentTarget =
  | { readonly kind: "feature"; readonly featureId: string }
  | { readonly kind: "surface"; readonly surfaceId: NavigationSurfaceId };

/**
 * One typed command of the universal intent surface. Derived (determin-
 * istically, at the runtime layer) from the surface registry's intent
 * aliases — each alias addresses every feature the alias's surface makes
 * discoverable, plus the surface itself.
 */
export interface UniversalIntentCommand {
  readonly commandId: string;
  readonly verb: UniversalIntentVerb;
  readonly target: UniversalIntentTarget;
  /** The registered plain-language phrasing this command is addressed by. */
  readonly addressedByAlias: string;
  /** Where acting on the command lands the user. */
  readonly surfaceId: NavigationSurfaceId;
  readonly navArea: PrimaryNavAreaId;
}

/** How an utterance matched a command (deterministic precedence). */
export type UniversalIntentMatchKind = "exact-alias" | "alias-in-utterance";

/** One resolved match: the typed command plus how it matched. */
export interface UniversalIntentMatch {
  readonly command: UniversalIntentCommand;
  readonly matchedAlias: string;
  readonly matchKind: UniversalIntentMatchKind;
}

/**
 * Resolution result. A non-matching utterance is UNKNOWN — the surface says
 * "nothing matched yet", never "error" (INVARIANT 10: UNKNOWN ≠ FAILED).
 */
export type UniversalIntentResolutionResult =
  | { readonly status: "resolved"; readonly matches: readonly UniversalIntentMatch[] }
  | { readonly status: "no-match-unknown"; readonly note: string };

/** The typed input the universal intent surface accepts. */
export interface UniversalIntentSurfaceInput {
  /** The user's own words — inert data for deterministic alias matching. */
  readonly utteranceText: string;
  readonly submittedAt: UtcIso8601String;
  readonly submittedBy: PrincipalRef;
}
