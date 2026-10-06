/**
 * Runtime test — trust-signal consumption in the live-commerce UX contract
 * (W3-004 acceptance scenario 7): W2-lane trust signals surface as OPAQUE
 * BRANDED REFERENCES ONLY (`TrustSignalRef`) — the announcement carries
 * them, the surface view passes them through UNTOUCHED, and this lane
 * implements ZERO trust semantics: no scores, no levels, no ratings, no
 * derivations (structural scan asserted).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLiveSessionRuntime } from "../src/runtime/surfaces/live-session";
import { asPrincipalRef } from "../src/runtime/ids";
import { utc } from "./branded";
import type { TrustSignalRef } from "../src/contract";

const STREAM = "stream-trust-opacity-1" as never;
const SELLER = asPrincipalRef("principal-seller-trust-1");

/** Branded trust references exactly as the trust lane hands them over. */
const TRUST_REFS: readonly TrustSignalRef[] = [
  "trust-signal-ref-verified-seller-7f3a" as TrustSignalRef,
  "trust-signal-ref-transaction-proof-p2-91c4" as TrustSignalRef,
];

describe("Live-commerce trust-signal opacity — scenario 7", () => {
  it("trust signals surface in the UX contract as OPAQUE branded references, passed through untouched", () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: () => "2026-10-07T17:00:00Z" });
    const announcement = runtime.announce({
      title: "Collector card night",
      scheduledFor: utc("2026-10-07T17:30:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    // The announcement surfaces the references EXACTLY as handed over —
    // same values, same order, nothing derived, nothing interpreted.
    expect(announcement.trustSignalRefs).toEqual(TRUST_REFS);
    expect(announcement.trustSignalRefs[0]).toBe("trust-signal-ref-verified-seller-7f3a" as TrustSignalRef);

    runtime.activate();
    runtime.ingestEvent({ eventId: "evt-1", occurredAt: utc("2026-10-07T17:31:00Z"), kind: "listing", untrustedRawText: "Lot 1" });

    const view = runtime.surfaceView();
    // The surface view passes the SAME references through UNTOUCHED.
    expect(view.trustSignalRefs).toEqual(TRUST_REFS);
    expect(view.trustSignalRefs).toHaveLength(2);
    // Opaque branded refs are plain strings on the wire — nothing structural.
    expect(typeof view.trustSignalRefs[0]).toBe("string");
  });

  it("the live-commerce UX contract implements ZERO trust semantics (structural scan)", () => {
    const files = [
      fileURLToPath(new URL("../src/surfaces/live-commerce-ux.ts", import.meta.url)),
      fileURLToPath(new URL("../src/runtime/surfaces/live-session.ts", import.meta.url)),
    ];
    // Any trust-semantics vocabulary (scores, levels, ratings, verdicts)
    // would violate the lane law: this lane renders references, it never
    // interprets them.
    const forbidden = /\b(trustScore|trustLevel|trustRating|trustVerdict|trustConfidence|riskLevel|badgeLevel|verificationStatus|trustRank)\b/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const offenders = source.match(forbidden);
      expect(offenders, `${file} must not implement trust semantics`).toBeNull();
    }
    // The ONLY trust vocabulary in the UX contract is the opaque ref type.
    const contractSource = readFileSync(files[0] as string, "utf8");
    expect(contractSource).toContain("TrustSignalRef");
    expect(contractSource).toContain("OPAQUE BRANDED REFERENCES");
  });
});
