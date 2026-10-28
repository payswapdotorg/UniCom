/**
 * W3-025 focused tests — pure decision logic of the UNiCOM both-worlds
 * desktop experience (operator correction 2026-10-24: EVERY launch opens the
 * native ZCode workspace after admission; commerce is one labelled action
 * away; staged/dev-server commerce bundle resolution; cross-context
 * workspace message contract).
 *
 * Run: node --test packages/desktop/src/renderer/src/unicomDefaultExperience.test.mjs
 * (Node 24 type stripping imports the .ts module directly; the module is
 * deliberately import-free so no bundler is needed.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNICOM_COMMERCE_BUNDLE_DIR,
  UNICOM_SURFACE_PARAM,
  UNICOM_WORKSPACE_MESSAGE_TYPE,
  isUnicomWorkspaceMessage,
  resolveCommerceFrameSrc,
  shouldOpenWorkspaceFirst,
} from "./unicomDefaultExperience.ts";

test("ordinary launch (app-managed conversation workspace) opens the native ZCode workspace", () => {
  // W3-025 both-worlds law: the workspace is the primary experience for EVERY
  // launch — the conversation backing workspace is agent cwd plumbing, not a
  // signal to demote the workspace (W3-024 routed it to commerce; reversed).
  assert.equal(shouldOpenWorkspaceFirst({}), true);
  assert.equal(
    shouldOpenWorkspaceFirst({
      initialWorkspaceAbsPath: "/home/z/.zcode/workspace/default",
      initialWorkspacePurpose: "conversation",
    }),
    true,
  );
});

test("user-directed workspace launches open the ZCode workspace too (unchanged)", () => {
  // createOpenWorkspaceStartupBootstrap: a folder the user chose.
  assert.equal(
    shouldOpenWorkspaceFirst({
      initialWorkspaceAbsPath: "/home/me/repo",
      initialWorkspacePurpose: "project",
    }),
    true,
  );
  // Read-only restore of a moved/deleted workspace (Root handles it).
  assert.equal(shouldOpenWorkspaceFirst({ unavailableWorkspacePath: "/gone/repo" }), true);
  assert.equal(
    shouldOpenWorkspaceFirst({ initialWorkspaceAbsPath: "", unavailableWorkspacePath: "" }),
    true,
  );
});

test("packaged runtime resolves the staged commerce bundle with the surface override", () => {
  const resolution = resolveCommerceFrameSrc({
    localDevelopmentRuntime: false,
    pageUrl: "file:///opt/UNiCOM/resources/app.asar/out/renderer/index.html?locale=en-US",
  });
  assert.equal(resolution.reason, "staged-bundle");
  assert.ok(resolution.src, "expected a frame src");
  const url = new URL(resolution.src);
  assert.equal(url.searchParams.get(UNICOM_SURFACE_PARAM), "commerce");
  assert.ok(
    url.pathname.endsWith(`/${UNICOM_COMMERCE_BUNDLE_DIR}/index.html`),
    `unexpected bundle path: ${url.pathname}`,
  );
  // Three levels below the resources root, next to the app.asar.
  assert.equal(
    url.pathname,
    "/opt/UNiCOM/resources/web-dist/index.html",
    `unexpected resolution: ${url.pathname}`,
  );
});

test("development runtime honestly reports no staged bundle (no fake commerce)", () => {
  const resolution = resolveCommerceFrameSrc({
    localDevelopmentRuntime: true,
    pageUrl: "http://localhost:5174/?locale=en-US",
  });
  assert.deepEqual(resolution, { src: null, reason: "dev-runtime-fallback" });
});

test("development runtime with a dev origin embeds the REAL commerce host", () => {
  const resolution = resolveCommerceFrameSrc({
    localDevelopmentRuntime: true,
    pageUrl: "http://localhost:5174/?locale=en-US",
    commerceDevOrigin: "http://127.0.0.1:5180",
  });
  assert.equal(resolution.reason, "dev-server");
  assert.ok(resolution.src, "expected a frame src");
  const url = new URL(resolution.src);
  assert.equal(url.origin, "http://127.0.0.1:5180");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get(UNICOM_SURFACE_PARAM), "commerce");
  // A blank/whitespace origin keeps the honest fallback.
  assert.deepEqual(
    resolveCommerceFrameSrc({
      localDevelopmentRuntime: true,
      pageUrl: "http://localhost:5174/",
      commerceDevOrigin: "   ",
    }),
    { src: null, reason: "dev-runtime-fallback" },
  );
});

test("the workspace message contract matches the staged web bundle contract", () => {
  assert.equal(UNICOM_WORKSPACE_MESSAGE_TYPE, "unicom:open-workspace");
  assert.equal(isUnicomWorkspaceMessage({ type: "unicom:open-workspace" }), true);
  assert.equal(isUnicomWorkspaceMessage({ type: "something-else" }), false);
  assert.equal(isUnicomWorkspaceMessage(null), false);
  assert.equal(isUnicomWorkspaceMessage("unicom:open-workspace"), false);
  assert.equal(isUnicomWorkspaceMessage(undefined), false);
});

test("the surface override parameter matches the web resolver contract", () => {
  assert.equal(UNICOM_SURFACE_PARAM, "unicomSurface");
});
