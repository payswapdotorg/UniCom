/**
 * W2-002 runtime test harness — scripted deterministic Model.
 *
 * A TEST-ONLY Model implementing the kernel's `Model` contract. It plays a
 * fixed script of tool calls / text turns and records every request it
 * receives, so tests can assert exactly what crossed the model-context
 * boundary and which routed model class served a turn. It is used only by
 * the test files under `packages/agent/test/` — nothing here is reachable
 * from production paths.
 */

import type {
  Model,
  ModelEvent,
  ModelId,
  ModelInputMessage,
  ModelOptions,
  ModelProviderId,
  ModelRequest,
  ModelResult,
  ModelSelection,
  ModelToolContract,
} from "@zcode/contracts";

/** One scripted model step: tool calls, then a final text step. */
export type ScriptedStep =
  | { readonly toolCalls: readonly { readonly name: string; readonly input: unknown }[] }
  | { readonly text: string }
  | { readonly error: Error };

export interface ScriptedModelScript {
  readonly steps: readonly ScriptedStep[];
}

export interface ScriptedModel extends Model {
  /** Requests received so far (assertion surface). */
  readonly requests: readonly ModelRequest[];
  /** Names of tools the model was offered (visibility surface). */
  readonly offeredToolNames: readonly string[];
  readonly selection: ModelSelection;
}

const SCRIPTED_PROPERTIES = {
  requiresMfjsToolSchema: false,
  contextWindow: 128_000,
  inputFormat: {
    supportsText: true,
    supportsImage: false,
    supportsVideo: false,
    supportsAudio: false,
    supportsPdf: false,
  },
  outputFormat: { supportsText: true },
  supportsToolCall: true,
  supportsJsonSchemaOutput: false,
  supportsNativeWebSearch: false,
  supportsMidConversationSystem: false,
} as const;

const SCRIPTED_OPTION_SPECS = {
  reasoningLevel: { values: ["low", "high"], map: "{'reasoning_effort': reasoningLevel}" },
  maxOutputTokens: { max: 8_192, map: "{'max_tokens': maxOutputTokens}" },
} as const;

function renderStep(step: ScriptedStep, request: ModelRequest, callPrefix: string): ModelResult {
  if ("error" in step) throw step.error;
  if ("toolCalls" in step) {
    return {
      text: "",
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      toolCalls: step.toolCalls.map((call, index) => ({
        id: `${callPrefix}_${index}`,
        name: call.name,
        input: call.input,
      })),
    };
  }
  void request;
  return {
    text: step.text,
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  };
}

export function createScriptedModel(
  selection: ModelSelection,
  script: ScriptedModelScript,
): ScriptedModel {
  const requests: ModelRequest[] = [];
  let cursor = 0;
  const model: ScriptedModel = {
    providerId: selection.providerId as ModelProviderId,
    modelId: selection.modelId as ModelId,
    displayName: `${selection.providerId}/${selection.modelId}`,
    properties: SCRIPTED_PROPERTIES,
    optionSpecs: SCRIPTED_OPTION_SPECS,
    options: {},
    selection,
    get requests() {
      return [...requests];
    },
    get offeredToolNames() {
      const names = (requests[requests.length - 1]?.tools ?? []).map(
        (tool: ModelToolContract) => tool.name,
      );
      return [...names];
    },
    bind(options?: ModelOptions): Model {
      return { ...model, options: options ?? {} } as Model;
    },
    async generateText(request: ModelRequest): Promise<ModelResult> {
      requests.push(cloneRequest(request));
      const step = script.steps[cursor] ?? { text: "script exhausted" };
      const callPrefix = `call_${cursor}`;
      cursor += 1;
      return renderStep(step, request, callPrefix);
    },
    async *streamText(request: ModelRequest): AsyncGenerator<ModelEvent> {
      const result = await model.generateText(request);
      yield { type: "start" } as ModelEvent;
      yield {
        type: "text",
        text: result.text,
        snapshot: result.text,
      } as unknown as ModelEvent;
    },
  };
  return model;
}

function cloneRequest(request: ModelRequest): ModelRequest {
  return {
    ...request,
    messages: request.messages.map((message: ModelInputMessage) => ({ ...message })),
    ...(request.tools ? { tools: [...request.tools] } : {}),
  };
}

/** A factory over scripted models keyed by selection identity. */
export function createScriptedModelFactory(models: readonly ScriptedModel[]) {
  return (input: { selection: ModelSelection }): Model => {
    const match = models.find(
      (model) =>
        model.providerId === input.selection.providerId &&
        model.modelId === input.selection.modelId,
    );
    if (!match) {
      throw new Error(
        `no scripted model registered for ${input.selection.providerId}/${input.selection.modelId}`,
      );
    }
    return match;
  };
}
