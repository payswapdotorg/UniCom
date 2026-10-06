/**
 * Capability-scoped defensive security broadcasts (W2-004 scenario 7;
 * FROZEN-ARCHITECTURE §3.H; invariants 25/48/49; W2-003 privacy contract).
 *
 * Laws:
 * - a defensive broadcast reaches EXACTLY the affected capability-scoped
 *   principals: the audience is computed as (principals affected by the
 *   threat) ∪ (holders of the scoped defensive capability) — nothing wider;
 * - the broadcast content is minimum-necessary disclosure: threat class,
 *   defensive indicators, mitigations, affected count and opaque subject
 *   refs ONLY — a view carrying any other field is a typed violation;
 * - broadcasts are DEFENSIVE ONLY (validated through the W2-002
 *   defensive-only signature law before issue);
 * - NO raw cross-principal intent leaks through the security channel: the
 *   adversarial observer model from the W2-003 coordination-privacy contract
 *   is run directly over the broadcast channel — an observer holding every
 *   broadcast view reconstructs nothing beyond the coordination contract's
 *   explicit disclosures (asserted, adversarially).
 */

import type { PrincipalRef } from "./common.js";
import type { BuyerCommerceIntent } from "./intent.js";
import {
  adversarialReconstruction,
  type CoordinationDisclosureView,
  type ObserverReconstruction,
} from "./coordination-privacy.js";
import {
  issueDefensiveBroadcast,
  type DefensiveSecurityBroadcast,
  type MitigationKind,
  type SecurityThreatClass,
  type ThreatIndicator,
  type ThreatMitigation,
  type ThreatSignature,
} from "./security.js";

/** Fields a security broadcast view may disclose (minimum necessary). */
export const SECURITY_BROADCAST_DISCLOSURE_FIELDS: readonly string[] = [
  "THREAT_CLASS",
  "DEFENSIVE_INDICATORS",
  "MITIGATIONS",
  "AFFECTED_COUNT",
  "OPAQUE_SUBJECT_REFS",
];

export const SECURITY_BROADCAST_DISCLOSURE_POLICY_ID = "security-broadcast-minimum-necessary-v1";

export interface SecurityBroadcastScope {
  readonly threatClass: SecurityThreatClass;
  /** Principals directly affected by the detected threat. */
  readonly affectedPrincipalRefs: readonly PrincipalRef[];
  /** The defensive capability whose holders need the signal. */
  readonly capabilityDefinitionId: string;
  /** Opaque subject references already disclosed by the coordination contract. */
  readonly opaqueSubjectRefs?: readonly string[];
}

export interface BroadcastAudience {
  readonly audienceRefs: readonly PrincipalRef[];
  readonly rationale: string;
}

/**
 * Compute the broadcast audience: affected principals plus holders of the
 * scoped capability, deduplicated and deterministically ordered. Exactly the
 * affected capability-scoped principals — never a broadcast to everyone.
 */
export function computeBroadcastAudience(input: {
  readonly scope: SecurityBroadcastScope;
  /** Holders of the scoped defensive capability (actor-as-capability view). */
  readonly capabilityHolders: readonly PrincipalRef[];
}): BroadcastAudience {
  const byId = new Map<string, PrincipalRef>();
  for (const principal of [...input.scope.affectedPrincipalRefs, ...input.capabilityHolders]) {
    byId.set(principal.principalId, principal);
  }
  const audienceRefs = [...byId.values()].sort((a, b) =>
    a.principalId < b.principalId ? -1 : a.principalId > b.principalId ? 1 : 0,
  );
  return {
    audienceRefs,
    rationale: `${input.scope.affectedPrincipalRefs.length} affected + ${input.capabilityHolders.length} capability holders of ${input.scope.capabilityDefinitionId}`,
  };
}

/** A scoped defensive broadcast: the validated signature plus the checked view. */
export interface ScopedDefensiveBroadcast extends DefensiveSecurityBroadcast {
  /** Minimum-necessary disclosure view actually carried on the channel. */
  readonly disclosed: Readonly<Record<string, unknown>>;
  readonly disclosure: {
    readonly policyId: string;
    readonly allowedFields: readonly string[];
  };
}

export type BroadcastViolation =
  | "EXTRA_DISCLOSED_FIELD"
  | "AUDIENCE_MISMATCH"
  | "WEAPONIZED_SIGNATURE"
  | "MALFORMED_INPUT";

export type BroadcastBuildOutcome =
  | { readonly ok: true; readonly broadcast: ScopedDefensiveBroadcast }
  | { readonly ok: false; readonly violation: BroadcastViolation; readonly detail: string };

/**
 * Build (and issue) a scoped defensive broadcast:
 * 1. the signature passes the W2-002 defensive-only validation (weaponized
 *    payloads rejected);
 * 2. the view carries ONLY whitelisted disclosure fields — anything else is
 *    a typed violation (adversarial input is untyped by nature);
 * 3. the audience must be exactly the computed audience.
 */
