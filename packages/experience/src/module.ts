/**
 * experience 模块清单：UNiCOM 体验/连接器/物理边缘/部署边界契约（Stage 0）
 * 与连接器运行时 + 浏览器会话隔离运行时（W3-002）。
 *
 * W3-002 起建立到 @unicom/agent 的类型化接缝：能力词汇表（CapabilityDefinition →
 * ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation）
 * 一律通过 @unicom/agent 公开入口消费（invariant 34：仓库内唯一词汇表）。
 * 对外公开入口：contract.ts（契约）与 runtime/index.ts（运行时）。
 */
export const experienceModule = {
  id: "experience",
  requires: ["agent"],
  provides: [
    "experience-surface-boundaries",
    "navigation-discovery-contracts",
    "connector-transport-boundaries",
    "browser-session-isolation-boundary",
    "local-commerce-edge-boundary",
    "offline-observation-queue-boundary",
    "deployment-adapter-boundaries",
    "connector-runtime-framework",
    "browser-session-runtime-isolation",
    "connector-credential-vaulting",
    "execution-mode-dispatch-plumbing",
    "transport-coverage-plumbing",
  ],
  publicEntrypoints: [
    "packages/experience/src/contract.ts",
    "packages/experience/src/runtime/index.ts",
  ],
} as const;
