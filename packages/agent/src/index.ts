/**
 * @unicom/agent — package entrypoint (Stage 0, W2-001).
 *
 * Entry points:
 * - `.`            → this file: the full intelligence/coordination contract.
 * - `./capability` → CANONICAL capability vocabulary (Worker 3 consumes
 *   exactly this, by name — invariant 34: no duplicate vocabulary).
 * - `./contract`   → module public contract artifact (architecture check).
 *
 * This package defines contracts plus the minimal deterministic validation
 * needed to exercise them. It owns NO canonical commerce state: commerce is
 * referenced exclusively through the opaque command/result seam
 * (commerce-seam.ts). ZCode remains the agent runtime substrate; these
 * contracts adapt it, they do not replace it (W2-002 implements the
 * adaptation).
 */
export * from "./contract.js";
export * from "./capability/index.js";
