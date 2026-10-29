// Turns the X profile pictures in assets/ into tiny palette-reduced pixel-art heads.
// Output: heads.js (pixel maps + palettes used by sprites.js) and tools/preview-heads.png.
// Usage: node tools/gen-heads.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Per-head settings: source file, output size, palette size, contrast/saturation boost and
// hand-placed pixel touch-ups (eyes, mouths, glasses) that a plain downscale smears away.
// Touch-up ops: fill [x0,y0,x1,y1,color], dots [[x,y,color],...]. Colors: palette letter or #hex.
const W = '#ffffff', K = '#140a0a', BL = '#f29aa0';
const HEADS = {
  tibo: {
    src: 'assets/tibo_head.png', w: 18, h: 21, colors: 5, contrast: 1.5, sat: 1.15,
    fill: [[3, 8, 14, 12, 'd'], [4, 13, 13, 17, 'd']],
    dots: [
      // brows
      [4, 7, 'b'], [5, 7, 'b'], [6, 7, 'b'], [11, 7, 'b'], [12, 7, 'b'], [13, 7, 'b'],
      // eyes (2x2 with highlight)
      [5, 9, W], [6, 9, K], [5, 10, K], [6, 10, K], [11, 9, W], [12, 9, K], [11, 10, K], [12, 10, K],
      // nose + cheeks
      [9, 12, 'c'], [3, 12, 'c'], [14, 12, 'c'],
      // big grin with teeth
      [5, 14, K], [6, 14, K], [7, 14, K], [8, 14, K], [9, 14, K], [10, 14, K], [11, 14, K], [12, 14, K],
      [4, 15, K], [5, 15, W], [6, 15, W], [7, 15, W], [8, 15, W], [9, 15, W], [10, 15, W], [11, 15, W], [12, 15, W], [13, 15, K],
      [5, 16, K], [6, 16, 'b'], [7, 16, 'b'], [8, 16, 'b'], [9, 16, 'b'], [10, 16, 'b'], [11, 16, 'b'], [12, 16, K],
      [6, 17, K], [7, 17, K], [8, 17, K], [9, 17, K], [10, 17, K], [11, 17, K],
    ],
  },
  poteto: {
    src: 'assets/poteto_head.png', w: 20, h: 20, colors: 6, contrast: 1.4, sat: 1.2,
    fill: [[6, 7, 16, 13, 'f']],
    dots: [
      // round glasses (two rings + bridge)
      [6, 8, 'c'], [7, 8, 'c'], [8, 8, 'c'], [5, 9, 'c'], [9, 9, 'c'], [5, 10, 'c'], [9, 10, 'c'], [6, 11, 'c'], [7, 11, 'c'], [8, 11, 'c'],
      [12, 8, 'c'], [13, 8, 'c'], [14, 8, 'c'], [11, 9, 'c'], [15, 9, 'c'], [11, 10, 'c'], [15, 10, 'c'], [12, 11, 'c'], [13, 11, 'c'], [14, 11, 'c'],
      [10, 9, 'c'],
      // happy closed eyes ^ ^
      [6, 10, K], [7, 9, K], [8, 10, K], [12, 10, K], [13, 9, K], [14, 10, K],
      // blush + open happy mouth
      [5, 12, BL], [16, 12, BL], [9, 13, K], [10, 13, K], [11, 13, K], [10, 14, 'd'],
    ],
  },
  wang: {
    src: 'assets/wang_head.png', w: 17, h: 21, colors: 5, contrast: 1.6, sat: 1.15,
    fill: [[3, 9, 13, 13, 'e'], [4, 14, 12, 17, 'e']],
    dots: [
      // straight brows
      [4, 9, 'b'], [5, 9, 'b'], [6, 9, 'b'], [10, 9, 'b'], [11, 9, 'b'], [12, 9, 'b'],
      // calm eyes
      [5, 11, K], [6, 11, K], [10, 11, K], [11, 11, K], [5, 10, W], [10, 10, W],
      // nose, mouth, light stubble
      [8, 13, 'c'], [8, 14, 'c'], [6, 16, 'a'], [7, 16, 'a'], [8, 16, 'a'], [9, 16, 'a'],
      [7, 18, 'c'], [8, 18, 'c'], [6, 17, 'c'], [9, 17, 'c'],
    ],
  },
  musebadge: { src: 'assets/muse_head.png', w: 9, h: 9, colors: 3, keyWhite: true },
};

function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1 };
}

// Box-filter downscale with alpha weighting. Returns float RGBA (0..255, alpha 0..1).
function downscale(img, box, w, h) {
  const out = new Float32Array(w * h * 4);
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) {
    const sx0 = box.x0 + Math.floor(ox * bw / w), sx1 = box.x0 + Math.ceil((ox + 1) * bw / w);
    const sy0 = box.y0 + Math.floor(oy * bh / h), sy1 = box.y0 + Math.ceil((oy + 1) * bh / h);
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const i = (y * img.width + x) * 4, al = img.data[i + 3] / 255;
      r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++;
    }
    const o = (oy * w + ox) * 4;
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
    out[o + 3] = a / n;
  }
  return out;
}

