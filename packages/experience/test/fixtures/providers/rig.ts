/**
 * ⚠ TEST DOUBLE — shared assembly harness for provider-adapter CI (W3-003).
 *
 * NOT PRODUCTION CODE. Wires the REAL adapter (production code under
 * `src/runtime/providers/**`) against the fixture player + in-memory
 * vault + recording sleeper, and exposes a per-suite vault-audit view so
 * every suite can assert credential-boundary law with the same helpers:
 * material presented only at the adapter's own execution boundary, and
 * no sealed value anywhere in runtime-visible state.
 */

import { createCredentialVault, type CredentialVault } from "../../../src/runtime/connector/vault";
import type { AdapterPayloadResolver } from "../../../src/runtime/providers/provider-adapter-core";
import { FixturePlayer, PayloadStore, RecordingSleeper, type FixtureRoute } from "./player";

/** One assembled provider CI rig (player + vault + sleeper + payloads). */
export interface ProviderRig {
  readonly player: FixturePlayer;
  readonly vault: CredentialVault;
  readonly sleeper: RecordingSleeper;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
}

export function createProviderRig(
  routes: readonly FixtureRoute[],
  payloads: readonly [string, Readonly<Record<string, unknown>>][] = [],
  baseIso = "2026-10-06T09:00:00Z",
): ProviderRig {
  const player = new FixturePlayer(routes);
  const sleeper = new RecordingSleeper();
  let ticks = 0;
  const clock = () => {
    const at = new Date(Date.parse(baseIso) + ticks * 1000).toISOString();
    ticks += 1;
    return at;
  };
  return {
    player,
    sleeper,
    payloadResolver: new PayloadStore(payloads),
    vault: createCredentialVault({ clock }),
    clock,
  };
}

/** Credential material input for a provider adapter (test-owned secret). */
export function adapterCredential(
  adapterId: string,
  accountRef: string,
  material: string,
): {
  readonly kind: "api-secret";
  readonly material: string;
  readonly forAdapterId: string;
  readonly forAccountRef: string;
} {
  return { kind: "api-secret", material, forAdapterId: adapterId, forAccountRef: accountRef };
}
