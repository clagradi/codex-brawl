// moves.js: move sets for Agent Brawl (3 specials, a super and a finisher per fighter).
// Classic script, loaded after pixelfont/sprites/arenas/hud and before game.js. Everything lives in one IIFE so
// helper names never collide with the other files; game globals (game, GROUND, W, beep, thud, FX, drawSprite...)
// are only touched at call time. Art is drawn in a crisp 2x pixel style: ink outline, 3-tone shading, no smoothing.
const MOVES = (() => {
const INK = '#17121f';
const hs = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const cl = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const ph = (t, a, b) => cl((t - a) / (b - a), 0, 1);            // 0..1 progress of t inside [a,b]
const q2 = v => Math.round(v / 2) * 2;                          // snap to the 2x pixel grid
const sgn = v => v < 0 ? -1 : 1;

// ---------- engine glue (all optional, so the viewer page can run without the real engine) ----------
const snd = (f, d, type, v, slide) => { if (typeof beep === 'function') beep(f, d, type, v, slide); };
const thd = (d, v) => { if (typeof thud === 'function') thud(d, v); };
const sparks = (x, y, col, n) => { if (typeof FX !== 'undefined' && FX.sparks) FX.sparks(x, y, col, n); };
const blood = (x, y, dir, p) => { if (typeof FX !== 'undefined' && FX.blood) FX.blood(x, y, dir, p); };
const dust = (x, y) => { if (typeof FX !== 'undefined' && FX.dust) FX.dust(x, y); };
const jolt = (shake, stop, flash) => { game.shake = Math.max(game.shake || 0, shake || 0); game.hitstop = Math.max(game.hitstop || 0, stop || 0); if (flash) game.flash = Math.max(game.flash || 0, flash); };
const addFx = o => { const f = Object.assign({ t: 0, life: 30 }, o); game.fx.push(f); return f; };
const addProj = (self, o) => { const p = Object.assign({ owner: self, x: 0, y: 0, vx: 0, vy: 0, r: 20, life: 90, dmg: 9, kb: 6, stun: 16, t: 0 }, o); if (self.airSp && self.mv && self.mv.dive) divify(p); game.proj.push(p); return p; };
// air special: special 1 fired from a jump. Lobbed shots just start falling; straight shots gain a steady drop (down-forward line) and burst on the floor.
function divify(p) {
  if (p.vy < 0) { p.vy = 1; return; }
  const u = p.update, dy = Math.max(3.5, Math.abs(p.vx) * 0.55);
  if (!u) return;
  tiltShot(p, dy);
  p.update = q => {
    if (q.by !== undefined) q.by += dy; u(q); if (q.by === undefined) q.y += dy;
    if (q.y > GROUND - 14 && q.life > 0) { q.life = 0; dust(q.x, GROUND); }
  };
}
// A diving shot also leans into the dive: its art is turned to follow the path (movement and hitbox stay exactly as they were).
// Wang's bubble is round and has bars sorting inside it, so it stays upright.
const TILT_SKIP = { wang: 1 };
function tiltShot(p, dy) {
  const draw = p.draw, id = p.owner && p.owner.d && p.owner.d.id;
  if (!draw || TILT_SKIP[id]) return;
  p.ang = sgn(p.vx) * Math.atan2(dy, Math.abs(p.vx));
  p.draw = (c, q) => tiltDraw(c, q, draw, p.ang);
}
// The shot is drawn upright into a small scratch buffer (1 cell = 2 screen px), turned with nearest-neighbour sampling so it stays on
// the 2px grid like the rest of the art (no smoothing), then blitted at 2x around the shot's centre.
const TILT_H = 48;                                               // half-size of the scratch buffer in cells (96 px each way)
let tiltBuf = null;
function tiltDraw(c, p, draw, ang) {
  const N = TILT_H * 2;
  if (!tiltBuf) {
    const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = a.height = b.width = b.height = N;
    tiltBuf = { g: a.getContext('2d', { willReadFrequently: true }), out: b, og: b.getContext('2d') };
    tiltBuf.img = tiltBuf.og.createImageData(N, N);
  }
  const { g, out, og, img } = tiltBuf, ox = q2(p.x), oy = q2(p.y);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, N, N);
  g.setTransform(0.5, 0, 0, 0.5, TILT_H - ox / 2, TILT_H - oy / 2);   // world px to cells, shot centre in the middle of the buffer
  draw(g, p);
  const src = g.getImageData(0, 0, N, N).data, dst = img.data, cs = Math.cos(ang), sn = Math.sin(ang);
  dst.fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = i + 0.5 - TILT_H, dy = j + 0.5 - TILT_H;
    const si = Math.floor(dx * cs + dy * sn + TILT_H), sj = Math.floor(dy * cs - dx * sn + TILT_H);
    if (si < 0 || sj < 0 || si >= N || sj >= N) continue;
    const a = (sj * N + si) * 4, b = (j * N + i) * 4;
    dst[b] = src[a]; dst[b + 1] = src[a + 1]; dst[b + 2] = src[a + 2]; dst[b + 3] = src[a + 3];
  }
  og.putImageData(img, 0, 0);
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(out, ox - TILT_H * 2, oy - TILT_H * 2, N * 2, N * 2); c.restore();
}
const foe = self => game.f[1 - self.side];

// a hit that really landed (the engine ignores hits during i-frames and in the wrong phase)
function strike(self, o, dmg, kb, stun, kind) {
  const hp0 = o.hp; o.takeHit(self, dmg * self.d.pow, kb, stun, kind || 'hit'); return o.hp < hp0;
}
// engine hit test, mirrored so projectiles can play their own impact fx (there is no onHit callback)
function probe(p) {
  const tg = foe(p.owner);
  return !!tg && !tg.hidden && tg.inv <= 0 && tg.state !== 'ko' && Math.abs(p.x - tg.x) < p.r + 24 && Math.abs(p.y - (tg.y - 80)) < p.r + 70;
}

// ---------- tiny software rasteriser: everything is drawn on the 2px grid ----------
function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(q2(x), q2(y), Math.max(2, q2(w)), Math.max(2, q2(h))); }
function disc(c, cx, cy, r, col) {                               // r in 2px cells
  cx = q2(cx); cy = q2(cy); c.fillStyle = col;
  for (let j = -r; j <= r; j++) { const w = Math.floor(Math.sqrt(r * r + r - j * j)); c.fillRect(cx - w * 2, cy + j * 2, w * 4 + 2, 2); }
}
function ering(c, cx, cy, rx, ry, th, col) {                     // ellipse ring, radii in cells
  cx = q2(cx); cy = q2(cy); c.fillStyle = col; ry = Math.max(1, ry);
  const iy = ry - th, ix = rx - th;
  for (let j = -ry; j <= ry; j++) {
    const wo = Math.floor(rx * Math.sqrt(Math.max(0, 1 - j * j / (ry * ry))) + 0.5);
    let wi = -1; if (iy > 0 && ix > 0 && Math.abs(j) <= iy) wi = Math.floor(ix * Math.sqrt(Math.max(0, 1 - j * j / (iy * iy))) + 0.5);
    if (wi < 0) c.fillRect(cx - wo * 2, cy + j * 2, wo * 4 + 2, 2);
    else if (wo > wi) { c.fillRect(cx - wo * 2, cy + j * 2, (wo - wi) * 2, 2); c.fillRect(cx + wi * 2 + 2, cy + j * 2, (wo - wi) * 2, 2); }
  }
}
function ball(c, cx, cy, r, pal) {                               // inked 3-tone sphere, pal = [dark, base, light]
  disc(c, cx, cy, r + 1, INK); disc(c, cx, cy, r, pal[0]);
  disc(c, cx - 2, cy - 2, Math.max(1, r - 2), pal[1]);
  disc(c, cx - r * 0.7, cy - r * 0.7, Math.max(1, Math.round(r * 0.28)), pal[2]);
}
function line(c, x0, y0, x1, y1, col, th = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)), o = q2((th - 2) / 2); c.fillStyle = col;
  for (let i = 0; i <= n; i++) c.fillRect(q2(lerp(x0, x1, i / n)) - o, q2(lerp(y0, y1, i / n)) - o, th, th);
}
function poly(c, pts, col) {                                     // even-odd scanline fill on 2px rows
  let y0 = 1e9, y1 = -1e9; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  c.fillStyle = col;
  for (let y = q2(y0); y < y1; y += 2) {
    const sy = y + 1, xs = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= sy) !== (b[1] <= sy)) xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) { const xa = q2(xs[k]), xb = q2(xs[k + 1]); if (xb > xa) c.fillRect(xa, y, xb - xa, 2); }
  }
}
function polyO(c, pts, col, ink = INK) {                         // polygon with a 1-cell ink outline
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]) poly(c, pts.map(p => [p[0] + dx, p[1] + dy]), ink);
  poly(c, pts, col);
}
const sc = (pts, x, y, f = 1, s = 1) => pts.map(p => [x + p[0] * f * s, y + p[1] * s]);   // place a point list (f = facing flip, s = scale)

// ASCII art -> cached, inked canvas. '.' is empty, every other char picks a colour from pal.
const ARTS = {};
function art(key, rows, pal) {
  if (ARTS[key]) return ARTS[key];
  const h = rows.length, w = rows[0].length, cv = document.createElement('canvas');
  cv.width = (w + 2) * 2; cv.height = (h + 2) * 2; const c = cv.getContext('2d');
  c.fillStyle = INK;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] !== '.') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || rows[ny][nx] === '.') c.fillRect((nx + 1) * 2, (ny + 1) * 2, 2, 2); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch !== '.') { c.fillStyle = pal[ch]; c.fillRect((x + 1) * 2, (y + 1) * 2, 2, 2); } }
  return ARTS[key] = cv;
}
function blit(c, cv, x, y, flip, alpha) {
  const w = cv.width, h = cv.height, px = q2(x - w / 2), py = q2(y - h / 2);
  c.save(); if (alpha !== undefined && alpha < 1) c.globalAlpha *= Math.max(0, alpha); c.imageSmoothingEnabled = false;
  if (flip) { c.translate(px + w, 0); c.scale(-1, 1); c.drawImage(cv, 0, py); } else c.drawImage(cv, px, py);
  c.restore();
}

// ---------- shared effects ----------
function burst(x, y, cols, n, spd, life, grav) {                 // little pixel confetti, deterministic per call
  const seed = Math.floor(x * 7 + y * 3 + (game.tick || 0));
  return addFx({ life, draw(c, f) {
    for (let i = 0; i < n; i++) {
      const a = hs(seed + i) * 6.283, v = spd * (0.4 + hs(seed + i * 3 + 1) * 0.8), t = f.t;
      const s = t > life * 0.65 ? 2 : (i % 3 ? 4 : 6);
      R(c, x + Math.cos(a) * v * t * 0.9 - s / 2, y + Math.sin(a) * v * t * 0.9 + (grav || 0) * t * t * 0.5 - s / 2, s, s, cols[i % cols.length]);
    }
  } });
}
function shock(x, y, col, life, r0, r1, flat, th) {              // expanding ring (flat < 1 squashes it into a ground wave)
  return addFx({ life, draw(c, f) {
    const k = f.t / life, r = lerp(r0, r1, 1 - (1 - k) * (1 - k)) / 2, tk = Math.max(1, Math.round((th || 3) * (1 - k)));
    c.save(); c.globalAlpha = 1 - k * k; ering(c, x, y, Math.round(r), Math.max(1, Math.round(r * (flat || 1))), tk, col); c.restore();
  } });
}
function ghost(self, anim, fr, life, alpha, tint) {              // after-image of the attacker
  const x = self.x, y = self.y, face = self.face;
  return addFx({ life, draw(c, f) { sprite(c, self, anim, fr, x, y, { face, a: alpha * (1 - f.t / life), tint }); } });
}
function bubbleText(x, y, str, col, life) {                      // rising pixel word
  return addFx({ life: life || 40, front: true, draw(c, f) { c.save(); c.globalAlpha = 1 - ph(f.t, (life || 40) * 0.6, life || 40); ptext(c, str, x, y - f.t * 0.8, 2, col, 'center'); c.restore(); } });
}
function dustRun(x, y, dir, life) {                              // ground kick-up while rushing
  return addFx({ life: life || 14, draw(c, f) { for (let i = 0; i < 4; i++) { const s = 2 + (i % 2) * 2, k = f.t + i * 2; R(c, x - dir * (6 + i * 6 + f.t * 1.6), y - 2 - k * 0.8 - i, s, s, i % 2 ? '#c9b99a' : '#8a7e6b'); } } });
}

