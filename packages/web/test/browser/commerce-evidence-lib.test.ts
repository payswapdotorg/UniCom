/**
 * Unit tests for the W1-011 commerce-host evidence runner's PURE logic
 * (packages/web/test/browser/commerce-evidence-lib.mjs) — the classification,
 * denominator and evidence-integrity law, testable without a browser. The
 * journey expectations are pinned against the real catalog from
 * src/commerce-host so the evidence checklist can never drift from the host.
 */
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_KIND,
  EXPLORE_GROUP_TITLES,
  JOURNEY_FAMILY_META,
  JOURNEY_IDS,
  OUTCOMES,
  READY_JOURNEYS,
  buildJourneyCoverage,
  classifyJourneyRow,
  classifyStepOutcome,
  collectEvidencePointers,
  expectedJourneyState,
  parseArgs,
  reconcileDenominator,
  scrubConsoleLine,
  tallyOutcomes,
  validateManifest,
} from "./commerce-evidence-lib.mjs";
import { COMMERCE_JOURNEY_CATALOG } from "../../src/commerce-host/contract/index.js";
import { EXPLORE_GROUPS } from "@unicom/experience";

describe("evidence lib: outcome vocabulary", () => {
  it("uses the task-law vocabulary exactly", () => {
    expect([...OUTCOMES]).toEqual(["PASS", "FAIL", "ABSENT", "BLOCKED", "UNKNOWN", "SKIPPED"]);
  });
});

describe("evidence lib: journey expectations pinned to the catalog", () => {
  it("lists all 19 catalog journeys in order", () => {
    expect([...JOURNEY_IDS]).toEqual(COMMERCE_JOURNEY_CATALOG.map((family) => family.journeyId));
  });

  it("expects ready exactly for the journeys W1-011 ships itself", () => {
    const w1Owned = COMMERCE_JOURNEY_CATALOG.filter((family) => family.owner === "W1-011").map((f) => f.journeyId);
    expect([...READY_JOURNEYS]).toEqual(w1Owned);
    for (const family of COMMERCE_JOURNEY_CATALOG) {
      expect(expectedJourneyState(family.journeyId)).toBe(family.owner === "W1-011" ? "ready" : "in-development");
    }
  });

  it("mirrors the canonical Explore taxonomy group titles", () => {
    expect([...EXPLORE_GROUP_TITLES]).toEqual(EXPLORE_GROUPS.map((group) => group.title));
  });

  it("mirrors the catalog family names and owning lanes", () => {
    for (const family of COMMERCE_JOURNEY_CATALOG) {
      const meta = JOURNEY_FAMILY_META[family.journeyId];
      const lanes = [family.owner, ...(family.sharedWith ?? [])].sort().join(" + ");
      const mirroredLanes = meta[1].split(" + ").sort().join(" + ");
      expect(meta[0]).toBe(family.familyName);
      expect(mirroredLanes).toBe(lanes);
    }
  });
});

describe("evidence lib: buildJourneyCoverage", () => {
  it("classifies all 19 journeys from the rows the browser showed", () => {
    const homeRows = JOURNEY_IDS.map((journeyId) => ({
      journeyId,
      chipKind: journeyId === "J18" || journeyId === "J19" ? "ok" : "warn",
      chipText: journeyId === "J18" || journeyId === "J19" ? "ready" : `in development · lane ${JOURNEY_FAMILY_META[journeyId][1]}`,
    }));
    const coverage = buildJourneyCoverage({ homeRows, exploreRows: homeRows });
    expect(coverage).toHaveLength(19);
    expect(coverage.every((entry) => entry.outcome === "PASS")).toBe(true);
    expect(coverage.find((entry) => entry.journeyId === "J5")?.owningLane).toBe("W2-012 + W3-015");
  });

  it("marks a journey ABSENT when its row is missing on either surface", () => {
    const rows = JOURNEY_IDS.filter((journeyId) => journeyId !== "J7").map((journeyId) => ({
      journeyId,
      chipKind: journeyId === "J18" || journeyId === "J19" ? "ok" : "warn",
      chipText: "",
    }));
    const coverage = buildJourneyCoverage({ homeRows: rows, exploreRows: rows });
    expect(coverage.find((entry) => entry.journeyId === "J7")?.outcome).toBe("ABSENT");
  });

  it("marks a journey FAIL when a chip contradicts the honest expectation", () => {
    const rows = JOURNEY_IDS.map((journeyId) => ({ journeyId, chipKind: "ok", chipText: "ready" }));
    const coverage = buildJourneyCoverage({ homeRows: rows, exploreRows: rows });
    expect(coverage.find((entry) => entry.journeyId === "J1")?.outcome).toBe("FAIL");
    expect(coverage.find((entry) => entry.journeyId === "J18")?.outcome).toBe("PASS");
  });

  it("treats an empty capture (walk never reached the host) as all-absent", () => {
    const coverage = buildJourneyCoverage({});
    expect(coverage).toHaveLength(19);
    expect(coverage.every((entry) => entry.outcome === "ABSENT")).toBe(true);
  });
});

