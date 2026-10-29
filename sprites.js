// ===== sprites.js: 8-bit sprite sheets, built at load time =====
// Every fighter is rasterised into a sprite sheet (one row per animation, one column per frame)
// from a small pixel rig plus hand-made pixel maps. Sheets are drawn with image smoothing off so
// the chunky pixels stay crisp. Open dev.html#sheet=tibo to inspect a sheet.

const FW = 48, FH = 48, FEET = 45;   // frame size in sprite pixels, feet baseline row
const PX = 4;                        // on-screen size of one sprite pixel
const INK = '#17121f';
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
  const r = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return colCache[key] = '#' + r.map(v => v.toString(16).padStart(2, '0')).join('');
}
const lighten = c => mix(c, '#ffffff', 0.22), darken = c => mix(c, '#1a0f1f', 0.28);

// ---------- pixel buffer ----------
class Pix {
  constructor(w, h, ox = 0, oy = 0) { this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.c = new Array(w * h).fill(null); this.s = new Uint8Array(w * h); this.late = []; }
  idx(x, y) { x = Math.round(x) + this.ox; y = Math.round(y) + this.oy; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  px(x, y, c, sh = 1) { const i = this.idx(x, y); if (i >= 0) { this.c[i] = c; this.s[i] = sh; } }
  get(x, y) { const i = this.idx(x, y); return i < 0 ? null : this.c[i]; }
  rect(x, y, w, h, c, sh = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, sh); }
  // rounded rect: drops the 4 corner pixels
  rrect(x, y, w, h, c, sh = 1) { this.rect(x, y, w, h, c, sh); for (const [i, j] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) this.px(x + i, y + j, null, 0); }
  ell(cx, cy, rx, ry, c, sh = 1) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) this.px(x, y, c, sh); } }
  line(x0, y0, x1, y1, c, t = 1, sh = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    const o = -((t - 1) >> 1);
    for (; ;) { for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) this.px(x0 + o + i, y0 + o + j, c, sh); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // draw a pixel map {pal, rows} with top-left at (x,y); flip = mirror horizontally
  blit(map, x, y, flip = false, sh = 0) {
    const w = map.rows[0].length;
    map.rows.forEach((row, j) => { for (let i = 0; i < w; i++) { const ch = row[i]; if (ch === '.' || ch === ' ') continue; this.px(x + (flip ? w - 1 - i : i), y + j, map.pal[ch.charCodeAt(0) - 97], sh); } });
  }
  // copy another Pix rotated 90 degrees counter-clockwise (head of an upright sprite ends up on the left)
  blitRotCCW(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.c[y * src.w + x]; if (!c) continue; const nx = y, ny = src.w - 1 - x; const i = this.idx(nx + dx - this.ox, ny + dy - this.oy); if (i >= 0) { this.c[i] = c; this.s[i] = src.s[y * src.w + x]; } }
    for (const [x, y, c] of src.late) this.late.push([y + dx - this.ox, src.w - 1 - x + dy - this.oy, c]);
  }
  bounds() { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < this.c.length; i++) if (this.c[i]) { const x = i % this.w, y = (i / this.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; }
  // automatic top-light / bottom-shadow on shadeable pixels, then a 4-connected ink outline
  finish() {
    const w = this.w, h = this.h, src = this.c.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!src[i] || !this.s[i]) continue;
      const up = y > 0 ? src[i - w] : null, dn = y < h - 1 ? src[i + w] : null, rt = x < w - 1 ? src[i + 1] : null;
      if (!up) this.c[i] = lighten(src[i]); else if (!dn || !rt) this.c[i] = darken(src[i]);
    }
    const filled = this.c.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (filled[i]) continue;
      if ((x > 0 && filled[i - 1]) || (x < w - 1 && filled[i + 1]) || (y > 0 && filled[i - w]) || (y < h - 1 && filled[i + w])) { this.c[i] = INK; this.s[i] = 0; }
    }
    for (const [x, y, c] of this.late) { if (x >= 0 && y >= 0 && x < w && y < h) { this.c[y * w + x] = c; this.s[y * w + x] = 0; } }
  }
  writeTo(img, dx, dy) { // into ImageData
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.c[y * this.w + x]; if (!c) continue; const [r, g, b] = hex2rgb(c); const o = ((dy + y) * img.width + dx + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
  }
}
const pt = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l]; // angle from straight down, + = forward (+x)

