/**
 * physical-store camera/QR scan tests (J16, W3-017) — deterministic
 * camera/decoder seam (NO real hardware in CI) + a network tripwire proving
 * the scan path emits ZERO network requests.
 *
 * The seam stubs exactly the browser APIs the scan engine touches:
 * - navigator.mediaDevices.getUserMedia -> a fake MediaStream whose track
 *   carries a stop spy (never installed unless the test asks for it);
 * - window.BarcodeDetector -> a controllable detector (known code / empty /
 *   throws), plus priming of the <video> element (readyState + play) so the
 *   decode loop polls deterministically;
 * - canvas 2D contexts (the BUNDLED jsQR fallback path): jsdom ships no
 *   canvas rasterizer, so the seam patches getContext("2d") with a fake
 *   context whose drawImage(video) + getImageData() surface a REAL QR —
 *   rasterized with the hoisted qrcode package (a TEST-ONLY import, never
 *   from packages/web/src/**) — so jsQR performs genuine pixel decoding;
 *   nothing about the decoded payload is stubbed;
 * - window.isSecureContext -> true by default (jsdom leaves it undefined).
 *
 * The network tripwire (whole suite): window.fetch, window.XMLHttpRequest and
 * navigator.sendBeacon are replaced with throwing/counting spies — a single
 * call from the scan path fails the suite and the afterAll asserts ZERO.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRequire } from "node:module";
import PhysicalStoreComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import {
  clickButton,
  findButton,
  renderUiAsync,
  setCheckbox,
  textOf,
} from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

// TEST-ONLY: the hoisted qrcode package rasterizes REAL QR shelf tags for
// the bundled-decoder tests. Imported by absolute path (it is NOT a
// dependency of @zcode/web) and NEVER from packages/web/src/**.
const nodeRequire = createRequire(import.meta.url);
const qrcode = nodeRequire("/home/z/battery/w3-017/node_modules/qrcode") as {
  create: (
    text: string,
    options?: { readonly errorCorrectionLevel?: string },
  ) => { readonly modules: { readonly size: number; readonly data: Uint8Array } };
};

const START = "Start scan (turn the camera ON)";
const CANCEL = "Cancel scan (stop the camera)";
const BREAD_PAYLOAD = "unicom-demo-qr:sku-phys-bread:28";
const COFFEE_PAYLOAD = "unicom-demo-qr:sku-phys-coffee:15";

let rendered: RenderedUi | null = null;
const seamCleanups: Array<() => void> = [];

async function mount(roles: readonly CommerceRoleId[] = ["store-operator"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <PhysicalStoreComponent moduleId="physical-store" journey="J16" host={host} />,
  );
  await waitForText(ui.container, "the no-RFID supermarket");
  return ui;
}

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  for (const restore of seamCleanups.splice(0)) restore();
});

// ---------------------------------------------------------------------------
// deterministic camera/decoder seam
// ---------------------------------------------------------------------------

interface CameraSeamOptions {
  readonly detectBehavior: (video: unknown) => Promise<readonly { readonly rawValue: string }[]>;
  readonly getUserMediaError?: unknown;
  readonly installDetector?: boolean;
  readonly installMediaDevices?: boolean;
  readonly secureContext?: boolean;
}

interface CameraSeam {
  readonly getUserMediaCalls: () => number;
  readonly recordedConstraints: readonly unknown[];
  readonly detectCalls: () => number;
  readonly trackStopCalls: () => number;
}

function installCameraSeam(opts: CameraSeamOptions): CameraSeam {
  Object.defineProperty(window, "isSecureContext", {
    value: opts.secureContext ?? true,
    configurable: true,
  });
  seamCleanups.push(() => Reflect.deleteProperty(window, "isSecureContext"));

  let detectCalls = 0;
  if (opts.installDetector !== false) {
    const DetectorStub = class {
      constructor(_options?: unknown) {
        // formats are ignored by the stub — the component still passes them
      }
      async detect(video: unknown): Promise<readonly { readonly rawValue: string }[]> {
        detectCalls += 1;
        return opts.detectBehavior(video);
      }
    };
    (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = DetectorStub;
    seamCleanups.push(() => {
      delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    });
  }

  let trackStopCalls = 0;
  let getUserMediaCalls = 0;
  const recordedConstraints: unknown[] = [];
  if (opts.installMediaDevices !== false) {
    const track = {
      stop: (): void => {
        trackStopCalls += 1;
      },
    };
    const stream = { getTracks: () => [track] };
    const mediaDevices = {
      getUserMedia: async (constraints: unknown): Promise<unknown> => {
        getUserMediaCalls += 1;
        recordedConstraints.push(constraints);
        if (opts.getUserMediaError !== undefined) throw opts.getUserMediaError;
        return stream;
      },
    };
    Object.defineProperty(navigator, "mediaDevices", { value: mediaDevices, configurable: true });
    seamCleanups.push(() => {
      Reflect.deleteProperty(navigator, "mediaDevices");
    });
  }

  return {
    getUserMediaCalls: () => getUserMediaCalls,
    recordedConstraints,
    detectCalls: () => detectCalls,
    trackStopCalls: () => trackStopCalls,
  };
}

/** Prime the rendered <video> for the decode loop (frame ready, playable). */
function primeScanVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector<HTMLVideoElement>('[data-testid="cm-store-scan-video"]');
  if (video === null) throw new Error("scan video element not found");
  Object.defineProperty(video, "readyState", { value: 2, configurable: true });
  Object.defineProperty(video, "play", { value: () => Promise.resolve(), configurable: true });
  return video;
}

