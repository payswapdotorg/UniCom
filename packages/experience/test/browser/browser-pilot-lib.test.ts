import { describe, expect, it } from "vitest";
import {
  FAMILY_VISIBLE_SIGNS,
  FIRM_PROFILES,
  JOURNEY_FAMILY_IDS,
  OUTCOMES,
  PROTOCOL_REFS,
  classifyFamilyDiscovery,
  emptyGuiOnlyProof,
  parseArgs,
  reconcileDenominator,
  scanTerms,
  scrubConsoleLine,
  signsFound,
} from "./browser-pilot-lib.mjs";

describe("W1-010 journey family registry", () => {
  it("carries exactly the 19 §10 families, unique", () => {
    expect(JOURNEY_FAMILY_IDS).toHaveLength(19);
    expect(new Set(JOURNEY_FAMILY_IDS).size).toBe(19);
  });

  it("keeps registry, protocol refs and visible signs cross-consistent", () => {
    for (const familyId of JOURNEY_FAMILY_IDS) {
      expect(PROTOCOL_REFS[familyId], `protocol ref for ${familyId}`).toMatch(/^§10\.\d+$/);
      expect(FAMILY_VISIBLE_SIGNS[familyId], `visible signs for ${familyId}`).toBeDefined();
      expect(FAMILY_VISIBLE_SIGNS[familyId].length, `signs for ${familyId}`).toBeGreaterThan(0);
    }
    expect(Object.keys(PROTOCOL_REFS)).toHaveLength(19);
    expect(Object.keys(FAMILY_VISIBLE_SIGNS)).toHaveLength(19);
  });

  it("keeps the outcome enum closed", () => {
    expect([...OUTCOMES]).toEqual(["pass", "fail", "blocked", "absent", "unknown"]);
    expect([...FIRM_PROFILES]).toEqual(["small", "medium", "large"]);
  });
});

describe("W1-010 visible-sign scanning", () => {
  it("matches case-insensitively with word boundaries", () => {
    const scan = scanTerms("Welcome to ZCode — Storefront and Checkout are missing", ["storefront", "checkout"]);
    expect(scan.storefront.present).toBe(true);
    expect(scan.checkout.present).toBe(true);
  });

  it("does not substring-match inside other words", () => {
    const scan = scanTerms("a border around the card", ["order", "b2b", "pos"]);
    expect(scan.order.present).toBe(false);
    expect(scan.b2b.present).toBe(false);
    expect(scan.pos.present).toBe(false);
  });

  it("supports multi-word and regex-metacharacter terms", () => {
    const scan = scanTerms("start a Group Buy proposal now (multi-hop)", ["group buy proposal", "multi-hop"]);
    expect(scan["group buy proposal"].present).toBe(true);
    expect(scan["multi-hop"].present).toBe(true);
  });

  it("reports absence honestly for commerce-free agent surfaces", () => {
    const landingText = "Welcome to ZCode\nConnect your account to start using ZCode\nConnect to Z.ai\nUse API key";
    const allSigns = Object.values(FAMILY_VISIBLE_SIGNS).flat();
    const scan = scanTerms(landingText, allSigns);
    expect(Object.values(scan).every((entry) => !entry.present)).toBe(true);
    expect(signsFound(scan)).toBe(false);
  });
});

describe("W1-010 family classification", () => {
  it("classifies absent when surfaces rendered but no sign found", () => {
    const scan = scanTerms("Welcome to ZCode — connect your account", FAMILY_VISIBLE_SIGNS["gui-feature-discoverability"]);
    expect(classifyFamilyDiscovery({ signScan: scan, surfacesRendered: true })).toBe("absent");
  });

  it("classifies fail when a visible sign exists (discoverable, completion out of pilot scope)", () => {
    const scan = scanTerms("Open your Storefront", ["storefront"]);
    expect(classifyFamilyDiscovery({ signScan: scan, surfacesRendered: true })).toBe("fail");
  });

  it("classifies blocked when no surface could be rendered at all", () => {
    const scan = scanTerms("", FAMILY_VISIBLE_SIGNS["merchant-commerce-lifecycle"]);
    expect(classifyFamilyDiscovery({ signScan: scan, surfacesRendered: false })).toBe("blocked");
  });
});

