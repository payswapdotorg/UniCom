/**
 * commerce 模块清单（Worker 1 — Commerce Truth / Economic Execution）。
 * 依赖声明与 architecture-policy.yaml 保持一致：Stage 0 合约阶段零外部模块依赖；
 * 对外只暴露 contract.ts（公开契约面）。
 * W1-002：runtime 层（确定性 Commerce Kernel 运行时）在 domain 层之上实现，
 * 仍然零外部模块依赖，公开入口不变。
 * W1-003：projection 层（Commerce Twin + 事件投影）在 domain 之上、runtime 之下
 * （layerOrder: domain → projection → runtime），只依赖 domain —— Twin 只从事件
 * 日志推导状态，结构上不可能引用内核运行时。仍然零外部模块依赖，公开入口不变。
 */
export const commerceModule = {
  id: "commerce",
  requires: [],
  provides: ["commerce-domain-contracts", "commerce-kernel-runtime", "commerce-twin-projections"],
  publicEntrypoints: ["contract.ts"],
} as const;
// W1-004：结账完成 / 支付生命周期（部分+全额捕获、部分+全额退款、冲正守卫）、
// 结算三态（UNKNOWN 永不变成 money-in）、追索原语（争议生命周期、退单强制退款、
// 商誉退款与政策退款可区分）、自主门店运营词汇（现金会话、交接、对账差异显式入账），
// 以及全部新命令面上的孪生验证。依赖不变：仅 domain（runtime/projection 各自单向）、
// 公开入口不变。
// W1-005：自主门店确定性运行时（autonomous-store deterministic runtime）——
// 在 W1-004 门店运营词汇之上组合完整营业周期（open → operate → close →
// reconcile）：营业周期聚合、策略应用全部入账（POLICY_APPLIED）、自主补货
// 触发 + 采购单发起（消费限额内）、带前后痕迹的价格调整、显式升级状态
// （现金差异/盘点不符/越界违规均入账，绝不吞掉）、人工接管与权限交接
// （带权限强制的入账主体迁移）、确定性时间源驱动的日键/周期键、任意日志
// 前缀重放确定性，以及覆盖全部新面的孪生验证。依赖不变：仅 domain
// （projection/runtime 各自单向），公开入口不变。
