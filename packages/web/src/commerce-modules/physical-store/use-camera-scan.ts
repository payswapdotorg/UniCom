/**
 * physical-store camera/QR scan engine — the React hook behind the J16 scan
 * section (W3-017). Split from ./scan-section.tsx for the oxlint max-lines
 * gate; this file owns the state machine and the browser seams, the section
 * owns the markup.
 *
 * Privacy laws enforced here by construction:
 * - the camera is activated ONLY by the explicit startScan() (wired to the
 *   "Start scan" click — never on mount/load);
 * - ONE stopScan() stops every media track and is called from success, cancel,
 *   error and the unmount effect — the camera is never left silently running;
 * - decoding is the browser's NATIVE BarcodeDetector over in-memory frames
 *   only: no upload, no persistence, no logging, no remote decoding;
 * - a decoded payload is LOCAL recognition of a committed DEMO shelf tag —
 *   never provider-verified stock, consent, authorization or a commitment —
 *   and feeds the same capture() path manual entry uses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CountObservationKind,
  InventoryCountObservation,
  ObservationSourceType,
} from "@unicom/commerce";
import { lookupScanCode, type PhysicalScanCode } from "./fixtures.js";

/** Minimal local typings for the native BarcodeDetector API (not yet in lib.dom). */
interface DetectedBarcode {
  readonly rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { readonly formats?: readonly string[] }) => BarcodeDetectorLike;

/** QR (the demo shelf tags) plus the common retail 1D barcode formats. */
const SCAN_FORMATS: readonly string[] = ["qr_code", "ean_13", "upc_a", "code_128", "code_39"];

const POLL_INTERVAL_MS = 250;
/** Honest bounded scan window: ~3s without any detection stops the camera. */
const MAX_EMPTY_POLLS = 12;
/** A decoder that keeps throwing ends the session honestly (never silently). */
const MAX_DETECTOR_FAILURES = 3;

export type CameraScanState =
  | "idle"
  | "requesting"
  | "scanning"
  | "decoded"
  | "denied"
  | "unsupported"
  | "error"
  | "not-recognized";

/** The state word shown on the status chip (tone via the honest classifier). */
export function stateChip(state: CameraScanState): string {
  switch (state) {
    case "idle":
      return "IDLE";
    case "requesting":
      return "REQUESTING";
    case "scanning":
      return "SCANNING";
    case "decoded":
      return "DECODED";
    case "denied":
      return "DENIED";
    case "unsupported":
      return "UNSUPPORTED";
    case "error":
      return "FAILED";
    case "not-recognized":
      return "NOT_RECOGNIZED";
  }
}

export function stateLine(state: CameraScanState): string {
  switch (state) {
    case "idle":
      return "Camera off. Nothing is activated until you start a scan.";
    case "requesting":
      return "Requesting camera access — only because you clicked Start scan.";
    case "scanning":
      return "Camera on, decoding locally — every frame stays on this page.";
    case "decoded":
      return "Code read; camera stopped (every track released).";
    case "denied":
      return "Camera permission was denied — the camera never turned on.";
    case "unsupported":
      return "Camera scanning is not available in this browser/context.";
    case "error":
      return "The scan attempt failed — nothing was captured or transmitted.";
    case "not-recognized":
      return "No usable code was recognized — nothing was captured.";
  }
}

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function isPermissionDeniedError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { readonly name?: unknown }).name === "NotAllowedError"
  );
}

export interface CameraScanApi {
  readonly scanState: CameraScanState;
  readonly notice: string | null;
  readonly codeInput: string;
  readonly setCodeInput: (value: string) => void;
  readonly recognized: PhysicalScanCode | null;
  readonly recognizedVia: "camera" | "manual" | null;
  readonly manualNotice: string | null;
  readonly capturedNotice: string | null;
  readonly videoRef: { current: HTMLVideoElement | null };
  readonly startScan: () => Promise<void>;
  readonly cancelScan: () => void;
  readonly lookupManually: () => void;
  readonly captureRecognized: () => void;
}

