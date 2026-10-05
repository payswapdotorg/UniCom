/**
 * @unicom/agent-kernel — model-context credential guard (W2-002).
 *
 * Credentials, cookies, MFA codes and browser storage NEVER enter model
 * context. The kernel enforces this at the model boundary: the plane wraps
 * the runtime's Model so every request's messages are deep-scanned and
 * redacted (contract `redactCredentialMaterial`) and text-embedded
 * JSON-shaped credential pairs are scrubbed, before the provider request is
 * issued. Deterministic: identical inputs produce identical redactions.
 */

import { redactCredentialMaterial, type CredentialRedactionFinding } from "@unicom/agent";
import type { Model, ModelEvent, ModelRequest, ModelResult } from "@zcode/contracts";

export interface UnicomContextGuardReport {
  readonly redaction: readonly CredentialRedactionFinding[];
  readonly textScrubCount: number;
}
export interface UnicomContextGuardSink {
  (report: UnicomContextGuardReport): void;
}

const CREDENTIAL_KEY_SOURCE =
  "credential|cookie|token|secret|password|passphrase|browserstorage|sessionid|mfa|otp";
const KEY_CHARS = "[A-Za-z0-9_-]*";

/** Quoted credential key followed by a quoted string value. */
const CREDENTIAL_STRING_PAIR = new RegExp(
  `(["'])(${KEY_CHARS}(?:${CREDENTIAL_KEY_SOURCE})${KEY_CHARS})\\1(\\s*:\\s*)(["'])(?:[^"\\\\]|\\\\.)*\\4`,
  "gi",
);
/** Quoted credential key followed by a scalar (number / boolean / null). */
const CREDENTIAL_SCALAR_PAIR = new RegExp(
  `(["'])(${KEY_CHARS}(?:${CREDENTIAL_KEY_SOURCE})${KEY_CHARS})\\1(\\s*:\\s*)(-?\\d+(?:\\.\\d+)?|true|false|null)`,
  "gi",
);

const REDACTED_VALUE = `"[REDACTED:credential-material]"`;

/** Assignment-style credential pair (env / YAML / prose): key = "value". */
const CREDENTIAL_ASSIGNMENT_PAIR = new RegExp(
  `\\b(${KEY_CHARS}(?:${CREDENTIAL_KEY_SOURCE})${KEY_CHARS})(\\s*[=:]\\s*)(["'])(?:[^"\\\\]|\\\\.)*\\3`,
  "gi",
);

/** Scrub credential-shaped JSON pairs embedded in text payloads. */
export function scrubCredentialPairsFromText(text: string): { text: string; scrubCount: number } {
  const stringMatches = text.match(CREDENTIAL_STRING_PAIR)?.length ?? 0;
  const scalarMatches = text.match(CREDENTIAL_SCALAR_PAIR)?.length ?? 0;
  const assignmentMatches = text.match(CREDENTIAL_ASSIGNMENT_PAIR)?.length ?? 0;
  const total = stringMatches + scalarMatches + assignmentMatches;
  if (total === 0) return { text, scrubCount: 0 };
  const scrubbed = text
    .replace(CREDENTIAL_STRING_PAIR, `$1$2$1$3${REDACTED_VALUE}`)
    .replace(CREDENTIAL_SCALAR_PAIR, "$1$2$1$3null")
    .replace(CREDENTIAL_ASSIGNMENT_PAIR, `$1$2${REDACTED_VALUE}`);
  return { text: scrubbed, scrubCount: total };
}

function isTextual(value: unknown): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

interface MutableGuardReport {
  redaction: CredentialRedactionFinding[];
  textScrubCount: number;
}

function redactTextualContent(content: unknown, report: MutableGuardReport): unknown {
  if (typeof content === "string") {
    const result = scrubCredentialPairsFromText(content);
    report.textScrubCount += result.scrubCount;
    return result.text;
  }
  if (Array.isArray(content)) {
    return content.map((block) => redactTextualContent(block, report));
  }
  if (isTextual(content)) {
    const result = scrubCredentialPairsFromText(content.text);
    report.textScrubCount += result.scrubCount;
    return { ...content, text: result.text };
  }
  return content;
}

/**
 * Redact one model request in place per contract semantics: deep key redaction
 * over the message objects plus text scrubbing inside string / text-block
 * content (where serialized tool results live).
 */
export function guardModelRequest(request: ModelRequest): UnicomContextGuardReport {
  const report: MutableGuardReport = { redaction: [], textScrubCount: 0 };
  const { redacted, findings } = redactCredentialMaterial(request.messages);
  report.redaction = [...findings];
  request.messages = redacted as ModelRequest["messages"];
  for (const message of request.messages) {
    if (message && typeof message === "object") {
      const mutable = message as { content?: unknown };
      if (mutable.content !== undefined) {
        mutable.content = redactTextualContent(mutable.content, report);
      }
    }
  }
  return report;
}

/** Wrap a Model so every request is sanitized at the model-context boundary. */
export function guardModelForContext(model: Model, sink?: UnicomContextGuardSink): Model {
  const wrapped: Model = {
    providerId: model.providerId,
    modelId: model.modelId,
    displayName: model.displayName,
    properties: model.properties,
    optionSpecs: model.optionSpecs,
    options: model.options,
    bind(options) {
      return guardModelForContext(model.bind(options), sink);
    },
    async generateText(request: ModelRequest): Promise<ModelResult> {
      const report = guardModelRequest(request);
      if (report.redaction.length > 0 || report.textScrubCount > 0) sink?.(report);
      return model.generateText(request);
    },
    async *streamText(request: ModelRequest): AsyncGenerator<ModelEvent> {
      const report = guardModelRequest(request);
      if (report.redaction.length > 0 || report.textScrubCount > 0) sink?.(report);
      yield* model.streamText(request);
    },
  };
  return wrapped;
}
