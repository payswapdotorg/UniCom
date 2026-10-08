/**
 * Tests for W2-008 hard-constraint check (intent-w2-008.ts).
 *
 * Covers:
 * - Full compliance (no constraints → no violations)
 * - UNKNOWN preservation (absent constraint → no violation)
 * - Rental: period exceeds max, deposit exceeds max, proof below required, missing data
 * - Resale: value below min, depreciation exceeds max, proof below required, missing data
 * - Multi-hop trade: hop count exceeds max, participants below min, proof below required, missing data
 * - Group-buy: authorization missing, discount below min, proof below required, missing data
 * - Local-commerce: distance exceeds max, pickup not available, missing data
 * - Account compromise: anomalous login rate, attestation proof
 * - Agent compromise: behavioral deviation, agent proof
 * - Connector compromise: attestation stale, proof below required
 * - Collusion: independent sellers below min
 * - Sybil: unique identities below min
 * - Anomalous agent: action rate, capability deviation
 */
import { describe, expect, it } from "vitest";
import { checkW2_008Constraints } from "../src/intent-w2-008.js";
import type {
  W2_008ConstraintShape,
  W2_008CandidateShape,
} from "../src/intent-w2-008.js";

const USD = (minor: string) => ({ currency: "USD", minorUnits: minor });