describe("W1-010 console scrubbing", () => {
  it("redacts credential-shaped fragments but keeps the key name", () => {
    expect(scrubConsoleLine("fetch failed with Bearer abc.def.ghi")).toBe(
      "fetch failed with Bearer [REDACTED]",
    );
    expect(scrubConsoleLine('POST /x {"token": "sekret"}')).toContain("token [REDACTED]");
    expect(scrubConsoleLine("api_key=AKIA1234567890")).toBe("api_key [REDACTED]");
  });

  it("redacts credential-shaped fragments even without an explicit separator (predecessor regression)", () => {
    // the inherited draft let these slip through UNREDACTED — pinned here.
    expect(scrubConsoleLine("Authorization: Bearer eyJhbGci.eyJzdWIi.signedpayload")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
    expect(scrubConsoleLine("api key sdk-example-token-9911aabb rejected")).toBe(
      "api key [REDACTED] rejected",
    );
    expect(scrubConsoleLine("connect with api-key sk-proj-abcdef123456")).toBe(
      "connect with api-key [REDACTED]",
    );
  });

  it("keeps ordinary keyword phrases that are not credentials intact", () => {
    expect(scrubConsoleLine("token management screen loaded")).toBe("token management screen loaded");
    expect(scrubConsoleLine("password reset link sent to the user")).toBe(
      "password reset link sent to the user",
    );
  });

  it("redacts emails and long base64 blobs", () => {
    expect(scrubConsoleLine("user jane.doe@example.com logged in")).toContain("[REDACTED]");
    const blob = "A".repeat(120);
    expect(scrubConsoleLine(`payload ${blob}`)).not.toContain(blob);
  });

  it("leaves clean evidence lines intact", () => {
    const line = "[vite] connected. [ui] [Root] background OAuth session recovery started";
    expect(scrubConsoleLine(line)).toBe(line);
  });
});

describe("W1-010 denominator reconciliation", () => {
  it("accepts a zero-drift denominator", () => {
    const result = reconcileDenominator({
      planned: 57,
      executed: 57,
      blocked: 0,
      skipped: 0,
      byOutcome: { pass: 0, fail: 0, blocked: 0, absent: 57, unknown: 0 },
    });
    expect(result.zeroDrift).toBe(true);
    expect(result.reconciliation).toContain("57 = 57 + 0 + 0");
  });

  it("rejects drift between planned and executed+blocked+skipped", () => {
    const result = reconcileDenominator({ planned: 60, executed: 57, blocked: 0, skipped: 0 });
    expect(result.zeroDrift).toBe(false);
    expect(result.reconciliation).toContain("DRIFT");
  });

  it("rejects drift between executed and the outcome sum", () => {
    const result = reconcileDenominator({
      planned: 10,
      executed: 10,
      blocked: 0,
      skipped: 0,
      byOutcome: { absent: 9, fail: 0 },
    });
    expect(result.zeroDrift).toBe(false);
  });
});

describe("W1-010 GUI-only proof invariants", () => {
  it("produces the hard-boolean v1 invariants", () => {
    const proof = emptyGuiOnlyProof();
    expect(proof.deepLinkUsedForDiscovery).toBe(false);
    expect(proof.violations).toEqual([]);
    expect(proof.instrumentationOnly).toBe(true);
    expect(proof.directApiCallsDuringJourney).toEqual([]);
  });
});

describe("W1-010 runner CLI parsing", () => {
  it("parses the start-env mode with output paths", () => {
    const parsed = parseArgs(["--start-env", "--out", "/tmp/ev", "--manifest", "/tmp/m.json"]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.startEnv).toBe(true);
    expect(parsed.outDir).toBe("/tmp/ev");
    expect(parsed.manifestPath).toBe("/tmp/m.json");
  });

  it("parses the external base-url mode", () => {
    const parsed = parseArgs(["--base-url", "http://localhost:5173"]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.baseUrl).toBe("http://localhost:5173");
    expect(parsed.startEnv).toBe(false);
  });

  it("recognizes help and dry-run without requiring an env mode", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
    expect(parseArgs(["--help"]).errors).toEqual([]);
  });

  it("rejects unknown args, missing values and conflicting modes", () => {
    expect(parseArgs(["--nope"]).errors[0]).toContain("unknown argument");
    expect(parseArgs(["--base-url"]).errors[0]).toContain("requires a value");
    expect(parseArgs(["--start-env", "--base-url", "http://x"]).errors[0]).toContain("mutually exclusive");
    expect(parseArgs([]).errors[0]).toContain("--start-env or --base-url");
  });
});
