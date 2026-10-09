# W1-009 Scenario Manifest + Outcome Oracle — SCHEMA

> **Binding contract for W2 (personas/benchmarks) and W3 (GUI-only runner).**
> Worker-1 owns this schema. Additive changes only; breaking changes are
> forbidden — append new optional fields, never remove or rename.

The portfolio is a deterministic enumeration of **7,800 project manifests**
(13 industries × 3 firm sizes × 200 projects per firm) split into two
disjoint seed namespaces:

- `baseline` — projects `W1-009-B-<industry>-<size>-<NNN>` (1..200 per firm)
- `holdout`  — projects `W1-009-H-<industry>-<size>-<NNN>` (1..200 per firm)

Total = 7,800 baseline + 7,800 holdout = 15,600 manifests. Each manifest
has a paired `OutcomeOracle`. The two namespaces are **disjoint**: a
baseline seed can never produce a holdout project id, and vice versa
(asserted by `portfolio-namespace-separation.test.ts`).

## 1. Top-level `manifest.json`

```jsonc
{
  "schema": "unicom-w1-009-portfolio-manifest/1",
  "workOrder": "W1-009",
  "program": "V3 Cross-Industry Simulation and Adoption Optimization",
  "generatorVersion": "1.0.0",
  "generatedAt": "2026-10-09T00:00:00Z",          // frozen build instant, NOT wall-clock at run time
  "counts": {
    "industries": 13,
    "sizes": 3,
    "firms": 39,
    "projectsPerFirm": 200,
    "baselineProjects": 3900,
    "holdoutProjects": 3900,
    "totalProjects": 7800,
    "totalManifests": 15600,                       // baseline + holdout
    "roleFamiliesPerIndustryMin": 8,
    "journeyFamilies": 19
  },
  "seedNamespaces": ["baseline", "holdout"],
  "industriesRef": "industries.json",
  "rolesRef": "roles.json",
  "journeyFamiliesRef": "journey-families.json",
  "noRfidCoverageRef": "no-rfid-coverage.json",
  "generatorModule": "packages/commerce/src/test/w1-009/portfolio/generator.ts",
  "oracleModule": "packages/commerce/src/test/w1-009/portfolio/oracle.ts"
}
```

## 2. `ProjectManifest` (per-project)

