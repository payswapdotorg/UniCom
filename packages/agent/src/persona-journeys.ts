/**
 * W2-009 — Journey applicability per (industry, role) and portfolio exposure.
 *
 * Split out of persona-cohort.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module.
 */

import type { SeededRandom } from "./sim-random.js";
import type {
  FirmCohort,
  Industry,
  JourneyFamily,
  RoleFamily,
} from "./persona-types.js";

/**
 * Journey families applicable to a (industry, roleFamily) pair. Coverage
 * across each industry cohort must ensure that every applicable journey
 * family from V3-EXPERIMENT-PROTOCOL §10 is exercised. Role relevance is
 * allowed; omitting a journey family from the overall campaign is not.
 */
export function applicableJourneysFor(
  industry: Industry,
  roleFamily: RoleFamily,
): JourneyFamily[] {
  const journeys: JourneyFamily[] = ["feature-discovery"];
  if (
    roleFamily === "procurement" ||
    roleFamily === "project-program-mgmt" ||
    roleFamily === "industry-specialist" ||
    roleFamily === "approver-executive" ||
    roleFamily === "field-ops"
  ) {
    journeys.push(
      "buyer-intent-canvas",
      "compare-sellers",
      "buy-vs-wait-negotiate",
      "failure-recovery",
    );
  }
  if (roleFamily === "sales" || roleFamily === "industry-specialist") {
    journeys.push(
      "merchant-lifecycle",
      "b2b-multi-location",
      "existing-groupbuy-discovery",
      "latent-demand-groupbuy",
    );
  }
  if (
    roleFamily === "procurement" ||
    roleFamily === "field-ops" ||
    roleFamily === "industry-specialist"
  ) {
    journeys.push(
      "supplier-procurement-lifecycle",
      "rent-borrow-vs-buy",
      "resale-rental-consignment",
      "proactive-opportunities",
      "multi-hop-tradecycle",
    );
  }
  if (roleFamily === "compliance-audit" || roleFamily === "approver-executive") {
    journeys.push("commerce-trust-security", "commerce-twin-whatif");
  }
  if (roleFamily === "it" || roleFamily === "industry-specialist") {
    journeys.push("connector-discovery-execution", "autonomous-store-runtime");
  }
  if (industry === "supermarket") {
    journeys.push("no-rfid-physical-retail");
  }
  if (
    roleFamily === "approver-executive" ||
    roleFamily === "industry-specialist" ||
    roleFamily === "procurement"
  ) {
    journeys.push("commerce-twin-whatif");
  }
  // Deduplicate while preserving insertion order.
  return Array.from(new Set(journeys));
}

/**
 * Deterministic portfolio exposure: each persona touches a deterministic
 * subset of the firm's 200 projects. Larger firms have lower per-persona
 * exposure (more specialization); smaller firms have higher per-persona
 * exposure (more generalists).
 */
export function portfolioExposureFor(
  firm: FirmCohort,
  rng: SeededRandom,
): string[] {
  const totalProjects = 200;
  const exposurePct =
    firm.firmSize === "small" ? 0.6 : firm.firmSize === "medium" ? 0.25 : 0.05;
  const exposureCount = Math.max(1, Math.round(totalProjects * exposurePct));
  const pool = Array.from({ length: totalProjects }, (_, i) => i);
  // Fisher-Yates with seeded draws — deterministic sampling without replacement.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = new Set<string>();
  for (let i = 0; i < exposureCount; i += 1) {
    picked.add(`project:${firm.firmId}:${pool[i]}`);
  }
  return Array.from(picked).sort();
}
