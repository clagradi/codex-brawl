// arenas.js - Agent Brawl arenas (owner: arenas agent).
// Every arena is painted in a 480x270 "half-res" space and drawn at 2x with smoothing off, so the
// backgrounds share the chunky pixel grid of the fighters. Static layers are pre-rendered once (lazily,
// on first draw) to offscreen canvases; per-frame work is a few drawImage calls plus small animated details.
// Public API: ARENAS, drawArena(ctx, i, t, cam), drawArenaFront(ctx, i, t, cam),
//             drawArenaThumb(ctx, i, x, y, w, h, t), prewarmArenas() (optional, builds every arena now).
const ARENAS = (() => {
'use strict';
const AW = 480, AH = 270, AG = 234, TAU = Math.PI * 2;   // half-res size; AG = GROUND / 2
const ZC = { x: 0, zoom: 1 };
let smooth = false, lock = false;

// ---------- math / colour ----------
function hash1(n) { n |= 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function rng(seed) { let s = (seed | 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgbC = {};
function rgb(c) { let v = rgbC[c]; if (v) return v; let h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return (rgbC[c] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]); }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); const f = i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0'); return '#' + f(0) + f(1) + f(2); }
function rgba(c, a) { const v = rgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')'; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function flick(t, seed, k) { k = k || 3; return 0.78 + 0.1 * Math.sin(t * 0.21 + seed * 1.7) + 0.22 * hash1(((t / k) | 0) + seed * 131); }   // 0.68 .. 1.1 torch flicker

// ---------- canvases ----------
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return { c, g }; }
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Dithered gradient canvas. stops: [[pos, '#rrggbb', alpha?]]. opt: {radial:[cx,cy,rx,ry], horiz, q (colour step), L (alpha levels)}
function grad(w, h, stops, o) {
  o = o || {}; const { c, g } = cv(w, h), img = g.createImageData(w, h), d = img.data, N = 256, lut = new Float32Array(N * 4);
  const S = stops.map(s => [s[0], rgb(s[1]), s[2] == null ? 1 : s[2]]);
  for (let i = 0; i < N; i++) { const u = i / (N - 1); let k = 0; while (k < S.length - 2 && u > S[k + 1][0]) k++; const a = S[k], b = S[k + 1]; const f = clamp((u - a[0]) / ((b[0] - a[0]) || 1), 0, 1); for (let j = 0; j < 3; j++) lut[i * 4 + j] = a[1][j] + (b[1][j] - a[1][j]) * f; lut[i * 4 + 3] = a[2] + (b[2] - a[2]) * f; }
  const q = o.q || 8, L = o.L || 5, rad = o.radial;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = rad ? Math.min(1, Math.hypot((x + 0.5 - rad[0]) / rad[2], (y + 0.5 - rad[1]) / rad[3])) : o.horiz ? x / (w - 1 || 1) : y / (h - 1 || 1);
    const i = ((u * (N - 1)) | 0) * 4, bay = (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16, p = (y * w + x) * 4;
    d[p] = Math.min(255, Math.floor(lut[i] / q + bay) * q); d[p + 1] = Math.min(255, Math.floor(lut[i + 1] / q + bay) * q); d[p + 2] = Math.min(255, Math.floor(lut[i + 2] / q + bay) * q);
    const a = lut[i + 3]; d[p + 3] = a >= 0.995 ? 255 : a <= 0.004 ? 0 : Math.round(Math.floor(a * L + bay) / L * 255);
  }
  g.putImageData(img, 0, 0); return c;
}
// A parallax layer: canvas wider than the screen; g is pre-translated so you draw in screen coords (x may go from -M to AW+M).
function layer(f) { const M = Math.ceil(40 * f) + 6, { c, g } = cv(AW + 2 * M, AH); g.translate(M, 0); return { c, g, M, f }; }
function off(cam, f) { return Math.round(-cam.x * f) / 2; }      // half-res px, snapped to full-res pixels
function put(g, L, cam, a) { if (a != null) g.globalAlpha = a; g.drawImage(L.c, off(cam, L.f) - L.M, 0); if (a != null) g.globalAlpha = 1; }
function fill(L, stops, o) { L.g.drawImage(grad(AW + 2 * L.M, AH, stops, o), -L.M, 0); }

// ---------- pixel drawing ----------
function R(g, x, y, w, h, c) { if (c) g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function line(g, x0, y0, x1, y1, c, th) {
  if (c) g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); th = th || 1;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (let n = 0; n < 2000; n++) { g.fillRect(x0, y0, th, th); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function disc(g, cx, cy, rx, ry, c) {
  if (c) g.fillStyle = c; ry = ry || rx; cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
function ring(g, cx, cy, r, c) { if (c) g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy); let x = r, y = 0, e = 1 - r; while (x >= y) { for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) g.fillRect(cx + a, cy + b, 1, 1); y++; if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; } } }
function poly(g, p, c) {   // pixel-perfect scanline polygon (no anti-aliasing)
  if (c) g.fillStyle = c; let y0 = 1e9, y1 = -1e9; for (let i = 1; i < p.length; i += 2) { if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n, ax = p[i], ay = p[i + 1], bx = p[j], by = p[j + 1]; if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) / (by - ay) * (bx - ax)); }
    xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.round(xs[k]), b = Math.round(xs[k + 1]); if (b > a) g.fillRect(a, y, b - a, 1); }
  }
}
function box(g, x, y, w, h, c) { if (c) g.fillStyle = c; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h); }
function fpoly(g, p, c) { if (c) g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill(); }   // anti-aliased, for small animated shapes
function speck(g, x, y, w, h, cols, n, seed) { const r = rng(seed); for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(Math.round(x + r() * w), Math.round(y + r() * h), 1, 1); } }
// jagged / rolling silhouette filled down to the bottom of the layer
function ridge(g, base, amp, seed, c, o) {
  o = o || {}; const r = rng(seed), x0 = o.x0 == null ? -70 : o.x0, x1 = o.x1 == null ? AW + 70 : o.x1, st = o.step || 4, jag = o.jag == null ? 0.25 : o.jag, bot = o.bot || AH, p = [x0, bot];
  const a = 0.011 + r() * 0.01, b = 0.027 + r() * 0.02, c1 = r() * 9, c2 = r() * 9;
  for (let x = x0; x <= x1 + st; x += st) p.push(x, base - amp * (0.5 + 0.28 * Math.sin(x * a + c1) + 0.22 * Math.sin(x * b + c2)) - amp * jag * r()); p.push(x1 + st, bot); poly(g, p, c);
}
// 3x5 pixel font for carved / neon text
const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  A: '111101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110', E: '111100111100111', F: '111100111100100', G: '111100101101111', H: '101101111101101', I: '111010010010111', J: '001001001101111', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '111101101101111', P: '111101111100100', Q: '111101101111001', R: '111101110101101', S: '111100111001111', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '<': '001010100010001', '>': '100010001010100', '=': '000111000111000', '-': '000000111000000', '/': '001001010100100', '{': '011010110010011', '}': '110010011010110', '.': '000000000000010', ':': '000010000010000', '!': '010010010000010', '_': '000000000000111', '#': '101111101111101', '*': '101010111010101', '+': '000010111010000', '%': '101001010100101', '(': '010100100100010', ')': '010001001001010', '[': '110100100100110', ']': '011001001001011', '?': '111001011000010', ';': '000010000010100', ' ': '000000000000000' };
function text(g, s, x, y, c, sc, sp) { sc = sc || 1; sp = sp == null ? 1 : sp; if (c) g.fillStyle = c; x = Math.round(x); y = Math.round(y); for (const ch of s) { const b = FONT[ch]; if (b) for (let i = 0; i < 15; i++) if (b[i] === '1') g.fillRect(x + (i % 3) * sc, y + ((i / 3) | 0) * sc, sc, sc); x += (3 + sp) * sc; } }
function tw(s, sc, sp) { sc = sc || 1; sp = sp == null ? 1 : sp; return s.length * (3 + sp) * sc - sp * sc; }
function textC(g, s, cx, y, c, sc, sp) { text(g, s, cx - tw(s, sc, sp) / 2, y, c, sc, sp); }

