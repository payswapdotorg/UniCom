import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Contract tests are deterministic and offline by construction:
    // no network access, no timers, no external state. Every fixture is local.
  },
});
