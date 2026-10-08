/**
 * Matrix-audit core types (W1-008).
 *
 * A row verdict is DERIVED, never hand-typed. The harness resolves every
 * pointer (file exists, symbol/export exists, surface id present in the
 * navigation registry, test file exists); verdict is PASS iff all five
 * rungs resolve.
 *
 * The audit is itself a PROJECTION — derived from the repo tree, rebuildable
 * by re-running the harness, never a hand-maintained truth (W1-008 §truth
 * distinctions). Output is generatedAt-free; the digest is content-derived
 * so merges are conflict-free.
 */

/** Section ids across all audit planes (W1-008 + W2-008 lanes). */
export type AuditSectionId =
  | "merchant-parity"
  | "ai-native-merchant-layer"
  | "coordination-organization"
  | "buyer-agent"
  | "user-opportunities"
  | "trust-and-security";

/**
 * A `file:symbol` pointer. `file` is a path relative to the repo root;
 * `symbol` is the named export (function/type/interface/const) the harness
 * looks for in that file's text. `symbol` may be omitted when the contract
 * is the file itself (e.g. an aggregate module that re-exports everything).
 */
export interface Pointer {
  readonly file: string;
  readonly symbol?: string;
}

/**
 * The five rungs of product-completeness
 * (docs/V2-PRODUCT-COMPLETENESS-CHARTER.md §1):
 *   contract → implementation → discoverable UX → real journey → evidence.
 *
 * Each rung is a typed pointer (or a discoverability id for the UX rung).
 * The harness resolves each independently; a row's verdict is PASS iff all
 * five rungs resolve.
 */
export interface RowRungs {
  /** Typed contract surface (file:symbol of the domain contract). */
  readonly contract: Pointer;
  /** Concrete implementation (file:symbol — runtime handler, projection, adapter). */
  readonly implementation: Pointer;
  /**
   * Discoverable UX rung. Either:
   *  - a surface id present in `NAVIGATION_SURFACES`;
   *  - a plain-language alias present in some surface's `intentAliases`;
   *  - a hint id present in `CONTEXTUAL_OPPORTUNITY_TYPES` or `ONBOARDING_PATHWAYS`;
   * The harness resolves whichever fields are set, all must resolve.
   */
  readonly discoverableUx: {
    readonly surfaceId?: string;
    readonly intentAlias?: string;
    readonly hintId?: string;
  };
  /** A test file that exercises a real journey for this row. */
  readonly journey: Pointer;
  /** An evidence artifact (committed report file or test-file with embedded assertions). */
  readonly evidence: Pointer;
}

/** One matrix row, as registered by a section file. */
export interface AuditRow {
  /** The matrix row id (from `feature-matrix.ts`). */
  readonly row: string;
  /** The five rungs. */
  readonly rungs: RowRungs;
  /** Optional closure note — set when closure code was added this branch. */
  readonly closureNote?: string;
}

/** A section registry file's exports. */
export interface AuditSection {
  readonly section: AuditSectionId;
  readonly rows: readonly AuditRow[];
}

/** Per-rung resolution verdict (machine-derived). */
export type RungVerdict =
  | { readonly status: "PASS"; readonly resolved: string }
  | { readonly status: "FAIL"; readonly reason: string };

/** A row's full derived verdict (one entry per row in the artifact). */
export interface RowVerdict {
  readonly section: AuditSectionId;
  readonly row: string;
  readonly contract: RungVerdict;
  readonly implementation: RungVerdict;
  readonly discoverableUx: RungVerdict;
  readonly journey: RungVerdict;
  readonly evidence: RungVerdict;
  readonly verdict: "PASS" | "FAIL";
  readonly closureNote?: string;
}

/** A section's verdict block in the aggregated artifact. */
export interface SectionVerdict {
  readonly section: AuditSectionId;
  readonly rows: readonly RowVerdict[];
  readonly summary: {
    readonly total: number;
    readonly pass: number;
    readonly fail: number;
  };
}

/** The full aggregated artifact. */
export interface MatrixAuditArtifact {
  readonly schema: "matrix-audit-v2";
  readonly sections: readonly SectionVerdict[];
  readonly summary: {
    readonly sectionsAudited: number;
    readonly rowsTotal: number;
    readonly rowsGreen: number;
    readonly rowsFail: number;
  };
  /** Content-derived digest (sha256-12 of the canonical JSON, excluding the digest). */
  readonly digest: string;
}
