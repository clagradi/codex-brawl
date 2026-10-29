// ===== sprites.js: chibi "pet" fighters, rasterised at load time =====
// Every fighter is drawn from scratch with shaded vector-ish primitives (ellipses, capsules, polygons) onto a pixel
// buffer, so the output is crisp pixels with 4-5 tone cel shading, light from the top-left and a dark tinted outline.
// Each fighter gets one sprite sheet (rows = animations, columns = frames), plus a bust canvas for portraits.
// Nothing is traced or copied from any game or pet site; open tools/sheet-view.html?id=tibo to inspect a sheet.

const FW = 96, FH = 104, FEET = 100;   // frame size in sprite pixels, ground row
const PX = 2;                          // on-screen size of one sprite pixel
const INK = '#150c1f';
// animation rows: name, frame count, ticks per frame (0 = frame chosen by the game's attack timeline)
const ANIMS = [
  { n: 'idle', f: 6, t: 9 }, { n: 'walk', f: 8, t: 5 }, { n: 'jump', f: 4, t: 0 },
  { n: 'punch', f: 5, t: 0 }, { n: 'kick', f: 5, t: 0 }, { n: 'special', f: 6, t: 0 }, { n: 'super', f: 8, t: 0 },
  { n: 'block', f: 2, t: 10 }, { n: 'hit', f: 3, t: 0 }, { n: 'ko', f: 5, t: 0 }, { n: 'win', f: 6, t: 7 },
];
const ANIM_ROW = Object.fromEntries(ANIMS.map((a, i) => [a.n, i]));
const MAXF = Math.max(...ANIMS.map(a => a.f));

// ---------- colour helpers ----------
const colCache = {};
function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mix(c, to, k) { // blend colour c towards 'to' (another hex) by k
  const key = c + to + k; if (colCache[key]) return colCache[key];
  const a = hex2rgb(c), b = hex2rgb(to);
  return colCache[key] = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
// a material ramp: highlight, light, base, shade, deep shade, outline. Shadows are hue-shifted towards 'tint'.
const rampCache = {};
function R(base, tint = '#3a2a78') {
  const key = base + tint; if (rampCache[key]) return rampCache[key];
  const sh = mix(base, tint, 0.38);
  return rampCache[key] = { hi: mix(base, '#fff6df', 0.5), lt: mix(base, '#fff6df', 0.22), md: base, sh, dp: mix(sh, '#120a1e', 0.32), ol: mix(base, INK, 0.82) };
}
const flatCache = {};
function flat(c) { return flatCache[c] || (flatCache[c] = { hi: c, lt: c, md: c, sh: c, dp: c, ol: c }); }
const dimCache = new Map();
function dim(r, k = 0.26, to = '#1a0e2c') { // darker copy of a ramp, used for the far-side limbs ('to' is the colour it darkens towards)
  const key = r.md + k + to; let o = dimCache.get(key); if (o) return o;
  o = {}; for (const n in r) o[n] = mix(r[n], to, k); dimCache.set(key, o); return o;
}
const pick = (Rm, v) => v > 0.6 ? Rm.hi : v > 0.3 ? Rm.lt : v > -0.12 ? Rm.md : v > -0.78 ? Rm.sh : Rm.dp;

// ---------- shapes: bounding box, coverage test and a light value (top-left lit) ----------
const LV = (u, v) => -(0.62 * u + 0.78 * v) - 0.3 * (u * u + v * v);
function sEll(cx, cy, rx, ry, jag = 0, fr = 13) {
  const m = 1 + jag;
  return {
    x0: cx - rx * m - 1, y0: cy - ry * m - 1, x1: cx + rx * m + 1, y1: cy + ry * m + 1,
    test: (x, y) => { const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v; if (!jag) return d <= 1; const l = 1 + jag * Math.sin(Math.atan2(v, u) * fr); return d <= l * l; },
    val: (x, y) => LV((x - cx) / rx, (y - cy) / ry),
  };
}
function sCap(ax, ay, bx, by, r0, r1) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, rm = Math.max(r0, r1) + 1;
  const near = (x, y) => { let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return [ax + dx * t, ay + dy * t, r0 + (r1 - r0) * t]; };
  return {
    x0: Math.min(ax, bx) - rm, y0: Math.min(ay, by) - rm, x1: Math.max(ax, bx) + rm, y1: Math.max(ay, by) + rm,
    test: (x, y) => { const [qx, qy, r] = near(x, y); return (x - qx) * (x - qx) + (y - qy) * (y - qy) <= r * r; },
    val: (x, y) => { const [qx, qy, r] = near(x, y); return LV((x - qx) / r, (y - qy) / r); },
  };
}
function sPoly(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1.5, (x1 - x0) / 2), ry = Math.max(1.5, (y1 - y0) / 2), n = pts.length;
  return {
    x0, y0, x1, y1,
    test: (x, y) => { let ins = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; },
    val: (x, y) => LV((x - cx) / rx, (y - cy) / ry),
  };
}
function sRR(cx, cy, hw, hh, rad) {
  return {
    x0: cx - hw - 1, y0: cy - hh - 1, x1: cx + hw + 1, y1: cy + hh + 1,
    test: (x, y) => { const dx = Math.max(Math.abs(x - cx) - (hw - rad), 0), dy = Math.max(Math.abs(y - cy) - (hh - rad), 0); return dx * dx + dy * dy <= rad * rad; },
    val: (x, y) => LV((x - cx) / hw, (y - cy) / hh),
  };
}
function sRing(cx, cy, r1, r2) { // annulus, r1 outer, r2 inner
  return { x0: cx - r1 - 1, y0: cy - r1 - 1, x1: cx + r1 + 1, y1: cy + r1 + 1, test: (x, y) => { const d = (x - cx) * (x - cx) + (y - cy) * (y - cy); return d <= r1 * r1 && d >= r2 * r2; }, val: (x, y) => LV((x - cx) / r1, (y - cy) / r1) };
}
const sAnd = (S, fn) => ({ ...S, test: (x, y) => S.test(x, y) && fn(x, y) });
function sUnion(list, val) { return { x0: Math.min(...list.map(s => s.x0)), y0: Math.min(...list.map(s => s.y0)), x1: Math.max(...list.map(s => s.x1)), y1: Math.max(...list.map(s => s.y1)), test: (x, y) => list.some(s => s.test(x, y)), val }; }

// ---------- pixel buffer ----------
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = c; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  // fill a shape with a ramp: 1px part outline (o.ol = colour or false, o.soft = only over empty pixels), cel tones from the light value
  fill(S, Rm, o = {}) {
    const X0 = Math.floor(S.x0), Y0 = Math.floor(S.y0), X1 = Math.ceil(S.x1), Y1 = Math.ceil(S.y1), W = X1 - X0 + 3, Hh = Y1 - Y0 + 3, m = new Uint8Array(W * Hh);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (S.test(x + 0.5, y + 0.5)) m[(y - Y0 + 1) * W + x - X0 + 1] = 1;
    const ol = o.ol === undefined ? Rm.ol : o.ol, val = o.val || S.val;
    if (ol) for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) if (m[j * W + i]) for (const [a, b] of N4) if (!m[(j + b) * W + i + a]) { const x = X0 + i - 1 + a, y = Y0 + j - 1 + b; if (!o.soft || !this.get(x, y)) this.px(x, y, ol); }
    for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) if (m[j * W + i]) { const x = X0 + i - 1, y = Y0 + j - 1; this.px(x, y, o.flat ? Rm.md : pick(Rm, val(x + 0.5, y + 0.5))); }
  }
  // copy src rotated 90 degrees counter-clockwise: pixel (x, y) goes to (y + dx, src.w - 1 - x + dy)
  rotCCW(src, dx, dy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.c[y * src.w + x]; if (c) this.px(y + dx, src.w - 1 - x + dy, c); } }
  bounds() { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < this.c.length; i++) if (this.c[i]) { const x = i % this.w, y = (i / this.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; }
  writeTo(img, dx, dy) { // into ImageData
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.c[y * this.w + x]; if (!c) continue; const [r, g, b] = hex2rgb(c); const o = ((dy + y) * img.width + dx + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
  }
}
function canvasOf(pix) { const cv = document.createElement('canvas'); cv.width = pix.w; cv.height = pix.h; const c2 = cv.getContext('2d'), img = c2.createImageData(pix.w, pix.h); pix.writeTo(img, 0, 0); c2.putImageData(img, 0, 0); return cv; }

// head-local drawing helper: origin (x, y), scale k (1 in sprites, bigger on busts)
function H_(P, x, y, k) {
  return {
    P, x, y, k,
    e(dx, dy, rx, ry, Rm, o) { P.fill(sEll(x + dx * k, y + dy * k, rx * k, ry * k, o && o.jag, o && o.fr), Rm, o); },
    c(ax, ay, bx, by, r0, r1, Rm, o) { P.fill(sCap(x + ax * k, y + ay * k, x + bx * k, y + by * k, r0 * k, r1 * k), Rm, o); },
    p(pts, Rm, o) { P.fill(sPoly(pts.map(([a, b]) => [x + a * k, y + b * k])), Rm, o); },
    r(dx, dy, hw, hh, rad, Rm, o) { P.fill(sRR(x + dx * k, y + dy * k, hw * k, hh * k, rad * k), Rm, o); },
    ring(dx, dy, r1, r2, Rm, o) { P.fill(sRing(x + dx * k, y + dy * k, r1 * k, r2 * k), Rm, o); },
    l(ax, ay, bx, by, col, th = 1) { P.fill(sCap(x + ax * k + 0.5, y + ay * k + 0.5, x + bx * k + 0.5, y + by * k + 0.5, th * k * 0.5 + 0.02, th * k * 0.5 + 0.02), flat(col), { ol: false, flat: true }); },
    d(dx, dy, w, h, col) { P.rect(Math.floor(x + dx * k), Math.floor(y + dy * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), col); },
  };
}

// ---------- two-bone IK (sg: +1 bends clockwise on screen, so arms bend down/back and legs (-1) bend forward) ----------
function ik(ox, oy, tx, ty, L1, L2, sg) {
  const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy) || 0.001, dd = Math.min(L1 + L2 - 0.05, Math.max(Math.abs(L1 - L2) + 0.6, d));
  const ux = dx / d, uy = dy / d, a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd)))), c = Math.cos(sg * a), s = Math.sin(sg * a);
  return { e: [ox + L1 * (ux * c - uy * s), oy + L1 * (ux * s + uy * c)], t: [ox + ux * dd, oy + uy * dd] };
}

