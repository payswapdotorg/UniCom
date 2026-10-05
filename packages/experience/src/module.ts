/**
 * experience 模块清单：UNiCOM 体验/连接器/物理边缘/部署边界契约（Stage 0）
 * 与连接器运行时 + 浏览器会话隔离运行时（W3-002）。
 *
 * W3-002 起建立到 @unicom/agent 的类型化接缝：能力词汇表（CapabilityDefinition →
 * ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation）
 * 一律通过 @unicom/agent 公开入口消费（invariant 34：仓库内唯一词汇表）。
 * W3-003 增补：规范连接器执行（传输端口、退避引擎、错误分类法、模式权限矩阵、
 * 六个 provider 适配器、浏览器专用/直播/文件连接器、LocalCommerceEdge、
 * 旅程执行器、遥测）。W3-004 增补：无 RFID 的物理商务边缘（POS 导入连接器、
 * 称重商品运行时、离线重放冲突规则、对账旅程规划器）与直播商务 UX 契约。
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
    "first-provider-adapters",
    "provider-mode-permission-matrix",
    "connector-telemetry-journey-evidence",
    "local-commerce-edge-runtime",
    "browser-only-connector",
    "live-commerce-connector",
    "feed-file-connector",
    "pos-import-connector-path",
    "weighted-product-runtime",
    "exact-integer-money-math",
    "offline-replay-conflict-rules",
    "reconciliation-journey-planner",
    "live-commerce-session-ux-contract",
    "live-session-delivery-runtime",
  ],
  publicEntrypoints: [
    "packages/experience/src/contract.ts",
    "packages/experience/src/runtime/index.ts",
  ],
} as const;
