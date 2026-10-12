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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDistFile,
  SOURCE_TO_DIST_CLASS_MAP,
} from "../src/deployment/bundle-definition.js";
import {
  parseManifestLine,
  parseDistManifest,
  assembleFromDistManifest,
  assembleFromDistRoot,
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
    expect(classifyDistFile("unknown.xyz")).toBeNull();
    expect(classifyDistFile("README")).toBeNull();
  });

  // W3-023: the four new dist-only artifact classes (the REAL-CI-evidence finding)
  it("classifyDistFile classifies .wasm as wasm-module", () => {
    expect(classifyDistFile("assets/docx_wasm_bg-HWnIvdMf.wasm")).toBe("wasm-module");
    expect(classifyDistFile("assets/duke_sheets_wasm_bg-BCCK9PkU.wasm")).toBe("wasm-module");
  });
  it("classifyDistFile classifies .mp3/.wav/.ogg as audio-asset", () => {
    expect(classifyDistFile("assets/task-notification-pop-qiQ1Ge3C.mp3")).toBe("audio-asset");
    expect(classifyDistFile("assets/chime.wav")).toBe("audio-asset");
    expect(classifyDistFile("assets/alert.ogg")).toBe("audio-asset");
  });
  it("classifyDistFile classifies .bcmap/.dat/.bin as data-asset", () => {
    expect(classifyDistFile("pdfjs/cmaps/Adobe-Japan1-0.bcmap")).toBe("data-asset");
    expect(classifyDistFile("assets/lookup.dat")).toBe("data-asset");
    expect(classifyDistFile("assets/packed.bin")).toBe("data-asset");
  });
  it("classifyDistFile classifies .md/.txt as text-asset", () => {
    expect(classifyDistFile("THIRD-PARTY-NOTICES.md")).toBe("text-asset");
    expect(classifyDistFile("assets/license.txt")).toBe("text-asset");
  });
  it("the four new classes are the REAL-CI-evidence paths from the finding", () => {
    // The 4 real unclassifiable paths from the canonical build CI manifest
    expect(classifyDistFile("THIRD-PARTY-NOTICES.md")).toBe("text-asset");
    expect(classifyDistFile("assets/docx_wasm_bg-HWnIvdMf.wasm")).toBe("wasm-module");
    expect(classifyDistFile("assets/duke_sheets_wasm_bg-BCCK9PkU.wasm")).toBe("wasm-module");
    expect(classifyDistFile("assets/task-notification-pop-qiQ1Ge3C.mp3")).toBe("audio-asset");
    expect(classifyDistFile("pdfjs/cmaps/Adobe-Japan1-0.bcmap")).toBe("data-asset");
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
    expect(inventory.entries.length).toBe(14);
    expect(inventory.distDigest).toMatch(/^sha256:/);
  });
  it("two independent assemblies produce the identical digest (determinism)", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const first = assembleFromDistManifest(manifestText);
    const second = assembleFromDistManifest(manifestText);
    expect(first.inventory.distDigest).toBe(second.inventory.distDigest);
  });
  it("reports unclassifiable files honestly", () => {
    const manifestText = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./unknown.xyz";
    const { inventory, unclassifiable } = assembleFromDistManifest(manifestText);
    expect(unclassifiable).toEqual(["unknown.xyz"]);
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
  it("the fixture file exists and has 14 lines (sha256sum format)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(14);
    for (const line of lines) {
      expect(line).toMatch(/^[a-f0-9]{64}\s+\*?\.?\/?.+$/);
    }
  });
  it("the fixture contains the expected file classes (html/js/css/map/static + the 4 W3-023 classes)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(text);
    const classes = new Set(inventory.entries.map((e) => e.fileClass));
    expect(classes.has("html-entrypoint")).toBe(true);
    expect(classes.has("js-entrypoint")).toBe(true);
    expect(classes.has("css-asset")).toBe(true);
    expect(classes.has("map-artifact")).toBe(true);
    expect(classes.has("static-asset")).toBe(true);
    // W3-023 additive classes
    expect(classes.has("wasm-module")).toBe(true);
    expect(classes.has("audio-asset")).toBe(true);
    expect(classes.has("data-asset")).toBe(true);
    expect(classes.has("text-asset")).toBe(true);
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

// --- W3-023: the REAL-dist regression fixture (the canonical build's CI evidence) ---

const regressionFixturePath = resolve(__dirname, "deployment", "real-dist-regression-fixture.txt");

describe("W3-023 real-dist regression fixture — the REAL-CI-evidence class coverage", () => {
  it("the regression fixture exists and has 8 manifest lines (5 real-evidence + 3 representative classifiable)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
    expect(lines.length).toBe(8);
    for (const line of lines) {
      expect(line).toMatch(/^[a-f0-9]{64}\s+\*?\.?\/?.+$/);
    }
  });

  it("assembles the regression fixture with ZERO unclassifiable files (the completeness gap is closed)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const { inventory, unclassifiable } = assembleFromDistManifest(text);
    expect(unclassifiable).toEqual([]);
    expect(inventory.entries.length).toBe(8);
    expect(inventory.distDigest).toMatch(/^sha256:/);
  });

  it("two independent assemblies of the regression fixture produce the identical digest (determinism)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const first = assembleFromDistManifest(text);
    const second = assembleFromDistManifest(text);
    expect(first.inventory.distDigest).toBe(second.inventory.distDigest);
  });

  it("the regression fixture covers all 4 new W3-023 classes (the real unclassifiable paths from the finding)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(text);
    const classes = new Set(inventory.entries.map((e) => e.fileClass));
    expect(classes.has("text-asset")).toBe(true);   // THIRD-PARTY-NOTICES.md
    expect(classes.has("wasm-module")).toBe(true);  // docx_wasm_bg + duke_sheets_wasm_bg
    expect(classes.has("audio-asset")).toBe(true);   // task-notification-pop.mp3
    expect(classes.has("data-asset")).toBe(true);    // Adobe-Japan1-0.bcmap (represents the 168-file class)
  });

  it("the regression fixture carries the REAL CI digests verbatim (the 5 real-evidence lines)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
    // The 5 real-evidence digests from the canonical build CI manifest (run 38259561304, commit 29f037d)
    const realDigests = [
      "4376c92862ab13f7b1bc8d0facc9622110caada8b1bd8612b3f707d00ea0c552", // THIRD-PARTY-NOTICES.md
      "470d3bc418174d8c276c93ccf8b29622edceef13e0cb407d0797341d4fa86197", // docx_wasm_bg.wasm
      "ab475856ab69ce1c29866d8961952578c488804bc4ca6bc13a6db13eb09e20de", // duke_sheets_wasm_bg.wasm
      "bd95332236b7435be42002aed75335dbaac6e896a1650d16b8e2f49183d5cfce", // task-notification-pop.mp3
      "464f08905236f5703b1f5cf8358767c8b18e6bcc808840d081f1de2c7ab38134", // Adobe-Japan1-0.bcmap
    ];
    for (const digest of realDigests) {
      const found = lines.some((l) => l.startsWith(digest));
      expect(found, `real CI digest ${digest.slice(0, 16)}... not found in regression fixture`).toBe(true);
    }
  });

  it("verifyDist PASSes all 3 dist checks on the regression fixture", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const { inventory } = assembleFromDistManifest(text);
    const secondDigest = assembleFromDistManifest(text).inventory.distDigest;
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
});