// ---------- the five characters ----------
const GOLD = R('#ffd86a', '#8a4a2a');
const LOOK = {
  tibo:   { kind: 'human', skin: '#f2c8a8', hair: '#4a2f24', top: '#33406c', hood: true, pants: '#2b3252', shoe: '#e8eef8', wrap: '#7cc7ff', belt: '#7cc7ff', acc: '#7cc7ff', long: false }, // swept quiff, navy hoodie, blue wraps
  poteto: { kind: 'human', skin: '#fbd9c4', hair: '#472a22', top: '#3c3744', pants: '#3b3046', shoe: '#f6e3a0', wrap: '#f6c544', belt: '#f6c544', acc: '#f6a23a', long: true }, // anime avatar: long straight hair, full fringe, round gold glasses, ^ ^ eyes
  dot:    { kind: 'blob',  body: '#f6d14a', tint: '#c67a1e', acc: '#ffe27a' },
  wang:   { kind: 'human', skin: '#ebc29c', hair: '#23212c', top: '#8d92a3', pants: '#3a3b4f', shoe: '#e8e8f0', wrap: '#b98cff', belt: '#b98cff', acc: '#b98cff', long: false }, // neat short black hair, calm narrow eyes, grey top
  muse:   { kind: 'plush', fur: '#f3dcd3', face: '#fbeadf', acc: '#7ef0ff' }, // cream-pink hooded plush: bead eyes, peach face oval, blush
};

