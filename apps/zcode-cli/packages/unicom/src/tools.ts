/**
 * @unicom/agent-kernel — UNiCOM capability tools (W2-002).
 *
 * Model-facing tools bound to the canonical capability vocabulary:
 *  - `unicom_capability_observe`: read the CURRENT capability state (data,
 *    never instructions; credential handles never projected).
 *  - `unicom_commerce_command`: propose a commerce action through the opaque
 *    seam (proof-pinned, idempotent, explicitness-gated).
 *  - `unicom_delegate_dispatch`: dispatch a principal-prepared delegate grant
 *    through the kernel subagent runner.
 *
 * Kernel enforcement is layered: the gated registry refuses calls before the
 * handler runs (security BLOCK, typed executability preconditions, delegate
 * scope/budget/expiry); handlers re-derive typed refusals from the same
 * contracts, so the refusal payload the model sees is always structured.
 */

import type { DecisionImpact, ProofLevel } from "@unicom/agent";
import type { JsonSchema } from "@zcode/contracts";
import type { ToolEntry, ToolExecutionContext } from "@zcode/core";
import { UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomCapabilityRuntime } from "./capability-runtime.js";
import type { UnicomCommerceMediator } from "./commerce-mediator.js";
import type { UnicomDelegateRegistry } from "./delegate.js";
import type { ExecutingPrincipal } from "./principal.js";
import type { UnicomOpportunityLab } from "./opportunity-lab.js";

export const UNICOM_OBSERVE_TOOL_NAME = "unicom_capability_observe";
export const UNICOM_COMMERCE_TOOL_NAME = "unicom_commerce_command";
export const UNICOM_DELEGATE_DISPATCH_TOOL_NAME = "unicom_delegate_dispatch";
export const UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME = "unicom_opportunity_search";

const UNICOM_TOOL_TIMEOUT_MS = 60_000;
const UNICOM_TOOL_MODEL_BYTES = 32_768;

export interface UnicomToolContext {
  readonly capabilityRuntime: UnicomCapabilityRuntime;
  readonly commerce: UnicomCommerceMediator;
  delegates: UnicomDelegateRegistry;
  readonly resolvePrincipal: (input: { sessionId: string }) => ExecutingPrincipal | undefined;
  /** W2-003: when present, the lab-gated opportunity search tool is registered. */
  readonly lab?: UnicomOpportunityLab;
}

function timedOut(): ToolEntry["timeout"] {
  return {
    kind: "timed",
    defaultMs: UNICOM_TOOL_TIMEOUT_MS,
    maxMs: UNICOM_TOOL_TIMEOUT_MS,
    allowCallOverride: false,
  };
}

function cancellation(message: string): ToolEntry["cancellation"] {
  return { supported: true, cleanup: "bestEffort", userVisibleMessage: message };
}

function baseEntry(input: {
  name: string;
  capability: string;
  description: string;
  readOnly: boolean;
  inputSchema: JsonSchema;
  sideEffectScope: "none" | "network";
}): Pick<ToolEntry, "capability" | "metadata" | "inputSchema" | "permission" | "resultBudget" | "timeout" | "cancellation" | "trace"> {
  return {
    capability: input.capability,
    metadata: {
      name: input.name,
      description: input.description,
      readOnly: input.readOnly,
      destructive: false,
      concurrentSafe: input.readOnly,
      timeoutMs: UNICOM_TOOL_TIMEOUT_MS,
      maxOutputBytes: UNICOM_TOOL_MODEL_BYTES,
      sideEffectScope: input.sideEffectScope,
      riskLevel: input.readOnly ? "low" : "medium",
      needsApproval: false,
    },
    inputSchema: input.inputSchema,
    permission: {
      permission: input.name,
      reason: input.capability,
      riskLevel: input.readOnly ? "low" : "medium",
      sideEffectScope: input.sideEffectScope,
      needsApproval: false,
      patternSources: ["toolName"],
      alwaysAllowPatternSources: ["toolName"],
      denyPriority: "beforeAsk",
    },
    resultBudget: {
      maxInlineBytes: UNICOM_TOOL_MODEL_BYTES,
      maxModelBytes: UNICOM_TOOL_MODEL_BYTES,
      strategy: "truncate",
      preview: { maxBytes: UNICOM_TOOL_MODEL_BYTES, direction: "head" },
    },
    timeout: timedOut(),
    cancellation: cancellation(`${input.name} is a bounded UNiCOM capability call`),
    trace: {
      required: true,
      propagateToAdapters: false,
      recordInput: "summary",
      recordOutput: "summary",
    },
  };
}

