/**
 * Deterministic result type for domain rejections.
 *
 * Domain rejections (currency mismatch, invalid transition, insufficient stock, ...)
 * are VALUES, not exceptions, so they can be recorded in the Decision Ledger and
 * replayed. Programming errors (invalid id text, malformed money) still throw.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Test convenience: extract the value of an expected Ok. Throws on Err. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap on Err: ${JSON.stringify(result.error)}`);
}