// ---------- hand-made pixel maps (original art) ----------
const K = '#1a1416', WH = '#ffffff';
// Muse: pale pink plush mascot. Hooded fur body, cream face, black glossy eyes, rosy cheeks.
const MUSE_HEAD = { pal: ['#f2d5cf', '#dcb8b1', '#f9e8e3', '#fff5ec', '#f1d9c8', K, WH, '#f2a9ab'], rows: [
  '......aaaaaaaa......',
  '....aaaacccaaaaa....',
  '...aaaccaaaaaaaaa...',
  '..aaacaaddddddaaaa..',
  '..aacaddddddddddaa..',
  '.aaaaddddddddddddaa.',
  '.aaaaddddddddddddaa.',
  '.aaaaddffddddffddaa.',
  '.aaaaddfgddddfgddaa.',
  '.aaaadhhddddddhhdaa.',
  '.aaaaddddfddfddddaa.',
  '.aaabdddddffdddddba.',
  '..aabddddddddddddaa.',
  '..aaabeddddddddeaaa.',
  '...aaabeeeeeeeeaaa..',
  '....aaaabbbbbaaaa...',
  '......aaaaaaaaa.....'] };
// Dot: a soft white blob with two dots.
const DOT_BODY = { pal: ['#f6f3ea', '#d8d3c6', WH, K, '#f0b4b4'], rows: [
  '......aaaaaa......',
  '....aaccaaaaaa....',
  '...aaccaaaaaaaa...',
  '..aacaaaaaaaaaaa..',
  '.aaaaaaaaaaaaaaaa.',
  '.aaaaaaaaaaaaaaaa.',
  'aaaaaaddaaaaddaaaa',
  'aaaaaaddaaaaddaaaa',
  'aaaaaaaaaaaaaaaaab',
  'aaaaaeeaaaaaaeeaab',
  'aaaaaaaaaaaaaaaabb',
  'aaaaaaaaaaaaaaaabb',
  '.aaaaaaaaaaaaaabb.',
  '.aaaaaaaaaaaaaabb.',
  '..aaaaaaaaaaaabb..',
  '...aaaaaaaaabbb...',
  '....aaaaabbbb.....',
  '......bbbbbb......'] };

// Projectile / effect sprites (scaled up with PX at draw time, no outline pass)
const FXMAPS = {
  bolt: { pal: ['#0b1a2a', '#7cc7ff', WH], rows: ['aaaaaaaaaaaa', 'abbaaaaaaaaa', 'aabbaaaaaaaa', 'aaabbaaaaaaa', 'aabbaabbbbaa', 'abbaaabbbbaa', 'aaaaaaaaaaaa'] },
  spud: { pal: ['#8a2f3c', '#b23f4c', '#f6c544', '#ffe08a'], rows: ['..aaaaaa..', '.abbbbbba.', 'abbbccccba', 'abbccddcba', '.abbcccba.', '..aaaaaa..'] },
  ring: { pal: ['#f0eee6', WH], rows: ['....bbbb....', '..bbaaaabb..', '.baa....aab.', '.ba......ab.', 'ba........ab', 'ba........ab', 'ba........ab', 'ba........ab', '.ba......ab.', '.baa....aab.', '..bbaaaabb..', '....bbbb....'] },
  bubble: { pal: ['#b98cff', '#7ef0ff', WH, '#ffaa5a'], rows: ['....aaaa....', '..aaccbbaa..', '.acc..bbbba.', '.ac....bbba.', 'ac......bbda', 'ab......bbda', 'ab......bdda', 'ab......bdda', '.ab....ddda.', '.abb..dddda.', '..aabbddaa..', '....aaaa....'] },
  drone: { pal: ['#7ef0ff', '#1d2f8f', WH, '#2f6bff'], rows: ['.aaa...aaa.', 'a...aaa...a', '.aaaaaaaaa.', '..acccccca.', '..acdddcca.', '..acddddca.', '..acdddcca.', '..acccccca.', '...aaaaa...', '....bbb....'] },
  pr: { pal: ['#1f6f3a', '#58e07a', '#bfffcf'], rows: ['bbbbbbbbbbbb', 'baaaaaaaaaab', 'bacccacccaab', 'bacacacacaab', 'bacccacccaab', 'bacaaacaaaab', 'bacaaacaaaab', 'baaaaaaaaaab', 'bbbbbbbbbbbb'] },
  reset: { pal: ['#333333', '#d92b2b', '#ff6b6b', WH], rows: ['....bbbbbbbbbbbb....', '..bbbbccccccccbbbb..', '.bbbbbbbbbbbbbbbbbb.', '.bbbbbbbbbbbbbbbbbb.', '..bbbbbbbbbbbbbbbb..', 'aaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaa', '.aaaaaaaaaaaaaaaaaa.'] },
  star: { pal: ['#ffd23f', '#fff3b0'], rows: ['..a..', '.aba.', 'abbba', '.aba.', '..a..'] },
  spark: { pal: [WH], rows: ['.a.', 'aaa', '.a.'] },
};

