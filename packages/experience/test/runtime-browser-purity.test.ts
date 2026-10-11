/**
 * W3-018 — module-graph PURITY test for `@unicom/experience/runtime-browser`.
 *
 * Static analysis: walk the module graph from the sub-entrypoint's source file
 * and assert the graph is browser-clean — zero `node:` specifiers, zero imports
 * of adapter/vault implementation modules (`../runtime/connector/adapter`,
 * `../runtime/connector/vault`). Pure Node test, CI-fast, no browser needed.
 *
 * The test reads the source files directly (not the compiled output) and
 * resolves relative imports to their target files, walking the full transitive
 * graph. `import type` specifiers are counted (they erase at compile time, but
 * the source still references the module — we verify they are TYPE-ONLY and
 * that the target is browser-safe if it has runtime exports).
 *
 * Decision packet §4 leakage analysis: the sub-entrypoint's graph must be
 * statically browser-clean; browser code receives only serialized facts; the
 * vault's real type stays Node-side.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ENTRYPOINT = path.resolve(__dirname, "../src/runtime-browser/index.ts");
const EXPERIENCE_SRC = path.resolve(__dirname, "../src");

/** Modules that MUST NOT appear in the runtime-browser graph (Node-only). */
const FORBIDDEN_MODULES = [
  "runtime/connector/adapter",
  "runtime/connector/vault",
  "runtime/connector/runtime",
  "runtime/connector/dispatch",
  "runtime/connector/journey",
  "runtime/connector/browser-only",
  "runtime/connector/live-commerce",
  "runtime/connector/feed-file",
  "runtime/connector/pos-import",
  "runtime/deployment/target-adapter",
  "runtime/deployment/journal-chain",
  "runtime/api/server",
] as const;

/** Read a source file's import specifiers (static `import ... from "..."`). */
function importsOf(source: string): readonly { readonly specifier: string; readonly typeOnly: boolean }[] {
  const imports: { readonly specifier: string; readonly typeOnly: boolean }[] = [];
  // Match: import [type] { ... } from "spec"  |  import "spec"  |  export ... from "spec"
  const importRegex = /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+from\s+)?["']([^"']+)["']/g;
  const typeOnlyRegex = /\b(?:import|export)\s+type\s+/;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1]!;
    const statement = source.slice(Math.max(0, match.index - 20), match.index + match[0].length + 40);
    const typeOnly = typeOnlyRegex.test(statement);
    imports.push({ specifier, typeOnly });
  }
  return imports;
}

/** Resolve a specifier relative to a source file (relative specifiers only). */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".")) return null; // bare specifiers (packages) — skip
  let base = path.resolve(path.dirname(fromFile), specifier);
  // TypeScript imports use `.js` extensions that map to `.ts` source files.
  // Strip a trailing `.js` / `.jsx` so we look for the `.ts` / `.tsx` source.
  if (base.endsWith(".js")) base = base.slice(0, -3);
  if (base.endsWith(".jsx")) base = base.slice(0, -4);
  for (const ext of [".ts", ".tsx", ".js", "/index.ts", "/index.tsx", "/index.js"]) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Walk the full transitive module graph from `entryFile`. */
function walkGraph(entryFile: string): readonly { readonly file: string; readonly imports: readonly { readonly specifier: string; readonly typeOnly: boolean; readonly target: string | null }[] }[] {
  const visited = new Set<string>();
  const result: { file: string; imports: { specifier: string; typeOnly: boolean; target: string | null }[] }[] = [];
  const queue: string[] = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const imports = importsOf(source).map((imp) => ({
      specifier: imp.specifier,
      typeOnly: imp.typeOnly,
      target: resolveSpecifier(imp.specifier, file),
    }));
    result.push({ file, imports });
    for (const imp of imports) {
      if (imp.target && !visited.has(imp.target)) queue.push(imp.target);
    }
  }
  return result;
}

describe("W3-018 runtime-browser module-graph purity (decision §4 leakage analysis)", () => {
  it("the sub-entrypoint source file exists", () => {
    expect(fs.existsSync(ENTRYPOINT)).toBe(true);
  });

  it("the full transitive graph contains ZERO `node:` specifiers", () => {
    const graph = walkGraph(ENTRYPOINT);
    const nodeSpecifiers: string[] = [];
    for (const module of graph) {
      for (const imp of module.imports) {
        if (imp.specifier.startsWith("node:")) {
          nodeSpecifiers.push(`${module.file} -> ${imp.specifier}`);
        }
      }
    }
    expect(nodeSpecifiers, `node: specifiers found in runtime-browser graph:\n${nodeSpecifiers.join("\n")}`).toEqual([]);
  });

  it("the full transitive graph contains ZERO imports of the adapter/vault implementation modules", () => {
    const graph = walkGraph(ENTRYPOINT);
    const forbidden: string[] = [];
    for (const module of graph) {
      const rel = path.relative(EXPERIENCE_SRC, module.file).replace(/\\/g, "/");
      for (const imp of module.imports) {
        for (const forbiddenModule of FORBIDDEN_MODULES) {
          if (imp.specifier.includes(forbiddenModule) || rel.startsWith(forbiddenModule + ".")) {
            // The only allowed reference is a TYPE-ONLY import (erases at compile time).
            if (!imp.typeOnly) {
              forbidden.push(`${module.file} -> ${imp.specifier} (RUNTIME import of ${forbiddenModule})`);
            }
          }
        }
      }
    }
    expect(forbidden, `forbidden runtime imports found in runtime-browser graph:\n${forbidden.join("\n")}`).toEqual([]);
  });

  it("the full transitive graph is reachable and every target file exists", () => {
    const graph = walkGraph(ENTRYPOINT);
    const missing: string[] = [];
    for (const module of graph) {
      for (const imp of module.imports) {
        if (imp.specifier.startsWith(".") && imp.target === null) {
          missing.push(`${module.file} -> ${imp.specifier} (unresolvable)`);
        }
      }
    }
    expect(missing, `unresolvable relative specifiers in runtime-browser graph:\n${missing.join("\n")}`).toEqual([]);
  });

  it("the sub-entrypoint exports the RuntimeFacts interface and the projection helpers", async () => {
    const mod = await import("../src/runtime-browser/index.js");
    expect(mod.projectRuntimeFacts).toBeDefined();
    expect(typeof mod.projectRuntimeFacts).toBe("function");
    expect(mod.shapeModeTelemetry).toBeDefined();
    expect(typeof mod.shapeModeTelemetry).toBe("function");
    expect(mod.shapeAdapterTelemetry).toBeDefined();
    expect(typeof mod.shapeAdapterTelemetry).toBe("function");
    expect(mod.shapeCapability).toBeDefined();
    expect(typeof mod.shapeCapability).toBe("function");
    expect(mod.shapeJourneyOutcome).toBeDefined();
    expect(typeof mod.shapeJourneyOutcome).toBe("function");
    expect(mod.buildConnectorHealthSurface).toBeDefined();
    expect(typeof mod.buildConnectorHealthSurface).toBe("function");
    expect(mod.unknownHealthSnapshot).toBeDefined();
    expect(typeof mod.unknownHealthSnapshot).toBe("function");
    expect(mod.healthSnapshotFromProbe).toBeDefined();
    expect(typeof mod.healthSnapshotFromProbe).toBe("function");
    expect(mod.RUNTIME_BROWSER_FACTS_VERSION).toBe("w3-018-runtime-browser-facts@1");
  });
});