// ---------- lighting ----------
const glows = {};
function glowSpr(col, rx, ry) { rx = Math.max(2, Math.round(rx / 2) * 2); ry = Math.max(2, Math.round(ry / 2) * 2); const k = col + rx + 'x' + ry; return glows[k] || (glows[k] = grad(rx * 2, ry * 2, [[0, col, 1], [0.45, col, 0.4], [1, col, 0]], { radial: [rx, ry, rx, ry], q: 16, L: 6 })); }
function glow(g, col, x, y, rx, a, ry) { ry = ry || rx; g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.drawImage(glowSpr(col, rx, ry), Math.round(x - rx), Math.round(y - ry)); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
// soft light pool on a layer (normal blend, for static baked light)
function pool(g, col, x, y, rx, ry, a) { g.globalAlpha = a; g.drawImage(glowSpr(col, rx, ry), Math.round(x - rx), Math.round(y - ry)); g.globalAlpha = 1; }

// ---------- fog / smoke ----------
function fogTex(w, h, col, dens, seed, cell) {
  cell = cell || 26; const r = rng(seed), gx = Math.ceil(w / cell), gy = Math.ceil(h / 9) + 2, V = []; for (let j = 0; j < gy; j++) { V.push([]); for (let i = 0; i < gx; i++) V[j].push(r()); }
  const { c, g } = cv(w, h), img = g.createImageData(w, h), d = img.data, cr = rgb(col), sm = u => u * u * (3 - 2 * u);
  const samp = (x, y, cw, ch, off) => { const fx = x / cw, fy = y / ch, ix = Math.floor(fx), iy = Math.floor(fy), ux = sm(fx - ix), uy = sm(fy - iy), n = V.length, m = V[0].length; const a = V[(iy + off) % n][ix % m], b = V[(iy + off) % n][(ix + 1) % m], c2 = V[(iy + 1 + off) % n][ix % m], d2 = V[(iy + 1 + off) % n][(ix + 1) % m]; return (a + (b - a) * ux) * (1 - uy) + (c2 + (d2 - c2) * ux) * uy; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = 0.62 * samp(x, y, cell, 9, 0) + 0.38 * samp((x * 2) % w, y, cell * 0.9, 6, 3), env = Math.sin(Math.PI * (y + 0.5) / h), a = clamp((n - 0.28) * 2.2 * dens, 0, 1) * env;
    const bay = (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16, p = (y * w + x) * 4; d[p] = cr[0]; d[p + 1] = cr[1]; d[p + 2] = cr[2]; d[p + 3] = Math.round(Math.floor(a * 5 + bay) / 5 * 255);
  }
  g.putImageData(img, 0, 0); return c;
}
function fogDraw(g, tex, t, spd, y, a, shift) { const w = tex.width; let x = -(((t * spd + (shift || 0)) % w) + w) % w; g.globalAlpha = a; for (; x < AW + 60; x += w) g.drawImage(tex, Math.round(x) - 40, Math.round(y)); g.globalAlpha = 1; }

// ---------- shared animated bits ----------
function flame(g, x, y, t, seed, s, c0, c1, c2) {   // small flickering pixel flame, base centre at x,y
  const f = ((t >> 2) + seed) & 3, hh = (hash1((t >> 2) + seed * 13) * 3) | 0, sw = [0, 1, 0, -1][f];
  R(g, x - 2 * s, y - 2 * s, 5 * s, 2 * s, c0); R(g, x - 2 * s + sw, y - (4 + hh) * s, 4 * s, 2 * s, c0); R(g, x - s + sw, y - (6 + hh) * s, 2 * s, 2 * s, c0);
  R(g, x - s, y - 3 * s, 3 * s, 2 * s, c1); R(g, x - s + sw, y - (4 + hh) * s, 2 * s, 2 * s, c1); R(g, x, y - 2 * s, s, 2 * s, c2);
}
function chain(g, x, y, n, t, ph, c1, c2, amp) {
  amp = amp == null ? 0.12 : amp; for (let i = 0; i < n; i++) { const sx = Math.round(Math.sin(t * 0.03 + ph + i * 0.09) * i * amp) + x, yy = y + i * 3;
    if (i & 1) R(g, sx, yy, 1, 3, c2); else { R(g, sx - 1, yy, 3, 1, c1); R(g, sx - 1, yy + 1, 1, 1, c1); R(g, sx + 1, yy + 1, 1, 1, c1); R(g, sx - 1, yy + 2, 3, 1, c1); } }
}
function motes(g, t, n, seed, x0, x1, y0, y1, col, spd, sz, wob) {   // drifting dots, deterministic from t
  g.fillStyle = col; sz = sz || 1; wob = wob == null ? 6 : wob; const w = x1 - x0, h = y1 - y0;
  for (let i = 0; i < n; i++) { const hx = hash1(i * 7 + seed), hy = hash1(i * 13 + seed + 5), ph = hash1(i * 3 + seed + 9) * TAU;
    const y = y0 + (((hy * h - t * spd * (0.5 + hx)) % h) + h) % h, x = x0 + hx * w + Math.sin(t * 0.017 * (0.6 + hy) + ph) * wob; g.fillRect(Math.round(x), Math.round(y), sz, sz); }
}
function lightning(t, period, ph) {   // 0..1 flash intensity with a double flicker, cycle index in .c
  const u = t + ph, c = u % period, k = Math.floor(u / period); let v = 0;
  if (c < 5) v = 1; else if (c < 8) v = 0.15; else if (c < 12) v = 0.85; else if (c < 34) v = 0.85 * (1 - (c - 12) / 22); return { v, c: k, age: c };
}
function bolt(g, x0, y0, x1, y1, seed, col, glowc) {   // jagged lightning bolt, pixel line segments
  const r = rng(seed), n = 9; let px = x0, py = y0;
  for (let i = 1; i <= n; i++) { const u = i / n, nx = x0 + (x1 - x0) * u + (i < n ? (r() - 0.5) * 34 : 0), ny = y0 + (y1 - y0) * u; if (glowc) line(g, px, py, nx, ny, glowc, 3); line(g, px, py, nx, ny, col, 1); if (r() < 0.3 && i < n - 1) { line(g, nx, ny, nx + (r() - 0.5) * 40, ny + 18 + r() * 18, col, 1); } px = nx; py = ny; }
}

// ---------- floor ----------
// Perspective floor: dithered gradient, receding seams towards a vanishing point, lip highlight on the walking line (y = AG).
function floorBase(L, o) {
  const g = L.g, M = L.M, y0 = o.y0 || 220, w = AW + 2 * M, vp = o.vp || [AW / 2, 96];
  g.drawImage(grad(w, AH - y0, [[0, o.top], [(AG - y0) / (AH - y0), o.mid], [1, o.bot]], { q: o.q || 6 }), -M, y0);
  if (o.fade) g.drawImage(grad(w, AG - y0, [[0, o.fade, 0.9], [1, o.fade, 0]], { L: 6 }), -M, y0);
  const rows = o.rows || [-12, -7, -3, 3, 9, 16, 25, 36];
  for (const d of rows) { const y = AG + d; R(g, -M, y, w, 1, o.line); if (d > 0 && o.line2) R(g, -M, y + 1, w, 1, o.line2); }
  const sp = o.sp || 36, k0 = (AH - vp[1]) / (AG - vp[1]), k1 = (y0 - vp[1]) / (AG - vp[1]);
  for (let x = -M - 300 + (o.xo || 0); x < AW + M + 300; x += sp) { const xt = vp[0] + (x - vp[0]) * k1, xb = vp[0] + (x - vp[0]) * k0; if (xb < -M - 20 && xt < -M - 20) continue; if (xb > AW + M + 20 && xt > AW + M + 20) continue; line(g, xt, y0, xb, AH, o.line); }
  R(g, -M, AG, w, 1, o.lip); if (o.lip2) R(g, -M, AG + 1, w, 1, o.lip2);
}

// ---------- arena registry ----------
function canBuild() { if (lock) return false; lock = true; (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(() => { lock = false; }); return true; }
function def(o) {
  const A = { built: false, l: {}, o };
  const ensure = force => { if (A.built) return true; if (!force && !canBuild()) return false; o.build(A); A.built = true; return true; };
  const run = (ctx, fn, t, cam, sm) => { ctx.save(); ctx.imageSmoothingEnabled = sm; ctx.scale(2, 2); try { fn(ctx, t || 0, cam || ZC, A); } finally { ctx.restore(); } };
  const e = { id: o.id, name: o.name, tagline: o.tagline, accent: o.accent, _ensure: ensure,
    draw(ctx, t, cam) { ensure(true); run(ctx, o.paint, t, cam, false); },
    thumb(ctx, x, y, w, h, t) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      if (!ensure(false)) { ctx.fillStyle = '#0b0912'; ctx.fillRect(x, y, w, h); ctx.fillStyle = o.accent; ctx.globalAlpha = 0.25; ctx.fillRect(x, y + h - 3, w, 3); }
      else { ctx.translate(x, y); ctx.scale(w / 960, h / 540); run(ctx, o.paint, t, ZC, true); if (o.front) run(ctx, o.front, t, ZC, true); }
      ctx.restore();
    } };
  if (o.front) e.front = (ctx, t, cam) => { if (A.built) run(ctx, o.front, t, cam, false); };
  return e;
}

// ======================================================================================
// 1. GPU PIT - a steel bridge over a lake of bubbling coolant, giant dead GPU die in the dark
// ======================================================================================
function fan(g, cx, cy, r, a0) {
  for (let k = 0; k < 5; k++) { const a = a0 + k * TAU / 5, p = [];
    for (const [rr, da] of [[5, 0], [r, 0.3], [r, 0.95], [6, 0.7]]) p.push(cx + Math.cos(a + da) * rr, cy + Math.sin(a + da) * rr);
    fpoly(g, p, '#0b1d16'); }
  disc(g, cx, cy, 6, 6, '#12301f'); disc(g, cx, cy, 2, 2, '#1e6a3a');
}
const gpupit = def({ id: 'gpupit', name: 'GPU PIT', tagline: 'THE COOLANT BITES BACK', accent: '#7dff3a',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky; fill(l.sky, [[0, '#020605'], [0.5, '#06130e'], [0.8, '#0d281b'], [1, '#12301f']], { q: 6 });
      const r = rng(11);
      for (let x = -M; x < AW + M; x += 3) { const h = 30 + r() * 80 + Math.sin(x * 0.03) * 18; R(g, x, 165 - h, 2, h, r() < 0.5 ? '#071611' : '#08190f'); }
      g.drawImage(grad(AW + 2 * M, 80, [[0, '#12301f', 0], [1, '#12301f', 0.95]], { L: 6 }), -M, 110);
      R(g, 163, 23, 154, 94, '#0a1914'); box(g, 163, 23, 154, 94, '#1f5a3e'); box(g, 166, 26, 148, 88, '#0f2a21');
      for (let x = 169; x < 312; x += 6) { R(g, x, 18, 2, 5, '#2c5a46'); R(g, x, 117, 2, 5, '#2c5a46'); } for (let y = 29; y < 112; y += 6) { R(g, 158, y, 5, 2, '#2c5a46'); R(g, 317, y, 5, 2, '#2c5a46'); }
      R(g, 190, 42, 100, 58, '#092117'); box(g, 190, 42, 100, 58, '#1d6b44');
      for (let k = 0; k < 26; k++) { let x = 190 + r() * 100 | 0, y = 42 + r() * 58 | 0; const dir = r() * 4 | 0; line(g, x, y, dir < 2 ? (dir ? 170 : 310) : x, dir < 2 ? y : (dir === 2 ? 28 : 112), '#145a37'); R(g, x - 1, y - 1, 3, 3, '#2fae62'); }
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) R(g, 198 + i * 15, 48 + j * 13, 9, 7, '#0b2e1f');
      textC(g, 'GPU-9000', 240, 66, '#2fae62', 2);
      // ceiling heat-sink stalactites
      for (const cx of [60, 150, 330, 420, 20, 470]) for (let i = -5; i <= 5; i++) R(g, cx + i * 3, 0, 2, 22 - Math.abs(i) * 3 + (hash1(cx + i) * 6 | 0), '#040a08');
    }
    l.mid = layer(0.3); { const { g, M } = l.mid, w = AW + 2 * M;
      for (const [y, h] of [[12, 10], [28, 6]]) { R(g, -M, y, w, h, '#0c1713'); R(g, -M, y, w, 1, '#1d3a2e'); R(g, -M, y + h - 1, w, 1, '#040a07'); for (let x = -M + 10; x < AW + M; x += 44) { R(g, x, y - 1, 4, h + 2, '#050c09'); R(g, x + 1, y, 1, h, '#16291f'); } }
      for (const x of [92, 384]) { R(g, x, 34, 14, 124, '#0a1511'); R(g, x, 34, 2, 124, '#1d3a2e'); R(g, x + 12, 34, 2, 124, '#040a07'); for (let y = 50; y < 150; y += 22) R(g, x - 2, y, 18, 3, '#050c09'); R(g, x - 3, 150, 20, 8, '#06100c'); }
      for (const [cx, cy, r] of [[50, 78, 34], [432, 74, 31]]) { R(g, cx - r - 4, cy - r - 4, 2 * r + 9, 2 * r + 9, '#0a1511'); box(g, cx - r - 4, cy - r - 4, 2 * r + 9, 2 * r + 9, '#1d3a2e');
        disc(g, cx, cy, r, r, '#020504'); ring(g, cx, cy, r, '#1d3a2e'); for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) R(g, cx + dx * (r + 1) - 1, cy + dy * (r + 1) - 1, 3, 3, '#2a4a3c'); }
    }
    l.lake = layer(0.6); { const { g, M } = l.lake, w = AW + 2 * M;
      g.drawImage(grad(w, AH - 156, [[0, '#0f3d26'], [0.3, '#0a2a1a'], [1, '#04100a']], { q: 6 }), -M, 156); R(g, -M, 156, w, 1, '#26784a');
      g.drawImage(grad(w, 28, [[0, '#4ae27a', 0.34], [1, '#4ae27a', 0]], { L: 6 }), -M, 157);
      { const r = rng(15); for (let y = 160; y < 226; y += 3) { const n = 6 + ((y - 156) >> 2), len = 3 + (y - 156) * 0.18; for (let i = 0; i < n; i++) R(g, -M + r() * w, y + (r() * 2 | 0), len * (0.5 + r()), 1, r() < 0.5 ? '#14683a' : '#06150c'); } }
      for (const [x, ww, h] of [[10, 22, 56], [40, 16, 40], [84, 12, 30], [388, 14, 34], [416, 24, 62], [448, 18, 44]]) {
        R(g, x, 196 - h, ww, h, '#05110c'); for (let i = 2; i < ww; i += 3) R(g, x + i, 196 - h, 1, h, '#0a1d15'); R(g, x, 196 - h, ww, 1, '#173a2a'); R(g, x + ww / 2, 196 - h - 2, 1, 2, '#ff3b30'); R(g, x - 3, 196, ww + 6, 1, '#26784a'); R(g, x, 197, ww, 6, '#031009'); }
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#0c1511', mid: '#1b2a24', bot: '#0e1713', fade: '#0d1a14', line: '#0a120f', line2: '#2a3d34', lip: '#56c95a', lip2: '#08100d', sp: 34, vp: [240, 120], rows: [-14, -8, -3, 4, 12, 22, 34] });
      speck(g, -M, 216, w, 54, ['#243730', '#101c17', '#2f453b'], 380, 4);
      R(g, -M, 262, w, 8, '#0a0f0d'); for (let x = -M; x < AW + M; x += 10) poly(g, [x, 263, x + 5, 263, x + 9, 270, x + 4, 270], '#61540f');
      for (const x of [-M + 6, 70, 200, 330, 460]) for (let y = 244; y < 260; y += 14) R(g, x, y, 2, 2, '#34493f');
      // glowing coolant leaking through cracks in the deck
      for (const [x, y] of [[112, 238], [352, 240]]) { line(g, x, y, x + 6, y + 8, '#3dd45a'); line(g, x + 6, y + 8, x + 3, y + 16, '#3dd45a'); pool(g, '#39ff6a', x + 4, y + 8, 18, 10, 0.4); }
      // rear rail
      R(g, -M, 207, w, 2, '#06100c'); R(g, -M, 220, w, 1, '#06100c'); for (let x = -M + 10; x < AW + M; x += 56) { R(g, x, 203, 3, 31, '#07120d'); R(g, x - 1, 201, 5, 2, '#183228'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg;
      for (const x of [-12, 468]) { R(g, x, 0, 24, AH, '#040a07'); R(g, x + (x < 0 ? 22 : 0), 0, 2, AH, '#2c9d4a'); R(g, x + (x < 0 ? 18 : 4), 0, 1, AH, '#143826'); for (let y = 20; y < AH; y += 38) { R(g, x - 2, y, 28, 4, '#0a1511'); R(g, x - 2, y, 28, 1, '#1d3a2e'); } }
    }
    l.fog = fogTex(480, 74, '#5cff8a', 1, 21); l.fog2 = fogTex(480, 60, '#3fbf6a', 1, 22);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); glow(g, '#2bff6a', 240, 70, 120, 0.1 + 0.035 * Math.sin(t * 0.04), 70);
    for (let k = 0; k < 4; k++) { const u = ((t * 1.3 + k * 60) % 240); R(g, 190 + (u < 100 ? u : 100), 42 + 14 * k, 2, 1, '#8fff9f'); } g.restore();
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.3), 0); fan(g, 50, 78, 31, t * 0.05); fan(g, 432, 74, 28, -t * 0.04);
    for (const [x, n, ph] of [[150, 22, 0], [214, 14, 1.5], [268, 26, 3], [330, 18, 4.4]]) chain(g, x, 34, n, t, ph, '#17352a', '#0d2018');
    if ((t >> 5) & 1) R(g, 99, 60, 2, 2, '#ff3b30'); g.restore();
    put(g, l.lake, cam);
    g.save(); g.translate(off(cam, 0.08), 0); for (let k = 0; k < 28; k++) { const y = 158 + k * 2.4, ww = 3 + k * 0.9, x = 240 + Math.sin(t * 0.035 + k * 1.7) * (3 + k * 0.55), a = 0.32 * (1 - k / 34) * (0.6 + 0.4 * Math.sin(t * 0.06 + k)); g.fillStyle = rgba('#7dffa0', a); g.fillRect(Math.round(x - ww / 2), Math.round(y), Math.round(ww), 1); } g.restore();
    g.save(); g.translate(off(cam, 0.6), 0);
    for (let k = 0; k < 16; k++) { const per = 110 + (k % 5) * 20, v = t + k * 37, u = v % per, cyc = (v / per) | 0, x = 20 + hash1(k * 31 + cyc * 7) * 440, y = 172 + hash1(k * 17 + cyc * 3 + 1) * 44;
      if (u < 40) { const r = 1 + ((u / 40) * 3) | 0; ring(g, x, y, r, '#2f9d56'); if (u > 30) R(g, x, y - 1, 1, 1, '#9bff7a'); } else if (u < 48) { for (const [dx, dy] of [[-4, -3], [4, -3], [-2, -6], [2, -6]]) R(g, x + dx * (u - 38) / 5, y + dy * (u - 38) / 5, 1, 1, '#9bff7a'); } }
    for (let k = 0; k < 14; k++) if (Math.sin(t * 0.03 + k * 1.3) > -0.2) R(g, (k * 83 + t * 0.15 * (k & 1 ? 1 : -1) + 520 * 4) % 540 - 30, 160 + (k * 13) % 56, 4 + k % 4, 1, '#1f7a43');
    for (const [px, py] of [[104, 156], [300, 190], [226, 174]]) for (let j = 0; j < 9; j++) { const u = (t * 0.45 + j * 7) % 54, a = (1 - u / 54) * 0.22; g.fillStyle = 'rgba(130,255,170,' + a.toFixed(3) + ')'; const s = 3 + (u / 9) | 0; g.fillRect(Math.round(px + Math.sin(u * 0.15 + j) * 4 - s / 2), Math.round(py - u), s, s); }
    g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 1), 0); glow(g, '#39ff6a', 240, AG, 250, 0.06 + 0.02 * Math.sin(t * 0.05), 16);
    const c = t % 150; if (c < 40) for (let i = 0; i < 7; i++) { const vx = (i - 3) * 0.7 + 0.2, y = 36 + c * 0.2 * (i % 3) + 0.04 * c * c * (0.5 + i * 0.08); R(g, 214 + vx * c * 0.8, y, 1, 1, i & 1 ? '#ffd24a' : '#ff8a2a'); }
    g.restore();
  },
  front(g, t, cam, A) {
    const l = A.l; fogDraw(g, l.fog, t, 0.18, 196, 0.18, cam.x * 0.4); fogDraw(g, l.fog2, t, -0.1, 214, 0.14, 130 + cam.x * 0.2);
    g.save(); g.translate(off(cam, 1.25) - l.fg.M * 0, 0); g.restore(); put(g, l.fg, cam);
    motes(g, t, 36, 3, 0, AW, 10, AH, 'rgba(150,255,120,0.55)', 0.3, 1, 5);
  } });

