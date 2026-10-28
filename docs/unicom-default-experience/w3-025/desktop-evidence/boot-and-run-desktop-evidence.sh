#!/usr/bin/env bash
# W3-025 — DESKTOP both-worlds evidence environment orchestrator (lane-private).
#
# Boots everything the CDP runner (run-desktop-evidence.mjs) needs, runs it, and
# tears the lane-private processes down again — the TL accepts DEV desktop window
# evidence for this lane (documented choice; the packaged app embeds the SAME
# staged bundle this run embeds through VITE_UNICOM_COMMERCE_DEV_ORIGIN).
#
# What this script does (and why — see the completion report §desktop):
#   1. Xvfb on a free display (:101 by default) — no X server exists in the pod.
#   2. `vite preview` of the committed packages/web production build on
#      :5181 — the lane-private commerce dev origin (marker-verified build).
#   3. `vite dev` for the desktop renderer on :5174, started WITH
#      VITE_UNICOM_COMMERCE_DEV_ORIGIN so the renderer's commerce surface embeds
#      the REAL commerce host from :5181 (import.meta.env is baked at transform
#      time — the env var must be on the VITE process, not on electron).
#   4. A fresh isolated + SEEDED desktop home (the ordinary first-run state a
#      user reaches through upstream zcode's own UI — provider family domain, a
#      SYNTHETIC local-only API key that is never transmitted, dismissed
#      onboarding record), HOME + ZCODE_DESKTOP_HOME_DIR both pointed at it.
#   5. Electron unpackaged from a DEV APP-PATH SHIM: packages/.w3-025-dev-app/
#      (git-ignored scratch, created + removed by this script) whose package.json
#      carries the only thing the unpackaged dev runtime lacks and the packaged
#      app gets from electron-builder — a valid semver app version. Without it
#      electron-updater's `const { autoUpdater } = pkg` module-scope getter
#      constructs AppImageUpdater, app.getVersion() returns "0.0" (the desktop
#      package.json deliberately has no version — electron-builder injects it at
#      packaging) and the whole main bundle dies during import
#      ("App version is not a valid semver version: 0.0" — pre-existing dev-only
#      baseline condition, reproduced before this shim). The shim's main points
#      at ../desktop/out/main/index.js and sits two levels under the repo root so
#      app.getAppPath()-relative config resolution (../../config) is unchanged.
#      NO repo file is modified.
#   6. The tsup watch markers + out/ bundles must already exist (built from this
#      tree); this script verifies them and fails fast if stale/missing.
#   7. CDP evidence: run-desktop-evidence.mjs connects to the dev runtime's fixed
#      remote-debugging port 9229.
#
# Usage (from the repo root):
#   node docs/unicom-default-experience/w3-025/desktop-evidence/run-desktop-evidence.mjs --help
#   bash docs/unicom-default-experience/w3-025/desktop-evidence/boot-and-run-desktop-evidence.sh \
#     [--keep-env]   leave the environment up after the runner (for inspection)
#
# Everything is lane-private: ports 5174/5181/:101, an isolated HOME — the
# operator's live view (:3000/:3030, main tree) is never touched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/docs/unicom-default-experience/w3-025/desktop-evidence"
VITE_RENDER_LOG="${W3025_VITE_RENDER_LOG:-/tmp/w3-025-vite-renderer.log}"
VITE_PREVIEW_LOG="${W3025_VITE_PREVIEW_LOG:-/tmp/w3-025-vite-preview-commerce.log}"
ELECTRON_LOG="${W3025_ELECTRON_LOG:-/tmp/w3-025-electron-run.log}"
DISPLAY_NO="${W3025_DISPLAY:-101}"
SERVER_PORT="${W3025_COMMERCE_PORT:-5181}"     # vite preview (commerce dev origin)
RENDER_PORT="${W3025_RENDER_PORT:-5174}"       # desktop renderer vite dev
KEEP_ENV="${1:-}"

