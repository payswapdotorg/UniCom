/**
 * W1-007 merchant-parity discoverability test — verifies the new marketing,
 * CRM/loyalty, and forecasting capabilities are reachable through the existing
 * W3-005 surface contracts (contextual opportunity types + onboarding
 * pathways), and that the full merchant-parity journey is discoverable
 * end-to-end.
 *
 * This extends the core feature-discoverability test (test/feature-discoverability.test.ts)
 * with W1-007-specific assertions: every new contextual opportunity routes to
 * a real surface, and every merchant-parity feature row gains at least one
 * additional discoverability path through the new hints/pathways.
 */
import { describe, expect, it } from "vitest";
import { CONTEXTUAL_OPPORTUNITY_TYPES, ONBOARDING_PATHWAYS } from "../src/navigation/discoverability";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import { FEATURE_MATRIX } from "../src/navigation/feature-matrix";

const surfaceIds = new Set(NAVIGATION_SURFACES.map((s) => s.id));
const allRows = FEATURE_MATRIX.flatMap((section) => section.rows);
const rowIds = new Set(allRows.map((row) => row.id));

describe("W1-007 merchant-parity discoverability (W3-005 surface contracts)", () => {
  it("adds contextual opportunity types for campaigns, loyalty, reorder advisory, and demand signals", () => {
    const newHintIds = ["campaign-performance-hint", "loyalty-tier-progress-hint", "reorder-advisory-hint", "demand-signal-hint"];
    for (const hintId of newHintIds) {
      const hint = CONTEXTUAL_OPPORTUNITY_TYPES.find((h) => h.id === hintId);
      expect(hint, `missing hint ${hintId}`).toBeDefined();
      expect(hint!.triggerTemplate.length).toBeGreaterThan(0);
      expect(surfaceIds.has(hint!.actionSurfaceId)).toBe(true);
      // Every related feature must be a real matrix row.
      for (const featureId of hint!.relatedFeatures) {
        expect(rowIds.has(featureId), `hint ${hintId} references phantom feature ${featureId}`).toBe(true);
      }
    }
  });

  it("adds onboarding pathways for launching campaigns and setting up loyalty", () => {
    const newPathwayIds = ["launch-a-campaign", "set-up-loyalty"];
    for (const pathwayId of newPathwayIds) {
      const pathway = ONBOARDING_PATHWAYS.find((p) => p.id === pathwayId);
      expect(pathway, `missing pathway ${pathwayId}`).toBeDefined();
      expect(pathway!.steps.length).toBeGreaterThan(0);
      expect(pathway!.relatedFeatures.length).toBeGreaterThan(0);
      for (const featureId of pathway!.relatedFeatures) {
        expect(rowIds.has(featureId), `pathway ${pathwayId} references phantom feature ${featureId}`).toBe(true);
      }
    }
  });

  it("marketing-analytics is discoverable via primary nav, universal intent, contextual opportunity, AND onboarding", () => {
    const featureId = "marketing-analytics";
    const primaryNav = NAVIGATION_SURFACES.some((s) => s.discovers.includes(featureId));
    const universalIntent = NAVIGATION_SURFACES.some((s) => s.discovers.includes(featureId) && s.intentAliases.length > 0);
    const contextual = CONTEXTUAL_OPPORTUNITY_TYPES.some((h) => h.relatedFeatures.includes(featureId));
    const onboarding = ONBOARDING_PATHWAYS.some((p) => p.relatedFeatures.includes(featureId));
    expect(primaryNav).toBe(true);
    expect(universalIntent).toBe(true);
    expect(contextual).toBe(true);
    expect(onboarding).toBe(true);
  });

  it("customers-crm-loyalty-subscriptions is discoverable via at least three path kinds after W1-007", () => {
    const featureId = "customers-crm-loyalty-subscriptions";
    const primaryNav = NAVIGATION_SURFACES.some((s) => s.discovers.includes(featureId));
    const universalIntent = NAVIGATION_SURFACES.some((s) => s.discovers.includes(featureId) && s.intentAliases.length > 0);
    const contextual = CONTEXTUAL_OPPORTUNITY_TYPES.some((h) => h.relatedFeatures.includes(featureId));
    const onboarding = ONBOARDING_PATHWAYS.some((p) => p.relatedFeatures.includes(featureId));
    const pathKinds = [primaryNav, universalIntent, contextual, onboarding].filter(Boolean).length;
    expect(pathKinds).toBeGreaterThanOrEqual(3);
  });

  it("inventory-locations-transfers-receiving-forecasting gains a reorder-advisory contextual path after W1-007", () => {
    const featureId = "inventory-locations-transfers-receiving-forecasting";
    const reorderHint = CONTEXTUAL_OPPORTUNITY_TYPES.find((h) => h.id === "reorder-advisory-hint");
    expect(reorderHint).toBeDefined();
    expect(reorderHint!.relatedFeatures).toContain(featureId);
    expect(surfaceIds.has(reorderHint!.actionSurfaceId)).toBe(true);
  });

  it("every new W1-007 hint routes to the operate nav area (the merchant operations surface)", () => {
    const newHints = CONTEXTUAL_OPPORTUNITY_TYPES.filter((h) =>
      ["campaign-performance-hint", "loyalty-tier-progress-hint", "reorder-advisory-hint", "demand-signal-hint"].includes(h.id),
    );
    expect(newHints).toHaveLength(4);
    for (const hint of newHints) {
      const surface = NAVIGATION_SURFACES.find((s) => s.id === hint.actionSurfaceId);
      expect(surface, `surface ${hint.actionSurfaceId} not found`).toBeDefined();
      expect(surface!.navArea).toBe("operate");
    }
  });

  it("no contextual hint or onboarding pathway references a phantom feature", () => {
    for (const hint of CONTEXTUAL_OPPORTUNITY_TYPES) {
      for (const featureId of hint.relatedFeatures) {
        expect(rowIds.has(featureId), `hint ${hint.id} → phantom ${featureId}`).toBe(true);
      }
    }
    for (const pathway of ONBOARDING_PATHWAYS) {
      for (const featureId of pathway.relatedFeatures) {
        expect(rowIds.has(featureId), `pathway ${pathway.id} → phantom ${featureId}`).toBe(true);
      }
    }
  });
});
