/**
 * Documented provider execution-mode permission matrix (W3-003).
 *
 * FROZEN-ARCHITECTURE §3.D and INVARIANT 12 make PASS_THROUGH_NATIVE,
 * COMPOSED and OPTIMIZED_MULTI_PROVIDER explicit execution modes. The
 * matrix below documents, PER PROVIDER, which modes that provider's real
 * API surface permits for consequential commerce execution — with the
 * rationale grounded in the provider's own semantics. Where a provider
 * forbids a mode, the adapter BLOCKS it explicitly: the connected instance
 * never carries the mode in `authorizedExecutionModes`, so the canonical
 * W2-002 executability gate (evaluateCapabilityExecutability) rejects any
 * journey in that mode with EXECUTION_MODE_NOT_SUPPORTED — a documented
 * block, never a silent gap.
 *
 * ┌──────────┬────────────────────┬──────────┬──────────┬───────────────────────────────┐
 * │ Provider │ PASS_THROUGH_NATIVE│ COMPOSED │ OPTIMIZED│ Rationale                     │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ Shopify  │ permitted          │ permitted│ permitted│ Full Admin REST/GraphQL over   │
 * │          │                    │          │          │ a single-tenant store; accepts │
 * │          │                    │          │          │ native execution, multi-step   │
 * │          │                    │          │          │ composition (order→fulfillment)│
 * │          │                    │          │          │ and optimizer selection.        │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ eBay     │ permitted          │ permitted│ permitted│ OAuth-scoped RESTful Sell      │
 * │          │                    │          │          │ APIs; granular scopes support   │
 * │          │                    │          │          │ all three routing shapes.       │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ Amazon   │ permitted          │ permitted│ BLOCKED  │ SP-API operations are          │
 * │ SP-API   │                    │          │          │ role-restricted; consequential │
 * │          │                    │          │          │ operations do not accept        │
 * │          │                    │          │          │ optimizer-mediated cross-      │
 * │          │                    │          │          │ provider execution.             │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ Jumia    │ permitted          │ permitted│ BLOCKED  │ Seller Center rails are single-│
 * │          │                    │          │          │ marketplace per account; no    │
 * │          │                    │          │          │ cross-provider optimized        │
 * │          │                    │          │          │ execution surface.              │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ Depop    │ permitted          │ permitted│ BLOCKED  │ Limited public API (OAuth web  │
 * │          │                    │          │          │ flow, per-item endpoints); no   │
 * │          │                    │          │          │ bulk/optimized operations.      │
 * ├──────────┼────────────────────┼──────────┼──────────┼───────────────────────────────┤
 * │ Whatnot  │ permitted          │ BLOCKED  │ BLOCKED  │ Live-stream execution is stream-│
 * │          │                    │          │          │ scoped, time-ordered and        │
 * │          │                    │          │          │ immediate; the platform cannot │
 * │          │                    │          │          │ hold composed cross-step state │
 * │          │                    │          │          │ mid-stream, nor re-route bids. │
 * └──────────┴────────────────────┴──────────┴──────────┴───────────────────────────────┘
 */

import { ExecutionMode, type ExecutionMode as ExecutionModeType } from "@unicom/agent/capability";

/** First-provider identifiers (opaque provider ids, not adapter ids). */
export const FirstProviderId = {
  SHOPIFY: "shopify",
  EBAY: "ebay",
  AMAZON_SPAPI: "amazon-spapi",
  JUMIA: "jumia",
  DEPOP: "depop",
  WHATNOT: "whatnot",
} as const;
export type FirstProviderId = (typeof FirstProviderId)[keyof typeof FirstProviderId];

/** One provider's row in the permission matrix. */
export interface ProviderModePermission {
  readonly providerId: FirstProviderId;
  readonly permitted: readonly ExecutionModeType[];
  /** Forbidden modes with the documented provider rationale. */
  readonly blocked: readonly { readonly mode: ExecutionModeType; readonly rationale: string }[];
}

const PASS = ExecutionMode.PASS_THROUGH_NATIVE;
const COMP = ExecutionMode.COMPOSED;
const OPT = ExecutionMode.OPTIMIZED_MULTI_PROVIDER;

/** The matrix itself — the documented authority for adapter mode grants. */
export const PROVIDER_EXECUTION_MODE_MATRIX: readonly ProviderModePermission[] = [
  {
    providerId: "shopify",
    permitted: [PASS, COMP, OPT],
    blocked: [],
  },
  {
    providerId: "ebay",
    permitted: [PASS, COMP, OPT],
    blocked: [],
  },
  {
    providerId: "amazon-spapi",
    permitted: [PASS, COMP],
    blocked: [
      {
        mode: OPT,
        rationale:
          "SP-API operations are restricted to granted roles; consequential operations do not accept optimizer-mediated cross-provider execution.",
      },
    ],
  },
  {
    providerId: "jumia",
    permitted: [PASS, COMP],
    blocked: [
      {
        mode: OPT,
        rationale:
          "Seller Center rails are single-marketplace per seller account; no cross-provider optimized execution surface exists.",
      },
    ],
  },
  {
    providerId: "depop",
    permitted: [PASS, COMP],
    blocked: [
      {
        mode: OPT,
        rationale:
          "Depop's public API surface (OAuth web flow, per-item endpoints) exposes no bulk or optimized operations.",
      },
    ],
  },
  {
    providerId: "whatnot",
    permitted: [PASS],
    blocked: [
      {
        mode: COMP,
        rationale:
          "Live-stream execution is stream-scoped and time-ordered; the platform cannot hold composed cross-step state mid-stream.",
      },
      {
        mode: OPT,
        rationale:
          "Bids and buy-nows execute immediately inside one stream and cannot be re-routed across providers.",
      },
    ],
  },
];

/** Row lookup (undefined for providers outside the first set). */
export function matrixRowFor(providerId: string): ProviderModePermission | undefined {
  return PROVIDER_EXECUTION_MODE_MATRIX.find((row) => row.providerId === providerId);
}

/** Modes a provider permits (empty for unknown providers — fail closed). */
export function permittedModesFor(providerId: string): readonly ExecutionModeType[] {
  return matrixRowFor(providerId)?.permitted ?? [];
}

/** Explicit mode check with the documented rationale on refusal. */
export function assertModePermitted(
  providerId: string,
  mode: ExecutionModeType,
): { readonly permitted: boolean; readonly rationale?: string } {
  const row = matrixRowFor(providerId);
  if (row === undefined) {
    return { permitted: false, rationale: `provider "${providerId}" is not in the permission matrix` };
  }
  if (row.permitted.includes(mode)) return { permitted: true };
  const blocked = row.blocked.find((entry) => entry.mode === mode);
  return { permitted: false, rationale: blocked?.rationale ?? "mode not permitted by provider" };
}

/** All first providers that permit a mode (journey planning aid). */
export function providersPermitting(mode: ExecutionModeType): readonly FirstProviderId[] {
  return PROVIDER_EXECUTION_MODE_MATRIX.filter((row) => row.permitted.includes(mode)).map(
    (row) => row.providerId,
  );
}