export function useCameraScan({
  offline,
  capture,
  buildObservation,
}: {
  readonly offline: boolean;
  readonly capture: (via: string, observation: InventoryCountObservation) => Promise<void>;
  readonly buildObservation: (
    suffix: string,
    skuId: string,
    kind: CountObservationKind,
    sourceType: ObservationSourceType,
    counted: number,
  ) => InventoryCountObservation;
}): CameraScanApi {
  const [scanState, setScanState] = useState<CameraScanState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [recognized, setRecognized] = useState<PhysicalScanCode | null>(null);
  const [recognizedVia, setRecognizedVia] = useState<"camera" | "manual" | null>(null);
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  const [capturedNotice, setCapturedNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const pollRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const emptyPollsRef = useRef(0);
  const detectorFailuresRef = useRef(0);

  /** The ONE track-stopping exit path (success, cancel, error, unmount). */
  const stopScan = useCallback((): void => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    detectorRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  // Unmount/navigation cleanup: never leave a camera silently running.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopScan();
    };
  }, [stopScan]);

  const applyDecodedPayload = useCallback((payload: string): void => {
    setCodeInput(payload);
    setManualNotice(null);
    const match = lookupScanCode(payload);
    if (match === null) {
      setRecognized(null);
      setRecognizedVia(null);
      setScanState("not-recognized");
      setNotice(
        `The decoded code "${payload}" is not one of this demo's committed labels — nothing was captured (the camera is stopped).`,
      );
      return;
    }
    setRecognized(match);
    setRecognizedVia("camera");
    setScanState("decoded");
    setNotice(null);
  }, []);

  const pollDetect = useCallback(async (): Promise<void> => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (detector === null || video === null) return;
    if (video.readyState < 2) return; // no frame available yet — keep scanning
    let detected: readonly DetectedBarcode[];
    try {
      detected = await detector.detect(video);
    } catch (err) {
      detectorFailuresRef.current += 1;
      if (detectorFailuresRef.current >= MAX_DETECTOR_FAILURES) {
        stopScan();
        setScanState("error");
        setNotice(`The browser's decoder failed repeatedly: ${describeError(err)} — nothing was transmitted.`);
      }
      return;
    }
    detectorFailuresRef.current = 0;
    if (detected.length === 0) {
      emptyPollsRef.current += 1;
      if (emptyPollsRef.current >= MAX_EMPTY_POLLS) {
        stopScan();
        setScanState("not-recognized");
        setNotice(
          "No code was detected before the scan window ended — the camera has been stopped. Start again or use manual entry.",
        );
      }
      return;
    }
    const first = detected[0];
    if (first === undefined) return; // length>0 without an element — keep scanning
    const payload = first.rawValue;
    stopScan();
    applyDecodedPayload(payload);
  }, [applyDecodedPayload, stopScan]);

  /** User-initiated only: every caller is an explicit button click. */
  const startScan = useCallback(async (): Promise<void> => {
    stopScan();
    setCapturedNotice(null);
    setNotice(null);
    if (!window.isSecureContext) {
      setScanState("unsupported");
      setNotice(
        "This page is not a secure context (https or localhost) — browsers only expose camera APIs on secure contexts.",
      );
      return;
    }
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setScanState("unsupported");
      setNotice("This browser does not expose navigator.mediaDevices.getUserMedia — no camera can be requested.");
      return;
    }
    const ctor = barcodeDetectorCtor();
    if (ctor === null) {
      setScanState("unsupported");
      setNotice(
        "This browser does not expose the native BarcodeDetector API, so there is no local decoder (this app never uses remote decoding).",
      );
      return;
    }
    let detector: BarcodeDetectorLike;
    try {
      detector = new ctor({ formats: SCAN_FORMATS });
    } catch (err) {
      setScanState("error");
      setNotice(`The browser's decoder could not be constructed: ${describeError(err)}.`);
      return;
    }
    setScanState("requesting");
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ video: { facingMode: "environment" } });
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        setScanState("denied");
        setNotice(
          "The camera permission request was denied — the camera was never activated. Grant access and retry, or use manual entry below.",
        );
      } else {
        setScanState("error");
        setNotice(`The camera could not be started: ${describeError(err)}.`);
      }
      return;
    }
    streamRef.current = stream;
    if (!aliveRef.current) {
      stopScan(); // unmounted while the permission request was in flight
      return;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        const playback = video.play();
        if (playback && typeof playback.then === "function") {
          await playback.catch(() => undefined); // autoplay refusal ≠ scan failure
        }
      } catch {
        // Environments without real playback still poll the decode loop.
      }
    }
    if (!aliveRef.current) {
      stopScan();
      return;
    }
    detectorRef.current = detector;
    emptyPollsRef.current = 0;
    detectorFailuresRef.current = 0;
    setScanState("scanning");
    pollRef.current = window.setInterval(() => {
      void pollDetect();
    }, POLL_INTERVAL_MS);
  }, [pollDetect, stopScan]);

  const cancelScan = useCallback((): void => {
    stopScan();
    setScanState("idle");
    setNotice("Scan cancelled — the camera was stopped (every track released).");
  }, [stopScan]);

  const lookupManually = useCallback((): void => {
    const value = codeInput.trim();
    if (value === "") {
      setManualNotice("Type a code first — for example: unicom-demo-qr:sku-phys-bread:28");
      return;
    }
    const match = lookupScanCode(value);
    setRecognized(match);
    setRecognizedVia(match === null ? null : "manual");
    setManualNotice(
      match === null
        ? `The code "${value}" is not one of this demo's committed labels — nothing was captured.`
        : null,
    );
  }, [codeInput]);

  const captureRecognized = useCallback((): void => {
    if (recognized === null || recognizedVia === null) return;
    const viaCamera = recognizedVia === "camera";
    const via = viaCamera ? "camera QR scan (local decode)" : "manual code entry";
    const suffix = `${viaCamera ? "camera-qr" : "manual-code"}-${recognized.skuId}`;
    void capture(
      via,
      buildObservation(
        suffix,
        recognized.skuId,
        viaCamera ? "BARCODE_COUNT" : "EMPLOYEE_COUNT",
        viaCamera ? "CAMERA" : "EMPLOYEE",
        recognized.counted,
      ),
    );
    setCapturedNotice(
      `Counted ${recognized.counted} × ${recognized.skuId} via ${via} — ${
        offline
          ? "offline mode is ON: the observation joined the local queue below (never promoted until replay)."
          : "the kernel reconciled it immediately (outcome above, records below)."
      }`,
    );
    setRecognized(null);
    setRecognizedVia(null);
    setCodeInput("");
    setManualNotice(null);
    setNotice(null);
    setScanState("idle");
  }, [buildObservation, capture, offline, recognized, recognizedVia]);

  return {
    scanState,
    notice,
    codeInput,
    setCodeInput,
    recognized,
    recognizedVia,
    manualNotice,
    capturedNotice,
    videoRef,
    startScan,
    cancelScan,
    lookupManually,
    captureRecognized,
  };
}
