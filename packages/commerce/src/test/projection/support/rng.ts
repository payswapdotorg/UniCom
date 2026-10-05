/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY FUZZ SUPPORT — NEVER PRODUCTION CODE.                    █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic PRNG (mulberry32): identical seed → identical sequence.
 * No Math.random anywhere in the fuzz harness (reproducible failures).
 */
export class FuzzRng {
  private state: number;
  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }
  /** Uniform uint32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Uniform integer in [0, n). */
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }
  /** Uniform pick. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }
  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() / 0x100000000 < p;
  }
}
