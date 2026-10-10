/**
 * Module-registry pinning tests — convention discovery, honest warnings and
 * journey coverage derivation. Logic tests run against synthetic registries
 * so the assertions stay valid whatever feature modules W2/W3 register later;
 * the REAL discovered registry is additionally asserted to be warning-free.
 */
import { describe, expect, it } from "vitest";
import {
  commerceModuleRegistry,
  isCatalogSanctionedSharedClaim,
  moduleContractWarnings,
  pendingLanesForFeatureSection,
  resolveJourneyCoverage,
} from "./module-registry.js";
import type { CommerceModuleRegistry } from "./module-registry.js";
import { defineCommerceModule, journeyFamily } from "./contract/index.js";
import type { CommerceFeatureModule } from "./contract/index.js";

const load = () => Promise.resolve({ default: () => null });

function moduleOf(overrides: Partial<CommerceFeatureModule>): CommerceFeatureModule {
  return defineCommerceModule({
    moduleId: "buyer-fixture",
    title: "Fixture module",
    description: "Synthetic registry fixture.",
    owner: "W2-012",
    journeys: [],
    roles: ["buyer"],
    status: { kind: "ready" },
    nav: [],
    load,
    ...overrides,
  });
}

function registryOf(
  modules: readonly CommerceFeatureModule[],
  warnings: CommerceModuleRegistry["warnings"] = [],
): CommerceModuleRegistry {
  const byId = new Map(modules.map((module) => [module.moduleId, module]));
  return { modules, warnings, moduleById: (id) => byId.get(id) ?? null };
}

describe("the real discovered registry (src/commerce-modules/*/module.ts(x))", () => {
  it("has zero warnings — catalog-sanctioned shared claims (J5 buyer + merchant sides, J18 shared sides) are permitted by design; only unsanctioned duplicate/foreign-lane claims warn", () => {
    expect(commerceModuleRegistry.warnings).toEqual([]);
  });

  it("discovers sorted unique module ids", () => {
    const ids = commerceModuleRegistry.modules.map((module) => module.moduleId);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves coverage for all 19 journeys without crashing", () => {
    expect(resolveJourneyCoverage().length).toBe(19);
  });
});

describe("moduleContractWarnings: the shared-claim law (merge-time J5 dual claim)", () => {
  it("permits J5 claimed by both the W2-012 buyer side and the W3-015 merchant-review side (catalog sharedWith)", () => {
    const buyer = moduleOf({ moduleId: "buyer-groupbuy", owner: "W2-012", journeys: ["J4", "J5"] });
    const merchant = moduleOf({ moduleId: "merchant-groupbuy-review", owner: "W3-015", journeys: ["J5"] });
    expect(moduleContractWarnings(merchant, [buyer], "synthetic")).toEqual([]);
    // symmetric: the buyer side arriving second is equally sanctioned
    expect(moduleContractWarnings(buyer, [merchant], "synthetic")).toEqual([]);
  });

  it("permits J18's shared sides (the W1 host module + a W2/W3 feature-lane module)", () => {
    const host = moduleOf({ moduleId: "host-states", owner: "W1-011", journeys: ["J18"] });
    const feature = moduleOf({ moduleId: "buyer-states", owner: "W2-012", journeys: ["J18"] });
    expect(moduleContractWarnings(feature, [host], "synthetic")).toEqual([]);
    expect(isCatalogSanctionedSharedClaim(journeyFamily("J18"), feature, host)).toBe(true);
  });

  it("still warns on unsanctioned duplicates: the SAME lane claiming one journey twice", () => {
    const first = moduleOf({ moduleId: "buyer-intent", owner: "W2-012", journeys: ["J1"] });
    const second = moduleOf({ moduleId: "buyer-intent-alt", owner: "W2-012", journeys: ["J1"] });
    const warnings = moduleContractWarnings(second, [first], "synthetic");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("already claimed");
  });

  it("still warns when a foreign lane claims a journey it does not own", () => {
    const foreign = moduleOf({ moduleId: "buyer-storefront", owner: "W2-012", journeys: ["J10"] });
    const warnings = moduleContractWarnings(foreign, [], "synthetic");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("is owned by W3-015, not W2-012");
  });

  it("does not treat an unavailable module's claim as a conflicting prior claim", () => {
    const unavailable = moduleOf({
      moduleId: "merchant-connectors",
      owner: "W3-015",
      journeys: ["J15"],
      status: { kind: "unavailable", reason: "waiting on a live connector" },
    });
    const ready = moduleOf({ moduleId: "merchant-connectors-alt", owner: "W3-015", journeys: ["J15"] });
    const warnings = moduleContractWarnings(ready, [unavailable], "synthetic");
    // same lane, but the prior claim is unavailable → not a duplicate conflict
    expect(warnings).toEqual([]);
  });

  it("keeps the duplicate-moduleId warning fatal (module skipped, not registered twice)", () => {
    const first = moduleOf({ moduleId: "buyer-intent", owner: "W2-012", journeys: ["J1"] });
    const twin = moduleOf({ moduleId: "buyer-intent", owner: "W2-012", journeys: ["J1"] });
    const warnings = moduleContractWarnings(twin, [first], "synthetic");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('duplicate moduleId "buyer-intent"');
  });
});