// --- W1-025: the three W1-021 runner deviations closed ---

describe("W1-025 deviation #1 — the two-parse determinism (assembleFromDistManifest)", () => {
  it("two independent assemblies of the same manifest text produce the identical digest", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const first = assembleFromDistManifest(text);
    const second = assembleFromDistManifest(text);
    // The honest proof: two independent parses (not a re-hash of the same array).
    expect(first.inventory.distDigest).toBe(second.inventory.distDigest);
  });
  it("the dist digest is stable across multiple independent assemblies (not tautological)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const digests = new Set<string>();
    for (let i = 0; i < 5; i++) {
      digests.add(assembleFromDistManifest(text).inventory.distDigest);
    }
    expect(digests.size).toBe(1);
  });
});

describe("W1-025 deviation #2 — the parse integrity (unparseable lines counted + named)", () => {
  it("assembleFromDistManifest returns unparseable lines (never silently dropped)", () => {
    const manifestText = "this is not a valid sha256sum line\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./index.html";
    const { inventory, unparseable, unclassifiable } = assembleFromDistManifest(manifestText);
    expect(unparseable).toEqual(["this is not a valid sha256sum line"]);
    expect(unclassifiable).toEqual([]);
    expect(inventory.entries).toHaveLength(1);
  });
  it("verifyDist FAILs completeness when unparseable lines are present (the detail names them)", () => {
    const manifestText = "corrupt line here\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./index.html";
    const { inventory, unparseable } = assembleFromDistManifest(manifestText);
    const sourceInventory: BundleInventory = { entries: [], inventoryDigest: "sha256:test" };
    const checks = verifyDist(inventory, inventory.distDigest, sourceInventory, [], unparseable);
    const completeness = checks.find((c) => c.check === "dist-manifest-completeness");
    expect(completeness?.result).toBe("FAIL");
    expect(completeness?.detail).toContain("unparseable: corrupt line here");
  });
  it("verifyDist FAILs completeness when BOTH unparseable and unclassifiable are present (the detail names both)", () => {
    const manifestText = "corrupt line\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  ./unknown.xyz";
    const { inventory, unclassifiable, unparseable } = assembleFromDistManifest(manifestText);
    const sourceInventory: BundleInventory = { entries: [], inventoryDigest: "sha256:test" };
    const checks = verifyDist(inventory, inventory.distDigest, sourceInventory, unclassifiable, unparseable);
    const completeness = checks.find((c) => c.check === "dist-manifest-completeness");
    expect(completeness?.result).toBe("FAIL");
    expect(completeness?.detail).toContain("unparseable: corrupt line");
    expect(completeness?.detail).toContain("unclassifiable: unknown.xyz");
  });
  it("the committed fixture has ZERO unparseable lines (the pure sha256sum format)", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const { unparseable } = assembleFromDistManifest(text);
    expect(unparseable).toEqual([]);
  });
  it("the regression fixture has ZERO unparseable lines (comments removed in W1-025)", () => {
    const text = readFileSync(regressionFixturePath, "utf-8");
    const { unparseable } = assembleFromDistManifest(text);
    expect(unparseable).toEqual([]);
  });
});

