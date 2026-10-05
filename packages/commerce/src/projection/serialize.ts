/**
 * Deterministic serialization for projections and the Commerce Twin.
 *
 * Two concerns, both required by W1-003 acceptance:
 * - `canonicalJson`: a BYTE-STABLE serialization (sorted object keys, no
 *   whitespace, undefined-valued properties omitted, arrays order-preserving).
 *   Two folds of the same journal must serialize to identical bytes — this is
 *   the "byte-identical rebuild" proof surface (scenario 2) and the
 *   snapshot-resume equivalence surface (scenario 3).
 * - `serializableClone`: a structured deep copy that preserves undefined
 *   properties and plain-object/array shapes, used to freeze checkpoints so
 *   resumed twins behave exactly like fully rebuilt ones.
 *
 * Determinism laws: no Map/Set/bigint ever enters canonical output (bigint
 * throws — money is integer minor-unit STRINGS in this domain, so a bigint in
 * projected state would be a corruption, detected here rather than silently
 * serialized); number values must be finite; property order is canonical.
 */
import type { AnyCommerceEvent } from "../domain/events.js";

/** Canonical deterministic JSON text (byte-stable across processes). */
export function canonicalJson(value: unknown): string {
  const out: string[] = [];
  writeCanonical(value, out);
  return out.join("");
}

function writeCanonical(value: unknown, out: string[]): void {
  if (value === null) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "string":
      out.push(JSON.stringify(value));
      return;
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonical serialization: non-finite number ${value}`);
      }
      out.push(JSON.stringify(value));
      return;
    case "bigint":
      throw new TypeError(
        "canonical serialization: bigint is not representable (commerce money is integer minor-unit strings)",
      );
    case "object":
      break;
    default:
      throw new TypeError(`canonical serialization: unsupported value type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    out.push("[");
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) out.push(",");
      writeCanonical(value[index], out);
    }
    out.push("]");
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    throw new TypeError("canonical serialization: Map/Set must be converted to plain arrays first");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  out.push("{");
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) continue;
    if (index > 0) out.push(",");
    out.push(JSON.stringify(key));
    out.push(":");
    writeCanonical(record[key], out);
  }
  out.push("}");
}

/**
 * Structured deep clone for checkpoint persistence: plain objects, arrays and
 * primitives copied recursively; undefined properties PRESERVED (unlike JSON);
 * Map/Set/bigint are rejected loudly (checkpoints store entry arrays).
 */
export function serializableClone<T>(value: T): T {
  return deepCopy(value, new WeakMap<object, unknown>()) as T;
}

function deepCopy(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null) return value;
  if (typeof value === "bigint") {
    throw new TypeError("serializableClone: bigint values are not checkpoint-representable");
  }
  if (typeof value !== "object") return value;
  if (value instanceof Map || value instanceof Set) {
    throw new TypeError("serializableClone: Map/Set must be converted to entry arrays first");
  }
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(deepCopy(item, seen));
    return copy;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    copy[key] = deepCopy((value as Record<string, unknown>)[key], seen);
  }
  return copy;
}

/** Deterministic journal fingerprint (ids + per-subject sequences, in order). */
export function journalFingerprint(events: readonly AnyCommerceEvent[]): string {
  return canonicalJson(
    events.map((event) => [event.eventId, event.sequence, `${event.subject.subjectType}:${event.subject.subjectId}`]),
  );
}