describe("resolveJourneyCoverage with synthetic registries", () => {
  it("marks every journey in-development when nothing is registered (naming the owning lanes)", () => {
    const coverage = resolveJourneyCoverage(registryOf([]));
    expect(coverage.length).toBe(19);
    for (const entry of coverage) {
      expect(entry.state.kind).toBe("in-development");
      if (entry.state.kind === "in-development") {
        expect(entry.state.reason).toContain(entry.state.family.familyName);
      }
    }
    const j1 = coverage.find((entry) => entry.family.journeyId === "J1");
    expect(j1?.path).toBe("/commerce/j/J1");
    const j5 = coverage.find((entry) => entry.family.journeyId === "J5");
    expect(j5?.state.kind).toBe("in-development");
    if (j5?.state.kind === "in-development") {
      expect(j5.state.reason).toContain("W2-012 + W3-015");
    }
  });

  it("renders deterministically when a sanctioned shared journey is claimed by two lanes (first module in sort order renders the journey route)", () => {
    const buyer = moduleOf({
      moduleId: "buyer-groupbuy",
      owner: "W2-012",
      journeys: ["J4", "J5"],
      nav: [{ path: "/commerce/buyer/group-buy/latent-demand", label: "Propose a group deal", journeys: ["J5"] }],
    });
    const merchant = moduleOf({
      moduleId: "merchant-groupbuy-review",
      owner: "W3-015",
      journeys: ["J5"],
      nav: [{ path: "/commerce/merchant/group-buy-review", label: "Review group deals", journeys: ["J5"] }],
    });
    const registry = registryOf([buyer, merchant]);
    const j5 = resolveJourneyCoverage(registry).find((entry) => entry.family.journeyId === "J5");
    expect(j5?.state.kind).toBe("ready");
    expect(j5?.path).toBe("/commerce/buyer/group-buy/latent-demand");
  });

  it("marks a journey ready when a registered module claims it, using the module nav path", () => {
    const registry = registryOf([
      moduleOf({
        moduleId: "buyer-intent",
        journeys: ["J1"],
        nav: [{ path: "/commerce/buyer-intent", label: "Intent canvas", journeys: ["J1"] }],
      }),
    ]);
    const coverage = resolveJourneyCoverage(registry);
    const j1 = coverage.find((entry) => entry.family.journeyId === "J1");
    expect(j1?.state.kind).toBe("ready");
    expect(j1?.path).toBe("/commerce/buyer-intent");
    // All other journeys remain honest in-development states.
    const j2 = coverage.find((entry) => entry.family.journeyId === "J2");
    expect(j2?.state.kind).toBe("in-development");
  });

  it("falls back to the journey route when a ready module claims a journey without a nav entry for it", () => {
    const registry = registryOf([moduleOf({ moduleId: "buyer-intent", journeys: ["J1"] })]);
    const j1 = resolveJourneyCoverage(registry).find((entry) => entry.family.journeyId === "J1");
    expect(j1?.path).toBe("/commerce/j/J1");
  });

  it("surfaces partial module status with its reason (partial ≠ ready, ≠ unavailable)", () => {
    const registry = registryOf([
      moduleOf({
        moduleId: "buyer-intent",
        journeys: ["J1"],
        status: { kind: "partial", reason: "J1 comparison ships in a follow-up", coveredJourneys: ["J1"] },
      }),
    ]);
    const j1 = resolveJourneyCoverage(registry).find((entry) => entry.family.journeyId === "J1");
    expect(j1?.state.kind).toBe("ready");
    if (j1?.state.kind === "ready") {
      expect(j1.state.partial).toBe(true);
      expect(j1.state.reason).toBe("J1 comparison ships in a follow-up");
    }
  });

  it("does NOT count an unavailable module as coverage (journey stays in-development)", () => {
    const registry = registryOf([
      moduleOf({
        moduleId: "buyer-intent",
        journeys: ["J1"],
        status: { kind: "unavailable", reason: "waiting on runtime connector" },
      }),
    ]);
    const j1 = resolveJourneyCoverage(registry).find((entry) => entry.family.journeyId === "J1");
    expect(j1?.state.kind).toBe("in-development");
  });
});

describe("pendingLanesForFeatureSection (Explore availability derivation)", () => {
  it("derives buyer-side sections to W2-012 only", () => {
    expect(pendingLanesForFeatureSection("buyer-agent")).toEqual(["W2-012"]);
  });

  it("derives merchant-parity sections to W3-015 only", () => {
    expect(pendingLanesForFeatureSection("merchant-parity")).toEqual(["W3-015"]);
  });

  it("derives shared sections to both feature lanes, sorted", () => {
    expect(pendingLanesForFeatureSection("coordination-organization")).toEqual([
      "W2-012",
      "W3-015",
    ]);
  });
});