// ---------- looks ----------
// kind: human (photo head + rig), plush (Muse), blob (map body + stubby limbs)
const LOOK = {
  tibo: { kind: 'human', head: 'tibo', skin: '#f3a67f', shirt: '#34343e', sleeve: 'short', pants: '#40507a', shoe: '#f4f4f4', badge: ['#7cc7ff', '>_'], eyes: [[5, 9], [11, 9]], face: '#f3a67f' },
  poteto: { kind: 'human', head: 'poteto', skin: '#f7e8cb', shirt: '#35323b', sleeve: 'long', pants: '#2e2b35', shoe: '#5a3d2c', eyes: [[6, 9], [12, 9]], face: '#f7e8cb', eyeW: 3 },
  wang: { kind: 'human', head: 'wang', skin: '#ffd6b1', shirt: '#c3c5cc', sleeve: 'long', pants: '#323744', shoe: '#f0f0f5', knit: true, eyes: [[5, 10], [10, 10]], face: '#ffd6b1' },
  muse: { kind: 'plush', headMap: MUSE_HEAD, fur: '#f2d5cf', furDark: '#dcb8b1', face: '#fff5ec', eyes: [[7, 7], [13, 7]], mouth: [10, 10] },
  dot: { kind: 'blob', body: DOT_BODY, limb: '#e6e2d8', hand: '#f6f3ea', shoe: '#e6e2d8', face: '#f6f3ea', eyes: [[6, 6], [12, 6]], mouth: null, shoulder: [-7, -12], hip: [-4, -3], bodyY: -20 },
};

