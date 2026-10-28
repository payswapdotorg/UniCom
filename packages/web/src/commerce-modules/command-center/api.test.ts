/**
 * command-center API-seam tests (W1-027): the commerce backend seam is
 * ready-but-inert. Pinned laws:
 * - DEMO MODE MAKES ZERO NETWORK CALLS: with no base URL configured, every
 *   fetcher refuses BEFORE touching the injected fetch (the fake records any
 *   call — there must be none);
 * - live mode hits the exact routes of the port source's
 *   docs/BACKEND-ARCHITECTURE.md contracts with the right method/body;
 * - every failure path (HTTP error envelope, network rejection, malformed
 *   JSON, missing fields) returns an honest { ok: false, error } — graceful
 *   fallback to demo data, never a thrown exception, never a fake success.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDemoStore,
  fetchBrief,
  fetchCommanderHistory,
  fetchCommanderMessage,
  fetchDecisions,
  fetchHeartbeat,
  fetchMissions,
  fetchSkills,
  fetchStores,
  fetchWatchEvents,
  installSkillApi,
  readCommerceApiBaseUrl,
  resolveDecisionApi,
  sendCommanderChat,
} from "./api.js";

const DEMO_CONFIG = { baseUrl: null, source: null };
const LIVE_CONFIG = { baseUrl: "https://commerce.example", source: "VITE_UNICOM_COMMERCE_API" };

/** A fetch fake that records calls and answers with canned JSON. */
function fakeFetch(answer: { readonly status?: number; readonly body?: unknown } = { status: 200, body: {} }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 }));
  };
  return { impl, calls };
}

function jsonFetch(body: unknown, status = 200) {
  return (_url: string, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readCommerceApiBaseUrl (the single module-level config)", () => {
  it("is absent without either env key — demo mode", () => {
    expect(readCommerceApiBaseUrl({})).toBeNull();
    expect(readCommerceApiBaseUrl({ VITE_UNICOM_COMMERCE_API: "  ", UNICOM_COMMERCE_API: "" })).toBeNull();
  });

  it("prefers VITE_UNICOM_COMMERCE_API and trims trailing slashes", () => {
    expect(readCommerceApiBaseUrl({ VITE_UNICOM_COMMERCE_API: "https://api.example/ " })).toBe("https://api.example");
    expect(readCommerceApiBaseUrl({ UNICOM_COMMERCE_API: "https://api.example//" })).toBe("https://api.example");
  });
});

