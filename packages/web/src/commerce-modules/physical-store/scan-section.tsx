/**
 * physical-store camera/QR scan section — closes the registered J16 gap
 * (W3-017): an explicitly user-initiated, browser-local camera/QR capture
 * path with an accessible manual-code fallback. The camera state machine and
 * browser seams live in ./use-camera-scan.ts (split for the oxlint
 * max-lines gate); this file is the markup.
 *
 * On-surface honesty: the camera runs only while the user asks it to, frames
 * are decoded by the browser's native BarcodeDetector and never leave the
 * page, all exit paths stop every media track, and a decoded DEMO tag is
 * local label recognition only — it feeds the same count path as manual
 * entry (offline queue + replay semantics untouched), never a provider call
 * or a commerce-plane mutation.
 */

import type { JSX } from "react";

import type {
  CountObservationKind,
  InventoryCountObservation,
  ObservationSourceType,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { ConfirmableAction, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import { PHYSICAL_SKUS } from "./fixtures.js";
import { stateChip, stateLine, useCameraScan } from "./use-camera-scan.js";

export function CameraScanSection({
  host,
  offline,
  capture,
  buildObservation,
}: {
  readonly host: CommerceHostServices;
  readonly offline: boolean;
  readonly capture: (via: string, observation: InventoryCountObservation) => Promise<void>;
  readonly buildObservation: (
    suffix: string,
    skuId: string,
    kind: CountObservationKind,
    sourceType: ObservationSourceType,
    counted: number,
  ) => InventoryCountObservation;
}): JSX.Element {
  const scan = useCameraScan({ offline, capture, buildObservation });
  const { scanState, recognized, recognizedVia } = scan;

  const skuTitle = (skuId: string): string =>
    PHYSICAL_SKUS.find((sku) => sku.skuId === skuId)?.title ?? skuId;
  const fallbackLink = (
    <p className="cm-card-sub">
      <a href="#cm-store-scan-manual-entry">
        Use manual code entry instead — no camera needed, fully keyboard-accessible.
      </a>
    </p>
  );

  return (
    <section aria-label="Camera QR scan">
      <h2 className="cm-section-title">Camera / QR label scan — local, user-initiated</h2>
      <PermissionBoundary host={host} permission="receiving.count-stock">
        <div className="cm-stack">
          <div className="cm-row" data-testid="cm-store-scan-state" data-camera-state={scanState}>
            <StatusChip
              status={stateChip(scanState)}
              note="The camera state is always visible — it is never left running silently"
            />
            <span className="cm-env-note" role="status" aria-live="polite">
              {stateLine(scanState)}
            </span>
          </div>
          <p className="cm-card-sub">
            The camera runs only while you ask it to and decodes with this browser&apos;s
            built-in BarcodeDetector — frames never leave this page (no upload, no
            persistence, no telemetry, no remote decoding). A decoded DEMO tag is local
            label recognition only — not provider-verified stock, consent, authorization
            or a commitment — and feeds the same count path as manual entry.
          </p>
          <div className="cm-row">
            {scanState === "idle" ? (
              <button
                type="button"
                className="cm-button"
                data-testid="cm-store-scan-start"
                onClick={() => void scan.startScan()}
              >
                Start scan (turn the camera ON)
              </button>
            ) : null}
            {scanState === "scanning" ? (
              <button
                type="button"
                className="cm-button"
                data-testid="cm-store-scan-cancel"
                onClick={scan.cancelScan}
              >
                Cancel scan (stop the camera)
              </button>
            ) : null}
            {scanState === "requesting" ? (
              <span className="cm-env-note">
                Requesting the camera… (you can deny — manual entry always works)
              </span>
            ) : null}
            {scanState === "denied" || scanState === "error" || scanState === "not-recognized" || scanState === "decoded" ? (
              <button
                type="button"
                className="cm-button"
                data-testid="cm-store-scan-retry"
                onClick={() => void scan.startScan()}
              >
                {scanState === "decoded" ? "Scan another tag (restart the camera)" : "Try the scan again"}
              </button>
            ) : null}
          </div>
          <video
            ref={scan.videoRef}
            data-testid="cm-store-scan-video"
            muted
            playsInline
            style={{ display: scanState === "scanning" ? "block" : "none", maxWidth: "320px" }}
          />
          {scan.notice ? (
            <p className="cm-card-sub" role="status" aria-live="polite" data-testid="cm-store-scan-notice">
              {scan.notice}
            </p>
          ) : null}
          {scanState === "denied" || scanState === "unsupported" || scanState === "error" || scanState === "not-recognized"
            ? fallbackLink
            : null}
          {scanState === "decoded" && recognized ? (
            <div className="cm-card" data-testid="cm-store-scan-decoded">
              <div className="cm-row">
                <span className="cm-env-note">Decoded payload:</span>
                <code data-testid="cm-store-scan-payload">{recognized.payload}</code>
              </div>
              <p className="cm-card-sub">
                Read locally; the camera stopped the moment the code was read — every
                track is released. Confirm below to hand the tag&apos;s count to the same
                capture path manual entry uses.
              </p>
            </div>
          ) : null}
          {recognized ? (
            <ConfirmableAction
              actionLabel={
                recognizedVia === "camera"
                  ? `Capture scanned count — ${skuTitle(recognized.skuId)} (${recognized.counted} on the tag)`
                  : `Capture looked-up count — ${skuTitle(recognized.skuId)} (${recognized.counted} on the tag)`
              }
              confirmLabel="Capture now"
              statement={
                recognizedVia === "camera"
                  ? `The scanned tag says ${recognized.counted} × ${skuTitle(recognized.skuId)} (${recognized.skuId}). This is LOCAL recognition of a committed DEMO label — not provider-verified stock, consent or a commitment. Online it reconciles immediately; offline it queues locally first (exactly like manual entry).`
                  : `The typed code resolves to the committed DEMO tag: ${recognized.counted} × ${skuTitle(recognized.skuId)} (${recognized.skuId}). A human-entered count, captured like any manual entry — not provider-verified stock, consent or a commitment.`
              }
              onExecute={scan.captureRecognized}
              data-testid="cm-store-scan-capture"
            />
          ) : null}
          {scan.capturedNotice ? (
            <p className="cm-card-sub" data-testid="cm-store-scan-captured">
              {scan.capturedNotice}
            </p>
          ) : null}
          <div className="cm-card" id="cm-store-scan-manual-entry" data-testid="cm-store-scan-manual-entry">
            <h3 className="cm-card-title">Manual code entry (the accessible fallback)</h3>
            <p className="cm-card-sub">
              No camera needed: type the code printed on the tag. Works when the camera
              is unavailable, denied, or you prefer the keyboard.
            </p>
            <div className="cm-row">
              <label className="cm-env-note" htmlFor="cm-store-scan-code-input">
                Product code
              </label>
              <input
                id="cm-store-scan-code-input"
                type="text"
                data-testid="cm-store-scan-code-input"
                aria-label="Enter product code manually"
                value={scan.codeInput}
                onChange={(event) => scan.setCodeInput(event.target.value)}
              />
              <button
                type="button"
                className="cm-button"
                data-testid="cm-store-scan-manual-lookup"
                onClick={scan.lookupManually}
              >
                Look up the code
              </button>
            </div>
            {scan.manualNotice ? (
              <p className="cm-card-sub" role="status" aria-live="polite" data-testid="cm-store-scan-manual-notice">
                {scan.manualNotice}
              </p>
            ) : null}
          </div>
        </div>
      </PermissionBoundary>
    </section>
  );
}