// ---------- rig: returns a pose for (anim, frame) ----------
// Angles are radians from straight-down; + = forward. Arms: [shoulder, elbow]; legs: [hip, knee].
// bob: vertical offset (negative = up), lean: forward shear in px, expr: face expression.
function rig(anim, i, n) {
  const P = { bob: 0, lean: 0, ba: [0.3, 1.6], fa: [0.5, 1.9], bl: [-0.15, 0.05], fl: [0.2, -0.1], expr: 'normal', fx: [], hop: 0 };
  const u = n > 1 ? i / (n - 1) : 0;      // 0..1 across the animation
  const ph = i / n * Math.PI * 2;         // cyclic phase
  switch (anim) {
    case 'idle': { const b = Math.sin(ph); P.bob = Math.round(-b * 1); P.ba = [0.3 + b * 0.08, 1.6]; P.fa = [0.5 - b * 0.08, 1.9]; if (i === 4) P.expr = 'blink'; break; }
    case 'walk': { const s = Math.sin(ph), c = Math.cos(ph); P.bob = -Math.round(Math.abs(c) * 1.5); P.fl = [s * 0.7, -Math.max(0, -c) * 1.1]; P.bl = [-s * 0.7, -Math.max(0, c) * 1.1]; P.ba = [0.3 - s * 0.5, 1.2]; P.fa = [0.4 + s * 0.5, 1.5]; P.lean = 1; break; }
    case 'jump': {
      if (i === 0) { P.fl = [0.5, -1.4]; P.bl = [-0.2, -1.4]; P.ba = [-0.6, 0.9]; P.fa = [-0.4, 0.8]; P.lean = 1; }           // crouch
      else if (i === 1) { P.fl = [0.9, -1.8]; P.bl = [0.2, -1.5]; P.fa = [2.4, 0.3]; P.ba = [-2.3, -0.3]; P.expr = 'happy'; }  // rise
      else if (i === 2) { P.fl = [1.0, -2.0]; P.bl = [0.3, -1.8]; P.fa = [2.0, 0.6]; P.ba = [-1.6, -0.4]; }                    // apex tuck
      else { P.fl = [0.4, -0.6]; P.bl = [-0.3, -0.4]; P.fa = [1.2, 0.3]; P.ba = [-0.9, -0.2]; P.expr = 'normal'; }           // fall
      P.noDrop = true; break;
    }
    case 'punch': {
      const e = [0, 0.5, 1, 1, 0.35][i]; const w = i === 0 ? 1 : 0;
      P.fa = [0.5 + e * 1.1 - w * 0.6, 1.9 * (1 - e) + 0.05]; P.ba = [0.2 - e * 0.4, 1.8]; P.lean = Math.round(-w * 1 + e * 3); P.fl = [0.35 + e * 0.25, -0.25]; P.bl = [-0.35 - e * 0.1, 0.05]; P.expr = 'angry';
      if (i === 2) P.fx.push('trail'); break;
    }
    case 'kick': {
      const e = [0, 0.55, 1, 1, 0.3][i]; const w = i === 0 ? 1 : 0;
      P.fl = [0.3 + e * 1.45, -1.3 * (1 - e) - w * 0.6]; P.bl = [-0.15 - e * 0.1, 0.05]; P.lean = Math.round(-e * 3 - w); P.ba = [0.3 - e * 0.8, 1.2]; P.fa = [0.6 + e * 0.3, 1.5]; P.expr = 'angry'; P.stand = 'back';
      if (i === 2) P.fx.push('kicktrail'); break;
    }
    case 'special': {
      if (i < 3) { const e = (i + 1) / 3; P.fa = [0.5 - e * 1.5, 1.9 - e * 1.3]; P.ba = [0.3 - e * 1.2, 1.6 - e * 1.0]; P.lean = -Math.round(e * 2); P.bl = [-0.4 * e - 0.15, 0.25]; P.fl = [0.3, -0.5 * e]; P.fx.push(['charge', e]); P.expr = 'angry'; }
      else { const e = [1, 1, 0.4][i - 3]; P.fa = [0.5 + e * 1.1, 1.9 * (1 - e)]; P.ba = [0.4 + e * 1.0, 1.7 * (1 - e)]; P.lean = Math.round(e * 3); P.fl = [0.5, -0.1]; P.bl = [-0.45, 0.1]; P.expr = 'angry'; if (i === 3) P.fx.push('burst'); }
      break;
    }
    case 'super': {
      if (i < 4) { const e = (i + 1) / 4; P.fa = [0.5 - e * 1.6, 1.9 - e * 1.4]; P.ba = [0.3 - e * 1.4, 1.6 - e * 1.2]; P.bob = (i % 2) * 1; P.bl = [-0.5 * e - 0.15, 0.4 * e]; P.fl = [0.4, -0.7 * e]; P.fx.push(['charge', e * 1.3]); P.expr = i > 1 ? 'angry' : 'normal'; }
      else if (i < 7) { const e = [1, 1, 0.8][i - 4]; P.fa = [0.5 + e * 2.2, 0.1]; P.ba = [0.4 + e * 2.0, 0.1]; P.lean = 2; P.bob = -2; P.fl = [0.6, -0.5]; P.bl = [-0.5, 0.2]; P.fx.push('burst', 'superaura'); P.expr = 'shout'; }
      else { P.fa = [0.9, 1.0]; P.ba = [0.6, 1.2]; P.expr = 'happy'; }
      break;
    }
    case 'block': { P.fa = [1.25, 2.2]; P.ba = [1.05, 2.35]; P.lean = -1; P.fl = [0.4, -0.6]; P.bl = [-0.3, 0.25]; P.expr = i ? 'blink' : 'normal'; P.bob = i; break; }
    case 'hit': { const k = [1, 0.7, 0.25][i]; P.lean = -Math.round(3 * k); P.fa = [-0.7 * k + 0.3, 0.6]; P.ba = [-1.0 * k + 0.1, 0.4]; P.fl = [0.5 * k, -0.2]; P.bl = [-0.3, 0]; P.expr = 'ouch'; P.headTilt = -1; break; }
    case 'ko': {
      if (i === 0) { P.lean = -3; P.fa = [-0.8, 0.5]; P.ba = [-1.1, 0.4]; P.fl = [0.6, -0.3]; P.expr = 'ouch'; P.headTilt = -1; }
      else if (i === 1) { P.lean = -5; P.fa = [-1.6, 0.2]; P.ba = [-1.8, 0.2]; P.fl = [0.9, -0.6]; P.bl = [-0.2, -0.3]; P.expr = 'ko'; P.headTilt = -2; P.noDrop = true; }
      else { P.lying = true; P.fa = [0.4, 0.3]; P.ba = [-0.5, 0.3]; P.fl = [0.25, -0.1]; P.bl = [-0.1, 0]; P.expr = 'ko'; if (i === 2) P.lyingLift = 6; if (i === 4) P.fx.push('stars'); }
      break;
    }
    case 'win': { const h = Math.abs(Math.sin(ph / 2)); P.hop = Math.round(h * 7); P.fa = [2.8 + Math.sin(ph) * 0.15, 0.25]; P.ba = [i % 2 ? 2.6 : 0.35, i % 2 ? 0.3 : 1.9]; P.fl = [0.2, -0.5 * h]; P.bl = [-0.25, -0.4 * h]; P.expr = 'happy'; P.noDrop = h > 0.2; if (i === 3) P.fx.push('stars'); break; }
  }
  return P;
}

