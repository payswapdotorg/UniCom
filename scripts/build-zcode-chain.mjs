#!/usr/bin/env node
// zcode-cli 子树依赖链构建 —— W2-027：fresh-clone 干净构建路径。
//
// 背景（tracking issue #20 / W2-026 STOP-AND-REPORT 披露的收口）：
//   `apps/zcode-cli/packages/dynamic-workflow` 的 `src/compiler/libs.generated.ts`
//   （~485KB，由该包自己的 `node scripts/generate-libs.mjs` 生成，刻意 gitignore）
//   以及链上各包的 `dist/` 在任何 fresh clone 里都不存在。根级 raw 路径
//   （`tsc -b packages/agent` 等一切传递包含该子树的 `tsc -b`）不会执行各包
//   自己的 build/typecheck 脚本（codegen 只存在于包脚本里），于是出现 ~40 个
//   误导性错误（TS2307 级联 + TS7006/TS2339/TS2353 退化产物）。子树本身在
//   正确顺序下是 type-clean 的 —— 债务是编排，不是代码。
//
// 本命令按依赖顺序构建整条链（每步用包自己的 build 脚本，dynamic-workflow 的
// codegen 因此包含在内），补齐 apps/zcode-cli 工作区对 turbo 的解析（root 的
// hoisted install 只把 turbo 提升到根 node_modules，而 `pnpm --dir
// apps/zcode-cli run ...` 的 PATH 只含该子工作区自己的 .bin），最后串行跑一遍
// 两条 typecheck 路径做自校验（低内存环境下并行 tsc 会被 OOM kill —— 与
// bootstrap.mjs 里 PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 的先例同类）。
//
// 用法：pnpm build:zcode:chain   （等价：node scripts/build-zcode-chain.mjs）

import process from "node:process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { runCommand } from "./spawn-command.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const cliWorkspaceDir = resolve(rootDir, "apps", "zcode-cli");

// 依赖顺序链：shared-types -> contracts -> dynamic-workflow（自带 generate-libs
// codegen）-> core -> agent-kernel。顺序不可调换：core 依赖 contracts 与
// dynamic-workflow 的 dist；agent-kernel 依赖 core 与 contracts 的 dist。
const CHAIN = [
  { filter: "@zcode/shared-types", note: "shared type vocabulary" },
  { filter: "@zcode/contracts", note: "domain contracts" },
  {
    filter: "@zcode/dynamic-workflow",
    note: "workflow engine (own script: generate-libs codegen + tsc)",
  },
  { filter: "@zcode/core", note: "runtime core" },
  { filter: "@unicom/agent-kernel", note: "agent kernel" },
];

function log(message) {
  console.log(`[zcode-chain] ${message}`);
}

function buildChain() {
  for (const step of CHAIN) {
    log(`build ${step.filter} — ${step.note}`);
    runCommand("pnpm", ["--filter", step.filter, "run", "build"], {
      cwd: rootDir,
      env: process.env,
    });
  }
}

// root 工作区是 node-linker=hoisted：turbo 与根 package.json 解析到同一个版本，
// 只被提升到根 node_modules；而 `pnpm --dir apps/zcode-cli run <script>` 的
// PATH 只包含该子工作区自己的 node_modules/.bin（它有自己的 pnpm-workspace.yaml，
// pnpm 以它为工作区根）。缺了这一步，子树自己的 canonical 命令
// （turbo run typecheck / build）在 fresh root install 下会报 `turbo: not found`。
// 这里把根安装的 turbo 以 pnpm 自身的链接形态桥接进子工作区（幂等；子工作区
// 已有 turbo 时不动）。子树自己的 pnpm-lock.yaml 已过期（缺 browser-use-plugin
// 等 8 个现存包），`--dir apps/zcode-cli install --frozen-lockfile` 不可行，
// 桥接是唯一不改动 lockfile 的解法。
function ensureCliTurboBridge() {
  const cliModulesDir = resolve(cliWorkspaceDir, "node_modules");
  const cliTurboDir = resolve(cliModulesDir, "turbo");
  const cliBinDir = resolve(cliModulesDir, ".bin");
  const cliBinTurbo = resolve(cliBinDir, "turbo");
  const rootTurboBin = resolve(rootDir, "node_modules", "turbo", "bin", "turbo");

  if (existsSync(cliBinTurbo)) {
    log("apps/zcode-cli already resolves turbo; bridge not needed");
    return;
  }
  if (!existsSync(rootTurboBin)) {
    throw new Error(
      "Missing turbo in the root install (node_modules/turbo). Run `pnpm install` at the repository root first.",
    );
  }

  mkdirSync(cliBinDir, { recursive: true });

  if (!existsSync(cliTurboDir)) {
    // "junction" 在 Windows 上无需开发者模式即可建目录链接，其他平台被忽略。
    symlinkSync(
      relative(cliModulesDir, resolve(rootDir, "node_modules", "turbo")),
      cliTurboDir,
      "junction",
    );
  }

  if (process.platform === "win32") {
    // 文件符号链接在 Windows 需要特权：改用 pnpm 同款的 cmd/sh shim 形态。
    writeFileSync(
      resolve(cliBinDir, "turbo.cmd"),
      '@ECHO off\r\nnode "%~dp0..\\turbo\\bin\\turbo" %*\r\n',
    );
    writeFileSync(cliBinTurbo, '#!/bin/sh\nexec node "$(dirname "$0")/../turbo/bin/turbo" "$@"\n');
  } else {
    symlinkSync("../turbo/bin/turbo", cliBinTurbo);
  }
  log("bridged the root-installed turbo into apps/zcode-cli (node_modules/.bin/turbo)");
}

// 自校验：本命令的契约是"之后两条 typecheck 路径都干净"。
// turbo 路径串行执行（TURBO_CONCURRENCY=1），避免低内存环境被 OOM kill；
// 串行结果会进入 turbo 本地缓存，随后的裸 `pnpm --dir apps/zcode-cli run
// typecheck` 全量命中缓存，同样 exit 0。
function verifyTypecheckPaths() {
  log("verify: raw project-reference path — pnpm exec tsc -b packages/agent");
  runCommand("pnpm", ["exec", "tsc", "-b", "packages/agent"], {
    cwd: rootDir,
    env: process.env,
  });
  log("verify: zcode-cli turbo path — pnpm --dir apps/zcode-cli run typecheck (serialized)");
  runCommand("pnpm", ["--dir", "apps/zcode-cli", "run", "typecheck"], {
    cwd: rootDir,
    env: { ...process.env, TURBO_CONCURRENCY: "1" },
  });
}

log("building the zcode-cli dependency-ordered chain (the fresh-clone clean build path)");
buildChain();
ensureCliTurboBridge();
verifyTypecheckPaths();
log("done: `tsc -b packages/agent` and `pnpm --dir apps/zcode-cli run typecheck` are both clean");
