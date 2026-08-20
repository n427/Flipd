// Renders the Flipd mark to the PNG icons app.json points at.
//
// The mark is the same geometry as the web favicon (src/app/icon.svg): an F
// built from three axis-aligned rectangles, plus the cardinal dot. Because the
// path uses only H/V commands there is no curve or glyph to rasterise, so this
// needs no SVG engine, no font, and no image library — which matters, since the
// machine has none of them. Node's zlib is the only dependency.
//
// Run: node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const INK = [17, 17, 17]; // #111111, matching icon.svg
const CARDINAL = [153, 0, 0]; // #990000
const WHITE = [255, 255, 255];

// Geometry in the SVG's 32x32 user space.
const F_RECTS = [
  [4.5, 4, 10, 28], // stem
  [10, 4, 19.5, 9.5], // top arm
  [10, 13.5, 17.5, 18.75], // middle arm
];
const DOT = { cx: 24.5, cy: 25, r: 3 };
// The mark's own bounds inside that space, used to centre it on the plate.
const MARK = { x0: 4.5, y0: 4, x1: 27.5, y1: 28 };

const SS = 4; // supersampling factor per axis

// Coverage of one device pixel, sampled SS x SS times in mark space.
function coverage(px, py, scale, offsetX, offsetY) {
  let fHits = 0;
  let dotHits = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const ux = (px + (sx + 0.5) / SS - offsetX) / scale;
      const uy = (py + (sy + 0.5) / SS - offsetY) / scale;
      if (F_RECTS.some(([x0, y0, x1, y1]) => ux >= x0 && ux < x1 && uy >= y0 && uy < y1)) fHits++;
      else if ((ux - DOT.cx) ** 2 + (uy - DOT.cy) ** 2 <= DOT.r ** 2) dotHits++;
    }
  }
  const total = SS * SS;
  return { f: fHits / total, dot: dotHits / total };
}

/**
 * @param size    output edge length in px
 * @param plate   background colour, or null for transparent
 * @param markFraction how much of the canvas the mark spans (Android adaptive
 *                icons crop to a circle, so its foreground needs a safe zone)
 * @param mono    draw the dot in ink too, for the monochrome variant
 */
function render(size, { plate, markFraction = 0.62, mono = false }) {
  const markW = MARK.x1 - MARK.x0;
  const markH = MARK.y1 - MARK.y0;
  const scale = (size * markFraction) / Math.max(markW, markH);
  const offsetX = (size - markW * scale) / 2 - MARK.x0 * scale;
  const offsetY = (size - markH * scale) / 2 - MARK.y0 * scale;

  // Raw RGBA scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const { f, dot } = coverage(x, y, scale, offsetX, offsetY);
      const ink = mono ? f + dot : f;
      const accent = mono ? 0 : dot;
      const alpha = Math.min(1, ink + accent + (plate ? 1 : 0));

      let r, g, b;
      if (plate) {
        // Composite the mark over the plate.
        r = plate[0] * (1 - ink - accent) + INK[0] * ink + CARDINAL[0] * accent;
        g = plate[1] * (1 - ink - accent) + INK[1] * ink + CARDINAL[1] * accent;
        b = plate[2] * (1 - ink - accent) + INK[2] * ink + CARDINAL[2] * accent;
      } else {
        // Transparent: colour comes from whichever element covers the pixel.
        const denom = ink + accent || 1;
        r = (INK[0] * ink + CARDINAL[0] * accent) / denom;
        g = (INK[1] * ink + CARDINAL[1] * accent) / denom;
        b = (INK[2] * ink + CARDINAL[2] * accent) / denom;
      }
      raw[p++] = Math.round(r);
      raw[p++] = Math.round(g);
      raw[p++] = Math.round(b);
      raw[p++] = Math.round(alpha * 255);
    }
  }
  return png(size, raw);
}

// --- minimal PNG writer -----------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- outputs ----------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

const jobs = [
  // Full-bleed white plate: iOS and the generic icon.
  ['icon.png', 1024, { plate: WHITE, markFraction: 0.62 }],
  // Native launch image: generous whitespace keeps the mark calm and centred.
  ['splash-icon.png', 1024, { plate: WHITE, markFraction: 0.32 }],
  // Android adaptive: foreground is transparent and must stay inside the mask.
  ['android-icon-foreground.png', 1024, { plate: null, markFraction: 0.42 }],
  ['android-icon-background.png', 1024, { plate: WHITE, markFraction: 0 }],
  ['android-icon-monochrome.png', 1024, { plate: null, markFraction: 0.42, mono: true }],
  ['favicon.png', 196, { plate: WHITE, markFraction: 0.62 }],
];

for (const [name, size, opts] of jobs) {
  const buf = render(size, opts);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name.padEnd(30)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