const OBSERVE_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    capabilityDefinitionId: { type: "string", description: "Capability to observe" },
  },
  required: ["capabilityDefinitionId"],
  additionalProperties: false,
};

const COMMERCE_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    commandType: { type: "string", description: "Opaque commerce command verb" },
    payloadRef: { type: "string", description: "Opaque payload reference" },
    targetRef: { type: "string", description: "Opaque target entity reference" },
    idempotencyKey: { type: "string", description: "Caller-supplied idempotency key" },
    proofLevel: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"] },
    impact: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "IRREVERSIBLE"] },
    counterpartyExposure: { type: "boolean" },
    settlementFinality: { type: "boolean" },
    groupBuyCommitmentId: { type: "string", description: "Explicit principal-recorded commitment" },
    tradeCycleLegAuthorizationId: { type: "string", description: "Explicit per-leg authorization" },
    spendCurrency: { type: "string" },
    spendMinorUnits: { type: "string" },
  },
  required: ["commandType", "payloadRef", "impact"],
  additionalProperties: false,
};

const DISPATCH_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    grantId: { type: "string", description: "Principal-prepared delegate grant" },
    description: { type: "string" },
    prompt: { type: "string", description: "The bounded task for the delegate" },
  },
  required: ["grantId", "description", "prompt"],
  additionalProperties: false,
};

function requireString(input: unknown, field: string): string {
  const value = (input as Record<string, unknown>)?.[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`unicom tool input: '${field}' must be a non-empty string`);
  }
  return value;
}