// ---------- per-tick driver: engine only calls fx.update once per tick, so rushes / traps / vanishes live in here ----------
// step(d, i) runs each tick (i = 1,2,..) and returns true when done; end(aborted) always runs once at the end.
function drive(self, life, step, end, draw) {
  let over = false;
  const fin = ab => { if (!over) { over = true; if (end) end(ab); } };
  const d = addFx({ life: life + 4, front: true,
    update(d) {
      if (over) { d.life = 1; return; }
      if (game.phase !== 'fight' || (self.state !== 'special' && self.state !== 'super')) { fin(true); d.life = 1; return; }
      if (step(d, d.t) || d.t >= life) { fin(false); d.life = 1; }
    },
    draw(c, d) { if (draw && !over) draw(c, d); } });
  return d;
}

// ---------- fighter sprite for finishers (drawSprite when sheets exist, a plain block otherwise) ----------
let TMP = null;
function sprite(c, f, anim, fr, x, y, o) {
  o = o || {};
  c.save(); c.translate(Math.round(x), Math.round(y));
  if (o.rot) c.rotate(o.rot);
  if (o.sx !== undefined || o.sy !== undefined) c.scale(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
  if (o.a !== undefined) c.globalAlpha *= cl(o.a, 0, 1);
  if (o.clip) { c.beginPath(); c.rect(-400, -600, 800, 600); c.clip(); }
  const face = o.face || f.face || 1, can = typeof drawSprite === 'function';
  if (o.tint && can) {
    if (!TMP) { TMP = document.createElement('canvas'); TMP.width = 320; TMP.height = 320; }
    const t = TMP.getContext('2d'); t.clearRect(0, 0, 320, 320); t.imageSmoothingEnabled = false;
    drawSprite(t, f.d.id, anim, fr, 160, 280, face, o.scale);
    t.globalCompositeOperation = 'source-atop'; t.fillStyle = o.tint; t.fillRect(0, 0, 320, 320); t.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false; c.drawImage(TMP, -160, -280);
  } else if (can) drawSprite(c, f.d.id, anim, fr, 0, 0, face, o.scale);
  else { c.fillStyle = INK; c.fillRect(-30, -154, 60, 154); c.fillStyle = f.d.col; c.fillRect(-26, -150, 52, 146); }
  c.restore();
}
function shadow(c, x, w, a) { c.save(); c.fillStyle = 'rgba(0,0,0,' + (a === undefined ? 0.45 : a) + ')'; c.beginPath(); c.ellipse(x, GROUND + 2, w, w * 0.18, 0, 0, 7); c.fill(); c.restore(); }

// ---------- finisher scaffold ----------
// A finisher owns both fighters: it hides them, moves their real x/y (so the camera follows) and draws them itself.
// FS.w / FS.l describe how each one is drawn this tick: { anim, fr, x, y, face, sx, sy, rot, a, tint, scale, clip }.
let FS = null;
function fstart(self, opp, gap) {
  const dir = self.x <= opp.x ? 1 : -1, cx = cl(opp.x, 260, 960 - 260);
  FS = { dir, cx, wx0: self.x, lx0: opp.x, gap: gap || 130, over: false,
    w: { anim: 'idle', fr: 0, x: self.x, face: dir }, l: { anim: 'hit', fr: 0, x: opp.x, face: -dir } };
  self.hidden = true; opp.hidden = true; self.vx = opp.vx = 0; self.vy = opp.vy = 0; self.y = opp.y = GROUND;
  return FS;
}
// slide the loser to the stage centre and bring the winner in, over the first n ticks
function fgather(self, opp, t, n) {
  const k = ease(ph(t, 0, n));
  opp.x = lerp(FS.lx0, FS.cx, k); self.x = lerp(FS.wx0, FS.cx - FS.dir * FS.gap, k);
  self.face = FS.dir; opp.face = -FS.dir;
  return k;
}
function fput(self, opp) {                                       // publish the draw descriptors for this tick
  FS.w = FS.w || {}; FS.l = FS.l || {};
  FS.w.x = self.x; FS.l.x = opp.x;
}
function fdraw(c, self, opp, extra) {
  if (!FS) return;
  const W_ = FS.w, L_ = FS.l; if (!W_ || !L_) return;
  const order = (W_.front ? [L_, W_] : [W_, L_]);
  // once the finisher is over the engine draws the winner again (and the loser too unless it stays hidden behind the prop)
  const wOff = W_.hide || FS.over, lOff = L_.hide || (FS.over && !FS.keepL);
  if (!lOff) shadow(c, L_.x, 40 * (L_.shw === undefined ? 1 : L_.shw), L_.shadow);
  if (!wOff) shadow(c, W_.x, 40 * (W_.shw === undefined ? 1 : W_.shw), W_.shadow);
  for (const d of order) if (!(d === W_ ? wOff : lOff)) sprite(c, d === W_ ? self : opp, d.anim, d.fr, d.x, d.y === undefined ? GROUND : d.y, d);
  if (extra) extra();
}
// last finisher tick: give the winner back, keep the loser defeated (hidden behind the aftermath prop drawn from fin.draw)
function fend(self, opp, keepLoserHidden) {
  if (!FS || FS.over) return; FS.over = true; FS.keepL = !!keepLoserHidden;
  self.hidden = false; self.x = FS.wxEnd === undefined ? self.x : FS.wxEnd; self.y = GROUND; self.vx = self.vy = 0; self.face = FS.dir;
  opp.x = FS.lxEnd === undefined ? opp.x : FS.lxEnd; opp.y = GROUND; opp.vx = opp.vy = 0;
  if (keepLoserHidden) opp.hidden = true; else { opp.hidden = false; opp.set('ko'); opp.st = 60; }
}

// ---------- shared move builders ----------
const lf = (n, t, spd) => Math.floor(t / spd) % n;               // looping frame index
function zig(c, x0, y0, x1, y1, seg, jit, seed, cols, th) {      // jittery lightning path, cols = [outer, mid, core]
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / seg)), pts = [], nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= n; i++) { const k = i / n, j = i === 0 || i === n ? 0 : (hs(seed + i * 5.3) - 0.5) * 2 * jit; pts.push([lerp(x0, x1, k) + nx / nl * j, lerp(y0, y1, k) + ny / nl * j]); }
  for (let i = 0; i < n; i++) { line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cols[0], th + 4); }
  for (let i = 0; i < n; i++) { line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cols[1], th); }
  for (let i = 0; i < n; i++) { line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cols[2], Math.max(2, th - 4)); }
}
// constant-speed advance toward the foe with one contact check; o = { dist, n, reach, dmg, kb, stun, kind, yOff(i), onHit, end, draw, trail }
function rush(self, opp, o) {
  const dir = self.face, v = o.dist / o.n; let landed = false, stopped = false;
  return drive(self, o.n + 2, (d, i) => {
    self.vx = 0; self.vy = 0;
    if (!stopped) self.x = cl(self.x + dir * v, 46, 960 - 46);
    if (o.yOff) self.y = GROUND - o.yOff(i);
    if (o.trail) o.trail(self, i, dir);
    if (!landed && Math.abs(opp.x - self.x) < o.reach && Math.abs(opp.y - self.y) < 110 && !opp.hidden) {
      landed = true; stopped = true;
      if (strike(self, opp, o.dmg, o.kb, o.stun, o.kind) && o.onHit) o.onHit(self, opp);
    }
    return i >= o.n;
  }, ab => { self.vx = 0; if (o.yOff) { self.y = ab ? self.y : GROUND; self.vy = 0; } if (o.end) o.end(self, ab); }, o.draw);
}

// ======================================================================================================
// TIBO: lightning, commits, deploys. Blue, sharp, fast projectiles.
// ======================================================================================================
const BOLT = [[4, -28], [16, -28], [8, -8], [16, -8], [-8, 28], [-2, 4], [-10, 4]].map(p => [p[1], -p[0]]);
function boltShape(c, x, y, f, s, pal) {                         // horizontal inked lightning bolt pointing along f
  const pts = sc(BOLT, x, y, f, s);
  polyO(c, pts, pal[0]); poly(c, sc(BOLT.map(p => [p[0] * 0.62, p[1] * 0.6 - 1]), x - f * 2, y - 2, f, s), pal[1]);
}
function zap(x, y, big) {
  burst(x, y, ['#ffffff', '#fff3b0', '#7cc7ff', '#ffd23f'], big ? 22 : 12, big ? 5.5 : 3.6, big ? 26 : 18, 0.05);
  shock(x, y, '#7cc7ff', big ? 22 : 14, 16, big ? 150 : 80, 1, big ? 4 : 3);
  sparks(x, y, '#fff3b0', big ? 18 : 8); snd(big ? 180 : 420, 0.12, 'square', 0.05);
}
function column(c, x, base, h, t, life, seed) {                  // vertical lightning column (REVERT)
  const k = ph(t, 0, 4) * (1 - ph(t, life - 6, life)), top = base - h * Math.min(1, t / 4);
  c.save(); c.globalAlpha = 1 - ph(t, life - 5, life) * 0.8;
  const w = 26 * (1 - ph(t, 6, life) * 0.6);
  zig(c, x, base, x + (hs(seed + t) - 0.5) * 18, top, 18, 22, seed + t * 3.7, ['#3a6fd6', '#7cc7ff', '#ffffff'], 8);
  zig(c, x - 18, base, x - 10, top + 40, 14, 14, seed + t * 2.1 + 9, ['#3a6fd6', '#cfe8ff', '#ffffff'], 4);
  zig(c, x + 18, base, x + 12, top + 70, 14, 14, seed + t * 1.3 + 4, ['#3a6fd6', '#cfe8ff', '#ffffff'], 4);
  ering(c, x, base - 2, 14 + Math.round(t * 1.4), Math.max(2, 4 + Math.round(t * 0.4)), 2, '#cfe8ff');
  c.restore();
}

