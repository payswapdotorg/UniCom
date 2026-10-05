import { defineConfig } from "vitest/config";

/**
 * Contract + runtime-test harness for @unicom/agent.
 * Stage-0 law: tests are deterministic, offline and zero-network.
 *
 * W2-002: the runtime suites under test/runtime exercise the REAL ZCode
 * agent kernel (@unicom/agent-kernel + @zcode/core), which are dist-based
 * workspace packages; the global setup builds that closure through the
 * repo's turbo pipeline before any test runs.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    watch: false,
    globalSetup: ["test/setup-kernel-build.ts"],
  },
});