// ======================================================================================
// 2. DATACENTER CATHEDRAL - rack pillars, gothic ribs, a rose window made of code
// ======================================================================================
function shaft(col, w, h, skew) {
  const { c, g } = cv(w + skew, h); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w + skew, h); g.lineTo(skew, h); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-in'; g.drawImage(grad(w + skew, h, [[0, '#fff', 0.9], [1, '#fff', 0]], { L: 6 }), 0, 0); return c;
}
function arch(g, x0, x1, y, h, col, hi, th) {   // pointed arch rib as two quadratic curves
  const W = x1 - x0, m = (x0 + x1) / 2, pts = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40, v = 1 - u; if (u <= 0.5) { const s = u * 2, s2 = 1 - s; pts.push([s2 * s2 * x0 + 2 * s * s2 * (x0 + W * 0.04) + s * s * m, s2 * s2 * y + 2 * s * s2 * (y - h * 0.95) + s * s * (y - h)]); } else { const s = (u - 0.5) * 2, s2 = 1 - s; pts.push([s2 * s2 * m + 2 * s * s2 * (x1 - W * 0.04) + s * s * x1, s2 * s2 * (y - h) + 2 * s * s2 * (y - h * 0.95) + s * s * y]); } }
  for (let i = 1; i < pts.length; i++) line(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, th);
  for (let i = 1; i < pts.length; i++) line(g, pts[i - 1][0], pts[i - 1][1] + th, pts[i][0], pts[i][1] + th, hi, 1);
}
const cathedral = def({ id: 'cathedral', name: 'DATACENTER CATHEDRAL', tagline: 'KNEEL BEFORE THE UPTIME', accent: '#ffc34a',
  build(A) {
    const l = A.l; l.leds = [];
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#06040e'], [0.55, '#0e0a22'], [1, '#1b1233']], { q: 6 });
      for (let y = 8; y < 232; y += 9) { R(g, -M, y, w, 1, '#0a0716'); const o = ((y / 9) | 0) % 2 ? 0 : 12; for (let x = -M + o; x < AW + M; x += 24) R(g, x, y, 1, 9, '#0a0716'); }
      const cx = 240, cy = 72, RR = 50, pal = ['#8a1f2f', '#2349a8', '#5a2aa8', '#c58a1f', '#12868a', '#a83a7a'];
      disc(g, cx, cy, RR + 5, RR + 5, '#161224'); ring(g, cx, cy, RR + 5, '#2c2540'); ring(g, cx, cy, RR + 4, '#201a33');
      for (let y = -RR; y <= RR; y++) for (let x = -RR; x <= RR; x++) { const r = Math.hypot(x, y); if (r > RR) continue;
        const th = (Math.atan2(y, x) + Math.PI) / TAU, rg = r < 7 ? 0 : r < 22 ? 1 : r < 36 ? 2 : 3, segs = [1, 12, 24, 36][rg], s = th * segs, fs = s - Math.floor(s), si = Math.floor(s), arc = r * TAU / segs;
        const lead = (rg > 0 && (fs * arc < 0.9 || (1 - fs) * arc < 0.3)) || Math.abs(r - 7) < 0.6 || Math.abs(r - 22) < 0.6 || Math.abs(r - 36) < 0.6 || r > RR - 1;
        g.fillStyle = lead ? '#0a0612' : rg === 0 ? '#c9962a' : mix(pal[(si + rg * 2 + (hash1(si * 7 + rg) > 0.5 ? 1 : 0)) % 6], '#000000', hash1(si * 13 + rg * 5) * 0.4 + (r / RR) * 0.25); g.fillRect(cx + x, cy + y, 1, 1); }
      for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * TAU; text(g, '{}<>/;01=#*+?'[k], cx + Math.cos(a) * 43 - 1, cy + Math.sin(a) * 43 - 2, '#f5e9c0'); text(g, '01'[k & 1], cx + Math.cos(a + 0.26) * 29 - 1, cy + Math.sin(a + 0.26) * 29 - 2, '#ffd98a'); }
      for (const x of [112, 368]) { // lancet windows
        const pts = [x - 15, 150, x - 15, 66, x, 40, x + 15, 66, x + 15, 150]; poly(g, pts, '#161224');
        for (let y = 44; y < 150; y++) for (let i = -13; i <= 13; i++) { const top = 66 - (13 - Math.abs(i)) * 1.8 + 12; if (y < top) continue; const cell = ((y - 46) / 9) | 0, col = pal[(cell * 2 + (i + 13 >> 3)) % 6]; g.fillStyle = ((y - 46) % 9 === 0 || (i + 13) % 9 === 0) ? '#0a0612' : mix(col, '#000000', 0.25 + hash1(cell * 9 + (i + 13 >> 3)) * 0.4); g.fillRect(x + i, y, 1, 1); }
        for (let k = 0; k < 8; k++) text(g, '{}01<>/;'[k], x - 1 + ((k & 1) ? 6 : -6), 78 + k * 9, '#f5e9c0'); }
      pool(g, '#c58a1f', 240, 72, 90, 60, 0.12);
    }
    l.mid = layer(0.3); { const { g, M } = l.mid;
      for (const x of [40, 164, 316, 440]) {
        R(g, x - 12, 44, 24, 190, '#0a0910'); R(g, x - 12, 44, 1, 190, '#1c1830'); R(g, x + 11, 44, 1, 190, '#05040a'); for (let y = 52; y < 222; y += 5) { R(g, x - 10, y, 20, 1, '#15121f'); for (const dx of [-8, -3, 2]) l.leds.push([x + dx, y + 2, (x + y + dx) | 0]); }
        R(g, x - 16, 36, 32, 8, '#2a2438'); R(g, x - 18, 34, 36, 3, '#3a3350'); R(g, x - 16, 44, 32, 1, '#15111f'); R(g, x - 16, 222, 32, 12, '#2a2438'); R(g, x - 18, 222, 36, 3, '#3a3350'); }
      arch(g, 56, 148, 36, 30, '#241e34', '#3a3350', 3); arch(g, 332, 424, 36, 30, '#241e34', '#3a3350', 3);
      arch(g, 180, 300, 36, 30, '#1c1729', '#2c2640', 2);
      for (const [x0, x1] of [[56, 148], [332, 424]]) for (let x = x0 + 8; x < x1 - 4; x += 12) { const u = (x - x0) / (x1 - x0), hh = 30 * (1 - Math.abs(2 * u - 1)) * 0.9; R(g, x, 36 - hh + 3, 1, hh - 1, '#15111f'); }
    }
    l.near = layer(0.6); { const { g } = l.near;
      for (const x of [96, 384]) { R(g, x - 10, 46, 20, 2, '#6a4a1a'); R(g, x - 9, 48, 18, 84, '#4a0f1c'); R(g, x - 9, 48, 18, 1, '#8a6a2a'); R(g, x - 9, 48, 1, 84, '#2a0710'); poly(g, [x - 9, 132, x + 9, 132, x + 9, 138, x, 130, x - 9, 138], '#4a0f1c'); R(g, x - 1, 52, 1, 76, '#7a5a22'); textC(g, '404', x, 84, '#d9a93a'); text(g, 'NOT', x - 5, 94, '#8a6a2a'); text(g, 'FND', x - 5, 100, '#8a6a2a'); }
      for (const x of [62, 418]) { R(g, x, 200, 2, 34, '#14101c'); R(g, x - 6, 196, 14, 2, '#14101c'); R(g, x - 8, 232, 18, 3, '#2a2438'); for (const dx of [-6, 1, 8]) { R(g, x + dx - 1, 190, 3, 6, '#d9cfae'); } }
    }
    l.floor = layer(1); { const { g, M } = l.floor;
      floorBase(l.floor, { y0: 214, top: '#0c0a14', mid: '#1a1627', bot: '#0b0912', fade: '#0e0b19', line: '#06050a', line2: '#2c2640', lip: '#b58a2e', lip2: '#0a0710', sp: 44, vp: [240, 100], rows: [-14, -7, -2, 5, 13, 23, 35] });
      speck(g, -M, 216, AW + 2 * M, 54, ['#2c2640', '#120f1c', '#3a3350'], 260, 8);
      pool(g, '#8a1f2f', 190, 244, 46, 12, 0.32); pool(g, '#2349a8', 292, 246, 46, 12, 0.3); pool(g, '#c58a1f', 240, 240, 36, 9, 0.2);
      R(g, -M, 222, AW + 2 * M, 1, '#2a2438');
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const x of [-12, 466]) { R(g, x, 0, 26, AH, '#06050b'); R(g, x + (x < 0 ? 24 : 0), 0, 2, AH, '#4a3a22'); for (let y = 6; y < AH; y += 6) { R(g, x + 3, y, 18, 1, '#100d18'); for (const dx of [5, 12, 18]) if (hash1(y * 5 + dx + x) > 0.5) R(g, x + dx, y + 2, 1, 1, '#2b8a4a'); } R(g, x - 4, 20, 34, 6, '#2a2438'); R(g, x - 4, 20, 34, 1, '#3a3350'); } }
    l.fog = fogTex(480, 64, '#8a6ad0', 0.9, 31); l.sh = [shaft('#e8b86a', 26, 175, 60), shaft('#8a7ae8', 20, 175, -52), shaft('#ff7a8a', 16, 175, 28)];
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); glow(g, '#ffb050', 240, 72, 70, 0.07 + 0.03 * Math.sin(t * 0.03), 60); g.restore();
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.3), 0); for (const [x, y, s] of l.leds) { const h = hash1(((t / (22 + (s & 15))) | 0) * 7 + s); if (h > 0.7) continue; g.fillStyle = h > 0.55 ? '#ffb02e' : h > 0.12 ? '#2fae62' : '#ff3b30'; g.fillRect(x, y, 1, 1); } g.restore();
    g.save(); g.translate(off(cam, 0.45), 0); g.globalCompositeOperation = 'lighter';
    const a = 0.09 + 0.03 * Math.sin(t * 0.02); g.globalAlpha = a; g.drawImage(l.sh[0], 200, 60); g.globalAlpha = a * 0.8; g.drawImage(l.sh[1], 232, 60); g.globalAlpha = a * 0.7; g.drawImage(l.sh[2], 150, 60); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    motes(g, t, 28, 9, 170, 330, 70, 232, 'rgba(255,230,170,0.5)', 0.12, 1, 5); g.restore();
    put(g, l.near, cam);
    g.save(); g.translate(off(cam, 0.6), 0); for (const x of [62, 418]) for (let i = 0; i < 3; i++) { const dx = [-6, 1, 8][i]; flame(g, x + dx, 190, t, i + x, 1, '#ff9a2a', '#ffd35a', '#fff4c0'); } glow(g, '#ffa030', 62, 186, 40, 0.22 * flick(t, 1), 40); glow(g, '#ffa030', 418, 186, 40, 0.22 * flick(t, 2), 40); g.restore();
    put(g, l.floor, cam);
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.12, 206, 0.22, cam.x * 0.3); put(g, l.fg, cam); motes(g, t, 22, 5, 0, AW, 20, AH, 'rgba(255,220,150,0.45)', 0.1, 1, 8); } });