const TIBO = {
  sp: [
    { name: 'COMMIT BOLT', input: 'L', anim: 'special', len: 28, hit: 12, cool: 28, ai: { min: 200, max: 560 },
      start(self) { const f = self.face; addFx({ life: 12, draw(c, fx) { const x = self.x + f * 46, y = self.y - 104, r = Math.round(10 - fx.t * 0.7); ering(c, x, y, Math.max(2, r), Math.max(2, r), 2, '#7cc7ff'); disc(c, x, y, 1 + (fx.t >> 2), '#ffffff'); } }); snd(500, 0.12, 'triangle', 0.05, 0.6); },
      fire(self) {
        const f = self.face; snd(900, 0.16, 'sawtooth', 0.06, 0.4); jolt(2, 0, 0);
        addProj(self, { x: self.x + f * 52, y: self.y - 104, vx: f * 11, r: 20, life: 90, dmg: 9 * self.d.pow, kb: 6, stun: 16,
          update(p) { p.x += p.vx; if (!p.fxd && probe(p)) { p.fxd = 1; zap(p.x, p.y); } },
          draw(c, p) {
            const f = sgn(p.vx), a = 0.5 + 0.5 * Math.sin(p.t * 0.9);
            for (let k = 3; k >= 1; k--) boltShape(c, p.x - f * k * 22, p.y, f, 1.4 - k * 0.24, k % 2 ? ['#3a6fd6', '#7cc7ff'] : ['#2a4fa0', '#4f8de0']);
            ering(c, p.x, p.y, 21, 15 + (a > 0.5 ? 1 : 0), 2, 'rgba(124,199,255,0.7)');
            boltShape(c, p.x, p.y, f, 1.75, ['#ffd23f', '#ffffff']);
          } });
      } },
    { name: 'HOTFIX RUSH', input: 'FWD+L', anim: 'kick', len: 36, hit: 10, cool: 42, ai: { min: 110, max: 340 },
      start(self) { addFx({ life: 10, draw(c, fx) { const f = self.face; for (let i = 0; i < 4; i++) R(c, self.x - f * (30 + i * 8 + fx.t * 3), self.y - 30 - i * 24, 18 - fx.t, 2, '#cfe8ff'); } }); snd(260, 0.12, 'square', 0.04, 1.4); },
      fire(self, opp) {
        snd(700, 0.1, 'sawtooth', 0.06, -0.5); let gt = 0;
        rush(self, opp, { dist: 240, n: 12, reach: 62, dmg: 12, kb: 8, stun: 22, kind: 'kick',
          trail(s, i, dir) { if (i % 2 === 0) ghost(s, 'kick', 2, 9, 0.45, 'rgba(124,199,255,0.8)'); if (i % 3 === 0) dustRun(s.x, GROUND, dir, 12); },
          onHit(s, o) { zap(o.x - s.face * 20, o.y - 90); jolt(8, 5, 2); },
          draw(c, d) { const f = self.face; for (let i = 0; i < 5; i++) { const y = self.y - 20 - i * 28 - hs(d.t + i) * 8; R(c, self.x - f * (40 + hs(i + d.t) * 30) - 30, y, 40 + hs(i * 3 + d.t) * 30, 2, i % 2 ? '#ffffff' : '#7cc7ff'); } } });
      } },
    { name: 'REVERT', input: 'DOWN+L', anim: 'punch', len: 36, hit: 10, cool: 46, ai: { min: 0, max: 150 },
      start(self) { addFx({ life: 10, draw(c, fx) { const x = self.x + self.face * 62; ering(c, x, GROUND - 2, 16 - fx.t, 3, 2, '#7cc7ff'); } }); snd(300, 0.1, 'triangle', 0.04, 1); },
      fire(self, opp) {
        const px = self.x + self.face * 62, seed = Math.floor(px) % 97; snd(1000, 0.2, 'sawtooth', 0.06, -0.8); jolt(8, 3, 3); dust(px, GROUND);
        addFx({ life: 18, draw(c, fx) { column(c, px, GROUND, 330, fx.t, 18, seed); } });
        if (Math.abs(opp.x - px) < 84 && opp.y > GROUND - 340 && !opp.hidden && strike(self, opp, 11, 11, 28, 'hit')) { zap(opp.x, opp.y - 100); jolt(8, 5, 0); }
      } },
  ],
  su: { name: 'PUSH TO PROD', anim: 'super', len: 58, hit: 22, cool: 70, col: '#7cc7ff', ai: { min: 0, max: 520 },
    start(self) { const f = self.face; addFx({ life: 24, draw(c, fx) { for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + fx.t * 0.2, r = 70 - fx.t * 2.6; R(c, self.x + f * 40 + Math.cos(a) * r, self.y - 100 + Math.sin(a) * r, 6, 6, i % 2 ? '#ffffff' : '#7cc7ff'); } ering(c, self.x + f * 40, self.y - 100, 4 + (fx.t >> 1), 4 + (fx.t >> 1), 2, 'rgba(255,255,255,0.8)'); } }); snd(200, 0.5, 'sawtooth', 0.06, 2); },
    fire(self) {
      const f = self.face; jolt(14, 4, 6); snd(110, 0.5, 'sawtooth', 0.09, 0.5); thd(0.3, 0.2);
      const hashes = ['A3F9C2E', 'MERGED', '0XDEAD', 'LGTM', 'SHIP IT'];
      addProj(self, { x: self.x + f * 50, y: self.y - 100, vx: f * 15, r: 46, life: 70, dmg: 24 * self.d.pow, kb: 14, stun: 34, super: true,
        update(p) { p.x += p.vx; if (!p.fxd && probe(p)) { p.fxd = 1; zap(p.x, p.y, true); jolt(16, 8, 6); } if (p.t % 4 === 0) dust(p.x - sgn(p.vx) * 40, GROUND); },
        draw(c, p) {
          const f = sgn(p.vx), len = Math.min(300, 40 + p.t * 30), tail = p.x - f * len;
          for (let i = 0; i < len / 4; i++) {
            const x = p.x - f * i * 4, k = i * 4 / len, h = 36 * (1 - k * 0.7) + (hs(i + p.t * 0.7) - 0.5) * 8;
            R(c, x - 2, p.y - h - 4, 4, h * 2 + 8, i % 3 ? '#1d3f86' : '#25509e'); R(c, x - 2, p.y - h, 4, h * 2, '#4f8de0'); R(c, x - 2, p.y - h * 0.62, 4, h * 1.24, '#a7d4ff'); R(c, x - 2, p.y - h * 0.26, 4, h * 0.52, '#ffffff');
          }
          for (let i = 0; i < 3; i++) { const hx = p.x - f * (90 + i * 100); if (Math.abs(hx - p.x) < len - 50) ptext(c, hashes[i + (p.t >> 3) % 2 * 2], hx, p.y - 54, 2, '#cfe8ff', 'center'); }
          boltShape(c, p.x + f * 6, p.y, f, 2.1, ['#ffd23f', '#ffffff']);
          ering(c, p.x + f * 4, p.y, 28, 24, 3, 'rgba(207,232,255,0.8)');
        } });
    } },
  fin: null,
};
// OUTAGE: a server rack stamped "503" drops on the loser and stays on top as the aftermath
function rack(c, x, yb, w, h, t, lit) {
  const x0 = x - w / 2, y0 = yb - h;
  R(c, x0 - 2, y0 - 2, w + 4, h + 4, INK); R(c, x0, y0, w, h, '#33466e'); R(c, x0, y0, w, 6, '#5f80b8'); R(c, x0, y0, 6, h, '#4a6498'); R(c, x0 + w - 6, y0, 6, h, '#22304f'); R(c, x0, yb - 8, w, 8, '#1a2542');
  for (let i = 0; i < 3; i++) { R(c, x0 + 14, y0 + 10 + i * 8, w - 28, 2, '#1a2542'); }
  for (let i = 0; i < 6; i++) R(c, x0 + 14 + i * 8, y0 + 34, 4, 4, lit && (i + (t >> 3)) % 3 === 0 ? '#ffb4b4' : '#e23d3d');
  ptext(c, '503', x, y0 + 46, 6, '#ff6b6b', 'center', false);
  ptext(c, 'SERVICE UNAVAILABLE', x, y0 + 8 + 0, 1, '#a7c4f2', 'center', false);
}
TIBO.fin = (() => {
  const LEN = 210, DROP = 62, HIT = 86;
  const slabY = t => t < DROP ? -150 : t < HIT ? lerp(-150, GROUND - 14, Math.pow((t - DROP) / (HIT - DROP), 2)) : GROUND - 14 - (t < HIT + 10 ? Math.sin((t - HIT) / 10 * Math.PI) * 14 : 0);
  return { name: 'OUTAGE', len: LEN,
    start(self, opp) { fstart(self, opp, 150); snd(200, 0.6, 'sawtooth', 0.06, -0.4); },
    update(self, opp, t) {
      fgather(self, opp, t, 16); const W_ = FS.w, L_ = FS.l; W_.x = self.x; L_.x = opp.x; W_.face = FS.dir; L_.face = -FS.dir;
      if (t < 16) { W_.anim = 'walk'; W_.fr = lf(8, t, 2); } else if (t < 56) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, 16, 56) * 6)); }
      else if (t < 100) { W_.anim = 'idle'; W_.fr = lf(6, t, 8); } else { W_.anim = 'win'; W_.fr = lf(6, t, 6); }
      L_.anim = 'hit'; L_.fr = [0, 1, 0, 2][lf(4, t, 14)];
      if (t === 40) snd(140, 0.5, 'square', 0.05, 0.5);
      if (t === HIT) {
        jolt(22, 12, 8); thd(0.4, 0.25); snd(70, 0.5, 'sawtooth', 0.09, -0.3); const x = opp.x;
        burst(x, GROUND - 14, ['#ffffff', '#a7c4f2', '#ff6b6b', '#ffd23f'], 26, 6, 26, 0.12); shock(x, GROUND - 4, '#cfe8ff', 24, 20, 360, 0.18, 4); sparks(x, GROUND - 60, '#fff3b0', 16); dust(x - 40, GROUND); dust(x + 40, GROUND);
      }
      if (t >= HIT) { L_.sx = 1.5; L_.sy = 0.1; L_.fr = 2; L_.shadow = 0; }
      if (t >= LEN) { FS.lxEnd = opp.x; fend(self, opp, true); }
    },
    draw(c, self, opp, t) {
      if (!FS) return; const tt = Math.min(t, LEN);
      if (tt >= DROP - 24 && tt < HIT) { const a = ph(tt, DROP - 24, HIT); c.save(); c.fillStyle = 'rgba(0,0,0,' + (0.15 + a * 0.35) + ')'; c.beginPath(); c.ellipse(opp.x, GROUND + 2, 30 + a * 60, 8 + a * 6, 0, 0, 7); c.fill(); c.restore(); }
      fdraw(c, self, opp, () => { if (tt >= DROP) rack(c, opp.x, slabY(tt), 150, 100, tt, tt >= HIT); });
    } };
})();


// ======================================================================================================
// POTETO: sweet potatoes, heat and hot takes. Orange and gold, lobbed and falling things.
// ======================================================================================================
const SPUD_PAL = ['#b8501a', '#ec8a2a', '#ffd070'];
function boom(x, y, big, cols, ring) {                           // generic impact: confetti, ring, sparks
  burst(x, y, cols, big ? 22 : 12, big ? 5.5 : 3.6, big ? 26 : 18, 0.08); shock(x, y, ring, big ? 22 : 14, 16, big ? 150 : 80, 1, big ? 4 : 3);
  sparks(x, y, cols[0], big ? 16 : 8); snd(big ? 150 : 300, 0.12, 'square', 0.05);
}
const spudBoom = (x, y, big) => boom(x, y, big, ['#ffffff', '#ffd070', '#ff7a1a', '#ec8a2a'], '#ffb02e');
function spud(c, x, y, r, rot, hot) {                            // inked sweet potato (r in cells) with rotating eyes
  if (hot) ering(c, x, y, r + 3, r + 3, 2, 'rgba(255,122,30,0.55)');
  ball(c, x, y, r, SPUD_PAL);
  for (const o of [-0.45, 0.45]) { const a = (rot || 0) + o; if (Math.cos(a) > -0.2) R(c, x + Math.sin(a) * r * 1.5 - 2, y + Math.cos(a * 1.3) * r * 0.5 - 4, 4, 6, INK); }
}
function steam(c, x, y, t) { for (let i = 0; i < 3; i++) { const k = ((t + i * 7) % 22) / 22; R(c, x + (i - 1) * 8 + Math.sin(t * 0.2 + i * 2) * 3, y - 10 - k * 26, 4, 4, 'rgba(255,255,255,' + (0.8 - k * 0.7) + ')'); } }
function warn(c, x, k, col) { c.save(); c.globalAlpha = 0.3 + 0.5 * k; ering(c, x, GROUND + 2, Math.round(12 + k * 22), Math.round(3 + k * 3), 2, col); c.restore(); }