describe("W1-025 deviation #3 — the honest dist-root walk (assembleFromDistRoot)", () => {
  it("assembleFromDistRoot classifies every file and collects unclassifiable", () => {
    const files = [
      { path: "index.html", digest: "abc123" },
      { path: "assets/app.js", digest: "def456" },
      { path: "assets/app.css", digest: "ghi789" },
      { path: "assets/app.js.map", digest: "jkl012" },
      { path: "assets/unknown.xyz", digest: "mno345" },
    ];
    const { inventory, unclassifiable } = assembleFromDistRoot(files);
    expect(inventory.entries).toHaveLength(4);
    expect(unclassifiable).toEqual(["assets/unknown.xyz"]);
    expect(inventory.distDigest).toMatch(/^sha256:/);
  });
  it("two independent walks of the same file-list produce the identical digest (determinism)", () => {
    const files = [
      { path: "index.html", digest: "abc123" },
      { path: "assets/app.js", digest: "def456" },
    ];
    const first = assembleFromDistRoot(files);
    const second = assembleFromDistRoot(files);
    expect(first.inventory.distDigest).toBe(second.inventory.distDigest);
  });
  it("assembleFromDistRoot with zero unclassifiable passes completeness", () => {
    const files = [
      { path: "index.html", digest: "abc123" },
      { path: "assets/app.js", digest: "def456" },
    ];
    const { inventory, unclassifiable } = assembleFromDistRoot(files);
    const sourceInventory: BundleInventory = {
      entries: [
        { fileClass: "entrypoint", path: "packages/web/src/index.ts", digest: "sha256:abc" },
        { fileClass: "contract-barrel", path: "packages/commerce/src/contract.ts", digest: "sha256:def" },
        { fileClass: "runtime-module", path: "packages/commerce/src/runtime/index.ts", digest: "sha256:ghi" },
        { fileClass: "projection-module", path: "packages/commerce/src/projection/index.ts", digest: "sha256:jkl" },
      ],
      inventoryDigest: "sha256:test",
    };
    const checks = verifyDist(inventory, inventory.distDigest, sourceInventory, unclassifiable);
    const fails = checks.filter((c) => c.result === "FAIL");
    expect(fails).toEqual([]);
    expect(checks.length).toBe(3);
  });
  it("assembleFromDistRoot with unclassifiable FAILs completeness naming the file", () => {
    const files = [
      { path: "index.html", digest: "abc123" },
      { path: "assets/app.js", digest: "def456" },
      { path: "assets/unknown.xyz", digest: "mno345" },
    ];
    const { inventory, unclassifiable } = assembleFromDistRoot(files);
    const sourceInventory: BundleInventory = { entries: [], inventoryDigest: "sha256:test" };
    const checks = verifyDist(inventory, inventory.distDigest, sourceInventory, unclassifiable);
    const completeness = checks.find((c) => c.check === "dist-manifest-completeness");
    expect(completeness?.result).toBe("FAIL");
    expect(completeness?.detail).toContain("unclassifiable: assets/unknown.xyz");
  });
});