// ======================================================================================
// 3. RATE-LIMIT BRIDGE - stone bridge over a spike pit under a blood moon, a huge 429 tablet
// ======================================================================================
const bridge = def({ id: 'bridge', name: 'RATE-LIMIT BRIDGE', tagline: 'ERROR 429: TOO MANY FALLS', accent: '#ff3b30',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#07030d'], [0.3, '#1c0720'], [0.55, '#4a0f22'], [0.72, '#8a2a1c'], [0.85, '#3a0c16'], [1, '#12050c']], { q: 6 });
      speck(g, -M, 0, w, 90, ['#c9a0b0', '#8a6a80'], 60, 2);
      glow(g, '#ff3b30', 330, 62, 70, 0.4); disc(g, 330, 62, 30, 30, '#7a1218'); disc(g, 327, 59, 28, 28, '#a81f22'); disc(g, 324, 56, 24, 24, '#c42a28');
      const r = rng(5); for (let i = 0; i < 14; i++) { const a = r() * TAU, d = r() * 22; disc(g, 330 + Math.cos(a) * d, 62 + Math.sin(a) * d, 2 + r() * 3 | 0, 2, '#8a161c'); }
    }
    l.far = layer(0.25); { const { g, M } = l.far, w = AW + 2 * M;
      ridge(g, 170, 80, 21, '#10040c', { x1: 150, jag: 0.5, step: 5 }); ridge(g, 170, 90, 22, '#10040c', { x0: 330, jag: 0.5, step: 5 });
      // distant bridge arc
      R(g, -M, 118, w, 3, '#190812'); for (let x = -M + 6; x < AW + M; x += 38) { R(g, x, 121, 6, 60, '#150610'); poly(g, [x - 8, 121, x + 14, 121, x + 6, 134, x, 134], '#150610'); }
      // the 429 tablet
      R(g, 206, 44, 68, 120, '#1a0a14'); R(g, 206, 44, 68, 2, '#33182a'); R(g, 206, 44, 2, 120, '#33182a'); R(g, 272, 44, 2, 120, '#0a0309'); poly(g, [206, 44, 274, 44, 266, 36, 214, 36], '#1a0a14');
      textC(g, '429', 240, 62, '#d8352a', 5); textC(g, 'TOO MANY', 240, 100, '#8a2a2a', 1); textC(g, 'REQUESTS', 240, 108, '#8a2a2a', 1); R(g, 214, 118, 52, 1, '#33182a'); textC(g, 'RETRY-AFTER 60', 240, 124, '#5a1a1e', 1);
      g.drawImage(grad(w, 70, [[0, '#4a0f22', 0], [1, '#4a0f22', 0.9]], { L: 6 }), -M, 130);
    }
    l.pit = layer(0.5); { const { g, M } = l.pit, w = AW + 2 * M;
      g.drawImage(grad(w, 90, [[0, '#2a0a16', 0], [0.35, '#2a0a16', 0.85], [1, '#0a0206', 1]], { L: 6 }), -M, 150); pool(g, '#ff3b30', 240, 230, 300, 50, 0.22);
      for (let rw = 0; rw < 4; rw++) { const by = 176 + rw * 13, hh = 11 + rw * 5, sp = 8 + rw * 3, r = rng(40 + rw); const col = ['#2a0c18', '#34101c', '#3f1420', '#4a1824'][rw], hi = ['#5a1a22', '#6a2026', '#7a262a', '#8a2c2e'][rw];
        for (let x = -M - 5 + (rw * 3); x < AW + M; x += sp) { const h2 = hh * (0.75 + r() * 0.5); poly(g, [x - 2, by + 6, x, by - h2, x + 2, by + 6], col); R(g, x - 1, by - h2 + 3, 1, h2 - 1, hi); } R(g, -M, by + 4, w, 12 - rw * 2, col); }
      const r2 = rng(9); for (let i = 0; i < 5; i++) { const x = 30 + r2() * 420 | 0, y = 168 + r2() * 30 | 0; R(g, x, y, 3, 3, '#9a8f86'); R(g, x + 1, y + 1, 1, 1, '#2a0a16'); }
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 212, top: '#120a10', mid: '#241520', bot: '#140b11', fade: '#160a12', line: '#08030a', line2: '#3a2230', lip: '#9a3a30', lip2: '#0a0408', sp: 38, vp: [240, 110], rows: [-12, -4, 4, 13, 23, 35] });
      speck(g, -M, 216, w, 54, ['#3a2230', '#120a10', '#4a2a38', '#5a1a1e'], 300, 14);
      for (const [x, y] of [[90, 246], [300, 252], [410, 242], [190, 256]]) { line(g, x, y, x + 9, y + 4, '#07020a'); line(g, x + 9, y + 4, x + 12, y + 11, '#07020a'); line(g, x + 9, y + 4, x + 16, y + 3, '#07020a'); }
      R(g, -M, 205, w, 3, '#1c0e16'); R(g, -M, 205, w, 1, '#3a2230'); for (let x = -M + 14; x < AW + M; x += 40) { R(g, x - 4, 196, 8, 38, '#1c0e16'); R(g, x - 4, 196, 1, 38, '#3a2230'); R(g, x - 5, 194, 10, 3, '#2a1620'); R(g, x - 5, 232, 10, 2, '#2a1620'); for (let y = 204; y < 230; y += 5) R(g, x - 2, y, 4, 2, '#0e0509'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const [x, w2, top] of [[-14, 28, 110], [466, 30, 70]]) { poly(g, [x, AH, x, top + 6, x + w2 * 0.3, top, x + w2, top + 12, x + w2, AH], '#080208'); R(g, x + (x < 0 ? w2 - 2 : 0), top + 8, 2, AH, '#5a1a1e'); for (let y = top + 24; y < AH; y += 18) R(g, x + 3, y, w2 - 6, 1, '#1c0a12'); } }
    l.cloud = fogTex(480, 100, '#10030c', 1.9, 51, 38); l.haze = fogTex(480, 70, '#c0302a', 0.9, 52, 30); l.fog = fogTex(480, 80, '#8a2030', 1, 53);
  },
  paint(g, t, cam, A) {
    const l = A.l, ln = lightning(t, 380, 90), w = AW + 100; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); glow(g, '#ff3b30', 330, 62, 90, 0.18 + 0.05 * Math.sin(t * 0.02)); g.restore();
    fogDraw(g, l.cloud, t, 0.07, 6, 0.9, cam.x * 0.06); fogDraw(g, l.haze, t, 0.04, 90, 0.28, 120 + cam.x * 0.06);
    if (ln.v > 0) { g.fillStyle = rgba('#ffb0a0', ln.v * 0.22); g.fillRect(-40, 0, w, 170); g.save(); g.translate(off(cam, 0.08), 0); bolt(g, 120 + hash1(ln.c) * 200, 8, 150 + hash1(ln.c + 3) * 250, 150, ln.c * 17 + 3, ln.age < 14 ? '#fff0ec' : 'rgba(255,200,190,0.4)', ln.age < 14 ? 'rgba(255,90,80,0.45)' : null); g.restore(); }
    put(g, l.far, cam);
    g.save(); g.translate(off(cam, 0.25), 0); if (ln.v > 0 || (t % 200) < 4) glow(g, '#ff3b30', 240, 70, 60, 0.18 + ln.v * 0.3); g.restore();
    put(g, l.pit, cam);
    g.save(); g.translate(off(cam, 0.5), 0); motes(g, t, 26, 3, 0, AW, 150, 232, '#ff6a3a', 0.5, 1, 5); g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 1), 0);
    for (let k = 0; k < 12; k++) { const x0 = -26 + k * 40, x1 = x0 + 40; if (x1 < -50 || x0 > AW + 50) continue; g.fillStyle = '#2a1a24'; const sw = Math.sin(t * 0.03 + k * 0.9) * 1.5;
      for (let i = 0; i <= 12; i++) { const u = i / 12; g.fillRect(Math.round(x0 + 3 + 34 * u + sw * Math.sin(u * 3.14) * 0.5), Math.round(206 + 11 * 4 * u * (1 - u) + sw * Math.sin(u * 3.14)), i & 1 ? 2 : 1, 2); } }
    for (const x of [74, 394]) { flame(g, x, 192, t, x, 1, '#ff3b30', '#ff9a2a', '#ffe08a'); glow(g, '#ff5a30', x, 186, 46, 0.26 * flick(t, x), 46); }
    g.restore();
    if (ln.v > 0) { g.fillStyle = rgba('#ff9a8a', ln.v * 0.07); g.fillRect(-40, 0, w, AH); }
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, -0.14, 204, 0.3, 60 + cam.x * 0.3); put(g, l.fg, cam); motes(g, t, 30, 8, 0, AW, 20, AH, '#ff7a4a', 0.7, 1, 6); } });

// ======================================================================================
// 4. TOKEN FURNACE - an iron foundry that burns context windows; conveyors feed glowing tokens to the maw
// ======================================================================================
function gear(g, cx, cy, r, teeth, a0, col, hi) {
  for (let k = 0; k < teeth; k++) { const a = a0 + k * TAU / teeth, c = Math.cos(a), s = Math.sin(a), w = 0.16 * TAU / teeth * 3.2; const p = [];
    for (const [rr, da] of [[r - 2, -w], [r + 5, -w * 0.6], [r + 5, w * 0.6], [r - 2, w]]) p.push(cx + Math.cos(a + da) * rr, cy + Math.sin(a + da) * rr); fpoly(g, p, col); }
  disc(g, cx, cy, r, r, col); disc(g, cx, cy, r * 0.62, r * 0.62, '#0a0504'); disc(g, cx, cy, r * 0.5, r * 0.5, col); disc(g, cx, cy, 4, 4, hi);
  for (let k = 0; k < 6; k++) { const a = a0 + k * TAU / 6; line(g, cx, cy, cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, hi, 2); }
}
const furnace = def({ id: 'furnace', name: 'TOKEN FURNACE', tagline: 'EVERY CONTEXT WINDOW BURNS', accent: '#ff8a1f',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#080403'], [0.5, '#1c0b06'], [1, '#3a160a']], { q: 6 });
      for (let y = 6; y < 240; y += 20) { R(g, -M, y, w, 1, '#0c0605'); for (let x = -M + ((y / 20) & 1) * 30; x < AW + M; x += 60) { R(g, x, y, 1, 20, '#0c0605'); R(g, x + 3, y + 3, 1, 1, '#2a140c'); R(g, x + 55, y + 3, 1, 1, '#2a140c'); } }
      // furnace housing and maw
      R(g, 160, 24, 160, 122, '#150a07'); box(g, 160, 24, 160, 122, '#2a140c'); R(g, 166, 30, 148, 110, '#1b0d09'); disc(g, 240, 70, 62, 40, '#0b0403'); R(g, 178, 70, 124, 64, '#0b0403');
      for (let i = 0; i < 9; i++) R(g, 178 + i * 14, 134, 8, 8, '#0b0403'), poly(g, [178 + i * 14, 142, 182 + i * 14, 150, 186 + i * 14, 142], '#150a07');
      R(g, 180, 28, 120, 14, '#241210'); box(g, 180, 28, 120, 14, '#3a1c12'); textC(g, 'CONTEXT WINDOW', 240, 31, '#b0502a', 1); textC(g, 'INCINERATOR', 240, 37, '#6a2a14', 1);
      R(g, 226, 0, 28, 24, '#150a07'); R(g, 226, 0, 2, 24, '#3a1c12'); R(g, 252, 0, 2, 24, '#080403'); R(g, 222, 22, 36, 4, '#2a140c');
    }
    l.mid = layer(0.3); { const { g, M } = l.mid, w = AW + 2 * M;
      for (const x of [118, 362]) { R(g, x, 0, 12, 160, '#120907'); R(g, x, 0, 2, 160, '#3a1c12'); R(g, x + 10, 0, 2, 160, '#050202'); for (let y = 14; y < 160; y += 26) R(g, x - 2, y, 16, 4, '#070302'); }
      for (const [x0, x1] of [[-M, 170], [310, AW + M]]) { R(g, x0, 112, x1 - x0, 6, '#1a0e0a'); R(g, x0, 112, x1 - x0, 1, '#4a2616'); for (let x = x0 + 3; x < x1; x += 8) R(g, x, 118, 3, 3, '#0c0605'); R(g, x0, 124, x1 - x0, 2, '#0c0605'); for (let x = x0; x < x1; x += 40) R(g, x, 126, 3, 36, '#0e0706'); }
      R(g, -M, 150, w, 36, '#100807'); for (let x = -M; x < AW + M; x += 24) { R(g, x, 150, 1, 36, '#070302'); R(g, x + 12, 160, 1, 1, '#2a140c'); }
    }
    l.lava = layer(0.55); { const { g, M } = l.lava, w = AW + 2 * M;
      g.drawImage(grad(w, 50, [[0, '#7a260a'], [0.3, '#4a1708'], [1, '#1a0804']], { q: 6 }), -M, 184); R(g, -M, 184, w, 1, '#c8501a');
      for (const x of [60, 420]) { R(g, x - 5, 150, 10, 40, '#0a0504'); R(g, x - 14, 148, 28, 6, '#150a07'); R(g, x - 14, 148, 28, 1, '#3a1c12'); }
      const r = rng(77); for (let i = 0; i < 90; i++) { const x = -M + r() * w, y = 188 + r() * 40; R(g, x, y, 3 + r() * 8, 1, r() < 0.5 ? '#a8380e' : '#2a0e06'); }
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#0e0705', mid: '#201210', bot: '#0e0706', fade: '#0f0806', line: '#050202', line2: '#3a2018', lip: '#d0581a', lip2: '#080302', sp: 24, vp: [240, 110], rows: [-12, -6, -1, 5, 12, 21, 32, 45] });
      for (let y = 218; y < 268; y += 6) for (let x = -M + ((y / 6) & 1) * 6; x < AW + M; x += 12) { R(g, x, y, 6, 2, '#080403'); if (hash1(x * 3 + y) > 0.86) R(g, x, y + 2, 6, 1, '#a8380e'); }
      R(g, -M, 262, w, 8, '#0a0504'); for (let x = -M; x < AW + M; x += 10) poly(g, [x, 263, x + 5, 263, x + 9, 270, x + 4, 270], '#6a4a10');
      for (const x of [-M + 10, 150, 330, 470]) for (const y of [240, 256]) R(g, x, y, 2, 2, '#3a2a22');
      R(g, -M, 207, w, 2, '#0a0504'); R(g, -M, 220, w, 1, '#0a0504'); for (let x = -M + 8; x < AW + M; x += 48) { R(g, x, 203, 3, 31, '#0a0504'); R(g, x - 1, 201, 5, 2, '#2a140c'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const x of [-12, 468]) { R(g, x, 0, 24, AH, '#050202'); R(g, x + (x < 0 ? 22 : 0), 0, 2, AH, '#c8501a'); R(g, x + (x < 0 ? 18 : 4), 0, 1, AH, '#3a1408'); for (let y = 24; y < AH; y += 40) { R(g, x - 2, y, 28, 5, '#12090a'); R(g, x - 2, y, 28, 1, '#3a1c12'); } } }
    l.fog = fogTex(480, 70, '#8a3a1a', 1, 61); l.smoke = fogTex(480, 90, '#1a0c08', 1.8, 62, 34);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0);
    const fl = flick(t, 3), by = 132;
    for (let k = 0; k < 11; k++) { const x = 184 + k * 11.2, arc = 70 - Math.sqrt(Math.max(0, 1 - Math.pow((x - 240) / 62, 2))) * 40, hh = 34 + 30 * hash1((t >> 2) + k * 17) + 8 * Math.sin(t * 0.07 + k), top = Math.max(arc + 6, by - hh), sw = Math.round(Math.sin(t * 0.09 + k * 1.7) * 1.5);
      const tg = (w, tp, c) => poly(g, [x - w, by, x - w, tp + 7, x - w * 0.5 + sw, tp + 2, x + sw, tp - 5, x + w * 0.5 + sw, tp + 2, x + w, tp + 7, x + w, by], c);
      tg(6, top, '#8a1f08'); tg(5, top + 5, '#d8461a'); tg(3, top + 15, '#ff9a2a'); tg(2, top + 28, '#ffdd7a'); }
    glow(g, '#ff6a1a', 240, 96, 150, 0.32 * fl, 80);
    for (let k = 0; k < 9; k++) { const u = (t * 1.4 + k * 17) % 130, x = (k & 1 ? 240 + 2 : 240 - 2); if (u < 26) { R(g, 236 + (k % 3) * 2, u, 4, 4, '#ffb02e'); R(g, 237 + (k % 3) * 2, u + 1, 2, 2, '#fff0b0'); } }
    textC(g, String(((t * 37) % 1000000) + 100000), 240, 48, '#ff9a2a', 1, 1); g.restore();
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.3), 0);
    gear(g, 52, 78, 30, 12, t * 0.012, '#2a1710', '#4a2a1a'); gear(g, 428, 86, 36, 14, -t * 0.01, '#2a1710', '#4a2a1a');
    for (let k = 0; k < 10; k++) for (const [x0, dir] of [[-6, 1], [486, -1]]) { const u = ((t * 0.6 + k * 17) % 168) | 0, x = x0 + dir * u; if (x < 168 || x > 312) { R(g, x, 109, 5, 3, '#8a2a0a'); R(g, x + 1, 108, 3, 2, '#ffb02e'); } }
    g.restore();
    put(g, l.lava, cam);
    g.save(); g.translate(off(cam, 0.55), 0);
    for (let k = 0; k < 18; k++) if (Math.sin(t * 0.04 + k * 2.1) > -0.3) R(g, ((k * 61 - t * 0.3 * (1 + (k & 1)) + 520 * 4) % 540) - 30, 190 + (k * 7) % 30, 6 + k % 6, 1, k & 1 ? '#ff9a2a' : '#d8461a');
    glow(g, '#ff5a1a', 240, 190, 280, 0.2 * fl, 12); g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 1), 0); glow(g, '#ff6a1a', 240, AG + 4, 260, 0.16 * fl, 24); g.restore();
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.smoke, t, 0.2, 170, 0.35, cam.x * 0.3); fogDraw(g, l.fog, t, -0.1, 210, 0.22, 90); put(g, l.fg, cam); motes(g, t, 54, 4, 0, AW, 0, AH, '#ff8a2a', 0.9, 1, 8); motes(g, t, 20, 17, 0, AW, 0, AH, '#ffd27a', 1.3, 1, 5); } });

