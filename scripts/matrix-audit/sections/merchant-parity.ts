/**
 * Section registry — Merchant parity (W1-008 §scope 2).
 *
 * 14 rows of `docs/FEATURE-COMPLETENESS-MATRIX.md`. Pointers are derived
 * from the repo tree; the harness re-resolves them every run. Rows flagged
 * FAIL on first run are CLOSED within `packages/commerce` +
 * `packages/experience` (W1-008 lane discipline, same as W1-007).
 */
import type { AuditSection } from "../types.js";

export const SECTION: AuditSection = {
  section: "merchant-parity",
  rows: [
    {
      row: "storefront-themes-content",
      rungs: {
        contract: { file: "packages/commerce/src/domain/catalog.ts", symbol: "Product" },
        implementation: { file: "packages/experience/src/surfaces/storefront.ts", symbol: "StorefrontThemeView" },
        discoverableUx: { surfaceId: "storefront-studio" },
        journey: { file: "packages/experience/test/e2e/storefront-checkout.journey.test.ts" },
        evidence: { file: "packages/experience/test/e2e/storefront-checkout.journey.test.ts" },
      },
    },
    {
      row: "catalog-products-variants-skus-collections",
      rungs: {
        contract: { file: "packages/commerce/src/domain/catalog.ts", symbol: "Product" },
        implementation: { file: "packages/commerce/src/projection/catalog-projection.ts", symbol: "catalogReadModel" },
        discoverableUx: { surfaceId: "operate-catalog" },
        journey: { file: "packages/commerce/src/test/lifecycle.test.ts" },
        evidence: { file: "packages/commerce/src/test/lifecycle.test.ts" },
      },
    },
    {
      row: "pricing-promotions-coupons",
      rungs: {
        contract: { file: "packages/commerce/src/domain/pricing.ts", symbol: "Promotion" },
        implementation: { file: "packages/commerce/src/runtime/handler-price-book.ts", symbol: "handleAdjustSkuPrice" },
        discoverableUx: { surfaceId: "operate-catalog" },
        journey: { file: "packages/commerce/src/test/pricing.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-price-adjustment.test.ts" },
      },
    },
    {
      row: "inventory-locations-transfers-receiving-forecasting",
      rungs: {
        contract: { file: "packages/commerce/src/domain/inventory.ts", symbol: "CanonicalInventoryLevel" },
        implementation: { file: "packages/commerce/src/runtime/handler-inventory.ts", symbol: "handleReserveInventory" },
        discoverableUx: { surfaceId: "operate-inventory", hintId: "low-stock-replenish-hint" },
        journey: { file: "packages/commerce/src/test/inventory.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-po-receiving.test.ts" },
      },
    },
    {
      row: "cart-checkout-payments",
      rungs: {
        contract: { file: "packages/commerce/src/domain/cart.ts", symbol: "Cart" },
        implementation: { file: "packages/commerce/src/runtime/handler-checkout.ts", symbol: "handleCompleteCheckout" },
        discoverableUx: { surfaceId: "storefront-studio" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-checkout.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-checkout.test.ts" },
      },
    },
    {
      row: "orders-fulfillment-returns-exchanges-refunds",
      rungs: {
        contract: { file: "packages/commerce/src/domain/orders.ts", symbol: "OrderSnapshot" },
        implementation: { file: "packages/commerce/src/runtime/handler-fulfillment.ts", symbol: "handleOpenFulfillment" },
        discoverableUx: { surfaceId: "operate-orders" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-lifecycle.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-recourse.test.ts" },
      },
    },
    {
      row: "customers-crm-loyalty-subscriptions",
      rungs: {
        contract: { file: "packages/commerce/src/domain/crm.ts", symbol: "CustomerRecord" },
        implementation: { file: "packages/commerce/src/runtime/handler-crm.ts", symbol: "handleAccrueLoyalty" },
        discoverableUx: { surfaceId: "operate-customers", hintId: "loyalty-tier-progress-hint" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-crm-loyalty.test.ts" },
        evidence: { file: "packages/commerce/src/test/certification/certification-w1-007.test.ts" },
      },
    },
    {
      row: "marketing-analytics",
      rungs: {
        contract: { file: "packages/commerce/src/domain/marketing.ts", symbol: "Campaign" },
        implementation: { file: "packages/commerce/src/runtime/handler-marketing.ts", symbol: "handleOpenCampaign" },
        discoverableUx: { surfaceId: "operate-marketing-analytics", hintId: "campaign-performance-hint" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-marketing.test.ts" },
        evidence: { file: "packages/commerce/src/test/projection/analytics-projection.test.ts" },
      },
    },
    {
      row: "b2b",
      rungs: {
        contract: { file: "packages/commerce/src/domain/b2b.ts", symbol: "B2BPriceList" },
        implementation: { file: "packages/commerce/src/runtime/handler-commerce.ts", symbol: "handlePlaceOrder" },
        discoverableUx: { surfaceId: "operate-marketing-analytics" },
        journey: { file: "packages/commerce/src/test/runtime/runtime-circular.test.ts" },
        evidence: { file: "packages/commerce/src/test/state-machines.test.ts" },
      },
    },
    {
      row: "pos",
      rungs: {
        contract: { file: "packages/commerce/src/domain/store-ops.ts", symbol: "StoreCashSession" },
        implementation: { file: "packages/commerce/src/runtime/handler-store-ops.ts", symbol: "handleOpenStoreCashSession" },
        discoverableUx: { surfaceId: "operate-pos" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-store-ops.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-override-handover.test.ts" },
      },
    },
    {
      row: "multi-location-channel-commerce",
      rungs: {
        contract: { file: "packages/commerce/src/domain/transfers.ts", symbol: "StockTransfer" },
        implementation: { file: "packages/commerce/src/runtime/handler-supply.ts", symbol: "handleOpenTransfer" },
        discoverableUx: { surfaceId: "operate-inventory" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-transfer.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-transfer.test.ts" },
      },
    },
    {
      row: "app-extension-ecosystem",
      rungs: {
        // Gap (TL audit candidate): navigation/surface present, no domain contract.
        // CLOSED in this branch — see packages/commerce/src/domain/app-extensions.ts.
        contract: { file: "packages/commerce/src/domain/app-extensions.ts", symbol: "AppExtension" },
        implementation: { file: "packages/experience/src/surfaces/app-extensions-studio.ts", symbol: "AppExtensionsStudioView" },
        discoverableUx: { surfaceId: "app-extensions" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-app-extensions.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-app-extensions.test.ts" },
        closureNote: "W1-008 closure: typed AppExtension domain contract + studio surface + journey test (kernel-only truth; app definitions are untrusted data, INVARIANT 26)",
      },
    },
    {
      row: "ai-generated-apps-workflows",
      rungs: {
        // Gap (TL audit candidate): navigation only; no domain contract.
        // CLOSED in this branch — see packages/commerce/src/domain/ai-generated-apps.ts.
        contract: { file: "packages/commerce/src/domain/ai-generated-apps.ts", symbol: "AiGeneratedAppRequest" },
        implementation: { file: "packages/experience/src/surfaces/app-extensions-studio.ts", symbol: "buildAiGeneratedAppRequestView" },
        discoverableUx: { surfaceId: "app-extensions", intentAlias: "build me a tool" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-ai-generated-apps.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-ai-generated-apps.test.ts" },
        closureNote: "W1-008 closure: AI-generated app/workflow request contract — agent proposes (never mutates truth, AGENTS.md rule 1); human approval gate; sandboxed generated artifact; INVARIANT 6/17/39 preserved",
      },
    },
    {
      row: "autonomous-store",
      rungs: {
        contract: { file: "packages/commerce/src/domain/autonomous-store.ts", symbol: "AutonomousStoreControl" },
        implementation: { file: "packages/commerce/src/runtime/handler-autonomous-ops.ts", symbol: "handleAutonomousRestock" },
        discoverableUx: { surfaceId: "autonomous-store-config" },
        journey: { file: "packages/commerce/src/test/autonomous-store.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-autonomous-day.test.ts" },
      },
    },
  ],
};