// contrast around the mean luminance + saturation boost (keeps pixel art punchy)
function enhance(px, contrast, sat) {
  let mean = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 0.5) { mean += px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11; n++; }
  mean /= Math.max(1, n);
  for (let i = 0; i < px.length; i += 4) {
    const l = px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11;
    for (let c = 0; c < 3; c++) { let v = l + (px[i + c] - l) * sat; v = mean + (v - mean) * contrast; px[i + c] = Math.max(0, Math.min(255, v)); }
  }
}
// k-means palette on opaque pixels.
function quantize(px, w, h, k) {
  const pts = [];
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] >= 0.5) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
  // init: spread by luminance
  const sorted = [...pts].sort((a, b) => (a[0] * .3 + a[1] * .59 + a[2] * .11) - (b[0] * .3 + b[1] * .59 + b[2] * .11));
  let cents = Array.from({ length: k }, (_, i) => [...sorted[Math.floor((i + 0.5) * sorted.length / k)]]);
  for (let it = 0; it < 30; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    for (const p of pts) { const c = nearest(cents, p); sums[c][0] += p[0]; sums[c][1] += p[1]; sums[c][2] += p[2]; sums[c][3]++; }
    cents = cents.map((c, i) => sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c);
  }
  return cents.map(c => c.map(Math.round));
}
function nearest(cents, p) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cents.length; i++) { const d = (cents[i][0] - p[0]) ** 2 + (cents[i][1] - p[1]) ** 2 * 1.5 + (cents[i][2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

const result = {};
const previews = [];
for (const [id, cfg] of Object.entries(HEADS)) {
  const img = decodePNG(fs.readFileSync(path.join(ROOT, cfg.src)));
  if (cfg.keyWhite) { // treat near-white as transparent (logo on white background)
    for (let i = 0; i < img.width * img.height; i++) { const o = i * 4; if (img.data[o] > 235 && img.data[o + 1] > 235 && img.data[o + 2] > 235) img.data[o + 3] = 0; }
  }
  const box = bbox(img);
  const px = downscale(img, box, cfg.w, cfg.h);
  enhance(px, cfg.contrast || 1, cfg.sat || 1);
  const pal = quantize(px, cfg.w, cfg.h, cfg.colors);
  const grid = [];
  for (let y = 0; y < cfg.h; y++) {
    const row = [];
    for (let x = 0; x < cfg.w; x++) {
      const o = (y * cfg.w + x) * 4;
      row.push(px[o + 3] >= 0.5 ? nearest(pal, [px[o], px[o + 1], px[o + 2]]) : -1);
    }
    grid.push(row);
  }
  // hand touch-ups
  const palHex = pal.map(hex);
  const colorIndex = c => {
    if (c.length === 1) return c.charCodeAt(0) - 97;
    let i = palHex.indexOf(c); if (i < 0) { palHex.push(c); i = palHex.length - 1; } return i;
  };
  for (const [x0, y0, x1, y1, c] of cfg.fill || []) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[y][x] >= 0) grid[y][x] = colorIndex(c);
  for (const [x, y, c] of cfg.dots || []) grid[y][x] = colorIndex(c);
  const rows = grid.map(r => r.map(i => i < 0 ? '.' : String.fromCharCode(97 + i)).join(''));
  const palRGB = palHex.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  result[id] = { pal: palHex, rows };
  previews.push({ id, pal: palRGB, rows, w: cfg.w, h: cfg.h });
}

// preview sheet at 8x with a 1px dark outline so it reads like the in-game sprite
const Z = 8, gap = 4;
const pw = previews.reduce((s, p) => s + p.w * Z + gap, gap), ph = Math.max(...previews.map(p => p.h * Z)) + gap * 2;
const out = new Uint8Array(pw * ph * 4).fill(0);
for (let i = 0; i < pw * ph; i++) { out[i * 4] = 60; out[i * 4 + 1] = 70; out[i * 4 + 2] = 110; out[i * 4 + 3] = 255; }
let cx = gap;
for (const p of previews) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const ch = p.rows[y][x]; if (ch === '.') continue;
    const c = p.pal[ch.charCodeAt(0) - 97];
    for (let yy = 0; yy < Z; yy++) for (let xx = 0; xx < Z; xx++) { const o = ((gap + y * Z + yy) * pw + cx + x * Z + xx) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; }
  }
  cx += p.w * Z + gap;
}
fs.writeFileSync(path.join(ROOT, 'tools/preview-heads.png'), encodePNG(pw, ph, out));

let js = '// Generated by tools/gen-heads.mjs from the X profile pictures in assets/. Do not edit by hand.\n';
js += '// Each head: palette (letters a.. index into pal) and rows of pixels ("." = transparent).\n';
js += 'const HEADS={\n';
for (const [id, h] of Object.entries(result)) {
  js += ` ${id}:{pal:${JSON.stringify(h.pal)},rows:[\n  ${h.rows.map(r => JSON.stringify(r)).join(',\n  ')}]},\n`;
}
js += '};\n';
fs.writeFileSync(path.join(ROOT, 'heads.js'), js);
console.log('wrote heads.js and tools/preview-heads.png');