// ======================================================================================
// 5. DEPRECATED FOREST - moonlit dead woods; the trees have faces and still remember the old API
// ======================================================================================
function deadTree(g, x, base, h, seed, col, hi, th) {
  const r = rng(seed); poly(g, [x - th, base, x - th * 0.55, base - h * 0.5, x - th * 0.25, base - h, x + th * 0.25, base - h, x + th * 0.55, base - h * 0.5, x + th, base], col);
  R(g, x - th * 0.6, base - h * 0.5, 1, h * 0.5, hi);
  const br = (bx, by, ang, len, w, d) => { if (d > 3 || len < 6) return; const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len; line(g, bx, by, ex, ey, col, Math.max(1, w)); br(ex, ey, ang + (r() - 0.7) * 1.1, len * 0.68, w - 1, d + 1); br(ex, ey, ang + (r() - 0.3) * 1.1, len * 0.6, w - 1, d + 1); };
  for (let i = 0; i < 3; i++) { br(x - th * 0.3, base - h + i * 4, -Math.PI / 2 - 0.9 - r() * 0.7, h * 0.34, 3, 0); br(x + th * 0.3, base - h + i * 4, -Math.PI / 2 + 0.9 + r() * 0.7, h * 0.34, 3, 0); }
}
function treeFace(g, x, y, s, mood) {   // carved face: hollow eyes and mouth (dark), eyes are re-drawn glowing every frame
  const d = '#02070a';
  poly(g, [x - 8 * s, y, x - 2 * s, y - 2 * s * (mood ? 1 : -1), x - 2 * s, y + 4 * s, x - 8 * s, y + 3 * s], d); poly(g, [x + 8 * s, y, x + 2 * s, y - 2 * s * (mood ? 1 : -1), x + 2 * s, y + 4 * s, x + 8 * s, y + 3 * s], d);
  disc(g, x, y + 11 * s, 3 * s, 5 * s, d); R(g, x - s, y + 7 * s, 2 * s, 2 * s, '#0b1a1a');
}
const forest = def({ id: 'forest', name: 'DEPRECATED FOREST', tagline: 'THE OLD TREES REMEMBER', accent: '#5ee0c8',
  build(A) {
    const l = A.l; l.eyes = [];
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#030a10'], [0.5, '#0a1a24'], [0.85, '#14323a'], [1, '#0b1c22']], { q: 6 });
      speck(g, -M, 0, w, 120, ['#cfe', '#8ab'], 70, 3); glow(g, '#6ae0d0', 130, 56, 80, 0.35);
      disc(g, 130, 56, 24, 24, '#a8dcd6'); disc(g, 128, 54, 22, 22, '#c8f0ee'); for (const [dx, dy, r] of [[-8, -4, 5], [6, 8, 4], [4, -10, 3], [-4, 10, 3]]) disc(g, 130 + dx, 56 + dy, r, r, '#9ed6d4');
      const r = rng(8); for (let x = -M; x < AW + M; x += 7) { const h = 36 + r() * 40 + Math.sin(x * 0.02) * 12; poly(g, [x - 5, 180, x, 180 - h, x + 5, 180], '#051218'); R(g, x - 3, 180 - h * 0.55, 6, 2, '#051218'); }
      R(g, -M, 178, w, 60, '#051218');
    }
    l.far = layer(0.25); { const { g, M } = l.far; const spots = [[34, 190, 130, 7], [110, 195, 150, 8], [196, 188, 115, 6], [292, 192, 140, 7], [360, 195, 125, 6], [452, 190, 150, 8]];
      spots.forEach(([x, b, h, th], i) => { deadTree(g, x, b, h, 100 + i, '#07161a', '#123238', th); });
      treeFace(g, 110, 130, 1.2, 1); l.eyes.push([105, 131, 0.25, 1], [115, 131, 0.25, 1]); treeFace(g, 360, 134, 1.1, 0); l.eyes.push([355, 135, 0.25, 1], [365, 135, 0.25, 1]);
      R(g, 239, 150, 2, 44, '#0e2a2c'); R(g, 214, 148, 52, 11, '#2a1f14'); box(g, 214, 148, 52, 11, '#4a3a22'); textC(g, 'DEPRECATED', 240, 152, '#a07a3a');
    }
    l.near = layer(0.6); { const { g, M } = l.near;
      for (const [x, h, face, sd] of [[34, 236, 1.9, 1], [446, 236, 1.9, 0]]) { const th = 26; poly(g, [x - th, 238, x - th * 0.8, 150, x - th * 0.55, 20, x + th * 0.55, 20, x + th * 0.8, 150, x + th], '#040e12'); R(g, x + (sd ? -th * 0.6 : th * 0.6 - 2), 20, 2, 218, '#143a40');
        treeFace(g, x, 110, face, sd); l.eyes.push([x - 8 * face + 2, 110 + 1, 0.6, 3], [x + 8 * face - 2, 110 + 1, 0.6, 3]);
        for (let i = 0; i < 5; i++) { const sx = x + (i - 2) * 10; poly(g, [sx - 4, 232, sx, 244, sx + 6, 252, sx + 3, 238], '#040e12'); }
        for (const dir of [1, -1]) { line(g, x + dir * th * 0.5, 36, x + dir * 70, 24, '#040e12', 4); line(g, x + dir * 70, 24, x + dir * 90, 4, '#040e12', 3); line(g, x + dir * 60, 28, x + dir * 66, 50, '#040e12', 2); } }
      for (const [x, y, c] of [[84, 36, 'V1.0'], [398, 30, 'V0.9']]) { R(g, x, y, 1, 18, '#163238'); R(g, x - 8, y + 18, 17, 9, '#2a1f14'); box(g, x - 8, y + 18, 17, 9, '#4a3a22'); textC(g, c, x, y + 20, '#a07a3a'); }
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#070f0d', mid: '#101e1a', bot: '#070d0b', fade: '#08110f', line: '#040807', line2: '#1c2e28', lip: '#2c6a5c', lip2: '#050a09', sp: 52, vp: [240, 100], rows: [-10, 3, 20] });
      speck(g, -M, 216, w, 54, ['#2a3a1e', '#3a2a18', '#1c2e28', '#0a1612'], 360, 31); speck(g, -M, 224, w, 46, ['#3fd0b0'], 18, 32);
      const r = rng(12); for (let i = 0; i < 26; i++) { const x = -M + r() * w, y = 216 + r() * 50; line(g, x, y, x + 8 + r() * 14, y + (r() - 0.3) * 5, '#030807', 1); }
      for (let x = -M; x < AW + M; x += 9) { const hh = 4 + hash1(x * 3) * 7; poly(g, [x, 222, x + 1, 222 - hh, x + 3, 222], '#040d0b'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const dir of [1, -1]) { const x0 = dir > 0 ? -10 : 490; line(g, x0, 6, x0 + dir * 58, 22, '#030a0d', 5); line(g, x0 + dir * 58, 22, x0 + dir * 96, 14, '#030a0d', 3); line(g, x0 + dir * 30, 14, x0 + dir * 44, 50, '#030a0d', 3); line(g, x0 + dir * 70, 20, x0 + dir * 82, 44, '#030a0d', 2); } }
    l.f1 = fogTex(480, 90, '#6ab8b0', 1, 71, 30); l.f2 = fogTex(480, 70, '#4a9a98', 1, 72, 24); l.f3 = fogTex(480, 60, '#8ad0c8', 0.9, 73);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); glow(g, '#6ae0d0', 130, 56, 100, 0.12 + 0.04 * Math.sin(t * 0.02)); g.restore();
    fogDraw(g, l.f1, t, 0.1, 110, 0.35, cam.x * 0.08);
    put(g, l.far, cam);
    fogDraw(g, l.f2, t, -0.16, 140, 0.4, 200 + cam.x * 0.25);
    put(g, l.near, cam);
    for (const [x, y, f, k] of l.eyes) { const o = off(cam, f), bl = ((t + x * 3) % 260) < 7; if (bl) continue; const a = 0.75 + 0.25 * Math.sin(t * 0.05 + x); R(g, x + o - 1, y - 1, 3, 2, '#9bfff0'); R(g, x + o, y - 1, 1, 2, '#ffffff'); glow(g, '#40e8d0', x + o, y, 7 + k * 2, 0.5 * a); }
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 0.7), 0); for (let k = 0; k < 14; k++) { const ph = hash1(k * 5) * TAU, x = 40 + hash1(k * 9 + 1) * 400 + Math.sin(t * 0.011 + ph) * 22, y = 120 + hash1(k * 3 + 2) * 100 + Math.sin(t * 0.017 + ph * 2) * 12, a = 0.55 + 0.45 * Math.sin(t * 0.05 + ph);
      g.fillStyle = rgba('#9bfff0', a); g.fillRect(Math.round(x), Math.round(y), 2, 2); glow(g, '#40e8d0', x + 1, y + 1, 9, 0.35 * a); } g.restore();
    for (let k = 0; k < 18; k++) { const x = (hash1(k * 11) * 560 + t * 0.35 + Math.sin(t * 0.03 + k) * 6) % 520 - 20, y = (hash1(k * 7 + 3) * 300 + t * 0.5) % 260; g.fillStyle = k & 1 ? '#4a3a1c' : '#2a3a1e'; g.fillRect(Math.round(x), Math.round(y), 2, 1); }
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.f3, t, 0.2, 204, 0.3, 40 + cam.x * 0.3); put(g, l.fg, cam); motes(g, t, 20, 6, 0, AW, 10, AH, 'rgba(155,255,240,0.35)', 0.15, 1, 8); } });

