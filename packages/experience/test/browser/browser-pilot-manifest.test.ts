import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_VERSION,
  FIRM_PROFILES,
  JOURNEY_FAMILY_IDS,
  MANIFEST_SCHEMA_VERSION,
  PILOT_KIND,
  emptyGuiOnlyProof,
  validateManifest,
} from "./browser-pilot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_MANIFEST_PATH = join(
  HERE,
  "../../../..",
  "docs/simulations/post-v3/w1-010/pilot-manifest.json",
);

function buildFamilyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    journeyFamilyId: JOURNEY_FAMILY_IDS[0],
    routeOrigin: "homepage",
    discoveryPathKind: "primary-navigation",
    discoveryPathRef: "landing:/ → visible controls",
    navigationGraph: [
      { kind: "surface-action", fromSurfaceId: "landing:/", toSurfaceId: "onboarding:use-api-key", viaLabel: "Use API key", atInteractionIndex: 0 },
    ],
    interactionCount: 2,
    outcome: "absent",
    outcomeRationale: "no visible sign on any examined rendered surface",
    attemptedSigns: ["storefront"],
    signScan: { storefront: { present: false } },
    profileOutcomes: { small: "absent", medium: "absent", large: "absent" },
    successfulSteps: ["landing-rendered"],
    failedOrBlockedSteps: [],
    guiOnlyProof: emptyGuiOnlyProof(),
    sensitiveValueScrubbed: true,
    browser: {
      surfacesExamined: ["landing:/ (small)"],
      evidenceScreenshots: ["evidence/01-landing-small.png"],
      consoleEvidenceFiles: ["evidence/01-landing-small-console.txt"],
      visibleControlsInventory: { landingButtons: [], landingLinks: [], onboardingButtons: [] },
    },
    ...overrides,
  };
}

function buildValidFixture(): Record<string, unknown> {
  return {
    manifestKind: PILOT_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    browserExtension: { version: BROWSER_EXTENSION_VERSION, addFieldPolicy: "additive-only" },
    runId: "w1-010-browser-pilot-fixture",
    generatedBy: "packages/experience/test/browser/run-browser-pilot.mjs",
    environment: {
      buildCommit: "0".repeat(40),
      gitBranch: "work/w1-010",
      nodeVersion: "v24.21.0",
      pnpmVersion: "10.33.2",
      playwrightVersion: "1.63.0",
      playwrightResolvedFrom: "import:playwright",
      chromiumVersion: "153.0.0.0",
      baseUrl: "http://localhost:5173",
      serverPort: 3030,
      webPort: 5173,
      envMode: "started-by-runner",
      envRequirements: [],
      operatingSystem: "linux x64",
      freeMemoryMb: { atStart: 2000, atEnd: 1500 },
      walkError: null,
    },
    landingSurface: {
      url: "http://localhost:5173/",
      routeOrigin: "homepage",
      documentTitle: "ZCode - Web + Server",
      visibleButtons: [{ tag: "button", label: "Use API key", href: null }],
      visibleLinks: [],
      screenshot: "evidence/01-landing-small.png",
      consoleEvidenceFile: "evidence/01-landing-small-console.txt",
    },
    discoveryWalk: {
      routeOrigin: "homepage",
      steps: [
        { action: "navigate", control: { kind: "url", visibleLabel: "http://localhost:5173/" }, surfaceId: "landing:/", atUtc: "2026-10-09T16:00:00.000Z", screenshot: "evidence/01-landing-small.png" },
      ],
      externalRedirectTargets: [],
      surfacesExamined: [{ surfaceId: "landing:/ (small)", rendered: true }],
    },
    secondarySurfaces: [],
    environmentBlocks: [
      {
        surface: "zcode-desktop-electron",
        status: "blocked-environment",
        missingPrerequisite: "electron binary not installed",
        verification: "ls node_modules/.pnpm | grep electron → 0 entries",
      },
    ],
    familyDiscoveries: JOURNEY_FAMILY_IDS.map((familyId) => buildFamilyRecord({ journeyFamilyId: familyId })),
    firmProfiles: FIRM_PROFILES.map((firmSize) => ({
      firmSize,
      landingUrl: "http://localhost:5173/",
      rendered: true,
      renderDigest: "djb32-abc",
      profileAgnostic: true,
      evidenceScreenshot: "evidence/01-landing-small.png",
      timingsMs: 12000,
    })),
    denominator: {
      planned: 57,
      executed: 57,
      blocked: 0,
      skipped: 0,
      recomputed: 57,
      outcomeSum: 57,
      zeroDrift: true,
      reconciliation: "planned = executed + blocked + skipped → 57 = 57 + 0 + 0 (zero drift)",
      byOutcome: { pass: 0, fail: 0, blocked: 0, absent: 57, unknown: 0 },
      attemptLevel: "19 journey families × 3 firm profiles",
      familyLevel: { planned: 19, executed: 19, blocked: 0, skipped: 0 },
    },
    guiOnlyProof: emptyGuiOnlyProof(),
    sensitiveValueScrubbed: true,
  };
}

