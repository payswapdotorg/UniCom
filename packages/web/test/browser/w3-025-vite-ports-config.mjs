// W3-025 evidence-only Vite config — lane-private ports.
//
// The repo's packages/web/vite.config.ts hardcodes the dev proxy to the
// ordinary server port (:3030), which the OPERATOR's live view owns. This
// wrapper loads that config unchanged and overrides ONLY the proxy targets so
// the both-worlds evidence runner can boot its own lane-private ZCode server
// (:3130 by default) — required because the W3-025 default root experience is
// the FULL ZCode workspace, which needs the WS/API backend (the W1-011/W3-024
// runners never needed a server: they only exercised the commerce host).
//
// Never imported by product code; used by
// packages/web/test/browser/w3-025-both-worlds-evidence.mjs via
//   corepack pnpm --filter @zcode/web exec vite --config <this file> …
// The OAuth token proxy entry is preserved (token exchange keeps going to the
// configured product endpoint; the evidence callback step expects its honest
// failure state either way).

import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config.ts";

const serverPort = process.env.W3025_SERVER_PORT ?? "3130";

/** The repo config is a defineConfig(fn) — call it with the dev context. */
async function loadBaseConfig() {
  const resolved = await base({ command: "serve", mode: "development" });
  return resolved ?? {};
}

export default defineConfig(async () =>
  mergeConfig(await loadBaseConfig(), {
    server: {
      proxy: {
        "/ws": { target: `ws://localhost:${serverPort}`, ws: true },
        "/api": { target: `http://localhost:${serverPort}` },
      },
    },
  }),
);