const POTETO = {
  sp: [
    { name: 'HOT POTATO', input: 'L', anim: 'special', len: 30, hit: 12, cool: 30, ai: { min: 160, max: 520 },
      start(self) { const f = self.face; addFx({ life: 12, draw(c, fx) { spud(c, self.x + f * 40, self.y - 112 - fx.t, 4 + (fx.t >> 2), fx.t * 0.4, true); } }); snd(300, 0.14, 'triangle', 0.05, 0.8); },
      fire(self) {
        const f = self.face; snd(420, 0.14, 'sawtooth', 0.06, -0.4); jolt(2, 0, 0);
        addProj(self, { x: self.x + f * 44, y: self.y - 112, vx: f * 7.5, vy: -9, r: 18, life: 130, dmg: 9 * self.d.pow, kb: 6, stun: 16, n: 0,
          update(p) {
            p.x += p.vx; p.vy += 0.55; p.y += p.vy;
            if (p.y > GROUND - 18 && p.vy > 0) { if (p.n >= 2) p.life = 0; else { p.n++; p.y = GROUND - 18; p.vy = -p.vy * 0.62; dust(p.x, GROUND); thd(0.05, 0.05); } }
            if (!p.fxd && probe(p)) { p.fxd = 1; spudBoom(p.x, p.y); }
          },
          draw(c, p) {
            const f = sgn(p.vx);
            for (let k = 1; k <= 4; k++) R(c, p.x - f * k * 10, p.y + k * 2 - hs(p.t + k) * 8, 6 - k, 6 - k, k % 2 ? '#ffd070' : '#ff7a1a');
            spud(c, p.x, p.y, 9, p.t * 0.25 * f, true); steam(c, p.x, p.y - 18, p.t);
          } });
      } },
    { name: 'HOT TAKE', input: 'FWD+L', anim: 'kick', len: 40, hit: 10, cool: 44, ai: { min: 120, max: 340 },
      start(self) { bubbleText(self.x, self.y - 190, 'HOT TAKE', '#ffb02e', 32); snd(240, 0.12, 'square', 0.04, 1.2); },
      fire(self, opp) {
        snd(520, 0.14, 'sawtooth', 0.06, 0.6);
        rush(self, opp, { dist: 240, n: 16, reach: 62, dmg: 12, kb: 9, stun: 22, kind: 'kick', yOff: i => Math.sin(Math.PI * i / 16) * 70,
          trail(s, i) { if (i % 2 === 0) ghost(s, 'kick', 2, 10, 0.45, 'rgba(255,140,40,0.8)'); },
          onHit(s, o) { spudBoom(o.x - s.face * 18, o.y - 90, true); jolt(8, 5, 2); },
          draw(c, d) { const f = self.face; for (let i = 0; i < 6; i++) { const k = i / 6; R(c, self.x - f * (16 + i * 12) - 4, self.y - 30 - hs(d.t + i) * 40, 8 - i, 8 - i, i % 2 ? '#ffd070' : '#ff7a1a'); } } });
      } },
    { name: 'TATER DROP', input: 'DOWN+L', anim: 'special', len: 46, hit: 18, cool: 50, ai: { min: 90, max: 420 },
      start(self, opp) { addFx({ life: 18, draw(c, fx) { warn(c, opp.x, fx.t / 18, '#ff7a1a'); } }); snd(180, 0.2, 'triangle', 0.05, 0.6); },
      fire(self, opp) {
        const px = opp.x, FALL = 14; snd(150, 0.3, 'sawtooth', 0.06, -0.5);
        addFx({ life: FALL + 12,
          update(fx) {
            if (fx.t !== FALL) return;
            jolt(12, 4, 3); thd(0.3, 0.2); dust(px - 30, GROUND); dust(px + 30, GROUND); shock(px, GROUND - 4, '#ffd070', 18, 20, 220, 0.2, 4);
            if (game.phase === 'fight' && !opp.hidden && Math.abs(opp.x - px) < 70 && opp.y > GROUND - 160 && strike(self, opp, 12, 9, 26, 'hit')) spudBoom(opp.x, opp.y - 90, true);
          },
          draw(c, fx) {
            const k = Math.min(1, fx.t / FALL); warn(c, px, k, '#ff7a1a');
            if (fx.t < FALL) { spud(c, px, lerp(-110, GROUND - 46, k * k), 22, fx.t * 0.3, true); for (let i = 0; i < 5; i++) R(c, px - 24 + i * 12, lerp(-110, GROUND - 46, k * k) - 60 - i * 6, 4, 40, i % 2 ? '#ffd070' : '#ff7a1a'); }
            else if (fx.t < FALL + 8) { c.save(); c.globalAlpha = 1 - (fx.t - FALL) / 8; spud(c, px, GROUND - 40, 22 - (fx.t - FALL), 0, true); c.restore(); }
          } });
      } },
  ],
  su: { name: 'SWEET POTATO STORM', anim: 'super', len: 62, hit: 20, cool: 70, col: '#ffb02e', ai: { min: 0, max: 480 },
    start(self) { const f = self.face; addFx({ life: 22, draw(c, fx) { spud(c, self.x + f * 30, self.y - 130 - fx.t * 5, 8 + (fx.t >> 1), fx.t * 0.3, true); } }); snd(200, 0.5, 'sawtooth', 0.06, 2); },
    fire(self, opp) {
      jolt(12, 4, 5); snd(110, 0.5, 'sawtooth', 0.09, 0.5); thd(0.3, 0.2); const N = 5;
      for (let i = 0; i < N; i++) game.later(i * 8, () => {
        if (game.phase !== 'fight') return; const last = i === N - 1;
        addProj(self, { x: cl(opp.x + (hs(i + 4) - 0.5) * 36, 60, 900), y: -70, vy: 22, r: 22, life: 60, dmg: (last ? 7 : 4.5) * self.d.pow, kb: last ? 12 : 3, stun: last ? 34 : 14, super: true, noClash: true,
          update(p) {
            p.y += p.vy;
            if (!p.fxd && probe(p)) { p.fxd = 1; spudBoom(p.x, p.y, last); jolt(last ? 14 : 6, last ? 8 : 3, 0); }
            if (p.y > GROUND - 24) { if (!p.fxd) { dust(p.x, GROUND); spudBoom(p.x, GROUND - 30, false); } p.life = 0; }
          },
          draw(c, p) { const k = ph(p.y, -70, GROUND - 24); warn(c, p.x, k, '#ff7a1a'); for (let j = 0; j < 4; j++) R(c, p.x - 18 + j * 12, p.y - 50 - j * 8, 4, 40, j % 2 ? '#ffd070' : '#ff7a1a'); spud(c, p.x, p.y, 11, p.t * 0.3, true); } });
        snd(380 - i * 30, 0.1, 'square', 0.04);
      });
    } },
  fin: null,
};
// MASHED UP: a giant masher slams the loser flat three times and leaves a buttered mound of mash
function masher(c, x, yb) {
  R(c, x - 8, yb - 330, 16, 300, INK); R(c, x - 6, yb - 330, 12, 298, '#8d99ae'); R(c, x - 6, yb - 330, 4, 298, '#d6deeb'); R(c, x + 2, yb - 330, 4, 298, '#5d6980');
  R(c, x - 58, yb - 22, 116, 24, INK); R(c, x - 56, yb - 20, 112, 20, '#8d99ae'); R(c, x - 56, yb - 20, 112, 4, '#d6deeb'); R(c, x - 56, yb - 6, 112, 6, '#5d6980');
  for (let i = 0; i < 6; i++) R(c, x - 48 + i * 18, yb - 14, 8, 6, INK);
}
function mound(c, x, k, t) {                                     // pile of mash (k 0..1 grows) with a pat of butter on top
  const b = GROUND, s = 0.4 + 0.6 * k, blobs = [[-26, -10, 12], [24, -12, 11], [0, -22, 15], [-8, -34, 9], [14, -32, 8]];
  for (const [dx, dy, r] of blobs) disc(c, x + dx * s * 1.3, b + dy * s, Math.round(r * s) + 1, INK);
  for (const [dx, dy, r] of blobs) disc(c, x + dx * s * 1.3, b + dy * s, Math.round(r * s), '#f2c94c');
  for (const [dx, dy, r] of blobs) disc(c, x + dx * s * 1.3 - 2, b + dy * s - 2, Math.max(1, Math.round(r * s) - 2), '#ffe27a');
  for (let i = 0; i < 5; i++) R(c, x - 30 + i * 14, b - 14 - (i % 2) * 14, 8, 2, '#d9a93a');
  if (k > 0.8) { R(c, x - 12, b - 64 * s, 26, 14, INK); R(c, x - 10, b - 62 * s, 22, 10, '#fff3a0'); R(c, x - 10, b - 62 * s, 22, 3, '#ffffff'); steam(c, x, b - 68 * s, t); steam(c, x + 28, b - 44 * s, t + 9); }
}
POTETO.fin = (() => {
  const LEN = 220, TOP = GROUND - 230, B = [GROUND - 104, GROUND - 60, GROUND - 24], SLAM = [80, 100, 120];
  const KEYS = [[0, -330], [54, -330], [72, TOP], [76, TOP], [80, B[0]], [86, B[0]], [92, TOP], [96, TOP], [100, B[1]], [106, B[1]], [112, TOP], [116, TOP], [120, B[2]], [134, B[2]], [164, -330]];
  const mY = t => { for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) return lerp(KEYS[i - 1][1], KEYS[i][1], ph(t, KEYS[i - 1][0], KEYS[i][0])); return -330; };
  return { name: 'MASHED UP', len: LEN,
    start(self, opp) { fstart(self, opp, 150); snd(200, 0.6, 'sawtooth', 0.06, -0.4); },
    update(self, opp, t) {
      fgather(self, opp, t, 16); const W_ = FS.w, L_ = FS.l; W_.x = self.x; L_.x = opp.x; W_.face = FS.dir; L_.face = -FS.dir;
      if (t < 16) { W_.anim = 'walk'; W_.fr = lf(8, t, 2); } else if (t < 60) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, 16, 60) * 6)); }
      else if (t < 140) { W_.anim = 'idle'; W_.fr = lf(6, t, 8); } else { W_.anim = 'win'; W_.fr = lf(6, t, 6); }
      L_.anim = 'hit'; L_.fr = [0, 1, 0, 2][lf(4, t, 14)];
      const n = SLAM.filter(s => t >= s).length; L_.sy = [1, 0.62, 0.34, 0.1][n]; L_.sx = [1, 1.2, 1.45, 1.7][n]; L_.hide = n >= 3;
      if (n > 0) { L_.fr = 2; L_.shadow = 0; }
      if (SLAM.includes(t)) {
        const x = opp.x, big = t === SLAM[2]; jolt(big ? 22 : 14, big ? 12 : 8, big ? 8 : 3); thd(0.4, 0.25); snd(big ? 70 : 90, 0.4, 'sawtooth', 0.09, -0.3);
        burst(x, GROUND - 40, ['#ffe27a', '#f2c94c', '#fff3a0', '#ffffff'], big ? 30 : 18, 6, 26, 0.12); shock(x, GROUND - 4, '#ffe27a', 22, 20, big ? 360 : 240, 0.18, 4); dust(x - 40, GROUND); dust(x + 40, GROUND);
      }
      if (t >= LEN) { FS.lxEnd = opp.x; fend(self, opp, true); }
    },
    draw(c, self, opp, t) {
      if (!FS) return; const tt = Math.min(t, LEN), my = mY(tt);
      fdraw(c, self, opp, () => {
        const n = SLAM.filter(s => tt >= s).length; if (n >= 3) mound(c, opp.x, Math.min(1, (tt - SLAM[2]) / 12 + 0.35), tt);
        if (my > -300) masher(c, opp.x, my);
      });
    } };
})();


// ======================================================================================================
// DOT: soft round blob, fast and fragile. White and lavender, ellipses, typing bubbles, pop-ins.
// ======================================================================================================
const PEARL = ['#b9b4c8', '#f8f6f1', '#ffffff'];
const dotBoom = (x, y, big) => boom(x, y, big, ['#ffffff', '#e6defa', '#b9a7ff', '#8fd8ff'], '#e6defa');
function eyes(c, x, y, a, R_, sz, col) {                         // one pair of eyes on a rolling ball, a = angle around the ball
  const cs = Math.cos(a); if (cs < 0.05) return;
  for (const o of [-0.3, 0.3]) { const ex = x + Math.sin(a + o) * R_ * 0.9, ey = y - R_ * 0.12; R(c, ex - sz * cs, ey - sz * 1.3, sz * 2 * cs, sz * 2.6, col || INK); }
}
function pearl(c, x, y, r, rot, withEyes) {                      // r in cells
  ball(c, x, y, r, PEARL);
  if (withEyes) for (let k = 0; k < 3; k++) eyes(c, x, y, rot + k * 2.094, r * 2, Math.max(2, r * 0.17), INK);
}
function typing(c, x, y, t, n) {                                 // chat bubble with bouncing dots (n = how many dots are shown)
  R(c, x - 40, y - 24, 80, 48, INK); R(c, x - 38, y - 22, 76, 44, '#f8f6f1'); R(c, x - 38, y + 10, 76, 12, '#d8d2e8'); R(c, x - 42, y - 20, 84, 40, INK); R(c, x - 40, y - 22, 80, 44, '#f8f6f1'); R(c, x - 40, y + 10, 80, 12, '#d8d2e8');
  poly(c, [[x - 18, y + 22], [x - 30, y + 38], [x - 4, y + 22]], INK); poly(c, [[x - 18, y + 22], [x - 26, y + 34], [x - 8, y + 22]], '#d8d2e8');
  for (let i = 0; i < n; i++) disc(c, x - 20 + i * 20, y - 2 + Math.round(Math.sin(t * 0.3 + i * 1.2) * 4), 3, i === (t >> 3) % 3 ? '#8a7fb8' : '#5a5470');
}
function check(c, x, y, col) {                                   // read-receipt tick
  line(c, x - 10, y, x - 3, y + 8, INK, 8); line(c, x - 3, y + 8, x + 12, y - 10, INK, 8); line(c, x - 10, y, x - 3, y + 8, col, 4); line(c, x - 3, y + 8, x + 12, y - 10, col, 4);
}