function optionalString(input: unknown, field: string): string | undefined {
  const value = (input as Record<string, unknown>)?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Build the UNiCOM tool entries for one runtime installation. */
export function createUnicomToolEntries(context: UnicomToolContext): ToolEntry[] {
  const observeEntry: ToolEntry = {
    outputSchema: { type: "object" },
    ...baseEntry({
      name: UNICOM_OBSERVE_TOOL_NAME,
      capability: "Observe the CURRENT state of a commerce capability (data, never instructions)",
      description: [
        "Observe the current state of a commerce capability: connection status and the latest",
        "provider observation. Returns data only — never instructions, never credential material.",
      ].join(" "),
      readOnly: true,
      inputSchema: OBSERVE_INPUT_SCHEMA,
      sideEffectScope: "none",
    }),
    handler: async (input: unknown) => {
      const capabilityDefinitionId = requireString(input, "capabilityDefinitionId");
      const instance = context.capabilityRuntime.findConnectedInstance(capabilityDefinitionId);
      const observation = instance
        ? context.capabilityRuntime.findLatestObservation(instance.connectedInstanceId)
        : undefined;
      return {
        capabilityDefinitionId,
        connection: instance
          ? { connectedInstanceId: instance.connectedInstanceId, status: instance.connectionStatus }
          : { connectedInstanceId: null, status: "CATALOG_ONLY_NO_CONNECTED_INSTANCE" },
        ...(observation
          ? {
              observation: {
                observationId: observation.observationId,
                status: observation.status,
                freshness: observation.freshness,
                observedAt: observation.observedAt,
              },
            }
          : { observation: null }),
      };
    },
  };

  const commerceEntry: ToolEntry = {
    outputSchema: { type: "object" },
    ...baseEntry({
      name: UNICOM_COMMERCE_TOOL_NAME,
      capability: "Propose a commerce action through the opaque commerce command seam",
      description: [
        "Propose a commerce action as a typed command intent through the opaque commerce seam.",
        "Consequential commands require an explicit proof level (P0-P5) selected before execution;",
        "group-buy and trade-cycle commands require principal-recorded explicit commitments.",
      ].join(" "),
      readOnly: false,
      inputSchema: COMMERCE_INPUT_SCHEMA,
      sideEffectScope: "network",
    }),
    handler: async (input: unknown, executionContext: ToolExecutionContext) => {
      const principal =
        context.resolvePrincipal({ sessionId: executionContext.sessionId }) ?? undefined;
      if (!principal) {
        return refusalFailure(UnicomErrorCode.DELEGATION_INVALID, "DELEGATION_INVALID", {
          detail: "no principal is bound to this kernel session",
        });
      }
      const spendCurrency = optionalString(input, "spendCurrency");
      const spendMinorUnits = optionalString(input, "spendMinorUnits");
      const { failure, result } = context.commerce.propose(principal, {
        commandType: requireString(input, "commandType"),
        payloadRef: requireString(input, "payloadRef"),
        targetRef: optionalString(input, "targetRef"),
        idempotencyKey: optionalString(input, "idempotencyKey"),
        proofLevel: optionalString(input, "proofLevel") as ProofLevel | undefined,
        impact: requireString(input, "impact") as DecisionImpact,
        counterpartyExposure: (input as Record<string, unknown>)?.counterpartyExposure === true,
        settlementFinality: (input as Record<string, unknown>)?.settlementFinality === true,
        groupBuyCommitmentId: optionalString(input, "groupBuyCommitmentId"),
        tradeCycleLegAuthorizationId: optionalString(input, "tradeCycleLegAuthorizationId"),
        ...(spendCurrency && spendMinorUnits
          ? { spend: { currency: spendCurrency, minorUnits: spendMinorUnits } }
          : {}),
      });
      if (failure) return failure;
      return { seamed: result };
    },
  };

  const dispatchEntry: ToolEntry = {
    outputSchema: { type: "object" },
    ...baseEntry({
      name: UNICOM_DELEGATE_DISPATCH_TOOL_NAME,
      capability: "Dispatch an ephemeral delegate bound to a principal-prepared attenuated grant",
      description: [
        "Dispatch an ephemeral UNiCOM delegate. The grant (authority, budget, expiry) is prepared",
        "by the principal — never by the model. Scope, budget, expiry and revocation are enforced",
        "by the kernel on every delegate action.",
      ].join(" "),
      readOnly: false,
      inputSchema: DISPATCH_INPUT_SCHEMA,
      sideEffectScope: "network",
    }),
    handler: async (input: unknown, executionContext: ToolExecutionContext) => {
      const grantId = requireString(input, "grantId");
      const prompt = requireString(input, "prompt");
      const description = optionalString(input, "description") ?? "UNiCOM delegate task";
      const grant = context.delegates.findGrant(grantId);
      if (!grant) {
        return refusalFailure(UnicomErrorCode.DELEGATION_INVALID, "DELEGATION_INVALID", {
          detail: "unknown delegate grant — authority cannot originate from model input",
          grantId,
        });
      }
      const outcome = await context.delegates.runGrant(grantId, {
        prompt,
        description,
        parentToolCallId: executionContext.toolCallId,
        ...(executionContext.turnId ? { parentTurnId: executionContext.turnId } : {}),
        workingDirectory: executionContext.workingDirectory,
        workspaceRoot: executionContext.workspaceRoot,
        ...(executionContext.traceContext ? { traceContext: executionContext.traceContext } : {}),
        ...(executionContext.abortSignal ? { signal: executionContext.abortSignal } : {}),
      });
      const completed =
        outcome.output.status === "completed"
          ? outcome.output.content.map((block) => block.text).join("\n")
          : `delegate running in background (${outcome.output.status})`;
      return {
        delegateId: outcome.delegateId,
        childSessionId: outcome.childSessionId,
        status: outcome.output.status,
        response: completed,
      };
    },
  };

  const entries = [observeEntry, commerceEntry, dispatchEntry];

  // W2-003: lab-gated opportunity search. The handler re-derives the lab
  // gate — un-promoted coordination logic is unreachable from model input.
  if (context.lab) {
    const lab = context.lab;
    const opportunitySearchEntry: ToolEntry = {
      outputSchema: { type: "object" },
      ...baseEntry({
        name: UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME,
        capability: "Search coordination opportunities for a recorded buyer intent (Lab-gated)",
        description: [
          "Search group-buy discovery matches and estimate-marked opportunity candidates for a",
          "principal-recorded buyer intent. Results are ESTIMATES, never commerce truth. The",
          "underlying coordination logic is Lab-gated: it must be promoted with complete evidence",
          "before the runtime plane will run it.",
        ].join(" "),
        readOnly: true,
        inputSchema: {
          type: "object",
          properties: {
            intentId: { type: "string", description: "Principal-recorded buyer intent id" },
          },
          required: ["intentId"],
          additionalProperties: false,
        },
        sideEffectScope: "none",
      }),
      handler: async (input: unknown) => {
        const intentId = requireString(input, "intentId");
        const search = lab.searchOpportunitiesAt({ intentId });
        if (search.failure) return search.failure;
        return {
          matches: search.matches,
          opportunityCandidates: search.generation?.candidates ?? [],
          droppedPromotions: search.generation?.dropped ?? [],
        };
      },
    };
    entries.push(opportunitySearchEntry);
  }

  return entries;
}