// face features per character (head-local units: origin = face centre, face is 34 wide)
const FACE = {
  tibo:   { ex: 8, ey: 3.5, rx: 3.3, ry: 4.6, dark: '#1d1520', sh: 2, my: 10.5, mouth: 'grin', blush: '#ee9488', brow: '#3a2418', bt: 1.9 }, // warm open grin, dark brown brows
  poteto: { ex: 8, ey: 4, rx: 3.9, ry: 5, dark: '#2a1510', iris: '#a05c2c', sh: 2, my: 11, mouth: 'open', blush: '#ff8f9c', bl: [11.6, 10.4, 3.7, 2.1], brow: '#3a2420', bt: 1.4, glasses: true, happyEyes: true }, // ^ ^ eyes when calm, big open smile, pink blush, gold round glasses
  wang:   { ex: 8, ey: 3.9, rx: 2.9, ry: 2.5, dark: '#14121a', sh: 2, my: 11, mouth: 'flat', blush: null, brow: '#16141c', bt: 1.2, bup: 1.9, pip: 1, lid: 1 }, // narrow calm eyes, thin straight brows set high
  muse:   { ex: 6.6, ey: -1.2, rx: 2, ry: 2.2, dark: '#120d14', sh: 1, my: 5.8, mouth: 'tiny', ms: 0.9, blush: '#f5b3bd', bl: [7.4, 3.5, 2.7, 1.9], brow: null, bt: 1.2, pip: 1, abrow: '#8a5560' }, // small bead eyes with one glint, no brows unless angry
  dot:    { ex: 7.4, ey: 0, rx: 1.9, ry: 2.1, dark: '#17111d', sh: 1.5, my: 8.8, mouth: 'tiny', ms: 0.8, blush: '#f6b08a', bl: [11.6, 8.8, 2.6, 1.3], brow: null, bt: 1.2, pip: 1, specs: 6.3, lens: '#fde58a', abrow: '#17111d' },
};
const W_ = flat('#ffffff'), MOUTH = flat('#3b1620'), TONGUE = flat('#e5607a');
function face(H, F, ex, skin) {
  const sx = F.sh, my = F.my, bx = F.ex, dark = flat(F.dark), eyes = [-bx + sx, bx + sx];
  if (F.blush) { const [bd, by, brx, bry] = F.bl || [bx + 3.4, F.ey + 5.8, 3.4, 1.9]; for (const s of [-1, 1]) H.e(s * bd + sx * 0.7, by, brx, bry, flat(F.blush), { ol: false }); }
  if (skin && F.mouth !== 'tiny') H.e(sx + 1.2, F.ey + 4.8, 1.3, 0.9, skin, { ol: false, flat: true }); // nose smudge uses a ramp's md; recoloured below
  const angry = ex === 'a' || ex === 'o' || ex === 'g', pain = ex === 'p';
  if (F.specs) for (const x of eyes) H.e(x, F.ey, F.specs - 0.5, F.specs - 0.5, flat(F.lens), { ol: false, flat: true }); // glass tint behind the eyes
  eyes.forEach((x, i) => {
    const sd = i ? 1 : -1, y = F.ey;
    if (ex === 'k') { H.l(x - 3, y - 3, x + 3, y + 3, F.dark, 1.7); H.l(x + 3, y - 3, x - 3, y + 3, F.dark, 1.7); return; }
    if (F.happyEyes && (ex === 'n' || ex === 'w')) { const pts = [[-4, 2.2], [-2.8, 0], [-1.2, -1.5], [1.2, -1.5], [2.8, 0], [4, 2.2]]; for (let j = 1; j < pts.length; j++) H.l(x + pts[j - 1][0], y + pts[j - 1][1] + 0.6, x + pts[j][0], y + pts[j][1] + 0.6, F.dark, 1.9); return; } // happy closed-eye arcs
    if (ex === 'w') { H.l(x - 3.6, y + 1.5, x - 1.4, y - 1.2, F.dark, 1.8); H.l(x - 1.4, y - 1.2, x + 1.4, y - 1.2, F.dark, 1.8); H.l(x + 1.4, y - 1.2, x + 3.6, y + 1.5, F.dark, 1.8); return; }
    if (pain) { H.l(x - sd * 3.2, y - 3, x + sd * 2.2, y, F.dark, 1.8); H.l(x + sd * 2.2, y, x - sd * 3.2, y + 3, F.dark, 1.8); return; }
    if (ex === 'g') { H.l(x - 3.6, y - sd * 0.0 - 0.2, x + 3.6, y + 0.6, F.dark, 2.2); return; }
    const ry = angry ? F.ry * 0.78 : F.ry, cy = angry ? y + 0.9 : y;
    H.e(x, cy, F.rx, ry, dark, { ol: false, flat: true });
    if (F.lid) H.l(x - F.rx - 0.9, cy - ry + 0.3, x + F.rx + 0.9, cy - ry + 0.3, F.dark, 1.2); // heavy upper lid: calm, half-closed eyes
    if (F.iris) { H.e(x, cy + ry * 0.38, F.rx * 0.82, ry * 0.58, flat(F.iris), { ol: false, flat: true }); H.e(x, cy + ry * 0.52, F.rx * 0.45, ry * 0.3, flat('#2a1008'), { ol: false, flat: true }); }
    if (F.pip) { H.d(x - F.rx * 0.6, cy - ry * 0.6, 0.8, 0.8, '#ffffff'); return; } // dot eyes: a single pixel of shine
    H.d(x - F.rx * 0.62, cy - ry * 0.62, 2, 2, '#ffffff');
    H.d(x + F.rx * 0.34, cy + ry * 0.38, 1, 1, '#ffffff');
    if (F.glossy) H.d(x - F.rx * 0.62 + 2.1, cy - ry * 0.62 + 2.1, 1, 1, '#ffffff');
  });
  if (F.abrow && !F.specs && (ex === 'a' || ex === 'o')) eyes.forEach((x, i) => { const sd = i ? 1 : -1; H.l(x + sd * 3.4, F.ey - F.ry - 1.9, x - sd * 3, F.ey - F.ry + 0.7, F.abrow, 1.2); }); // brow-less fighters grow a short slanted lid when angry
  if (F.glasses) {
    const gold = R('#e8b84a', '#7a3a2a');
    for (const x of eyes) { H.ring(x, F.ey, 7.2, 5.9, gold, { ol: false }); H.l(x - 4.6, F.ey - 3.4, x - 2.2, F.ey - 5.2, '#ffffff', 1); H.d(x - 4.8, F.ey - 1.6, 1, 1, '#ffffff'); }
    H.l(eyes[0] + 7, F.ey - 1, eyes[1] - 7, F.ey - 1, '#e8b84a', 1.1); H.l(eyes[0] - 7, F.ey - 1, eyes[0] - 11, F.ey - 2, '#e8b84a', 1.1);
  }
  if (F.specs) { // thin round dark rims joined by a short bridge, a glint in each lens, angled lids when angry
    const S = F.specs, D = flat(F.dark);
    for (const x of eyes) { H.ring(x, F.ey, S, S - 1.3, D, { ol: false, flat: true }); H.l(x - 4.3, F.ey - 2.4, x - 3.3, F.ey - 3.8, '#ffffff', 0.9); }
    H.l(eyes[0] + S - 0.8, F.ey - 0.8, eyes[1] - S + 0.8, F.ey - 0.8, F.dark, 1.3);
    if (ex === 'a' || ex === 'o') eyes.forEach((x, i) => { const sd = i ? 1 : -1; H.l(x + sd * 5.6, F.ey - 4.6, x - sd * 4.4, F.ey - 2, F.abrow, 1.5); });
  }
  if (F.brow) {
    const t = angry ? 2.4 : pain ? -2.4 : ex === 'w' ? -1.2 : (ex === 'n' && F.mouth === 'grin' ? -0.4 : 0), by = F.ey - F.ry - (ex === 'w' ? 4 : 2.8) - (F.glasses ? 1 : 0) - (F.bup || 0) + (angry ? 1 : 0);
    if (ex !== 'k') eyes.forEach((x, i) => { const sd = i ? 1 : -1; H.l(x + sd * 4.4, by - (t > 0 ? 0.6 : 0), x - sd * 3.6, by + t, F.brow, F.bt); });
  }
  // mouth
  const m = F.mouth;
  if (F.ms) tinyMouth(H, ex, sx, my, F.ms);
  else if (ex === 'a' || ex === 'o') { const s = ex === 'o' ? 1.25 : 1; H.e(sx, my + 1, 4.2 * s, 3.2 * s, MOUTH, { ol: false, flat: true }); H.e(sx, my + 2.4 * s, 2.6 * s, 1.3 * s, TONGUE, { ol: false, flat: true }); H.l(sx - 3 * s, my - 1.6 * s, sx + 3 * s, my - 1.6 * s, '#ffffff', 1.2); }
  else if (ex === 'p') { H.e(sx, my + 1.4, 3.4, 2.6, MOUTH, { ol: false, flat: true }); H.e(sx, my + 2.6, 2, 1, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'k') { H.e(sx, my + 1.6, 3, 3.2, MOUTH, { ol: false, flat: true }); H.e(sx, my + 3.2, 2, 1.5, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'w') { H.p([[sx - 6.5, my - 2], [sx + 6.5, my - 2], [sx + 5, my + 2], [sx + 2.4, my + 4.6], [sx - 2.4, my + 4.6], [sx - 5, my + 2]], MOUTH, { ol: false, flat: true }); H.p([[sx - 5.6, my - 1.6], [sx + 5.6, my - 1.6], [sx + 4.6, my + 0.2], [sx - 4.6, my + 0.2]], W_, { ol: false, flat: true }); H.e(sx, my + 3.6, 2.4, 1.1, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'g') { H.d(sx - 5, my - 2, 10, 5, '#2a1018'); H.d(sx - 4, my - 1, 8, 3, '#ffffff'); H.d(sx - 1, my - 1, 1, 3, '#b8a8b8'); H.d(sx + 2, my - 1, 1, 3, '#b8a8b8'); }
  else if (m === 'grin') { H.p([[sx - 6.5, my - 1.5], [sx + 6.5, my - 1.5], [sx + 5, my + 2], [sx + 2.5, my + 4], [sx - 2.5, my + 4], [sx - 5, my + 2]], MOUTH, { ol: false, flat: true }); H.p([[sx - 5.6, my - 1.2], [sx + 5.6, my - 1.2], [sx + 4.6, my + 0.6], [sx - 4.6, my + 0.6]], W_, { ol: false, flat: true }); H.e(sx, my + 3, 2.4, 1, TONGUE, { ol: false, flat: true }); }
  else if (m === 'open') { H.p([[sx - 5.6, my - 1.4], [sx + 5.6, my - 1.4], [sx + 4.8, my + 1.8], [sx + 2.8, my + 3.8], [sx - 2.8, my + 3.8], [sx - 4.8, my + 1.8]], MOUTH, { ol: false, flat: true }); H.e(sx, my + 3, 3, 1.1, TONGUE, { ol: false, flat: true }); H.l(sx - 4.2, my - 0.8, sx + 4.2, my - 0.8, '#ffffff', 0.9); } // wide D-shaped smile with a tongue
  else if (m === 'smile') { H.l(sx - 3.6, my - 0.6, sx - 2, my + 1.2, '#8a3a3e', 1.4); H.l(sx - 2, my + 1.2, sx + 2, my + 1.2, '#8a3a3e', 1.4); H.l(sx + 2, my + 1.2, sx + 3.6, my - 0.6, '#8a3a3e', 1.4); }
  else if (m === 'flat') { H.l(sx - 3, my + 0.6, sx + 3, my + 0.6, '#8a4540', 1); H.d(sx + 3, my - 0.4, 1, 1, '#8a4540'); }
  else { H.l(sx - 2.4, my - 0.4, sx - 1.2, my + 1.1, '#5a2a30', 1.3); H.l(sx - 1.2, my + 1.1, sx + 1.2, my + 1.1, '#5a2a30', 1.3); H.l(sx + 1.2, my + 1.1, sx + 2.4, my - 0.4, '#5a2a30', 1.3); }
}

// very small mouth for the dots-style blob (s scales the open shapes)
function tinyMouth(H, ex, sx, my, s) {
  const C = '#4a2218';
  if (ex === 'a' || ex === 'o') { const z = (ex === 'o' ? 1.3 : 1) * s; H.e(sx, my + 0.8, 2.6 * z, 2.2 * z, MOUTH, { ol: false, flat: true }); H.e(sx, my + 1.9 * z, 1.4 * z, 0.8 * z, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'p') { H.e(sx, my + 1, 2.4 * s, 2 * s, MOUTH, { ol: false, flat: true }); H.e(sx, my + 1.8, 1.2 * s, 0.7 * s, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'k') { H.e(sx, my + 1.2, 2 * s, 2.4 * s, MOUTH, { ol: false, flat: true }); H.e(sx, my + 2.2, 1.2 * s, 0.9 * s, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'w') { H.p([[sx - 4 * s, my - 1], [sx + 4 * s, my - 1], [sx + 2.6 * s, my + 2.2 * s], [sx, my + 3.4 * s], [sx - 2.6 * s, my + 2.2 * s]], MOUTH, { ol: false, flat: true }); H.e(sx, my + 2.4 * s, 1.5 * s, 0.9 * s, TONGUE, { ol: false, flat: true }); }
  else if (ex === 'g') { H.d(sx - 3.2, my - 0.8, 6.4, 3, '#2a1018'); H.d(sx - 2.5, my - 0.1, 5, 1.4, '#ffffff'); }
  else { H.l(sx - 2.5, my - 0.4, sx - 1.2, my + 1, C, 1.1); H.l(sx - 1.2, my + 1, sx + 1.2, my + 1, C, 1.1); H.l(sx + 1.2, my + 1, sx + 2.5, my - 0.4, C, 1.1); }
}

// hair: back layer (behind the face) and front layer (fringe, clumps). hairMass fills ONE shaded blob (union of head-local ellipses) cut below a hairline curve, so the forehead stays open.
const edgeFn = pts => x => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = pts[i - 1], [c, d] = pts[i]; return b + (d - b) * (x - a) / (c - a); } return pts[pts.length - 1][1]; };
function hairMass(H, hr, parts, edge, o) {
  const k = H.k, S = sUnion(parts.map(([a, b, c, d]) => sEll(H.x + a * k, H.y + b * k, c * k, d * k)), (x, y) => LV((x - H.x) / (21 * k), (y - H.y + 9 * k) / (16 * k)));
  H.P.fill(sAnd(S, (x, y) => (y - H.y) / k <= edge((x - H.x) / k)), hr, o);
}
const HAIR = {
  tibo: { // short sides, a rounded swept fringe with a small quiff at the front
    back(H, hr) { H.e(0, -4, 19, 16.5, hr); },
    front(H, hr) {
      H.p([[-18.4, -6], [-14, -9.5], [-14.6, 0.5], [-17.6, 0.8]], hr); H.p([[18.4, -6], [14, -9.5], [14.6, 0.5], [17.6, 0.8]], hr); // short tapered sideburns
      hairMass(H, hr, [[-1, -10.5, 18, 9.8], [-1.5, -15.5, 14.5, 7.6], [9, -19, 9.5, 5.6]], edgeFn([[-20, -3], [-16, -7], [-10, -10], [-4, -8.8], [2, -6.6], [8, -5.4], [13, -6.2], [17, -9], [20, -5]]));
      const hi = hr.hi, sh = hr.sh; // strands sweep from the crown down and to the front
      H.l(-9.5, -17.5, -3.5, -10.5, sh, 1); H.l(-2, -20, 4.5, -11, sh, 1); H.l(5, -21, 11, -11.5, sh, 1);
      H.l(-13, -16, -7.5, -20.5, hi, 1.3); H.l(-5, -20.5, 2, -23, hi, 1.2); H.l(5, -23, 9.5, -24, hi, 1);
    },
  },
  poteto: { // long straight hair: full blunt fringe with soft points, long side locks past the shoulders
    back(H, hr, bust) { if (bust) H.r(0, 10, 21.5, 26, 8, hr); else H.e(0, -1, 19.8, 18.2, hr); },
    front(H, hr) {
      hairMass(H, hr, [[0, -9.5, 19.8, 10.5], [0, -14, 18.2, 7.6]], edgeFn([[-20, -7], [-17.5, -3.6], [-14, -1.3], [-9.5, -4.1], [-5.2, -1.2], [-1, -4.1], [3.2, -1.2], [7.4, -4.1], [11.4, -1.2], [15.4, -3.6], [17.6, -3.6], [20, -7]]));
      H.c(-17.4, -6, -18.4, 22, 3.9, 2.9, hr); H.c(17.4, -6, 18.4, 22, 3.9, 2.9, hr); // side locks framing the face
      H.p([[-21.2, 22], [-15.6, 22], [-18.4, 29.6]], hr); H.p([[21.2, 22], [15.6, 22], [18.4, 29.6]], hr); // straight cut tips
      const hi = R('#3a2420').hi, sh = hr.sh;
      for (const x of [-12.5, -4.5, 3.5, 11.5]) H.l(x, -12, x + 0.4, -3, sh, 1); // blunt strands down the fringe
      H.l(-18, 2, -18.3, 20, sh, 1); H.l(18, 2, 18.2, 20, sh, 1);
      H.p([[-12, -15.5], [-3, -18.5], [7, -17.5], [12.5, -13], [5, -14.5], [-4, -14], [-10, -12.5]], flat(hi), { ol: false, flat: true });
    },
  },
  wang: { // neat short black hair, a short fringe brushed slightly up and to the side
    back(H, hr) { H.e(0, -4.5, 18.4, 15.6, hr); },
    front(H, hr) {
      H.p([[-17.6, -6], [-13.5, -9.5], [-14.2, -1], [-17, -0.4]], hr); H.p([[17.6, -6], [13.5, -9.5], [14.2, -1], [17, -0.4]], hr);
      hairMass(H, hr, [[0, -12, 17.8, 8.8], [4, -17.2, 12.6, 6.2]], edgeFn([[-19, -2], [-15, -6.5], [-10, -9.5], [-6, -8], [-2, -10.4], [3, -8.4], [8, -10.4], [13, -8.4], [16, -9.5], [19, -3]]));
      const hi = hr.hi, sh = hr.sh;
      H.l(-8, -10, -4.5, -18, sh, 1); H.l(0, -10.5, 4.5, -19, sh, 1); H.l(7, -10.5, 11, -17.5, sh, 1);
      H.l(-12, -14, -6.5, -19.5, hi, 1.2); H.l(1, -20.5, 8, -22, hi, 1);
    },
  },
};

function drawHead(P, id, L, x, y, k, ex, bust) {
  const H = H_(P, x, y, k), sk = R(L.skin, '#b04a5e'), hr = R(L.hair, '#3a2a78'), F = FACE[id];
  HAIR[id].back(H, hr, bust);
  H.e(-17.2, 4, 2.7, 3.5, sk); H.e(17.2, 4, 2.7, 3.5, sk);
  H.e(0, 1, 17, 15.5, sk);
  if (id === 'tibo') for (const [a, b] of [[-9, 11], [-5, 13], [0, 14], [5, 13], [9, 11], [-12, 8], [12, 8], [-3, 15], [3, 15]]) H.d(a, b, 1, 1, sk.sh);
  H.d(F.sh + 1, F.ey + 4.6, 2, 1, sk.sh);
  face(H, F, ex, null);
  HAIR[id].front(H, hr, ex);
}

// ---------- body drawers (q = pose in absolute sprite coordinates) ----------
function drawHuman(P, L, q, id) {
  const sk = R(L.skin, '#b04a5e'), tp = R(L.top, '#2a2a7a'), pn = R(L.pants, '#2a1f7a'), sho = R(L.shoe, '#5a4a9a'), wr = R(L.wrap, '#3a2a78'), hr = R(L.hair, '#3a2a78');
  const [hx, hy] = q.hip, [sx, sy] = q.sh, [dx, dy] = q.hd;
  const arm = (shx, shy, hand, back) => {
    const T = back ? dim(tp) : tp, S = back ? dim(sk) : sk, Wr = back ? dim(wr) : wr, r = ik(shx, shy, hand[0], hand[1], 9.5, 9.5, 1);
    P.fill(sCap(shx, shy, r.e[0], r.e[1], 5.2, 4.5), T);
    P.fill(sCap(r.e[0], r.e[1], r.t[0], r.t[1], 4.1, 3.7), S);
    P.fill(sCap(r.e[0] + (r.t[0] - r.e[0]) * 0.34, r.e[1] + (r.t[1] - r.e[1]) * 0.34, r.t[0], r.t[1], 4.4, 4.2), Wr);
    P.fill(sEll(r.t[0], r.t[1], 4.9, 4.7), S);
    return r;
  };
  const leg = (ox, oy, foot, back) => {
    const Pn = back ? dim(pn) : pn, Sh = back ? dim(sho) : sho, r = ik(ox, oy, foot[0], foot[1], 11.5, 11.5, -1);
    P.fill(sCap(ox, oy, r.e[0], r.e[1], 6.3, 5.4), Pn);
    P.fill(sCap(r.e[0], r.e[1], r.t[0], r.t[1], 5.4, 4.7), Pn);
    P.fill(sEll(r.t[0] + 2.6, r.t[1] + 2.4, 6.8, 3.7), Sh);
    P.rect(r.t[0] - 2, r.t[1] + 5, 11, 1, back ? dim(sho).dp : sho.dp);
  };
  if (L.long) { // long straight hair falling behind the whole body, tips cut in soft points
    P.fill(sCap(dx - 1, dy + 4, hx - 3, hy - 6, 19, 14.5), hr);
    P.fill(sPoly([[hx - 17.5, hy - 14], [hx + 11, hy - 14], [hx + 10, hy - 3], [hx + 6, hy - 0.5], [hx + 2, hy - 3.5], [hx - 2, hy - 0.5], [hx - 6, hy - 3.5], [hx - 10, hy - 0.5], [hx - 14, hy - 3], [hx - 17.5, hy - 4]]), hr);
  }
  if (!q.armsFront) arm(sx - 10, sy + 3, q.bh, true);
  leg(hx - 5, hy, q.bf, true); leg(hx + 5, hy, q.ff, false);
  P.fill(sCap(sx, sy + 1, hx, hy - 8, 11.6, 10.6), tp);
  P.fill(sCap(hx - 9.5, hy - 3.2, hx + 9.5, hy - 3.2, 2.5, 2.5), wr);
  P.fill(sRR(hx + 2.5, hy - 3.2, 2.6, 2.6, 0.8), GOLD);
  if (L.hood) { // hoodie: a bulky collar under the chin and two drawstrings with tips
    P.fill(sEll(sx + 0.5, sy - 3.5, 10.8, 5, 0, 0), tp, { val: (x, y) => 0.4 });
    for (const o of [1.5, 5.5]) { P.fill(sCap(sx + o, sy + 1, sx + o - 0.4, sy + 8.5, 0.6, 0.6), flat('#dfe6f5'), { ol: false, flat: true }); P.px(sx + o - 0.5, sy + 9.2, wr.md); }
  }
  drawHead(P, id, L, dx, dy + 1, 1, q.ex, false);
  if (q.armsFront) arm(sx - 10, sy + 3, q.bh, false);
  const fa = arm(sx + 10.5, sy + 3, q.fh, false);
  return { hand: fa.t, hand2: null };
}

function eggShape(a, b, val) { return sUnion([a, b], val); }
// muse: a tall, very fluffy cream-pink hooded plush. Head and body are one soft blob under a tall dome; a smooth peach face oval sits low inside the hood.
const FARFUR = '#8a4658'; // far-side plush limbs darken towards a dusty rose, not the cold violet the humans use, so they stay fur-coloured
function plushInk(L) { const fur = { ...R(L.fur, '#b06a70') }; fur.ol = mix(fur.sh, INK, 0.5); return { fur, crm: R(L.face, '#d08a84') }; } // warm rose shadows, softer outline than the ink
function sFurCap(ax, ay, bx, by, r0, r1, jag = 0.06, fr = 10) { // capsule with a rippling, fuzzy edge for plush limbs
  const S = sCap(ax, ay, bx, by, r0 * (1 + jag), r1 * (1 + jag)), dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  S.test = (x, y) => { let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; const qx = ax + dx * t, qy = ay + dy * t, r = r0 + (r1 - r0) * t, l = 1 + jag * Math.sin(Math.atan2(y - qy, x - qx) * fr + t * 3); return (x - qx) * (x - qx) + (y - qy) * (y - qy) <= r * r * l * l; };
  return S;
}
const furTick = (P, x, y, c) => { P.px(x, y, c); P.px(x - 1, y - 1, c); P.px(x + 1, y - 1, c); }; // tiny v-shaped fluff mark
function plushHood(P, fur, crm, fx, fy, k) { // hood opening: shaded fur rim around a smooth peach oval
  P.fill(sEll(fx, fy, 16.4 * k, 14.2 * k, 0.035, 18), fur, { val: (x, y) => y < fy - 2 * k ? -0.45 : 0.05, ol: mix(fur.sh, INK, 0.12) });
  const S = sEll(fx, fy + 0.4 * k, 13.8 * k, 11.8 * k);
  P.fill(S, crm, { ol: false, val: (x, y) => Math.min(0.5, Math.max(-0.1, S.val(x, y) * 0.8)) });
}
function plushTufts(P, fur, cx, cy, rx, ry, xs, val) { for (const a of xs) { const e = cy - ry * Math.sqrt(1 - (a / rx) ** 2); P.fill(sEll(cx + a, e + 1, 4.2, 3.6, 0.12, 7), fur, { val, soft: true }); } } // round fur puffs poking over the dome
function drawPlush(P, L, q, id) {
  const { fur, crm } = plushInk(L);
  const [hx, hy] = q.hip, [sx, sy] = q.sh, [dx, dy] = q.hd;
  const bcx = dx * 0.65 + hx * 0.35, top = dy - 25, bot = hy + 11, cy = (top + bot) / 2, ry = (bot - top) / 2, rx = 24, val = (x, y) => LV((x - bcx) / rx, (y - cy) / ry) + 0.42;
  const egg = eggShape(sEll(dx + 0.5, dy - 0.5, 23, 24.5, 0.06, 15), sEll(bcx, hy - 8, 22.5, 19, 0.06, 13), val);
  const arm = (shx, shy, hand, back) => { // stubby mitten: one fuzzy capsule ending in a round paw, no fingers
    const F = back ? dim(fur, 0.2, FARFUR) : fur, tx = shx + (hand[0] - (sx + (back ? -10 : 10.5))) * 0.78, ty = shy + (hand[1] - (sy + 3)) * 0.78, r = ik(shx, shy, tx, ty, 6, 6, 1);
    const cap = sFurCap(shx, shy, r.t[0], r.t[1], 5.4, 5.2, 0.06, 10);
    P.fill(sUnion([cap, sEll(r.t[0], r.t[1], 5.9, 5.6, 0.07, 9)], cap.val), F);
    return r;
  };
  const leg = (ox, oy, foot, back, late) => { // very short stubby leg + round foot, fur-coloured; raised legs (kicks) are drawn over the belly
    const up = foot[1] < oy + 5; if (up !== !!late) return;
    const F = back ? dim(fur, 0.2, FARFUR) : fur; let tx = ox + (foot[0] - ox) * (up ? 0.9 : 0.62), ty = up ? oy + (foot[1] - oy) * 0.9 + 1 : foot[1] + 2.4;
    const d = Math.hypot(tx - ox, ty - oy), m = up ? 24 : 21; if (d > m) { tx = ox + (tx - ox) * m / d; ty = oy + (ty - oy) * m / d; }
    P.fill(sFurCap(ox, oy, tx, ty - (up ? 0 : 2.6), 5.6, 4.9, 0.06, 9), F);
    P.fill(sEll(tx + 2, ty, 6.2, 3.4, 0.05, 11), F);
  };
  if (!q.armsFront) arm(bcx - 19.5, sy + 8, q.bh, true);
  leg(hx - 6, hy + 3, q.bf, true); leg(hx + 6, hy + 3, q.ff, false);
  P.fill(egg, fur);
  plushTufts(P, fur, dx + 0.5, dy - 0.5, 23, 24.5, [-9, 1, 10], val);
  for (const [a, b] of [[-13, -15], [-6, -20], [-19, -6]]) furTick(P, dx + a, dy + b, fur.hi); // lit fluff on the dome
  for (const [a, b] of [[17, -12], [12, -16]]) furTick(P, dx + a, dy + b, fur.sh);
  for (const [a, b] of [[-8, 6], [4, 8], [12, 3], [-14, -3], [-1, -3]]) furTick(P, bcx + a, hy + b, fur.sh); // shaded fluff on the belly
  const fx = dx + 3, fy = dy + 5;
  plushHood(P, fur, crm, fx, fy, 1);
  face(H_(P, fx, fy, 1), FACE.muse, q.ex, null);
  leg(hx - 6, hy + 3, q.bf, true, true); leg(hx + 6, hy + 3, q.ff, false, true);
  if (q.armsFront) arm(bcx - 19.5, sy + 8, q.bh, false);
  arm(bcx + 19.5, sy + 8, q.fh, false);
}

// dots-style companion: a fuzzy round yellow pom-pom with round specs and a bow tie. Tufted edge = a sine ripple whose tips are |sin| cusps.
function furBall(P, Rm, cx, cy, rx, ry, n) {
  const S = sEll(cx, cy, rx, ry, 0.07), m = Math.round(rx * 0.78);
  S.test = (x, y) => { const u = (x - cx) / rx, v = (y - cy) / ry, a = Math.atan2(v, u), t = Math.abs(Math.sin(a * m + 1.6 * Math.sin(a * 5 + 0.7))), l = 1 + 0.075 * (0.5 - t) + 0.012 * Math.sin(a * 3); return u * u + v * v <= l * l; };
  const val = (x, y) => LV((x - cx) / rx, (y - cy) / ry) + 0.28;
  P.fill(S, Rm, { val });
  let sd = 20241; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296, tones = [Rm.dp, Rm.sh, Rm.md, Rm.lt, Rm.hi];
  for (let i = 0; i < n; i++) { // fluff flecks: radial 2px strokes one tone off the local cel band
    const a = rnd() * Math.PI * 2, d = 0.25 + Math.sqrt(rnd()) * 0.68, x = Math.floor(cx + Math.cos(a) * d * rx), y = Math.floor(cy + Math.sin(a) * d * ry), v = val(x + 0.5, y + 0.5);
    const k = v > 0.6 ? 4 : v > 0.3 ? 3 : v > -0.12 ? 2 : v > -0.78 ? 1 : 0, c = tones[Math.max(0, Math.min(4, k + (rnd() < (v > 0 ? 0.7 : 0.4) ? 1 : -1)))];
    if (k > 0 || c !== Rm.dp) { P.px(x, y, c); P.px(x + Math.round(Math.cos(a)), y + Math.round(Math.sin(a)), c); }
  }
}
function dotBow(H, x, y) { // tiny black bow tie: two triangles meeting at a knot
  const D = flat('#17111d'), o = { ol: false, flat: true };
  H.p([[x - 0.4, y], [x - 6.8, y - 3.5], [x - 6.8, y + 3.5]], D, o); H.p([[x + 0.4, y], [x + 6.8, y - 3.5], [x + 6.8, y + 3.5]], D, o);
  H.r(x, y, 1.7, 2.3, 0.7, flat('#2c2336'), o); H.d(x - 5.4, y - 1.6, 0.8, 0.8, '#4d4058');
}
function drawBlob(P, L, q, id) {
  const body = { ...R(L.body, L.tint) }; body.ol = mix(body.sh, INK, 0.6); // warm brown outline instead of near-black ink
  const [hx, hy] = q.hip, [sx, sy] = q.sh, [dx, dy] = q.hd;
  const bcx = dx * 0.65 + hx * 0.35, top = dy - 13, bot = hy + 10, cy = (top + bot) / 2, ry = (bot - top) / 2, rx = 30 + Math.max(0, 31 - ry) * 0.5;
  const arm = (shx, shy, hand, back) => {
    const F = back ? dim(body, 0.18) : body, tx = Math.min(FW - 7.5, shx + (hand[0] - (sx + (back ? -10 : 10.5))) * 0.72), ty = shy + (hand[1] - (sy + 3)) * 0.72, r = ik(shx, shy, tx, ty, 6.5, 6.5, 1);
    P.fill(sCap(shx, shy, r.t[0], r.t[1], 4.6, 4.2), F);
    P.fill(sEll(r.t[0], r.t[1], 4.6, 4.4, 0.08, 9), F);
    return r;
  };
  const leg = (ox, oy, foot, back) => {
    const up = foot[1] < oy + 8, sc = up ? 0.8 : 0.6, L = up ? 10.5 : 6.5, tx = ox + (foot[0] - ox) * sc, ty = oy + (foot[1] - oy) * sc + 1, r = ik(ox, oy, tx, ty, L, L, -1), F = back ? dim(body, 0.18) : body;
    P.fill(sCap(ox, oy, r.t[0], r.t[1], 5, 4.4), F);
    P.fill(sEll(r.t[0] + 2, r.t[1] + 1.8, 5.8, 3.4, 0.07, 11), F);
  };
  if (!q.armsFront) arm(bcx - 22, cy + 3, q.bh, true);
  leg(bcx - 7, bot - 3, q.bf, true); leg(bcx + 7, bot - 3, q.ff, false);
  furBall(P, body, bcx, cy, rx, ry, 70);
  const Hf = H_(P, bcx, cy - 9 - (ry - 31) * 0.3, 1.2);
  face(Hf, FACE.dot, q.ex, null); dotBow(Hf, FACE.dot.sh, FACE.dot.my + 6.6);
  if (q.armsFront) arm(bcx - 22, cy + 3, q.bh, false);
  arm(bcx + 22, cy + 3, q.fh, false);
}

// ---------- effects (in-frame) ----------
function star4(P, x, y, r, c1, c2) {
  P.fill(sPoly([[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]]), flat(c1), { ol: INK, flat: true });
  P.fill(sEll(x, y, r * 0.3, r * 0.3), flat(c2), { ol: false, flat: true });
}
function starburst(P, x, y, r, c1, c2) {
  const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.5 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]); }
  P.fill(sPoly(pts), flat(c1), { ol: INK, flat: true });
  const p2 = pts.map(([a, b]) => [x + (a - x) * 0.55, y + (b - y) * 0.55]); P.fill(sPoly(p2), flat(c2), { ol: false, flat: true });
}
function drawAura(P, cx, cy, lv, acc) {
  const A = R(acc, '#2a2a9a'), WB = 1.19, ph = lv * 1.7; // WB: the edge wobble can push the outline out to 1.19 x the radius
  const rx = Math.min(21 + lv * 4.5, (FW - 4) / 2 / WB), ry = Math.min(33 + lv * 3.4, (FEET + 1) / 2 / WB); // the glow stays inside the cell: shrink it, then nudge the centre
  cx = Math.max(2 + rx * WB, Math.min(FW - 2 - rx * WB, cx)); cy = Math.max(1 + ry * WB, Math.min(FEET + 2 - ry * WB, cy));
  const S = sEll(cx, cy, rx, ry);
  S.test = (x, y) => { const u = (x - cx) / rx, v = (y - cy) / ry, a = Math.atan2(v, u); return Math.sqrt(u * u + v * v) <= 1 + 0.12 * Math.sin(a * 7 + ph) + 0.07 * Math.sin(a * 13 - ph * 2); };
  const x0 = Math.floor(cx - rx * 1.3), x1 = Math.ceil(cx + rx * 1.3), y0 = Math.floor(cy - ry * 1.3), y1 = Math.ceil(cy + ry * 1.3);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!S.test(x + 0.5, y + 0.5)) continue; const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = Math.sqrt(u * u + v * v), chk = (x + y) & 1;
    P.px(x, y, d > 0.9 ? A.hi : d > 0.76 ? (chk ? '#ffffff' : A.lt) : d > 0.5 ? A.lt : A.md);
  }
}
function fxBack(P, L, q) { // motion streaks and swing arcs drawn behind the fighter
  for (const f of q.fx || []) {
    const kind = Array.isArray(f) ? f[0] : f;
    if (kind === 'trail') for (const j of [-5, 0, 5]) P.fill(sCap(q.fh[0] - 32 + Math.abs(j), q.fh[1] + j, q.fh[0] - 14 + Math.abs(j) * 0.5, q.fh[1] + j, 0.6, 1.5), flat('#ffffff'), { ol: false, flat: true });
    if (kind === 'kicktrail') {
      const ox = q.hip[0] + 4, oy = q.hip[1], rad = Math.hypot(q.ff[0] - ox, q.ff[1] - oy), a1 = Math.atan2(q.ff[1] - oy, q.ff[0] - ox);
      for (let i = 0; i <= 22; i++) { const a = a1 + (22 - i) * 0.06, x = ox + Math.cos(a) * (rad + 3), y = oy + Math.sin(a) * (rad + 3), r = 0.6 + i * 0.1; P.fill(sEll(x, y, r, r), flat(i > 15 ? '#ffffff' : '#bfe0ff'), { ol: false, flat: true }); }
    }
    if (kind === 'sweeptrail') for (const j of [-3, 0, 3]) P.fill(sCap(q.ff[0] - 30 + Math.abs(j) * 2, q.ff[1] + 4 + j, q.ff[0] - 11 + Math.abs(j), q.ff[1] + 4 + j, 0.6, 1.4), flat('#ffffff'), { ol: false, flat: true }); // streaks along the floor behind the foot
  }
}
function fxFront(P, L, q) {
  for (const f of q.fx || []) {
    const kind = Array.isArray(f) ? f[0] : f, e = Array.isArray(f) ? f[1] : 1, acc = L.acc || '#ffd23f';
    if (kind === 'impact') starburst(P, Math.min(q.fh[0] + 6, FW - 10), q.fh[1] - 1, 7, '#ffd23f', '#ffffff'); // the star stays whole inside the cell
    if (kind === 'burst') starburst(P, Math.min(q.fh[0] + 6, FW - 12), q.fh[1], 9, '#ffd23f', '#ffffff');
    if (kind === 'orb') {
      const mx = (q.fh[0] + q.bh[0]) / 2 + 8, my = (q.fh[1] + q.bh[1]) / 2 - 1, r = 3 + e * 6, A = R(acc, '#2a2a9a');
      P.fill(sEll(mx, my, r + 2.5, r + 2.5), flat(A.lt), { ol: false, flat: true, soft: true }); P.fill(sEll(mx, my, r, r), A, { ol: A.dp }); P.fill(sEll(mx - 0.5, my - 0.5, r * 0.5, r * 0.5), flat('#ffffff'), { ol: false, flat: true });
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + e * 2; P.px(mx + Math.cos(a) * (r + 5), my + Math.sin(a) * (r + 5), i % 2 ? '#ffffff' : A.hi); }
    }
    if (kind === 'sparkle') { star4(P, q.fh[0] + 6, q.fh[1] - 9, 4, '#ffe680', '#ffffff'); star4(P, q.bh[0] - 6, q.bh[1] - 12, 3, '#ffe680', '#ffffff'); star4(P, q.hd[0] + 20, q.hd[1] - 12, 3.5, '#ffe680', '#ffffff'); }
    if (kind === 'sweat') { const x = q.hd[0] + 18, y = q.hd[1] - 12; P.fill(sPoly([[x, y - 4], [x + 2.4, y], [x + 2.4, y + 2.4], [x, y + 4], [x - 2.4, y + 2.4], [x - 2.4, y]]), R('#7fd0ff', '#2a3a9a'), { ol: INK }); }
    if (kind === 'stars') for (let i = 0; i < 3; i++) { const a = e * 0.6 + i * 2.1; star4(P, q.hd[0] + Math.cos(a) * 17, q.hd[1] - 22 + Math.sin(a) * 4, 3.6, '#ffd23f', '#ffffff'); }
  }
}

