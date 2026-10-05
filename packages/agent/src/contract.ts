/**
 * @unicom/agent — public contract surface (Stage 0, W2-001).
 *
 * This file re-exports the frozen type/interface contract for the
 * intelligence and coordination plane. It is the module's public contract
 * artifact; implementation details must not leak into it.
 *
 * Contract laws enforced by this surface (see docs/work-orders/W2-001.md §4):
 * 1. One Main Agent is the principal identity; delegates are ephemeral and
 *    always attenuated.
 * 2. Strategy and Organization are separate types.
 * 3. Executability requires ConnectedCapabilityInstance + current
 *    CapabilityObservation (typed, not documented).
 * 4. UNKNOWN is not FAILED.
 * 5. Trust is not Proof; proof level is selected before consequential
 *    execution.
 * 6. GroupBuy/TradeCycle are explicit; no silent enrollment; hop-bounded
 *    production search.
 * 7. Security BLOCK is deterministic and final; broadcasts are defensive-only.
 * 8. Commerce is referenced only through opaque command/result seams.
 * 9. No credentials in model-context-shaped types.
 * 10. Third-party commerce content is data, not instructions.
 */
export {};
