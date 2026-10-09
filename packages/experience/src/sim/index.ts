/**
 * @unicom/experience/runtime/sim — V3 simulation runner (W3-009).
 *
 * GUI-only browser runner + instrumentation. Drives the REAL experience-
 * plane runtimes through their public typed view contracts (no real browser
 * driver; the FROZEN ARCHITECTURE has none — the existing
 * BrowserSessionRuntime is an in-memory typed simulation of session
 * isolation).
 *
 * Public surface:
 * - JourneyEvidenceRecord + sub-records (the schema every journey writes)
 * - Journey family registry (the 19 §10 families + discoverability)
 * - DiscoveryRunner + JourneyDriver + RunnerEnvironment
 * - CampaignScheduler + CountReconciler (the pilot law's denominator invariant)
 * - ZeroOrphanFeatureMatrixMap (every FEATURE_MATRIX row → surface + journey or FAIL/ABSENT)
 * - RoleAccessTest (multi-role switching + access-control)
 * - NoRfidJourneys (POS/file/barcode/weighted/offline/receiving/reconciliation)
 * - FailureVariants (offline/error/stale/UNKNOWN/missing/disabled/unsupported)
 * - CohortPilot (S+M+L end-to-end with evidence stores)
 * - W1/W2 contract surface (read-only — runner consumes, never creates vocabulary)
 *
 * See docs/simulations/runner/ for the human-readable contracts.
 */

export * from "./journey-evidence";
export * from "./journey-registry";
export * from "./w1-w2-contracts";
export * from "./local-fixtures";
export * from "./interaction-trace";
export * from "./discovery-runner";
export * from "./journey-drivers";
export * from "./campaign-scheduler";
export * from "./count-reconciler";
export * from "./zero-orphan-map";
export * from "./role-access";
export * from "./no-rfid-journeys";
export * from "./failure-variants";
export * from "./cohort-pilot";
// W3-010 — real-artifact loader types + baseline campaign + report types.
export * from "./real-artifact-loader";
export * from "./campaign-report";
export * from "./adoption-mapper";
export * from "./baseline-campaign-helpers";
export * from "./baseline-campaign-aggregates";
export * from "./baseline-campaign";
