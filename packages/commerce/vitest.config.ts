import { defineConfig } from "vitest/config";

/**
 * Deterministic, offline contract-test configuration.
 * No coverage providers, no watchers, no network, single thread pool for stable ordering.
 */
export default defineConfig({
  test: {
    name: "@unicom/commerce contracts",
    include: ["src/test/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    retry: 0,
    timeout: 10_000,
  },
});
