/**
 * Actor-as-capability representation (FROZEN-ARCHITECTURE §3.F, §4;
 * invariants 7/34; W2-003 scenario 5).
 *
 * Principals and delegates surface as capability HOLDERS inside
 * organization structures: an OrganizationPosition is granted capabilities
 * from the ONE canonical capability vocabulary (capability/capability.ts —
 * there is no second model, invariant 34). A holder commands EXACTLY the
 * capabilities its positions were granted:
 * - no ambient authority: nothing is ever implicitly held;
 * - no forgery: grants must be authorized by the position's declared
 *   grantor, reference a capability in the canonical vocabulary, and target
 *   a known position — anything else is a typed violation.
 */

import type { PrincipalRef } from "./common.js";
import type { AuthorizationDecision } from "./commerce-seam.js";
import type { CapabilityDefinition } from "./capability/capability.js";

export interface OrganizationPosition {
  readonly positionId: string;
  readonly organizationId: string;
  readonly title: string;
  /** The principal occupying the position (main agent or ephemeral delegate). */
  readonly holder: { readonly principalId: string; readonly kind: "main-agent" | "ephemeral-delegate" };
  /** The only authority that may grant capabilities to this position. */
  readonly grantorRef: PrincipalRef;
}

export interface PositionCapabilityGrant {
  readonly grantId: string;
  readonly positionId: string;
  readonly capabilityDefinitionId: string;
  readonly grantedBy: PrincipalRef;
  readonly authorization: AuthorizationDecision;
  readonly grantedAt: string;
}

export type CapabilityGrantViolation =
  | "UNKNOWN_POSITION"
  | "CAPABILITY_NOT_IN_CANONICAL_VOCABULARY"
  | "GRANT_NOT_AUTHORIZED"
  | "GRANT_AUTHORITY_MISMATCH"
  | "DUPLICATE_GRANT";

export type CapabilityGrantValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly violations: readonly CapabilityGrantViolation[] };

/**
 * Deterministic grant validation: a grant is valid only when the position
 * exists, the capability belongs to the canonical vocabulary, the grantor is
 * the position's declared authority AND personally authorized the grant,
 * and the grant is not a duplicate.
 */
export function validateCapabilityGrant(input: {
  readonly grant: PositionCapabilityGrant;
  readonly position: OrganizationPosition | undefined;
  readonly canonicalVocabulary: readonly CapabilityDefinition[];
  readonly existingGrantIds: ReadonlySet<string>;
}): CapabilityGrantValidation {
  const violations: CapabilityGrantViolation[] = [];
  const { grant, position } = input;

  if (position === undefined) violations.push("UNKNOWN_POSITION");
  if (!input.canonicalVocabulary.some((definition) => definition.capabilityDefinitionId === grant.capabilityDefinitionId)) {
    violations.push("CAPABILITY_NOT_IN_CANONICAL_VOCABULARY");
  }
  if (grant.authorization.decision !== "AUTHORIZED") violations.push("GRANT_NOT_AUTHORIZED");
  if (position !== undefined && grant.authorization.decidedBy.principalId !== position.grantorRef.principalId) {
    violations.push("GRANT_AUTHORITY_MISMATCH");
  }
  if (position !== undefined && grant.grantedBy.principalId !== position.grantorRef.principalId) {
    violations.push("GRANT_AUTHORITY_MISMATCH");
  }
  if (input.existingGrantIds.has(grant.grantId)) violations.push("DUPLICATE_GRANT");

  return violations.length === 0 ? { valid: true } : { valid: false, violations: [...new Set(violations)] };
}

export interface PositionSnapshot {
  readonly position: OrganizationPosition;
  /** EXACTLY the granted capability ids — nothing ambient. */
  readonly capabilities: readonly string[];
}

/**
 * Append-only ledger of organization positions and their capability grants.
 * Grants are validated against the canonical vocabulary before recording;
 * there are no mutation or removal operations — history is append-only.
 */