ELECTRON_BIN="$REPO_ROOT/node_modules/electron/dist/electron"
DEV_APP_SHIM="$REPO_ROOT/packages/.w3-025-dev-app"
DESKTOP_HOME="${W3025_DESKTOP_HOME:-/tmp/w3-025-desktop-home}"

log() { printf '[w3-025-desktop-env] %s\n' "$*"; }

# --- 0. preconditions --------------------------------------------------------
command -v curl >/dev/null || { echo "curl required" >&2; exit 1; }
[ -x "$ELECTRON_BIN" ] || { echo "electron binary missing ($ELECTRON_BIN)" >&2; exit 1; }
for marker in .main-build-ready .host-build-ready .preload-build-ready; do
  [ -f "$REPO_ROOT/packages/desktop/out/$marker" ] || {
    echo "desktop out/ marker missing: $marker — build first (tsup watch or one-shot)" >&2
    exit 1
  }
done
[ -f "$REPO_ROOT/packages/desktop/out/main/index.js" ] || { echo "out/main/index.js missing" >&2; exit 1; }
[ -f "$REPO_ROOT/packages/web/dist/index.html" ] || { echo "packages/web/dist missing — build it first (vite build)" >&2; exit 1; }

# --- 1. Xvfb -----------------------------------------------------------------
if ! pgrep -f "Xvfb :$DISPLAY_NO " >/dev/null 2>&1; then
  log "starting Xvfb on :$DISPLAY_NO"
  setsid Xvfb ":$DISPLAY_NO" -screen 0 1600x1000x24 >/tmp/w3-025-xvfb.log 2>&1 < /dev/null &
  sleep 2
fi
pgrep -f "Xvfb :$DISPLAY_NO " >/dev/null || { echo "Xvfb failed to start" >&2; exit 1; }

# --- 2. commerce dev origin (vite preview of the committed web build) --------
if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$SERVER_PORT/"; then
  log "starting vite preview (commerce dev origin) on :$SERVER_PORT"
  (cd "$REPO_ROOT/packages/web" && setsid nohup /home/z/.local/bin/pnpm exec vite preview \
      --port "$SERVER_PORT" --strictPort --host 127.0.0.1 > "$VITE_PREVIEW_LOG" 2>&1 < /dev/null &)
  for _ in $(seq 1 40); do
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$SERVER_PORT/" && break
    sleep 1
  done
fi
curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$SERVER_PORT/" || { echo "vite preview (commerce origin) failed" >&2; exit 1; }
log "commerce dev origin up on :$SERVER_PORT"

# --- 3. desktop renderer vite dev (kept as a child of THIS script so the
#        cleanup trap can tear it down with the whole process group; started
#        via setsid so `kill -- -PID` reaches the pnpm wrapper AND the vite
#        node child it spawns — the prior session's subshell form left
#        `VITE_PID=$!` INSIDE the subshell, the parent died at line 110 with
#        `VITE_PID: unbound variable` under `set -u`, and the orphaned vite
#        survived the script. Same env law: VITE_UNICOM_COMMERCE_DEV_ORIGIN is
#        baked at transform time, so it must ride the VITE process, not
#        electron.)
log "starting desktop renderer vite dev on :$RENDER_PORT"
(
  cd "$REPO_ROOT/packages/desktop"
  exec setsid env VITE_UNICOM_COMMERCE_DEV_ORIGIN="http://127.0.0.1:$SERVER_PORT" \
    NODE_OPTIONS=--max-old-space-size=1536 CHOKIDAR_USEPOLLING=true \
    /home/z/.local/bin/pnpm exec vite dev --port "$RENDER_PORT" --strictPort
) > "$VITE_RENDER_LOG" 2>&1 < /dev/null &
VITE_PID=$!
for _ in $(seq 1 60); do
  curl -s -o /dev/null --max-time 2 "http://localhost:$RENDER_PORT/" && break
  sleep 1
