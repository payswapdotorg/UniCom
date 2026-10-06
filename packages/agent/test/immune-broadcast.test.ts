import { describe, expect, it } from "vitest";
import {
  buildScopedDefensiveBroadcast,
  computeBroadcastAudience,
  defensiveSignatureFor,
  observeBroadcastChannel,
  SECURITY_BROADCAST_DISCLOSURE_FIELDS,
  type PrincipalRef,
  type ScopedDefensiveBroadcast,
} from "../src/index.js";
import {
  AT,
  buyerIntent,
  BUYER_1,
  BUYER_2,
  BUYER_3,
  MERCHANT_1,
  PLATFORM,
} from "./w2-004-support.js";

/**
 * Acceptance scenario 7 — Broadcast discipline: a defensive broadcast
 * reaches EXACTLY the affected capability-scoped principals; an adversarial
 * observer of the broadcast channel reconstructs no more intent information
 * than the coordination contract explicitly discloses.
 */

const REVIEW_CAPABILITY = "capability:review.post";

const AFFECTED: readonly PrincipalRef[] = [
  { principalId: "user:ring:1", kind: "user" },
  { principalId: "user:ring:2", kind: "user" },
];
const CAPABILITY_HOLDERS: readonly PrincipalRef[] = [
  MERCHANT_1,
  { principalId: "agent:moderator:1", kind: "agent" },
];

function scopedBroadcastFixture(input?: { opaqueSubjectRefs?: readonly string[] }) {
  const scope = {
    threatClass: "REVIEW_RING" as const,
    affectedPrincipalRefs: AFFECTED,
    capabilityDefinitionId: REVIEW_CAPABILITY,
    ...(input?.opaqueSubjectRefs ? { opaqueSubjectRefs: input.opaqueSubjectRefs } : {}),
  };
  const audience = computeBroadcastAudience({ scope, capabilityHolders: CAPABILITY_HOLDERS });
  const built = buildScopedDefensiveBroadcast({
    broadcastId: "broadcast:ring:1",
    scope,
    audience,
    signature: defensiveSignatureFor({
      signatureId: "signature:ring:1",
      threatClass: "REVIEW_RING",
      publishedAt: AT,
    }),
    issuedAt: AT,
  });
  return { scope, audience, built };
}

describe("scenario 7 — capability-scoped audience discipline", () => {
  it("the audience is exactly affected principals ∪ capability holders — nothing wider", () => {
    const { audience } = scopedBroadcastFixture();
    expect(audience.audienceRefs.map((ref) => ref.principalId).sort()).toEqual([
      "agent:moderator:1",
      "merchant:1",
      "user:ring:1",
      "user:ring:2",
    ]);
    // Unrelated principals are NOT in the audience.
    for (const unrelated of [BUYER_1.principalId, BUYER_2.principalId, "user:honest:1"]) {
      expect(audience.audienceRefs.some((ref) => ref.principalId === unrelated)).toBe(false);
    }
  });

  it("the broadcast carries only whitelisted disclosure fields (minimum necessary)", () => {
    const { built } = scopedBroadcastFixture();
    expect(built.ok).toBe(true);
    if (built.ok) {
      for (const field of Object.keys(built.broadcast.disclosed)) {
        expect(SECURITY_BROADCAST_DISCLOSURE_FIELDS).toContain(field);
      }
      expect(built.broadcast.disclosure.policyId).toBe("security-broadcast-minimum-necessary-v1");
      // Defensive-only content: threat class + indicators + mitigations + count.
      expect(built.broadcast.disclosed.THREAT_CLASS).toBe("REVIEW_RING");
      expect(built.broadcast.disclosed.AFFECTED_COUNT).toBe(2);
      expect(Array.isArray(built.broadcast.disclosed.DEFENSIVE_INDICATORS)).toBe(true);
      expect(Array.isArray(built.broadcast.disclosed.MITIGATIONS)).toBe(true);
    }
  });

  it("a weaponized signature is rejected before issue (defensive-only law)", () => {
    const { scope, audience } = scopedBroadcastFixture();
    const built = buildScopedDefensiveBroadcast({
      broadcastId: "broadcast:weaponized",
      scope,
      audience,
      signature: {
        signatureId: "signature:weaponized",
        threatClass: "REVIEW_RING",
        indicators: [{ indicatorKind: "content-fingerprint", value: "<script>alert(1)</script>" }],
        mitigations: [{ mitigationKind: "policy-rule", guidance: "reject" }],
        publishedAt: AT,
      },
      issuedAt: AT,
    });
    expect(built.ok).toBe(false);
  });
});