function drawChar(P, id, q) {
  const L = LOOK[id];
  if (q.aura) drawAura(P, q.hip[0] * 0.5 + q.sh[0] * 0.5, q.hip[1] - 18, q.aura, L.acc);
  fxBack(P, L, q);
  (L.kind === 'human' ? drawHuman : L.kind === 'plush' ? drawPlush : drawBlob)(P, L, q, id);
  if (q.item === 'spud') drawSpud(P, q.fh[0] + 3, q.fh[1] - 6);
  fxFront(P, L, q);
}
function drawSpud(P, x, y) { // poteto's sweet potato
  const sk = R('#b8465c', '#4a1a6a'), fl = R('#ffd23f', '#c0602a');
  P.fill(sCap(x - 6, y + 1, x + 6, y - 1, 3.6, 4.6), sk); P.fill(sEll(x + 9.5, y - 1.6, 2.2, 3.2), fl, { ol: false });
  P.px(x - 2, y, sk.dp); P.px(x + 2, y - 2, sk.dp); P.px(x - 5, y + 3, sk.dp);
  P.fill(sPoly([[x + 6, y - 7], [x + 5, y - 11], [x + 8, y - 8]]), flat('#dfe8ff'), { ol: false, flat: true });
}

// ---------- pose rig (root-relative coordinates: x forward, y up is negative, ground = 0) ----------
const ST = { hip: [0, -24], sh: [1, -43], hd: [2, -63], fh: [17, -44], bh: [9, -41], ff: [12, -6], bf: [-11, -6], ex: 'n' };
const Q = o => ({ ...ST, ...o });
const TAU = Math.PI * 2, sn = Math.sin, cs = Math.cos;
const POSE = {
  idle: i => { const a = i / 6 * TAU, s = sn(a), c = cs(a); return Q({ hip: [0, -24 + s * 1.5], sh: [1, -43 + s * 2], hd: [2 + c * 0.6, -63 + s * 2.6], fh: [17 + c, -44 + c * 1.8], bh: [9 - c, -41 + s * 1.6], ff: [12 + s * 0.8, -6], bf: [-11 - s * 0.8, -6] }); },
  walk: i => { const a = i / 8 * TAU, s = sn(a), c = cs(a), b = cs(2 * a); return Q({ hip: [1, -24 + b * 1.3], sh: [2.6, -43 + b * 1.3], hd: [3.6, -63 + b * 1.6], fh: [17 + s * 1.5, -44 + b], bh: [9 - s, -41 - b], ff: [5 + 9 * s, -6 - 6 * Math.max(0, c)], bf: [-5 - 9 * s, -6 - 6 * Math.max(0, -c)] }); },
  jump: i => [
    Q({ hip: [0, -19], sh: [2, -37], hd: [4, -57], fh: [13, -31], bh: [4, -28], ff: [13, -6], bf: [-12, -6], ex: 'a' }),
    Q({ hip: [0, -27], sh: [1, -46], hd: [3, -66], fh: [20, -57], bh: [10, -54], ff: [9, -13], bf: [-5, -9], ex: 'a' }),
    Q({ hip: [0, -26], sh: [1, -45], hd: [2, -65], fh: [22, -48], bh: [-18, -50], ff: [10, -11], bf: [-5, -8], ex: 'o' }),
    Q({ hip: [0, -25], sh: [1, -44], hd: [2, -64], fh: [19, -58], bh: [-12, -56], ff: [11, -9], bf: [-8, -11], ex: 'n' }),
  ][i],
  punch: i => [
    Q({ hip: [-2, -24], sh: [-3, -43], hd: [-2, -63], fh: [5, -37], bh: [11, -47], ff: [13, -6], bf: [-12, -6], ex: 'a' }),
    Q({ hip: [0, -24], sh: [3, -43], hd: [5, -63], fh: [25, -44], bh: [10, -45], ff: [13, -6], bf: [-12, -6], ex: 'a', fx: ['trail'] }),
    Q({ hip: [2, -23], sh: [7, -43], hd: [10, -62], fh: [34, -45], bh: [9, -42], ff: [15, -6], bf: [-12, -6], ex: 'o', fx: ['trail', 'impact'] }),
    Q({ hip: [3, -23], sh: [8, -43], hd: [11, -62], fh: [35, -45], bh: [9, -42], ff: [16, -6], bf: [-12, -6], ex: 'o', fx: ['impact'] }),
    Q({ hip: [0, -24], sh: [3, -43], hd: [4, -63], fh: [22, -46], bh: [10, -43], ex: 'n' }),
  ][i],
  kick: i => [
    Q({ hip: [-2, -25], sh: [-4, -43], hd: [-4, -63], fh: [10, -48], bh: [-14, -43], ff: [13, -21], bf: [-10, -6], ex: 'a' }),
    Q({ hip: [-3, -25], sh: [-6, -43], hd: [-7, -63], fh: [12, -50], bh: [-18, -46], ff: [21, -31], bf: [-10, -6], ex: 'a' }),
    Q({ hip: [-4, -26], sh: [-8, -42], hd: [-9, -62], fh: [10, -52], bh: [-22, -48], ff: [28, -39], bf: [-9, -6], ex: 'o', fx: ['kicktrail'] }),
    Q({ hip: [-3, -25], sh: [-6, -42], hd: [-7, -62], fh: [11, -51], bh: [-20, -47], ff: [25, -34], bf: [-9, -6], ex: 'o', fx: ['kicktrail'] }),
    Q({ hip: [-1, -24], sh: [0, -43], hd: [0, -63], fh: [14, -47], bh: [4, -43], ff: [15, -19], bf: [-10, -6], ex: 'n' }),
  ][i],
  special: i => [
    Q({ hip: [-2, -22], sh: [-4, -41], hd: [-4, -61], fh: [-2, -36], bh: [-14, -34], ff: [13, -6], bf: [-12, -6], ex: 'a' }),
    Q({ hip: [-2, -22], sh: [-3, -41], hd: [-3, -61], fh: [13, -42], bh: [9, -40], ff: [13, -6], bf: [-12, -6], ex: 'a', fx: [['orb', 0.5]] }),
    Q({ hip: [0, -22], sh: [3, -41], hd: [5, -61], fh: [27, -44], bh: [22, -40], ff: [14, -6], bf: [-12, -6], ex: 'o', fx: [['orb', 1]] }),
    Q({ hip: [2, -21], sh: [7, -42], hd: [10, -62], fh: [33, -46], bh: [27, -42], ff: [16, -6], bf: [-13, -6], ex: 'o', fx: ['burst'] }),
    Q({ hip: [2, -22], sh: [6, -42], hd: [9, -62], fh: [31, -46], bh: [25, -42], ff: [15, -6], bf: [-12, -6], ex: 'a', fx: ['sparkle'] }),
    Q({ hip: [0, -24], sh: [2, -43], hd: [3, -63], fh: [18, -45], bh: [10, -42], ex: 'n' }),
  ][i],
  super: i => [
    Q({ hip: [0, -20], sh: [1, -38], hd: [2, -57], fh: [12, -26], bh: [-8, -25], ff: [13, -6], bf: [-12, -6], ex: 'a', aura: 1 }),
    Q({ hip: [0, -18], sh: [0, -35], hd: [1, -54], fh: [8, -23], bh: [-12, -23], ff: [14, -6], bf: [-13, -6], ex: 'a', aura: 2 }),
    Q({ hip: [0, -21], sh: [1, -40], hd: [2, -60], fh: [27, -41], bh: [-25, -41], ff: [13, -6], bf: [-12, -6], ex: 'o', aura: 2 }),
    Q({ hip: [0, -24], sh: [0, -44], hd: [0, -64], fh: [21, -57], bh: [-19, -56], ff: [12, -6], bf: [-11, -6], ex: 'o', aura: 3, fx: ['sparkle'] }),
    Q({ hip: [0, -25], sh: [0, -45], hd: [0, -65], fh: [22, -59], bh: [-20, -58], ff: [12, -6], bf: [-11, -6], ex: 'o', aura: 4, fx: ['sparkle'] }),
    Q({ hip: [3, -22], sh: [7, -42], hd: [10, -62], fh: [34, -47], bh: [26, -43], ff: [16, -6], bf: [-12, -6], ex: 'o', aura: 3, fx: ['burst'] }),
    Q({ hip: [2, -23], sh: [4, -43], hd: [6, -63], fh: [30, -58], bh: [-17, -57], ff: [14, -6], bf: [-11, -6], ex: 'o', aura: 4, fx: ['burst'] }),
    Q({ hip: [0, -24], sh: [2, -43], hd: [3, -63], fh: [18, -45], bh: [10, -42], ex: 'a', aura: 1 }),
  ][i],
  block: i => [
    Q({ hip: [-2, -20], sh: [-3, -37], hd: [-2, -55], fh: [10, -54], bh: [4, -51], ff: [11, -6], bf: [-12, -6], ex: 'g', armsFront: true }),
    Q({ hip: [-3, -20], sh: [-5, -37], hd: [-4, -55], fh: [8, -54], bh: [2, -50], ff: [10, -6], bf: [-13, -6], ex: 'g', armsFront: true }),
  ][i],
  hit: i => [
    Q({ hip: [-1, -24], sh: [-3, -43], hd: [-3, -63], fh: [17, -48], bh: [6, -44], ex: 'p' }),
    Q({ hip: [-3, -23], sh: [-8, -42], hd: [-11, -63], fh: [22, -53], bh: [-19, -47], ff: [11, -6], bf: [-13, -6], ex: 'p', fx: ['sweat'] }),
    Q({ hip: [-2, -22], sh: [-4, -40], hd: [-3, -59], fh: [12, -34], bh: [2, -32], ex: 'p', fx: ['sweat'] }),
  ][i],
  ko: i => [
    Q({ hip: [-4, -24], sh: [-9, -42], hd: [-14, -62], fh: [12, -52], bh: [-16, -50], ff: [10, -11], bf: [-6, -8], ex: 'p', fx: ['sweat'] }),
    Q({ hip: [0, -24], sh: [1, -43], hd: [2, -63], fh: [22, -50], bh: [-16, -48], ff: [13, -12], bf: [-4, -16], ex: 'p', lying: 1, lift: 18 }),
    Q({ hip: [0, -24], sh: [1, -43], hd: [2, -63], fh: [20, -52], bh: [-14, -50], ff: [14, -14], bf: [-2, -10], ex: 'k', lying: 1, lift: 6 }),
    Q({ hip: [0, -24], sh: [1, -43], hd: [2, -63], fh: [10, -22], bh: [-9, -22], ff: [10, -6], bf: [-7, -6], ex: 'k', lying: 1, lift: 0 }),
    Q({ hip: [0, -24], sh: [1, -43], hd: [2, -63], fh: [19, -30], bh: [-17, -30], ff: [11, -6], bf: [-9, -6], ex: 'k', lying: 1, lift: 0, fx: [['stars', 1]] }),
  ][i],
  win: i => { const h = [0, 1, 2, 3, 4, 5][i]; return [
    Q({ hip: [0, -22], sh: [0, -41], hd: [1, -61], fh: [18, -46], bh: [-6, -38], ex: 'w' }),
    Q({ hip: [0, -27], sh: [1, -47], hd: [2, -67], fh: [20, -63], bh: [-16, -61], ff: [10, -14], bf: [-9, -11], ex: 'w', fx: ['sparkle'] }),
    Q({ hip: [0, -24], sh: [1, -44], hd: [2, -64], fh: [21, -62], bh: [-17, -60], ex: 'w', fx: ['sparkle'] }),
    Q({ hip: [0, -23], sh: [1, -43], hd: [2, -63], fh: [19, -57], bh: [-16, -56], ex: 'w' }),
    Q({ hip: [0, -22], sh: [0, -41], hd: [1, -61], fh: [-8, -38], bh: [17, -64], ex: 'w' }),
    Q({ hip: [0, -26], sh: [1, -46], hd: [2, -66], fh: [21, -64], bh: [-15, -60], ff: [11, -10], bf: [-10, -13], ex: 'w', fx: ['sparkle'] }),
  ][h]; },
  // dedicated poses for moves the eleven rows only approximate. They are not sheet rows: buildSheets puts them in XSHEETS and drawSprite swaps them in for a live fighter
  throw: i => [
    Q({ hip: [1, -23], sh: [4, -42], hd: [7, -62], fh: [25, -47], bh: [20, -42], ff: [14, -6], bf: [-12, -6], ex: 'a' }),   // grab: both hands on the victim
    Q({ hip: [-1, -22], sh: [-1, -42], hd: [1, -62], fh: [16, -59], bh: [9, -56], ff: [13, -6], bf: [-13, -6], ex: 'a' }),  // lift
    Q({ hip: [-2, -21], sh: [-5, -42], hd: [-5, -62], fh: [9, -63], bh: [-3, -62], ff: [12, -6], bf: [-14, -6], ex: 'o' }), // overhead, leaning back
    Q({ hip: [3, -20], sh: [8, -38], hd: [12, -56], fh: [-1, -33], bh: [-13, -31], ff: [16, -6], bf: [-11, -6], ex: 'o' }), // slam: bows forward, arms swung down and back
    Q({ hip: [1, -23], sh: [3, -41], hd: [5, -61], fh: [14, -35], bh: [3, -31], ff: [14, -6], bf: [-11, -6], ex: 'n' }),    // let go
  ][i],
  low: i => [ // crouch jab: low fist at shin-to-waist height
    Q({ hip: [-3, -17], sh: [-5, -34], hd: [-4, -54], fh: [3, -27], bh: [-9, -29], ff: [13, -6], bf: [-14, -6], ex: 'a' }),
    Q({ hip: [-1, -16], sh: [1, -33], hd: [3, -53], fh: [28, -26], bh: [-6, -28], ff: [14, -6], bf: [-14, -6], ex: 'o', fx: ['trail', 'impact'] }),
    Q({ hip: [-1, -16], sh: [2, -33], hd: [4, -53], fh: [29, -26], bh: [-6, -28], ff: [14, -6], bf: [-14, -6], ex: 'o', fx: ['impact'] }),
    Q({ hip: [-2, -17], sh: [0, -34], hd: [1, -54], fh: [18, -27], bh: [-7, -29], ff: [13, -6], bf: [-14, -6], ex: 'a' }),
    Q({ hip: [-2, -21], sh: [-2, -39], hd: [-1, -59], fh: [12, -34], bh: [3, -32], ff: [12, -6], bf: [-12, -6], ex: 'n' }),
  ][i],
  sweep: i => [ // low leg sweep: the body drops and lunges, the front leg skims the floor
    Q({ hip: [-3, -19], sh: [-6, -37], hd: [-6, -57], fh: [6, -30], bh: [-10, -29], ff: [9, -6], bf: [-13, -6], ex: 'a' }),
    Q({ hip: [0, -16], sh: [-6, -34], hd: [-7, -54], fh: [8, -27], bh: [-15, -25], ff: [22, -7], bf: [-12, -6], ex: 'a' }),
    Q({ hip: [6, -14], sh: [-4, -32], hd: [-6, -52], fh: [8, -23], bh: [-17, -28], ff: [34, -9], bf: [-1, -6], ex: 'o', fx: ['sweeptrail'] }),
    Q({ hip: [4, -15], sh: [-4, -33], hd: [-6, -53], fh: [8, -24], bh: [-16, -28], ff: [30, -8], bf: [-2, -6], ex: 'o', fx: ['sweeptrail'] }),
    Q({ hip: [-1, -20], sh: [-1, -39], hd: [0, -59], fh: [10, -33], bh: [0, -32], ff: [14, -6], bf: [-10, -6], ex: 'n' }),
  ][i],
};