```jsonc
{
  "schema": "unicom-w1-009-project-manifest/1",
  "projectId": "W1-009-B-construction-small-0042",   // stable id; B=baseline, H=holdout
  "namespace": "baseline",                           // "baseline" | "holdout"
  "industryId": "construction",                      // see industries.json
  "industryName": "Construction / engineering / contractors",
  "firmSize": "small",                               // "small" | "medium" | "large"
  "firmCohortId": "construction-small",              // 39 cohorts
  "firmDescriptor": {
    "syntheticStaff": 25,                            // 25 / 150 / 1000 per matrix
    "primaryCommerceStressor": "Low purchasing/admin capacity, price sensitivity, manual supplier/channel workflows",
    "incumbentStack": ["Amazon Business", "Grainger", "Fastenal", "Ferguson"],
    "excludedComparators": ["Autodesk", "Procore"]
  },
  "seed": {
    "namespace": "baseline",
    "seedValue": 0x1a0c0 + 42,                       // 32-bit; never reused across namespaces
    "seedMaterial": "w1-009:baseline:construction:small:0042",
    "prng": "mulberry32"
  },
  "roleMix": [                                       // ≥8 role families per industry
    { "roleFamily": "project-owner",   "personas": 1, "authorityScope": "APPROVE_BUDGET" },
    { "roleFamily": "procurement",     "personas": 2, "authorityScope": "ISSUE_PO" },
    { "roleFamily": "finance",         "personas": 1, "authorityScope": "RECONCILE_INVOICE" },
    { "roleFamily": "ops",             "personas": 3, "authorityScope": "RECEIVE_STOCK" },
    { "roleFamily": "end-user",        "personas": 4, "authorityScope": "REQUEST_PURCHASE" },
    { "roleFamily": "approver",        "personas": 1, "authorityScope": "APPROVE_PURCHASE" },
    { "roleFamily": "supplier",        "personas": 2, "authorityScope": "QUOTE" },
    { "roleFamily": "auditor-security","personas": 1, "authorityScope": "AUDIT" }
  ],
  "projectTemplate": {
    "templateId": "construction-materials-procurement",
    "title": "Pour #4 rebar + concrete procurement (foundation phase)",
    "commerceScope": "materials-and-parts-sourcing",
    "applicableJourneyFamilies": [
      "buyer-intent-constraints", "offer-sourcing-comparison",
      "negotiation-substitution", "supplier-procurement-receiving",
      "failure-unknown-idempotency-recovery"
    ],
    "purchasingList": [
      {
        "lineId": "L01", "sku": "sku-rebar-10mm", "description": "Rebar 10mm × 6m",
        "quantity": { "kind": "COUNT", "units": 240 },
        "unitPriceMinor": "1250", "currency": "USD",
        "supplierOptions": [
          { "supplierId": "sup-a", "quoteMinor": "1250", "leadTimeDays": 5, "qualityTier": "STANDARD" },
          { "supplierId": "sup-b", "quoteMinor": "1180", "leadTimeDays": 9, "qualityTier": "STANDARD" }
        ],
        "substitutes": ["sku-rebar-12mm"],
        "evidenceRequired": "P1"
      }
      // ... more lines
    ],
    "budget": { "totalMinor": "350000", "currency": "USD" },
    "deadline": { "hard": "2026-11-15", "soft": "2026-11-08" },
    "qualityThresholds": [ { "dimension": "GRADE", "min": "B+" } ],
    "approvals": [
      { "step": 1, "roleFamily": "procurement", "action": "REQUEST_PURCHASE" },
      { "step": 2, "roleFamily": "approver",    "action": "APPROVE_PURCHASE", "maxAmountMinor": "50000" },
      { "step": 3, "roleFamily": "finance",     "action": "RECONCILE_INVOICE" }
    ],
    "delivery": { "mode": "SITE_DELIVERY", "location": "loc-site-a" },
    "returns": { "allowed": true, "windowDays": 30, "recourse": "CREDIT" },
    "evidenceRequired": ["PO", "DELIVERY_RECEIPT", "INVOICE"]
  },
  "taskOutcome": {
    "guiTaskGoal": "Order 240 rebar 10mm units from supplier B with site delivery by 2026-11-15, within $3500.00 budget, requiring finance approval for amounts over $500.00.",
    "guiEntrySurface": "intent-canvas",            // see journey-families.json
    "applicableRoles": ["procurement", "approver", "finance"],
    "expectedPostJourneyState": {
      "purchaseOrderState": "RECEIVED",
      "receivedUnitsByLine": { "L01": 240 },
      "totalCostMinor": "283200",
      "currency": "USD",
      "withinBudget": true,
      "withinDeadline": true,
      "evidenceCaptured": ["PO", "DELIVERY_RECEIPT", "INVOICE"]
    }
  },
  "outcomeOracleRef": "W1-009-B-construction-small-0042.oracle.json",
  "determinismFingerprint": "sha256:..."              // canonicalJson SHA of the manifest
}
```

## 3. `OutcomeOracle` (per-project)

The oracle is consumed by W3 (GUI runner) and W2 (adoption scoring) — but
**only after** the GUI runner has performed the evaluated task. It contains:

- The expected post-journey commerce state (deterministic, derived from the
  project template + seed).
- The assertions the GUI runner must satisfy to mark the journey successful.
- The failure conditions the journey must avoid.
- The UNKNOWN / BLOCKED conditions that must be preserved (never silently
  resolved to FAILED or SUCCESS).

