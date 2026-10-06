/**
 * Deterministic simulation primitives for the Reality Lab (W2-005).
 *
 * Law: NO Math.random, NO wall clock — anywhere. The only randomness in a
 * Reality-Lab environment is the seeded splitmix32 stream; the only time is
 * the tick-derived simulated clock. Same seed → same draws → same timestamps,
 * always (evaluations are deterministic by construction).
 */

import { timestamp } from "./common.js";

/** Seeded deterministic PRNG (splitmix32). Same seed → same draw sequence. */
export class SeededRandom {
  private state: number;

  private constructor(seedState: number) {
    this.state = seedState >>> 0;
  }

  static fromSeed(seed: string): SeededRandom {
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return new SeededRandom(hash === 0 ? 0x9e3779b9 : hash);
  }

  nextUint32(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) {
      throw new Error(`invalid bounded draw: [${minInclusive}, ${maxExclusive})`);
    }
    return minInclusive + (this.nextUint32() % (maxExclusive - minInclusive));
  }
}

/**
 * Simulated clock: tick-derived ISO-8601 UTC timestamps. The epoch and step
 * are explicit parameters — no hidden wall clock.
 */
export class SimClock {
  private tick = 0;

  constructor(
    private readonly baseTimestampMs: number,
    private readonly stepMs: number,
  ) {}

  now(): string {
    return timestamp(new Date(this.baseTimestampMs + this.tick * this.stepMs).toISOString());
  }

  advance(): void {
    this.tick += 1;
  }
}
