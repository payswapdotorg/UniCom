/**
 * ⚠ TEST DOUBLE — fixture player for provider-adapter CI (W3-003).
 *
 * NOT PRODUCTION CODE (INVARIANT 39). This file lives ONLY in the test
 * tree and implements the `ProviderHttpPort` that production adapters
 * call: it replays provider-faithful RECORDED RESPONSES (fixture data in
 * `test/fixtures/providers/*-fixtures.ts`) against the adapter under
 * test, recording every request the adapter made. Adapter code under
 * `src/runtime/providers/**` contains zero mocks — the fixture player is
 * wired HERE, at the test boundary, exactly like a recorded VCR cassette.
 */

import type { ProviderHttpRequest, ProviderHttpResponse, ProviderHttpPort } from "../../../src/runtime/providers/transport";

/** One recorded response (status + headers + body). */
export interface FixtureResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

/** One scripted route: method + path pattern → ordered responses. */
export interface FixtureRoute {
  readonly method: string;
  readonly pathPattern: RegExp;
  /** Consumed in order; the LAST response repeats when the script runs out. */
  readonly responses: readonly FixtureResponse[];
}

/** Recording sleeper — captures planned backoff delays, never sleeps. */
export class RecordingSleeper {
  readonly delays: number[] = [];
  readonly sleep = async (delayMs: number): Promise<void> => {
    this.delays.push(delayMs);
  };
}

export class FixturePlayer implements ProviderHttpPort {
  private readonly routes: readonly FixtureRoute[];
  private readonly sequences = new Map<FixtureRoute, number>();
  readonly requests: ProviderHttpRequest[] = [];

  constructor(routes: readonly FixtureRoute[]) {
    this.routes = routes;
  }

  async request(call: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    this.requests.push({ ...call });
    const route = this.routes.find(
      (candidate) =>
        candidate.method === call.method &&
        candidate.pathPattern.test(call.path),
    );
    if (route === undefined) {
      throw new Error(
        `FIXTURE GAP: no recorded response for ${call.method} ${call.path} — the adapter requested something the recorded fixtures do not cover`,
      );
    }
    const consumed = this.sequences.get(route) ?? 0;
    this.sequences.set(route, consumed + 1);
    const response = route.responses[Math.min(consumed, route.responses.length - 1)];
    if (response === undefined) {
      throw new Error(`FIXTURE GAP: route ${route.method} ${route.pathPattern} has no responses`);
    }
    return { status: response.status, headers: { ...response.headers }, body: response.body };
  }

  /** Requests recorded so far for one method+path pattern. */
  requestsFor(method: string, pathPattern: RegExp): readonly ProviderHttpRequest[] {
    return this.requests.filter(
      (call) => call.method === method && pathPattern.test(call.path),
    );
  }
}

/** In-memory payload resolver double (payload data, never model context). */
export class PayloadStore {
  private readonly payloads = new Map<string, Readonly<Record<string, unknown>>>();

  constructor(entries: readonly [string, Readonly<Record<string, unknown>>][]) {
    for (const [ref, payload] of entries) this.payloads.set(ref, payload);
  }

  readonly resolve = (payloadRef: string): Readonly<Record<string, unknown>> | undefined => {
    const payload = this.payloads.get(payloadRef);
    return payload === undefined ? undefined : { ...payload };
  };
}

/** Deterministic clock (fixed base, advances 1 s per call). */
export function fixedClock(baseIso: string): () => string {
  let ticks = 0;
  return () => {
    const at = new Date(Date.parse(baseIso) + ticks * 1000).toISOString();
    ticks += 1;
    return at;
  };
}
