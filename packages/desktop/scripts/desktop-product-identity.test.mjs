/**
 * W3-024 focused tests — desktop product identity (UNiCOM).
 *
 * Proves the Linux package name, executable name, product/app identity and
 * flavor separation consistently identify UNiCOM, that a preview/test build
 * stays unmistakable and never collides with the production identity, and
 * that the environment axis (ZCODE_ENV) stays separate from the identity
 * axis (ZCODE_PREVIEW_IDENTITY) exactly as before.
 *
 * Run: node --test packages/desktop/scripts/desktop-product-identity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZCODE_PREVIEW_IDENTITY_ENV,
  desktopProductIdentities,
  isPreviewIdentityRequested,
  resolveDesktopArtifactSuffix,
  resolveDesktopProductFlavor,
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
} from "./desktop-product-identity.mjs";

test("production identity is UNiCOM end to end (Linux names, product, appId)", () => {
  const identity = desktopProductIdentities.production;
  assert.equal(identity.flavor, "production");
  assert.equal(identity.productName, "UNiCOM");
  assert.equal(identity.linuxExecutableName, "unicom");
  assert.equal(identity.linuxPackageName, "unicom");
  assert.equal(identity.appId, "org.payswapdotorg.unicom");
  // Launcher identity must not collide with the upstream ZCode names.
  assert.notEqual(identity.linuxExecutableName, "zcode");
  assert.notEqual(identity.linuxPackageName, "zcode");
});

test("preview identity is UNiCOM Preview and never collides with production", () => {
  const preview = desktopProductIdentities.preview;
  const production = desktopProductIdentities.production;
  assert.equal(preview.flavor, "preview");
  assert.equal(preview.productName, "UNiCOM Preview");
  assert.equal(preview.linuxExecutableName, "unicom-preview");
  assert.equal(preview.linuxPackageName, "unicom-preview");
  assert.equal(preview.appId, "org.payswapdotorg.unicom.preview");
  assert.notEqual(preview.productName, production.productName);
  assert.notEqual(preview.linuxExecutableName, production.linuxExecutableName);
  assert.notEqual(preview.linuxPackageName, production.linuxPackageName);
  assert.notEqual(preview.appId, production.appId);
  // Preview still reads unmistakably as UNiCOM-branded, not ZCode-branded.
  assert.ok(preview.productName.startsWith("UNiCOM"));
});

test("flavor resolution keeps the environment axis separate from identity", () => {
  // test backend always previews — never ships the production identity.
  assert.equal(resolveDesktopProductFlavor({ ZCODE_ENV: "test" }), "preview");
  assert.equal(resolveDesktopProductFlavor({}), "preview");
  // production backend defaults to production identity…
  assert.equal(resolveDesktopProductFlavor({ ZCODE_ENV: "production" }), "production");
  // …unless a preview is explicitly requested on the identity axis.
  assert.equal(
    resolveDesktopProductFlavor({ ZCODE_ENV: "production", ZCODE_PREVIEW_IDENTITY: "1" }),
    "preview",
  );
  // unknown env spellings stay fail-safe on preview.
  assert.equal(resolveDesktopProductFlavor({ ZCODE_ENV: "staging" }), "preview");
});

test("resolveDesktopProductIdentity maps flavors to the UNiCOM identities", () => {
  assert.deepEqual(resolveDesktopProductIdentity({ ZCODE_ENV: "production" }), {
    flavor: "production",
    appId: "org.payswapdotorg.unicom",
    productName: "UNiCOM",
    linuxExecutableName: "unicom",
    linuxPackageName: "unicom",
    cuaHelperInstallVariant: null,
  });
  assert.deepEqual(resolveDesktopProductIdentity({}), {
    flavor: "preview",
    appId: "org.payswapdotorg.unicom.preview",
    productName: "UNiCOM Preview",
    linuxExecutableName: "unicom-preview",
    linuxPackageName: "unicom-preview",
    cuaHelperInstallVariant: "preview",
  });
});

test("preview identity switch accepts exactly one spelling", () => {
  assert.equal(isPreviewIdentityRequested({ [ZCODE_PREVIEW_IDENTITY_ENV]: "1" }), true);
  assert.equal(isPreviewIdentityRequested({ [ZCODE_PREVIEW_IDENTITY_ENV]: "0" }), false);
  assert.equal(isPreviewIdentityRequested({}), false);
  assert.throws(() => isPreviewIdentityRequested({ [ZCODE_PREVIEW_IDENTITY_ENV]: "true" }));
});

test("artifact suffix marks backend environment, not identity", () => {
  assert.equal(resolveDesktopArtifactSuffix({ ZCODE_ENV: "test" }), "_TEST");
  assert.equal(resolveDesktopArtifactSuffix({}), "_TEST");
  assert.equal(resolveDesktopArtifactSuffix({ ZCODE_ENV: "production" }), "");
});

test("packaged Windows AUMID follows the UNiCOM appIds; dev stays isolated", () => {
  assert.equal(
    resolveWindowsAppUserModelId({ ZCODE_ENV: "production" }, { isPackaged: true }),
    "org.payswapdotorg.unicom",
  );
  assert.equal(
    resolveWindowsAppUserModelId({}, { isPackaged: true }),
    "org.payswapdotorg.unicom.preview",
  );
  // Dev runtime keeps the legacy local identity so debug shortcuts never
  // pollute a packaged install's AUMID.
  assert.equal(
    resolveWindowsAppUserModelId({ ZCODE_ENV: "production" }, { isPackaged: false }),
    "cn.aminer.zcode",
  );
});