```jsonc
{
  "schema": "unicom-w1-009-outcome-oracle/1",
  "projectId": "W1-009-B-construction-small-0042",
  "namespace": "baseline",
  "industryId": "construction",
  "firmSize": "small",
  "assertions": [
    {
      "id": "cost-validity",
      "kind": "MONEY_CONSERVATION",
      "description": "Sum of received line totals equals journal money-out (no float).",
      "check": "sumLineTotalsMinor === paymentCapturedMinor",
      "severity": "CRITICAL"
    },
    {
      "id": "budget-constraint",
      "kind": "BUDGET",
      "description": "Total cost ≤ project budget.",
      "check": "totalCostMinor <= budgetTotalMinor",
      "severity": "CRITICAL"
    },
    {
      "id": "deadline-feasibility",
      "kind": "DEADLINE",
      "description": "Receiving completed on or before hard deadline.",
      "check": "receivedAt <= hardDeadline",
      "severity": "CRITICAL"
    },
    {
      "id": "stock-reconciliation",
      "kind": "RECONCILIATION",
      "description": "On-hand equals received − sold − shrinkage (with explicit variance records).",
      "check": "onHand === received - sold - shrinkageAdjusted",
      "severity": "CRITICAL"
    },
    {
      "id": "idempotency",
      "kind": "IDEMPOTENCY",
      "description": "Replaying the command envelope under the same idempotency key returns DUPLICATE.",
      "check": "replay.status === 'DUPLICATE'",
      "severity": "CRITICAL"
    },
    {
      "id": "unknown-preservation",
      "kind": "UNKNOWN",
      "description": "An UNKNOWN provider observation stays UNKNOWN (never auto-promoted to FAILED or SUCCESS).",
      "check": "observation.resolution.resolved === 'UNKNOWN'",
      "severity": "CRITICAL"
    },
    {
      "id": "approval-policy",
      "kind": "APPROVAL",
      "description": "Purchase above the approver's maxAmountMinor was rejected without the approval.",
      "check": "unapprovedLargePurchase.status === 'REJECTED_APPROVAL_REQUIRED'",
      "severity": "CRITICAL"
    },
    {
      "id": "provider-unknown",
      "kind": "PROVIDER_UNKNOWN",
      "description": "A connector UNKNOWN response is preserved through the kernel boundary.",
      "check": "connectorResponse.state === 'UNKNOWN'",
      "severity": "CRITICAL"
    }
  ],
  "failureConditions": [
    "BUDGET_EXCEEDED",
    "DEADLINE_MISSED",
    "QUALITY_BELOW_THRESHOLD",
    "MISSING_APPROVAL",
    "MISSING_EVIDENCE",
    "SUBSTITUTION_REJECTED",
    "DELIVERY_UNKNOWN"
  ],
  "unknownConditions": [
    "SUPPLIER_QUOTE_UNKNOWN",
    "DELIVERY_OBSERVATION_UNKNOWN",
    "PAYMENT_SETTLEMENT_UNKNOWN"
  ],
  "blockedConditions": [
    "USER_LACKS_AUTHORITY",
    "SECURITY_BLOCK",
    "CONNECTOR_SCOPE_ABUSE"
  ],
  "expectedState": {
    "purchaseOrder": { "state": "RECEIVED", "outstandingUnits": 0 },
    "inventory": { "onHandByLine": { "L01": 240 } },
    "money": { "capturedMinor": "283200", "refundedMinor": "0", "currency": "USD" },
    "evidence": ["PO", "DELIVERY_RECEIPT", "INVOICE"],
    "predictive": false                              // twin projections never asserted as canonical
  },
  "journeyFamilyApplicability": {
    "buyer-intent-constraints": true,
    "offer-sourcing-comparison": true,
    "negotiation-substitution": true,
    "supplier-procurement-receiving": true,
    "failure-unknown-idempotency-recovery": true
    // others false for this project (industry-specific)
  }
}
```

