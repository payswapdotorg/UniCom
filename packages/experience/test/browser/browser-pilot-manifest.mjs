// W1-010 browser pilot — family-record + manifest assembly. Split out of
// run-browser-pilot.mjs to respect the repo-wide oxlint max-lines gate
// (400 lines/file). Pure transformation: capture results in, manifest parts out.

import {
  BROWSER_EXTENSION_VERSION,
  FIRM_PROFILES,
  FAMILY_VISIBLE_SIGNS,
  JOURNEY_FAMILY_IDS,
  MANIFEST_SCHEMA_VERSION,
  PILOT_KIND,
  PROTOCOL_REFS,
  classifyFamilyDiscovery,
  emptyGuiOnlyProof,
  scanTerms,
} from "./browser-pilot-lib.mjs";

export function buildFamilyRecords(landingCaptures, onboarding, shareSurfaces, evidencePrefix) {
  const surfacesRendered = landingCaptures.some((c) => c.rendered);
  const examined = [];
  for (const capture of landingCaptures) {
    if (capture.rendered) {
      examined.push(
        `landing:/ (${capture.profile} profile): ${capture.bodyText}\n[controls] ${capture.visibleButtons.map((b) => b.label).join(" | ")}`,
      );
    }
  }
  if (onboarding.rendered) {
    examined.push(
      `onboarding:use-api-key: ${onboarding.bodyText}\n[controls] ${onboarding.visibleButtons.map((b) => b.label).join(" | ")}`,
    );
  }
  for (const share of shareSurfaces) {
    if (share.rendered) examined.push(`share:${share.path}: ${share.bodyText}`);
  }
  const combinedHaystack = examined.join("\n");
  // HONESTY LAW: evidence pointers may only name files the capture layer
  // actually wrote — a capture that failed before writing its screenshot or
  // console dump carries null pointers and is excluded here. The predecessor
  // draft listed every planned filename regardless of capture success, which
  // made the manifest reference non-existent artifacts.
  const walkScreenshots = [
    ...landingCaptures.map((c) => (c.rendered ? c.screenshot : null)),
    onboarding.rendered ? onboarding.screenshot : null,
    ...shareSurfaces.map((s) => (s.rendered ? s.screenshot : null)),
  ].filter(Boolean);
  const consoleFiles = [
    ...landingCaptures.map((c) => c.consoleFile),
    onboarding.consoleFile,
    ...shareSurfaces.map((s) => s.consoleFile),
  ].filter(Boolean);

  return JOURNEY_FAMILY_IDS.map((familyId) => {
    const signs = FAMILY_VISIBLE_SIGNS[familyId];
    const signScan = scanTerms(combinedHaystack, signs);
    const outcome = classifyFamilyDiscovery({ signScan, surfacesRendered });
    const profileOutcomes = {};
    for (const profile of FIRM_PROFILES) {
      const capture = landingCaptures.find((c) => c.profile === profile);
      const profileScan = scanTerms(
        `${capture?.bodyText ?? ""}\n[controls] ${(capture?.visibleButtons ?? []).map((b) => b.label).join(" | ")}`,
        signs,
      );
      profileOutcomes[profile] = !capture
        ? "blocked"
        : !capture.rendered
          ? "blocked"
          : Object.values(profileScan).some((s) => s.present)
            ? "fail"
            : "absent";
    }
    return {
      journeyFamilyId: familyId,
      protocolRef: PROTOCOL_REFS[familyId],
      routeOrigin: "homepage",
      discoveryPathKind: "primary-navigation",
      discoveryPathRef: "landing:/ → visible controls → onboarding:use-api-key (no deep links)",
      navigationGraph: [
        {
          kind: "surface-action",
          fromSurfaceId: "landing:/",
          toSurfaceId: "onboarding:use-api-key",
          viaLabel: "Use API key",
          atInteractionIndex: 0,
        },
      ],
      interactionCount: landingCaptures.length + (onboarding.rendered ? 1 : 0),
      outcome,
      outcomeRationale:
        outcome === "absent"
          ? "no visible sign of this family on any examined rendered surface; the commerce experience surfaces exist only as typed view contracts below the GUI (packages/experience/src/surfaces/*.ts have no renderer/host)"
          : outcome === "fail"
            ? "a visible sign was found — journey discoverable; completion driving is expanded-suite (G3) scope"
            : "no landing surface could be rendered — environment block",
      attemptedSigns: signs,
      signScan,
      profileOutcomes,
      successfulSteps: surfacesRendered ? ["landing-rendered", "visible-controls-inventoried", "sign-scan-executed"] : [],
      failedOrBlockedSteps: surfacesRendered ? [] : [{ step: "landing-render", reason: "environment" }],
      guiOnlyProof: emptyGuiOnlyProof(),
      sensitiveValueScrubbed: true,
      browser: {
        surfacesExamined: examined.map((entry) => entry.split(":")[0] + ":" + entry.split(":")[1]),
        evidenceScreenshots: walkScreenshots.map((shot) => `${evidencePrefix}${shot}`),
        consoleEvidenceFiles: consoleFiles.map((file) => `${evidencePrefix}${file}`),
        visibleControlsInventory: {
          landingButtons: landingCaptures.find((c) => c.rendered)?.visibleButtons ?? [],
          landingLinks: landingCaptures.find((c) => c.rendered)?.visibleLinks ?? [],
          onboardingButtons: onboarding.rendered ? onboarding.visibleButtons : [],
        },
      },
    };
  });
}

export function manifestHeader({ startedAtUtc }) {
  return {
    manifestKind: PILOT_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    browserExtension: { version: BROWSER_EXTENSION_VERSION, addFieldPolicy: "additive-only over JOURNEY-EVIDENCE-SCHEMA v1" },
    runId: `w1-010-browser-pilot-${startedAtUtc.replace(/[:.]/g, "")}`,
    generatedBy: "packages/experience/test/browser/run-browser-pilot.mjs",
  };
}
