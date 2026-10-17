/**
 * W3-024 focused tests — pure decision logic of the UNiCOM default desktop
 * experience (workspace-first launches, staged commerce bundle resolution,
 * cross-context workspace message contract).
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

test("ordinary launch opens the UNiCOM commerce experience, not the workspace", () => {
  assert.equal(shouldOpenWorkspaceFirst({}), false);
  assert.equal(
    shouldOpenWorkspaceFirst({
      initialWorkspaceAbsPath: undefined,
      initialWorkspacePurpose: undefined,
      unavailableWorkspacePath: undefined,
    }),
    false,
  );
});

test("explicit workspace launch contexts open the retained ZCode workspace", () => {
  assert.equal(shouldOpenWorkspaceFirst({ initialWorkspaceAbsPath: "/home/me/repo" }), true);
  assert.equal(shouldOpenWorkspaceFirst({ initialWorkspacePurpose: "conversation" }), true);
  assert.equal(shouldOpenWorkspaceFirst({ unavailableWorkspacePath: "/gone/repo" }), true);
  assert.equal(
    shouldOpenWorkspaceFirst({ initialWorkspaceAbsPath: "", unavailableWorkspacePath: "" }),
    false,
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