describe("evidence lib: classifyStepOutcome", () => {
  it("PASS when rendered and every check holds", () => {
    expect(classifyStepOutcome({ rendered: true, checks: [{ name: "a", ok: true }] })).toBe("PASS");
  });

  it("FAIL when rendered but a check broke (rendered surfaces obey laws)", () => {
    expect(classifyStepOutcome({ rendered: true, checks: [{ name: "a", ok: false }] })).toBe("FAIL");
  });

  it("ABSENT when the surface did not render", () => {
    expect(classifyStepOutcome({ rendered: false, checks: [] })).toBe("ABSENT");
  });

  it("BLOCKED when the environment errored (takes precedence)", () => {
    expect(classifyStepOutcome({ rendered: false, envError: "Target crashed", checks: [] })).toBe("BLOCKED");
    expect(classifyStepOutcome({ rendered: true, envError: "net::ERR_", checks: [] })).toBe("BLOCKED");
  });

  it("UNKNOWN when rendered is indeterminate", () => {
    expect(classifyStepOutcome({ checks: [] })).toBe("UNKNOWN");
  });

  it("SKIPPED when the step was deliberately not attempted", () => {
    expect(classifyStepOutcome({ attempted: false, checks: [] })).toBe("SKIPPED");
  });
});

describe("evidence lib: classifyJourneyRow", () => {
  it("PASS for a ready chip on an expected-ready journey (J18)", () => {
    const result = classifyJourneyRow("J18", { present: true, chipKind: "ok", chipText: "ready" });
    expect(result.outcome).toBe("PASS");
    expect(result.expected).toBe("ready");
  });

  it("PASS for an honest in-development chip on a lane journey (J1)", () => {
    const result = classifyJourneyRow("J1", { present: true, chipKind: "warn", chipText: "in development · lane W2-012" });
    expect(result.outcome).toBe("PASS");
    expect(result.expected).toBe("in-development");
  });

  it("FAIL when the chip contradicts the honest expectation", () => {
    expect(classifyJourneyRow("J1", { present: true, chipKind: "ok" }).outcome).toBe("FAIL");
    expect(classifyJourneyRow("J18", { present: true, chipKind: "warn" }).outcome).toBe("FAIL");
  });

  it("ABSENT when the journey has no visible entry row", () => {
    expect(classifyJourneyRow("J7", { present: false }).outcome).toBe("ABSENT");
    expect(classifyJourneyRow("J7", null).outcome).toBe("ABSENT");
  });
});

describe("evidence lib: denominator law", () => {
  it("reconciles with zero drift", () => {
    const result = reconcileDenominator({
      planned: 30,
      executed: 28,
      blocked: 2,
      skipped: 0,
      byOutcome: { PASS: 28, FAIL: 0, ABSENT: 0, BLOCKED: 2, UNKNOWN: 0, SKIPPED: 0 },
    });
    expect(result.zeroDrift).toBe(true);
  });

  it("detects drift honestly", () => {
    const result = reconcileDenominator({ planned: 30, executed: 30, blocked: 0, skipped: 0, byOutcome: { PASS: 29 } });
    expect(result.zeroDrift).toBe(false);
    expect(result.reconciliation).toContain("DRIFT");
  });

  it("tallies every outcome bucket over surfaces + journeys", () => {
    const byOutcome = tallyOutcomes([["PASS", "PASS"], ["FAIL"], ["BLOCKED", "PASS"]]);
    expect(byOutcome).toEqual({ PASS: 3, FAIL: 1, ABSENT: 0, BLOCKED: 1, UNKNOWN: 0, SKIPPED: 0 });
  });
});