const DOT = {
  sp: [
    { name: 'DOT DOT DOT', input: 'L', anim: 'special', len: 28, hit: 10, cool: 30, ai: { min: 140, max: 540 },
      start(self) { const f = self.face; addFx({ life: 14, draw(c, fx) { for (let i = 0; i < 3; i++) if (fx.t > i * 3) disc(c, self.x + f * (30 + i * 16), self.y - 110 - Math.round(Math.sin(fx.t * 0.5 + i) * 4), 3, '#ffffff'); } }); snd(500, 0.08, 'sine', 0.05, 0.4); },
      fire(self) {
        const f = self.face;
        for (let i = 0; i < 3; i++) game.later(i * 8, () => {
          if (game.phase !== 'fight') return; const last = i === 2; snd(600 + i * 150, 0.08, 'sine', 0.05, 0.3);
          addProj(self, { x: self.x + f * 50, y: self.y - 104, vx: f * 10, r: 14, life: 80, dmg: 3.5 * self.d.pow, kb: last ? 6 : 2, stun: last ? 16 : 9, by: self.y - 104,
            update(p) { p.x += p.vx; p.y = p.by + Math.sin(p.t * 0.35) * 5; if (!p.fxd && probe(p)) { p.fxd = 1; dotBoom(p.x, p.y, last); } },
            draw(c, p) { const f = sgn(p.vx); for (let k = 1; k <= 2; k++) disc(c, p.x - f * k * 14, p.y, 3 - k, 'rgba(230,222,250,0.6)'); pearl(c, p.x, p.y, 7, f > 0 ? 0.3 : -0.3, true); } });
        });
      } },
    { name: 'POP IN', input: 'FWD+L', anim: 'kick', len: 40, hit: 8, cool: 44, ai: { min: 100, max: 420 },
      start(self) { dotBoom(self.x, self.y - 90, false); snd(900, 0.1, 'sine', 0.05, -1); },
      fire(self, opp) {
        const ox = self.x; let landed = false; self.hidden = true; snd(300, 0.15, 'sine', 0.06, 1.5);
        drive(self, 22, (d, i) => {
          self.vx = 0; self.vy = 0; self.y = GROUND;
          if (i === 8) {                                          // reappear behind the foe (or in front when the wall is there)
            let s = -(opp.face || 1); if (opp.x + s * 66 < 50 || opp.x + s * 66 > 910) s = -s;
            self.x = cl(opp.x + s * 66, 46, 914); self.face = sgn(opp.x - self.x); self.hidden = false; dotBoom(self.x, self.y - 90, false); snd(1000, 0.12, 'sine', 0.06, 0.8); dust(self.x, GROUND);
          }
          if (i === 11 && !landed) { landed = true; if (!opp.hidden && Math.abs(opp.x - self.x) < 96 && strike(self, opp, 11, 8, 22, 'kick')) { dotBoom(opp.x, opp.y - 90, true); jolt(8, 5, 2); } }
          return i >= 15;
        }, () => { self.hidden = false; self.vx = 0; self.y = GROUND; },
        (c, d) => { if (d.t < 9) { for (let i = 0; i < 3; i++) disc(c, ox - 16 + i * 16, GROUND - 100 - Math.round(Math.sin(d.t * 0.6 + i) * 6) - d.t * 2, 3, '#ffffff'); } });
      } },
    { name: 'SEEN', input: 'DOWN+L', anim: 'special', len: 34, hit: 10, cool: 40, ai: { min: 0, max: 130 },
      start(self) { addFx({ life: 10, draw(c, fx) { ering(c, self.x, self.y - 90, 16 - fx.t, 16 - fx.t, 2, 'rgba(255,255,255,0.8)'); } }); snd(300, 0.1, 'triangle', 0.05, 1); },
      fire(self, opp) {
        const x = self.x, y = self.y - 90; snd(700, 0.2, 'sine', 0.07, -0.6); jolt(6, 3, 3);
        shock(x, y, '#ffffff', 16, 40, 260, 1, 4); shock(x, y, '#b9a7ff', 22, 30, 320, 1, 3);
        addFx({ life: 26, front: true, draw(c, fx) { const k = ph(fx.t, 0, 6); c.save(); c.globalAlpha = 1 - ph(fx.t, 16, 26); check(c, x - 12, y - 165 - k * 10, '#3fa9ff'); check(c, x + 6, y - 165 - k * 10, '#3fa9ff'); ptext(c, 'SEEN', x, y - 130 - k * 10, 2, '#e6defa', 'center'); c.restore(); } });
        if (!opp.hidden && Math.abs(opp.x - x) < 120 && Math.abs(opp.y - self.y) < 170 && strike(self, opp, 10, 11, 26, 'hit')) dotBoom(opp.x, opp.y - 90, true);
      } },
  ],
  su: { name: 'BIG DOT ENERGY', anim: 'super', len: 60, hit: 22, cool: 70, col: '#e6defa', ai: { min: 0, max: 520 },
    start(self) { addFx({ life: 24, draw(c, fx) { pearl(c, self.x + self.face * 40, self.y - 110, 4 + (fx.t >> 1), 0, false); ering(c, self.x + self.face * 40, self.y - 110, 8 + fx.t, 8 + fx.t, 2, 'rgba(230,222,250,0.6)'); } }); snd(200, 0.5, 'sawtooth', 0.06, 2); },
    fire(self) {
      const f = self.face; jolt(14, 4, 6); snd(100, 0.5, 'sawtooth', 0.09, 0.5); thd(0.3, 0.2);
      addProj(self, { x: self.x + f * 70, y: GROUND - 64, vx: f * 8.5, r: 56, life: 130, dmg: 24 * self.d.pow, kb: 14, stun: 34, super: true,
        update(p) { p.x += p.vx; if (!p.fxd && probe(p)) { p.fxd = 1; dotBoom(p.x, p.y, true); jolt(16, 8, 6); } if (p.t % 4 === 0) dust(p.x - sgn(p.vx) * 50, GROUND); if (p.t % 14 === 0) { game.shake = Math.max(game.shake, 4); thd(0.06, 0.1); } },
        draw(c, p) {
          const f = sgn(p.vx);
          for (let k = 1; k <= 4; k++) { c.save(); c.globalAlpha = 0.5 - k * 0.1; disc(c, p.x - f * k * 34, p.y, 30 - k * 3, '#e6defa'); c.restore(); }
          pearl(c, p.x, p.y, 32, p.t * 0.09 * f, true);
          for (let i = 0; i < 3; i++) R(c, p.x - f * (70 + i * 26), GROUND - 18 - i * 14, 14 - i * 3, 2, '#ffffff');
        } });
    } },
  fin: null,
};
// FULL STOP: a typing bubble ends in a period that squashes the loser down into the full stop itself
DOT.fin = (() => {
  const LEN = 214;
  return { name: 'FULL STOP', len: LEN,
    start(self, opp) { fstart(self, opp, 150); snd(200, 0.6, 'sawtooth', 0.06, -0.4); },
    update(self, opp, t) {
      fgather(self, opp, t, 16); const W_ = FS.w, L_ = FS.l; W_.x = self.x; L_.x = opp.x; W_.face = FS.dir; L_.face = -FS.dir;
      if (t < 16) { W_.anim = 'walk'; W_.fr = lf(8, t, 2); } else if (t < 100) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, 16, 100) * 6)); }
      else if (t < 150) { W_.anim = 'idle'; W_.fr = lf(6, t, 8); } else { W_.anim = 'win'; W_.fr = lf(6, t, 6); }
      L_.anim = 'hit'; L_.fr = [0, 1, 0, 2][lf(4, t, 14)];
      if (t >= 112) { const k = ease(ph(t, 112, 134)); L_.sx = L_.sy = lerp(1, 0.1, k); L_.rot = k * 12.5; L_.tint = (t >> 1) % 2 ? '#ffffff' : null; L_.hide = t >= 134; L_.shadow = 0.2; }
      if (t === 112) { jolt(10, 6, 5); thd(0.3, 0.2); snd(260, 0.3, 'square', 0.07, -0.8); dotBoom(opp.x, GROUND - 90, true); }
      if (t === 134) { jolt(14, 8, 4); thd(0.4, 0.25); snd(90, 0.3, 'sawtooth', 0.08, -0.3); burst(opp.x, GROUND - 24, ['#ffffff', '#e6defa', '#b9a7ff', '#2b2540'], 22, 5, 24, 0.1); shock(opp.x, GROUND - 4, '#e6defa', 22, 20, 300, 0.2, 4); }
      if (t >= LEN) { FS.lxEnd = opp.x; fend(self, opp, true); }
    },
    draw(c, self, opp, t) {
      if (!FS) return; const tt = Math.min(t, LEN), x = opp.x;
      fdraw(c, self, opp, () => {
        if (tt >= 36 && tt < 98) typing(c, x, GROUND - 236, tt, Math.min(3, 1 + Math.floor((tt - 36) / 14)));
        if (tt >= 98 && tt < 112) { const k = ph(tt, 98, 112); ball(c, x, lerp(GROUND - 236, GROUND - 96, k * k), 8, ['#2b2540', '#3d3558', '#6a5f94']); }
        if (tt >= 134) {
          const k = ph(tt, 134, 152), bob = tt < 152 ? Math.round(Math.abs(Math.sin(k * 9)) * (1 - k) * 40) : 0, y = GROUND - 26 - bob;
          ball(c, x, y, 13, ['#2b2540', '#3d3558', '#6a5f94']);
          for (const s of [-1, 1]) { line(c, x + s * 10 - 4, y - 4, x + s * 10 + 4, y + 4, '#e6defa', 2); line(c, x + s * 10 - 4, y + 4, x + s * 10 + 4, y - 4, '#e6defa', 2); }
          if (tt > 156) { c.save(); c.globalAlpha = ph(tt, 156, 176); ptext(c, 'THE END.', x, GROUND - 120, 3, '#f8f6f1', 'center'); c.restore(); }
        }
      });
    } };
})();


// ======================================================================================================
// WANG: calm lab lead. Iridescent bubbles, drones, gravity wells, acqui-hires. Violet and rainbow sheen.
// ======================================================================================================
const IRID = ['#ff9de2', '#c9a0ff', '#9de8ff', '#b9ffd0', '#ffe49d'];
const wangBoom = (x, y, big) => boom(x, y, big, ['#ffffff', '#ff9de2', '#9de8ff', '#ffe49d', '#c9a0ff'], '#c9a0ff');
function iridBubble(c, x, y, r, t, inner) {                      // r in px: inked rainbow soap bubble with glints; inner(c, x, y) draws what floats inside
  const cells = Math.round(r / 2); c.save(); c.globalAlpha = 0.16; disc(c, x, y, cells, '#ffffff'); c.restore();
  if (inner) inner(c, x, y);
  ering(c, x, y, cells + 1, cells + 1, 3, INK);
  const n = Math.max(28, Math.round(r * 1.7));
  for (let i = 0; i < n; i++) { const a = i / n * 6.2832; R(c, x + Math.cos(a) * r - 2, y + Math.sin(a) * r - 2, 4, 4, IRID[(Math.floor(i / n * 10 + t * 0.15)) % 5]); }
  R(c, x - r * 0.58, y - r * 0.58, 8, 4, '#ffffff'); R(c, x - r * 0.42, y - r * 0.72, 4, 2, '#ffffff'); R(c, x - r * 0.7, y - r * 0.4, 2, 6, '#ffffff');
}
function droneArt(k) {                                           // tiny quadcopter, two rotor frames
  const rot = k ? 'rrrr......rrrr' : '.rr........rr.';
  return art('drone' + k, [rot, '.dd........dd.', '..dbbbbbbbbd..', '..bbbllllbbb..', '..dbbbllbbbd..', '...dddddddd...'], { r: '#e6e9f7', d: '#6b6f8a', b: '#a3a9c9', l: '#7cf0ff' });
}