describe("demo mode (no base URL): zero network calls", () => {
  it("every fetcher refuses before touching the injected fetch", async () => {
    const { impl, calls } = fakeFetch();
    const readFetchers = [
      () => fetchStores(DEMO_CONFIG, impl),
      () => fetchDecisions(DEMO_CONFIG, impl),
      () => fetchMissions(DEMO_CONFIG, impl),
      () => fetchWatchEvents(DEMO_CONFIG, impl),
      () => fetchHeartbeat(DEMO_CONFIG, impl),
      () => fetchSkills(DEMO_CONFIG, impl),
      () => fetchBrief(DEMO_CONFIG, impl),
      () => fetchCommanderHistory(DEMO_CONFIG, impl),
      () => fetchCommanderMessage(DEMO_CONFIG, impl, "m-1"),
    ];
    for (const read of readFetchers) {
      const result = await read();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("demo-mode");
    }
    const writes = [
      () => createDemoStore(DEMO_CONFIG, impl, { platform: "shopify" }),
      () => resolveDecisionApi(DEMO_CONFIG, impl, "d-1", "approved"),
      () => installSkillApi(DEMO_CONFIG, impl, "price-sentinel", { storeId: "halcyon", on: true }),
      () => sendCommanderChat(DEMO_CONFIG, impl, "hello"),
    ];
    for (const write of writes) {
      const result = await write();
      expect(result.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });
});

describe("live mode: the BACKEND-ARCHITECTURE.md route contracts", () => {
  it("GET /api/stores → { stores }", async () => {
    const { impl, calls } = fakeFetch({ body: { stores: [{ id: "halcyon" }] } });
    const result = await fetchStores(LIVE_CONFIG, impl);
    expect(result.ok && result.value[0]?.id).toBe("halcyon");
    expect(calls[0]?.url).toBe("https://commerce.example/api/stores");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("POST /api/stores/demo with the platform/name/domain body", async () => {
    const { impl, calls } = fakeFetch({ body: { store: { id: "minted" } } });
    const result = await createDemoStore(LIVE_CONFIG, impl, { platform: "shopify", name: "Mint", domain: "mint.com" });
    expect(result.ok && result.value.id).toBe("minted");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(String(calls[0]?.init?.body)).toBe(JSON.stringify({ platform: "shopify", name: "Mint", domain: "mint.com" }));
  });

  it("GET /api/decisions?status=open → { decisions }", async () => {
    const { impl, calls } = fakeFetch({ body: { decisions: [] } });
    await fetchDecisions(LIVE_CONFIG, impl);
    expect(calls[0]?.url).toBe("https://commerce.example/api/decisions?status=open");
  });

  it("POST /api/decisions/:id/resolve with the verdict body", async () => {
    const { impl, calls } = fakeFetch({ body: { decision: { id: "d-1", status: "executed" } } });
    const result = await resolveDecisionApi(LIVE_CONFIG, impl, "d-1", "approved");
    expect(result.ok && result.value.status).toBe("executed");
    expect(calls[0]?.url).toBe("https://commerce.example/api/decisions/d-1/resolve");
    expect(String(calls[0]?.init?.body)).toBe(JSON.stringify({ verdict: "approved" }));
  });

  it("GET /api/watch?limit=50 → { events }; GET /api/missions → { missions }; GET /api/skills → { skills }", async () => {
    const watch = fakeFetch({ body: { events: [] } });
    await fetchWatchEvents(LIVE_CONFIG, watch.impl);
    expect(watch.calls[0]?.url).toBe("https://commerce.example/api/watch?limit=50");
    const missions = fakeFetch({ body: { missions: [] } });
    await fetchMissions(LIVE_CONFIG, missions.impl);
    expect(missions.calls[0]?.url).toBe("https://commerce.example/api/missions");
    const skills = fakeFetch({ body: { skills: [] } });
    await fetchSkills(LIVE_CONFIG, skills.impl);
    expect(skills.calls[0]?.url).toBe("https://commerce.example/api/skills");
  });

  it("GET /api/heartbeat → the strip payload (typed fields validated)", async () => {
    const { impl } = fakeFetch({
      body: { storesHealthy: 3, storesTotal: 3, openDecisions: 1, runningMissions: 1, ts: "07:04Z" },
    });
    const result = await fetchHeartbeat(LIVE_CONFIG, impl);
    expect(result.ok && result.value.openDecisions).toBe(1);
    const malformed = jsonFetch({ storesHealthy: "three" });
    const bad = await fetchHeartbeat(LIVE_CONFIG, malformed);
    expect(bad.ok).toBe(false);
  });

  it("POST /api/skills/:id/install with { storeId, on }", async () => {
    const { impl, calls } = fakeFetch({ body: { skill: { id: "price-sentinel" } } });
    const result = await installSkillApi(LIVE_CONFIG, impl, "price-sentinel", { storeId: "halcyon", on: true });
    expect(result.ok && result.value.id).toBe("price-sentinel");
    expect(calls[0]?.url).toBe("https://commerce.example/api/skills/price-sentinel/install");
    expect(String(calls[0]?.init?.body)).toBe(JSON.stringify({ storeId: "halcyon", on: true }));
  });

  it("GET /api/brief → { brief }; commander chat/history/message routes", async () => {
    const brief = fakeFetch({ body: { brief: { date: "2026-10-19", summary: "", checks: [], numbers: [] } } });
    expect((await fetchBrief(LIVE_CONFIG, brief.impl)).ok).toBe(true);
    expect(brief.calls[0]?.url).toBe("https://commerce.example/api/brief");
    const chat = fakeFetch({ body: { message: { id: "c-9", role: "agent", text: "hi" } } });
    const chatResult = await sendCommanderChat(LIVE_CONFIG, chat.impl, "why did Etsy jump?");
    expect(chatResult.ok && chatResult.value.id).toBe("c-9");
    expect(chat.calls[0]?.init?.method).toBe("POST");
    expect(String(chat.calls[0]?.init?.body)).toBe(JSON.stringify({ text: "why did Etsy jump?" }));
    const history = fakeFetch({ body: { messages: [] } });
    await fetchCommanderHistory(LIVE_CONFIG, history.impl, 50);
    expect(history.calls[0]?.url).toBe("https://commerce.example/api/commander/history?limit=50");
    const message = fakeFetch({ body: { message: { id: "c-1", role: "agent", text: "paced" } } });
    await fetchCommanderMessage(LIVE_CONFIG, message.impl, "c-1");
    expect(message.calls[0]?.url).toBe("https://commerce.example/api/commander/messages/c-1");
  });
});

describe("graceful fallback: every failure path returns an honest error", () => {
  it("HTTP error with the backend's error envelope surfaces its message", async () => {
    const impl = jsonFetch({ error: "oauth-not-configured", hint: "Add keys" }, 501);
    const result = await createDemoStore(LIVE_CONFIG, impl, { platform: "etsy" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("oauth-not-configured");
  });

  it("HTTP error without a parsable body names the route and status", async () => {
    const impl = (_url: string, _init?: RequestInit): Promise<Response> =>
      Promise.resolve(new Response("<html>", { status: 502 }));
    const result = await fetchStores(LIVE_CONFIG, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP 502");
  });

  it("network rejection is an unreachable error, never a thrown exception", async () => {
    const impl = (_url: string, _init?: RequestInit): Promise<Response> => Promise.reject(new Error("ECONNREFUSED"));
    const result = await fetchStores(LIVE_CONFIG, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unreachable");
  });

  it("a 200 with a missing or malformed field is an honest failure", async () => {
    expect((await fetchStores(LIVE_CONFIG, jsonFetch({ nope: true }))).ok).toBe(false);
    expect((await fetchStores(LIVE_CONFIG, jsonFetch(null))).ok).toBe(false);
    expect((await createDemoStore(LIVE_CONFIG, jsonFetch({}))).ok).toBe(false);
    expect((await resolveDecisionApi(LIVE_CONFIG, jsonFetch({ decision: {} }), "d-1", "approved")).ok).toBe(false);
    expect((await sendCommanderChat(LIVE_CONFIG, jsonFetch({}))).ok).toBe(false);
    expect((await fetchBrief(LIVE_CONFIG, jsonFetch({}))).ok).toBe(false);
    expect((await fetchCommanderHistory(LIVE_CONFIG, jsonFetch({}))).ok).toBe(false);
    expect((await fetchCommanderMessage(LIVE_CONFIG, jsonFetch({}), "m-1")).ok).toBe(false);
    expect((await installSkillApi(LIVE_CONFIG, jsonFetch({}), "s", { storeId: "x", on: true })).ok).toBe(false);
  });
});