## 4. `seed-namespaces.schema.json`

```jsonc
{
  "schema": "unicom-w1-009-seed-namespaces/1",
  "namespaces": [
    {
      "id": "baseline",
      "seedPrefix": 0x1a0c0,                          // 32-bit; baseline space
      "projectIdPrefix": "W1-009-B-",
      "projectCount": 3900,                            // 13 × 3 × 100? No — 13 × 3 × 200 / 2 = 3900
      "disjointFrom": "holdout",
      "fingerprintRule": "namespace seed must never collide with holdout seed"
    },
    {
      "id": "holdout",
      "seedPrefix": 0x2b1d1,                           // 32-bit; holdout space (different prefix)
      "projectIdPrefix": "W1-009-H-",
      "projectCount": 3900,
      "disjointFrom": "baseline",
      "fingerprintRule": "namespace seed must never collide with baseline seed"
    }
  ],
  "disjointnessAssertion": "for any (industry, size, idx), baselineSeed(industry,size,idx) ≠ holdoutSeed(industry,size,idx) AND baselineProjectId ≠ holdoutProjectId"
}
```

**Disjoint seed allocation rule.** Each project's 32-bit seed is computed as
`namespacePrefix + industryIndex*900 + sizeIndex*300 + (idx-1)`. The two
prefixes (`0x1a0c0` for baseline, `0x2b1d1` for holdout) are chosen so that
no two seeds collide across namespaces for any valid `(industry, size, idx)`
triple, and no two project ids collide (the `B-` vs `H-` infix guarantees
textual disjointness even if seeds were ever renumbered).

## 5. Industry × Size × 200 = 7,800 reconciliation

The portfolio generator enumerates projects in this exact order:

```
for industry in industries:                   // 13
  for size in [small, medium, large]:         // 3
    for namespace in [baseline, holdout]:     // 2 (separate generators)
      for idx in 1..200:                      // 200
        emit ProjectManifest + OutcomeOracle
```

When run for a single namespace, the generator emits 3,900 manifests.
When run for both namespaces, it emits 7,800. The total reconciles to
`13 × 3 × 200 = 7,800` per namespace.

The reconciliation test `portfolio-reconciliation.test.ts` runs the generator
across both namespaces and asserts:

- `baseline.length === 3900`
- `holdout.length === 3900`
- `total === 7800`
- All 39 firm cohorts × 200 projects each appear in both namespaces.
- No two project ids collide within or across namespaces.
- No two seeds collide within or across namespaces.

## 6. Journey-family coverage (19 mandatory families)

Every project manifest declares its `applicableJourneyFamilies` array. The
portfolio as a whole must cover all 19 mandatory families across at least
one project per industry (asserted by `portfolio-journey-coverage.test.ts`):

1. `buyer-intent-constraints`
2. `offer-sourcing-comparison`
3. `buy-now-vs-wait-price-timing`
4. `negotiation-substitution`
5. `existing-group-buy`
6. `latent-demand-merchant-group-buy-proposal`
7. `rent-borrow-vs-buy`
8. `resale-rental-consignment`
9. `proactive-economic-opportunities`
10. `bounded-multi-hop-trade-cycle`
11. `merchant-commerce-lifecycle`
12. `supplier-procurement-receiving`
13. `autonomous-store-policy`
14. `commerce-twin-what-if`
15. `connected-commerce-channels-and-live-commerce`
16. `physical-no-rfid-supermarket`
17. `trust-security-fraud-and-recourse`
18. `failure-unknown-idempotency-recovery`
19. `gui-feature-discoverability`

A journey family is "covered" for an industry iff at least one project
manifest for that industry lists it in `applicableJourneyFamilies`. Some
families are industry-applicable (e.g. `physical-no-rfid-supermarket` is
mandatory for industry 13 but optional for others).