const WANG = {
  sp: [
    { name: 'BUBBLE SORT', input: 'L', anim: 'special', len: 32, hit: 14, cool: 30, ai: { min: 220, max: 560 },
      start(self) { const f = self.face; addFx({ life: 14, draw(c, fx) { iridBubble(c, self.x + f * 44, self.y - 112, 4 + fx.t * 1.6, fx.t); } }); snd(400, 0.2, 'sine', 0.05, 0.8); },
      fire(self) {
        const f = self.face; snd(700, 0.16, 'sine', 0.06, 0.5); jolt(2, 0, 0);
        addProj(self, { x: self.x + f * 50, y: self.y - 112, vx: f * 5.5, r: 26, life: 140, dmg: 10 * self.d.pow, kb: 6, stun: 18, by: self.y - 112,
          update(p) { p.x += p.vx; p.y = p.by + Math.sin(p.t * 0.1) * 12; if (!p.fxd && probe(p)) { p.fxd = 1; wangBoom(p.x, p.y); } },
          draw(c, p) {
            iridBubble(c, p.x, p.y, 26, p.t, (c, x, y) => {       // a few bars sorting themselves inside the bubble
              const n = 5, sorted = ph(p.t, 0, 70);
              for (let i = 0; i < n; i++) { const h = 4 + (i * 3) * sorted + (hs(i * 3 + Math.floor(p.t / 9)) * 12) * (1 - sorted); R(c, x - 14 + i * 6, y + 10 - h, 4, h, IRID[i % 5]); }
            });
          } });
      } },
    { name: 'LAB DRONES', input: 'FWD+L', anim: 'special', len: 40, hit: 12, cool: 44, ai: { min: 150, max: 520 },
      start(self) { snd(500, 0.15, 'square', 0.04, 0.6); bubbleText(self.x, self.y - 190, 'SPIN UP', '#9de8ff', 28); },
      fire(self, opp) {
        const f = self.face;
        for (let i = 0; i < 2; i++) game.later(i * 9, () => {
          if (game.phase !== 'fight') return; const last = i === 1; snd(800 + i * 200, 0.1, 'square', 0.04, 0.5);
          addProj(self, { x: self.x + f * 36, y: self.y - 140, vx: f * 3.2, vy: -5.5, r: 14, life: 100, dmg: 6.5 * self.d.pow, kb: last ? 7 : 4, stun: last ? 16 : 11,
            update(p) {
              const tg = foe(self);
              if (p.t < 14 || !tg) { p.vy *= 0.94; } else { const dx = tg.x - p.x, dy = (tg.y - 85) - p.y, d = Math.hypot(dx, dy) || 1; p.vx = lerp(p.vx, dx / d * 9, 0.2); p.vy = lerp(p.vy, dy / d * 9, 0.2); }
              p.x += p.vx; p.y += p.vy; if (!p.fxd && probe(p)) { p.fxd = 1; wangBoom(p.x, p.y); }
            },
            draw(c, p) { for (let k = 1; k <= 3; k++) R(c, p.x - p.vx * k * 1.6 - 2, p.y - p.vy * k * 1.6 - 2, 6 - k, 6 - k, k % 2 ? '#9de8ff' : '#c9a0ff'); blit(c, droneArt(p.t >> 1 & 1), p.x, p.y, p.vx < 0); } });
        });
      } },
    { name: 'SINGULARITY', input: 'DOWN+L', anim: 'special', len: 46, hit: 14, cool: 52, ai: { min: 60, max: 300 },
      start(self) { snd(120, 0.4, 'sine', 0.05, 1.5); },
      fire(self, opp) {
        const vx = cl(self.x + self.face * 130, 70, 890), vy = GROUND - 90, LIFE = 26; snd(90, 0.5, 'sine', 0.07, -0.5);
        addFx({ life: LIFE + 12,
          update(fx) {
            if (fx.t < LIFE && game.phase === 'fight' && !opp.hidden && opp.state !== 'ko' && Math.abs(opp.x - vx) < 280 && opp.y > GROUND - 120) opp.x = cl(opp.x + sgn(vx - opp.x) * Math.min(3.2, Math.abs(vx - opp.x)), 46, 914);
            if (fx.t === LIFE) { jolt(12, 6, 6); thd(0.3, 0.25); snd(70, 0.4, 'sawtooth', 0.09, -0.4); wangBoom(vx, vy, true); shock(vx, vy, '#ffffff', 20, 30, 360, 1, 4); if (game.phase === 'fight' && !opp.hidden && Math.abs(opp.x - vx) < 100 && opp.y > GROUND - 200 && strike(self, opp, 11, 11, 28, 'hit')) wangBoom(opp.x, opp.y - 90, true); }
          },
          draw(c, fx) {
            const t = fx.t; if (t >= LIFE) return; const k = Math.min(1, t / 8);
            for (let a = 0; a < 3; a++) for (let i = 0; i < 12; i++) { const ang = i / 12 * 6.283 + t * 0.2 + a * 2.1, r = (110 - t * 3.2) * (0.35 + i / 18) * k; R(c, vx + Math.cos(ang) * r - 2, vy + Math.sin(ang) * r * 0.9 - 2, 4, 4, IRID[(i + a) % 5]); }
            ball(c, vx, vy, Math.round(6 + 8 * k), ['#0f0c18', '#241c3d', '#3c2f66']); ering(c, vx, vy, 10 + (t >> 2) % 3 + Math.round(8 * k), 10 + (t >> 2) % 3 + Math.round(8 * k), 2, 'rgba(201,160,255,0.7)');
          } });
      } },
  ],
  su: { name: 'SUPERINTELLIGENCE', anim: 'super', len: 62, hit: 22, cool: 70, col: '#c9a0ff', ai: { min: 0, max: 520 },
    start(self) { const f = self.face; addFx({ life: 26, draw(c, fx) { iridBubble(c, self.x + f * 46, self.y - 112, 6 + fx.t * 1.5, fx.t); } }); snd(200, 0.5, 'sawtooth', 0.06, 2); },
    fire(self) {
      const f = self.face; jolt(14, 4, 6); snd(130, 0.5, 'sine', 0.09, 0.5); thd(0.3, 0.2);
      addProj(self, { x: self.x + f * 56, y: GROUND - 110, vx: f * 5, r: 30, life: 100, dmg: 24 * self.d.pow, kb: 14, stun: 34, super: true,
        update(p) {
          p.r = Math.min(104, p.r + 2); p.x += p.vx;
          if (!p.fxd && probe(p)) { p.fxd = 1; wangBoom(p.x, p.y, true); jolt(16, 8, 6); p.life = Math.min(p.life, 6); }
          if (p.life === 1) wangBoom(p.x, p.y, true);
        },
        draw(c, p) {
          const pr = Math.min(104, p.r);
          iridBubble(c, p.x, p.y, pr, p.t, (c, x, y) => {
            for (let i = 0; i < 9; i++) { const a = i * 0.7 + p.t * 0.05, rr = pr * (0.2 + hs(i) * 0.6); R(c, x + Math.cos(a) * rr - 2, y + Math.sin(a * 1.3) * rr * 0.8 - 2, 4, 4, IRID[i % 5]); }
            if (pr > 60) { c.save(); c.globalAlpha = 0.6; ptext(c, 'ASI', x, y - 7, 3, '#ffffff', 'center', false); c.restore(); }
          });
          for (let i = 0; i < 4; i++) { const a = p.t * 0.08 + i * 1.57; disc(c, p.x + Math.cos(a) * (pr + 14), p.y + Math.sin(a) * (pr + 14) * 0.5, 3, IRID[i % 5]); }
        } });
    } },
  fin: null,
};
// ACQUI-HIRE: the loser is bubbled up, floats away, the bubble pops and a big ACQUIRED stamp lands on the heap
WANG.fin = (() => {
  const LEN = 232, FLOAT0 = 66, POP = 140, LAND = 168, STAMP = 180, RISE = 190;
  const rise = t => t < FLOAT0 ? 0 : t < POP ? ease(ph(t, FLOAT0, POP)) * RISE + Math.sin(t * 0.18) * 6 : Math.max(0, RISE - (RISE / 900) * Math.pow(t - POP, 2) * 1.5);
  return { name: 'ACQUI-HIRE', len: LEN,
    start(self, opp) { fstart(self, opp, 160); snd(300, 0.6, 'sine', 0.06, 0.8); },
    update(self, opp, t) {
      fgather(self, opp, t, 16); const W_ = FS.w, L_ = FS.l; W_.x = self.x; L_.x = opp.x; W_.face = FS.dir; L_.face = -FS.dir;
      if (t < 16) { W_.anim = 'walk'; W_.fr = lf(8, t, 2); } else if (t < 64) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, 16, 64) * 6)); }
      else if (t < LAND) { W_.anim = 'idle'; W_.fr = lf(6, t, 8); } else { W_.anim = 'win'; W_.fr = lf(6, t, 6); }
      const r = rise(t); L_.y = GROUND - Math.max(0, r); L_.shw = 1 - Math.min(0.6, r / 300);
      if (t < POP) { L_.anim = 'hit'; L_.fr = [0, 1, 0, 2][lf(4, t, 14)]; L_.rot = t > FLOAT0 ? Math.sin(t * 0.12) * 0.25 : 0; }
      else if (t < LAND) { L_.anim = 'hit'; L_.fr = 2; L_.rot = (t - POP) * 0.22; }
      else { L_.anim = 'ko'; L_.fr = 4; L_.rot = 0; }
      if (t === POP) { jolt(8, 6, 6); snd(900, 0.2, 'sine', 0.08, -1.5); wangBoom(opp.x, GROUND - 90 - r, true); shock(opp.x, GROUND - 90 - r, '#ffffff', 24, 40, 420, 1, 4); }
      if (t === LAND) { jolt(16, 8, 3); thd(0.4, 0.25); snd(80, 0.3, 'sawtooth', 0.08, -0.3); dust(opp.x - 30, GROUND); dust(opp.x + 30, GROUND); shock(opp.x, GROUND - 4, '#c9a0ff', 18, 20, 240, 0.2, 4); }
      if (t === STAMP) { jolt(12, 6, 4); thd(0.3, 0.3); snd(110, 0.3, 'square', 0.09, -0.4); burst(opp.x, GROUND - 40, ['#ff5a66', '#ffffff', '#ffe49d'], 18, 5, 22, 0.1); }
      if (t >= LEN) { FS.lxEnd = opp.x; fend(self, opp, false); }
    },
    draw(c, self, opp, t) {
      if (!FS) return; const tt = Math.min(t, LEN), x = opp.x, r = rise(tt);
      fdraw(c, self, opp, () => {
        if (tt >= 50 && tt < POP) { const g = ease(ph(tt, 50, FLOAT0)); iridBubble(c, x, GROUND - 90 - r, 20 + 80 * g, tt); }
        if (tt >= FLOAT0 && tt < POP) for (let i = 0; i < 7; i++) { const k = ((tt * 0.8 + i * 13) % 60) / 60; disc(c, x + (hs(i) - 0.5) * 120, GROUND - 40 - r + 20 - k * 120, 2 + (i % 2), IRID[i % 5]); }
        if (tt >= STAMP) { const k = ph(tt, STAMP, STAMP + 5), y = lerp(GROUND - 300, GROUND - 52, k * k) + (tt > STAMP + 5 && tt < STAMP + 11 ? (tt % 2) * 4 : 0); R(c, x - 86, y - 24, 172, 48, INK); R(c, x - 82, y - 20, 164, 40, '#fff6e0'); R(c, x - 80, y - 18, 160, 4, '#d62f3a'); R(c, x - 80, y + 14, 160, 4, '#d62f3a'); ptext(c, 'ACQUIRED', x, y - 10, 3, '#d62f3a', 'center', false); }
      });
    } };
})();

