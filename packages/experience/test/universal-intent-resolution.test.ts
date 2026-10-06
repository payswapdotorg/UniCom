/**
 * Runtime test — the universal intent surface (W3-005): typed command path,
 * deterministic resolution, UNKNOWN preserved on no-match.
 *
 * The command CONTRACT is typed end-to-end (verb, target, resolution);
 * there is no freeform command dispatch anywhere. The user's utterance is
 * inert data matched against the registered typed catalog; a non-match is
 * UNKNOWN, never an error (INVARIANT 10).
 */

import { describe, expect, it } from "vitest";
import type { UniversalIntentSurfaceInput } from "../src/navigation/universal-intent";
import {
  buildUniversalIntentCommands,
  resolveUniversalIntent,
  universalIntentCommandsForFeature,
} from "../src/runtime/surfaces/universal-intent";
import { utc, principalRef } from "./branded";
import type { Equal, Expect } from "./type-helpers";

const BUYER = principalRef("principal-intent-buyer-1");

const input = (utteranceText: string): UniversalIntentSurfaceInput => ({
  utteranceText,
  submittedAt: utc("2026-10-08T09:00:00Z"),
  submittedBy: BUYER,
});

// Compile-time: the typed input carries no freeform command field.
export type AssertTypedInput = Expect<
  Equal<keyof UniversalIntentSurfaceInput, "utteranceText" | "submittedAt" | "submittedBy">
>;

describe("universal intent typed command surface", () => {
  it("resolves an EXACT alias utterance to typed commands (feature + surface targeting)", () => {
    const result = resolveUniversalIntent(input("find me"));
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.matches.length).toBeGreaterThan(0);
    for (const match of result.matches) {
      expect(match.matchKind).toBe("exact-alias");
      expect(match.command.addressedByAlias).toBe("find me");
      expect(match.command.verb).toBe("find"); // buyer-intent-canvas → buy group → find
      expect(match.command.surfaceId).toBe("buyer-intent-canvas");
    }
    // The catalog addresses both the surface itself and its features.
    const featureTargeted = result.matches.some((match) => match.command.target.kind === "feature");
    const surfaceTargeted = result.matches.some((match) => match.command.target.kind === "surface");
    expect(featureTargeted).toBe(true);
    expect(surfaceTargeted).toBe(true);
  });

  it("resolves an alias CONTAINED in a longer utterance (word-boundary, case-insensitive)", () => {
    const result = resolveUniversalIntent(input("Hey UNiCOM, can you Find Me a sturdy ladder please"));
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.matches.some((match) => match.command.surfaceId === "buyer-intent-canvas")).toBe(true);
    expect(result.matches.every((match) => match.matchKind === "alias-in-utterance")).toBe(true);
  });

  it("resolves merchant phrasings to the operate/connections surfaces with typed verbs", () => {
    const result = resolveUniversalIntent(input("please show orders for today"));
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.matches.some((match) => match.command.surfaceId === "operate-orders")).toBe(true);
    expect(result.matches.some((match) => match.command.verb === "show")).toBe(true);
  });

  it("resolves connection phrasings with the typed connect verb", () => {
    const result = resolveUniversalIntent(input("I want to connect my POS"));
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    const pos = result.matches.find((match) => match.command.surfaceId === "local-edge-setup");
    expect(pos).toBeDefined();
    expect(pos?.command.verb).toBe("connect");
  });

  it("a NON-MATCHING utterance resolves to UNKNOWN — never an error, never a guess", () => {
    const result = resolveUniversalIntent(input("zzz qqq vvv nothing recognizable here"));
    expect(result.status).toBe("no-match-unknown");
    if (result.status === "no-match-unknown") {
      expect(result.note).toContain("UNKNOWN");
    }
  });

  it("an EMPTY utterance resolves to UNKNOWN (nothing to resolve yet)", () => {
    const result = resolveUniversalIntent(input("   "));
    expect(result.status).toBe("no-match-unknown");
  });

  it("resolution is DETERMINISTIC: identical inputs resolve identically", () => {
    const first = resolveUniversalIntent(input("how is my store doing"));
    const second = resolveUniversalIntent(input("how is my store doing"));
    expect(second).toEqual(first);
  });

  it("partial-word alias containment does NOT match (no substring false positives)", () => {
    // "finding" must not trigger the "find me" alias (word boundary required).
    const result = resolveUniversalIntent(input("I am finding my keys under the sofa"));
    const falsePositive =
      result.status === "resolved" &&
      result.matches.some((match) => match.command.addressedByAlias === "find me");
    expect(falsePositive).toBe(false);
  });

  it("every feature is addressable through typed commands for that feature", () => {
    expect(universalIntentCommandsForFeature("user-group-buying").length).toBeGreaterThan(0);
    expect(universalIntentCommandsForFeature("autonomous-store").length).toBeGreaterThan(0);
    expect(universalIntentCommandsForFeature("live-streams").length).toBeGreaterThan(0);
    expect(universalIntentCommandsForFeature("security-pipeline-signal-to-learning").length).toBeGreaterThan(0);
  });

  it("the typed catalog only contains typed verbs from the frozen vocabulary", () => {
    const verbs = new Set(buildUniversalIntentCommands().map((command) => command.verb));
    expect([...verbs].sort()).toEqual(
      ["configure", "connect", "create", "find", "learn", "review", "run", "show"].sort(),
    );
  });
});