export class ActorCapabilityLedger {
  private readonly vocabulary: readonly CapabilityDefinition[];
  private readonly positionsById = new Map<string, OrganizationPosition>();
  private readonly grantsByPosition = new Map<string, PositionCapabilityGrant[]>();
  private readonly grantIds = new Set<string>();
  private readonly grantsByHolder = new Map<string, PositionCapabilityGrant[]>();

  constructor(canonicalVocabulary: readonly CapabilityDefinition[]) {
    this.vocabulary = canonicalVocabulary;
  }

  /** W2-004 (additive): the canonical vocabulary this ledger validates against. */
  canonicalVocabulary(): readonly CapabilityDefinition[] {
    return [...this.vocabulary];
  }

  registerPosition(position: OrganizationPosition): void {
    if (this.positionsById.has(position.positionId)) {
      throw new Error(`position already registered: ${position.positionId} (append-only ledger)`);
    }
    this.positionsById.set(position.positionId, position);
  }

  findPosition(positionId: string): OrganizationPosition | undefined {
    return this.positionsById.get(positionId);
  }

  /** Validate and (when valid) record a capability grant. */
  grant(input: {
    readonly grant: PositionCapabilityGrant;
    readonly position?: OrganizationPosition;
  }): CapabilityGrantValidation {
    const position = input.position ?? this.positionsById.get(input.grant.positionId);
    const validation = validateCapabilityGrant({
      grant: input.grant,
      position,
      canonicalVocabulary: this.vocabulary,
      existingGrantIds: this.grantIds,
    });
    if (!validation.valid) return validation;
    if (position === undefined) return { valid: false, violations: ["UNKNOWN_POSITION"] };

    this.grantIds.add(input.grant.grantId);
    const byPosition = this.grantsByPosition.get(position.positionId) ?? [];
    byPosition.push(input.grant);
    this.grantsByPosition.set(position.positionId, byPosition);
    const byHolder = this.grantsByHolder.get(position.holder.principalId) ?? [];
    byHolder.push(input.grant);
    this.grantsByHolder.set(position.holder.principalId, byHolder);
    return { valid: true };
  }

  /** EXACTLY the capabilities granted to one position — no ambient authority. */
  capabilitiesForPosition(positionId: string): readonly string[] {
    return [...(this.grantsByPosition.get(positionId) ?? [])]
      .map((grant) => grant.capabilityDefinitionId)
      .sort();
  }

  /** Union of capabilities across every position a principal holds. */
  capabilitiesForHolder(principalId: string): readonly string[] {
    return [...new Set(this.capabilitiesForHolderGrants(principalId))].sort();
  }

  /** Position grants a holder actually holds (across organizations). */
  holderGrants(principalId: string): readonly PositionCapabilityGrant[] {
    return [...(this.grantsByHolder.get(principalId) ?? [])];
  }

  /**
   * W2-004 (additive): principals currently holding a capability — the
   * reverse lookup broadcast audience computation needs (deterministic,
   * sorted; holder principal ids, positions included).
   */
  holdersOfCapability(capabilityDefinitionId: string): readonly string[] {
    return [...new Set(
      [...this.grantsByHolder.entries()]
        .filter(([, grants]) => grants.some((grant) => grant.capabilityDefinitionId === capabilityDefinitionId))
        .map(([principalId]) => principalId),
    )].sort();
  }

  /** True only when a granted capability is held — never by catalog presence. */
  holdsCapability(principalId: string, capabilityDefinitionId: string): boolean {
    return this.holderGrants(principalId).some(
      (grant) => grant.capabilityDefinitionId === capabilityDefinitionId,
    );
  }

  /** Deterministic snapshots of every registered position. */
  listPositions(): readonly PositionSnapshot[] {
    return [...this.positionsById.values()]
      .sort((a, b) => (a.positionId < b.positionId ? -1 : 1))
      .map((position) => ({ position, capabilities: this.capabilitiesForPosition(position.positionId) }));
  }

  listGrants(): readonly PositionCapabilityGrant[] {
    return [...this.grantsByPosition.values()].flat().sort((a, b) => (a.grantId < b.grantId ? -1 : 1));
  }

  private capabilitiesForHolderGrants(principalId: string): readonly string[] {
    return this.holderGrants(principalId).map((grant) => grant.capabilityDefinitionId);
  }
}