describe("W1-010 pilot manifest validation (fixture)", () => {
  it("accepts a structurally valid manifest", () => {
    const result = validateManifest(buildValidFixture());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects wrong kind, schema version and extension version", () => {
    expect(validateManifest({ ...buildValidFixture(), manifestKind: "other" }).errors[0]).toContain("manifestKind");
    expect(validateManifest({ ...buildValidFixture(), schemaVersion: 2 }).errors[0]).toContain("schemaVersion");
    expect(
      validateManifest({ ...buildValidFixture(), browserExtension: { version: 9 } }).errors[0],
    ).toContain("browserExtension.version");
  });

  it("rejects a manifest missing a registry family or carrying duplicates/foreign ids", () => {
    const families = JOURNEY_FAMILY_IDS.slice(1).map((id) => buildFamilyRecord({ journeyFamilyId: id }));
    const missing = { ...buildValidFixture(), familyDiscoveries: families };
    expect(validateManifest(missing).errors[0]).toContain(`missing ${JOURNEY_FAMILY_IDS[0]}`);
    const duplicated = {
      ...buildValidFixture(),
      familyDiscoveries: [...buildValidFixture().familyDiscoveries, buildFamilyRecord()],
    };
    expect(validateManifest(duplicated).errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects outcomes outside the enum and broken profile outcomes", () => {
    const badOutcome = buildValidFixture();
    badOutcome.familyDiscoveries[0].outcome = "maybe";
    expect(validateManifest(badOutcome).errors[0]).toContain('not in enum');
    const badProfile = buildValidFixture();
    badProfile.familyDiscoveries[1].profileOutcomes = { enterprise: "absent" };
    expect(validateManifest(badProfile).errors.some((e) => e.includes("unknown profile"))).toBe(true);
  });

  it("rejects GUI-only-proof and scrubbing invariant violations", () => {
    const deepLinked = buildValidFixture();
    deepLinked.familyDiscoveries[0].guiOnlyProof = { ...emptyGuiOnlyProof(), deepLinkUsedForDiscovery: true };
    expect(validateManifest(deepLinked).errors[0]).toContain("guiOnlyProof");
    const violated = buildValidFixture();
    violated.familyDiscoveries[0].guiOnlyProof = { ...emptyGuiOnlyProof(), violations: ["x"] };
    expect(validateManifest(violated).errors[0]).toContain("guiOnlyProof");
    const unscrubbed = buildValidFixture();
    unscrubbed.familyDiscoveries[0].sensitiveValueScrubbed = false;
    expect(validateManifest(unscrubbed).errors[0]).toContain("sensitiveValueScrubbed");
  });

  it("rejects families without evidence pointers", () => {
    const noShots = buildValidFixture();
    noShots.familyDiscoveries[2].browser = { evidenceScreenshots: [] };
    expect(validateManifest(noShots).errors[0]).toContain("evidenceScreenshots");
  });

  it("rejects environment blocks missing identity fields", () => {
    const noCommit = buildValidFixture();
    delete noCommit.environment.buildCommit;
    expect(validateManifest(noCommit).errors[0]).toContain("environment.buildCommit");
  });

  it("rejects denominator drift and missing outcome buckets", () => {
    const drift = buildValidFixture();
    drift.denominator = { ...drift.denominator, planned: 58 };
    expect(validateManifest(drift).errors.some((e) => e.includes("drift"))).toBe(true);
    const missingBucket = buildValidFixture();
    delete missingBucket.denominator.byOutcome.unknown;
    expect(validateManifest(missingBucket).errors.some((e) => e.includes("byOutcome.unknown"))).toBe(true);
  });

  it("rejects a non-first-discovery walk root", () => {
    const deepLinkRoot = buildValidFixture();
    deepLinkRoot.discoveryWalk.routeOrigin = "deep-link";
    delete deepLinkRoot.landingSurface.routeOrigin;
    expect(validateManifest(deepLinkRoot).errors.some((e) => e.includes("homepage"))).toBe(true);
  });
});

describe("W1-010 committed pilot manifest (real evidence)", () => {
  it("validates the real pilot manifest when present, else skips honestly", () => {
    if (!existsSync(REAL_MANIFEST_PATH)) {
      console.warn(`[w1-010] real manifest not present yet: ${REAL_MANIFEST_PATH}`);
      return;
    }
    const manifest = JSON.parse(readFileSync(REAL_MANIFEST_PATH, "utf8"));
    const result = validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(manifest.familyDiscoveries).toHaveLength(19);
    expect(manifest.environment.buildCommit).toMatch(/^[0-9a-f]{40,40}$|^unavailable/);
  });
});
