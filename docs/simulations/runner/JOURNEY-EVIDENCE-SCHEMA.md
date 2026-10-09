# Journey-Evidence Record Schema (W3-009 first push)

**Status**: PUBLISHED (first push of `work/w3-009`). This is the contract
every GUI journey writes. The runner implementation lives at
`packages/experience/src/sim/journey-evidence.ts`.

This schema is the **runner's stable evidence contract**. W1-009 (project
manifests) and W2-009 (personas/score) reference its identifiers; the runner
writes records of this shape; the pilot/campaign report generator reads them
back. Schema evolution is **additive-only** (new optional fields permitted;
existing field semantics never narrowed).

## 1. Top-level record: `JourneyEvidenceRecord`

Every GUI journey — pass, fail, blocked or UNKNOWN — produces exactly one
`JourneyEvidenceRecord`. Fields are grouped by their evidence law source
(see `docs/simulations/V3-EXPERIMENT-PROTOCOL.md` §3).

```ts
interface JourneyEvidenceRecord {
  // --- identity + lineage (protocol §3 line 1–2) ---
  readonly evidenceId: string;              // stable hash of runId+journeyFamily+projectId+seed
  readonly experimentId: string;             // e.g. "v3-baseline"
  readonly cohortId: string;                // e.g. "S-commerce-retail-1"
  readonly journeyFamilyId: string;         // one of JOURNEY_FAMILY_IDS (§10 registry)
  readonly industry: string;                // one of 13 industries (V3-INDUSTRY-AND-COMPETITOR-MATRIX)
  readonly firmSize: "small" | "medium" | "large";
  readonly firmId: string;                  // stable synthetic firm id (W1 contract)
  readonly role: string;                    // stable synthetic role id (W2 contract)
  readonly personaId: string;              // stable synthetic persona id (W2 contract)
  readonly projectId: string;               // stable synthetic project id (W1 contract)
  readonly deterministicSeed: string;       // hex; reproduced exactly by the scheduler
  readonly buildCommit: string;             // git sha at run time
  readonly deploymentTarget: string;        // e.g. "local-dev-fixture" — never production
  readonly runStartedAt: string;            // UTC ISO-8601
  readonly runEndedAt: string;              // UTC ISO-8601

  // --- discovery + navigation (protocol §3 lines 3, 5; §2) ---
  readonly routeOrigin: "homepage" | "role-landing";   // GUI-ONLY law — never a deep link
  readonly discoveryPathKind: "primary-navigation" | "universal-intent" | "contextual-opportunity" | "onboarding-empty-state";
  readonly discoveryPathRef: string;        // surface id / intent alias / opportunity id / onboarding id
  readonly navigationGraph: readonly NavigationNode[];   // every visible nav hop from origin → terminal
  readonly backtracks: readonly BacktrackRecord[];       // empty if none — never silently dropped

  // --- interaction trace (protocol §3 lines 4, 9) ---
  readonly interactionTrace: readonly InteractionStep[]; // every click/keyboard/form entry/approval
  readonly interactionCount: number;       // derived from interactionTrace.length
  readonly screenshotCheckpoints: readonly ScreenshotCheckpoint[];   // start/critical/terminal

  // --- outcome + state (protocol §3 lines 6–8, 10, 11) ---
  readonly outcome: JourneyOutcome;
  readonly successfulSteps: readonly string[];
  readonly failedOrBlockedSteps: readonly FailedStep[];
  readonly approvalState: ApprovalState;
  readonly evidenceState: EvidenceState;
  readonly connectorProviderState: readonly ConnectorProviderState[];   // incl. UNKNOWN
  readonly commerceAssertionRefs: readonly CommerceAssertionRef[];       // checked AFTER journey only
  readonly errorRecoveryTrace: readonly ErrorRecoveryEntry[];

  // --- adoption instrument (protocol §3 line 12; §5) ---
  readonly postTaskAdoptionResponse?: PostTaskAdoptionResponse;

  // --- integrity + GUI-ONLY proof ---
  readonly guiOnlyProof: GuiOnlyProof;      // asserts no direct API/service/DB/hidden-route was used
  readonly sensitiveValueScrubbed: true;    // hard boolean — never false
}

type JourneyOutcome =
  | "pass"           // journey discovered + completed through visible UI
  | "fail"           // journey discoverable but could not be completed via visible UI
  | "blocked"        // permission/connector/session block — counted in denominator
  | "absent"         // GUI cannot expose the feature — backend-only paths do NOT count (law §1)
  | "unknown";       // provider/connector state UNKNOWN; performance claim forbidden (law §3)
```

## 2. Sub-records

### `NavigationNode`

```ts
interface NavigationNode {
  readonly kind: "primary-nav" | "intent-resolution" | "contextual-opportunity" | "onboarding-step" | "surface-action";
  readonly fromSurfaceId: string;
  readonly toSurfaceId: string;
  readonly viaLabel: string;                 // the visible label the user clicked / typed
  readonly atInteractionIndex: number;       // back-pointer into interactionTrace
}
```

