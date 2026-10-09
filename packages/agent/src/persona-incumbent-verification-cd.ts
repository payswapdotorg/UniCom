/**
 * W2-010 — Verified incumbent product table, part 2 (classes C and D).
 *
 * Split from persona-incumbent-verification.ts for the architecture
 * file-line budget. See that file for the evidence-class laws and the
 * verification method. Class C: official product documentation verified,
 * interactive product account/sales-gated (capability checklist only).
 * Class D: generic/manual rows — unverified, excluded from performance
 * claims. NO prices, speeds, market share or any performance data.
 *
 * Internal to the @unicom/agent module.
 */

import { INCUMBENT_VERIFICATION_DATE, type VerifiedIncumbentProduct } from "./persona-types.js";

const SEARCHED = "official-domain-web-search" as const;

/** Class C + D product entries (assembled into the full table). */
export const VERIFIED_INCUMBENT_PRODUCTS_CD: Readonly<
  Record<string, VerifiedIncumbentProduct>
> = {
  // --- Class C: official documentation verified; product UI gated --------
  coupa: {
    productKey: "coupa",
    label: "Coupa",
    evidenceClass: "C",
    officialDomains: ["www.coupa.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; procurement suite is enterprise/sales-gated. Capability checklist only.",
  },
  "sap-ariba": {
    productKey: "sap-ariba",
    label: "SAP Ariba",
    evidenceClass: "C",
    officialDomains: ["www.sap.com", "supplier.ariba.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; Ariba network is account-gated. Capability checklist only.",
  },
  ramp: {
    productKey: "ramp",
    label: "Ramp",
    evidenceClass: "C",
    officialDomains: ["ramp.com", "support.ramp.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; procurement/spend product is account-gated. Capability checklist only.",
  },
  brex: {
    productKey: "brex",
    label: "Brex",
    evidenceClass: "C",
    officialDomains: ["www.brex.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; product is account-gated. Capability checklist only.",
  },
  "shopify-b2b": {
    productKey: "shopify-b2b",
    label: "Shopify B2B",
    evidenceClass: "C",
    officialDomains: ["www.shopify.com", "help.shopify.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official B2B product pages and help documentation verified; the interactive B2B buying experience requires a store account. Downgraded from the frozen B default — capability checklist only.",
  },
  "salesforce-cpq": {
    productKey: "salesforce-cpq",
    label: "Salesforce CPQ",
    evidenceClass: "C",
    officialDomains: ["www.salesforce.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; CPQ is enterprise/sales-gated. Capability checklist only.",
  },
  ghx: {
    productKey: "ghx",
    label: "GHX",
    evidenceClass: "C",
    officialDomains: ["www.ghx.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; healthcare exchange is account-gated. Capability checklist only.",
  },
  mckesson: {
    productKey: "mckesson",
    label: "McKesson",
    evidenceClass: "C",
    officialDomains: ["www.mckesson.com", "mms.mckesson.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official distribution services documentation verified; ordering portals are account-gated. Downgraded from the frozen B default — capability checklist only.",
  },
  "cardinal-health": {
    productKey: "cardinal-health",
    label: "Cardinal Health",
    evidenceClass: "C",
    officialDomains: ["www.cardinalhealth.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; catalog ordering is account-gated. Capability checklist only.",
  },
  sysco: {
    productKey: "sysco",
    label: "Sysco Shop",
    evidenceClass: "C",
    officialDomains: ["www.sysco.com", "portal.sysco.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official Sysco Shop ordering-app documentation verified; foodservice ordering is account-gated. Downgraded from the frozen B default — capability checklist only.",
  },
  "us-foods": {
    productKey: "us-foods",
    label: "US Foods",
    evidenceClass: "C",
    officialDomains: ["www.usfoods.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official MOXe ordering documentation verified; ordering is account-gated. Downgraded from the frozen B default — capability checklist only.",
  },
  marketman: {
    productKey: "marketman",
    label: "MarketMan",
    evidenceClass: "C",
    officialDomains: ["www.marketman.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; SaaS is trial/sales-gated. Capability checklist only.",
  },
  toast: {
    productKey: "toast",
    label: "Toast",
    evidenceClass: "C",
    officialDomains: ["pos.toasttab.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official POS product pages verified; POS product is sales-gated. Downgraded from the frozen B default — capability checklist only.",
  },
  joor: {
    productKey: "joor",
    label: "JOOR",
    evidenceClass: "C",
    officialDomains: ["www.joor.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; B2B wholesale platform is account-gated. Capability checklist only.",
  },
  nuorder: {
    productKey: "nuorder",
    label: "NuORDER",
    evidenceClass: "C",
    officialDomains: ["www.nuorder.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; B2B platform is account-gated. Capability checklist only.",
  },
  lightspeed: {
    productKey: "lightspeed",
    label: "Lightspeed",
    evidenceClass: "C",
    officialDomains: ["www.lightspeedhq.com"],
    verification: SEARCHED,
    verifiedAt: INCUMBENT_VERIFICATION_DATE,
    note: "Official product documentation verified; POS product is sales-gated. Capability checklist only.",
  },

  // --- Class D: generic / manual / unverifiable ---------------------------
  "spreadsheet-email-manual": {
    productKey: "spreadsheet-email-manual",
    label: "Spreadsheet/Email (manual workflow)",
    evidenceClass: "D",
    officialDomains: [],
    verification: "generic-manual-workflow",
    verifiedAt: null,
    note: "Manual workflow fallback — not a product; unverified. Incumbent capability renders UNKNOWN; excluded from performance claims.",
  },
  "vendor-storefronts-generic": {
    productKey: "vendor-storefronts-generic",
    label: "Vendor storefronts (generic category)",
    evidenceClass: "D",
    officialDomains: [],
    verification: "generic-category-unverified",
    verifiedAt: null,
    note: "Generic category row with no specific verifiable product. Downgraded from the frozen C default to D (unverifiable as a specific comparator).",
  },
  "authorized-supplier-portals-generic": {
    productKey: "authorized-supplier-portals-generic",
    label: "Authorized supplier portals (generic category)",
    evidenceClass: "D",
    officialDomains: [],
    verification: "generic-category-unverified",
    verifiedAt: null,
    note: "Generic category row with no specific verifiable product. Downgraded from the frozen C default to D (unverifiable as a specific comparator).",
  },
  "local-cash-and-carry-generic": {
    productKey: "local-cash-and-carry-generic",
    label: "Local cash-and-carry / supplier portal (generic category)",
    evidenceClass: "D",
    officialDomains: [],
    verification: "generic-category-unverified",
    verifiedAt: null,
    note: "Generic category row with no specific verifiable product. Downgraded from the frozen C default to D (unverifiable as a specific comparator).",
  },
  "pos-file-csv-manual": {
    productKey: "pos-file-csv-manual",
    label: "POS/file/CSV/receipt manual workflow",
    evidenceClass: "D",
    officialDomains: [],
    verification: "generic-manual-workflow",
    verifiedAt: null,
    note: "Manual no-RFID reconciliation workflow — not a product; unverified. Incumbent capability renders UNKNOWN; excluded from performance claims.",
  },
};
