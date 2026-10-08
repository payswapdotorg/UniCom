/**
 * Pointer resolution (W1-008 §acceptance scenario 3: derived verdicts).
 *
 * Every pointer is resolved against the repo tree at audit time:
 *  - file pointers: `existsSync(repoRoot/file)`;
 *  - symbol pointers: the file's text must contain `export <kind> symbol` or
 *    `export { ... symbol ... }` — we check the named export surface only;
 *    structural typing is left to tsc;
 *  - surface id: must be in `NAVIGATION_SURFACES` (loaded from the
 *    `@unicom/experience` source);
 *  - intent alias: must be in some surface's `intentAliases`;
 *  - hint id: must be in `CONTEXTUAL_OPPORTUNITY_TYPES` or `ONBOARDING_PATHWAYS`;
 *  - test file: file must exist under the relevant `test/` directory.
 *
 * A corrupt pointer (anti-vacuity test) MUST flip the verdict to FAIL.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type {
  Pointer,
  RungVerdict,
  RowRungs,
} from "./types.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

/** Resolves a `file:symbol` pointer. */
export function resolvePointer(pointer: Pointer): RungVerdict {
  const filePath = join(REPO_ROOT, pointer.file);
  if (!existsSync(filePath)) {
    return { status: "FAIL", reason: `file not found: ${pointer.file}` };
  }
  if (pointer.symbol === undefined) {
    return { status: "PASS", resolved: pointer.file };
  }
  const text = readFileSync(filePath, "utf8");
  if (!hasNamedExport(text, pointer.symbol)) {
    return {
      status: "FAIL",
      reason: `symbol "${pointer.symbol}" not exported from ${pointer.file}`,
    };
  }
  return {
    status: "PASS",
    resolved: `${pointer.file}::${pointer.symbol}`,
  };
}

/**
 * Detects a named export in a TS/JS source file. Matches:
 *   export <kind> symbol
 *   export { symbol }
 *   export { symbol, ... }
 *   export type { symbol }
 *   export { type symbol }
 *   export { symbol as Alias }   (covers `symbol`)
 */
export function hasNamedExport(sourceText: string, symbol: string): boolean {
  // Word-boundary escape for the symbol.
  const sym = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 1. `export <modifier> symbol` (function/class/const/let/var/interface/type/enum).
  const declRe = new RegExp(
    `export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function|class|const|let|var|interface|type|enum)\\s+${sym}\\b`,
  );
  if (declRe.test(sourceText)) return true;
  // 2. `export { ... symbol ... }` (incl. `export { type symbol }`).
  const nsRe = new RegExp(
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${sym}\\b[^}]*\\}`,
  );
  return nsRe.test(sourceText);
}

/** A loaded discoverability registry (from `@unicom/experience` source). */
export interface DiscoverabilityRegistry {
  readonly surfaceIds: ReadonlySet<string>;
  readonly intentAliases: ReadonlySet<string>;
  readonly hintIds: ReadonlySet<string>;
}

let cachedRegistry: DiscoverabilityRegistry | null = null;

/**
 * Loads the discoverability registry by importing the
 * `@unicom/experience` navigation modules. Memoised.
 *
 * We import the TS source directly via a runtime that supports it (tsx or a
 * pre-built bundle). When invoked from the harness CLI (which runs under
 * `tsx`), this just works.
 */
export async function loadDiscoverabilityRegistry(): Promise<DiscoverabilityRegistry> {
  if (cachedRegistry) return cachedRegistry;
  const surfacesUrl = new URL(
    "../../packages/experience/src/navigation/surfaces.ts",
    import.meta.url,
  );
  const discoverabilityUrl = new URL(
    "../../packages/experience/src/navigation/discoverability.ts",
    import.meta.url,
  );
  const surfacesMod = await import(fileURLToPath(surfacesUrl));
  const discMod = await import(fileURLToPath(discoverabilityUrl));
  const surfaces = surfacesMod.NAVIGATION_SURFACES as readonly {
    readonly id: string;
    readonly intentAliases: readonly string[];
  }[];
  const surfaceIds = new Set<string>(surfaces.map((s) => s.id));
  const intentAliases = new Set<string>();
  for (const s of surfaces) for (const a of s.intentAliases) intentAliases.add(a);
  const hintIds = new Set<string>();
  const ctx = (discMod.CONTEXTUAL_OPPORTUNITY_TYPES ?? []) as readonly { readonly id: string }[];
  const onb = (discMod.ONBOARDING_PATHWAYS ?? []) as readonly { readonly id: string }[];
  for (const h of ctx) hintIds.add(h.id);
  for (const p of onb) hintIds.add(p.id);
  cachedRegistry = { surfaceIds, intentAliases, hintIds };
  return cachedRegistry;
}

/** Resolves the discoverable-UX rung. */
export function resolveDiscoverableUx(
  rung: RowRungs["discoverableUx"],
  registry: DiscoverabilityRegistry,
): RungVerdict {
  const parts: string[] = [];
  if (rung.surfaceId !== undefined) {
    if (!registry.surfaceIds.has(rung.surfaceId)) {
      return {
        status: "FAIL",
        reason: `surface id "${rung.surfaceId}" not in NAVIGATION_SURFACES`,
      };
    }
    parts.push(`surface:${rung.surfaceId}`);
  }
  if (rung.intentAlias !== undefined) {
    if (!registry.intentAliases.has(rung.intentAlias)) {
      return {
        status: "FAIL",
        reason: `intent alias "${rung.intentAlias}" not in any surface's intentAliases`,
      };
    }
    parts.push(`alias:${rung.intentAlias}`);
  }
  if (rung.hintId !== undefined) {
    if (!registry.hintIds.has(rung.hintId)) {
      return {
        status: "FAIL",
        reason: `hint id "${rung.hintId}" not in CONTEXTUAL_OPPORTUNITY_TYPES or ONBOARDING_PATHWAYS`,
      };
    }
    parts.push(`hint:${rung.hintId}`);
  }
  if (parts.length === 0) {
    return {
      status: "FAIL",
      reason: "discoverableUx rung has no surfaceId/intentAlias/hintId set",
    };
  }
  return { status: "PASS", resolved: parts.join(" + ") };
}

/** Computes the content-derived sha256-12 digest of an artifact (excluding the digest field). */
export function computeDigest(
  artifact: Omit<import("./types.js").MatrixAuditArtifact, "digest">,
): string {
  const canonical = JSON.stringify(artifact);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}