done
curl -s -o /dev/null --max-time 2 "http://localhost:$RENDER_PORT/" || { echo "renderer vite dev failed (see $VITE_RENDER_LOG)" >&2; exit 1; }
log "renderer vite dev up on :$RENDER_PORT (pid $VITE_PID)"

# --- 4. fresh seeded isolated home -------------------------------------------
rm -rf "$DESKTOP_HOME"
mkdir -p "$DESKTOP_HOME"
(cd "$REPO_ROOT" && node -e "
import('./packages/web/test/browser/w3-025-both-worlds-env.mjs').then((m) => {
  m.seedLaneServerHome(process.argv[1]);
}).catch((e) => { console.error(e); process.exit(1); });
" "$DESKTOP_HOME") || { echo "home seeding failed" >&2; exit 1; }
log "isolated desktop home seeded at $DESKTOP_HOME"

# --- 5. dev app-path shim (the missing packaged-app package.json version) ----
mkdir -p "$DEV_APP_SHIM"
cat > "$DEV_APP_SHIM/package.json" <<EOF
{
  "name": "@zcode/desktop",
  "version": "3.14.3",
  "private": true,
  "main": "../desktop/out/main/index.js"
}
EOF
log "dev app-path shim written at $DEV_APP_SHIM"

cleanup() {
  [ "${ELECTRON_PID:-}" ] && kill "-$ELECTRON_PID" 2>/dev/null || true
  [ "${ELECTRON_PID:-}" ] && kill "$ELECTRON_PID" 2>/dev/null || true
  # vite runs in its own session/process group (setsid) so the negative kill
  # reaches the pnpm wrapper AND the vite node child (a plain kill would only
  # take the wrapper and orphan vite holding :5174).
  [ "${VITE_PID:-}" ] && kill -- "-$VITE_PID" 2>/dev/null || true
  [ "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null || true
  rm -rf "$DEV_APP_SHIM"
  log "lane-private env torn down"
}
trap cleanup EXIT

# --- 6. electron (dev runtime, CDP 9229) --------------------------------------
log "starting electron (dev runtime under Xvfb :$DISPLAY_NO, CDP 9229)"
DISPLAY=":$DISPLAY_NO" HOME="$DESKTOP_HOME" ZCODE_DESKTOP_HOME_DIR="$DESKTOP_HOME" \
  ELECTRON_RENDERER_URL="http://localhost:$RENDER_PORT" \
  setsid "$ELECTRON_BIN" "$DEV_APP_SHIM" \
    --no-sandbox --disable-gpu --disable-dev-shm-usage > "$ELECTRON_LOG" 2>&1 < /dev/null &
ELECTRON_PID=$!
log "electron pid group $ELECTRON_PID (log $ELECTRON_LOG)"

for _ in $(seq 1 90); do
  curl -s -o /dev/null --max-time 2 http://127.0.0.1:9229/json/version && break
  sleep 2
done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:9229/json/version || {
  echo "electron CDP 9229 never came up (see $ELECTRON_LOG)" >&2
  exit 1
}
log "CDP up on 9229"

# --- 7. the evidence runner ---------------------------------------------------
# (set -e would abort at the failing runner before --keep-env can disarm the
#  trap — capture the exit code honestly instead.)
RUNNER_EXIT=0
node "$EVIDENCE_DIR/run-desktop-evidence.mjs" \
  --cdp-url http://127.0.0.1:9229 \
  --out-dir "$EVIDENCE_DIR" \
  --manifest "$EVIDENCE_DIR/desktop-both-worlds-manifest.json" || RUNNER_EXIT=$?

if [ "$KEEP_ENV" = "--keep-env" ]; then
  trap - EXIT
  log "--keep-env: leaving electron ($ELECTRON_PID), renderer vite ($VITE_PID), Xvfb :$DISPLAY_NO up"
fi
exit "$RUNNER_EXIT"
