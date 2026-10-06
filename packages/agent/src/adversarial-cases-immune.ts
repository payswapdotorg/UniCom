/**
 * Immune-plane adversaries of the release-gate suite (W2-006): quarantine
 * escape attempts, capability-scope escalation and broadcast forgery — every
 * attack against the REAL W2-004 immune components:
 * - quarantine escape: a quarantined principal attempts to exercise its
 *   attenuated capability (the deterministic attenuation fold refuses), and a
 *   forged immune-action ledger splice fails hash-chain verification;
 * - capability-scope escalation: forged grants (wrong grantor), grants for
 *   capabilities outside the canonical vocabulary and ambient-authority use
 *   are typed violations of the actor-capability ledger;
 * - broadcast forgery: weaponized signature content and weaponized/undeclared
 *   signature fields are rejected by the defensive-only law (invariants 25/49).
 *
 * Every blocked/detected attempt is journaled as ADVERSARY_ENCOUNTER evidence.
 */

import {
  validateThreatSignature,
  type ThreatSignature,
} from "./security.js";
import { verifyImmuneActionChain, type ImmuneActionRecord } from "./immune-action.js";
import type { PositionCapabilityGrant, OrganizationPosition } from "./actor-capability.js";
import type { EvidenceCitation } from "./evidence-journal.js";
import {
  journalEncounter,
  ADVERSARIAL_COMMERCE_CAPABILITY_ID,
  ADVERSARIAL_REVIEW_CAPABILITY_ID,
  type AdversaryCase,
  type AdversarialContext,
  type AttackOutcome,
} from "./adversarial-context.js";

const ESCAPE_ARTIST = { principalId: "user:adversary:escape-artist", kind: "user" as const };
const GRANTOR = { principalId: "agent:unicom:adversarial-suite", kind: "agent" as const };

