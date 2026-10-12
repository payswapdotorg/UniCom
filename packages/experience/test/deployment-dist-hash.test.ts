/**
 * W1-021 — dist-hash integration tests.
 *
 * Covers:
 * - the dist contract (file classes, manifest format, classifyDistFile)
 * - parseManifestLine + parseDistManifest
 * - assembleFromDistManifest (classification, completeness, determinism)
 * - verifyDist (completeness, determinism, source↔dist cross-check)
 * - the source-only honest mode
 * - the committed fixture provenance
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDistFile,
  SOURCE_TO_DIST_CLASS_MAP,
} from "../src/deployment/bundle-definition.js";
import {
  parseManifestLine,
  parseDistManifest,
  assembleFromDistManifest,
  verifyDist,
  sourceOnlyDistSection,
} from "../src/deployment/rehearsal.js";
import type { BundleInventory } from "../src/deployment/bundle-definition.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "deployment", "dist-manifest-fixture.txt");

describe("W1-021 dist contract — file classification", () => {
  it("classifyDistFile classifies .html as html-entrypoint", () => {
    expect(classifyDistFile("index.html")).toBe("html-entrypoint");
  });
  it("classifyDistFile classifies .js/.mjs as js-entrypoint", () => {
    expect(classifyDistFile("assets/index-abc.js")).toBe("js-entrypoint");
    expect(classifyDistFile("assets/vendor-def.mjs")).toBe("js-entrypoint");
  });
  it("classifyDistFile classifies .css as css-asset", () => {
    expect(classifyDistFile("assets/index-abc.css")).toBe("css-asset");
  });
  it("classifyDistFile classifies .map as map-artifact", () => {
    expect(classifyDistFile("assets/index-abc.js.map")).toBe("map-artifact");
  });
  it("classifyDistFile classifies images/fonts/json as static-asset", () => {
    expect(classifyDistFile("logo.svg")).toBe("static-asset");
    expect(classifyDistFile("favicon.ico")).toBe("static-asset");
    expect(classifyDistFile("manifest.webmanifest")).toBe("static-asset");
    expect(classifyDistFile("fonts/inter.woff2")).toBe("static-asset");
  });
  it("classifyDistFile returns null for unclassifiable files", () => {
    expect(classifyDistFile("unknown.bin")).toBeNull();
    expect(classifyDistFile("README")).toBeNull();
  });
});

describe("W1-021 manifest parsing", () => {
  it("parseManifestLine parses a sha256sum-format line", () => {
    const line = parseManifestLine("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./index.html");
    expect(line).toEqual({ digest: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", path: "index.html" });
  });
  it("parseManifestLine parses without the ./ prefix", () => {
    const line = parseManifestLine("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  assets/index.js");
    expect(line).toEqual({ digest: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", path: "assets/index.js" });
  });
  it("parseManifestLine returns null for invalid lines", () => {
    expect(parseManifestLine("not a hash")).toBeNull();
    expect(parseManifestLine("")).toBeNull();
  });
  it("parseDistManifest parses a full manifest text", () => {
    const text = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./index.html\nb2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3  ./assets/app.js";
    const lines = parseDistManifest(text);
    expect(lines).toHaveLength(2);
  });
});

describe("W1-021 assembleFromDistManifest — classification + completeness", () => {
  it("assembles a DistInventory from the committed fixture with zero unclassifiable files", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const { inventory, unclassifiable } = assembleFromDistManifest(manifestText);
    expect(unclassifiable).toEqual([]);
    expect(inventory.entries.length).toBe(10);
    expect(inventory.distDigest).toMatch(/^sha256:/);
  });
  it("two independent assemblies produce the identical digest (determinism)", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const first = assembleFromDistManifest(manifestText);
    const second = assembleFromDistManifest(manifestText);
    expect(first.inventory.distDigest).toBe(second.inventory.distDigest);
  });
  it("reports unclassifiable files honestly", () => {
    const manifestText = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./unknown.bin";
    const { inventory, unclassifiable } = assembleFromDistManifest(manifestText);
    expect(unclassifiable).toEqual(["unknown.bin"]);
    expect(inventory.entries).toHaveLength(0);
  });
});

describe("W1-021 verifyDist — verification checks", () => {
  it("all checks PASS on the committed fixture", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(manifestText);
    const secondDigest = assembleFromDistManifest(manifestText).inventory.distDigest;
    const sourceInventory: BundleInventory = {
      entries: [
        { fileClass: "entrypoint", path: "packages/web/src/index.ts", digest: "sha256:abc" },
        { fileClass: "contract-barrel", path: "packages/commerce/src/contract.ts", digest: "sha256:def" },
        { fileClass: "runtime-module", path: "packages/commerce/src/runtime/index.ts", digest: "sha256:ghi" },
        { fileClass: "projection-module", path: "packages/commerce/src/projection/index.ts", digest: "sha256:jkl" },
      ],
      inventoryDigest: "sha256:test",
    };
    const checks = verifyDist(inventory, secondDigest, sourceInventory);
    const fails = checks.filter((c) => c.result === "FAIL");
    expect(fails, `failing: ${fails.map((f) => f.check).join(", ")}`).toEqual([]);
    expect(checks.length).toBe(3);
  });
  it("FAIL on determinism when digests differ", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(manifestText);
    const sourceInventory: BundleInventory = { entries: [], inventoryDigest: "sha256:test" };
    const checks = verifyDist(inventory, "sha256:different", sourceInventory);
    const detCheck = checks.find((c) => c.check === "dist-digest-deterministic");
    expect(detCheck?.result).toBe("FAIL");
  });
});

describe("W1-021 source-only mode — honest", () => {
  it("sourceOnlyDistSection returns mode source-only with the honest reason", () => {
    const section = sourceOnlyDistSection();
    expect(section.mode).toBe("source-only");
    expect(section.provenance.source).toBe("source-only");
    expect(section.provenance.reason).toContain("CI memory class");
    expect(section.provenance.reason).toContain("13 documented local OOM kills");
    expect(section.digest).toBeUndefined();
    expect(section.fileCount).toBeUndefined();
  });
});

describe("W1-021 fixture provenance — the committed fixture", () => {
  it("the fixture file exists and has 10 lines (sha256sum format)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(10);
    for (const line of lines) {
      expect(line).toMatch(/^[a-f0-9]{64}\s+\*?\.?\/?.+$/);
    }
  });
  it("the fixture contains the expected file classes (html/js/css/map/static)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(text);
    const classes = new Set(inventory.entries.map((e) => e.fileClass));
    expect(classes.has("html-entrypoint")).toBe(true);
    expect(classes.has("js-entrypoint")).toBe(true);
    expect(classes.has("css-asset")).toBe(true);
    expect(classes.has("map-artifact")).toBe(true);
    expect(classes.has("static-asset")).toBe(true);
  });
});

describe("W1-021 source→dist class mapping", () => {
  it("SOURCE_TO_DIST_CLASS_MAP covers all entrypoint-class source classes", () => {
    const sourceClasses = SOURCE_TO_DIST_CLASS_MAP.map((m) => m.sourceClass);
    expect(sourceClasses).toContain("entrypoint");
    expect(sourceClasses).toContain("contract-barrel");
    expect(sourceClasses).toContain("runtime-module");
    expect(sourceClasses).toContain("projection-module");
  });
});
