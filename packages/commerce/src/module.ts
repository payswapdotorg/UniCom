/**
 * commerce 模块清单（Worker 1 — Commerce Truth / Economic Execution）。
 * 依赖声明与 architecture-policy.yaml 保持一致：Stage 0 合约阶段零外部模块依赖；
 * 对外只暴露 contract.ts（公开契约面）。
 * W1-002：runtime 层（确定性 Commerce Kernel 运行时）在 domain 层之上实现，
 * 仍然零外部模块依赖，公开入口不变。
 */
export const commerceModule = {
  id: "commerce",
  requires: [],
  provides: ["commerce-domain-contracts", "commerce-kernel-runtime"],
  publicEntrypoints: ["contract.ts"],
} as const;