describe("W1-025 dist-dir fixtures — the committed fake dist directories", () => {
  const cleanDir = resolve(__dirname, "deployment", "dist-dir-clean-fixture");
  const unclassifiableDir = resolve(__dirname, "deployment", "dist-dir-fixture");

  it("the clean dist-dir fixture exists with 5 classifiable files (html/js/css/map/svg)", () => {
    const files = readdirSync(cleanDir, { recursive: true }).filter((f) => typeof f === "string" && statSync(join(cleanDir, f as string)).isFile());
    expect(files.length).toBe(5);
  });

  it("the dist-dir fixture with unclassifiable exists with 6 files (5 classifiable + 1 .xyz)", () => {
    const files = readdirSync(unclassifiableDir, { recursive: true }).filter((f) => typeof f === "string" && statSync(join(unclassifiableDir, f as string)).isFile());
    expect(files.length).toBe(6);
  });

  it("the dist-dir fixture contains the deliberately unclassifiable file (assets/unknown.xyz)", () => {
    const files = readdirSync(unclassifiableDir, { recursive: true }).filter((f) => typeof f === "string");
    const hasUnclassifiable = files.some((f) => (f as string).endsWith("unknown.xyz"));
    expect(hasUnclassifiable).toBe(true);
  });
});

describe("W1-025 the schema-unchanged invariant — the artifact stays at 11 checks", () => {
  it("verifyDist still produces exactly 3 dist checks (no new check added)", () => {
    const manifestText = readFileSync(fixturePath, "utf-8");
    const { inventory, unclassifiable, unparseable } = assembleFromDistManifest(manifestText);
    const sourceInventory: BundleInventory = { entries: [], inventoryDigest: "sha256:test" };
    const checks = verifyDist(inventory, inventory.distDigest, sourceInventory, unclassifiable, unparseable);
    expect(checks.length).toBe(3);
    expect(checks.map((c) => c.check)).toEqual(["dist-manifest-completeness", "dist-digest-deterministic", "source-dist-cross-check"]);
  });
});
