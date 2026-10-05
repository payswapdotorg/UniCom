/**
 * Type-level assertion helpers for contract tests.
 * Failures are compile-time errors under `tsc` (package `typecheck` script).
 */

export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

export type Expect<T extends true> = T;

export type Not<T extends boolean> = T extends true ? false : true;

/** `Extends<A, B>` is `true` when `A` is assignable to `B`. */
export type Extends<A, B> = A extends B ? true : false;
