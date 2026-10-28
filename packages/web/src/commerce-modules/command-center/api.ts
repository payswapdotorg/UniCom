/**
 * command-center — the commerce backend seam (W1-027, ready but inert).
 *
 * A single module-level configuration: the commerce API base URL from env
 * (`VITE_UNICOM_COMMERCE_API`, or `UNICOM_COMMERCE_API`). ABSENT or blank ⇒
 * demo mode: NO network call is ever made (the fetchers refuse before
 * touching the injected fetch — test-pinned in api.test.ts).
 *
 * The typed fetchers match the operator-approved contracts in the port
 * source's docs/BACKEND-ARCHITECTURE.md (Wave-1 API surface: stores /
 * decisions / missions / watch / heartbeat / skills / brief / commander
 * routes). Every fetcher returns an honest result — `{ ok: false, error }`
 * on any failure — so the state layer can fall back to the deterministic
 * demo data without a dead surface (graceful fallback, never a fake
 * success). `FetchLike` injection is how unit tests fake the network.
 */

import type {
  ChatMessage,
  Decision,
  Mission,
  MorningBrief,
  Skill,
  StoreConnection,
  WatchEvent,
} from "./data.js";

/** The single seam configuration (demo mode when baseUrl is null). */
export interface CommerceApiConfig {
  readonly baseUrl: string | null;
  /** Which env var provided the base URL (evidence for surfaces/logs). */
  readonly source: string | null;
}

/** Env keys honored, in order (Vite exposes VITE_-prefixed vars to the client). */
const ENV_KEYS: readonly string[] = ["VITE_UNICOM_COMMERCE_API", "UNICOM_COMMERCE_API"];

export function readCommerceApiBaseUrl(env: Record<string, unknown>): string | null {
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim().replace(/\/+$/, "");
    }
  }
  return null;
}

/** The module-level configuration (resolved once at module load from import.meta.env). */
export const commerceApiConfig: CommerceApiConfig = (() => {
  const env = (import.meta.env ?? {}) as unknown as Record<string, unknown>;
  const baseUrl = readCommerceApiBaseUrl(env);
  return {
    baseUrl,
    source: baseUrl === null ? null : ENV_KEYS.find((key) => typeof env[key] === "string") ?? null,
  };
})();

/** True when a commerce API base URL is configured (live mode). */
export function isLiveMode(config: CommerceApiConfig = commerceApiConfig): boolean {
  return config.baseUrl !== null;
}

/** The injectable network primitive (tests pass fakes; production passes fetch). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The error envelope every failing fetcher returns (never a thrown exception). */
export interface ApiFailure {
  readonly ok: false;
  readonly error: string;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | ApiFailure;

const DEMO_REFUSAL: ApiFailure = {
  ok: false,
  error: "demo-mode: no commerce API is configured — no network call was made",
};

/** Per-call abort budget (the backend architecture's 10s fetch-timeout law). */
const FETCH_TIMEOUT_MS = 10_000;

async function apiFetch<T>(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  path: string,
  init: { readonly method: "GET" | "POST"; readonly body?: unknown } = { method: "GET" },
): Promise<ApiResult<T>> {
  if (config.baseUrl === null) return DEMO_REFUSAL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error =
        typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `request failed: ${path} → HTTP ${response.status}`;
      return { ok: false, error };
    }
    if (body === null || typeof body !== "object") {
      return { ok: false, error: `malformed response (not JSON object): ${path}` };
    }
    return { ok: true, value: body as T };
  } catch (error) {
    return { ok: false, error: `unreachable: ${path} — ${String(error).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

function readArray<T>(body: Record<string, unknown>, field: string, path: string): ApiResult<readonly T[]> {
  const value = body[field];
  if (!Array.isArray(value)) return { ok: false, error: `malformed response (${path}): missing "${field}" array` };
  return { ok: true, value: value as readonly T[] };
}

/** Humanized UTC clock stamp (HH:MMZ) for locally recorded watch events. */
export function nowStamp(): string {
  return `${new Date().toISOString().slice(11, 16)}Z`;
}

// ─── C1: stores & connect ───────────────────────────────────────────────────

export async function fetchStores(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<readonly StoreConnection[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/stores");
  if (!result.ok) return result;
  return readArray<StoreConnection>(result.value, "stores", "/api/stores");
}

export async function createDemoStore(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  input: { readonly platform: string; readonly name?: string; readonly domain?: string },
): Promise<ApiResult<StoreConnection>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/stores/demo", {
    method: "POST",
    body: input,
  });
  if (!result.ok) return result;
  const store = result.value["store"];
  if (typeof store !== "object" || store === null) {
    return { ok: false, error: "malformed response (/api/stores/demo): missing \"store\"" };
  }
  return { ok: true, value: store as StoreConnection };
}

// ─── C3: governance (decisions / missions / watch / heartbeat / skills / brief) ──

export async function fetchDecisions(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<readonly Decision[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/decisions?status=open");
  if (!result.ok) return result;
  return readArray<Decision>(result.value, "decisions", "/api/decisions");
}

export async function resolveDecisionApi(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  id: string,
  verdict: "approved" | "declined",
): Promise<ApiResult<{ readonly id: string; readonly status: string }>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, `/api/decisions/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: { verdict },
  });
  if (!result.ok) return result;
  const decision = result.value["decision"];
  if (typeof decision !== "object" || decision === null) {
    return { ok: false, error: `malformed response (/api/decisions/${id}/resolve): missing "decision"` };
  }
  const record = decision as Record<string, unknown>;
  if (typeof record["id"] !== "string" || typeof record["status"] !== "string") {
    return { ok: false, error: `malformed response (/api/decisions/${id}/resolve): decision id/status missing` };
  }
  return { ok: true, value: { id: record["id"], status: record["status"] } };
}

