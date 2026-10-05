/**
 * W2-002 runtime tests exercise the REAL ZCode kernel packages
 * (`@zcode/core`, `@zcode/contracts`), which are dist-based workspace
 * packages. This global setup builds the kernel dependency closure through
 * the repo's turbo pipeline (cached — a warm run is a no-op) so that
 * `pnpm --filter @unicom/agent test` is self-sufficient on a fresh clone.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const zcodeCliRoot = path.join(repoRoot, "apps", "zcode-cli");
const turboBinary = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "turbo.cmd" : "turbo",
);

const KERNEL_PACKAGES = [
  "@zcode/shared-types",
  "@zcode/contracts",
  "@zcode/dynamic-workflow",
  "@zcode/dynamic-workflow-runtime",
  "@zcode/core",
  "@unicom/agent-kernel",
] as const;

export default function setup(): void {
  const marker = path.join(zcodeCliRoot, "packages", "unicom", "dist", "index.js");
  const alreadyBuilt = KERNEL_PACKAGES.every((name) =>
    existsSync(
      path.join(
        zcodeCliRoot,
        "packages",
        name === "@unicom/agent-kernel" ? "unicom" : name.replace("@zcode/", ""),
        "dist",
        "index.js",
      ),
    ),
  );
  if (alreadyBuilt && existsSync(marker)) {
    // Still run turbo: it verifies staleness against its cache and is a fast
    // no-op when up to date. Only skip entirely when the binary is absent.
  }
  if (!existsSync(turboBinary)) {
    if (alreadyBuilt && existsSync(marker)) return;
    throw new Error(
      `turbo binary not found at ${turboBinary}; run \`pnpm install\` at the repository root first`,
    );
  }
  execFileSync(
    turboBinary,
    ["run", "build", ...KERNEL_PACKAGES.flatMap((name) => ["--filter", name])],
    { cwd: zcodeCliRoot, stdio: "inherit" },
  );
}
