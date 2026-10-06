/**
 * TEST-ONLY deterministic stepping clock (never production code).
 *
 * The kernel's time source is an injected input; this double produces a
 * strictly increasing UTC minute sequence starting at a fixed epoch instant.
 * Identical command counts consume identical clock values, so seeded fuzz
 * sessions with the same seed produce byte-identical journals — no wall
 * clock, no unseeded randomness (W1-005 determinism law).
 */
const FUZZ_CLOCK_EPOCH_MS = Date.UTC(2026, 0, 5, 8, 0, 0);
const FUZZ_CLOCK_STEP_MS = 60_000;

export function steppingTimeSource(
  startMs: number = FUZZ_CLOCK_EPOCH_MS,
  stepMs: number = FUZZ_CLOCK_STEP_MS,
): () => string {
  let current = startMs;
  return () => {
    const value = current;
    current += stepMs;
    return new Date(value).toISOString().replace(/\.\d{3}Z$/u, "Z");
  };
}