### `BacktrackRecord`

```ts
interface BacktrackRecord {
  readonly atInteractionIndex: number;
  readonly reason: "dead-end" | "wrong-surface" | "permission-denied" | "form-validation-error" | "user-cancelled" | "session-error";
  readonly fromSurfaceId: string;
  readonly recoveredToSurfaceId: string;     // empty if journey abandoned here
}
```

### `InteractionStep`

```ts
interface InteractionStep {
  readonly stepIndex: number;
  readonly surfaceId: string;
  readonly control: InteractionControl;     // the visible control acted on
  readonly action: "click" | "type" | "select" | "drag" | "submit" | "approve" | "reject" | "scan" | "upload" | "navigate-back";
  readonly value?: string;                   // scrubbed — no secrets, no PII, no production data
  readonly atUtc: string;
  readonly causedTransitionTo?: string;      // surface id (if a navigation occurred)
  readonly screenshotCheckpointId?: string;  // back-pointer to screenshot at this step
}

interface InteractionControl {
  readonly kind: "button" | "link" | "form-field" | "select" | "checkbox" | "tab" | "card" | "menu-item" | "intent-input" | "approval-toggle";
  readonly visibleLabel: string;             // exactly as the user sees it
  readonly accessibilityName?: string;       // a11y tree name (for visible-control evidence)
}
```

### `ScreenshotCheckpoint`

A typed snapshot of the visible UI at a checkpoint (start, critical decision,
terminal success/failure). The runner drives the in-memory typed runtimes;
the "screenshot" is a **typed projection** of every visible contract field
rendered through the surface's view contract — NOT raw pixels. This satisfies
the visible-control evidence requirement without inventing a real browser
driver (the FROZEN ARCHITECTURE has none).

```ts
interface ScreenshotCheckpoint {
  readonly checkpointId: string;
  readonly phase: "start" | "critical-decision" | "terminal-success" | "terminal-failure" | "terminal-blocked" | "terminal-unknown";
  readonly surfaceId: string;
  readonly atUtc: string;
  readonly renderedViewDigest: string;      // sha256 of the typed view contract serialization
  readonly visibleControlsDigest: string;    // sha256 of the visible-control inventory
  readonly a11yTreeDigest: string;           // sha256 of the accessibility-tree projection
  readonly notes?: string;
}
```

### `ApprovalState`

```ts
interface ApprovalState {
  readonly required: boolean;
  readonly visibleApprovalControl?: InteractionControl;   // the toggle/button the user actuated
  readonly approvalKind?: "merchant" | "operator" | "buyer" | "supplier" | "auditor";
  readonly approvedAt?: string;             // UTC ISO-8601
  readonly approverPrincipalRef?: string;   // opaque principal ref (synthetic)
  readonly proofRef?: string;               // opaque proof ref (P0–P5)
}
```

### `EvidenceState`

```ts
interface EvidenceState {
  readonly proofLevel: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "none";
  readonly evidenceArtifacts: readonly EvidenceArtifactRef[];   // journaled command/observation refs
  readonly preservedThroughReconnect: boolean;   // INVARIANT — offline queue survives
}
```

### `ConnectorProviderState`

```ts
interface ConnectorProviderState {
  readonly connectorInstanceId: string;
  readonly providerId: string;              // e.g. "shopify", "ebay", "pos-import", "browser-only"
  readonly state: "healthy" | "degraded" | "stale" | "unknown" | "disconnected" | "compromised" | "unauthorized";
  readonly lastHealthAt?: string;
  readonly evidenceClass?: "A" | "B" | "C" | "D";   // competitor evidence class — D excluded from performance claims
}
```

### `CommerceAssertionRef`

```ts
interface CommerceAssertionRef {
  readonly assertionId: string;             // opaque ref into the W1 outcome oracle
  readonly checkedAfterJourney: true;       // hard boolean — assertions only AFTER the GUI journey
  readonly passed: boolean;
  readonly evidenceNote: string;
}
```

### `ErrorRecoveryEntry`

```ts
interface ErrorRecoveryEntry {
  readonly atInteractionIndex: number;
  readonly errorKind: "stale-connection" | "partial-failure" | "duplicate-submission" | "denied-permission" | "missing-approval" | "session-interruption" | "supplier-disappearance" | "settlement-unknown" | "browser-session-failure" | "missing-connection" | "disabled-permission" | "unsupported-competitor";
  readonly message: string;
  readonly recoveryAction?: "retry" | "reconnect" | "requeue-offline" | "request-approval" | "switch-role" | "abandon";
  readonly recoveredToInteractionIndex?: number;
}
```

### `PostTaskAdoptionResponse`

Per protocol §5. Kept SEPARATE from the journey outcome — never merged into a
single adoption metric.