// ======================================================================================
// 6. MERGE-CONFLICT TEMPLE - two truths in one hall: HEAD burns red on the left, incoming burns blue on the right
// ======================================================================================
function statue(g, x, base, h, col, hi, dir) {   // colossal armoured guardian silhouette
  const s = h / 150;
  poly(g, [x - 22 * s, base, x - 24 * s, base - 70 * s, x - 34 * s, base - 100 * s, x - 22 * s, base - 108 * s, x - 14 * s, base - 120 * s, x - 10 * s, base - 134 * s, x - 4 * s, base - 146 * s, x + 4 * s, base - 146 * s, x + 10 * s, base - 134 * s, x + 14 * s, base - 120 * s, x + 22 * s, base - 108 * s, x + 34 * s, base - 100 * s, x + 24 * s, base - 70 * s, x + 22 * s, base], col);
  poly(g, [x + dir * 34 * s, base - 100 * s, x + dir * 46 * s, base - 160 * s, x + dir * 50 * s, base - 160 * s, x + dir * 40 * s, base - 96 * s], hi);
  poly(g, [x - 10 * s, base - 134 * s, x - 14 * s, base - 150 * s, x - 6 * s, base - 144 * s, x, base - 156 * s, x + 6 * s, base - 144 * s, x + 14 * s, base - 150 * s, x + 10 * s, base - 134 * s], col);
  R(g, x - 22 * s, base - 106 * s, 44 * s, 2, hi);
}
const temple = def({ id: 'temple', name: 'MERGE-CONFLICT TEMPLE', tagline: 'TWO TRUTHS ENTER, ONE REMAINS', accent: '#d24bff',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M;
      fill(l.sky, [[0, '#2c0a12'], [0.44, '#17091c'], [0.56, '#0a1022'], [1, '#08202f']], { horiz: true, q: 6 }); const sh = grad(w, AH, [[0, '#000', 0.78], [0.55, '#000', 0.25], [1, '#000', 0.05]], { L: 6 }); g.drawImage(sh, -M, 0);
      for (let y = 10; y < 234; y += 12) { R(g, -M, y, w, 1, 'rgba(0,0,0,0.5)'); for (let x = -M + ((y / 12) & 1) * 18; x < AW + M; x += 36) R(g, x, y, 1, 12, 'rgba(0,0,0,0.5)'); }
      text(g, '<<<<<<< HEAD', 22, 22, '#d8402a', 3); text(g, '>>>>>>> MAIN', 300, 22, '#2a8ae0', 3); textC(g, '=======', 240, 62, '#d24bff', 3);
      text(g, 'FUNC SHIP() {', 22, 42, '#6a2018', 2); text(g, 'RETURN OLD;', 30, 54, '#6a2018', 2); text(g, 'FUNC SHIP() {', 300, 42, '#17406a', 2); text(g, 'RETURN NEW;', 308, 54, '#17406a', 2);
    }
    l.mid = layer(0.3); { const { g, M } = l.mid, w = AW + 2 * M;
      for (const [x, c, hi] of [[100, '#1a0c12', '#4a2024'], [172, '#1a0c12', '#4a2024'], [308, '#0c1220', '#20405a'], [380, '#0c1220', '#20405a']]) { R(g, x - 13, 84, 26, 150, c); R(g, x - 13, 84, 2, 150, hi); R(g, x + 11, 84, 2, 150, '#040306'); for (let y = 100; y < 220; y += 18) R(g, x - 13, y, 26, 1, '#050308'); R(g, x - 17, 78, 34, 8, c); R(g, x - 17, 78, 34, 2, hi); R(g, x - 17, 226, 34, 8, c); R(g, x - 17, 226, 34, 1, hi);
        text(g, x < 240 ? '-' : '+', x - 1, 130, x < 240 ? '#a8381e' : '#2a78c0', 1); text(g, x < 240 ? '-' : '+', x - 1, 170, x < 240 ? '#a8381e' : '#2a78c0', 1); }
      R(g, 70, 70, 140, 9, '#1a0c12'); R(g, 70, 70, 140, 1, '#4a2024'); R(g, 270, 70, 140, 9, '#0c1220'); R(g, 270, 70, 140, 1, '#20405a');
    }
    l.near = layer(0.55); { const { g } = l.near; statue(g, 34, 234, 150, '#0a0508', '#6a2a1e', 1); statue(g, 446, 234, 150, '#04080e', '#1e4a78', -1); }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#0e0b12', mid: '#1c1622', bot: '#0c0a10', fade: '#0e0a14', line: '#050408', line2: '#322a3c', lip: '#6a4a8a', lip2: '#070509', sp: 40, vp: [240, 100], rows: [-12, -6, -1, 5, 12, 21, 32] });
      speck(g, -M, 216, w, 54, ['#2a2236', '#0f0b16', '#3a3048'], 280, 41);
      pool(g, '#ff4a2a', 110, 246, 140, 26, 0.34); pool(g, '#2a8aff', 370, 246, 140, 26, 0.32); pool(g, '#d24bff', 240, 246, 60, 22, 0.36);
      const r = rng(7); let x = 240, y = 214; while (y < 270) { const nx = 240 + (r() - 0.5) * 7, ny = y + 5 + r() * 4; line(g, x, y, nx, ny, '#e8a0ff', 1); x = nx; y = ny; }
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const [x, c, hi] of [[-12, '#0a0508', '#a8381e'], [466, '#04080e', '#2a78c0']]) { R(g, x, 0, 26, AH, c); R(g, x + (x < 0 ? 24 : 0), 0, 2, AH, hi); for (let y = 12; y < AH; y += 22) R(g, x, y, 26, 1, '#000'); } }
    l.fogR = fogTex(480, 70, '#c0402a', 0.8, 81); l.fogB = fogTex(480, 70, '#2a78c0', 0.8, 82);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); const pu = 0.5 + 0.5 * Math.sin(t * 0.05); glow(g, '#c0402a', 100, 40, 110, 0.12, 36); glow(g, '#2a78c0', 380, 40, 110, 0.12, 36); glow(g, '#d24bff', 240, 64, 60, 0.18 + 0.1 * pu, 20);
    { const sd = (t >> 2); g.globalAlpha = 0.5 + 0.5 * pu; bolt(g, 240, 0, 240, 214, sd, '#e8a0ff', 'rgba(210,75,255,0.25)'); g.globalAlpha = 1; } g.restore();
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.3), 0); for (const [x, c0, c1, c2] of [[100, '#e8381a', '#ff9a2a', '#fff0c0'], [172, '#e8381a', '#ff9a2a', '#fff0c0'], [308, '#1a60e8', '#4ab8ff', '#e0f8ff'], [380, '#1a60e8', '#4ab8ff', '#e0f8ff']]) { flame(g, x, 76, t, x, 1, c0, c1, c2); glow(g, c0, x, 72, 38, 0.3 * flick(t, x), 38); }
    for (let k = 0; k < 8; k++) { const u = (t * 0.35 + k * 31) % 220; text(g, k & 1 ? '-' : '+', k & 1 ? 40 + (k * 17) % 160 : 290 + (k * 23) % 160, 230 - u, k & 1 ? '#c8402a' : '#3a98e8'); }
    g.restore();
    put(g, l.near, cam);
    g.save(); g.translate(off(cam, 0.55), 0); const e = 0.6 + 0.4 * Math.sin(t * 0.06); R(g, 32, 83, 3, 2, '#ff6a2a'); R(g, 33, 83, 1, 2, '#fff'); R(g, 444, 83, 3, 2, '#4ab8ff'); glow(g, '#ff4a2a', 34, 84, 14, 0.5 * e); glow(g, '#2a8aff', 445, 84, 14, 0.5 * e);
    glow(g, '#ff3a1a', 34 + 52, 86, 20, 0.2 * flick(t, 5)); glow(g, '#2a8aff', 446 - 52, 86, 20, 0.2 * flick(t, 6)); g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 1), 0); glow(g, '#d24bff', 240, AG + 8, 44, 0.22 + 0.12 * pu, 12); g.restore();
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fogR, t, 0.14, 204, 0.18, cam.x * 0.3); g.save(); g.beginPath(); g.rect(240 + off(cam, 0.2), 200, 400, 80); g.clip(); fogDraw(g, l.fogB, t, 0.1, 204, 0.2, 120 + cam.x * 0.3); g.restore(); put(g, l.fg, cam);
    motes(g, t, 22, 4, 0, 230, 20, AH, '#ff5a2a', 0.6, 1, 6); motes(g, t, 22, 5, 250, AW, 20, AH, '#4ab8ff', 0.6, 1, 6); } });

// ======================================================================================
// 7. SERVER GRAVEYARD - moonlit boneyard of dead hardware; CRT tombstones, floppy crosses, wisps and bats
// ======================================================================================
function crt(g, x, base, w, h, body, hi, screen) {   // tombstone shaped like a CRT monitor
  R(g, x - w / 2, base - h, w, h, body); R(g, x - w / 2, base - h, w, 1, hi); R(g, x - w / 2, base - h, 1, h, hi); R(g, x + w / 2 - 1, base - h, 1, h, '#02040a');
  R(g, x - w / 2 + 3, base - h + 3, w - 6, h - 12, '#02050a'); R(g, x - w / 2 + 4, base - h + 4, w - 8, h - 14, screen);
  R(g, x - w / 2 + 3, base - 6, w - 6, 2, hi); R(g, x + w / 2 - 7, base - 4, 2, 2, '#2a3a6a');
}
function floppy(g, x, y, s, body, hi) { R(g, x, y, s, s, body); R(g, x + s * 0.2, y, s * 0.6, s * 0.35, hi); R(g, x + s * 0.55, y + 1, s * 0.15, s * 0.22, body); R(g, x + s * 0.15, y + s * 0.55, s * 0.7, s * 0.45, '#2a3a5a'); R(g, x + s * 0.25, y + s * 0.62, s * 0.5, 2, '#5a6a9a'); }
function bat(g, x, y, f) {
  const p = f ? [x - 7, y - 3, x - 3, y - 1, x, y + 1, x + 3, y - 1, x + 7, y - 3, x + 4, y + 2, x, y + 3, x - 4, y + 2] : [x - 6, y + 3, x - 3, y, x, y - 1, x + 3, y, x + 6, y + 3, x + 3, y + 1, x, y + 2, x - 3, y + 1];
  poly(g, p, '#04060e'); R(g, x - 1, y - 2, 1, 1, '#04060e'); R(g, x + 1, y - 2, 1, 1, '#04060e');
}
const graveyard = def({ id: 'graveyard', name: 'SERVER GRAVEYARD', tagline: 'HERE LIE 99.9% OF UPTIME', accent: '#8fa8ff',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#04050f'], [0.45, '#0b1230'], [0.8, '#1a2650'], [1, '#202e5a']], { q: 6 });
      speck(g, -M, 0, w, 130, ['#cdd6ff', '#8fa8ff', '#fff'], 80, 5);
      const r = rng(23); for (let i = 0; i < 9; i++) { const x = -M + r() * w, y = 20 + r() * 110, ww = 40 + r() * 90; g.drawImage(grad(ww, 8, [[0, '#101a40', 0], [0.5, '#101a40', 0.8], [1, '#101a40', 0]], { L: 6, horiz: false }), x, y); }
      glow(g, '#9ab8ff', 350, 58, 70, 0.5); disc(g, 350, 58, 26, 26, '#c8d6ee'); disc(g, 352, 56, 24, 24, '#e4eaf8'); for (const [dx, dy, rr] of [[-8, -6, 6], [8, 5, 5], [2, -12, 3], [-10, 9, 3]]) disc(g, 350 + dx, 58 + dy, rr, rr, '#b0c0dc');
      ridge(g, 190, 22, 41, '#0a1030', { jag: 0.5 }); R(g, -M, 188, w, 60, '#0a1030');
    }
    l.far = layer(0.25); { const { g, M } = l.far, w = AW + 2 * M;
      R(g, -M, 204, w, 10, '#070b20');
      // mausoleum made of a dead rack
      R(g, 196, 140, 90, 70, '#0a0f26'); R(g, 196, 140, 90, 1, '#2a3a6a'); poly(g, [190, 140, 240, 112, 292, 140], '#0c1230'); poly(g, [190, 140, 240, 112, 244, 112, 196, 140], '#26366a');
      R(g, 222, 164, 38, 46, '#02040a'); disc(g, 241, 164, 19, 14, '#02040a'); textC(g, '404', 241, 148, '#3a4a8a', 1); for (let y = 148; y < 206; y += 8) { R(g, 204, y, 12, 4, '#0e1636'); R(g, 266, y, 12, 4, '#0e1636'); }
      for (const x of [40, 120, 160, 330, 400, 450]) { const h = 22 + hash1(x) * 14; R(g, x - 7, 210 - h, 14, h, '#0a1030'); disc(g, x, 210 - h, 7, 6, '#0a1030'); R(g, x - 7, 210 - h, 1, h, '#2a3a6a'); text(g, 'RIP', x - 5, 210 - h + 6, '#1c2a58'); }
      // iron fence
      R(g, -M, 188, w, 2, '#04060e'); R(g, -M, 200, w, 2, '#04060e'); for (let x = -M + 3; x < AW + M; x += 7) { R(g, x, 184, 2, 28, '#04060e'); poly(g, [x - 1, 184, x + 1, 178, x + 3, 184], '#04060e'); }
    }
    l.mid = layer(0.5); { const { g } = l.mid;
      crt(g, 60, 214, 26, 34, '#0e1534', '#34477e', '#0a1a3a'); crt(g, 426, 214, 30, 38, '#0e1534', '#34477e', '#0a1a3a');
      // floppy-disk cross
      R(g, 258, 150, 4, 64, '#0a0f26'); R(g, 258, 150, 1, 64, '#2a3a6a'); R(g, 244, 166, 32, 4, '#0a0f26'); R(g, 244, 166, 32, 1, '#2a3a6a'); floppy(g, 250, 132, 20, '#101a40', '#3a4a8a');
      // leaning tombstones
      poly(g, [356, 214, 354, 184, 362, 178, 372, 184, 376, 214], '#0a1030'); R(g, 355, 186, 1, 28, '#2a3a6a'); text(g, 'EOL', 358, 192, '#1c2a58');
      poly(g, [150, 214, 152, 196, 160, 192, 168, 198, 170, 214], '#0a1030'); R(g, 151, 198, 1, 16, '#2a3a6a');
      R(g, 405, 140, 2, 74, '#070b20'); R(g, 397, 140, 12, 2, '#070b20'); R(g, 403, 150, 8, 10, '#080c20'); box(g, 403, 150, 8, 10, '#3a4a8a');
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#080c1c', mid: '#121a34', bot: '#0a0f1e', fade: '#0a1024', line: '#04060e', line2: '#1c2646', lip: '#3a4a88', lip2: '#04060e', sp: 46, vp: [240, 100], rows: [-10, 2, 18, 40] });
      speck(g, -M, 216, w, 54, ['#1c2646', '#0a1022', '#2a3a66', '#32476e'], 340, 51); speck(g, -M, 216, w, 54, ['#8fa8ff'], 14, 52);
      const r = rng(19); for (let i = 0; i < 12; i++) floppy(g, -M + r() * w, 222 + r() * 36, 5, '#161e3c', '#2a3a66');
      for (let x = -M; x < AW + M; x += 8) { const hh = 3 + hash1(x * 5) * 6; poly(g, [x, 220, x + 1, 220 - hh, x + 3, 220], '#05080f'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; poly(g, [-14, 270, -10, 170, -2, 160, 14, 164, 24, 270], '#03050c'); R(g, -10, 172, 2, 98, '#3a4a88'); text(g, 'R.I.P', 0, 182, '#1c2a58');
      poly(g, [458, 270, 462, 200, 472, 192, 490, 198, 492, 270], '#03050c'); R(g, 463, 200, 1, 70, '#3a4a88');
      line(g, 470, 0, 440, 22, '#03050c', 4); line(g, 440, 22, 406, 20, '#03050c', 2); line(g, 440, 22, 432, 52, '#03050c', 2); }
    l.f1 = fogTex(480, 80, '#5a76c8', 1, 91, 28); l.f2 = fogTex(480, 60, '#7a96e8', 0.9, 92, 24);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); glow(g, '#9ab8ff', 350, 58, 90, 0.2 + 0.05 * Math.sin(t * 0.03));
    for (let k = 0; k < 5; k++) { const u = (t * (0.55 + k * 0.1) + k * 140) % 620, x = -30 + u, y = 40 + k * 17 + Math.sin(u * 0.05 + k) * 9; if (x > -10 && x < 500) bat(g, x, y, ((t >> 3) + k) & 1); } g.restore();
    fogDraw(g, l.f1, t, 0.08, 120, 0.3, cam.x * 0.1);
    put(g, l.far, cam);
    g.save(); g.translate(off(cam, 0.25), 0); const pu = 0.6 + 0.4 * Math.sin(t * 0.045); glow(g, '#4a68d8', 241, 192, 44, 0.16 * pu, 36); g.restore();
    fogDraw(g, l.f2, t, -0.14, 168, 0.35, 200 + cam.x * 0.4);
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.5), 0);
    for (const [x, bw, bh, base] of [[60, 26, 34, 214], [426, 30, 38, 214]]) { const x0 = x - bw / 2 + 4, y0 = base - bh + 4, sw = bw - 8, sh = bh - 14, fr = (t >> 1) + x;
      for (let i = 0; i < 26; i++) { const a = hash1(fr * 7 + i * 31 + x); g.fillStyle = a > 0.6 ? '#4a68c8' : '#16224a'; g.fillRect(x0 + ((hash1(fr + i * 3) * sw) | 0), y0 + ((hash1(fr * 3 + i) * sh) | 0), 2, 1); }
      textC(g, 'NO SIGNAL', x, y0 + (sh >> 1) - 2, '#6a88e8', 1); glow(g, '#4a68d8', x, y0 + sh / 2, 26, 0.22 * flick(t, x)); }
    glow(g, '#ffb85a', 405 + 7, 155, 20, 0.5 * flick(t, 9), 22); R(g, 405, 152, 5, 6, rgba('#ffd98a', 0.6 + 0.3 * flick(t, 9) / 1.1)); g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 0.8), 0);
    for (let k = 0; k < 7; k++) { const ph = hash1(k * 5 + 1) * TAU, bx = 30 + hash1(k * 9 + 2) * 420, x = bx + Math.sin(t * 0.012 + ph) * 26, y = 150 + hash1(k * 3 + 4) * 60 + Math.sin(t * 0.019 + ph * 2) * 10;
      for (let j = 6; j >= 1; j--) { const tx = bx + Math.sin((t - j * 4) * 0.012 + ph) * 26, ty = 150 + hash1(k * 3 + 4) * 60 + Math.sin((t - j * 4) * 0.019 + ph * 2) * 10; g.fillStyle = rgba('#8fa8ff', 0.28 - j * 0.04); g.fillRect(Math.round(tx), Math.round(ty), 2, 2); }
      glow(g, '#6a88ff', x + 1, y + 1, 11, 0.45); R(g, x, y, 2, 2, '#e4ecff'); } g.restore();
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.f2, t, 0.18, 206, 0.28, 60 + cam.x * 0.3); fogDraw(g, l.f1, t, -0.1, 222, 0.2, 300); put(g, l.fg, cam); motes(g, t, 22, 7, 0, AW, 10, AH, 'rgba(160,190,255,0.4)', 0.14, 1, 8); } });