export async function fetchMissions(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<readonly Mission[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/missions");
  if (!result.ok) return result;
  return readArray<Mission>(result.value, "missions", "/api/missions");
}

export async function fetchWatchEvents(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<readonly WatchEvent[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/watch?limit=50");
  if (!result.ok) return result;
  return readArray<WatchEvent>(result.value, "events", "/api/watch");
}

export interface HeartbeatPayload {
  readonly storesHealthy: number;
  readonly storesTotal: number;
  readonly openDecisions: number;
  readonly runningMissions: number;
  readonly ts: string;
}

export async function fetchHeartbeat(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<HeartbeatPayload>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/heartbeat");
  if (!result.ok) return result;
  const value = result.value;
  if (
    typeof value["storesHealthy"] !== "number" ||
    typeof value["storesTotal"] !== "number" ||
    typeof value["openDecisions"] !== "number" ||
    typeof value["runningMissions"] !== "number" ||
    typeof value["ts"] !== "string"
  ) {
    return { ok: false, error: "malformed response (/api/heartbeat): field missing" };
  }
  return {
    ok: true,
    value: {
      storesHealthy: value["storesHealthy"],
      storesTotal: value["storesTotal"],
      openDecisions: value["openDecisions"],
      runningMissions: value["runningMissions"],
      ts: value["ts"],
    },
  };
}

export async function fetchSkills(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<readonly Skill[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/skills");
  if (!result.ok) return result;
  return readArray<Skill>(result.value, "skills", "/api/skills");
}

export async function installSkillApi(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  skillId: string,
  input: { readonly storeId: string; readonly on: boolean },
): Promise<ApiResult<Skill>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, `/api/skills/${encodeURIComponent(skillId)}/install`, {
    method: "POST",
    body: input,
  });
  if (!result.ok) return result;
  const skill = result.value["skill"];
  if (typeof skill !== "object" || skill === null) {
    return { ok: false, error: `malformed response (/api/skills/${skillId}/install): missing "skill"` };
  }
  return { ok: true, value: skill as Skill };
}

export async function fetchBrief(config: CommerceApiConfig, fetchImpl: FetchLike): Promise<ApiResult<MorningBrief>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/brief");
  if (!result.ok) return result;
  const brief = result.value["brief"];
  if (typeof brief !== "object" || brief === null) {
    return { ok: false, error: "malformed response (/api/brief): missing \"brief\"" };
  }
  return { ok: true, value: brief as MorningBrief };
}

// ─── C2: commander ──────────────────────────────────────────────────────────

export async function sendCommanderChat(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  text: string,
): Promise<ApiResult<ChatMessage>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, "/api/commander/chat", {
    method: "POST",
    body: { text },
  });
  if (!result.ok) return result;
  const message = result.value["message"];
  if (typeof message !== "object" || message === null) {
    return { ok: false, error: "malformed response (/api/commander/chat): missing \"message\"" };
  }
  return { ok: true, value: message as ChatMessage };
}

export async function fetchCommanderHistory(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  limit = 50,
): Promise<ApiResult<readonly ChatMessage[]>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, `/api/commander/history?limit=${limit}`);
  if (!result.ok) return result;
  return readArray<ChatMessage>(result.value, "messages", "/api/commander/history");
}

/** The paced plan-reveal route: planDone is capped by elapsed time server-side. */
export async function fetchCommanderMessage(
  config: CommerceApiConfig,
  fetchImpl: FetchLike,
  id: string,
): Promise<ApiResult<ChatMessage>> {
  const result = await apiFetch<Record<string, unknown>>(config, fetchImpl, `/api/commander/messages/${encodeURIComponent(id)}`);
  if (!result.ok) return result;
  const message = result.value["message"];
  if (typeof message !== "object" || message === null) {
    return { ok: false, error: `malformed response (/api/commander/messages/${id}): missing "message"` };
  }
  return { ok: true, value: message as ChatMessage };
}