## 7. Role-family table (≥8 per industry)

Every industry's `roles.json` entry contains at least these 8 role families
(some industries add more — e.g. healthcare adds `recall-coordinator`):

| Role family | Authority scope | Present in every industry? |
|---|---|---|
| `project-owner` | `APPROVE_BUDGET` | yes |
| `procurement` | `ISSUE_PO` | yes |
| `finance` | `RECONCILE_INVOICE` | yes |
| `ops` | `RECEIVE_STOCK` | yes |
| `end-user` | `REQUEST_PURCHASE` | yes |
| `approver` | `APPROVE_PURCHASE` | yes |
| `supplier` | `QUOTE` | yes |
| `auditor-security` | `AUDIT` | yes |

Industries may add role families beyond the mandatory 8 (e.g. healthcare:
`recall-coordinator`, fashion: `merchandiser`, defense:
`security-officer-classified-avoidance`).

## 8. No-RFID coverage (per W3-004 + SUPERMARKET-WITHOUT-RFID.md)

The supermarket industry (industry 13) **must** include projects covering
every W3-004 acceptance scenario as applicable journey families. The
`no-rfid-coverage.json` file maps each supermarket cohort project to a
weighted subset of:

- POS/import catalog+inventory path (Level 0/2 of the deployment ladder)
- Barcode/mobile-camera count (Level 1)
- Weighted-product workflow (price-per-unit × weight, integer minor units,
  tolerance band, out-of-tolerance → UNKNOWN)
- Offline observation queue (sequence + timestamp at capture, exactly-once
  replay, stale-conflict supersede rule)
- Reconciliation (edge vs system vs POS deltas; UNKNOWN preservation)
- Live-commerce session surface (announce → active → ended; late-joiner
  replay; backpressure-respecting contract)

The supermarket industry's project templates also include the deployment
ladder rungs from `docs/SUPERMARKET-WITHOUT-RFID.md` (Level 0 through
Level 4; Level 5 RFID is explicitly optional and never required).

The `no-rfid-coverage.test.ts` contract test asserts:

- Every supermarket-industry project (400 = 200 baseline + 200 holdout)
  declares `physical-no-rfid-supermarket` in its applicable journey
  families.
- Across the supermarket industry, every W3-004 acceptance scenario appears
  in at least one project's `taskOutcome.expectedPostJourneyState` paths.
- No supermarket project requires RFID (asserted by absence of any
  `requiresRfid: true` flag in the manifest — the field is reserved and
  must be `false` or absent).

## 9. Determinism rule (binding)

Given the same generator inputs `(namespace, industries, sizes,
projectsPerFirm, generatorVersion)`, the byte-serialised portfolio
(`canonicalJson` from the commerce kernel) is **identical** across runs,
hosts and wall-clock times. The determinism test
`portfolio-determinism.test.ts` runs the generator twice and asserts
byte-equality of the canonical form. The test also reconstructs the
portfolio from a frozen seed and asserts against a committed fingerprint.

## 10. What W2/W3 consume

| Consumer | Reads | Writes / produces |
|---|---|---|
| **W2 (personas)** | `manifest.json`, `industries.json`, `roles.json`, `journey-families.json`, every `ProjectManifest.roleMix` + `taskOutcome.applicableRoles` | Persona-cohort assignments, incumbent benchmarks, adoption instrument results. Never writes scenario files. |
| **W3 (GUI runner)** | Every `ProjectManifest.taskOutcome.guiTaskGoal`, `guiEntrySurface`, `expectedPostJourneyState`, every `OutcomeOracle.assertions` | Browser journey evidence (screenshots, traces, timings), journey success/failure/UNKNOWN/BLOCKED verdicts. **Only W3 marks journeys successful.** |
| **TL (orchestrator)** | `manifest.json` (counts), test battery output | Accepts/rejects the baseline; re-dispatches the next cycle. |