// ---------------------------------------------------------------------------
// bundled-decoder seam: REAL QR pixels through a fake canvas 2D context
// ---------------------------------------------------------------------------

/** A rasterized REAL QR code (RGBA pixels) — the frame a camera would see. */
interface QrFrame {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

const QR_MODULE_PX = 8; // rendered pixels per QR module (crisp, fast decode)
const QR_QUIET_MODULES = 4; // the quiet zone the QR spec requires

/** Rasterize a REAL QR for `payload` — white paper, black modules, RGBA. */
function rasterizeQrFrame(payload: string): QrFrame {
  const qr = qrcode.create(payload, { errorCorrectionLevel: "M" });
  const moduleCount = qr.modules.size;
  const bits = qr.modules.data;
  const dim = (moduleCount + QR_QUIET_MODULES * 2) * QR_MODULE_PX;
  const data = new Uint8ClampedArray(dim * dim * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (bits[row * moduleCount + col] === 0) continue;
      for (let dy = 0; dy < QR_MODULE_PX; dy += 1) {
        const y = (row + QR_QUIET_MODULES) * QR_MODULE_PX + dy;
        for (let dx = 0; dx < QR_MODULE_PX; dx += 1) {
          const x = (col + QR_QUIET_MODULES) * QR_MODULE_PX + dx;
          const idx = (y * dim + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

interface CanvasFrameSeam {
  /** Attach a REAL rasterized QR to a video element (its "camera frames"). */
  readonly attach: (video: HTMLVideoElement, frame: QrFrame) => void;
  /** How many frames the bundled decoder pulled out of the canvas. */
  readonly getImageDataCalls: () => number;
}

/**
 * The bundled-decoder seam: jsdom ships no canvas rasterizer, so patch
 * getContext("2d") with a fake context whose drawImage(video) records the
 * source and whose getImageData() surfaces the REAL QR attached to it. The
 * bundled jsQR decoder then decodes GENUINE pixels end-to-end.
 */
function installCanvasFrameSeam(): CanvasFrameSeam {
  const frames = new WeakMap<HTMLVideoElement, QrFrame>();
  let getImageDataCalls = 0;
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (type: string, options?: unknown) => unknown;
  };
  const originalGetContext = proto.getContext;
  proto.getContext = function patchedGetContext(
    this: HTMLCanvasElement,
    type: string,
    options?: unknown,
  ): unknown {
    if (type !== "2d") return originalGetContext.call(this, type, options);
    let drawn: HTMLVideoElement | null = null;
    return {
      drawImage: (source: HTMLVideoElement): void => {
        drawn = source;
      },
      getImageData: (sx: number, sy: number, sw: number, sh: number): QrFrame => {
        getImageDataCalls += 1;
        const video = drawn;
        if (video === null) throw new Error("canvas frame seam: getImageData() before drawImage()");
        const frame = frames.get(video);
        if (frame === undefined) throw new Error("canvas frame seam: drawn video carries no attached QR frame");
        if (sx !== 0 || sy !== 0 || sw !== frame.width || sh !== frame.height) {
          throw new Error(`canvas frame seam: unexpected rect ${sw}x${sh} for a ${frame.width}x${frame.height} frame`);
        }
        return frame;
      },
    };
  };
  seamCleanups.push(() => {
    proto.getContext = originalGetContext;
  });
  return {
    attach: (video, frame) => {
      frames.set(video, frame);
    },
    getImageDataCalls: () => getImageDataCalls,
  };
}

/**
 * Prime the <video> for the BUNDLED decoder path: frame ready + the geometry
 * of a REAL rasterized QR attached through the canvas frame seam.
 */
function primeFallbackVideo(
  container: HTMLElement,
  canvasSeam: CanvasFrameSeam,
  payload: string,
): HTMLVideoElement {
  const video = primeScanVideo(container);
  const frame = rasterizeQrFrame(payload);
  canvasSeam.attach(video, frame);
  Object.defineProperty(video, "videoWidth", { value: frame.width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: frame.height, configurable: true });
  return video;
}

function scanStateOf(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="cm-store-scan-state"]')?.getAttribute("data-camera-state") ?? null;
}

/**
 * Poll until the camera state chip shows the expected state.
 *
 * Each iteration is its OWN short act() scope — NEVER wrap the whole loop in
 * one act(): React queues updates that arrive while an act scope is open
 * (e.g. the setState calls the scan engine makes from its setInterval
 * callback) and only flushes them when that scope EXITS. One act() around the
 * entire loop therefore deadlocks: the DOM never updates, the loop never
 * exits, and the test times out. Per-iteration act() lets every flush land.
 */
async function waitForScanState(container: HTMLElement, expected: string, timeoutMs = 8000): Promise<void> {
  const startedAt = Date.now();
  while (scanStateOf(container) !== expected) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for camera state "${expected}" (now ${scanStateOf(container)})`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  }
}

/** Click a scan button and let the async startScan() settle INSIDE act(). */
async function clickScanButton(container: HTMLElement, text: string): Promise<void> {
  const button = findButton(container, text);
  if (button === null) throw new Error(`button not found: ${text}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function setInputValue(container: HTMLElement, testid: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`);
  if (input === null) throw new Error(`input not found: ${testid}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter unavailable");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// ---------------------------------------------------------------------------
// network tripwire (whole suite): zero emission or the suite fails
// ---------------------------------------------------------------------------

interface Tripwire {
  readonly counts: () => { readonly fetch: number; readonly xhr: number; readonly beacon: number };
  readonly restore: () => void;
}

let tripwire: Tripwire | null = null;

function installNetworkTripwire(): Tripwire {
  let fetchCalls = 0;
  let xhrCalls = 0;
  let beaconCalls = 0;
  const win = window as unknown as { fetch?: unknown; XMLHttpRequest?: unknown };
  const hadFetch = "fetch" in window;
  const originalFetch = window.fetch;
  win.fetch = (): never => {
    fetchCalls += 1;
    throw new Error("scan-path network tripwire: fetch() must never be called");
  };
  const originalXHR = window.XMLHttpRequest;
  class TripwireXHR {
    constructor() {
      xhrCalls += 1;
      throw new Error("scan-path network tripwire: XMLHttpRequest must never be constructed");
    }
  }
  win.XMLHttpRequest = TripwireXHR;
  const hadBeacon = "sendBeacon" in navigator;
  Object.defineProperty(navigator, "sendBeacon", {
    value: (): boolean => {
      beaconCalls += 1;
      return false;
    },
    configurable: true,
  });
  return {
    counts: () => ({ fetch: fetchCalls, xhr: xhrCalls, beacon: beaconCalls }),
    restore: () => {
      if (hadFetch && originalFetch !== undefined) win.fetch = originalFetch;
      else delete win.fetch;
      win.XMLHttpRequest = originalXHR;
      if (hadBeacon) Reflect.deleteProperty(navigator, "sendBeacon");
      else Reflect.deleteProperty(navigator, "sendBeacon");
    },
  };
}

beforeAll(() => {
  tripwire = installNetworkTripwire();
});

afterAll(() => {
  const counts = tripwire?.counts();
  tripwire?.restore();
  tripwire = null;
  // THE tripwire law: the scan suite must emit ZERO network requests.
  expect(counts).toEqual({ fetch: 0, xhr: 0, beacon: 0 });
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("physical-store (J16) — camera/QR scan: user-initiated, local-only", () => {
  it("renders idle with the manual fallback; the camera is never touched without a click", async () => {
    const seam = installCameraSeam({ detectBehavior: () => Promise.resolve([]) });
    rendered = await mount();
    expect(textOf(rendered.container)).toContain("Camera / QR label scan — local, user-initiated");
    expect(scanStateOf(rendered.container)).toBe("idle");
    expect(textOf(rendered.container)).toContain("Camera off. Nothing is activated until you start a scan.");
    expect(findButton(rendered.container, START)).not.toBeNull();
    // the accessible manual fallback is present from the start
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-manual-entry"]')).not.toBeNull();
    // no permission request, no decoder, no stream — mount alone activates nothing
    expect(seam.getUserMediaCalls()).toBe(0);
    expect(seam.detectCalls()).toBe(0);
    expect(seam.trackStopCalls()).toBe(0);
  });

  it("granted + decode: payload fills the code field, confirm captures into the local workflow, camera returns to idle", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([{ rawValue: BREAD_PAYLOAD }]),
    });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "scanning");
    expect(textOf(rendered.container)).toContain("Camera on, decoding locally — every frame stays on this page.");
    await waitForScanState(rendered.container, "decoded");
    // the exact environment camera (rear-facing) was requested — after the click only
    expect(seam.recordedConstraints).toEqual([{ video: { facingMode: "environment" } }]);
    // the stream was stopped the moment the code was read
    expect(seam.trackStopCalls()).toBe(1);
    expect(textOf(rendered.container)).toContain("Decoded payload:");
    expect(textOf(rendered.container)).toContain(BREAD_PAYLOAD);
    // routed into the SAME confirm-gated local workflow as manual entry
    clickButton(rendered.container, "Capture scanned count — Sourdough loaf (sliced) (28 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    await waitForText(rendered.container, "on hand 28");
    const text = textOf(rendered.container);
    expect(text).toContain("PROMOTED");
    expect(text).toContain("Counted 28 × sku-phys-bread via camera QR scan (local decode)");
    // camera state visibly returned to idle (cleanup visible)
    expect(scanStateOf(rendered.container)).toBe("idle");
    // network tripwire: the full scan + capture emitted nothing
    expect(tripwire?.counts()).toEqual({ fetch: 0, xhr: 0, beacon: 0 });
  });

  it("offline scan joins the local queue (offline queue/replay semantics untouched)", async () => {
    installCameraSeam({ detectBehavior: () => Promise.resolve([{ rawValue: BREAD_PAYLOAD }]) });
    rendered = await mount();
    primeScanVideo(rendered.container);
    setCheckbox(rendered.container, "Simulate offline mode (queue observations locally)", true);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "decoded");
    clickButton(rendered.container, "Capture scanned count — Sourdough loaf (sliced) (28 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    await waitForText(rendered.container, "queued-2");
    const text = textOf(rendered.container);
    expect(text).toContain("camera QR scan (local decode)");
    expect(text).toContain("QUEUED_OFFLINE");
    // canonical stock untouched while offline
    expect(text).toContain("on hand 30");
    expect(text).toContain("offline mode is ON: the observation joined the local queue below");
  });

  it("denied permission (NotAllowedError): denied state + retry + manual fallback completes a capture with NO camera", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([]),
      getUserMediaError: new DOMException("Permission denied", "NotAllowedError"),
    });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "denied");
    const text = textOf(rendered.container);
    expect(text).toContain("The camera permission request was denied — the camera was never activated.");
    expect(text).toContain("Use manual code entry instead — no camera needed, fully keyboard-accessible.");
    expect(findButton(rendered.container, "Try the scan again")).not.toBeNull();
    // the camera never turned on: no stream was ever created or stopped
    expect(seam.trackStopCalls()).toBe(0);
    // the manual fallback is fully operable from the denied state
    setInputValue(rendered.container, "cm-store-scan-code-input", COFFEE_PAYLOAD);
    clickButton(rendered.container, "Look up the code");
    await waitForText(rendered.container, "Capture looked-up count — House blend coffee, 500g (15 on the tag)");
    clickButton(rendered.container, "Capture looked-up count — House blend coffee, 500g (15 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // coffee 15 vs 18 on hand → variance -3, beyond ±2 → held as a discrepancy
    await waitForText(rendered.container, "variance -3");
    expect(textOf(rendered.container)).toContain("DISCREPANCY_HOLD");
    expect(textOf(rendered.container)).toContain("Counted 15 × sku-phys-coffee via manual code entry");
  });

  it("unsupported (no mediaDevices.getUserMedia): honest unsupported state, no crash, manual entry reachable", async () => {
    installCameraSeam({
      detectBehavior: () => Promise.resolve([]),
      installMediaDevices: false,
    });
    rendered = await mount();
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "unsupported");
    const text = textOf(rendered.container);
    expect(text).toContain("This browser does not expose navigator.mediaDevices.getUserMedia");
    expect(text).toContain("Use manual code entry instead — no camera needed, fully keyboard-accessible.");
    // the fallback still recognizes codes
    setInputValue(rendered.container, "cm-store-scan-code-input", BREAD_PAYLOAD);
    clickButton(rendered.container, "Look up the code");
    await waitForText(rendered.container, "Capture looked-up count — Sourdough loaf (sliced) (28 on the tag)");
  });

  it("no native BarcodeDetector: the bundled jsQR fallback decodes a REAL QR locally, decode → capture completes", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([]), // the native stub is never installed
      installDetector: false,
    });
    const canvasSeam = installCanvasFrameSeam();
    rendered = await mount();
    primeFallbackVideo(rendered.container, canvasSeam, COFFEE_PAYLOAD);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "scanning");
    // the honest surface copy: native when present, otherwise the bundled local decoder
    expect(textOf(rendered.container)).toContain("bundled jsQR decoder");
    // a local decoder IS available → the hardware is requested after the click
    expect(seam.getUserMediaCalls()).toBe(1);
    expect(seam.recordedConstraints).toEqual([{ video: { facingMode: "environment" } }]);
    await waitForScanState(rendered.container, "decoded");
    // jsQR genuinely decoded the drawn QR — the native detector was never consulted
    expect(seam.detectCalls()).toBe(0);
    expect(canvasSeam.getImageDataCalls()).toBeGreaterThan(0);
    expect(textOf(rendered.container)).toContain(COFFEE_PAYLOAD);
    // decode → capture completes through the SAME confirm-gated local workflow
    clickButton(rendered.container, "Capture scanned count — House blend coffee, 500g (15 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // coffee 15 vs 18 on hand → variance -3 beyond ±2 → held, never a silent promotion
    await waitForText(rendered.container, "variance -3");
    expect(textOf(rendered.container)).toContain("DISCREPANCY_HOLD");
    expect(textOf(rendered.container)).toContain("Counted 15 × sku-phys-coffee via camera QR scan (local decode)");
    // the camera stopped the moment the code was read, then returned to idle
    expect(seam.trackStopCalls()).toBe(1);
    expect(scanStateOf(rendered.container)).toBe("idle");
    // network tripwire: the bundled decode + capture emitted nothing
    expect(tripwire?.counts()).toEqual({ fetch: 0, xhr: 0, beacon: 0 });
  });

  it("bundled fallback, foreign QR: honest not-recognized state, nothing captured, camera stopped", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([]),
      installDetector: false,
    });
    const canvasSeam = installCanvasFrameSeam();
    rendered = await mount();
    primeFallbackVideo(rendered.container, canvasSeam, "foreign-label:not-in-the-demo:7");
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "not-recognized");
    const text = textOf(rendered.container);
    expect(text).toContain('The decoded code "foreign-label:not-in-the-demo:7" is not one of this demo');
    // the REAL foreign QR was decoded locally (then honestly rejected by the lookup)
    expect(canvasSeam.getImageDataCalls()).toBeGreaterThan(0);
    expect(seam.getUserMediaCalls()).toBe(1);
    // nothing was captured and the camera is stopped
    expect(seam.trackStopCalls()).toBe(1);
    expect(text).toContain("on hand 30");
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-captured"]')).toBeNull();
    expect(text).toContain("Use manual code entry instead — no camera needed, fully keyboard-accessible.");
  });

  it("unsupported (insecure context): honest unsupported state, no hardware request", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([]),
      secureContext: false,
    });
    rendered = await mount();
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "unsupported");
    expect(textOf(rendered.container)).toContain("This page is not a secure context (https or localhost)");
    expect(seam.getUserMediaCalls()).toBe(0);
  });

  it("unknown decoded code: honest not-recognized state, nothing captured, retry then succeeds", async () => {
    let payload = "foreign-label:not-in-the-demo:7";
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([{ rawValue: payload }]),
    });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "not-recognized");
    const text = textOf(rendered.container);
    expect(text).toContain('The decoded code "foreign-label:not-in-the-demo:7" is not one of this demo');
    expect(text).toContain("nothing was captured");
    // nothing was captured: canonical stock unchanged, queue unchanged, no capture notice
    expect(text).toContain("on hand 30");
    expect(text).not.toContain("queued-2");
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-captured"]')).toBeNull();
    // the failed scan stopped the camera and can be retried
    expect(seam.trackStopCalls()).toBe(1);
    expect(findButton(rendered.container, "Try the scan again")).not.toBeNull();
    payload = BREAD_PAYLOAD;
    await clickScanButton(rendered.container, "Try the scan again");
    await waitForScanState(rendered.container, "decoded");
    expect(textOf(rendered.container)).toContain(BREAD_PAYLOAD);
    expect(seam.trackStopCalls()).toBe(2);
  });

  it("detection returns nothing: the bounded window ends honestly with the camera stopped", { timeout: 15000 }, async () => {
    const seam = installCameraSeam({ detectBehavior: () => Promise.resolve([]) });
    rendered = await mount();
    const video = primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "scanning");
    expect(video.style.display).toBe("block");
    await waitForScanState(rendered.container, "not-recognized", 12000);
    const text = textOf(rendered.container);
    expect(text).toContain("No code was detected before the scan window ended");
    expect(seam.trackStopCalls()).toBe(1);
    expect(text).toContain("on hand 30");
  });

  it("cancel mid-scan: every track stopped, camera state idle", async () => {
    const seam = installCameraSeam({ detectBehavior: () => Promise.resolve([]) });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "scanning");
    clickButton(rendered.container, CANCEL);
    expect(scanStateOf(rendered.container)).toBe("idle");
    expect(seam.trackStopCalls()).toBe(1);
    expect(textOf(rendered.container)).toContain("Scan cancelled — the camera was stopped (every track released).");
  });

  it("unmount mid-scan: the cleanup stops every track (no silent camera)", async () => {
    const seam = installCameraSeam({ detectBehavior: () => Promise.resolve([]) });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "scanning");
    rendered.unmount();
    rendered = null;
    expect(seam.trackStopCalls()).toBe(1);
  });

  it("repeated scans: scan → decode → capture → scan again, each stream stopped on decode", async () => {
    let payload = BREAD_PAYLOAD;
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([{ rawValue: payload }]),
    });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "decoded");
    clickButton(rendered.container, "Capture scanned count — Sourdough loaf (sliced) (28 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    await waitForText(rendered.container, "on hand 28");
    expect(scanStateOf(rendered.container)).toBe("idle");
    // second scan: a different tag, a fresh stream
    payload = COFFEE_PAYLOAD;
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "decoded");
    expect(textOf(rendered.container)).toContain(COFFEE_PAYLOAD);
    clickButton(rendered.container, "Capture scanned count — House blend coffee, 500g (15 on the tag)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // coffee 15 vs 18 → variance -3 beyond ±2 → held, never a silent promotion
    await waitForText(rendered.container, "variance -3");
    expect(textOf(rendered.container)).toContain("DISCREPANCY_HOLD");
    expect(seam.trackStopCalls()).toBe(2);
    expect(seam.getUserMediaCalls()).toBe(2);
  });

  it("a repeatedly failing decoder: honest error state, camera stopped, nothing captured", { timeout: 15000 }, async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.reject(new Error("decoder exploded")),
    });
    rendered = await mount();
    primeScanVideo(rendered.container);
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "error", 12000);
    const text = textOf(rendered.container);
    expect(text).toContain("The browser's decoder failed repeatedly: Error: decoder exploded");
    expect(seam.trackStopCalls()).toBe(1);
    expect(findButton(rendered.container, "Try the scan again")).not.toBeNull();
    expect(text).toContain("Use manual code entry instead — no camera needed, fully keyboard-accessible.");
    expect(text).toContain("on hand 30");
  });

  it("a non-permission camera error (NotFoundError): honest error state with retry + manual fallback", async () => {
    const seam = installCameraSeam({
      detectBehavior: () => Promise.resolve([]),
      getUserMediaError: new DOMException("Requested device not found", "NotFoundError"),
    });
    rendered = await mount();
    await clickScanButton(rendered.container, START);
    await waitForScanState(rendered.container, "error");
    const text = textOf(rendered.container);
    expect(text).toContain("The camera could not be started: NotFoundError: Requested device not found.");
    expect(findButton(rendered.container, "Try the scan again")).not.toBeNull();
    expect(seam.trackStopCalls()).toBe(0);
    expect(text).toContain("Use manual code entry instead — no camera needed, fully keyboard-accessible.");
  });

  it("manual code entry alone: unknown code is honestly not recognized, nothing captured", async () => {
    installCameraSeam({ detectBehavior: () => Promise.resolve([]) });
    rendered = await mount();
    setInputValue(rendered.container, "cm-store-scan-code-input", "  not-a-known-label  ");
    clickButton(rendered.container, "Look up the code");
    const text = textOf(rendered.container);
    expect(text).toContain('The code "not-a-known-label" is not one of this demo');
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-capture"]')).toBeNull();
    // empty input gets honest guidance
    setInputValue(rendered.container, "cm-store-scan-code-input", "");
    clickButton(rendered.container, "Look up the code");
    expect(textOf(rendered.container)).toContain("Type a code first");
  });

  it("without receiving.count-stock the scan surface is permission-blocked (no Start scan)", async () => {
    rendered = await mount(["buyer"]);
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-start"]')).toBeNull();
    expect(rendered.container.querySelector('[data-testid="cm-store-scan-manual-entry"]')).toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires receiving.count-stock");
    expect(text).toContain("held by store-operator, receiving");
  });
});