describe("W2-008 checkW2_008Constraints", () => {
  it("returns no violations when no constraints are declared", () => {
    const result = checkW2_008Constraints({}, {});
    expect(result).toEqual([]);
  });

  it("preserves UNKNOWN — absent constraint produces no violation", () => {
    const result = checkW2_008Constraints(
      { rental: undefined, resale: undefined },
      {},
    );
    expect(result).toEqual([]);
  });

  // --- Rental ---
  it("rejects rental period exceeding max", () => {
    const result = checkW2_008Constraints(
      { rental: { maxPeriods: 3, period: "MONTH" } },
      { rental: { periods: 5 } },
    );
    expect(result).toContain("RENTAL_PERIOD_EXCEEDS_MAX");
  });

  it("rejects rental deposit exceeding max (BigInt Money)", () => {
    const result = checkW2_008Constraints(
      { rental: { maxPeriods: 12, period: "MONTH", maxDeposit: USD("10000") } },
      { rental: { periods: 3, deposit: USD("15000") } },
    );
    expect(result).toContain("RENTAL_DEPOSIT_EXCEEDS_MAX");
  });

  it("rejects rental proof below required", () => {
    const result = checkW2_008Constraints(
      { rental: { maxPeriods: 12, period: "MONTH", requiredRentalProofLevel: "P3" } },
      { rental: { periods: 3, proofLevel: "P1" } },
    );
    expect(result).toContain("RENTAL_PROOF_BELOW_REQUIRED");
  });

  it("rejects rental with MISSING_REQUIRED_DATA when candidate absent", () => {
    const result = checkW2_008Constraints(
      { rental: { maxPeriods: 3, period: "DAY" } },
      {},
    );
    expect(result).toContain("MISSING_REQUIRED_DATA");
  });

  // --- Resale ---
  it("rejects resale value below min", () => {
    const result = checkW2_008Constraints(
      { resale: { minResaleValue: USD("50000") } },
      { resale: { appraisedValue: USD("30000") } },
    );
    expect(result).toContain("RESALE_VALUE_BELOW_MIN");
  });

  it("rejects resale depreciation exceeding max", () => {
    const result = checkW2_008Constraints(
      { resale: { maxDepreciationBps: 3000 } },
      { resale: { depreciationBps: 5000 } },
    );
    expect(result).toContain("RESALE_DEPRECIATION_EXCEEDS_MAX");
  });

  it("rejects resale proof below required", () => {
    const result = checkW2_008Constraints(
      { resale: { requiredResaleProofLevel: "P4" } },
      { resale: { proofLevel: "P2" } },
    );
    expect(result).toContain("RESALE_PROOF_BELOW_REQUIRED");
  });

  // --- Multi-hop trade ---
  it("rejects trade hop count exceeding max (rule 13)", () => {
    const result = checkW2_008Constraints(
      { multiHopTrade: { maxHopCount: 3 } },
      { multiHop: { hopCount: 7 } },
    );
    expect(result).toContain("TRADE_HOP_COUNT_EXCEEDS_MAX");
  });

  it("rejects trade participants below min", () => {
    const result = checkW2_008Constraints(
      { multiHopTrade: { minParticipants: 3 } },
      { multiHop: { hopCount: 2, participantCount: 2 } },
    );
    expect(result).toContain("TRADE_PARTICIPANTS_BELOW_MIN");
  });

  it("rejects trade participant proof below required", () => {
    const result = checkW2_008Constraints(
      { multiHopTrade: { maxHopCount: 5, requiredParticipantProofLevel: "P3" } },
      { multiHop: { hopCount: 3, participantCount: 4, participantProofLevel: "P1" } },
    );
    expect(result).toContain("TRADE_PARTICIPANT_PROOF_BELOW_REQUIRED");
  });

  // --- Group-buy ---
  it("rejects group-buy without authorization (rule 12)", () => {
    const result = checkW2_008Constraints(
      { merchantSuggestedGroupBuy: { willingness: "REFUSED" } },
      { groupBuy: { merchantAuthorized: false } },
    );
    expect(result).toContain("MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING");
  });

  it("rejects group-buy discount below min", () => {
    const result = checkW2_008Constraints(
      { merchantSuggestedGroupBuy: { willingness: "ACCEPTED", minDiscountBps: 1000 } },
      { groupBuy: { merchantAuthorized: true, discountBps: 500 } },
    );
    expect(result).toContain("GROUP_BUY_DISCOUNT_BELOW_MIN");
  });

  it("rejects group-buy merchant proof below required", () => {
    const result = checkW2_008Constraints(
      { merchantSuggestedGroupBuy: { willingness: "REQUIRED", requiredMerchantProofLevel: "P3" } },
      { groupBuy: { merchantAuthorized: true, merchantProofLevel: "P1" } },
    );
    expect(result).toContain("GROUP_BUY_MERCHANT_PROOF_BELOW_REQUIRED");
  });

  // --- Local-commerce ---
  it("rejects local commerce distance exceeding max", () => {
    const result = checkW2_008Constraints(
      { localCommerce: { maxDistanceKm: 50 } },
      { localCommerce: { distanceKm: 75 } },
    );
    expect(result).toContain("LOCAL_COMMERCE_DISTANCE_EXCEEDS_MAX");
  });

  it("rejects local pickup not available when required", () => {
    const result = checkW2_008Constraints(
      { localCommerce: { localPickupRequired: true } },
      { localCommerce: { distanceKm: 10, localPickupAvailable: false } },
    );
    expect(result).toContain("LOCAL_PICKUP_NOT_AVAILABLE");
  });

  // --- Account compromise ---
  it("rejects account with anomalous login rate exceeding max", () => {
    const result = checkW2_008Constraints(
      { accountCompromise: { maxAnomalousLoginRate: 5 } },
      { security: { anomalousLoginRate: 12 } },
    );
    expect(result).toContain("ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX");
  });

  // --- Agent compromise ---
  it("rejects agent with behavioral deviation exceeding max", () => {
    const result = checkW2_008Constraints(
      { agentCompromise: { maxBehavioralDeviationBps: 1000 } },
      { security: { behavioralDeviationBps: 3000 } },
    );
    expect(result).toContain("AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX");
  });

  // --- Connector compromise ---
  it("rejects connector with stale attestation", () => {
    const result = checkW2_008Constraints(
      { connectorCompromise: { minAttestationFreshnessSeconds: 300 } },
      { security: { attestationFreshnessSeconds: 100 } },
    );
    expect(result).toContain("CONNECTOR_ATTESTATION_STALE");
  });

  // --- Collusion ---
  it("rejects marketplace with insufficient independent sellers", () => {
    const result = checkW2_008Constraints(
      { collusion: { minIndependentSellers: 5 } },
      { security: { independentSellerCount: 2 } },
    );
    expect(result).toContain("COLLUSION_INDEPENDENT_SELLERS_BELOW_MIN");
  });

  // --- Sybil ---
  it("rejects participant set with insufficient unique identities", () => {
    const result = checkW2_008Constraints(
      { sybil: { minUniqueIdentities: 3 } },
      { security: { uniqueIdentityCount: 1 } },
    );
    expect(result).toContain("SYBIL_UNIQUE_IDENTITIES_BELOW_MIN");
  });

  // --- Anomalous agent ---
  it("rejects agent with action rate exceeding max", () => {
    const result = checkW2_008Constraints(
      { anomalousAgent: { maxActionRatePerMinute: 30 } },
      { security: { actionRatePerMinute: 100 } },
    );
    expect(result).toContain("ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX");
  });

  it("rejects agent with capability deviation exceeding max", () => {
    const result = checkW2_008Constraints(
      { anomalousAgent: { maxCapabilityDeviationBps: 500 } },
      { security: { capabilityDeviationBps: 2000 } },
    );
    expect(result).toContain("ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX");
  });

  // --- Compliance ---
  it("returns no violations for fully compliant rental + resale candidate", () => {
    const result = checkW2_008Constraints(
      {
        rental: { maxPeriods: 12, period: "MONTH", maxDeposit: USD("20000"), requiredRentalProofLevel: "P2" },
        resale: { minResaleValue: USD("10000"), maxDepreciationBps: 3000, requiredResaleProofLevel: "P2" },
      },
      {
        rental: { periods: 6, deposit: USD("10000"), proofLevel: "P3" },
        resale: { appraisedValue: USD("20000"), depreciationBps: 1000, proofLevel: "P3" },
      },
    );
    expect(result).toEqual([]);
  });
});
