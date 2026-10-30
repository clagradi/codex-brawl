// ===== AGENT BRAWL feature file: MUTATORS. Loaded last (see docs/ARCHITECTURE.md). =====
// Owner: the p-mutators agent. Only that agent edits this file, tools/tests/x-p-mutators.mjs and docs/features/p-mutators.md.
// Area: match modifiers picked before a VS match: BIG HEADS, LOW GRAVITY, TURBO 1.5X, RATE LIMITED, LEGACY MODE and GLASS CANNON. All six are off by default.
// Plug in with HOOKS 'update' (the G panel on the select screen, TURBO's extra tick, the BIG HEADS sheet swap), 'fighterUpdate' (LOW GRAVITY, RATE LIMITED), 'damage' (GLASS CANNON),
// 'drawFighter' (the recharge bar), 'drawHud' (tags under the round timer) and 'drawTop' (VS chips, the select panel, the LEGACY filter), BUS 'match:start', 'round:start' and 'phase',
// and SETTINGS 'mutators.on' (the saved choice).
// How each one works: TURBO runs the engine's own update() a second time on every other tick of a fight (1.5 ticks of simulation per tick). LOW GRAVITY gives back part of the
// gravity the engine just applied to a fighter in the air. RATE LIMITED holds a fighter's special on the engine's own cooldown (cool) for a fixed time after each special; the CPU
// already respects it. GLASS CANNON doubles every damage number in the damage filter. LEGACY MODE paints the finished frame with saturation, multiply and lighter blends (no pixel
// readback) and a scanline layer. BIG HEADS rasterises a second sheet and extra-pose sheet per fighter with the head drawn larger (the engine's own head and face routines, called with
// a bigger scale while the sheet is built) and puts it in SHEETS and XSHEETS while the mutator is live, so every screen that draws a fighter shows it, palettes included.
// Mutators apply in the 'versus' and 'versus2' modes, and in any mode whose definition says mutators: true. No engine file is edited. Public API: window.MUTATORS (bottom of this file).
'use strict';
(() => {
  window.STUB_MUTATORS = 1;   // marker: tools/tests/core.mjs style checks that this file loaded.

  const OPEN_KEY = 'KeyG';                 // opens and closes the panel on the select screen
  const HEAD_K = 1.35, HEAD_DY = 3;        // BIG HEADS: head and face scale, and how far the head sinks into the shoulders (sprite pixels)
  const GRAV_K = 0.6;                      // LOW GRAVITY: fraction of the engine's gravity that is left
  const TURBO_EVERY = 2;                   // TURBO: one extra simulation tick for every this many ticks (2 = 1.5x speed)
  const RATE_COOL = 210;                   // RATE LIMITED: ticks a fighter's special stays on cooldown after each special (3.5 seconds)
  const GLASS_K = 2;                       // GLASS CANNON: every hit does this many times the damage
  const KEY = 'mutators.on';

  const DEFS = [
    { id: 'bigheads', name: 'BIG HEADS', tag: 'BIG HEADS', col: '#ffb13b', desc: 'HEADS GROW BY A THIRD' },
    { id: 'lowgrav', name: 'LOW GRAVITY', tag: 'LOW GRAV', col: '#7ad7ff', desc: 'FLOATY JUMPS, LONG AIR TIME' },
    { id: 'turbo', name: 'TURBO 1.5X', tag: 'TURBO', col: '#ff5b5b', desc: 'THE FIGHT RUNS 1.5X FASTER' },
    { id: 'rate', name: 'RATE LIMITED', tag: 'RATE LIMIT', col: '#ffe27a', desc: 'SPECIALS COOL DOWN 3.5 SECONDS' },
    { id: 'legacy', name: 'LEGACY MODE', tag: 'LEGACY', col: '#55e07a', desc: 'GREEN SCREEN AND SCANLINES' },
    { id: 'glass', name: 'GLASS CANNON', tag: 'GLASS', col: '#d79bff', desc: 'ALL DAMAGE DOUBLED' },
  ];
  const BY = {}; for (const d of DEFS) BY[d.id] = d;
  const PLAY = { vs: 1, intro: 1, fight: 1, pause: 1, finish: 1, finisher: 1, ko: 1, outro: 1, over: 1 };   // phases of a match (everything but the title, select and sheet screens)
  const NOHUD = { vs: 1, over: 1, finisher: 1 };

  SETTINGS.define(KEY, { def: {}, label: 'MUTATORS' });   // { mutatorId: true } for each one that is on
  let on = {};
  function refresh() { const v = SETTINGS.get(KEY); on = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  refresh();
  BUS.on('settings', e => { if (e && e.key === KEY) refresh(); });

  const scope = g => { const id = g.modeId; if (id === 'versus' || id === 'versus2') return true; const m = typeof MODES !== 'undefined' && MODES.get ? MODES.get(id) : null; return !!m && m.mutators === true; };
  const live = id => !!on[id] && PLAY[game.phase] === 1 && scope(game);
  const anyOn = () => { for (const d of DEFS) if (on[d.id]) return true; return false; };
  const count = () => { let n = 0; for (const d of DEFS) if (on[d.id]) n++; return n; };
  const beepOk = (f, d) => { if (typeof beep === 'function') beep(f, d || 0.05, 'square', 0.04); };

  function setOn(id, v) {
    if (!BY[id]) return false;
    const next = {}; for (const d of DEFS) if (on[d.id]) next[d.id] = true;
    if (v) next[id] = true; else delete next[id];
    SETTINGS.set(KEY, next); refresh(); return !!on[id];
  }

  // ---------- BIG HEADS: a second pair of sheets per fighter, built once with the engine's head routines scaled up ----------
  const big = {}, orig = {};   // id -> { s, x } sheet canvases (or false when the build failed), and the engine sheets that were swapped out
  const spritesOk = () => typeof renderFrame === 'function' && typeof ANIMS !== 'undefined' && typeof LOOK !== 'undefined' && typeof SHEETS !== 'undefined' && typeof XSHEETS !== 'undefined' &&
    typeof XROWS !== 'undefined' && typeof XFRAMES !== 'undefined' && typeof MAXF !== 'undefined' && typeof H_ === 'function' && typeof drawHead === 'function' && typeof plushHood === 'function';
  function buildBig(id) {
    if (big[id] !== undefined) return big[id];
    big[id] = false;
    if (!spritesOk() || !LOOK[id]) return false;
    const H0 = window.H_, D0 = window.drawHead, P0 = window.plushHood;
    window.H_ = (P, x, y, k) => H0(P, x, y, k * HEAD_K);                                         // every head and face is drawn from H_, so this scales them all
    window.plushHood = (P, fur, crm, fx, fy, k) => P0(P, fur, crm, fx, fy, k * HEAD_K);           // the plush fighter's hood opening
    window.drawHead = (P, i, L, x, y, k, ex, bust) => D0(P, i, L, x, y + HEAD_DY, k, ex, bust);   // human heads sink a little into the shoulders
    try {
      const cv = document.createElement('canvas'); cv.width = FW * MAXF; cv.height = FH * ANIMS.length;
      const c2 = cv.getContext('2d'), img = c2.createImageData(cv.width, cv.height);
      ANIMS.forEach((a, row) => { for (let f = 0; f < a.f; f++) renderFrame(id, a.n, f).writeTo(img, f * FW, row * FH); });
      c2.putImageData(img, 0, 0);
      const xc = document.createElement('canvas'); xc.width = FW * XFRAMES; xc.height = FH * XROWS.length;
      const x2 = xc.getContext('2d'), xi = x2.createImageData(xc.width, xc.height);
      XROWS.forEach((n, row) => { for (let f = 0; f < XFRAMES; f++) renderFrame(id, n, f).writeTo(xi, f * FW, row * FH); });
      x2.putImageData(xi, 0, 0);
      big[id] = { s: cv, x: xc };
    } catch (e) { big[id] = false; }
    finally { window.H_ = H0; window.drawHead = D0; window.plushHood = P0; }
    return big[id];
  }
  function syncHeads() {
    const want = on.bigheads && game.f.length && PLAY[game.phase] === 1 && scope(game);
    if (want) {
      for (const f of game.f) {
        const id = f.d.id, b = buildBig(id);
        if (b && SHEETS[id] !== b.s) { if (!orig[id]) orig[id] = { s: SHEETS[id], x: XSHEETS[id] }; SHEETS[id] = b.s; XSHEETS[id] = b.x; }
      }
    } else for (const id in orig) { SHEETS[id] = orig[id].s; XSHEETS[id] = orig[id].x; delete orig[id]; }
  }

  // ---------- the panel on the select screen ----------
  const ui = { open: false, sel: 0 };
  const DIG = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
  function panelKeys() {
    const n = DEFS.length;
    const up = tap('KeyW') || tap('ArrowUp'), dn = !up && (tap('KeyS') || tap('ArrowDown'));
    if (up) { ui.sel = (ui.sel + n - 1) % n; beepOk(420); } else if (dn) { ui.sel = (ui.sel + 1) % n; beepOk(420); }
    const tg = tap('Enter') || tap('Space') || tap('KeyJ') || tap('KeyA') || tap('KeyD') || tap('ArrowLeft') || tap('ArrowRight');
    if (tg) { setOn(DEFS[ui.sel].id, !on[DEFS[ui.sel].id]); beepOk(on[DEFS[ui.sel].id] ? 760 : 300, 0.07); }
    for (let i = 0; i < n; i++) if (tap(DIG[i])) { ui.sel = i; setOn(DEFS[i].id, !on[DEFS[i].id]); beepOk(on[DEFS[i].id] ? 760 : 300, 0.07); }
    if (tap('KeyX') || tap('Backspace')) { for (const d of DEFS) setOn(d.id, false); beepOk(240, 0.08); }
    if (tap(OPEN_KEY) || tap('Escape') || tap('KeyK')) { ui.open = false; beepOk(500); }
    clearPressed();   // while the panel is open the select screen behind it sees no keys
  }

  // ---------- state per round ----------
  let tq = 0, nested = false;                  // TURBO tick counter and the re-entry guard
  const spFlag = [false, false], rl = [false, false];   // RATE LIMITED: the fighter was in a special last tick; the cooldown on it is ours
  const reset = () => { tq = 0; spFlag[0] = spFlag[1] = false; rl[0] = rl[1] = false; };
  BUS.on('match:start', reset); BUS.on('round:start', reset);
  BUS.on('phase', e => { if (e && e.to !== 'select') ui.open = false; if (e && (e.to === 'title' || e.to === 'select')) syncHeads(); });

  // ---------- hooks ----------
  HOOKS.add('update', g => {   // TURBO first, so the extra tick is a whole tick that every later hook sees as well
    if (nested || !on.turbo || g.phase !== 'fight' || !scope(g)) return;
    if (++tq % TURBO_EVERY === 0) { nested = true; try { window.update(); } finally { nested = false; } }
  }, -1000);
  HOOKS.add('update', g => {
    syncHeads();
    if (g.phase !== 'select' || !scope(g)) { ui.open = false; return; }
    if (ui.open) panelKeys();
    else if (tap(OPEN_KEY)) { ui.open = true; ui.sel = 0; beepOk(600); clearPressed(); }
  }, -500);

  HOOKS.add('fighterUpdate', (a, b) => {
    if (!PLAY[game.phase] || !scope(game)) return;
    if (on.lowgrav) {
      const d = GRAV * (1 - GRAV_K);   // the engine has just added GRAV to vy and vy to y: take the difference back
      for (const f of [a, b]) if (f.y < GROUND && f.state !== 'grabbed') { f.vy -= d; f.y -= d; }
    }
    if (on.rate) {
      for (const f of [a, b]) {
        const s = f.side;
        if (f.state === 'special') spFlag[s] = true;
        else if (spFlag[s]) { spFlag[s] = false; if (f.cool < RATE_COOL) f.cool = RATE_COOL; rl[s] = true; }
        if (rl[s] && f.cool <= 0) rl[s] = false;
      }
    }
  });

  HOOKS.add('damage', pl => {
    if (on.glass && pl && PLAY[game.phase] === 1 && scope(game) && isFinite(pl.dmg)) pl.dmg *= GLASS_K;
    return pl;
  });

  // ---------- drawing ----------
  function chip(c, x, y, str, col, size) {   // a tag: dark plate, coloured edge, pixel text; x is the left edge, returns the width
    const w = ptextWidth(str, size) + 12, h = size * 8 + 6;
    c.fillStyle = 'rgba(5,3,10,0.82)'; c.fillRect(x, y, w, h); c.fillStyle = col; c.fillRect(x, y, w, 2); c.fillRect(x, y + h - 2, w, 2);
    ptext(c, str, x + 6, y + 4, size, col); return w;
  }
  function chipRows(c, list, cy, size, gap, maxW) {   // centred rows of chips, wrapped at maxW; returns the bottom edge
    const h = size * 8 + 6; let row = [], rw = 0, y = cy;
    const flush = () => { let x = Math.round(W / 2 - rw / 2); for (const d of row) x += chip(c, x, y, d.tag, d.col, size) + gap; y += h + gap; row = []; rw = 0; };
    for (const d of list) { const w = ptextWidth(d.tag, size) + 12; if (row.length && rw + gap + w > maxW) flush(); rw += (row.length ? gap : 0) + w; row.push(d); }
    if (row.length) flush();
    return y - gap;
  }
  const actives = () => DEFS.filter(d => on[d.id]);

  HOOKS.add('drawFighter', (c, f) => {   // RATE LIMITED: a small bar over the head that fills as the special recharges
    if (!on.rate || !rl[f.side] || f.hidden || f.cool <= 0 || game.phase !== 'fight' || !scope(game)) return;
    const w = 44, x = Math.round(f.x - w / 2), y = Math.round(f.y - 218), u = 1 - Math.min(1, f.cool / RATE_COOL);
    c.fillStyle = '#05030a'; c.fillRect(x - 2, y - 2, w + 4, 8); c.fillStyle = '#5a4a14'; c.fillRect(x, y, w, 4); c.fillStyle = '#ffe27a'; c.fillRect(x, y, Math.round(w * u), 4);
  });

  HOOKS.add('drawHud', c => {   // tags for what is on, under the round timer
    if (!anyOn() || !PLAY[game.phase] || NOHUD[game.phase] || !scope(game)) return;
    chipRows(c, actives(), 80, 2, 4, 640);
  });

  function drawVsChips(c) {
    const list = actives(); if (!list.length) return;
    c.save(); chipRows(c, list, 344, 2, 6, 720); c.restore();
  }

  function drawPanel(c) {
    const px = 170, py = 62, pw = 620, ph = 416;
    c.save(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0b0714'; c.fillRect(px, py, pw, ph); c.strokeStyle = '#c9a24a'; c.lineWidth = 3; c.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    ptext(c, 'MUTATORS', W / 2, py + 14, 4, '#ffe27a', 'center');
    ptext(c, count() ? count() + ' ON  -  APPLIED TO THE NEXT MATCH' : 'ALL OFF  -  A NORMAL MATCH', W / 2, py + 52, 2, '#9d96ab', 'center');
    DEFS.forEach((d, i) => {
      const y = py + 82 + i * 49, sel = i === ui.sel, isOn = !!on[d.id];
      if (sel) { c.fillStyle = '#26183f'; c.fillRect(px + 14, y - 4, pw - 28, 45); c.fillStyle = d.col; c.fillRect(px + 14, y - 4, 4, 45); }
      c.fillStyle = '#05030a'; c.fillRect(px + 30, y + 4, 26, 26); c.fillStyle = isOn ? d.col : '#2a2432'; c.fillRect(px + 33, y + 7, 20, 20);
      if (isOn) { c.fillStyle = '#05030a'; c.fillRect(px + 38, y + 16, 4, 4); c.fillRect(px + 42, y + 12, 4, 4); }
      ptext(c, (i + 1) + '', px + 72, y + 2, 3, '#6f6880');
      ptext(c, d.name, px + 100, y + 2, 3, isOn ? d.col : '#e8e2d6');
      ptext(c, d.desc, px + 100, y + 26, 2, isOn ? '#c9c3b8' : '#8d8696');
      ptext(c, isOn ? 'ON' : 'OFF', px + pw - 32, y + 10, 3, isOn ? '#55e07a' : '#6f6880', 'right');
    });
    ptext(c, 'W S MOVE  ENTER TOGGLE  X CLEARS  G CLOSES', W / 2, py + ph - 28, 2, '#9d96ab', 'center');
    c.restore();
  }

  let scan = null;
  function scanlines() {
    if (scan === null) {
      try { scan = document.createElement('canvas'); scan.width = W; scan.height = H; const s = scan.getContext('2d'); s.fillStyle = 'rgba(0,20,6,0.2)'; for (let y = 0; y < H; y += 3) s.fillRect(0, y, W, 1); }
      catch (e) { scan = false; }
    }
    return scan;
  }
  function legacy(c) {   // grey it, tint it green, lift the blacks to phosphor green, lay scanlines over it
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'saturation'; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'multiply'; c.fillStyle = '#58ff7a'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = '#031c0a'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over'; const s = scanlines(); if (s) c.drawImage(s, 0, 0);
    c.restore();
  }

  HOOKS.add('drawTop', (c, g) => {
    if (g.phase === 'select' && scope(g)) {
      if (ui.open) drawPanel(c);
      else { const n = count(), tc = typeof touch === 'object' && touch.on; if (!tc || n) ptext(c, (tc ? '' : OPEN_KEY.slice(3) + '  ') + 'MUTATORS' + (n ? '  ' + n + ' ON' : ''), W - 14, 14, 2, n ? '#ffe27a' : '#8d8696', 'right'); }   // the panel opens by key only: a touch player is not told to press G, but still sees that saved mutators are on
      return;
    }
    if (!PLAY[g.phase] || !scope(g)) return;
    if (g.phase === 'vs') drawVsChips(c);
    if (on.legacy) legacy(c);
  }, 900);

  window.MUTATORS = {
    ids: DEFS.map(d => d.id),
    list: () => DEFS.map(d => ({ id: d.id, name: d.name, desc: d.desc, on: !!on[d.id] })),
    isOn: id => !!on[id], live: id => live(id), active: () => actives().map(d => d.id), count,
    set: (id, v) => setOn(id, !!v), toggle: id => setOn(id, !on[id]), clear() { for (const d of DEFS) setOn(d.id, false); },
    open() { if (game.phase === 'select' && scope(game)) { ui.open = true; ui.sel = 0; } return ui.open; }, close() { ui.open = false; },
    get isOpen() { return ui.open; }, get sel() { return ui.sel; },
    bigSheets: id => (big[id] ? { sheet: big[id].s, xsheet: big[id].x } : null), bigLive: id => !!orig[id],
    scope: () => scope(game),
    K: { HEAD_K, HEAD_DY, GRAV_K, TURBO_EVERY, RATE_COOL, GLASS_K }, key: OPEN_KEY,
    ready: true,
  };
})();