function renderFrame(id, anim, i) {
  const ps = POSE[anim](i), L = LOOK[id];
  if (id === 'poteto' && ((anim === 'special' && i <= 2) || anim === 'win')) ps.item = 'spud';
  const abs = o => { const q = { ...o }; for (const k of ['hip', 'sh', 'hd', 'fh', 'bh', 'ff', 'bf']) q[k] = [48 + o[k][0], FEET + o[k][1]]; return q; };
  const q = abs(ps), g = new Pix(FW, FH);
  if (ps.lying) {
    const tmp = new Pix(FW, FH), qq = { ...q, fx: null }; drawChar(tmp, id, qq);
    const rot = new Pix(112, 112); rot.rotCCW(tmp, 0, 0);
    const b = rot.bounds(), dx = Math.max(1 - b.x0, Math.min(94 - b.x1, Math.round(48 - (b.x0 + b.x1) / 2) - 2)), dy = FEET - (ps.lift || 0) - b.y1;
    for (let y = 0; y < rot.h; y++) for (let x = 0; x < rot.w; x++) { const c = rot.c[y * rot.w + x]; if (c) g.px(x + dx, y + dy, c); }
    if (ps.fx) { const hx = q.hd[1] + dx, hy = (FW - 1 - q.hd[0]) + dy; fxFront(g, L, { fx: ps.fx, hd: [hx, hy + 6], fh: [0, 0], bh: [0, 0] }); }
  } else drawChar(g, id, q);
  return g;
}

