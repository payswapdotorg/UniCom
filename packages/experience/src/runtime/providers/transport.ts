/**
 * Provider HTTP transport port (W3-003).
 *
 * Real provider adapters speak to their provider over THIS port. Production
 * wires `createFetchProviderHttp` (real network); CI wires the fixture
 * player that lives in the TEST tree (`test/fixtures/`), which replays
 * provider-faithful recorded responses. The adapter code itself contains
 * zero mocks — dependency direction guarantees INVARIANT 39.
 *
 * Also hosts small deterministic helpers shared by adapters:
 * - RFC 5988 `Link` header parsing (Shopify cursor pagination);
 * - query-string building with stable key order (signature-safe).
 */

/** One provider HTTP call. */
export interface ProviderHttpRequest {
  readonly method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Full path including query string (no origin). */
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** A recorded provider HTTP response. */
export interface ProviderHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * The port real adapters call. Implementations:
 * - production: `createFetchProviderHttp` (below);
 * - CI: the fixture player in the test tree (a TEST DOUBLE, never shipped).
 */
export interface ProviderHttpPort {
  request(call: ProviderHttpRequest): Promise<ProviderHttpResponse>;
}

/** Case-insensitive header lookup. */
export function headerOf(response: ProviderHttpResponse, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(response.headers)) {
    if (key.toLowerCase() === wanted) return response.headers[key];
  }
  return undefined;
}

/** One parsed `Link` header relation. */
export interface LinkRelation {
  readonly url: string;
  readonly rel: string;
}

/**
 * Parse an RFC 5988 `Link` header value, e.g.
 * `<https://shop.example/admin/api/2024-01/products.json?page_info=hijg&limit=2>; rel="next"`
 */
export function parseLinkHeader(value: string | undefined): readonly LinkRelation[] {
  if (value === undefined) return [];
  const relations: LinkRelation[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    const urlMatch = /^<([^>]+)>\s*;(.*)$/.exec(trimmed);
    if (urlMatch === null) continue;
    const relMatch = /rel\s*=\s*"([^"]+)"/.exec(urlMatch[2] ?? "");
    if (relMatch === null) continue;
    relations.push({ url: urlMatch[1] ?? "", rel: relMatch[1] ?? "" });
  }
  return relations;
}

/** Extract the `page_info` cursor from a Link relation URL (Shopify). */
export function pageCursorOf(linkUrl: string): string | undefined {
  const query = linkUrl.slice(linkUrl.indexOf("?") + 1);
  for (const pair of query.split("&")) {
    const [key, value] = pair.split("=");
    if (key === "page_info" && value !== undefined && value.length > 0) {
      return decodeURIComponent(value);
    }
  }
  return undefined;
}

/** Build a query string from entries, preserving insertion order. */
export function buildQuery(entries: readonly [string, string][]): string {
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * Production transport over the platform `fetch`. NEVER used by CI — CI
 * fixtures are the merge gate; real-network journeys only run where
 * credentials are provisioned (work-order constraint).
 */
export function createFetchProviderHttp(origin: string): ProviderHttpPort {
  return {
    async request(call: ProviderHttpRequest): Promise<ProviderHttpResponse> {
      const response = await fetch(`${origin}${call.path}`, {
        method: call.method,
        headers: call.headers,
        body: call.body,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: response.status, headers, body: await response.text() };
    },
  };
}