```ts
interface PostTaskAdoptionResponse {
  readonly technicalFullSwitchEligible: boolean;       // A — all in-scope role journeys discoverable + successful; no incumbent-only mandatory task; no critical safety/compliance/security/data issue; correct approvals + evidence preserved
  readonly simulatedWillingnessToSwitchCompletely: number;  // B — 0–100, weights frozen before baseline
  readonly mainInterfaceEligible: boolean;              // C — ≥80% of evaluated in-scope journeys can start/be supervised from UNiCOM; critical blockers absent
  readonly simulatedWillingnessToUseAsMainInterface: number; // C — 0–100
  readonly scoreComponents: readonly ScoreComponent[]; // never hidden behind a weighted average
  readonly frictionCauses: readonly string[];           // reason-coded (capability-gap, ui-friction, trust-compliance, price-cost, integration-readiness, training-switching-cost, preference)
  readonly hardBlockers: readonly string[];
  readonly syntheticEstimateLabel: true;                // hard boolean — never presented as human survey intent
}

interface ScoreComponent {
  readonly componentId: string;
  readonly weight: number;
  readonly rawValue: number;
  readonly weightedContribution: number;
  readonly sensitivityNote?: string;
}
```

### `GuiOnlyProof`

The integrity gate. A journey record is **invalid** if `guiOnlyProof.violations` is non-empty — the runner treats this as a hard failure and refuses to write the record (law §1).

```ts
interface GuiOnlyProof {
  readonly deepLinkUsedForDiscovery: false;             // hard boolean — first-discovery never deep-links
  readonly directApiCallsDuringJourney: readonly never[];   // hard empty list — direct API calls forbidden
  readonly directServiceInvocationsDuringJourney: readonly never[];   // same
  readonly dbMutationsDuringJourney: readonly never[];  // same
  readonly hiddenRouteTouchesDuringJourney: readonly never[];   // same
  readonly violations: readonly never[];                // hard empty list — the GUI-ONLY invariant
  readonly instrumentationOnly: true;                   // hard boolean — only observation, never completion
}
```

## 3. Journey family registry (the 19 §10 families + discoverability)

The `journeyFamilyId` field takes one of the following values (verbatim
from `docs/simulations/V3-EXPERIMENT-PROTOCOL.md` §10). The runner must
schedule and score ALL applicable journey families per cohort — omitting a
journey family from the overall campaign is forbidden.

| # | `journeyFamilyId` | §10 |
| --- | --- | --- |
| 1 | `buyer-intent-constraints` | §10.1 |
| 2 | `offer-sourcing-comparison` | §10.2 |
| 3 | `buy-now-vs-wait-price-timing` | §10.3 |
| 4 | `existing-group-buy` | §10.4 |
| 5 | `latent-demand-merchant-group-buy-proposal` | §10.5 |
| 6 | `rent-borrow-vs-buy` | §10.6 |
| 7 | `resale-rental-consignment` | §10.7 |
| 8 | `proactive-economic-opportunities` | §10.8 |
| 9 | `bounded-multi-hop-trade-cycle` | §10.9 |
| 10 | `merchant-commerce-lifecycle` | §10.10 |
| 11 | `supplier-procurement-receiving` | §10.11 |
| 12 | `b2b-multi-location-supplier-coordination` | §10.12 |
| 13 | `autonomous-store-policy` | §10.13 |
| 14 | `commerce-twin-what-if` | §10.14 |
| 15 | `connected-commerce-channels-and-live-commerce` | §10.15 |
| 16 | `physical-no-rfid-supermarket` | §10.16 |
| 17 | `trust-security-fraud-and-recourse` | §10.17 |
| 18 | `failure-unknown-idempotency-recovery` | §10.18 |
| 19 | `gui-feature-discoverability` | §10.19 |

## 4. Determinism + integrity rules

1. **Deterministic seed**: every record carries a `deterministicSeed`. The
   scheduler reproduces the same project ids + persona assignments + journey
   family sampling for the same seed.
2. **Sensitive-value scrubbing**: every record's `sensitiveValueScrubbed`
   field is the literal `true`. The runner refuses to write a record
   containing a value matching the credential/PII patterns in
   `packages/experience/src/sim/sensitive-scrub.ts`.
3. **Additive-only schema**: new optional fields are permitted; existing
   field semantics are never narrowed. The schema version lives in the
   record's `schemaVersion` field (current: `1`).
4. **Failure records ARE evidence**: a record with `outcome: "blocked"` or
   `outcome: "absent"` or `outcome: "unknown"` is a valid evidence record.
   The pilot/campaign report counts these in the denominator (the
   count-reconciler enforces `planned = executed + blocked + skipped`).
5. **GUI-ONLY invariant**: `guiOnlyProof.violations` is the literal empty
   list. A non-empty list is a hard error and the record is rejected.
6. **Backend-only is ABSENT**: a journey where the feature exists only
   below the GUI scores `outcome: "absent"`, even if backend unit tests pass.
