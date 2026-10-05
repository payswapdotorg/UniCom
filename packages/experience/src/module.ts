/**
 * experience 模块清单：UNiCOM 体验/连接器/物理边缘/部署边界契约（Stage 0）。
 * 依赖声明与 architecture-policy.yaml 保持一致；对外只暴露 contract.ts。
 * Stage 0 独立交付：不依赖 @unicom/agent（W2-001 并行中），能力词汇一律
 * 通过不透明引用消费；W3-002 将建立类型化接缝。
 */
export const experienceModule = {
  id: "experience",
  requires: [],
  provides: [
    "experience-surface-boundaries",
    "navigation-discovery-contracts",
    "connector-transport-boundaries",
    "browser-session-isolation-boundary",
    "local-commerce-edge-boundary",
    "offline-observation-queue-boundary",
    "deployment-adapter-boundaries",
  ],
  publicEntrypoints: ["packages/experience/src/contract.ts"],
} as const;
