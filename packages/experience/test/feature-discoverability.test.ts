/**
 * Contract test 1 — feature-discoverability matrix (CORE UX ACCEPTANCE).
 *
 * Walks the navigation/discovery contract programmatically and asserts that
 * EVERY feature row of docs/FEATURE-COMPLETENESS-MATRIX.md maps to at least
 * one discoverable path (primary nav / universal intent / contextual
 * opportunity / onboarding-empty state). The matrix is encoded as contract
 * data; this suite also parses the markdown document and asserts the
 * encoding is in sync (hidden feature = incomplete feature).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURE_MATRIX, OPTIONAL_FEATURES } from "../src/navigation/feature-matrix";
import { PRIMARY_NAVIGATION_AREAS } from "../src/navigation/navigation";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import {
  CONTEXTUAL_OPPORTUNITY_TYPES,
  ONBOARDING_PATHWAYS,
  type DiscoveryPathKind,
} from "../src/navigation/discoverability";
import type { CommandCenterView } from "../src/surfaces/command-center";
import type { ConnectorCard } from "../src/surfaces/connector-studio";
import type { Equal, Expect, Extends } from "./type-helpers";

// ---------------------------------------------------------------------------
// Registry walking (the "programmatic walk" required by W3-001 §6.1)
// ---------------------------------------------------------------------------

const allRows = FEATURE_MATRIX.flatMap((section) => section.rows);
const rowIds = new Set(allRows.map((row) => row.id));
const surfaceIds = new Set(NAVIGATION_SURFACES.map((surface) => surface.id));

function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

const primaryNav = new Map<string, string[]>();
const universalIntent = new Map<string, string[]>();
const contextual = new Map<string, string[]>();
const onboarding = new Map<string, string[]>();

for (const surface of NAVIGATION_SURFACES) {
  for (const featureId of surface.discovers) {
    push(primaryNav, featureId, surface.id);
    if (surface.intentAliases.length > 0) push(universalIntent, featureId, surface.id);
  }
}
for (const hint of CONTEXTUAL_OPPORTUNITY_TYPES) {
  for (const featureId of hint.relatedFeatures) push(contextual, featureId, hint.id);
}
for (const pathway of ONBOARDING_PATHWAYS) {
  for (const featureId of pathway.relatedFeatures) push(onboarding, featureId, pathway.id);
}

// ---------------------------------------------------------------------------
// Markdown parsing (docs/FEATURE-COMPLETENESS-MATRIX.md sync)
// ---------------------------------------------------------------------------

const DOC_URL = new URL("../../../docs/FEATURE-COMPLETENESS-MATRIX.md", import.meta.url);

interface ParsedDoc {
  bulletsBySection: Map<string, string[]>;
  paragraphsBySection: Map<string, string[]>;
}

function parseMatrixDoc(raw: string): ParsedDoc {
  const bulletsBySection = new Map<string, string[]>();
  const paragraphsBySection = new Map<string, string[]>();
  let section = "";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      continue;
    }
    if (section === "" || line.startsWith("#")) continue;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("- ")) {
      push(bulletsBySection, section, normalize(trimmed.slice(2)));
      continue;
    }
    if (trimmed === "Threat coverage:" || trimmed === "Supports:") continue;
    push(paragraphsBySection, section, normalize(trimmed));
  }
  return { bulletsBySection, paragraphsBySection };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const SECTION_TITLE_TO_ID: Record<string, string> = {
  "Merchant parity": "merchant-parity",
  "AI-native merchant layer": "ai-native-merchant-layer",
  "Commerce Network": "commerce-network",
  "Buyer agent": "buyer-agent",
  "Coordination and organization": "coordination-organization",
  "User opportunities": "user-opportunities",
  "Trust and security": "trust-security",
  "Physical commerce": "physical-commerce",
  "UX discoverability requirement": "ux-discoverability",
  "Deployment coverage": "deployment-coverage",
};

/** Sections whose non-bullet lines count as feature rows. */
const PARAGRAPH_ROW_SECTIONS = new Set(["trust-security"]);

/** The four path kinds, verbatim from the doc's UX-discoverability bullets. */
const DOC_PATH_KIND_BULLETS: Record<string, DiscoveryPathKind> = {
  "primary navigation": "primary-navigation",
  "universal intent/command surface": "universal-intent",
  "contextual opportunity card": "contextual-opportunity",
  "onboarding/empty-state education": "onboarding-empty-state",
};