// ---------- expression overlays ----------
function drawExpr(g, L, hx, hy, expr) {
  const face = L.face, ew = L.eyeW || 2;
  const eyes = L.eyes.map(([x, y]) => [hx + x, hy + y]);
  const clear = (x, y, w, h) => g.rect(x, y, w, h, face, 0);
  if (expr === 'blink') for (const [x, y] of eyes) { clear(x, y, ew, 2); g.rect(x, y + 1, ew, 1, K, 0); }
  else if (expr === 'happy') for (const [x, y] of eyes) { clear(x - 1, y - 1, ew + 2, 3); g.px(x - 1, y + 1, K, 0); g.rect(x, y, ew, 1, K, 0); g.px(x + ew, y + 1, K, 0); }
  else if (expr === 'ouch') for (const [x, y] of eyes) { clear(x, y, ew, 2); g.px(x, y, K, 0); g.rect(x, y + 1, ew, 1, K, 0); g.px(x + ew - 1, y - 1, K, 0); }
  else if (expr === 'ko') for (const [x, y] of eyes) { clear(x - 1, y - 1, ew + 2, 3); g.px(x - 1, y - 1, K, 0); g.px(x + ew, y - 1, K, 0); g.px(x, y, K, 0); if (ew > 2) g.px(x + 1, y, K, 0); g.px(x - 1, y + 1, K, 0); g.px(x + ew, y + 1, K, 0); }
  else if (expr === 'angry' || expr === 'shout') for (const [x, y] of eyes) { g.rect(x, y - 1, ew, 1, K, 0); }
  if (L.mouth) {
    const [mx, my] = [hx + L.mouth[0], hy + L.mouth[1]];
    if (expr === 'ouch' || expr === 'shout') { clear(mx - 1, my - 1, 4, 3); g.rect(mx, my, 2, 2, K, 0); }
    else if (expr === 'ko') { clear(mx - 1, my, 4, 2); g.px(mx - 1, my + 1, K, 0); g.px(mx, my, K, 0); g.px(mx + 1, my + 1, K, 0); g.px(mx + 2, my, K, 0); }
    else if (expr === 'happy') { clear(mx - 1, my, 4, 2); g.px(mx - 2, my, K, 0); g.rect(mx - 1, my + 1, 4, 1, K, 0); g.px(mx + 3, my, K, 0); }
  }
}

