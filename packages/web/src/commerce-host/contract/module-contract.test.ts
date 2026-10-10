/**
 * Contract-pinning tests for the W1-011 module contract — the published seam
 * W2-012/W3-015 build against. These tests FAIL if the frozen vocabulary
 * (19 journeys, 3 lanes, role ids, permission ids, module id namespaces)
 * drifts, so feature workers can pin their modules against this file.
 */
import { describe, expect, it } from "vitest";
import {
  COMMERCE_JOURNEY_IDS,
  MODULE_ID_PREFIX_RESERVATION,
  defineCommerceModule,
  parseCommerceModule,
  reservedOwnerForModuleId,
} from "./module-contract.js";
import type { CommerceFeatureModule } from "./module-contract.js";

describe("COMMERCE_JOURNEY_IDS (frozen 19-journey vocabulary)", () => {
  it("contains exactly J1..J19 in order", () => {
    expect([...COMMERCE_JOURNEY_IDS]).toEqual([
      "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10",
      "J11", "J12", "J13", "J14", "J15", "J16", "J17", "J18", "J19",
    ]);
  });
});

describe("MODULE_ID_PREFIX_RESERVATION (write-surface namespaces)", () => {
  it("reserves the lane prefixes from CONTRACT-MAP §5", () => {
    expect(MODULE_ID_PREFIX_RESERVATION).toEqual([
      { prefix: "host-", owner: "W1-011" },
      { prefix: "reference-", owner: "W1-011" },
      { prefix: "buyer-", owner: "W2-012" },
      { prefix: "peer-", owner: "W2-012" },
      { prefix: "merchant-", owner: "W3-015" },
      { prefix: "procurement-", owner: "W3-015" },
      { prefix: "physical-", owner: "W3-015" },
      { prefix: "trust-", owner: "W3-015" },
    ]);
  });

  it("maps module ids to their owning lane by prefix", () => {
    expect(reservedOwnerForModuleId("buyer-intent-canvas")).toBe("W2-012");
    expect(reservedOwnerForModuleId("merchant-lifecycle")).toBe("W3-015");
    expect(reservedOwnerForModuleId("host-states")).toBe("W1-011");
    expect(reservedOwnerForModuleId("reference-explore")).toBe("W1-011");
    // Unreserved ids are null (registry still validates them structurally).
    expect(reservedOwnerForModuleId("mystery")).toBeNull();
    // Exact prefix without the trailing dash does not match ("buyer" ≠ "buyer-").
    expect(reservedOwnerForModuleId("buyers")).toBeNull();
  });
});

describe("defineCommerceModule + parseCommerceModule", () => {
  const load = () => Promise.resolve({ default: () => null });

  it("accepts a well-formed module and returns it unchanged", () => {
    const module: CommerceFeatureModule = defineCommerceModule({
      moduleId: "buyer-example",
      title: "Example buyer module",
      description: "Proves the contract shape.",
      owner: "W2-012",
      journeys: ["J1"],
      roles: ["buyer"],
      status: { kind: "ready" },
      nav: [
        {
          path: "/commerce/buyer-example",
          label: "Example",
          journeys: ["J1"],
        },
      ],
      load,
    });
    const parsed = parseCommerceModule(module);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.module.moduleId).toBe("buyer-example");
  });

  it("rejects a non-object export", () => {
    expect(parseCommerceModule(null)).toEqual({ ok: false, error: "module export is not an object" });
    expect(parseCommerceModule("nope")).toEqual({ ok: false, error: "module export is not an object" });
  });

  it("rejects kebab-case violations and empty title/description", () => {
    const base = {
      moduleId: "Bad_Id",
      title: "",
      description: "",
      owner: "W2-012",
      journeys: [],
      roles: [],
      status: { kind: "ready" },
      nav: [],
      load,
    };
    const parsed = parseCommerceModule(base);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("moduleId must be kebab-case");
      expect(parsed.error).toContain("title must be a non-empty string");
      expect(parsed.error).toContain("description must be a non-empty string");
    }
  });

  it("rejects unknown owner, journey and role ids", () => {
    const parsed = parseCommerceModule({
      moduleId: "buyer-example",
      title: "t",
      description: "d",
      owner: "W4-999",
      journeys: ["J1", "J99"],
      roles: ["wizard"],
      status: { kind: "ready" },
      nav: [],
      load,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("owner must be one of W1-011 | W2-012 | W3-015");
      expect(parsed.error).toContain('unknown journey id "J99"');
      expect(parsed.error).toContain('unknown role id "wizard"');
    }
  });

  it("rejects invalid status kinds and nav paths outside /commerce", () => {
    const parsed = parseCommerceModule({
      moduleId: "buyer-example",
      title: "t",
      description: "d",
      owner: "W2-012",
      journeys: [],
      roles: [],
      status: { kind: "bogus" },
      nav: [{ path: "/elsewhere", label: "Bad path" }],
      load,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("status.kind must be ready | partial | unavailable");
      expect(parsed.error).toContain("must start with /commerce");
    }
  });

  it("rejects a missing load function", () => {
    const parsed = parseCommerceModule({
      moduleId: "buyer-example",
      title: "t",
      description: "d",
      owner: "W2-012",
      journeys: [],
      roles: [],
      status: { kind: "ready" },
      nav: [],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("load must be a function");
  });
});
