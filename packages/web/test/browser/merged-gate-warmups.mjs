// MERGED-GATE (W3-025) — the cold-boot warm-ups, split from
// run-merged-gate-evidence.mjs for the oxlint max-lines gate (W1-011
// runner-split precedent).
//
// W3-025 both-worlds law: the ordinary first landing `/` is the FULL ZCode
// workspace, so the walk's first surface now carries the workspace's vite
// transform storm, and the commerce host's own storm lands on the discovery
// click. Warm-up #1 absorbs the workspace storm (the W3-024 warm-up absorbed
// the commerce host here because `/` WAS the host); warm-up #2 absorbs the
// commerce host's storm. Without #2 the discovery click navigates to
// /commerce while vite is still cold for the host's module graph, the
// transform spike trips the sandbox memory guardian, vite is killed
// mid-discovery and the step honestly ABSENTs (01b stuck on the loading
// screen — observed in the W3-025 probe run).
//
// Both warm-ups are THROWAWAY cache-warming visits in their own browser
// contexts, closed before the walk — never counted as discovery: the
// recorded firstDiscovery still lands on `/` and reaches the host through
// the ordinary labelled-entry click (no typed deep link).

import { writeFileSync } from "node:fs";
import path from "node:path";
import { freeMemoryMb } from "./commerce-evidence-env.mjs";
import { newWalkContext, waitPainted } from "./commerce-evidence-capture.mjs";

/**
 * Run both cold-boot warm-ups (workspace `/` then commerce `/commerce`).
 * Returns `{ warmup, commerceWarmup }` for the manifest + run log; each entry
 * honestly records `painted` (and for #2 `hostBadge`) so a failed warm-up is
 * visible, never silent.
 */
export async function runColdBootWarmups(browser, { baseUrl, outDir, log }) {
  let warmup = null;
  let commerceWarmup = null;

  // Warm-up #1 — the FULL ZCode workspace at the ordinary first landing `/`.
  {
    const cap = await newWalkContext(browser);
    const startedAt = Date.now();
    try {
      await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      // 150s: a COLD vite dep-optimizer cache (fresh worktree) can take well
      // over 90s to bundle on first load under the pod's RAM ceiling.
      const painted = await waitPainted(cap.page, 150000);
      writeFileSync(path.join(outDir, "00-warmup-coldboot-console.txt"), cap.dump());
      warmup = { painted, timingsMs: Date.now() - startedAt, freeMemoryMb: freeMemoryMb() };
      log(`[env] warm-up cold boot: painted=${painted} in ${warmup.timingsMs}ms (freeMem=${warmup.freeMemoryMb}MB)`);
    } finally {
      await cap.context.close().catch(() => {});
    }
  }

  // Warm-up #2 — the commerce host chunks at `/commerce` (see file header).
  {
    const cap = await newWalkContext(browser);
    const startedAt = Date.now();
    try {
      await cap.page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const painted = await waitPainted(cap.page, 150000);
      const hostBadge = await cap.page
        .locator('[data-testid="cm-env-badge"]')
        .first()
        .waitFor({ timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      writeFileSync(path.join(outDir, "00b-warmup-commerce-console.txt"), cap.dump());
      commerceWarmup = { painted, hostBadge, timingsMs: Date.now() - startedAt, freeMemoryMb: freeMemoryMb() };
      log(
        `[env] warm-up commerce chunks: painted=${painted} hostBadge=${hostBadge} in ${commerceWarmup.timingsMs}ms (freeMem=${commerceWarmup.freeMemoryMb}MB)`,
      );
    } finally {
      await cap.context.close().catch(() => {});
    }
  }

  return { warmup, commerceWarmup };
}