// ---------- frame renderers ----------
function drawHuman(g, L, P) {
  const head = HEADS[L.head], hw = head.rows[0].length, hh = head.rows.length;
  const hipY = -11, shY = -20, hx = [-3, 3], shx = [-4, 4];
  const leg = (i, a) => { const k = pt(hx[i], hipY, a[0], 5), f = pt(k[0], k[1], a[0] + a[1], 6); return [[hx[i], hipY], k, f, a[0] + a[1]]; };
  const LB = leg(0, P.bl), LF = leg(1, P.fl);
  let drop = 0; if (!P.noDrop) drop = -(P.stand === 'back' ? LB[2][1] : Math.max(LB[2][1], LF[2][1]));
  const oy = Math.round(drop + (P.bob || 0)) - (P.hop || 0);
  const lean = P.lean || 0;
  const sh = i => [shx[i] + lean, shY + oy];
  const arm = (i, a) => { const s = sh(i), e = pt(s[0], s[1], a[0], 5), h = pt(e[0], e[1], a[0] + a[1], 5); return [s, e, h]; };
  const AB = arm(0, P.ba), AF = arm(1, P.fa);
  const shoe = (f, back) => { const c = back ? mix(L.shoe, '#000000', 0.25) : L.shoe; const dir = f[3] > 0.9 ? 0 : 1; g.rect(f[0] - 1, f[1] - 1, 5, 2, c); if (dir) g.px(f[0] + 4, f[1], c); };
  const drawLeg = (Lg, back) => { const c = back ? mix(L.pants, '#000000', 0.2) : L.pants; g.line(Lg[0][0], Lg[0][1] + oy, Lg[1][0], Lg[1][1] + oy, c, 3); g.line(Lg[1][0], Lg[1][1] + oy, Lg[2][0], Lg[2][1] + oy, c, 3); shoe([Lg[2][0], Lg[2][1] + oy, 0, Lg[3]], back); };
  const drawArm = (A, back) => {
    const sl = back ? mix(L.shirt, '#000000', 0.2) : L.shirt, sk = back ? mix(L.skin, '#000000', 0.18) : L.skin;
    g.line(A[0][0], A[0][1], A[1][0], A[1][1], sl, 3);
    g.line(A[1][0], A[1][1], A[2][0], A[2][1], L.sleeve === 'short' ? sk : sl, 3);
    g.rect(A[2][0] - 1, A[2][1] - 1, 3, 3, sk);
  };
  // back limbs, torso, head, front limbs
  drawLeg(LB, true); drawArm(AB, true);
  const tx = -6 + Math.round(lean * 0.5), ty = shY - 1 + oy;
  g.rrect(tx, ty, 12, 11, L.shirt);
  g.rect(tx, ty + 1, 3, 9, mix(L.shirt, '#000000', 0.15));
  if (L.badge) { g.rect(tx + 4, ty + 3, 5, 4, '#0b1a2a', 0); g.px(tx + 5, ty + 4, L.badge[0], 0); g.px(tx + 6, ty + 5, L.badge[0], 0); g.px(tx + 5, ty + 6, L.badge[0], 0); g.px(tx + 7, ty + 6, L.badge[0], 0); }
  if (L.knit) for (let y = 0; y < 9; y += 2) g.px(tx + 4 + (y % 4 ? 2 : 0), ty + 1 + y, mix(L.shirt, '#000000', 0.12), 0);
  g.rect(tx + 1, ty + 10, 10, 1, mix(L.pants, '#000000', 0.2));
  const hxp = -Math.floor(hw / 2) + lean + (P.headTilt || 0), hyp = shY - hh + 2 + oy + (P.headTilt ? 1 : 0);
  g.blit(head, hxp, hyp);
  drawExpr(g, L, hxp, hyp, P.expr);
  drawLeg(LF, false); drawArm(AF, false);
  drawFx(g, P, AF[2], LF[2], oy);
}

function drawPlush(g, L, P) { // Muse
  const head = L.headMap, hw = head.rows[0].length, hh = head.rows.length;
  const hipY = -7, shY = -17;
  const lean = P.lean || 0;
  const legA = a => a[0] * 2.2; // stubby legs: just swing the foot
  const feetY = Math.max(0, 0);
  const oy = Math.round((P.bob || 0)) - (P.hop || 0) + (P.noDrop ? 0 : 0);
  const legs = [[-5, P.bl], [1, P.fl]];
  const legDraw = ([x, a], back) => { const fx = x + Math.round(a[0] * 5), fy = Math.round(-Math.max(0, -a[1]) * 3) - Math.round(Math.max(0, a[0] - 0.8) * 3); const c = back ? L.furDark : L.fur; g.line(x + 2, hipY + oy, fx + 2, -2 + fy + oy, c, 4); g.rrect(fx - 1, -3 + fy + oy, 6, 3, c); };
  const armDraw = (i, a, back) => { const sx = (i ? 7 : -7) + lean, sy = shY + oy + 1; const e = pt(sx, sy, a[0], 4), h = pt(e[0], e[1], a[0] + a[1] * 0.7, 4); const c = back ? L.furDark : L.fur; g.line(sx, sy, e[0], e[1], c, 4); g.line(e[0], e[1], h[0], h[1], c, 4); g.ell(h[0], h[1], 2.6, 2.6, c); };
  legDraw(legs[0], true); armDraw(0, P.ba, true);
  // torso: round fluffy body
  g.ell(lean * 0.5, hipY - 5 + oy, 8.5, 7.5, L.fur);
  g.rect(-6 + Math.round(lean * 0.5), hipY - 2 + oy, 13, 4, L.fur);
  g.ell(lean * 0.5 - 3, hipY - 6 + oy, 2, 3, mix(L.fur, '#ffffff', 0.35), 0);
  const hxp = -Math.floor(hw / 2) + lean + (P.headTilt || 0), hyp = shY - hh + 4 + oy + (P.headTilt ? 1 : 0);
  g.blit(head, hxp, hyp);
  drawExpr(g, L, hxp, hyp, P.expr);
  legDraw(legs[1], false); armDraw(1, P.fa, false);
  const handF = pt(7 + lean, shY + oy + 1, P.fa[0], 4); const h2 = pt(handF[0], handF[1], P.fa[0] + P.fa[1] * 0.7, 4);
  drawFx(g, P, h2, [legs[1][0] + 4, -1 + oy], oy);
}

