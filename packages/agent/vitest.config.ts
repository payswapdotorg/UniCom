import { defineConfig } from "vitest/config";

/**
 * Contract-test harness for @unicom/agent.
 * Stage-0 law: tests are deterministic, offline and zero-network.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    watch: false,
  },
});
