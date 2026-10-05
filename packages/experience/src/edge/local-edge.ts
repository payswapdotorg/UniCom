/**
 * LocalCommerceEdge boundary
 * (FROZEN-ARCHITECTURE §22.4, docs/SUPERMARKET-WITHOUT-RFID.md Level 3,
 * docs/UX-DEPLOYMENT.md "Local Commerce Edge UX", INVARIANT 45).
 *
 * A first-class connector boundary for legacy/no-API retail systems. It may
 * connect: authorized browser, shared files, USB, serial, LAN, local POS,
 * scanners, scales, cameras and local file drops. It operates offline and
 * hands observations to reconciliation. The merchant never needs to know
 * whether a connection uses API, browser, USB, serial or shared files.
 */

import type {
  LocalEdgeDeviceId,
  PrincipalRef,
  BrowserRouteCapabilityRef,
} from "../common/opaque-refs";
import type { OfflineObservationQueueEntry, ReconciliationHandoff } from "./offline-queue";
import type { UtcIso8601String } from "../common/values";

/** Local interfaces the edge may be authorized to use. */
export type LocalEdgeInterfaceKind =
  | "authorized-browser"
  | "shared-file"
  | "usb"
  | "serial"
  | "lan"
  | "local-pos"
  | "scanner"
  | "scale"
  | "camera";

/** Authority granted over one local interface. */
export interface LocalEdgeInterfaceAuthorization {
  readonly interfaceKind: LocalEdgeInterfaceKind;
  /** Explicit capability reference (browser routes use browser capabilities). */
  readonly capabilityRef: string | BrowserRouteCapabilityRef;
  readonly grantedTo: LocalEdgeDeviceId;
  readonly grantedBy: PrincipalRef;
  readonly grantedAt: UtcIso8601String;
  readonly scope: "read-only-observation" | "observation-and-commands";
  readonly revocable: true;
}

/** Installation modes (docs/UX-DEPLOYMENT.md "Local edge runtime modes"). */
export type LocalEdgeInstallationMode =
  | "installed-service"
  | "desktop-companion"
  | "browser-host-assisted"
  | "mobile-companion";

/** Offline behavior policy of the edge. */
export interface OfflinePolicy {
  readonly queueObservations: true;
  readonly syncTrigger: "connectivity-restored" | "scheduled" | "manual";
  readonly maxQueueDepthNote?: string;
}

/** Setup wizard steps (docs/UX-DEPLOYMENT.md "Local Commerce Edge UX"). */
export type LocalEdgeSetupStepId =
  | "run-on-store-computer"
  | "detect-authorized-interfaces"
  | "select-interfaces"
  | "test-read-only-observations"
  | "enable-selected-commands"
  | "show-reconciliation-health";

/** The LocalCommerceEdge boundary contract. */
export interface LocalCommerceEdgeContract {
  readonly edgeDeviceId: LocalEdgeDeviceId;
  readonly installationMode: LocalEdgeInstallationMode;
  readonly authorizedInterfaces: readonly LocalEdgeInterfaceAuthorization[];
  readonly offlinePolicy: OfflinePolicy;
  readonly queue: readonly OfflineObservationQueueEntry[];
  readonly handoffs: readonly ReconciliationHandoff[];
}

/** Setup wizard view offered from Connector Studio. */
export interface LocalEdgeSetupView {
  readonly wizardTitle: string;
  readonly userFacingNote: string;
  readonly steps: readonly { readonly stepId: LocalEdgeSetupStepId; readonly userLabel: string }[];
}
