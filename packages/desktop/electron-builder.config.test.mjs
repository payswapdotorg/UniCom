/**
 * W3-024 focused tests — electron-builder packaging identity consumption.
 *
 * Imports the REAL config module (same import the bundler performs) and
 * proves the packaged metadata identifies UNiCOM: product name, Linux
 * executable/package names, appId, maintainer/homepage, UNiCOM launcher
 * icon files on disk, the staged web-dist commerce bundle resource, the
 * Linux target set for the intended Ubuntu artifacts (deb + AppImage), and
 * the renderer window title. A spawned production-env variant proves the
 * production identity flows through the config the same way.
 *
 * Run: node --test packages/desktop/electron-builder.config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = HERE;
const REPO_ROOT = resolve(HERE, "../..");

test("config imports cleanly under the ambient (test-backend) environment", async () => {
  const config = (await import("./electron-builder.config.js")).default;
  // Ambient env has no ZCODE_ENV → preview flavor: the honest default for a
  // test backend build.
  assert.equal(config.productName, "UNiCOM Preview");
  assert.equal(config.appId, "org.payswapdotorg.unicom.preview");
  assert.equal(config.linux.executableName, "unicom-preview");
  assert.equal(config.deb.packageName, "unicom-preview");
  assert.equal(config.rpm.packageName, "unicom-preview");
  assert.equal(config.pacman.packageName, "unicom-preview");
});

test("Linux targets include the intended Ubuntu artifacts (deb + AppImage)", async () => {
  const config = (await import("./electron-builder.config.js")).default;
  assert.ok(config.linux.target.includes("AppImage"));
  assert.ok(config.linux.target.includes("deb"));
});

test("packaged metadata identifies UNiCOM (maintainer, homepage, author)", async () => {
  const config = (await import("./electron-builder.config.js")).default;
  assert.equal(config.linux.maintainer, "UNiCOM <payswapdotorg@users.noreply.github.com>");
  assert.equal(config.extraMetadata.homepage, "https://github.com/payswapdotorg/UniCom");
  assert.equal(config.extraMetadata.author.name, "UNiCOM");
  assert.equal(config.linux.category, "Office");
  // The deep-link protocol display name follows the product identity.
  assert.deepEqual(config.protocols, [{ name: config.productName, schemes: ["zcode"] }]);
});

test("UNiCOM launcher icons exist on disk and are wired into the package", async () => {
  const config = (await import("./electron-builder.config.js")).default;
  assert.equal(config.linux.icon, "build/unicom/icon.png");
  const iconPath = resolve(DESKTOP_ROOT, config.linux.icon);
  assert.ok(existsSync(iconPath), `missing UNiCOM icon: ${iconPath}`);
  // PNG magic + 512x512 IHDR dimensions.
  const png = readFileSync(iconPath);
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);

  const iconResources = config.extraResources.filter((entry) => entry.to === "icon.png");
  assert.equal(iconResources.length, 1);
  assert.equal(iconResources[0].from, "build/unicom/icon.png");
  assert.ok(existsSync(resolve(DESKTOP_ROOT, iconResources[0].from)));
  const hicolor = config.extraResources.filter((entry) => entry.to === "icon_512x512.png");
  assert.equal(hicolor.length, 1);
  assert.equal(hicolor[0].from, "build/unicom/icon.png");
});

test("the staged web-dist commerce bundle resource is declared with map pruning", async () => {
  const config = (await import("./electron-builder.config.js")).default;
  const staged = config.extraResources.filter((entry) => entry.to === "web-dist");
  assert.equal(staged.length, 1);
  assert.equal(staged[0].from, resolve(REPO_ROOT, "packages/web/dist"));
  assert.deepEqual(staged[0].filter, ["**/*", "!**/*.map"]);
});

test("production environment flows the production UNiCOM identity through the config", () => {
  const probe = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        `const mod = await import(${JSON.stringify(`file://${resolve(DESKTOP_ROOT, "electron-builder.config.js")}`)});`,
        "const c = mod.default;",
        "console.log(JSON.stringify({",
        "  productName: c.productName,",
        "  appId: c.appId,",
        "  executableName: c.linux.executableName,",
        "  debPackage: c.deb.packageName,",
        "}));",
      ].join(""),
    ],
    {
      env: { ...process.env, ZCODE_ENV: "production", ZCODE_PREVIEW_IDENTITY: "0" },
      encoding: "utf8",
    },
  ).trim();
  const parsed = JSON.parse(probe);
  assert.deepEqual(parsed, {
    productName: "UNiCOM",
    appId: "org.payswapdotorg.unicom",
    executableName: "unicom",
    debPackage: "unicom",
  });
});

test("desktop and web renderer window titles identify UNiCOM (startup loading screens too)", async () => {
  const desktopHtml = readFileSync(resolve(DESKTOP_ROOT, "src/renderer/index.html"), "utf8");
  assert.match(desktopHtml, /<title>UNiCOM<\/title>/);
  assert.doesNotMatch(desktopHtml, /<title>ZCode<\/title>/);
  assert.match(desktopHtml, /startup-wordmark[^>]*>UNiCOM</);
  assert.match(desktopHtml, /UNiCOM is starting/);

  const webHtml = readFileSync(resolve(REPO_ROOT, "packages/web/index.html"), "utf8");
  assert.match(webHtml, /<title>UNiCOM<\/title>/);
  assert.doesNotMatch(webHtml, /<title>ZCode<\/title>/);
  assert.match(webHtml, /zcode-boot-loading__wordmark[^>]*>UNiCOM</);
  assert.match(webHtml, /UNiCOM is starting/);
});
