#!/usr/bin/env node
// W3-017 test-infra: generate a y4m video pattern containing a QR code
// (payload: a committed physical-store demo shelf tag) for Chromium's
// --use-file-for-fake-video-capture. Test/evidence infra ONLY — qrcode is
// the lockfile-pinned workspace dep (packages/ui), never imported by app src.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/home/z/battery/w3-017/noop.js");
const QRCode = require("qrcode");

const PAYLOAD = "unicom-demo-qr:sku-phys-bread:28";
const W = 320, H = 320, FRAMES = 24;

const qr = QRCode.create(PAYLOAD, { errorCorrectionLevel: "M" });
const size = qr.modules.size;
const data = qr.modules.data;
// Render onto W×H with a quiet zone (4 modules) centered, scale = floor.
const scale = Math.max(1, Math.floor(Math.min((W - 16) / size, (H - 16) / size)));
const offX = Math.floor((W - size * scale) / 2);
const offY = Math.floor((H - size * scale) / 2);
const frame = Buffer.alloc(W * H, 235); // light
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (data[y * size + x]) {
      const px0 = offX + x * scale, py0 = offY + y * scale;
      for (let dy = 0; dy < scale; dy++) {
        const row = (py0 + dy) * W;
        for (let dx = 0; dx < scale; dx++) frame[row + px0 + dx] = 16; // dark
      }
    }
  }
}
const uv = Buffer.alloc((W >> 1) * (H >> 1), 128);
const header = `YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`;
let out = header;
for (let i = 0; i < FRAMES; i++) out += "FRAME\n" + frame.toString("latin1") + uv.toString("latin1") + uv.toString("latin1");
writeFileSync("/tmp/w3-017-qr.y4m", Buffer.from(out, "latin1"));
console.log(`wrote /tmp/w3-017-qr.y4m: payload=${JSON.stringify(PAYLOAD)} qr=${size}x${size} scale=${scale} frames=${FRAMES} bytes=${out.length}`);
