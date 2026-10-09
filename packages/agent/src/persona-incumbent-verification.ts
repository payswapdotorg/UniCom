/**
 * W2-010 — Verified incumbent product evidence (assembly + laws).
 *
 * The evidence-classed product registry backing the incumbent benchmark
 * suite. Every incumbent named in the frozen W2-009 stacks
 * (persona-incumbent-stacks.ts) is verified against its official public
 * presence (web search over official domains, 2026-10-09). Raw search
 * snapshots: docs/simulations/results/baseline/adoption/
 * incumbent-verification-evidence.json.
 *
 * Evidence-class laws (matrix §"Comparator evidence classes"; protocol §6):
 *   A — authorized direct UI trial with a live incumbent account. NONE this
 *       wave (INCUMBENT_CLASS_A_OBSERVATIONS = 0): no incumbent accounts
 *       were opened, no live trials, no vendor outreach, no real orders.
 *   B — official interactive demo or authentic public interactive UI,
 *       verified to exist and be publicly accessible via its official
 *       domain (search snapshots recorded; no session was faked).
 *   C — official product documentation verified; the interactive product
 *       itself is account-gated or sales-gated. Documentation is a
 *       capability checklist ONLY — never measured interaction performance.
 *   D — unverified / generic: manual spreadsheet/email/CSV workflows and
 *       generic category rows with no specific verifiable product. D
 *       observations render incumbent capability UNKNOWN and are excluded
 *       from performance claims.
 *
 * Fabrication laws: NO prices, speeds, market share or any performance
 * numbers captured or inferred. Incumbent performance comparisons are
 * UNKNOWN everywhere in this registry (matrix: "If the incumbent system
 * cannot be run, report capability coverage only and leave performance
 * comparison UNKNOWN").
 *
 * Table split (architecture file-line budget): class-B entries live in
 * persona-incumbent-verification-b.ts; class C+D entries in
 * persona-incumbent-verification-cd.ts. Types + frozen constants live in
 * persona-types.ts (leaf layer).
 *
 * Internal to the @unicom/agent module (re-exported via contract.w2-010.ts).
 */

import type { EvidenceClass, VerifiedIncumbentProduct } from "./persona-types.js";
import { VERIFIED_INCUMBENT_PRODUCTS_B } from "./persona-incumbent-verification-b.js";
import { VERIFIED_INCUMBENT_PRODUCTS_CD } from "./persona-incumbent-verification-cd.js";

export type { IncumbentVerificationMethod, VerifiedIncumbentProduct } from "./persona-types.js";
export { INCUMBENT_CLASS_A_OBSERVATIONS, INCUMBENT_VERIFICATION_DATE } from "./persona-types.js";

/** The verified product table (B + C + D parts assembled). */
export const VERIFIED_INCUMBENT_PRODUCTS: Readonly<
  Record<string, VerifiedIncumbentProduct>
> = {
  ...VERIFIED_INCUMBENT_PRODUCTS_B,
  ...VERIFIED_INCUMBENT_PRODUCTS_CD,
};

/** Product keys classified by this pass (all entries in the table). */
export const VERIFIED_PRODUCT_COUNT = Object.keys(VERIFIED_INCUMBENT_PRODUCTS).length;

/** Count of product entries per evidence class in this table. */
export function verifiedProductClassCounts(): Record<EvidenceClass, number> {
  const counts: Record<EvidenceClass, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const product of Object.values(VERIFIED_INCUMBENT_PRODUCTS)) {
    counts[product.evidenceClass] += 1;
  }
  return counts;
}