describe("scenario 7 — adversarial observer of the broadcast channel", () => {
  const intents = [
    buyerIntent("intent:1", BUYER_1, "product:camera:1"),
    buyerIntent("intent:2", BUYER_2, "product:lens:1"),
    buyerIntent("intent:3", BUYER_3, "product:tripod:1"),
  ];
  /** The coordination contract's explicitly disclosed raw-intent paths. */
  const PERMITTED_PATHS = ["desired"];

  it("an observer holding every broadcast view reconstructs NOTHING beyond the explicit coordination contract", () => {
    // The broadcast carries an opaque subject ref that IS uniquely bound to
    // intent 3's disclosed "desired" field — the contract discloses it.
    const { built } = scopedBroadcastFixture({ opaqueSubjectRefs: ["product:tripod:1"] });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const reconstruction = observeBroadcastChannel({
      broadcasts: [built.broadcast],
      sourceIntents: intents,
      permittedRawFieldPaths: PERMITTED_PATHS,
    });
    // ZERO attributions beyond the contract's explicit disclosures.
    expect(reconstruction.attributions).toEqual([]);
    // What the observer CAN see is the explicitly disclosed opaque subject
    // ref (permitted observation — the contract discloses it).
    expect(
      reconstruction.permittedObservations.some(
        (observation) =>
          observation.fieldPath === "desired" && observation.value === "product:tripod:1",
      ),
    ).toBe(true);
    // No identity material (intent ids / principal ids) is ever attributed
    // beyond the contract — the attribution list is EMPTY; the permitted
    // observation is the contract's own explicit disclosure of the opaque
    // subject ref, reported under the observer model's analysis lens.
    expect(reconstruction.attributions).toHaveLength(0);
  });

  it("the observer check is REAL: a smuggled buyer identity in a broadcast view is caught", () => {
    // Negative control — a hostile channel carrying a buyer principal id
    // (identity material) IS attributed by the same observer model.
    const leaked: ScopedDefensiveBroadcast = {
      broadcastId: "broadcast:leaky",
      signature: defensiveSignatureFor({
        signatureId: "signature:leaky",
        threatClass: "REVIEW_RING",
        publishedAt: AT,
      }),
      audienceRefs: AFFECTED,
      issuedAt: AT,
      disclosed: { THREAT_CLASS: "REVIEW_RING", LEAKED_BUYER_ID: "user:buyer:1" },
      disclosure: {
        policyId: "security-broadcast-minimum-necessary-v1",
        allowedFields: SECURITY_BROADCAST_DISCLOSURE_FIELDS,
      },
    };
    const reconstruction = observeBroadcastChannel({
      broadcasts: [leaked],
      sourceIntents: intents,
      permittedRawFieldPaths: PERMITTED_PATHS,
    });
    // The smuggled principal id is identity material → every raw fact of
    // intent 1 becomes attributable (IDENTITY_MATERIAL_PRESENT).
    expect(reconstruction.attributions.length).toBeGreaterThan(0);
    expect(
      reconstruction.attributions.some(
        (attribution) => attribution.how === "IDENTITY_MATERIAL_PRESENT",
      ),
    ).toBe(true);
  });

  it("multiple broadcasts over one channel still leak nothing beyond the contract", () => {
    const first = scopedBroadcastFixture({ opaqueSubjectRefs: ["product:camera:1"] });
    const secondScope = {
      threatClass: "FALSE_NON_DELIVERY" as const,
      affectedPrincipalRefs: [{ principalId: "user:buyer:2", kind: "user" as const }],
      capabilityDefinitionId: REVIEW_CAPABILITY,
    };
    const secondAudience = computeBroadcastAudience({
      scope: secondScope,
      capabilityHolders: CAPABILITY_HOLDERS,
    });
    const second = buildScopedDefensiveBroadcast({
      broadcastId: "broadcast:claim:1",
      scope: secondScope,
      audience: secondAudience,
      signature: defensiveSignatureFor({
        signatureId: "signature:claim:1",
        threatClass: "FALSE_NON_DELIVERY",
        publishedAt: AT,
      }),
      issuedAt: AT,
    });
    if (!first.built.ok || !second.ok) throw new Error("fixture broadcasts must build");
    const reconstruction = observeBroadcastChannel({
      broadcasts: [first.built.broadcast, second.broadcast],
      sourceIntents: intents,
      permittedRawFieldPaths: PERMITTED_PATHS,
    });
    expect(reconstruction.attributions).toEqual([]);
  });
});

void PLATFORM;