// ---------- busts (portraits) ----------
function drawBust(id) {
  const L = LOOK[id], P = new Pix(80, 80), k = 1.36, cx = 40, cy = 40;
  if (L.kind === 'human') {
    const tp = R(L.top, '#2a2a7a'), sk = R(L.skin, '#b04a5e');
    if (L.long) P.fill(sRR(cx, 58, 30, 35, 12), R(L.hair, '#3a2a78'));
    P.fill(sEll(cx, 90, 34, 27), tp);
    P.fill(sRR(cx, 68, 8, 5, 3), sk);
    P.fill(sPoly([[cx - 8, 64], [cx + 8, 64], [cx, 72]]), flat(L.belt), { ol: false, flat: true });
    drawHead(P, id, L, cx, cy, k, 'n', true);
  } else if (L.kind === 'plush') { // hooded dome with the face oval low inside it, shoulders fading out at the bottom
    const { fur, crm } = plushInk(L), k2 = 1.4, dome = sEll(cx, 38, 31, 34, 0.055, 15), val = (x, y) => LV((x - cx) / 36, (y - 46) / 48) + 0.42;
    P.fill(sEll(cx, 90, 37, 28, 0.05, 14), fur);
    P.fill(sUnion([dome, sEll(cx, 66, 33, 20, 0.05, 13)], val), fur);
    plushTufts(P, fur, cx, 38, 31, 34, [-12, 0, 12], val);
    for (const [a, b] of [[-19, -10], [-9, -23], [-25, 3]]) { furTick(P, cx + a, 38 + b, fur.hi); furTick(P, cx + a + 1, 38 + b + 1, fur.hi); }
    for (const [a, b] of [[22, -10], [16, -22], [-14, 61 - 38], [10, 66 - 38]]) furTick(P, cx + a, 38 + b, fur.sh);
    plushHood(P, fur, crm, cx + 2, 46, k2);
    face(H_(P, cx + 2, 46, k2), FACE.muse, 'n', null);
  } else {
    const body = { ...R(L.body, L.tint) }; body.ol = mix(body.sh, INK, 0.6);
    furBall(P, body, cx, 42, 34, 33, 110);
    const Hf = H_(P, cx, 36, 1.5); face(Hf, FACE.dot, 'n', null); dotBow(Hf, FACE.dot.sh, FACE.dot.my + 6.6);
  }
  return P;
}

