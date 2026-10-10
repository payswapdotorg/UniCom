/**
 * W1-011 commerce host test config (vitest + jsdom).
 *
 * Deliberately separate from vite.config.ts: the app config pulls the whole
 * ZCode web bootstrap (env resolution, proxies, pdf/tailwind plugins); the
 * commerce-host tests only need the react transform, the `@` alias used by
 * @zcode/ui source imports, and jsdom for component tests.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors vite.config.ts: @zcode/ui source files import "@/...".
      "@": resolve(HERE, "../ui/src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