function drawBlob(g, L, P) { // Dot
  const body = L.body, bw = body.rows[0].length, bh = body.rows.length;
  const lean = P.lean || 0; const oy = Math.round(P.bob || 0) - (P.hop || 0);
  const [shx, shy] = L.shoulder, [hpx, hpy] = L.hip;
  const legDraw = (x, a, back) => { const fx = x + Math.round(a[0] * 3), kneeUp = Math.round(Math.max(0, -a[1]) * 2.5); const c = back ? mix(L.limb, '#000000', 0.2) : L.limb; g.line(x, hpy + oy, fx, -1 - kneeUp + oy, c, 2); const sc = back ? mix(L.shoe, '#000000', 0.25) : L.shoe; g.rect(fx - 1, -1 - kneeUp + oy, 5, 2, sc); };
  const armDraw = (x, a, back) => { const sx = x + lean, sy = shy + oy; const e = pt(sx, sy, a[0], 4), h = pt(e[0], e[1], a[0] + a[1], 4); const c = back ? mix(L.limb, '#000000', 0.2) : L.limb; g.line(sx, sy, e[0], e[1], c, 2); g.line(e[0], e[1], h[0], h[1], c, 2); g.rect(h[0] - 1, h[1] - 1, 3, 3, back ? mix(L.hand, '#000000', 0.15) : L.hand); return h; };
  legDraw(hpx, P.bl, true); armDraw(shx, P.ba, true);
  const bx = -Math.floor(bw / 2) + Math.round(lean * 0.6), by = L.bodyY + oy + (P.headTilt || 0);
  g.blit(body, bx, by, false, 1);
  drawExpr(g, L, bx, by, P.expr);
  legDraw(-hpx, P.fl, false); const h = armDraw(-shx, P.fa, false);
  drawFx(g, P, h, [-hpx + Math.round(P.fl[0] * 3) + 2, -1 + oy], oy);
}

// attack trails / auras / stars drawn after the outline pass
function drawFx(g, P, hand, foot, oy) {
  for (const f of P.fx) {
    const kind = Array.isArray(f) ? f[0] : f, e = Array.isArray(f) ? f[1] : 1;
    if (kind === 'trail') for (let i = 0; i < 3; i++) for (let x = 0; x < 4 - i; x++) g.late.push([hand[0] - 6 - i * 3 - x + g.ox, hand[1] - 2 + i * 2 + g.oy, WH]);
    if (kind === 'kicktrail') for (let i = 0; i < 4; i++) g.late.push([foot[0] - 4 - i * 2 + g.ox, foot[1] - 7 + i * 2 + g.oy, WH]);
    if (kind === 'charge') { const n = Math.round(3 + e * 4); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + e * 2; const r = 10 + e * 4; g.late.push([Math.round(hand[0] + Math.cos(a) * r) + g.ox, Math.round(hand[1] + Math.sin(a) * r * 0.6) + g.oy, i % 2 ? WH : '#ffd23f']); } }
    if (kind === 'burst') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const r = 5; for (let k = 1; k <= 2; k++) g.late.push([Math.round(hand[0] + 2 + Math.cos(a) * r * k) + g.ox, Math.round(hand[1] + Math.sin(a) * r * k * 0.7) + g.oy, k === 1 ? '#ffd23f' : WH]); } }
    if (kind === 'superaura') { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.late.push([Math.round(Math.cos(a) * 17) + g.ox, Math.round(-20 + oy + Math.sin(a) * 20) + g.oy, i % 2 ? '#ffd23f' : WH]); } }
    if (kind === 'stars') { for (let i = 0; i < 3; i++) { const x = FW / 2 - 10 + i * 10, y = (P.lying ? FEET - 18 : 4 - (P.hop || 0)) + (i === 1 ? -2 : 0); for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) g.late.push([x + dx, y + dy, '#ffd23f']); } }
  }
}