export function buildScopedDefensiveBroadcast(input: {
  readonly broadcastId: string;
  readonly scope: SecurityBroadcastScope;
  readonly audience: BroadcastAudience;
  readonly signature: ThreatSignature;
  readonly issuedAt: string;
}): BroadcastBuildOutcome {
  let base: DefensiveSecurityBroadcast;
  try {
    base = issueDefensiveBroadcast({
      broadcastId: input.broadcastId,
      signature: input.signature,
      audienceRefs: input.audience.audienceRefs,
      issuedAt: input.issuedAt,
    });
  } catch (error) {
    // The W2-002 defensive-only law THROWS on weaponized signatures; the
    // scoped builder surfaces it as a typed violation instead.
    return {
      ok: false,
      violation: "WEAPONIZED_SIGNATURE",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const disclosed: Record<string, unknown> = {
    THREAT_CLASS: input.scope.threatClass,
    DEFENSIVE_INDICATORS: base.signature.indicators.map((entry) => ({
      indicatorKind: entry.indicatorKind,
      value: entry.value,
    })),
    MITIGATIONS: base.signature.mitigations.map((entry) => ({
      mitigationKind: entry.mitigationKind,
      guidance: entry.guidance,
    })),
    AFFECTED_COUNT: input.scope.affectedPrincipalRefs.length,
  };
  if (input.scope.opaqueSubjectRefs !== undefined && input.scope.opaqueSubjectRefs.length > 0) {
    disclosed.OPAQUE_SUBJECT_REFS = [...input.scope.opaqueSubjectRefs].sort();
  }

  for (const field of Object.keys(disclosed)) {
    if (!SECURITY_BROADCAST_DISCLOSURE_FIELDS.includes(field)) {
      return {
        ok: false,
        violation: "EXTRA_DISCLOSED_FIELD",
        detail: `field "${field}" is not in the security-broadcast disclosure contract`,
      };
    }
  }
  if (base.audienceRefs.length !== input.audience.audienceRefs.length) {
    return {
      ok: false,
      violation: "AUDIENCE_MISMATCH",
      detail: "issued audience does not match the computed scoped audience",
    };
  }

  const broadcast: ScopedDefensiveBroadcast = {
    ...base,
    disclosed,
    disclosure: {
      policyId: SECURITY_BROADCAST_DISCLOSURE_POLICY_ID,
      allowedFields: SECURITY_BROADCAST_DISCLOSURE_FIELDS,
    },
  };
  return { ok: true, broadcast };
}

/**
 * Adversarial observer over the broadcast channel: an observer holding
 * every broadcast view reconstructs which raw buyer-intent facts? Uses the
 * W2-003 coordination-privacy observer model directly — reconstructions
 * beyond the coordination contract's explicit disclosures are violations.
 */
export function observeBroadcastChannel(input: {
  readonly broadcasts: readonly ScopedDefensiveBroadcast[];
  readonly sourceIntents: readonly BuyerCommerceIntent[];
  /** Raw-intent field paths the coordination contract explicitly discloses. */
  readonly permittedRawFieldPaths: readonly string[];
}): ObserverReconstruction {
  const views: CoordinationDisclosureView[] = input.broadcasts.map((broadcast) => ({
    // The observer model is recipient-agnostic: PLATFORM models the fully
    // exposed channel — the worst case an eavesdropper could ever see.
    coordinationId: broadcast.broadcastId,
    recipientKind: "PLATFORM",
    disclosed: broadcast.disclosed,
  }));
  return adversarialReconstruction({
    views,
    sourceIntents: input.sourceIntents,
    permittedRawFieldPaths: input.permittedRawFieldPaths,
  });
}

// ---------------------------------------------------------------------------
// Defensive signature construction (defensive-only by shape)
// ---------------------------------------------------------------------------

const STANDARD_MITIGATIONS: readonly ThreatMitigation[] = [
  {
    mitigationKind: "verification-step",
    guidance: "verify the affected evidence chain before any consequential action",
  },
  {
    mitigationKind: "monitoring-rule",
    guidance: "monitor the affected principals for recurrence of the correlated pattern",
  },
];

/**
 * Construct a defensive threat signature for a classified threat: defensive
 * behavioral indicators + standard mitigations — never weaponized payloads.
 */
export function defensiveSignatureFor(input: {
  readonly signatureId: string;
  readonly threatClass: SecurityThreatClass;
  readonly indicators?: readonly ThreatIndicator[];
  readonly mitigations?: readonly {
    readonly mitigationKind: MitigationKind;
    readonly guidance: string;
  }[];
  readonly publishedAt: string;
}): ThreatSignature {
  const indicators: readonly ThreatIndicator[] = input.indicators ?? [
    { indicatorKind: "behavioral-pattern", value: `defensive:threat-class:${input.threatClass}` },
    { indicatorKind: "provenance-marker", value: "signature:unicom:immune-system" },
  ];
  return {
    signatureId: input.signatureId,
    threatClass: input.threatClass,
    indicators,
    mitigations: input.mitigations ?? STANDARD_MITIGATIONS,
    publishedAt: input.publishedAt,
  };
}