// ======================================================================================================
// MUSE: fluffy personal agent that lives in its own VM. Pink fur, cyan sandbox glow, notifications and undo buttons.
// ======================================================================================================
const MUSE_COLS = ['#ffffff', '#f2a9ab', '#7ef0ff', '#ffe0e2'];
const museBoom = (x, y, big) => boom(x, y, big, MUSE_COLS, '#f2a9ab');
function pingCard(c, x, y, t) {                                  // notification card with a bell and a red badge
  y += Math.round(Math.sin(t * 0.4) * 2);
  R(c, x - 26, y - 18, 52, 36, INK); R(c, x - 24, y - 16, 48, 32, '#f8f4ff');
  R(c, x - 24, y - 16, 48, 8, '#f2a9ab'); R(c, x - 24, y - 10, 48, 2, '#c9686f'); R(c, x - 24, y + 14, 48, 2, '#dcd5ec');
  R(c, x - 18, y - 4, 10, 8, '#ffd23f'); R(c, x - 20, y + 4, 14, 4, '#ffd23f'); R(c, x - 14, y + 8, 4, 4, '#c99a1a'); R(c, x - 18, y - 4, 4, 4, '#fff3b0');
  R(c, x - 2, y - 4, 22, 4, '#b7b0c8'); R(c, x - 2, y + 4, 16, 4, '#d5cfe3');
  disc(c, x + 24, y - 18, 4, INK); disc(c, x + 24, y - 18, 3, '#ff4b5c'); R(c, x + 22, y - 22, 4, 8, '#ffffff');
}
const CURSOR_ROWS = ['w.........', 'ww........', 'www.......', 'wwww......', 'wwwww.....', 'wwwwww....', 'wwwwwww...', 'wwwwwwww..', 'wwwwwwwww.', 'wwwwww....', 'ww.www....', 'w..www....', '....www...', '....www...'];
const cursorArt = () => art('cursor', CURSOR_ROWS, { w: '#ffffff' });

