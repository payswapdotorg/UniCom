/**
 * W1-009 portfolio — seeded PRNG (mulberry32) + deterministic helpers.
 *
 * mulberry32 is a well-known 32-bit deterministic PRNG. Same seed ⇒ identical
 * sequence on every host, every Node version, every wall-clock time. This is
 * the ONLY source of pseudo-randomness in the portfolio.
 *
 * No `Math.random()`, no `Date.now()`, no `crypto.randomUUID()` anywhere in
 * the generator surface. The portfolio-determinism contract test asserts
 * byte-identical output across two runs of `generatePortfolio({ namespace,
 * industries, sizes, projectsPerFirm })`.
 */

export interface SeededRng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [minInclusive, maxInclusive]. */
  nextInt(minInclusive: number, maxInclusive: number): number;
  /** Pick one element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Shuffle a copy of the array (returns a new array; original untouched). */
  shuffle<T>(items: readonly T[]): T[];
}

export function mulberry32(seed: number): SeededRng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nextInt = (minInclusive: number, maxInclusive: number): number => {
    if (maxInclusive < minInclusive) {
      throw new RangeError(`nextInt: max < min (${minInclusive} > ${maxInclusive})`);
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(next() * span);
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("pick: empty array");
    const idx = nextInt(0, items.length - 1);
    return items[idx] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = nextInt(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };
  return { next, nextInt, pick, shuffle };
}

/**
 * Compute a deterministic 32-bit fingerprint hash from a string.
 * FNV-1a — well-known, fast, no dependencies, byte-stable.
 */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
