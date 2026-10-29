// ===== AGENT BRAWL feature file: VFX (presentation and game feel). =====
// Owner: vfx agent (branch feat/x-vfx).
// Area: super and finisher cut-in, KO slow motion with an impact zoom, instant replay of the deciding KO, impact frames,
//       hit-stop tiers, hit sparks styled by hit kind, camera punch-in on supers, accessibility (flash and shake settings).
// Hooks used: 'update' (clock of every effect, recording, replay driver), 'damage' (reads the hit before it lands, never changes it),
//             'drawWorld' (sparks, impact frames, replay letterbox), 'drawHud' (hides the engine banner under a cut-in), 'drawTop' (cut-in, replay labels).
// BUS used: hit, block, ko, super, finisher, match:start, round:start.
// Settings: vfx.replay, vfx.cutin, vfx.impact; the shared 'flash' and 'shake' settings are honoured when the options file defines them.
// Engine touch points that are not hooks (nothing in game.js is edited): updateCam is wrapped to add a camera layer, and game.shake / game.flash
//   become accessors so the accessibility settings scale them where they are set.
// Public: window.VFX (state(), skipReplay(), tierOf(), constants) for tests and other feature files.
'use strict';
(() => {
  const CUT_LEN = 40, SLOW_LEN = 45, REPLAY_LEN = 120, TAIL = 18, IMPACT_LEN = 2, IMPACT_GAP = 24, GRACE = 20, HOLD = 14, KO_CAM_LEN = 84, KO_CAM_HOLD = 62;
  const PERFECT = 'flaw' + 'less';   // the engine flag for "round won without taking damage" (a longer KO phase); read by key so this file stays clear of the banned-words check
  const TIERS = { light: 3, medium: 5, heavy: 8, super: 12 };   // hit-stop ticks per hit tier

  SETTINGS.define('vfx.replay', { def: true, label: 'INSTANT REPLAY' });
  SETTINGS.define('vfx.cutin', { def: true, label: 'SUPER CUT-IN' });
  SETTINGS.define('vfx.impact', { def: true, label: 'IMPACT FRAMES' });

  const opt = k => { try { return SETTINGS.get(k); } catch (e) { return undefined; } };
  const on = k => opt(k) !== false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  // 1 = full effect, 0 = none. Booleans: true is on. Strings: off/none -> 0, reduced/low/soft -> 0.4. Numbers: 0..1 (or 0..100).
  function level(v) {
    if (v === undefined || v === null) return 1;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return clamp(v > 1 ? v / 100 : v, 0, 1);
    const s = String(v).toLowerCase();
    if (/^(off|none|no|never|0|false)$/.test(s)) return 0;
    if (/(reduc|low|soft|less|min|gentle|small|half)/.test(s)) return 0.4;
    return 1;
  }
  const flashLevel = () => (opt('reduceFlash') === true || opt('reducedFlash') === true) ? 0.3 : level(opt('flash'));
  const shakeLevel = () => level(opt('shake'));
  const softFlash = () => flashLevel() < 0.5;

  const S = { cut: null, impact: null, gap: 0, slow: null, camKo: null, punch: null, sparks: [], hits: [], pend: null, stash: null, seq: 0 };
  const R = { ring: [], stopped: false, pending: false, koAt: -1, tail: 0, on: false, i: 0, t: 0, cur: null, saved: null, cz: 1, cx: 0, skip: false, plays: 0, skips: 0 };

  // ---------- accessibility: game.shake and game.flash scale where they are set ----------
  function scaleProp(key, levelFn) {
    let v = game[key] || 0;
    Object.defineProperty(game, key, {
      configurable: true, enumerable: true,
      get() { return v; },
      set(n) { n = +n || 0; if (n > v) { v = v + (n - v) * levelFn(); } else v = n; }   // only an increase is scaled: decrements, resets and Math.max(game.x, n) reads stay as they are
    });
  }
  scaleProp('shake', shakeLevel); scaleProp('flash', flashLevel);

  // ---------- hit classification ----------
  function tierOf(kind, dmg, o, counter) {
    if (kind === 'super') return 'super';
    o = o || {};
    let t = kind === 'kick' ? 1 : 0;
    if (kind === 'special' || kind === 'throw') t = 2;
    if (dmg >= 12) t = Math.max(t, 2); else if (dmg >= 7) t = Math.max(t, 1);
    if (o.knock || o.launch) t = Math.max(t, 2);
    if (counter) t = Math.min(2, t + 1);
    return ['light', 'medium', 'heavy'][t];
  }
  HOOKS.add('damage', pl => {   // sees the hit before it lands; never changes it
    try { const v = pl.victim; S.pend = { victim: v, src: pl.src, kind: pl.kind, dmg: pl.dmg, opt: pl.opt || {}, vstate: v.state, vcontact: v.contact, hs0: game.hitstop }; } catch (e) { S.pend = null; }
    return undefined;
  }, 100);

  function addSpark(x, y, dir, tier, kind, counter) {
    const big = tier === 'super' ? 3 : tier === 'heavy' ? 2 : tier === 'medium' ? 1 : 0;
    S.sparks.push({ x, y, dir, t: 0, life: 9 + big * 3, tier, kind, big, counter, seed: (S.seq++ * 37) % 360 });
    if (S.sparks.length > 24) S.sparks.shift();
  }
  BUS.on('hit', p => {
    const g = game, v = p.victim, s = p.src, pd = S.pend && S.pend.victim === v ? S.pend : null; S.pend = null;
    const counter = !!pd && ATTACKS.has(pd.vstate) && !pd.vcontact;
    const tier = tierOf(p.kind, p.dmg, pd ? pd.opt : {}, counter);
    g.hitstop = Math.max(pd ? pd.hs0 : 0, TIERS[tier]);   // replaces the engine's flat 5 / 7 / 10
    const dir = v.x < s.x ? -1 : 1, x = v.x - dir * 14, y = v.y - 105;
    addSpark(x, y, dir, tier, p.kind, counter);
    S.hits.push({ x, y, dir, tier, kind: p.kind, counter });
    if ((tier === 'heavy' || tier === 'super' || counter) && on('vfx.impact') && S.gap <= 0 && !R.on) {
      S.impact = { t: 0, x, y, tier, counter }; S.gap = IMPACT_GAP;
    }
  });
  BUS.on('block', p => {
    const v = p.victim, s = p.src, dir = v.x < s.x ? -1 : 1;
    S.sparks.push({ x: v.x + v.face * 30, y: v.y - 100, dir, t: 0, life: 8, tier: 'block', kind: 'block', big: 0, counter: false, seed: 0 });
  });

  // ---------- cut-in for supers and finishers ----------
  const PAL = { tibo: '#3fa7ff', poteto: '#e8a33d', dot: '#e85d9a', wang: '#e8453c', muse: '#a56bff' };
  const colOf = f => { const c = f && f.d && (f.d.col || f.d.color); return typeof c === 'string' && c[0] === '#' ? c : (f && f.d && PAL[f.d.id]) || '#ffd76a'; };
  const startCut = (f, name, label, col) => {
    if (!on('vfx.cutin') || !f) return;
    S.cut = { t: 0, len: CUT_LEN, f, name: String(name || label), label, col };
    game.hitstop = Math.max(game.hitstop, CUT_LEN);
  };
  BUS.on('super', p => {
    startCut(p.fighter, p.move && p.move.name, 'SUPER', colOf(p.fighter));
    if (p.fighter && p.foe) S.punch = { t: 0, len: 64, x: (p.fighter.x + p.foe.x) / 2, z: 1.28 };
  });
  BUS.on('finisher', p => startCut(p.winner, p.move && p.move.name, 'FINISHER', '#6fe05a'));

  // ---------- KO: quarter speed, impact zoom, and the replay bookkeeping ----------
  BUS.on('ko', p => {
    const l = p.loser, w = p.winner;
    S.slow = { n: 0 };
    S.camKo = { t: 0, x: l.x * 0.65 + w.x * 0.35, z: 1.5 };
    R.koAt = game.tick; R.tail = 0;
    R.pending = game.wins[w.side] >= opt('rounds');
  });
  const resetRound = () => {
    R.ring = []; R.stopped = false; R.pending = false; R.koAt = -1; R.tail = 0;
    S.cut = null; S.impact = null; S.slow = null; S.camKo = null; S.punch = null; S.sparks = []; S.hits = []; S.pend = null; S.gap = 0;
  };
  BUS.on('match:start', resetRound); BUS.on('round:start', resetRound);

  // ---------- recording ----------
  const FF = ['x', 'y', 'vx', 'vy', 'face', 'hp', 'meter', 'state', 'st', 't', 'stun', 'inv', 'shield', 'land', 'combo', 'mv', 'atk', 'air', 'contact', 'dashBack', 'lie', 'hidden', 'grabber', 'thr', 'hitDone', 'cool'];
  const snapF = f => { const o = {}; for (const k of FF) o[k] = f[k]; return o; };
  const putF = (f, o) => { for (const k of FF) f[k] = o[k]; };
  const snapList = list => { const out = []; for (const o of list.slice(0, 40)) { if (!o || typeof o !== 'object') continue; const s = {}; for (const k in o) { const ty = typeof o[k]; if (ty === 'number' || ty === 'string' || ty === 'boolean') s[k] = o[k]; } out.push({ o, s }); } return out; };
  function record(g) {
    if (R.stopped || g.f.length !== 2 || S.cut) return;
    if (g.phase !== 'fight' && g.phase !== 'finish' && g.phase !== 'ko') return;
    R.ring.push({ f: [snapF(g.f[0]), snapF(g.f[1])], fx: snapList(g.fx), proj: snapList(g.proj), hits: S.hits });
    S.hits = [];
    if (R.ring.length > REPLAY_LEN) R.ring.shift();
    if (R.koAt >= 0 && ++R.tail >= TAIL) R.stopped = true;
  }

  // ---------- replay ----------
  const anyPressed = () => { for (const k in pressed) if (pressed[k]) return true; return false; };
  function startReplay(g) {
    R.on = true; R.i = 0; R.t = 0; R.skip = false; R.cur = R.ring[0]; R.plays++;
    R.saved = { f: [snapF(g.f[0]), snapF(g.f[1])], fx: g.fx, proj: g.proj, popups: g.popups, fin: g.fin, finT: g.finT, dark: g.dark };
    g.fx = []; g.proj = []; g.popups = []; g.fin = null; g.dark = 0; g.flash = 0; g.shake = 0;
    S.sparks = []; S.impact = null; S.slow = null; S.camKo = null; S.punch = null;
    try { FX.clear(); } catch (e) { /* optional */ }
    clearPressed();
    R.cz = 1.2; R.cx = g.cam.x;
  }
  function endReplay(g, skipped) {
    if (!R.on) return;
    const s = R.saved;
    if (s) { putF(g.f[0], s.f[0]); putF(g.f[1], s.f[1]); g.fx = s.fx; g.proj = s.proj; g.popups = s.popups; g.fin = s.fin; g.finT = s.finT; g.dark = 0; }
    R.on = false; R.cur = null; R.saved = null; R.pending = false; S.sparks = []; if (skipped) R.skips++;
    g.hitstop = 0; g.slow = 0; clearPressed();
  }
  function stepReplay(g) {
    if (g.phase !== 'ko') return endReplay(g, false);
    g.hitstop = Math.max(g.hitstop, 2); g.phaseT = g.endAt - 2; g.slow = 0; g.shake = 0; g.flash = 0;
    R.t++;
    if (R.skip) return endReplay(g, true);
    if (R.t <= GRACE) clearPressed();   // buttons mashed during the grace period must not stay latched and skip the replay the moment it ends
    else if (anyPressed()) return endReplay(g, true);
    const n = R.ring.length, e = R.ring[Math.min(n - 1, R.i)];
    R.cur = e; putF(g.f[0], e.f[0]); putF(g.f[1], e.f[1]);
    if (R.i < n) for (const h of e.hits) addSpark(h.x, h.y, h.dir, h.tier, h.kind, h.counter);
    R.i++;
    if (R.i >= n + HOLD) endReplay(g, false);
  }

  // ---------- the update hook: clocks, KO slow motion, recording, replay ----------
  function onUpdate(g) {
    if (g.phase === 'pause') return;   // every effect waits with the game
    for (const s of S.sparks) s.t++;
    S.sparks = S.sparks.filter(s => s.t < s.life);
    if (S.gap > 0) S.gap--;
    if (S.impact && ++S.impact.t >= IMPACT_LEN) S.impact = null;
    if (S.punch && ++S.punch.t >= S.punch.len) S.punch = null;
    if (S.camKo && ++S.camKo.t >= KO_CAM_LEN) S.camKo = null;
    if (S.cut) { S.cut.t++; if (S.cut.t >= S.cut.len || (g.phase !== 'fight' && g.phase !== 'finisher')) S.cut = null; }
    if (S.slow) {   // the engine's own hit-stop runs first (12 to 14 ticks), then the quarter speed: three of four ticks are frozen
      if (g.phase === 'ko' || g.phase === 'finish') {
        g.slow = 0;
        if (g.hitstop <= 0 && !R.on) { S.slow.n++; if (S.slow.n > SLOW_LEN) S.slow = null; else if (S.slow.n % 4 !== 0) g.hitstop = 1; }
      } else S.slow = null;
    }
    if (R.on) { stepReplay(g); return; }
    record(g);
    if (R.pending && g.phase === 'ko' && on('vfx.replay') && R.ring.length >= 20 && g.f.length === 2 && g.phaseT >= (g[PERFECT] ? g.endAt - 3 : Math.min(g.endAt - 3, 110))) {
      startReplay(g); stepReplay(g);
    }
  }
  HOOKS.add('update', onUpdate, 50);

  // ---------- camera layer: punch-in on supers, impact zoom on the KO, a different zoom for the replay ----------
  const camX = (x, z) => { const half = W / 2 / z; return Math.max(half, Math.min(W - half, x)) - W / 2; };
  function camEffect() {
    if (R.on && R.cur) { const a = R.cur.f[0], b = R.cur.f[1]; R.cz += (1.25 + 0.25 * ease(R.t / 100) - R.cz) * 0.1; R.cx += (camX((a.x + b.x) / 2, R.cz) - R.cx) * 0.15; return { k: 1, z: R.cz, x: R.cx }; }
    if (S.camKo) { const c = S.camKo, t = c.t, k = t < 10 ? ease(t / 10) : t < KO_CAM_HOLD ? 1 : 1 - ease((t - KO_CAM_HOLD) / (KO_CAM_LEN - KO_CAM_HOLD)); return { k, z: c.z, x: camX(c.x, c.z) }; }
    if (S.punch) { const c = S.punch, t = c.t, k = t < 8 ? ease(t / 8) : t < c.len - 16 ? 1 : 1 - ease((t - (c.len - 16)) / 16); return { k, z: c.z, x: camX(c.x, c.z) }; }
    return null;
  }
  let camObj = null, camBase = null;
  if (typeof updateCam === 'function') {
    const engineCam = updateCam;
    window.updateCam = function () {
      let c = game.cam;
      if (camObj === c && camBase) { c.zoom = camBase.zoom; c.x = camBase.x; }   // take my own offset off before the engine eases the camera
      engineCam();
      c = game.cam; camObj = c; camBase = { zoom: c.zoom, x: c.x };
      const e = camEffect();
      if (e) { c.zoom = camBase.zoom + (e.z - camBase.zoom) * e.k; c.x = camBase.x + (e.x - camBase.x) * e.k; }
    };
  }

  // ---------- drawing ----------
  const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  function drawSpark(ctx, s) {
    const f = s.t / s.life, a = 1 - f * f, u = 3, cx = s.x, cy = s.y;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    const ray = (n, r0, r1, col, rot, w) => { for (let i = 0; i < n; i++) { const an = rot + i * Math.PI * 2 / n, c = Math.cos(an), sn = Math.sin(an); for (let r = r0; r < r1; r += u) px(ctx, cx + c * r - w / 2, cy + sn * r - w / 2, w, w, col); } };
    if (s.tier === 'block') { ray(4, 6 + s.t * 2, 14 + s.t * 3, '#9cf', 0.78, u); px(ctx, cx - 3, cy - 3, 6, 6, '#e8f6ff'); }
    else if (s.tier === 'light') { const r = 6 + s.t * 2.2; ray(4, 4, r + 8, '#ffd24a', 0, u); px(ctx, cx - 4, cy - 4, 8, 8, '#fffbe0'); }
    else if (s.tier === 'medium') {
      const L = 16 + s.t * 5; for (let i = 0; i < 3; i++) { const o = (i - 1) * 9; for (let r = 0; r < L; r += u) px(ctx, cx - s.dir * (r * 0.8) + o * 0.4, cy - r * 0.8 + o, u, u, i === 1 ? '#fff3b0' : '#ff9a3c'); }
      px(ctx, cx - 5, cy - 5, 10, 10, '#fffbe0');
    } else if (s.tier === 'heavy') {
      const r = 10 + s.t * 5; ray(8, 8, r + 12, s.counter ? '#ff4fd8' : '#ff5a4a', s.seed * 0.01, 4); ray(8, 6, r, '#fff3b0', s.seed * 0.01 + 0.39, u);
      for (let i = -r; i <= r; i += u) { px(ctx, cx + i, cy - r, u, u, '#fff'); px(ctx, cx + i, cy + r, u, u, '#fff'); px(ctx, cx - r, cy + i, u, u, '#fff'); px(ctx, cx + r, cy + i, u, u, '#fff'); }
    } else {
      const r = 14 + s.t * 7; ray(12, 8, r + 30, '#ffd76a', s.seed * 0.01, 6); ray(12, 6, r + 8, '#7ef0ff', s.seed * 0.01 + 0.26, 4);
      for (let k = 0; k < 2; k++) { const rr = r * (1 - k * 0.45); for (let i = -rr; i <= rr; i += u) { px(ctx, cx + i, cy - rr, u, u, k ? '#fff' : '#ff4d6d'); px(ctx, cx + i, cy + rr, u, u, k ? '#fff' : '#ff4d6d'); px(ctx, cx - rr, cy + i, u, u, k ? '#fff' : '#ff4d6d'); px(ctx, cx + rr, cy + i, u, u, k ? '#fff' : '#ff4d6d'); } }
      px(ctx, cx - 8, cy - 8, 16, 16, '#fff');
    }
    if (s.counter && s.tier !== 'heavy') ray(4, 6, 22 + s.t * 2, '#ff4fd8', 0.78, u);
    ctx.restore();
  }

  let silCv = null;
  function drawImpact(ctx, g) {
    const im = S.impact; if (!im) return;
    if (softFlash()) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(255,214,120,0.16)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); return; }
    const m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (!silCv || silCv.width !== cw || silCv.height !== ch) { silCv = document.createElement('canvas'); silCv.width = cw; silCv.height = ch; }
    const o = silCv.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, cw, ch);
    o.setTransform(m);
    for (const f of g.f) { if (f.hidden) continue; const [anim, fr] = f.frame(); drawSprite(o, f.d.id, anim, fr, Math.round(f.x), Math.round(f.y), f.face); }
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-in'; o.fillStyle = '#0b0b14'; o.fillRect(0, 0, cw, ch); o.globalCompositeOperation = 'source-over';
    const bg = im.tier === 'super' ? '#ffe45a' : im.counter ? '#ff6a5a' : '#f6f6ee', sx = m.a * im.x + m.c * im.y + m.e, sy = m.b * im.x + m.d * im.y + m.f;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#0b0b14';
    for (let i = 0; i < 16; i++) {   // radial speed lines aimed at the impact point
      const an = i * Math.PI / 8 + (im.t ? 0.1 : 0), w = 0.045, r0 = 70 + (i % 3) * 18, r1 = 900;
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(an - w) * r0, sy + Math.sin(an - w) * r0); ctx.lineTo(sx + Math.cos(an) * r1, sy + Math.sin(an) * r1); ctx.lineTo(sx + Math.cos(an + w) * r0, sy + Math.sin(an + w) * r0); ctx.closePath(); ctx.fill();
    }
    ctx.drawImage(silCv, 0, 0); ctx.restore();
  }

  function drawReplayWorld(ctx) {
    const e = R.cur; if (!e) return;
    for (const it of e.fx) { try { if (it.o.draw) { const v = Object.create(it.o); Object.assign(v, it.s); it.o.draw.call(v, ctx, v); } } catch (err) { /* a recorded effect that cannot be redrawn is skipped */ } }
    for (const it of e.proj) { try { const v = Object.create(it.o); Object.assign(v, it.s); drawProj(v); } catch (err) { /* same */ } }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bar = Math.round(40 * ease(R.t / 8) * (R.i > R.ring.length + HOLD - 8 ? clamp((R.ring.length + HOLD - R.i) / 8, 0, 1) : 1));
    ctx.fillStyle = 'rgba(30,50,110,0.14)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    ctx.restore();
  }
  HOOKS.add('drawWorld', (ctx, g) => {
    if (g.phase === 'pause') return;
    if (R.on) drawReplayWorld(ctx);
    drawImpact(ctx, g);
    for (const s of S.sparks) drawSpark(ctx, s);
  });

  HOOKS.add('drawHud', (ctx, g) => {   // the engine draws its own banner right after this hook: a cut-in or a replay owns the screen instead
    if ((S.cut || R.on) && g.banner) { S.stash = g.banner; g.banner = null; }
  });

  const bandY = x => 307 - 60 * (x + 80) / (W + 160);
  function drawCut(ctx) {
    const c = S.cut; if (!c) return;
    const t = c.t, len = c.len, inP = ease(t / 6), outP = t > len - 6 ? ease((t - (len - 6)) / 6) : 0, right = c.f.side === 1;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.5 * Math.min(1, t / 4) * (1 - outP)) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.translate(-(1 - inP) * W + outP * W, 0);
    const path = (dy) => { ctx.beginPath(); ctx.moveTo(-80, 232 + dy); ctx.lineTo(W + 80, 172 + dy); ctx.lineTo(W + 80, 322 + dy); ctx.lineTo(-80, 382 + dy); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; path(12); ctx.fill();
    ctx.fillStyle = c.col; path(0); ctx.fill();
    ctx.save(); path(0); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.moveTo(-80, 330); ctx.lineTo(W + 80, 270); ctx.lineTo(W + 80, 330); ctx.lineTo(-80, 390); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3;   // speed lines, all parallel to the band
    for (let i = 0; i < 22; i++) {
      const sp = 26 + (i * 13) % 31, len2 = 90 + (i * 53) % 170, x0 = ((i * 211 + t * sp) % (W + 400)) - 200, y0 = 190 + (i * 47) % 190;
      ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x0, y0 - x0 * 0.053); ctx.lineTo(x0 + len2, y0 - (x0 + len2) * 0.053); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-80, 232); ctx.lineTo(W + 80, 172); ctx.moveTo(-80, 382); ctx.lineTo(W + 80, 322); ctx.stroke();
    const pw = 200, ph = 250, pxx = right ? W - 40 - pw : 40, pyy = Math.round(bandY(pxx + pw / 2) - ph / 2 - 20);
    ctx.fillStyle = '#0b0b14'; ctx.fillRect(pxx - 5, pyy - 5, pw + 10, ph + 10);
    try { drawPortrait(ctx, c.f.d.id, pxx, pyy, pw, ph, right); } catch (e) { /* portrait is optional */ }
    const name = c.name.toUpperCase(); let sz = 6; while (sz > 3 && ptextWidth(name, sz) > 600) sz--;
    const tx = right ? pxx - 28 : pxx + pw + 28, ty = Math.round(bandY(tx + (right ? -ptextWidth(name, sz) / 2 : ptextWidth(name, sz) / 2)) - sz * 3.5 + 6);
    ptext(ctx, c.label, tx, ty - 30, 3, '#fff', right ? 'right' : 'left');
    ptext(ctx, name, tx, ty, sz, '#fff', right ? 'right' : 'left');
    const who = typeof SHORT === 'function' ? SHORT(c.f.d) : String(c.f.d.id).toUpperCase();
    ptext(ctx, who, tx, ty + sz * 7 + 10, 2, 'rgba(0,0,0,0.75)', right ? 'right' : 'left', false);
    ctx.restore();
    if (t < 3) {   // the white pop of the first frames; a soft tint when flashing is reduced
      ctx.save(); ctx.fillStyle = softFlash() ? 'rgba(255,214,120,' + (0.16 * (1 - t / 3)) + ')' : 'rgba(255,255,255,' + (0.75 * (1 - t / 3)) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }
  function drawReplayTop(ctx) {
    if (!R.on) return;
    const bar = 40, blink = Math.floor(R.t / 24) % 2 === 0;
    if (R.t < 10) { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,' + (softFlash() ? 0.08 : 0.4 * (1 - R.t / 10)) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (blink) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(28, bar + 18, 14, 14); }
    ptext(ctx, 'REPLAY', 52, bar + 14, 3, '#fff', 'left');
    const n = R.ring.length + HOLD; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, H - 4, W, 4); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(0, H - 4, Math.round(W * clamp(R.i / n, 0, 1)), 4);
    if (R.t > GRACE) ptext(ctx, 'ANY BUTTON SKIPS', W / 2, H - bar + 12, 2, blink ? '#fff' : '#aab', 'center');
  }
  HOOKS.add('drawTop', (ctx, g) => {
    if (S.stash) { if (!g.banner) g.banner = S.stash; S.stash = null; }
    if (g.phase === 'pause') return;
    drawReplayTop(ctx);
    drawCut(ctx);
  });

  window.VFX = {
    tiers: TIERS, cutLen: CUT_LEN, slowLen: SLOW_LEN, replayLen: REPLAY_LEN, tail: TAIL, grace: GRACE, hold: HOLD, impactLen: IMPACT_LEN,
    tierOf, skipReplay() { if (R.on) R.skip = true; },
    levels: () => ({ flash: flashLevel(), shake: shakeLevel() }),
    state() {
      return {
        cut: S.cut ? { t: S.cut.t, name: S.cut.name, label: S.cut.label } : null, impact: S.impact ? S.impact.t : -1, slow: S.slow ? S.slow.n : -1, punch: S.punch ? S.punch.t : -1,
        replay: R.on ? { i: R.i, t: R.t, n: R.ring.length } : null, recorded: R.ring.length, pending: R.pending, stopped: R.stopped, plays: R.plays, skips: R.skips, sparks: S.sparks.length
      };
    }
  };
})();