const MUSE = {
  sp: [
    { name: 'PING', input: 'L', anim: 'special', len: 26, hit: 9, cool: 26, ai: { min: 150, max: 560 },
      start(self) { const f = self.face; addFx({ life: 10, draw(c, fx) { for (let i = 0; i < 2; i++) ering(c, self.x + f * 40, self.y - 104, 4 + fx.t + i * 4, 4 + fx.t + i * 4, 1, 'rgba(242,169,171,' + (0.8 - fx.t * 0.07) + ')'); } }); snd(1320, 0.07, 'sine', 0.06, 0.1); },
      fire(self) {
        const f = self.face; snd(1760, 0.14, 'sine', 0.07, 0.15); game.later(3, () => snd(2100, 0.1, 'sine', 0.05, 0));
        addProj(self, { x: self.x + f * 54, y: self.y - 104, vx: f * 11, r: 16, life: 70, dmg: 8 * self.d.pow, kb: 5, stun: 14,
          update(p) { p.x += p.vx; if (!p.fxd && probe(p)) { p.fxd = 1; museBoom(p.x, p.y, false); } },
          draw(c, p) { const f = sgn(p.vx); for (let k = 1; k <= 3; k++) { c.save(); c.globalAlpha = 0.7 - k * 0.18; ering(c, p.x - f * (34 + k * 14), p.y, 2, 4 + k * 2, 1, '#f2a9ab'); c.restore(); } pingCard(c, p.x, p.y, p.t); } });
      } },
    { name: 'SECURE VM', input: 'FWD+L', anim: 'special', len: 36, hit: 12, cool: 120, ai: { min: 0, max: 120 },
      start(self) { addFx({ life: 14, draw(c, fx) { const r = 36 - fx.t * 2; ering(c, self.x, self.y - 90, r, r, 2, 'rgba(126,240,255,0.7)'); } }); snd(300, 0.25, 'triangle', 0.05, 1.2); },
      fire(self, opp) {
        const x = self.x, y = self.y - 90; self.shield = 110; jolt(6, 3, 3); snd(900, 0.25, 'sine', 0.07, -0.8); thd(0.1, 0.1);
        shock(x, y, '#7ef0ff', 20, 40, 230, 1, 4); shock(x, y, '#ffffff', 14, 20, 150, 1, 3); burst(x, y, ['#7ef0ff', '#ffffff', '#f2a9ab'], 14, 4, 22, 0);
        bubbleText(x, self.y - 214, 'ISOLATED', '#7ef0ff', 36);
        if (!opp.hidden && Math.abs(opp.x - x) < 125 && Math.abs(opp.y - self.y) < 170 && strike(self, opp, 7, 7, 16, 'hit')) museBoom(opp.x, opp.y - 90, false);
      } },
    { name: 'UNDO', input: 'DOWN+L', anim: 'special', len: 40, hit: 26, cool: 50, ai: { min: 0, max: 115 },
      // Counter stance: while it lasts the first hit from the foe is cancelled (takeHit is overridden on this instance) and sent back.
      // If nothing hits Muse the stance ends in a short CTRL+Z pulse.
      start(self, opp) {
        const st = { on: true, trig: false }, orig = self.takeHit, had = Object.prototype.hasOwnProperty.call(self, 'takeHit');
        const restore = () => { if (had) self.takeHit = orig; else delete self.takeHit; };
        st.close = () => { if (st.on) { st.on = false; restore(); } };
        self.undo = st;
        self.takeHit = function (src, dmg, kb, stun, kind) {
          if (!st.on || game.phase !== 'fight' || src !== opp || self.inv > 0 || self.state === 'ko' || self.state === 'dizzy') return orig.apply(self, arguments);
          st.trig = true; st.on = false; restore(); self.inv = 14; self.st = Math.max(self.st, 27);
          const back = cl(dmg * 0.9, 7, 13), sx = self.x, sy = self.y - 100; jolt(8, 8, 5); snd(1200, 0.2, 'square', 0.07, -1.4); thd(0.2, 0.2);
          addFx({ life: 30, front: true, draw(c, fx) {
            const tg = foe(self), k = ph(fx.t, 0, 8); c.save(); c.globalAlpha = 1 - ph(fx.t, 20, 30);
            if (tg && fx.t >= 4 && fx.t < 16) zig(c, sx, sy, lerp(sx, tg.x, ph(fx.t, 4, 9)), lerp(sy, tg.y - 90, ph(fx.t, 4, 9)), 24, 14, fx.t * 7, ['#2f9bb0', '#7ef0ff', '#ffffff'], 6);
            ptext(c, 'UNDO!', sx, sy - 86 - k * 10, 3, '#ffe0e2', 'center'); c.restore();
            ering(c, sx, sy, 14 + fx.t, 14 + fx.t, 2, 'rgba(126,240,255,0.7)');
          } });
          game.later(5, () => { if (game.phase !== 'fight' || opp.hidden) return; if (strike(self, opp, back / self.d.pow, 9, 24, 'hit')) { museBoom(opp.x, opp.y - 90, true); jolt(8, 4, 3); } });
        };
        drive(self, 30, () => st.trig || !st.on, () => st.close(), (c, d) => {                // the rewind clock around Muse while the stance is up
          const x = self.x, y = self.y - 92, a = -d.t * 0.38;
          ering(c, x, y, 30, 30, 2, 'rgba(126,240,255,0.75)'); ering(c, x, y, 34 + (d.t >> 2) % 2, 34 + (d.t >> 2) % 2, 1, 'rgba(255,255,255,0.35)');
          line(c, x, y, x + Math.cos(a) * 40, y + Math.sin(a) * 40, '#ffffff', 4); line(c, x, y, x + Math.cos(a * 0.2) * 24, y + Math.sin(a * 0.2) * 24, '#f2a9ab', 4);
          for (let i = 0; i < 3; i++) { const ax = x - 70 + ((d.t * 3 + i * 16) % 48); R(c, ax, y - 70, 6, 6, '#7ef0ff'); R(c, ax + 4, y - 66, 6, 6, '#7ef0ff'); R(c, ax, y - 62, 6, 6, '#7ef0ff'); }
          ptext(c, 'CTRL+Z', x, y - 112, 2, '#7ef0ff', 'center');
        });
        snd(500, 0.25, 'triangle', 0.05, -0.8);
      },
      fire(self, opp) {
        const st = self.undo; if (st) st.close(); if (st && st.trig) return;
        const x = self.x, y = self.y - 90; jolt(6, 3, 3); snd(300, 0.2, 'square', 0.07, -1); shock(x, y, '#7ef0ff', 14, 30, 200, 1, 4); bubbleText(x, self.y - 214, 'NOTHING TO UNDO', '#ffe0e2', 30);
        if (!opp.hidden && Math.abs(opp.x - x) < 120 && Math.abs(opp.y - self.y) < 170 && strike(self, opp, 6, 7, 14, 'hit')) museBoom(opp.x, opp.y - 90, false);
      } },
  ],
  su: { name: 'AGENT SWARM', anim: 'super', len: 62, hit: 22, cool: 70, col: '#f2a9ab', ai: { min: 0, max: 520 },
    start(self) {
      addFx({ life: 26, draw(c, fx) { for (let i = 0; i < 5; i++) { const a = fx.t * 0.25 + i * 1.257; disc(c, self.x + Math.cos(a) * (50 - fx.t), self.y - 90 + Math.sin(a) * (30 - fx.t * 0.6), 2, i % 2 ? '#7ef0ff' : '#f2a9ab'); } } });
      bubbleText(self.x, self.y - 214, 'SPAWNING AGENTS', '#7ef0ff', 40); snd(200, 0.5, 'sawtooth', 0.06, 2);
    },
    fire(self) {
      const f = self.face; jolt(8, 3, 4); thd(0.2, 0.15);
      for (let i = 0; i < 5; i++) game.later(i * 8, () => {
        if (game.phase !== 'fight') return; const big = i === 4;
        snd(520 + i * 110, 0.1, 'square', 0.05, 0.5); shock(self.x + f * 40, GROUND - 50, '#7ef0ff', 10, 20, 90, 0.5, 3);
        addProj(self, { x: self.x + f * 40, y: GROUND - (big ? 80 : 46), vx: f * (big ? 8 : 8.5), r: big ? 36 : 18, life: 90, dmg: (big ? 8 : 4.2) * self.d.pow, kb: big ? 14 : 3, stun: big ? 32 : 12, super: big,
          update(p) {
            p.x += p.vx; if (!p.fxd && probe(p)) { p.fxd = 1; museBoom(p.x, p.y, big); if (big) jolt(14, 8, 6); }
            if (p.t % 5 === 0) dust(p.x - sgn(p.vx) * 20, GROUND); if (p.x < -80 || p.x > 1040) p.life = Math.min(p.life, 1);
          },
          draw(c, p) {
            const f = sgn(p.vx), fr = lf(8, p.t, 3), sc = big ? undefined : 1;
            shadow(c, p.x, big ? 40 : 22, 0.35);
            for (let k = 2; k >= 1; k--) sprite(c, self, 'walk', fr, p.x - f * k * (big ? 22 : 14), GROUND, { face: f, scale: sc, a: 0.2 * (3 - k) / 2, tint: '#7ef0ff' });
            sprite(c, self, 'walk', fr, p.x, GROUND, { face: f, scale: sc });
            if (big) ering(c, p.x, GROUND - 84, 30 + (p.t >> 2) % 3, 36 + (p.t >> 2) % 3, 2, 'rgba(242,169,171,0.45)');
            else R(c, p.x - 4, GROUND - 106, 8, 8, '#7ef0ff');
          } });
      });
    } },
  fin: null,
};
// UNINSTALL: a system dialog asks to remove the loser, a progress bar pixelates them, and they end up in a trash bin whose lid slams shut
MUSE.fin = (() => {
  const LEN = 232, DLG = 26, CUR0 = 38, CLICK = 58, PROG1 = 140, BIN0 = 128, BINL = 146, THROW0 = 152, THROW1 = 178, LID = 180, TEXT = 196, DY = 290;
  const BLOCKS = [2, 4, 6, 8, 12, 16, 20, 26, 32];
  const binBase = t => t < BIN0 ? -420 : t < BINL ? lerp(-420, GROUND, Math.pow(ph(t, BIN0, BINL), 2)) : GROUND - (t < BINL + 10 ? Math.sin(ph(t, BINL, BINL + 10) * Math.PI) * 18 : 0) - (t >= LID && t < LID + 8 ? Math.sin(ph(t, LID, LID + 8) * Math.PI) * 8 : 0);
  const lidA = t => t < LID ? 1.92 : t < LID + 4 ? 1.92 * (1 - Math.pow(ph(t, LID, LID + 4), 2)) : t < LID + 12 ? Math.sin(ph(t, LID + 4, LID + 12) * Math.PI) * 0.22 : 0;
  let PXC = null, PXS = null;
  function pixelSprite(c, f, anim, fr, o) {                      // the sprite re-sampled into big square pixels (o.block px per pixel)
    if (!PXC) { PXC = document.createElement('canvas'); PXC.width = PXC.height = 320; PXS = document.createElement('canvas'); PXS.width = PXS.height = 320; }
    const t = PXC.getContext('2d'); t.clearRect(0, 0, 320, 320); t.imageSmoothingEnabled = false;
    sprite(t, f, anim, fr, 160, 280, { face: o.face, tint: o.tint });
    const n = Math.max(2, Math.round(320 / Math.max(1, o.block))), s = PXS.getContext('2d'), sx = o.sx === undefined ? 1 : o.sx;
    s.clearRect(0, 0, 320, 320); s.imageSmoothingEnabled = true; s.drawImage(PXC, 0, 0, 320, 320, 0, 0, n, n);
    c.save(); c.translate(Math.round(o.x), Math.round(o.y - 60 * sx)); if (o.rot) c.rotate(o.rot); c.scale(sx, sx);
    c.imageSmoothingEnabled = false; c.drawImage(PXS, 0, 0, n, n, -160, -220, 320, 320); c.restore();
  }
  function trashBin(c, x, base, lid, dir) {                      // lid = opening angle in radians, 0 is closed; the hinge sits on the far side
    const top = base - 104, hw = 40, bw = 32;
    polyO(c, [[x - hw, top], [x + hw, top], [x + bw, base], [x - bw, base]], '#8e9bb3');
    poly(c, [[x - hw + 6, top + 4], [x - hw + 16, top + 4], [x - bw + 10, base - 6], [x - bw + 4, base - 6]], '#c3cde0');
    poly(c, [[x + hw - 14, top + 4], [x + hw - 4, top + 4], [x + bw - 2, base - 4], [x + bw - 12, base - 4]], '#59627a');
    R(c, x - 14, top + 14, 4, 76, '#59627a'); R(c, x + 10, top + 14, 4, 76, '#59627a');
    line(c, x - 10, top + 40, x + 10, top + 64, '#f2a9ab', 6); line(c, x - 10, top + 64, x + 10, top + 40, '#f2a9ab', 6);
    R(c, x - hw - 4, top - 4, hw * 2 + 8, 10, INK); R(c, x - hw - 2, top - 2, hw * 2 + 4, 6, '#aab5cc');
    const hx = x + dir * (hw + 4), hy = top - 10, ux = -dir * Math.cos(lid), uy = -Math.sin(lid), nx = -uy, ny = ux, L = hw * 2 + 8, t = 7;
    polyO(c, [[hx + nx * t, hy + ny * t], [hx + ux * L + nx * t, hy + uy * L + ny * t], [hx + ux * L - nx * t, hy + uy * L - ny * t], [hx - nx * t, hy - ny * t]], '#6d7893');
    line(c, hx + ux * 10 + nx * 3, hy + uy * 10 + ny * 3, hx + ux * (L - 8) + nx * 3, hy + uy * (L - 8) + ny * 3, '#aab5cc', 2);
    const mx = hx + ux * L * 0.5, my = hy + uy * L * 0.5; polyO(c, [[mx - 8 + nx * 10, my + ny * 10 - 4], [mx + 8 + nx * 10, my + ny * 10 - 4], [mx + 8 + nx * 16, my + ny * 16], [mx - 8 + nx * 16, my + ny * 16]], '#aab5cc');
  }
  function uiWin(c, x, y, tt, name) {                            // the "UNINSTALL?" dialog, then its progress bar
    const k = ease(ph(tt, DLG, DLG + 8)) * (1 - ease(ph(tt, PROG1 + 2, PROG1 + 9)));
    if (k < 0.04) return;
    const w = 236, h = 128, run = tt >= CLICK + 4, down = tt >= CLICK && tt < CLICK + 5, prog = ph(tt, CLICK + 4, PROG1);
    c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(k, k);
    R(c, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, INK); R(c, -w / 2, -h / 2, w, h, '#ece7f6');
    R(c, -w / 2, -h / 2, w, 26, '#f2a9ab'); R(c, -w / 2, -h / 2 + 24, w, 2, '#c9686f'); R(c, -w / 2, h / 2 - 4, w, 4, '#cfc8e0');
    for (let i = 0; i < 3; i++) { R(c, -w / 2 + 10 + i * 14, -h / 2 + 8, 10, 10, INK); R(c, -w / 2 + 12 + i * 14, -h / 2 + 10, 6, 6, ['#ffffff', '#ffe0e2', '#7ef0ff'][i]); }
    ptext(c, run ? 'WORKING' : 'SYSTEM', -w / 2 + 62, -h / 2 + 6, 2, '#ffffff', 'left', false);
    if (!run) {
      ptext(c, 'UNINSTALL ' + name + '?', 0, -22, 2, '#3a2e52', 'center', false);
      const btn = (cx, label, col, edge, dn) => { const o = dn ? 2 : 0; R(c, cx - 46, 6, 92, 36, INK); R(c, cx - 44, 8 + o, 88, 28 - o, col); if (!dn) R(c, cx - 44, 34, 88, 4, edge); ptext(c, label, cx, 15 + o, 2, '#3a2e52', 'center', false); };
      btn(-56, 'NO', '#e3ddf0', '#b7b0c8', false); btn(56, 'YES', '#7ef0ff', '#3fb3c9', down);
    } else {
      ptext(c, 'UNINSTALLING...', 0, -22, 2, '#3a2e52', 'center', false);
      R(c, -92, 4, 184, 24, INK); R(c, -90, 6, 180, 20, '#cfc8e0');
      for (let i = 0, n = Math.floor(prog * 22); i < n; i++) { R(c, -88 + i * 8, 8, 6, 16, '#f2a9ab'); R(c, -88 + i * 8, 8, 6, 4, '#ffe0e2'); }
      ptext(c, Math.floor(prog * 100) + '%', 0, 36, 2, '#3a2e52', 'center', false);
    }
    c.restore();
    if (tt >= CUR0 && k > 0.5) {                                 // mouse pointer glides to YES and clicks
      const e = ease(ph(tt, CUR0, CLICK)), px = lerp(x + 170, x + 62, e), py = lerp(y + 110, y + 28, e);
      blit(c, cursorArt(), px + 12, py + 16, false);
      if (tt >= CLICK && tt < CLICK + 10) ering(c, px, py, 3 + (tt - CLICK), 3 + (tt - CLICK), 1, 'rgba(255,255,255,' + (1 - (tt - CLICK) / 10) + ')');
    }
  }
  return { name: 'UNINSTALL', len: LEN,
    start(self, opp) { fstart(self, opp, 190); FS.bx = cl(FS.cx + FS.dir * 120, 100, 860); snd(300, 0.5, 'triangle', 0.05, 0.6); },
    update(self, opp, t) {
      fgather(self, opp, t, 16); const W_ = FS.w, L_ = FS.l;
      if (t >= THROW0) opp.x = lerp(FS.cx, FS.bx, ease(ph(t, THROW0, THROW1)));
      W_.x = self.x; L_.x = opp.x; W_.face = FS.dir; L_.face = -FS.dir;
      if (t < 16) { W_.anim = 'walk'; W_.fr = lf(8, t, 2); }
      else if (t < 40) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, 16, 40) * 6)); }
      else if (t < THROW0) { W_.anim = 'special'; W_.fr = 4; }
      else if (t < THROW1) { W_.anim = 'special'; W_.fr = Math.min(5, Math.floor(ph(t, THROW0, THROW1) * 6)); }
      else { W_.anim = 'win'; W_.fr = lf(6, t, 6); }
      L_.anim = 'hit'; L_.fr = [0, 1, 0, 2][lf(4, t, 14)]; L_.hide = t >= CLICK + 4;
      if (t === DLG) { snd(700, 0.1, 'square', 0.05, 0.6); }
      if (t === CLICK) { snd(900, 0.05, 'square', 0.07, 0); thd(0.05, 0.1); }
      if (t > CLICK + 4 && t < PROG1 && (t - CLICK) % 8 === 0) snd(300 + (t - CLICK) * 5, 0.06, 'square', 0.04, 0);
      if (t === PROG1) { jolt(6, 4, 4); snd(1300, 0.3, 'sine', 0.07, 0.3); burst(opp.x, GROUND - 100, ['#7ef0ff', '#ffffff', '#f2a9ab', '#17121f'], 18, 3.6, 22, 0.06); }
      if (t === BINL) { jolt(10, 6, 0); thd(0.4, 0.25); snd(110, 0.25, 'sawtooth', 0.08, -0.4); dust(FS.bx - 30, GROUND); dust(FS.bx + 30, GROUND); shock(FS.bx, GROUND - 4, '#aab5cc', 16, 20, 200, 0.2, 4); }
      if (t === THROW0) snd(500, 0.4, 'sine', 0.06, 1.2);
      if (t === THROW1) { snd(260, 0.2, 'square', 0.06, -1); burst(FS.bx, GROUND - 100, ['#7ef0ff', '#ffffff', '#f2a9ab', '#17121f'], 14, 3.4, 20, 0.1); }
      if (t === LID) { jolt(16, 8, 4); thd(0.5, 0.3); snd(70, 0.35, 'sawtooth', 0.1, -0.3); dust(FS.bx - 40, GROUND); dust(FS.bx + 40, GROUND); shock(FS.bx, GROUND - 4, '#ffffff', 20, 20, 300, 0.2, 4); }
      if (t >= LEN) { FS.lxEnd = FS.bx; fend(self, opp, true); }
    },
    draw(c, self, opp, t) {
      if (!FS) return; const tt = Math.min(t, LEN), cx = FS.cx, bx = FS.bx, dir = FS.dir, ph1 = ph(tt, CLICK + 4, PROG1);
      fdraw(c, self, opp, () => {
        if (tt >= CLICK + 4 && tt < THROW1) {                    // the loser, re-sampled into bigger and bigger pixels, then thrown into the bin
          const k = ph(tt, THROW0, THROW1), e = ease(k), blk = tt < THROW0 ? BLOCKS[Math.min(8, Math.floor(ph1 * 9))] : 32;
          const lx = lerp(cx, bx, e), ly = lerp(GROUND, GROUND - 56, e) - Math.sin(k * Math.PI) * 150, sx = lerp(1, 0.3, e);
          shadow(c, lx, 40 * (1 - 0.5 * Math.min(1, Math.sin(k * Math.PI) * 2)), 0.35);
          if (tt < THROW0) {                                     // falling pixel crumbs
            for (let i = 0; i < 7; i++) { const age = (tt * 1.6 + i * 17) % 50; R(c, cx + (hs(i * 5 + 1) - 0.5) * 100, GROUND - 150 * hs(i * 5 + 2) + age, 6, 6, ['#7ef0ff', '#f2a9ab', '#ffffff'][i % 3]); }
          }
          pixelSprite(c, opp, 'hit', [0, 1, 0, 2][lf(4, tt, 14)], { x: lx + (tt < THROW0 ? ((tt >> 1) % 2) * 4 - 2 : 0), y: ly, face: -dir, block: blk, sx, rot: k > 0 ? e * 9.4 * dir : 0, tint: tt < THROW0 && (tt >> 2) % 5 === 0 ? '#7ef0ff' : null });
        }
        if (tt >= BIN0) { shadow(c, bx, 52, tt >= BINL ? 0.4 : 0.4 * ph(tt, BIN0, BINL)); trashBin(c, bx, binBase(tt), lidA(tt), dir); }
        uiWin(c, cx, GROUND - DY, tt, opp.d.name);
        if (tt >= TEXT) { c.save(); c.globalAlpha = ph(tt, TEXT, TEXT + 16); ptext(c, 'UNINSTALLED.', bx, GROUND - 190, 3, '#ffe0e2', 'center'); ptext(c, '0 BYTES USED', bx, GROUND - 160, 2, '#7ef0ff', 'center'); c.restore(); }
      });
    } };
})();

// every fighter's special 1 doubles as the air special (UP + special, or special while jumping): dive flag + its own name
const AIRSP = { tibo: 'DROP TABLE', poteto: 'AIR FRY', dot: 'DOT RAIN', wang: 'DEEP DIVE', muse: 'PACKET DROP' };
for (const [id, F] of Object.entries({ tibo: TIBO, poteto: POTETO, dot: DOT, wang: WANG, muse: MUSE })) { F.sp[0].dive = true; F.air = { name: AIRSP[id] }; }


// @@END
return { tibo: TIBO, poteto: POTETO, dot: DOT, wang: WANG, muse: MUSE };
})();
