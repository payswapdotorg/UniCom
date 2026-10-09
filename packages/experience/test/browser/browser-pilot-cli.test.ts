import { execFile as execFileCb } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "run-browser-pilot.mjs");

// CLI-surface tests only: no browser, no environment — the runner must be
// safely inspectable (--help / --dry-run) and fail fast on bad arguments.
describe("W1-010 browser runner CLI surface", () => {
  it("prints usage for --help and exits 0 without launching anything", async () => {
    const { stdout } = await execFile(process.execPath, [RUNNER, "--help"]);
    expect(stdout).toContain("--start-env");
    expect(stdout).toContain("--base-url");
    expect(stdout).toContain("--dry-run");
  });

  it("prints the dry-run plan with the full 19-family registry and exits 0", async () => {
    const { stdout } = await execFile(process.execPath, [RUNNER, "--dry-run"]);
    const plan = JSON.parse(stdout) as { families: number; firmProfiles: string[]; mode: string };
    expect(plan.families).toBe(19);
    expect(plan.firmProfiles).toEqual(["small", "medium", "large"]);
    expect(plan.mode).toBe("external");
  });

  it("dry-run honors --start-env mode without booting the environment", async () => {
    const { stdout } = await execFile(process.execPath, [RUNNER, "--dry-run", "--start-env"]);
    const plan = JSON.parse(stdout) as { mode: string; baseUrl: string };
    expect(plan.mode).toBe("start-env");
    expect(plan.baseUrl).toBe("http://localhost:5173");
  });

  it("exits 2 with an argument error when no environment mode is given", async () => {
    const failure = await execFile(process.execPath, [RUNNER]).then(
      (ok) => ok,
      (err) => err,
    );
    expect(failure.code).toBe(2);
    expect(String(failure.stderr)).toContain("--start-env or --base-url");
  });

  it("exits 2 when --base-url has no value or conflicts with --start-env", async () => {
    const noValue = await execFile(process.execPath, [RUNNER, "--base-url"]).then(
      (ok) => ok,
      (err) => err,
    );
    expect(noValue.code).toBe(2);
    expect(String(noValue.stderr)).toContain("requires a value");
    const conflict = await execFile(process.execPath, [
      RUNNER,
      "--start-env",
      "--base-url",
      "http://localhost:5173",
    ]).then(
      (ok) => ok,
      (err) => err,
    );
    expect(conflict.code).toBe(2);
    expect(String(conflict.stderr)).toContain("mutually exclusive");
  });
});