// ---------- fx maps (about double the old resolution; game.js picks the draw scale) ----------
function makeFx(key) {
  const mk = (w, h) => new Pix(w, h);
  if (key === 'bolt') { // 24x14 energy dart pointing right
    const g = mk(24, 14), A = R('#3fb8ff', '#1a2a9a');
    g.fill(sPoly([[0.5, 7], [6, 2.5], [9.5, 5], [14, 1.5], [13, 5.5], [23.5, 7], [13, 8.5], [14, 12.5], [9.5, 9], [6, 11.5]]), A, { ol: A.dp });
    g.fill(sCap(5, 7, 18, 7, 1.7, 1.2), flat('#ffffff'), { ol: false, flat: true });
    g.px(1, 2, '#bfe8ff'); g.px(3, 12, '#bfe8ff'); g.px(0, 10, '#7fd0ff'); return g;
  }
  if (key === 'spud') { // 20x12 sweet potato
    const g = mk(20, 12), sk = R('#b8465c', '#4a1a6a'), fl = R('#ffd23f', '#c0602a');
    g.fill(sCap(5, 6.2, 14, 5.6, 3.6, 4.8), sk); g.fill(sEll(17, 5.4, 1.8, 3.2), fl, { ol: false });
    g.px(8, 5, sk.dp); g.px(11, 3, sk.dp); g.px(6, 8, sk.dp); g.px(2, 4, sk.sh); g.px(1, 6, sk.dp); g.px(3, 9, sk.sh); return g;
  }
  if (key === 'ring') { // 24x24 shockwave ring
    const g = mk(24, 24), A = R('#bfe9ff', '#3a4ab0');
    g.fill(sRing(12, 12, 11.6, 8), A, { ol: A.dp }); g.fill(sRing(12, 12, 9.4, 8.6), flat('#ffffff'), { ol: false, flat: true }); return g;
  }
  if (key === 'bubble') { // 24x24 iridescent bubble, hollow
    const g = mk(24, 24);
    g.fill(sRing(12, 12, 11.7, 9.6), flat('#8fe4ff'), { ol: '#3a2a8a', flat: true });
    g.fill(sAnd(sRing(12, 12, 11.2, 10), (x, y) => y > 12 && x > 12), flat('#ffb4ec'), { ol: false, flat: true });
    g.fill(sAnd(sRing(12, 12, 11.2, 10), (x, y) => y < 12 && x > 14), flat('#c8a4ff'), { ol: false, flat: true });
    g.fill(sCap(5.5, 8, 8.5, 4.6, 0.9, 0.9), flat('#ffffff'), { ol: false, flat: true }); g.px(5, 11, '#ffffff'); g.px(17, 18, '#ffffff'); g.px(18, 17, '#ffffff'); return g;
  }
  if (key === 'drone') { // 22x20 hovering bot
    const g = mk(22, 20), B = R('#cfd8ea', '#4a4ab0'), V = R('#10202e', '#0a3a5a');
    g.fill(sCap(3, 4.5, 19, 4.5, 1, 1), flat('#6a748a'), { ol: INK, flat: true }); g.fill(sRR(11, 4.5, 1.6, 2.4, 0.6), B);
    g.fill(sCap(11, 7, 11, 8, 1, 1), flat('#6a748a'), { ol: false, flat: true });
    g.fill(sEll(11, 12, 9, 6.4), B); g.fill(sEll(13, 12, 6, 3.8), V); g.fill(sEll(14, 12, 2, 1.7), flat('#7ef0ff'), { ol: false, flat: true }); g.px(16, 11, '#ffffff');
    g.fill(sCap(5, 17.5, 7, 19, 0.9, 0.9), flat('#6a748a'), { ol: false, flat: true }); g.fill(sCap(17, 17.5, 15, 19, 0.9, 0.9), flat('#6a748a'), { ol: false, flat: true }); return g;
  }
  if (key === 'pr') { // 24x18 pull-request card
    const g = mk(24, 18), C = R('#20303c', '#0a1a2a');
    g.fill(sRR(12, 9, 11.4, 8.4, 2.6), C, { ol: '#58e07a' }); g.fill(sRR(12, 9, 10.2, 7.2, 1.8), flat('#16222c'), { ol: false, flat: true });
    const G = '#58e07a'; g.fill(sCap(7.5, 5, 7.5, 13, 0.7, 0.7), flat(G), { ol: false, flat: true }); g.fill(sCap(16.5, 6.5, 8, 12.5, 0.7, 0.7), flat(G), { ol: false, flat: true });
    for (const [x, y] of [[7.5, 4.6], [7.5, 13.2], [16.5, 5.2]]) { g.fill(sEll(x, y, 2.2, 2.2), flat('#ffffff'), { ol: G, flat: true }); }
    return g;
  }
  if (key === 'reset') { // 40x16 rewind banner
    const g = mk(40, 16), A = R('#ff6a5a', '#7a1a4a');
    g.fill(sPoly([[1, 8], [10, 1.5], [10, 5.5], [20, 1.5], [20, 5.5], [38.5, 5.5], [38.5, 10.5], [20, 10.5], [20, 14.5], [10, 10.5], [10, 14.5]]), A, { ol: A.dp });
    g.fill(sCap(15, 8, 36, 8, 0.7, 0.7), flat('#ffe2dc'), { ol: false, flat: true }); return g;
  }
  if (key === 'star') { // 10x10 dizzy star
    const g = mk(10, 10); star4(g, 5, 5, 4.4, '#ffd23f', '#ffffff'); return g;
  }
  const g = mk(6, 6); // spark 6x6
  g.fill(sPoly([[3, 0.2], [3.9, 2.1], [5.8, 3], [3.9, 3.9], [3, 5.8], [2.1, 3.9], [0.2, 3], [2.1, 2.1]]), flat('#ffe680'), { ol: false, flat: true });
  g.px(2, 2, '#ffffff'); g.px(3, 3, '#ffffff'); return g;
}
const FXKEYS = ['bolt', 'spud', 'ring', 'bubble', 'drone', 'pr', 'reset', 'star', 'spark'];