function renderFrame(id, anim, i, n) {
  const L = LOOK[id], P = rig(anim, i, n);
  let g = new Pix(FW, FH, FW / 2, FEET);
  const draw = L.kind === 'human' ? drawHuman : L.kind === 'plush' ? drawPlush : drawBlob;
  if (P.lying) {
    const tmp = new Pix(FW, FH, FW / 2, FEET); const hadStars = P.fx.includes('stars'); P.fx = P.fx.filter(f => f !== 'stars'); draw(tmp, L, P);
    const b = tmp.bounds();
    // rotate so the head points backwards (-x), lay the body on the ground
    const rot = new Pix(FW, FH, 0, 0); rot.blitRotCCW(tmp, 0, 0);
    const rb = rot.bounds();
    const dx = Math.round(FW / 2 - (rb.x0 + rb.x1) / 2) - 2, dy = FEET - rb.y1 - (P.lyingLift || 0);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const c = rot.c[y * FW + x]; if (!c) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < FW && ny < FH) { g.c[ny * FW + nx] = c; g.s[ny * FW + nx] = rot.s[y * FW + x]; } }
    g.late = rot.late.map(([x, y, c]) => [x + dx - g.ox, y + dy - g.oy, c]);
    if (hadStars) drawFx(g, { fx: ['stars'], lying: true }, [0, 0], [0, 0], 0);
    void b;
  } else draw(g, L, P);
  g.finish();
  return g;
}

// ---------- sheets ----------
const SHEETS = {}, HEADCANVAS = {}, FXCANVAS = {};
function buildSheets() {
  for (const id in LOOK) {
    const cv = document.createElement('canvas'); cv.width = FW * MAXF; cv.height = FH * ANIMS.length;
    const c2 = cv.getContext('2d'); const img = c2.createImageData(cv.width, cv.height);
    ANIMS.forEach((a, row) => { for (let f = 0; f < a.f; f++) renderFrame(id, a.n, f, a.f).writeTo(img, f * FW, row * FH); });
    c2.putImageData(img, 0, 0); SHEETS[id] = cv;
  }
  // head / portrait canvases (head map with outline) and fx maps
  for (const id in LOOK) {
    const L = LOOK[id]; const map = L.kind === 'human' ? HEADS[L.head] : L.kind === 'plush' ? L.headMap : L.body;
    const w = map.rows[0].length + 2, h = map.rows.length + 2; const g = new Pix(w, h); g.blit(map, 1, 1); g.finish();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const img = cv.getContext('2d').createImageData(w, h); g.writeTo(img, 0, 0); cv.getContext('2d').putImageData(img, 0, 0); HEADCANVAS[id] = cv;
  }
  for (const k in FXMAPS) {
    const map = FXMAPS[k], w = map.rows[0].length, h = map.rows.length; const g = new Pix(w, h); g.blit(map, 0, 0);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const img = cv.getContext('2d').createImageData(w, h); g.writeTo(img, 0, 0); cv.getContext('2d').putImageData(img, 0, 0); FXCANVAS[k] = cv;
  }
}
// draw a sheet frame with its feet centre at (x,y); face = 1 or -1
function drawSprite(ctx, id, anim, f, x, y, face = 1, scale = PX) {
  const a = ANIMS[ANIM_ROW[anim]]; f = Math.max(0, Math.min(a.f - 1, f | 0));
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(face, 1); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(SHEETS[id], f * FW, ANIM_ROW[anim] * FH, FW, FH, -FW / 2 * scale, -(FEET + 1) * scale, FW * scale, FH * scale);
  ctx.restore();
}
function drawHeadIcon(ctx, id, x, y, size, flip = false) { // portrait: head map fitted into a square of 'size'
  const cv = HEADCANVAS[id]; const s = Math.max(1, Math.floor(size / Math.max(cv.width, cv.height)));
  const w = cv.width * s, h = cv.height * s; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(x + size / 2, y + size / 2); if (flip) ctx.scale(-1, 1); ctx.drawImage(cv, -w / 2, -h / 2, w, h); ctx.restore();
}
function drawFxMap(ctx, key, x, y, scale = PX, rot = 0, flip = false) {
  const cv = FXCANVAS[key]; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); if (flip) ctx.scale(-1, 1); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, -cv.width * scale / 2, -cv.height * scale / 2, cv.width * scale, cv.height * scale); ctx.restore();
}
// which frame of an animation to show at tick t (for looping anims)
function loopFrame(anim, t) { const a = ANIMS[ANIM_ROW[anim]]; return Math.floor(t / (a.t || 6)) % a.f; }
// frame for a timed action: progress u in 0..1 mapped over the frames with per-frame weights
function timedFrame(anim, u) { const a = ANIMS[ANIM_ROW[anim]]; return Math.min(a.f - 1, Math.floor(Math.max(0, u) * a.f)); }