// Compile-time: connector health is structurally visible on both surfaces.
export type HasConnectorHealth = Expect<Equal<Extends<"connectorHealth", keyof CommandCenterView>, true>>;
export type HasHealth = Expect<Equal<Extends<"health", keyof ConnectorCard>, true>>;

// ---------------------------------------------------------------------------
// The discoverability law
// ---------------------------------------------------------------------------

describe("feature-discoverability matrix (core UX acceptance)", () => {
  it("encodes every feature row with a unique id", () => {
    expect(allRows.length).toBeGreaterThan(100);
    expect(rowIds.size).toBe(allRows.length);
  });

  it("maps EVERY feature to at least one primary-navigation surface", () => {
    const unmapped = allRows.filter((row) => !primaryNav.has(row.id));
    expect(unmapped.map((row) => row.id)).toEqual([]);
  });

  it("maps EVERY feature to the universal intent surface (via surface aliases)", () => {
    const unreachable = allRows.filter((row) => !universalIntent.has(row.id));
    expect(unreachable.map((row) => row.id)).toEqual([]);
  });

  it("maps every feature to at least one path of any kind (the matrix law)", () => {
    const pathless = allRows.filter(
      (row) =>
        !primaryNav.has(row.id) &&
        !universalIntent.has(row.id) &&
        !contextual.has(row.id) &&
        !onboarding.has(row.id),
    );
    expect(pathless.map((row) => row.id)).toEqual([]);
  });

  it("references only real feature rows from all registries", () => {
    const phantom: string[] = [];
    for (const surface of NAVIGATION_SURFACES) {
      for (const featureId of surface.discovers)
        if (!rowIds.has(featureId)) phantom.push(`${surface.id}:${featureId}`);
    }
    for (const hint of CONTEXTUAL_OPPORTUNITY_TYPES) {
      for (const featureId of hint.relatedFeatures)
        if (!rowIds.has(featureId)) phantom.push(`${hint.id}:${featureId}`);
    }
    for (const pathway of ONBOARDING_PATHWAYS) {
      for (const featureId of pathway.relatedFeatures)
        if (!rowIds.has(featureId)) phantom.push(`${pathway.id}:${featureId}`);
    }
    expect(phantom).toEqual([]);
  });

  it("covers all ten primary navigation areas with at least one surface", () => {
    const areasCovered = new Set(NAVIGATION_SURFACES.map((surface) => surface.navArea));
    expect([...areasCovered].sort()).toEqual(PRIMARY_NAVIGATION_AREAS.map((a) => a.id).sort());
  });

  it("has unique surface ids and valid explore groups on every row", () => {
    expect(surfaceIds.size).toBe(NAVIGATION_SURFACES.length);
    const validGroups = new Set(["buy", "sell", "operate", "discover", "automate", "connect", "protect"]);
    for (const row of allRows) expect(validGroups.has(row.exploreGroup)).toBe(true);
  });

  it("routes contextual hints and onboarding pathways to real surfaces", () => {
    for (const hint of CONTEXTUAL_OPPORTUNITY_TYPES) {
      expect(surfaceIds.has(hint.actionSurfaceId)).toBe(true);
      expect(hint.triggerTemplate.length).toBeGreaterThan(0);
    }
    for (const pathway of ONBOARDING_PATHWAYS) {
      expect(pathway.steps.length).toBeGreaterThan(0);
      expect(pathway.relatedFeatures.length).toBeGreaterThan(0);
    }
  });

  // The highlighted features from W3-001 §5.2 must be visible WITHOUT
  // internal vocabulary and discoverable through at least two path kinds.
  const HIGHLIGHTED: readonly { label: string; featureId: string }[] = [
    { label: "group-buy", featureId: "user-group-buying" },
    { label: "trade/swap", featureId: "user-swaps" },
    { label: "resale", featureId: "user-resale-owned-items" },
    { label: "rental", featureId: "user-rental" },
    { label: "autonomous store", featureId: "autonomous-store" },
    { label: "Commerce Twin", featureId: "commerce-twin" },
    { label: "security", featureId: "security-pipeline-signal-to-learning" },
    { label: "LocalCommerceEdge", featureId: "physical-edge" },
    { label: "live commerce", featureId: "live-streams" },
  ];

  it("makes each highlighted feature discoverable via at least two path kinds", () => {
    for (const highlighted of HIGHLIGHTED) {
      const kinds = new Set<string>();
      if (primaryNav.has(highlighted.featureId)) kinds.add("primary-navigation");
      if (universalIntent.has(highlighted.featureId)) kinds.add("universal-intent");
      if (contextual.has(highlighted.featureId)) kinds.add("contextual-opportunity");
      if (onboarding.has(highlighted.featureId)) kinds.add("onboarding-empty-state");
      expect(kinds.size, `${highlighted.label} (${highlighted.featureId})`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps internal vocabulary out of surface titles and feature user labels", () => {
    const banned = [
      "tradecycle",
      "capabilitydefinition",
      "connectedcapabilityinstance",
      "agentprincipal",
      "organization lab",
      "capability graph",
      "commerceintent",
      "localcommerceedge",
    ];
    const check = (where: string, text: string) => {
      const lowered = text.toLowerCase();
      for (const token of banned) expect(lowered.includes(token), `${where}: "${text}"`).toBe(false);
    };
    for (const surface of NAVIGATION_SURFACES) check(`surface ${surface.id}`, surface.title);
    for (const row of allRows) check(`feature ${row.id}`, row.userLabel);
  });

  it("exposes connector health structurally on home and connector surfaces", () => {
    expect(true as HasConnectorHealth).toBe(true);
    expect(true as HasHealth).toBe(true);
  });

  it("marks RFID as the only optional physical feature", () => {
    expect(OPTIONAL_FEATURES.length).toBe(1);
    expect(OPTIONAL_FEATURES[0]?.featureId).toBe("physical-rfid");
    expect(OPTIONAL_FEATURES[0]?.optionalBecause).toContain("first-class");
  });
});

// ---------------------------------------------------------------------------
// Markdown sync (the encoded matrix cannot drift from the document)
// ---------------------------------------------------------------------------

describe("feature-matrix document sync", () => {
  const raw = readFileSync(fileURLToPath(DOC_URL), "utf8");
  const parsed = parseMatrixDoc(raw);

  it("covers every section of the document", () => {
    for (const [title, id] of Object.entries(SECTION_TITLE_TO_ID)) {
      if (id === "ux-discoverability") continue;
      const encoded = FEATURE_MATRIX.find((section) => section.section === id);
      expect(encoded, `section ${title} missing in encoding`).toBeDefined();
    }
    expect(FEATURE_MATRIX.length).toBe(9);
  });

  it("matches every document row exactly, in both directions", () => {
    for (const section of FEATURE_MATRIX) {
      const bullets = parsed.bulletsBySection.get(sectionTitle(section.section)) ?? [];
      const paragraphs = PARAGRAPH_ROW_SECTIONS.has(section.section)
        ? (parsed.paragraphsBySection.get(sectionTitle(section.section)) ?? [])
        : [];
      const docRows = new Set([...bullets, ...paragraphs]);
      const encodedRows = new Set(section.rows.map((row) => normalize(row.title)));
      expect([...encodedRows].sort(), `section ${section.section}`).toEqual([...docRows].sort());
    }
  });

  it("treats 'RFID is optional.' as a policy note, not a feature row", () => {
    const physicalParagraphs = parsed.paragraphsBySection.get("Physical commerce") ?? [];
    expect(physicalParagraphs).toEqual(["RFID is optional."]);
    expect(OPTIONAL_FEATURES.some((o) => o.featureId === "physical-rfid")).toBe(true);
  });

  it("encodes exactly the four discovery path kinds the document requires", () => {
    const pathKindBullets = parsed.bulletsBySection.get("UX discoverability requirement") ?? [];
    const docKinds = pathKindBullets.map((bullet) => {
      const stripped = bullet.replace(/[;.]+$/, "");
      const kind = DOC_PATH_KIND_BULLETS[stripped];
      expect(kind, `unknown path-kind bullet: ${bullet}`).toBeDefined();
      return kind as DiscoveryPathKind;
    });
    expect(docKinds.sort()).toEqual(
      ["primary-navigation", "universal-intent", "contextual-opportunity", "onboarding-empty-state"].sort(),
    );
  });
});

function sectionTitle(id: string): string {
  const entry = Object.entries(SECTION_TITLE_TO_ID).find(([, value]) => value === id);
  if (!entry) throw new Error(`unknown section id: ${id}`);
  return entry[0];
}