// ======================================================================================
// 8. LAUNCH-NIGHT ROOFTOP - skyscraper roof in a thunderstorm, a rocket on the pad, neon says SHIP IT
// ======================================================================================
function tower(g, x, w, top, col, hi, win, seed, dens) {
  R(g, x, top, w, 240 - top, col); R(g, x, top, w, 1, hi); R(g, x, top, 1, 240 - top, hi); R(g, x + w - 1, top, 1, 240 - top, '#04060c');
  const r = rng(seed); for (let y = top + 5; y < 200; y += 5) for (let xx = x + 3; xx < x + w - 3; xx += 4) if (r() < dens) R(g, xx, y, 2, 2, win[(r() * win.length) | 0]);
}
const rooftop = def({ id: 'rooftop', name: 'LAUNCH-NIGHT ROOFTOP', tagline: 'SHIPPING IN THE STORM', accent: '#4fb8ff',
  build(A) {
    const l = A.l; l.blink = [];
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#04060e'], [0.45, '#0a1226'], [0.8, '#1a2448'], [1, '#2a2a5a']], { q: 6 });
      const r = rng(61); for (let i = 0; i < 14; i++) { const x = -M + r() * w, y = 8 + r() * 130, ww = 70 + r() * 120; g.drawImage(grad(ww, 22, [[0, '#060a18', 0], [0.5, '#060a18', 0.9], [1, '#060a18', 0]], { L: 6 }), x, y); }
      g.drawImage(grad(w, 70, [[0, '#d02a9a', 0], [1, '#d02a9a', 0.45]], { L: 6 }), -M, 130);
    }
    l.far = layer(0.2); { const { g, M } = l.far, w = AW + 2 * M; const r = rng(4); let x = -M;
      while (x < AW + M) { const ww = 14 + r() * 22, top = 110 + r() * 60; tower(g, x, ww, top, '#0a1022', '#1c2a50', ['#4a8ae0', '#e0509a', '#3a5a9a'], (x + 99) | 0, 0.18); if (r() < 0.3) R(g, x + ww / 2, top - 10, 1, 10, '#0a1022'); x += ww + 2; } }
    l.mid = layer(0.4); { const { g, M } = l.mid;
      // launch pad rocket (left) with gantry
      const rx = 92; R(g, rx - 3, 190, 6, 30, '#0a1020'); poly(g, [rx - 11, 214, rx - 8, 150, rx - 6, 120, rx, 86, rx + 6, 120, rx + 8, 150, rx + 11, 214], '#9aa6c2'); poly(g, [rx, 86, rx + 6, 120, rx + 8, 150, rx + 11, 214, rx + 2, 214, rx + 3, 140], '#5a6682');
      R(g, rx - 9, 150, 18, 2, '#2a3450'); R(g, rx - 9, 186, 18, 2, '#2a3450'); disc(g, rx, 138, 3, 3, '#1a2a50'); ring(g, rx, 138, 3, '#5a78c0'); text(g, 'V2', rx - 3, 160, '#e0509a');
      poly(g, [rx - 11, 200, rx - 22, 214, rx - 11, 214], '#5a6682'); poly(g, [rx + 11, 200, rx + 22, 214, rx + 11, 214], '#3a4662');
      R(g, rx + 22, 100, 3, 114, '#0a1020'); for (let y = 100; y < 214; y += 10) { line(g, rx + 22, y, rx + 25, y + 10, '#0a1020'); R(g, rx + 12, y + 2, 10, 2, '#0a1020'); }
      // tower with neon sign
      tower(g, 312, 70, 70, '#0c1428', '#24366a', ['#4a8ae0', '#e0509a', '#ffd98a'], 33, 0.34); R(g, 306, 100, 82, 22, '#0a0f1e'); box(g, 306, 100, 82, 22, '#2a3a6a');
      tower(g, 404, 56, 100, '#0c1428', '#24366a', ['#4a8ae0', '#e0509a'], 34, 0.3); tower(g, 4, 40, 120, '#0c1428', '#24366a', ['#4a8ae0', '#ffd98a'], 35, 0.3);
    }
    l.near = layer(0.6); { const { g } = l.near;
      for (const [x, w] of [[0, 54], [420, 66]]) { R(g, x, 156, w, 58, '#070b16'); R(g, x, 156, w, 2, '#2a3a66'); for (let xx = x + 4; xx < x + w - 4; xx += 6) R(g, xx, 164, 3, 14, '#0e1428'); R(g, x, 180, w, 1, '#0e1428'); }
      R(g, 440, 120, 22, 36, '#0a1020'); R(g, 440, 120, 22, 2, '#2a3a66'); R(g, 450, 90, 2, 30, '#0a1020'); R(g, 38, 130, 18, 26, '#0a1020'); R(g, 46, 100, 2, 30, '#0a1020'); l.blink.push([451, 90], [47, 100]);
      R(g, -20, 205, AW + 40, 9, '#0a1020'); R(g, -20, 205, AW + 40, 1, '#3a4a80'); for (let x = -20; x < AW + 20; x += 18) { R(g, x, 196, 2, 10, '#0a1020'); } R(g, -20, 197, AW + 40, 1, '#1c2a50');
    }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#0a0e18', mid: '#141c2c', bot: '#0a1018', fade: '#0b1020', line: '#04060c', line2: '#222c44', lip: '#4a6aa8', lip2: '#04060c', sp: 60, vp: [240, 120], rows: [-12, 6, 26] });
      speck(g, -M, 216, w, 54, ['#1c2638', '#0c1220', '#2a3650'], 300, 62);
      for (let x = -M + 20; x < AW + M; x += 120) { R(g, x, 248, 54, 3, '#6a5a18'); R(g, x + 54, 248, 3, 18, '#6a5a18'); }
      ring(g, 240, 244, 30, '#3a4a70'); ring(g, 240, 244, 29, '#222c44'); R(g, 236, 238, 2, 12, '#3a4a70'); R(g, 242, 238, 2, 12, '#3a4a70'); R(g, 236, 243, 8, 2, '#3a4a70');
      for (const [x, y, rx, ry] of [[60, 252, 34, 7], [400, 250, 40, 8], [250, 262, 60, 6]]) { pool(g, '#04060c', x, y, rx, ry, 0.7); pool(g, '#3a78e0', x, y, rx * 0.8, ry * 0.8, 0.28); pool(g, '#e0509a', x + rx * 0.3, y, rx * 0.4, ry * 0.7, 0.3); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; for (const x of [-14, 470]) { R(g, x, 0, 24, AH, '#04060c'); R(g, x + (x < 0 ? 22 : 0), 0, 2, AH, '#3a78c8'); R(g, x, 60, 24, 4, '#0a1020'); R(g, x, 170, 24, 4, '#0a1020'); } }
    l.mist = fogTex(480, 70, '#6a8ad0', 0.8, 101, 30);
  },
  paint(g, t, cam, A) {
    const l = A.l, ln = lightning(t, 470, 150); put(g, l.sky, cam);
    if (ln.v > 0) { g.save(); g.translate(off(cam, 0.08), 0); g.fillStyle = rgba('#b8c8ff', ln.v * 0.3); g.fillRect(-60, 0, AW + 120, 200); const bx = 160 + hash1(ln.c) * 220; bolt(g, bx, 0, bx + (hash1(ln.c + 7) - 0.5) * 80, 170, ln.c * 13 + 5, ln.age < 14 ? '#f0f4ff' : 'rgba(200,215,255,0.4)', ln.age < 14 ? 'rgba(90,140,255,0.35)' : null); g.restore(); }
    put(g, l.far, cam);
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.4), 0);
    const f = 0.7 + 0.3 * flick(t, 3, 5), neon = ((t % 400) < 8 && ((t >> 1) & 1)) ? 0.35 : 1;
    textC(g, 'SHIP IT', 347, 104, rgba('#ff5ac8', neon), 2, 1); textC(g, 'SHIP IT', 347, 104, rgba('#ffd0f0', 0.5 * neon), 2, 1); glow(g, '#ff2aa8', 347, 110, 60, 0.38 * f * neon, 22);
    for (let k = 0; k < 2; k++) { const a = Math.sin(t * 0.012 + k * 3.1) * 0.5 + (k ? 0.3 : -0.3), rx = 92 + (k ? 6 : -6); const x1 = rx + Math.sin(a) * 120, y1 = 214 - Math.cos(a) * 190; g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(k ? '#ffe0a0' : '#80b8ff', 0.07); fpoly(g, [rx - 2, 214, rx + 2, 214, x1 + 14, y1, x1 - 14, y1]); g.globalCompositeOperation = 'source-over'; }
    glow(g, '#ff7a2a', 92, 216, 28, 0.4 * flick(t, 8), 10); if ((t >> 4) & 1) R(g, 92, 84, 1, 2, '#ff3b30');
    for (let k = 0; k < 6; k++) { const u = (t * 0.6 + k * 17) % 90, s = 4 + u / 12; g.fillStyle = rgba('#9aa6c2', 0.2 * (1 - u / 90)); g.fillRect(Math.round(92 + Math.sin(u * 0.09 + k * 2) * (3 + u / 9) - s / 2), Math.round(214 - u * 0.5), Math.round(s), Math.round(s)); }
    g.restore();
    put(g, l.near, cam);
    g.save(); g.translate(off(cam, 0.6), 0); for (const [x, y] of l.blink) if (((t + x * 7) % 70) < 28) { R(g, x, y - 1, 1, 2, '#ff3b30'); glow(g, '#ff3b30', x, y, 7, 0.6); } g.restore();
    put(g, l.floor, cam);
    g.save(); g.translate(off(cam, 1), 0);
    for (let k = 0; k < 14; k++) { const x = 30 + hash1(k * 17) * 420, y = 242 + hash1(k * 5 + 1) * 24, u = (t * 0.7 + k * 31) % 40; if (u < 18) { const rr = 1 + u * 0.3; g.fillStyle = rgba('#9ac0ff', 0.55 * (1 - u / 18)); g.fillRect(Math.round(x - rr * 2), Math.round(y), Math.round(rr * 4), 1); } }
    glow(g, '#4fb8ff', 240, AG + 2, 230, 0.05, 14);
    if (ln.v > 0) { g.fillStyle = rgba('#b8c8ff', ln.v * 0.12); g.fillRect(-60, 205, AW + 120, 70); }
    g.restore();
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.mist, t, 0.3, 190, 0.2, cam.x * 0.3); put(g, l.fg, cam);
    g.fillStyle = 'rgba(170,200,255,0.5)'; for (let k = 0; k < 140; k++) { const sp = 2.6 + hash1(k * 3) * 1.8, x = ((hash1(k * 7) * 560 - t * sp * 0.35) % 560 + 560) % 560 - 40, y = ((hash1(k * 11 + 1) * 300 + t * sp) % 300) - 14; g.fillRect(Math.round(x), Math.round(y), 1, 4); g.fillRect(Math.round(x) + 1, Math.round(y) - 2, 1, 2); } } });

