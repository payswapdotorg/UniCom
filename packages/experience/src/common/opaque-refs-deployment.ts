/**
 * Deployment-readiness opaque refs (W3-006; additive split of
 * `opaque-refs.ts` to respect the architecture line budget).
 *
 * Same law as the parent file: experience-plane owned handles, opaque to
 * everything outside this plane. Re-exported verbatim through
 * `common/opaque-refs` so every existing import path stays stable.
 */

declare const deploymentPlanIdBrand: unique symbol;
/** Identifier of a provider-agnostic deployment target plan (W3-006). */
export type DeploymentPlanId = string & {
  readonly [deploymentPlanIdBrand]: "experience:DeploymentPlanId";
};

declare const backupArtifactIdBrand: unique symbol;
/** Identifier of a verified journal backup artifact (DR runbook, W3-006). */
export type BackupArtifactId = string & {
  readonly [backupArtifactIdBrand]: "experience:BackupArtifactId";
};

declare const drRunIdBrand: unique symbol;
/** Identifier of one DR playbook run (W3-006). */
export type DrRunId = string & {
  readonly [drRunIdBrand]: "experience:DrRunId";
};

declare const drDecisionEntryIdBrand: unique symbol;
/** Identifier of one entry in the DR decision journal (W3-006). */
export type DrDecisionEntryId = string & {
  readonly [drDecisionEntryIdBrand]: "experience:DrDecisionEntryId";
};

declare const singleWriterLeaseIdBrand: unique symbol;
/** Identifier of a single-writer fencing lease (split-brain avoidance, W3-006). */
export type SingleWriterLeaseId = string & {
  readonly [singleWriterLeaseIdBrand]: "experience:SingleWriterLeaseId";
};
