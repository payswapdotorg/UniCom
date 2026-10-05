/**
 * Model-context gate for the connector runtime
 * (FROZEN-ARCHITECTURE §16, INVARIANTS 18/27/50, W3-002).
 *
 * Anything the connector runtime wants to hand toward a model context must
 * pass through this gate, which composes Worker 2's CANONICAL fail-closed
 * machinery (`@unicom/agent` model-context contracts) with the credential
 * vault's deep value scan:
 *
 * 1. `vault.containsSealedMaterial` — no sealed secret VALUE occurs anywhere
 *    in the payload (proves absence by value, not just by key shape);
 * 2. `assertNoCredentialMaterial` — canonical structural scan that throws on
 *    any credential/cookie/token/secret-shaped KEY anywhere in the payload;
 * 3. `toModelContextMaterial` — the only sanctioned constructor for material
 *    cleared for model context.
 *
 * The gate fails closed: any hit throws, nothing is partially cleared.
 */

import {
  assertNoCredentialMaterial,
  toModelContextMaterial,
  type ModelContextMaterial,
} from "@unicom/agent";
import type { CredentialVault } from "./connector/vault";

/** Thrown when material is refused at the model-context boundary. */
export class ModelContextGateRefused extends Error {
  constructor(reason: string) {
    super(`model-context gate refused material: ${reason}`);
    this.name = "ModelContextGateRefused";
  }
}

export interface ModelContextGate {
  /**
   * Clear runtime material for model context. Throws
   * `ModelContextGateRefused` when credential-shaped keys or sealed secret
   * values are found anywhere in the payload.
   */
  clear(value: object): ModelContextMaterial;
}

export interface ModelContextGateOptions {
  readonly vault: CredentialVault;
  readonly clearedAt: string;
}

export function createModelContextGate(options: ModelContextGateOptions): ModelContextGate {
  const { vault, clearedAt } = options;
  return {
    clear(value: object): ModelContextMaterial {
      if (vault.containsSealedMaterial(value)) {
        throw new ModelContextGateRefused("a sealed credential value is present in the material");
      }
      try {
        assertNoCredentialMaterial(value);
      } catch (error) {
        throw new ModelContextGateRefused(error instanceof Error ? error.message : "structural scan failed");
      }
      return toModelContextMaterial(value, clearedAt);
    },
  };
}
