# @unicom/agent-kernel

UNiCOM agent-kernel adaptation (**W2-002**): wires the `@unicom/agent`
contracts into the ZCode agent kernel runtime through the kernel's own DI
seams — real runtime paths, not contract stubs.

## What this package is

An *adaptation layer* between two frozen surfaces:

- **Upstream**: `@unicom/agent` — the W2-001 intelligence/coordination
  contracts (MainAgent, attenuated delegates, canonical capability
  vocabulary with typed executability preconditions, trust/proof, security
  immune system, System 1 / JEPA / System 2 routing, opaque commerce seam).
- **Downstream**: the ZCode agent kernel (`@zcode/core`, `@zcode/contracts`)
  — `AgentRuntime`, tool registry + executor, subagent runner, skill port,
  model factory.

The kernel's designed extension seams are used *as intended* (same
composition pattern as `bootstrap/src/app/workflow-facade.ts`
`createWorkflowChildRuntime`): no ZCode kernel source file is modified.

## Kernel-enforced contracts

| Contract | Kernel enforcement point |
| --- | --- |
| One Main Agent principal + session ownership | `UnicomAgentPlane.createRuntime` binds an `ActiveTask`; `createActiveTask` refuses non-Main-Agent principals |
| Skills as default specialization | `UnicomSkillRegistry.toKernelSkillPort` feeds the REAL kernel `Skill` tool; `defaultSkillForCapability` routes deterministically |
| Ephemeral, attenuated, revocable delegates | `UnicomDelegateRegistry` on the kernel subagent runner (`createExploreSubagentPort`): grants are principal-prepared, `validateDelegation` gates spawn, authority-derived tool allowlist, gated registry, budget/expiry/revocation on every action |
| Typed executability preconditions | `UnicomCapabilityGate` (bound tools) checked inside the gated registry BEFORE handlers run: `CATALOG_ONLY_NO_CONNECTED_INSTANCE`, `NO_CURRENT_OBSERVATION` (UNKNOWN ≠ FAILED), `DISCONNECTED`, `INSUFFICIENT_CREDENTIAL_SCOPE`, … |
| Credentials never enter model context | `guardModelForContext` wraps the runtime's Model: deep key redaction + JSON-shaped pair scrubbing on every provider request |
| System 1 / JEPA / System 2 routing | `UnicomModelRouter` at the model factory seam: deterministic `routeModelTask` policy; delegate routing tasks derive from typed attenuation facts |
| Security BLOCK is final | `UnicomSecurityGate` freezes blocked tool surfaces; refusals are byte-identical; `requestSecurityOverride` cannot lift a BLOCK |
| Strategy ≠ Organization | `UnicomStrategyOrganizationStore`: distinct runtime objects; delegate dispatch requires a validated organization |
| Opaque, idempotent commerce seam | `UnicomCommerceMediator`: proof pin before consequential execution, explicit GroupBuy/TradeCycle gates, idempotent submissions; the plane never owns commerce state |

## Install on a kernel session

```ts
import { UnicomAgentPlane } from "@unicom/agent-kernel";

const plane = new UnicomAgentPlane({
  mainAgent,                    // @unicom/agent MainAgent contract
  backingModelFactory,          // host adapter stack
  commerceCommandPort,          // Worker 1's runtime port (optional; absent = fail closed)
  routeModels,                  // per routing class (optional)
  skills,                       // SkillDefinition[] (optional)
});

const { runtime } = plane.createRuntime({
  sessionId,
  deps: { eventStore },         // modelFactory supplied by the plane's router
  config: { mode: "yolo", modelSelection, workingDirectory, envInfo },
});
await runtime.executeTurn("...");
```

## Where the tests live

Runtime tests live in `packages/agent/test/runtime/` (vitest) and drive REAL
`AgentRuntime` turns with scripted deterministic models. The vitest global
setup builds this package's dist closure through the repo turbo pipeline, so
`pnpm --filter @unicom/agent test` is self-sufficient.