describe("evidence lib: console scrubbing (pilot law)", () => {
  it("redacts keyed credentials and emails", () => {
    expect(scrubConsoleLine('fetch failed for authorization: Bearer abc.def.ghi-jkl')).toContain("[REDACTED]");
    expect(scrubConsoleLine("user token=8f3Zx91-qQwLm2")).toBe("user token [REDACTED]");
    expect(scrubConsoleLine("mail a.person@example.com now")).not.toContain("a.person@example.com");
  });

  it("keeps ordinary prose intact", () => {
    expect(scrubConsoleLine("[vite] connected.")).toBe("[vite] connected.");
    expect(scrubConsoleLine("token management is not used here")).toBe("token management is not used here");
  });
});

describe("evidence lib: evidence-pointer integrity + manifest validation", () => {
  const manifest = {
    manifestKind: EVIDENCE_KIND,
    schemaVersion: 1,
    firstDiscovery: { steps: [{ screenshot: "evidence/01-landing-connect-wall.png" }] },
    checkedSurfaces: [
      { surfaceId: "landing-connect-wall", outcome: "PASS", screenshot: "evidence/01-landing-connect-wall.png" },
      { surfaceId: "blocked-step", outcome: "BLOCKED", error: "Target crashed", screenshot: null },
    ],
    journeyCoverage: JOURNEY_IDS.map((journeyId) => ({
      journeyId,
      outcome: journeyId === "J1" ? "ABSENT" : "PASS",
      evidenceScreenshots: ["evidence/02-commerce-home.png"],
    })),
    denominator: { zeroDrift: true },
    guiOnlyProof: { deepLinkUsedForDiscovery: false },
    evidenceIntegrity: { allPointersResolve: true },
  };

  it("collects every pointer the manifest carries (deduplicated)", () => {
    const pointers = collectEvidencePointers(manifest);
    expect(pointers).toContain("evidence/01-landing-connect-wall.png");
    expect(pointers).toContain("evidence/02-commerce-home.png");
    expect(new Set(pointers).size).toBe(pointers.length);
  });

  it("validates a well-formed manifest", () => {
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a manifest missing journeys, bad outcomes, PASS without evidence, BLOCKED without error", () => {
    const broken = {
      ...manifest,
      journeyCoverage: manifest.journeyCoverage.slice(1),
      checkedSurfaces: [
        { surfaceId: "bad-pass", outcome: "PASS" },
        { surfaceId: "bad-blocked", outcome: "BLOCKED" },
        { surfaceId: "bad-outcome", outcome: "MAYBE" },
      ],
    };
    const result = validateManifest(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("journeyCoverage must list all 19"))).toBe(true);
    expect(result.errors.some((error) => error.includes("bad-pass: PASS without a screenshot pointer"))).toBe(true);
    expect(result.errors.some((error) => error.includes("bad-blocked: BLOCKED without an error string"))).toBe(true);
    expect(result.errors.some((error) => error.includes('bad-outcome: bad outcome "MAYBE"'))).toBe(true);
  });

  it("rejects a deep-link discovery claim and unresolved pointers", () => {
    const result = validateManifest({
      ...manifest,
      guiOnlyProof: { deepLinkUsedForDiscovery: true },
      evidenceIntegrity: { allPointersResolve: false },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("deepLinkUsedForDiscovery"))).toBe(true);
    expect(result.errors.some((error) => error.includes("allPointersResolve"))).toBe(true);
  });
});

describe("evidence lib: parseArgs", () => {
  it("parses the runner flags", () => {
    const args = parseArgs(["--start-env", "--preview", "--out", "dir", "--manifest", "m.json", "--port", "5199"]);
    expect(args).toMatchObject({ startEnv: true, preview: true, outDir: "dir", manifestPath: "m.json", port: 5199, errors: [] });
  });

  it("reports unknown flags and missing values honestly", () => {
    expect(parseArgs(["--nope"]).errors[0]).toContain("unknown argument");
    expect(parseArgs(["--out"]).errors.length).toBe(1);
    expect(parseArgs(["--port", "abc"]).errors.length).toBe(1);
  });
});