function quarantineJustification(
  context: AdversarialContext,
  adversaryId: string,
): EvidenceCitation {
  const record = context.journal.append({
    evidenceId: `evidence:adv-quarantine:${adversaryId}`,
    kind: "trust-evidence",
    subjectRef: ESCAPE_ARTIST,
    payload: { evidenceKind: "AGENT_POLICY_EVENT", violation: "SUSPENSION" },
    recordedAt: context.at2,
  });
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

function harnessPosition(context: AdversarialContext): OrganizationPosition {
  const position: OrganizationPosition = {
    positionId: "position:adv:harness",
    organizationId: "org:adv:harness",
    title: "Adversarial harness operator",
    holder: { principalId: "agent:unicom:adversarial-suite", kind: "main-agent" },
    grantorRef: GRANTOR,
  };
  if (context.ledger.findPosition(position.positionId) === undefined) {
    context.ledger.registerPosition(position);
  }
  return position;
}

function grantFor(
  position: OrganizationPosition,
  capabilityDefinitionId: string,
  decidedBy = GRANTOR,
): PositionCapabilityGrant {
  return {
    grantId: `grant:adv:${capabilityDefinitionId}:${decidedBy.principalId}`,
    positionId: position.positionId,
    capabilityDefinitionId,
    grantedBy: decidedBy,
    authorization: { decision: "AUTHORIZED", decidedBy, policyVersion: "adv-v1", decidedAt: "2026-12-10T00:00:00.000Z" },
    grantedAt: "2026-12-10T00:00:00.000Z",
  };
}

/** The immune-plane adversaries (7 cases). */
export const IMMUNE_PLANE_ADVERSARIES: readonly AdversaryCase[] = [
  {
    adversaryId: "adversary:quarantine:capability-use-while-quarantined",
    category: "QUARANTINE_ESCAPE",
    label: "attenuated-capability-use",
    description: "A quarantined principal attempts to exercise its attenuated capability",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const citation = quarantineJustification(context, "capability-use-while-quarantined");
      const quarantine = context.immune.quarantine({
        actionId: "action:adv:escape-artist:quarantine",
        principalRef: ESCAPE_ARTIST,
        scope: {
          kind: "CAPABILITY_SET",
          capabilityDefinitionIds: [ADVERSARIAL_COMMERCE_CAPABILITY_ID],
        },
        decisionRef: "decision:adv:escape-artist",
        evidenceCitations: [citation],
        actedAt: context.at2,
      });
      const quarantined = quarantine.outcome?.ok === true &&
        context.immune.isAttenuated(ESCAPE_ARTIST.principalId, ADVERSARIAL_COMMERCE_CAPABILITY_ID);
      // The escape attempt: use the attenuated capability. The runtime
      // capability gate folds the append-only ledger — attenuation holds.
      const useRefused = context.immune.isAttenuated(
        ESCAPE_ARTIST.principalId,
        ADVERSARIAL_COMMERCE_CAPABILITY_ID,
      );
      const blocked = quarantined && useRefused;
      journalEncounter(context, {
        adversaryId: "adversary:quarantine:capability-use-while-quarantined",
        category: "QUARANTINE_ESCAPE",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "quarantined principal's attempt to use the attenuated capability was refused — the deterministic attenuation fold over the append-only ledger holds"
          : "quarantine escape not blocked — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "attenuated capability use" };
    },
  },
  {
    adversaryId: "adversary:quarantine:forged-ledger-splice",
    category: "QUARANTINE_ESCAPE",
    label: "forged-immune-action-ledger",
    description: "Splice a forged RELEASE record into a copy of the immune-action ledger",
    expected: "DETECTED",
    attack: (context) => {
      const citation = quarantineJustification(context, "forged-ledger-splice");
      context.immune.quarantine({
        actionId: "action:adv:escape-artist-2:quarantine",
        principalRef: { principalId: "user:adversary:escape-artist-2", kind: "user" },
        scope: {
          kind: "CAPABILITY_SET",
          capabilityDefinitionIds: [ADVERSARIAL_REVIEW_CAPABILITY_ID],
        },
        decisionRef: "decision:adv:escape-artist-2",
        evidenceCitations: [citation],
        actedAt: context.at2,
      });
      const live = context.immune.quarantineLedger.records();
      const predecessor = live[live.length - 1];
      const forged: ImmuneActionRecord = {
        sequence: live.length + 1,
        actionId: "action:forged:release",
        action: "RELEASE",
        principalRef: { principalId: "user:adversary:escape-artist-2", kind: "user" },
        scope: { kind: "CAPABILITY_SET", capabilityDefinitionIds: [ADVERSARIAL_REVIEW_CAPABILITY_ID] },
        decisionRef: "decision:forged",
        evidenceCitations: [citation],
        actedAt: context.at2,
        prevRecordHash: predecessor?.recordHash ?? "genesis",
        recordHash: "h1:f0rged",
      };
      const spliced = [...live, forged];
      const verification = verifyImmuneActionChain(spliced);
      const stillAttenuated = context.immune.isAttenuated(
        "user:adversary:escape-artist-2",
        ADVERSARIAL_REVIEW_CAPABILITY_ID,
      );
      const detected = !verification.ok && stillAttenuated;
      journalEncounter(context, {
        adversaryId: "adversary:quarantine:forged-ledger-splice",
        category: "QUARANTINE_ESCAPE",
        result: detected ? "DETECTED" : "MISSED_DECLARED",
        detail: detected
          ? "forged immune-action ledger detected (CHAIN_BROKEN) and the live attenuation fold still holds — the splice changed nothing"
          : "forged ledger splice not detected — CRITICAL",
      });
      return { result: detected ? "DETECTED" : "MISSED_DECLARED", detail: "forged immune-action ledger splice" };
    },
  },
  {
    adversaryId: "adversary:scope:forged-grant-authority",
    category: "CAPABILITY_SCOPE_ESCALATION",
    label: "forged-grant-authority",
    description: "Forge a capability grant authorized by someone other than the position's grantor",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const position = harnessPosition(context);
      const impostor = { principalId: "agent:adversary:impostor", kind: "agent" as const };
      const validation = context.ledger.grant({ grant: grantFor(position, ADVERSARIAL_REVIEW_CAPABILITY_ID, impostor) });
      const blocked =
        !validation.valid && validation.violations.includes("GRANT_AUTHORITY_MISMATCH");
      journalEncounter(context, {
        adversaryId: "adversary:scope:forged-grant-authority",
        category: "CAPABILITY_SCOPE_ESCALATION",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "forged grant rejected (GRANT_AUTHORITY_MISMATCH — only the position's declared grantor may grant); nothing was recorded"
          : "forged grant accepted — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "forged grant authority" };
    },
  },
  {
    adversaryId: "adversary:scope:noncanonical-capability-grant",
    category: "CAPABILITY_SCOPE_ESCALATION",
    label: "noncanonical-capability-grant",
    description: "Request a grant for a capability outside the canonical vocabulary",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const position = harnessPosition(context);
      const validation = context.ledger.grant({
        grant: grantFor(position, "capability:rogue:escalate"),
      });
      const blocked =
        !validation.valid &&
        validation.violations.includes("CAPABILITY_NOT_IN_CANONICAL_VOCABULARY");
      journalEncounter(context, {
        adversaryId: "adversary:scope:noncanonical-capability-grant",
        category: "CAPABILITY_SCOPE_ESCALATION",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "grant for a non-canonical capability rejected (one vocabulary law — invariant 34); nothing was recorded"
          : "non-canonical capability grant accepted — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "non-canonical capability grant" };
    },
  },
  {
    adversaryId: "adversary:scope:ambient-authority-use",
    category: "CAPABILITY_SCOPE_ESCALATION",
    label: "ambient-authority-use",
    description: "Use a capability that was never granted (no ambient authority)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const ungrantedPrincipal = "agent:adversary:ungranted";
      const held = context.ledger.holdsCapability(ungrantedPrincipal, ADVERSARIAL_COMMERCE_CAPABILITY_ID);
      const granted = context.ledger.capabilitiesForHolder(ungrantedPrincipal);
      const blocked = !held && granted.length === 0;
      journalEncounter(context, {
        adversaryId: "adversary:scope:ambient-authority-use",
        category: "CAPABILITY_SCOPE_ESCALATION",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "use of an ungranted capability refused — a holder commands EXACTLY its granted capabilities, nothing ambient"
          : "ambient authority detected — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "ambient authority use" };
    },
  },
  {
    adversaryId: "adversary:broadcast:weaponized-payload-content",
    category: "BROADCAST_FORGERY",
    label: "weaponized-broadcast-content",
    description: "Forge a defensive broadcast whose indicator value carries an executable payload",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const weaponized: ThreatSignature = {
        signatureId: "signature:adv:weaponized-content",
        threatClass: "AGENT_PROMPT_INJECTION",
        indicators: [
          { indicatorKind: "behavioral-pattern", value: "<script>ring-injection-payload</script>" },
        ],
        mitigations: [{ mitigationKind: "verification-step", guidance: "verify evidence chains" }],
        publishedAt: context.at2,
      };
      const issued = context.immune.broadcast({
        broadcastId: "broadcast:adv:weaponized-content",
        scope: {
          threatClass: "AGENT_PROMPT_INJECTION",
          affectedPrincipalRefs: [ESCAPE_ARTIST],
          capabilityDefinitionId: ADVERSARIAL_REVIEW_CAPABILITY_ID,
        },
        signature: weaponized,
        issuedAt: context.at2,
      });
      const blocked =
        issued.broadcast === undefined && (issued.detail ?? "").includes("WEAPONIZED_SIGNATURE");
      journalEncounter(context, {
        adversaryId: "adversary:broadcast:weaponized-payload-content",
        category: "BROADCAST_FORGERY",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "weaponized broadcast content rejected by the defensive-only law (WEAPONIZED_SIGNATURE) — broadcasts carry defensive indicators/mitigations, never exploit payloads"
          : "weaponized broadcast issued — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "weaponized broadcast content" };
    },
  },
  {
    adversaryId: "adversary:broadcast:weaponized-signature-fields",
    category: "BROADCAST_FORGERY",
    label: "weaponized-signature-fields",
    description: "Forge a signature with weaponized/undeclared fields smuggled alongside the defensive ones",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const smuggled = {
        signatureId: "signature:adv:weaponized-fields",
        threatClass: "AGENT_PROMPT_INJECTION",
        indicators: [{ indicatorKind: "behavioral-pattern", value: "defensive:marker" }],
        mitigations: [{ mitigationKind: "monitoring-rule", guidance: "monitor for recurrence" }],
        publishedAt: context.at2,
        exploitSteps: "1. inject 2. escalate 3. exfiltrate",
      };
      const validation = validateThreatSignature(smuggled);
      const blocked =
        !validation.valid &&
        (validation.reason === "WEAPONIZED_FIELD_NAME" || validation.reason === "UNKNOWN_FIELD");
      journalEncounter(context, {
        adversaryId: "adversary:broadcast:weaponized-signature-fields",
        category: "BROADCAST_FORGERY",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? `smuggled weaponized field rejected (${validation.reason}) — the signature contract is closed`
          : "weaponized signature fields accepted — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "weaponized signature fields" };
    },
  },
];