// ---------- sheets ----------
const SHEETS = {}, HEADCANVAS = {}, FXCANVAS = {}, XSHEETS = {};
const XROWS = ['throw', 'low', 'sweep'], XFRAMES = 5; // extra pose strips (see POSE.throw), same cell size as the sheet
function buildSheets() {
  for (const id in LOOK) {
    const cv = document.createElement('canvas'); cv.width = FW * MAXF; cv.height = FH * ANIMS.length;
    const c2 = cv.getContext('2d'); const img = c2.createImageData(cv.width, cv.height);
    ANIMS.forEach((a, row) => { for (let f = 0; f < a.f; f++) renderFrame(id, a.n, f).writeTo(img, f * FW, row * FH); });
    c2.putImageData(img, 0, 0); SHEETS[id] = cv;
    const xc = document.createElement('canvas'); xc.width = FW * XFRAMES; xc.height = FH * XROWS.length;
    const x2 = xc.getContext('2d'), xi = x2.createImageData(xc.width, xc.height);
    XROWS.forEach((n, row) => { for (let f = 0; f < XFRAMES; f++) renderFrame(id, n, f).writeTo(xi, f * FW, row * FH); });
    x2.putImageData(xi, 0, 0); XSHEETS[id] = xc;
    HEADCANVAS[id] = canvasOf(drawBust(id));
  }
  for (const k of FXKEYS) FXCANVAS[k] = canvasOf(makeFx(k));
}
// game.js asks for plain sheet frames. For a fighter it is drawing right now, a throw, a crouch jab or a sweep gets its own pose here instead:
// the thrower an arms-up lift and slam, the victim a tumble over the thrower, low jab and sweep poses that really are low. Menus and finishers never match a live fighter.
const XPOSE = { low: [1, 'punch'], sweep: [2, 'kick'], kickf: [2, 'kick'] }; // attack key -> [XSHEETS row, sheet row game.js shows for it]
function liveFighter(id, x, y, face) {
  const fs = typeof game === 'undefined' || !game ? null : game.f; if (!fs) return null;
  x = Math.round(x); y = Math.round(y);
  for (const o of fs) if (o && o.d && o.d.id === id && o.face === face && Math.round(o.x) === x && Math.round(o.y) === y) return o;
  return null;
}
function livePose(o, anim, f) { // { row, f } in XSHEETS, { tumble: 0..1 } for a thrown victim, or null for the plain frame
  if (o.state === 'throw' && anim === 'punch') return { row: 0, f: o.thr ? Math.min(3, Math.floor(o.st / 6)) : 4 };
  const X = XPOSE[o.atk]; if (X && (o.state === 'punch' || o.state === 'kick') && anim === X[1]) return { row: X[0], f };
  const g = o.grabber; if (o.state === 'grabbed' && g && g.state === 'throw' && g.thr === o) return { tumble: Math.min(1, g.st / (typeof THROW_T === 'undefined' ? 24 : THROW_T)) };
  return null;
}
const TUMBLE_PIV = FEET + 1 - 40; // sheet row of the body centre a thrown victim turns about
// draw a sheet frame with its feet centre at (x,y); face = 1 or -1
function drawSprite(ctx, id, anim, f, x, y, face = 1, scale = PX) {
  const a = ANIMS[ANIM_ROW[anim]]; f = Math.max(0, Math.min(a.f - 1, f | 0));
  let cv = SHEETS[id], sx = f * FW, sy = ANIM_ROW[anim] * FH, tum = null;
  const o = XSHEETS[id] && liveFighter(id, x, y, face), ov = o && livePose(o, anim, f);
  if (ov) { if (ov.tumble === undefined) { cv = XSHEETS[id]; sx = ov.f * FW; sy = ov.row * FH; } else { tum = ov.tumble; sx = FW; sy = ANIM_ROW.hit * FH; } }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (tum === null) {
    ctx.translate(Math.round(x), Math.round(y)); ctx.scale(face, 1);
    ctx.drawImage(cv, sx, sy, FW, FH, -FW / 2 * scale, -(FEET + 1) * scale, FW * scale, FH * scale);
  } else { // thrown: tips head over heels about the body centre while it travels, ends lying on its back like the knock-down frames
    const s = Math.max(0, Math.min(1, (tum - 0.06) / 0.88)), e = s * s * (3 - 2 * s);
    ctx.translate(Math.round(x), Math.round(y) - (40 - 12 * e) * scale); ctx.rotate(face * e * Math.PI * 1.5); ctx.scale(face, 1);
    ctx.drawImage(cv, sx, sy, FW, FH, -FW / 2 * scale, -TUMBLE_PIV * scale, FW * scale, FH * scale);
  }
  ctx.restore();
}
// head-and-shoulders bust fitted (cover) into the rect x,y,w,h and clipped to it
function drawPortrait(ctx, id, x, y, w, h, flip = false) {
  const cv = HEADCANVAS[id]; if (!cv) return;
  const s = Math.max(w, h) / cv.width, dw = cv.width * s, dh = cv.height * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = false;
  ctx.translate(x + w / 2, y + (h - dh) * 0.3 + dh / 2); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(cv, -dw / 2, -dh / 2, dw, dh); ctx.restore();
}
function drawHeadIcon(ctx, id, x, y, size, flip = false) { // bust fitted into a square of 'size'
  const cv = HEADCANVAS[id]; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(x + size / 2, y + size / 2); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(cv, -size / 2, -size / 2, size, size); ctx.restore();
}
function drawFxMap(ctx, key, x, y, scale = PX, rot = 0, flip = false) {
  const cv = FXCANVAS[key]; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); if (flip) ctx.scale(-1, 1); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, -cv.width * scale / 2, -cv.height * scale / 2, cv.width * scale, cv.height * scale); ctx.restore();
}
// which frame of an animation to show at tick t (for looping anims)
function loopFrame(anim, t) { const a = ANIMS[ANIM_ROW[anim]]; return Math.floor(t / (a.t || 6)) % a.f; }
// frame for a timed action: progress u in 0..1 mapped over the frames with per-frame weights
function timedFrame(anim, u) { const a = ANIMS[ANIM_ROW[anim]]; return Math.min(a.f - 1, Math.floor(Math.max(0, u) * a.f)); }