// ======================================================================================
// 9. POTATO WASTELAND - dust under a black eclipse; a giant petrified potato, windmill, scarecrow and crows
// ======================================================================================
function stalk(g, x, base, h, col, r) { line(g, x, base, x + (r() - 0.5) * 6, base - h, col, 1); for (let i = 0; i < 3; i++) { const y = base - h * (0.3 + i * 0.25), d = (i & 1) ? -1 : 1; line(g, x + (r() - 0.5) * 2, y, x + d * (3 + r() * 4), y - 4 - r() * 3, col, 1); } }
const wasteland = def({ id: 'wasteland', name: 'POTATO WASTELAND', tagline: 'THE LAST HARVEST', accent: '#e8b84a',
  build(A) {
    const l = A.l;
    l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M; fill(l.sky, [[0, '#140a06'], [0.4, '#3a1c0c'], [0.75, '#8a4a18'], [1, '#c8862a']], { q: 6 });
      const r = rng(71); for (let i = 0; i < 12; i++) { const x = -M + r() * w, y = 14 + r() * 120, ww = 60 + r() * 120; g.drawImage(grad(ww, 5, [[0, '#2a1208', 0], [0.5, '#2a1208', 0.8], [1, '#2a1208', 0]], { L: 6 }), x, y); }
      glow(g, '#ffb02a', 370, 62, 90, 0.5, 90); disc(g, 370, 62, 25, 25, '#ffd070'); ring(g, 370, 62, 28, '#ffe8a0'); disc(g, 373, 62, 24, 24, '#050302');
      ridge(g, 180, 30, 77, '#4a2410', { jag: 0.4 }); ridge(g, 196, 22, 78, '#341808', { jag: 0.4 });
    }
    l.far = layer(0.25); { const { g } = l.far; const px = 124, py = 186;
      g.fillStyle = '#2a1608'; for (const [dx, dy, rx, ry] of [[0, 0, 74, 50], [-34, 14, 36, 30], [38, 10, 40, 34], [-8, -26, 38, 24], [30, -22, 30, 20]]) disc(g, px + dx, py + dy, rx, ry, '#4a2c14');
      for (const [dx, dy, rx, ry] of [[-14, -10, 54, 30], [-20, -14, 36, 18]]) disc(g, px + dx, py + dy, rx, ry, '#5e3a1c'); disc(g, px - 26, py - 22, 16, 8, '#6a4420');
      const r = rng(90); for (let i = 0; i < 40; i++) { const a = r() * TAU, d = 20 + r() * 45; R(g, px + Math.cos(a) * d * 1.3, py + Math.sin(a) * d * 0.8, 2, 1, '#2a1608'); }
      for (const [dx, dy] of [[-22, -8], [18, 6], [-6, 22], [40, -14], [-48, 10], [8, -22]]) { disc(g, px + dx, py + dy, 5, 3, '#7a5228'); disc(g, px + dx, py + dy + 1, 4, 2, '#140a04'); disc(g, px + dx, py + dy, 2, 1, '#2a1608'); line(g, px + dx, py + dy - 2, px + dx + 2, py + dy - 11, '#1a0e06', 1); line(g, px + dx + 2, py + dy - 11, px + dx - 2, py + dy - 17, '#1a0e06', 1); }
      line(g, px - 10, py - 40, px + 4, py - 22, '#1a0e06'); line(g, px + 4, py - 22, px - 2, py - 8, '#1a0e06'); line(g, px + 30, py - 36, px + 22, py - 14, '#1a0e06');
      R(g, px - 74, 212, 148, 4, '#2a1608'); R(g, px - 56, py + 40, 112, 6, '#1a0e06');
    }
    l.mid = layer(0.4); { const { g, M } = l.mid, w = AW + 2 * M;
      // windmill tower (blades drawn in paint)
      poly(g, [368, 214, 374, 140, 396, 140, 402, 214], '#2a1608'); poly(g, [368, 214, 374, 140, 378, 140, 374, 214], '#6a4220'); poly(g, [372, 140, 385, 124, 398, 140], '#1a0e06'); R(g, 380, 190, 10, 24, '#0e0804'); R(g, 382, 160, 6, 8, '#0e0804');
      for (let x = -M; x < AW + M; x += 7) { const h = 2 + hash1(x) * 5; R(g, x, 214 - h, 2, h, '#341808'); }
      // dead crop rows converging
      const r = rng(5); for (let k = -8; k <= 8; k++) { const xb = 240 + k * 58, xt = 240 + k * 16; line(g, xt, 200, xb, 214, '#1a0e06', 1); for (let y = 202; y < 214; y += 3) if (r() < 0.8) stalk(g, xt + (xb - xt) * (y - 200) / 14, y, 5 + (y - 200) * 0.8, '#3a2210', r); }
    }
    l.near = layer(0.5); { const { g } = l.near; const sx = 238;   // scarecrow
      R(g, sx - 1, 142, 3, 72, '#1a0e06'); R(g, sx - 22, 156, 44, 3, '#1a0e06'); poly(g, [sx - 8, 150, sx - 6, 162, sx + 6, 162, sx + 8, 150, sx + 4, 144, sx - 4, 144], '#24140a'); R(g, sx - 10, 142, 20, 2, '#1a0e06'); R(g, sx - 6, 132, 12, 10, '#1a0e06'); disc(g, sx, 150, 6, 6, '#6a4a2a'); R(g, sx - 3, 148, 2, 2, '#0e0804'); R(g, sx + 2, 148, 2, 2, '#0e0804'); R(g, sx - 2, 153, 4, 1, '#0e0804');
      for (const [x, y] of [[-10, -1]]) R(g, sx - 22, 159, 2, 10, '#1a0e06'), R(g, sx + 20, 159, 2, 10, '#1a0e06'), R(g, sx - 24, 168, 6, 2, '#6a4a2a'), R(g, sx + 20, 168, 6, 2, '#6a4a2a');
      R(g, 36, 182, 2, 32, '#1a0e06'); R(g, 28, 188, 18, 2, '#1a0e06'); for (let x = 28; x < 46; x += 3) R(g, x, 186, 1, 2, '#6a4a2a'); }
    l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
      floorBase(l.floor, { y0: 214, top: '#2a1608', mid: '#4a2a12', bot: '#2a160a', fade: '#341a0a', line: '#140a04', line2: '#6a4420', lip: '#c8862a', lip2: '#140a04', sp: 70, vp: [240, 110], rows: [-8, 8] });
      speck(g, -M, 216, w, 54, ['#5a3414', '#3a2008', '#7a4e20', '#241206'], 360, 81);
      const r = rng(66); for (let i = 0; i < 30; i++) { let x = -M + r() * w, y = 216 + r() * 52; for (let s = 0; s < 4; s++) { const nx = x + (r() - 0.5) * 16, ny = y + (r() - 0.3) * 6; line(g, x, y, nx, ny, '#140a04', 1); x = nx; y = ny; } }
      for (let i = 0; i < 14; i++) { const x = -M + r() * w, y = 222 + r() * 42; disc(g, x, y, 4, 3, '#2a1608'); R(g, x - 2, y - 2, 3, 1, '#6a4220'); R(g, x + 1, y, 1, 1, '#140a04'); }
    }
    l.fg = layer(1.25); { const { g } = l.fg; const r = rng(44); for (const x0 of [-4, 14, 28, 454, 470, 486]) stalk(g, x0, 272, 90 + r() * 70, '#120804', r); R(g, 440, 150, 3, 122, '#120804'); line(g, 440, 164, 500, 172, '#120804', 1); line(g, 440, 178, 500, 184, '#120804', 1); }
    l.dust = fogTex(480, 80, '#c8862a', 1, 111, 30); l.dust2 = fogTex(480, 60, '#8a5a24', 1, 112, 26);
  },
  paint(g, t, cam, A) {
    const l = A.l; put(g, l.sky, cam);
    g.save(); g.translate(off(cam, 0.08), 0); const pu = 0.85 + 0.15 * Math.sin(t * 0.03); glow(g, '#ffb02a', 370, 62, 70, 0.35 * pu, 70); disc(g, 373, 62, 24, 24, '#050302');
    for (let k = 0; k < 5; k++) { const u = (t * 0.45 + k * 90) % 640, x = -20 + u + k * 7, y = 44 + k * 6 + Math.sin(u * 0.04 + k) * 6 + (k & 1) * 10; if (x > -10 && x < 500) { const wy = ((t >> 3) + k) & 1 ? -2 : 2; line(g, x - 4, y + wy, x, y, '#0a0504'); line(g, x, y, x + 4, y + wy, '#0a0504'); R(g, x, y, 1, 1, '#0a0504'); } }
    g.restore();
    fogDraw(g, l.dust2, t, 0.1, 140, 0.25, cam.x * 0.1);
    put(g, l.far, cam);
    put(g, l.mid, cam);
    g.save(); g.translate(off(cam, 0.4), 0); const a = t * 0.012;   // windmill blades
    for (let k = 0; k < 4; k++) { const an = a + k * Math.PI / 2, c = Math.cos(an), s = Math.sin(an); line(g, 385, 132, 385 + c * 46, 132 + s * 46, '#140a04', 2); fpoly(g, [385 + c * 12 - s * 0, 132 + s * 12, 385 + c * 44 - s * 7, 132 + s * 44 + c * 7, 385 + c * 44 - s * 1, 132 + s * 44 + c * 1, 385 + c * 12, 132 + s * 12 + 2], '#2a1608'); }
    disc(g, 385, 132, 3, 3, '#6a4220');
    const u = (t * 0.7) % 900 - 40, tx = u, ty = 206 - Math.abs(Math.sin(t * 0.08)) * 6; if (u > -30 && u < 520) { disc(g, tx, ty, 6, 5, '#3a2008'); R(g, tx - 3 + Math.round(Math.cos(t * 0.1) * 3), ty - 2, 2, 1, '#8a5a24'); R(g, tx + Math.round(Math.sin(t * 0.1) * 3), ty + 1, 1, 1, '#140a04'); }
    g.restore();
    put(g, l.near, cam);
    g.save(); g.translate(off(cam, 0.5), 0); const sw = Math.sin(t * 0.05) * 2;   // scarecrow rags
    for (const [dx, h] of [[-5, 14], [0, 18], [5, 12]]) { const x = 238 + dx; poly(g, [x - 1, 162, x + 1, 162, x + 2 + sw * (h / 14), 162 + h, x - 1 + sw * (h / 14), 162 + h - 2], '#2a1608'); }
    for (let k = 0; k < 3; k++) { const x = 216 + sw * 0.5 + k * 3; line(g, 214, 158, 212 + sw, 168 + k * 3, '#3a2210'); } if (((t / 90) | 0) % 5 !== 2) { R(g, 252, 154, 4, 3, '#040202'); R(g, 255, 153, 2, 2, '#040202'); R(g, 256, 154, 2, 1, '#c8862a'); }
    g.restore();
    put(g, l.floor, cam);
    fogDraw(g, l.dust, t, 0.35, 196, 0.22, cam.x * 0.3);
  },
  front(g, t, cam, A) { const l = A.l; fogDraw(g, l.dust, t, 0.55, 208, 0.18, 90 + cam.x * 0.3); fogDraw(g, l.dust2, t, 0.8, 226, 0.16, 300); put(g, l.fg, cam); motes(g, t, 42, 9, 0, AW, 60, AH, 'rgba(232,184,74,0.45)', -0.5, 1, 4); } });

const list = [gpupit, cathedral, bridge, furnace, forest, temple, graveyard, rooftop, wasteland];
// Extension point for arenas2.js (docs/ARCHITECTURE.md): ARENAS.make(o) builds an entry from the same description the nine above use, ARENAS.kit is the painter's kit they share
// (half-res canvas size AW x AH, the walking line AG, drawing and noise helpers). A new stage is ARENAS.push(ARENAS.make({ id, name, tagline, accent, build(A), paint(g, t, cam, A), front? })).
list.make = def;
list.kit = { AW, AH, AG, TAU, hash1, rng, rgb, mix, rgba, clamp, flick, cv, grad, layer, off, put, fill, R, line, disc, ring, poly, box, fpoly, speck, ridge, text, tw, textC, glow, pool, fogTex, fogDraw, flame, chain, motes, lightning, bolt, floorBase };
return list;
})();

function drawArena(ctx, i, t, cam) { const n = ARENAS.length; ARENAS[((i % n) + n) % n].draw(ctx, t, cam); }
function drawArenaFront(ctx, i, t, cam) { const n = ARENAS.length, a = ARENAS[((i % n) + n) % n]; if (a.front) a.front(ctx, t, cam); }
function drawArenaThumb(ctx, i, x, y, w, h, t) { const n = ARENAS.length; ARENAS[((i % n) + n) % n].thumb(ctx, x, y, w, h, t); }
function prewarmArenas() { for (const a of ARENAS) a._ensure(true); }
