// ===== AGENT BRAWL feature file: P-VAULT. Loaded last, after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: p-vault agent. The EXTRAS screen, a title menu entry: a fighter gallery with an animation picker, an arena gallery, the colourway cards and the lifetime stats.
// Notes and the test API: docs/features/p-vault.md. It talks to the engine only through BUS, HOOKS and SETTINGS. The screen is drawn by the 'drawTop' hook while the
// engine stays in phase 'title'; the 'update' hook reads its input first and then clears the key presses, so the engine title menu never sees them. While the screen
// is closed every hook returns on its first line (the update hook only listens for V on the title). Lifetime stats are counted from BUS events into the setting 'vault.stats' and merged with ARCADE.stats() when present.
'use strict';
(() => {
  window.STUB_VAULT = 1;   // marker: the feature files carry one, tools/tests/x-p-vault.mjs checks it.

  // ---------------------------------------------------------------- constants
  const TABS = ['FIGHTERS', 'ARENAS', 'COLOURWAYS', 'STATS'];
  const KEEP = 'vault.stats';
  const CAP = 1e9, MAX_ARENAS = 64, LIST_ROWS = 16;
  const C = { bg: '#0b0a14', panel: '#1b1830', edge: '#463f7a', gold: '#ffd23f', red: '#ff4155', green: '#5cff8a', cyan: '#7ef0ff', dim: '#8f89bd', white: '#ffffff', ink: '#05040a' };
  SETTINGS.define(KEEP, { def: {}, label: 'VAULT STATS' });   // { v, m, r, ko, sp, su, fi, combo, comboBy, f: { id: { w, l, c } }, ar: { arenaId: n } }, see docs/features/p-vault.md

  // ---------------------------------------------------------------- lifetime stats, counted from the BUS
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(CAP, Math.floor(v)) : 0);
  function blank() {
    const s = { v: 1, m: 0, r: 0, ko: 0, sp: 0, su: 0, fi: 0, combo: 0, comboBy: '', f: {}, ar: {} };
    for (const r of ROSTER) s.f[r.id] = { w: 0, l: 0, c: 0 };
    return s;
  }
  function normalize(raw) {   // whatever was stored becomes a clean record: unknown keys are dropped, numbers are whole and bounded
    const s = blank(); if (!raw || typeof raw !== 'object') return s;
    for (const k of ['m', 'r', 'ko', 'sp', 'su', 'fi', 'combo']) s[k] = num(raw[k]);
    for (const r of ROSTER) { const x = raw.f && raw.f[r.id]; if (x && typeof x === 'object') s.f[r.id] = { w: num(x.w), l: num(x.l), c: num(x.c) }; }
    s.comboBy = ROSTER.some(r => r.id === raw.comboBy) ? raw.comboBy : '';
    if (raw.ar && typeof raw.ar === 'object') {
      let n = 0;
      for (const id of Object.keys(raw.ar)) { if (n >= MAX_ARENAS) break; const q = num(raw.ar[id]); if (q && /^[a-z0-9_-]{1,40}$/i.test(id)) { s.ar[id] = q; n++; } }
    }
    return s;
  }
  let S = normalize(SETTINGS.get(KEEP)), dirty = false, last = JSON.stringify(S);
  // Saving fires a BUS 'settings' event, and the engine events test counts those during a match, so nothing is saved while a match is on:
  // the record is written when the game leaves the end screen, pauses, or goes back to a menu, and when the page is hidden or closed.
  function flush() {
    if (!dirty) return; dirty = false;
    last = JSON.stringify(S); SETTINGS.set(KEEP, JSON.parse(last));
  }
  BUS.on('settings', e => {   // a reset (or any outside write) of the setting replaces the live record
    if (!e || e.key !== KEEP) return;
    const j = JSON.stringify(e.value); if (j === last) return;
    S = normalize(e.value); dirty = false; last = JSON.stringify(S);
  });
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });   // phones often skip pagehide

  const replaying = () => { try { return !!(window.REPLAYS && REPLAYS.state().active); } catch (e) { return false; } };   // watching a replay re-runs a match that already counted
  const demo = () => { try { return game.modeId === 'watch' && !!(window.WATCH && WATCH.state().kind === 'demo'); } catch (e) { return false; } };   // the title attract demo is nobody's play (a WATCH match still counts as a match)
  const human = f => !!f && !f.cpu && !!f.d && game.modeId !== 'training' && !replaying();   // training is practice: it counts for nothing
  const rosterId = f => (f && f.d && !f.d.oc && S.f[f.d.id] ? f.d.id : null);   // the overclocked mirror boss is no roster fighter
  const bump = k => { S[k] = Math.min(CAP, S[k] + 1); dirty = true; };
  BUS.on('match:start', e => {
    if (!e || e.modeId === 'training' || replaying() || demo()) return;
    const a = ARENAS[e.arena | 0]; if (!a) return;
    if (!S.ar[a.id] && Object.keys(S.ar).length >= MAX_ARENAS) return;
    S.ar[a.id] = Math.min(CAP, (S.ar[a.id] | 0) + 1); dirty = true;
  });
  BUS.on('hit', e => {
    const s = e && e.src; if (!human(s)) return;
    const c = Math.min(CAP, e.combo | 0), id = rosterId(s);
    if (c > S.combo) { S.combo = c; S.comboBy = id || ''; dirty = true; }
    if (id && c > S.f[id].c) { S.f[id].c = c; dirty = true; }
  });
  BUS.on('round:end', () => { if (!replaying() && !demo()) bump('r'); });
  BUS.on('ko', e => { if (e && human(e.winner)) bump('ko'); });
  BUS.on('special', e => { if (e && human(e.fighter)) bump('sp'); });
  BUS.on('super', e => { if (e && human(e.fighter)) bump('su'); });
  BUS.on('finisher', e => { if (e && human(e.winner)) bump('fi'); });
  BUS.on('match:end', e => {
    const w = rosterId(e && e.winner), l = rosterId(e && e.loser);
    bump('m'); if (w) S.f[w].w = Math.min(CAP, S.f[w].w + 1); if (l) S.f[l].l = Math.min(CAP, S.f[l].l + 1);
  });
  BUS.on('phase', e => { if (dirty && e && (e.from === 'over' || e.to === 'title' || e.to === 'pause' || e.to === 'select')) flush(); });

  function view() {   // what the STATS tab shows: our record, raised to whatever the arcade record holds when that is higher (both count the same matches, so nothing is added twice)
    const a = window.ARCADE && typeof ARCADE.stats === 'function' ? ARCADE.stats() : null;
    const o = { m: S.m, r: S.r, ko: S.ko, sp: S.sp, su: S.su, fi: S.fi, combo: S.combo, comboBy: S.comboBy, f: {}, ar: S.ar, arcade: null };
    for (const r of ROSTER) { const x = S.f[r.id]; o.f[r.id] = { w: x.w, l: x.l, c: x.c }; }
    if (a && typeof a === 'object') {
      o.m = Math.max(o.m, num(a.matches));
      if (num(a.combo) > o.combo) { o.combo = num(a.combo); o.comboBy = ''; }
      for (const r of ROSTER) { const x = a.f && a.f[r.id]; if (x) { o.f[r.id].w = Math.max(o.f[r.id].w, num(x.w)); o.f[r.id].l = Math.max(o.f[r.id].l, num(x.l)); } }
      const bs = a.badges && typeof a.badges === 'object' ? Object.keys(a.badges) : [];
      o.arcade = { badges: bs.filter(k => a.badges[k]).length, badgeMax: bs.length, clears: a.clears ? Object.keys(a.clears).reduce((n, k) => n + num(a.clears[k]), 0) : 0, surv: a.surv ? num(a.surv.score) : 0 };
    }
    return o;
  }

  // ---------------------------------------------------------------- screen state
  const V = { open: false, tab: 0, st: 0, fi: 0, an: 0, t0: 0, flip: 0, cws: {}, ai: 0, cf: 0, cc: 0, keep: 0, hit: [] };
  const snd = (...a) => { try { beep(...a); } catch (e) { /* audio is optional */ } };
  const wrap = (n, i, d) => ((i + d) % n + n) % n;
  let budget = 1;   // new recoloured sheets made per frame: the first look at a colourway is spread over a few frames

  function open() {
    V.open = true; V.tab = 0; V.st = 0; V.t0 = 0; V.an = 0; V.flip = 0; V.keep = game.titleSel | 0;
    V.fi = game.sel && game.sel[0] >= 0 && game.sel[0] < ROSTER.length ? game.sel[0] | 0 : 0; V.cf = V.fi; V.cc = 0;
    V.ai = game.arenaPick >= 0 ? game.arenaPick % ARENAS.length : 0;
    snd(700, 0.08);
  }
  function close() { V.open = false; V.hit.length = 0; game.titleSel = V.keep; snd(300, 0.06); }
  const setTab = i => { const t = wrap(TABS.length, i, 0); if (t !== V.tab) { V.tab = t; snd(520, 0.04); } };
  const setFighter = i => { V.fi = wrap(ROSTER.length, i, 0); V.t0 = V.st; snd(500, 0.04); };
  const setAnim = i => { V.an = wrap(ANIMS.length, i, 0); V.t0 = V.st; snd(400, 0.04); };
  const setArena = i => { V.ai = wrap(ARENAS.length, i, 0); snd(500, 0.04); };

  // ---------------------------------------------------------------- colourways (optional: palettes.js)
  const CLASSIC = [{ name: 'CLASSIC', star: false, locked: false }];
  function ways(id) {
    try { if (window.PALETTES && PALETTES.ready && PALETTES.count(id) > 0) return PALETTES.ways(id); } catch (e) { /* palettes are optional */ }
    return CLASSIC;
  }
  const cwIndex = id => { const i = V.cws[id] | 0, w = ways(id); return w[i] && !w[i].locked ? i : 0; };
  function cycleWay(id) {
    const w = ways(id), i = cwIndex(id);
    for (let k = 1; k <= w.length; k++) { const j = (i + k) % w.length; if (!w[j].locked) { V.cws[id] = j; break; } }
    snd(650, 0.05);
  }
  const warm = {};
  function sheetOf(id, idx) {   // the sheet of a colourway, or null while it waits for its turn this frame
    if (!idx || !window.PALETTES || !PALETTES.ready) return SHEETS[id];
    const k = id + ':' + idx;
    if (!warm[k]) { if (budget <= 0) return null; budget--; }
    let e = null; try { e = PALETTES.entry(id, idx); } catch (err) { e = null; }
    warm[k] = 1;
    return e && e.sheet ? e.sheet : SHEETS[id];
  }

  // ---------------------------------------------------------------- input
  const KEY = { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'], ok: ['Enter', 'Space', 'KeyJ', 'KeyZ', 'KeyC'],
    back: ['Escape', 'Backspace', 'KeyK', 'KeyX'], tp: ['KeyQ', 'PageUp'], tn: ['KeyE', 'PageDown', 'Tab'], flip: ['KeyF'] };
  function readKeys() {
    const k = {};
    for (const n in KEY) { let on = false; for (const c of KEY[n]) if (tap(c)) on = true; k[n] = on; }
    k.tab = -1; for (let i = 0; i < TABS.length; i++) if (tap('Digit' + (i + 1))) k.tab = i;
    return k;
  }
  function nav(k) {
    const dx = (k.r ? 1 : 0) - (k.l ? 1 : 0), dy = (k.d ? 1 : 0) - (k.u ? 1 : 0);
    if (V.tab === 0) {
      if (dx) setFighter(V.fi + dx);
      if (dy) setAnim(V.an + dy);
      if (k.ok) cycleWay(ROSTER[V.fi].id);
      if (k.flip) { V.flip ^= 1; snd(450, 0.03); }
    } else if (V.tab === 1) {
      if (dx || dy) setArena(V.ai + (dx || dy));
    } else if (V.tab === 2) {
      if (dy) { V.cf = wrap(ROSTER.length, V.cf, dy); V.cc = Math.min(V.cc, ways(ROSTER[V.cf].id).length - 1); snd(500, 0.04); }
      if (dx) { V.cc = wrap(ways(ROSTER[V.cf].id).length, V.cc, dx); snd(500, 0.04); }
    }
  }
  HOOKS.add('update', g => {
    if (!V.open) { if (g.phase === 'title' && !(typeof titleOverlayOpen === 'function' && titleOverlayOpen()) && tap('KeyV')) { open(); clearPressed(); } return; }   // V on the title opens it too: a crowded title menu can push the entry off the screen
    if (g.phase !== 'title') { V.open = false; V.hit.length = 0; return; }   // something else took the game over
    V.st++;
    const k = readKeys();
    if (k.back) close();
    else {
      if (k.tab >= 0) setTab(k.tab);
      if (k.tp) setTab(V.tab - 1);
      if (k.tn) setTab(V.tab + 1);
      nav(k);
    }
    clearPressed();   // the engine title menu must not see what we used
  });
  function press(x, y) {   // a tap or click on the canvas: the last rectangle drawn that holds the point wins
    for (let i = V.hit.length - 1; i >= 0; i--) { const h = V.hit[i]; if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) { h.fn(); return true; } }
    return false;
  }
  addEventListener('pointerdown', e => {
    if (!V.open || e.target !== cv) return;
    clearPressed();   // options.js runs first and may have pressed Enter for a title entry under the pointer
    e.preventDefault(); e.stopImmediatePropagation(); if (e.pointerType !== 'mouse' && typeof touch === 'object') touch.on = true;
    const r = cv.getBoundingClientRect(); press((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
  }, true);
  HOOKS.add('titleItems', () => ({ id: 'vault', label: 'EXTRAS', order: 850, run() { open(); clearPressed(); } }));

  // ---------------------------------------------------------------- drawing helpers
  const T = (c, s, x, y, size, col, align) => ptext(c, s, x, y, size, col || C.white, align || 'left');
  const hit = (id, x, y, w, h, fn) => V.hit.push({ id, x, y, w, h, fn });
  function wrapText(s, max) {
    const out = []; let line = '';
    for (const w of String(s).split(' ')) { if (line && (line + ' ' + w).length > max) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) out.push(line);
    return out;
  }
  function backdrop(c) {
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    const t = V.st; c.strokeStyle = 'rgba(110,90,200,0.16)'; c.lineWidth = 1;
    c.beginPath(); for (let x = -(t % 48); x < W; x += 48) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
    for (let y = -((t >> 1) % 48); y < H; y += 48) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); } c.stroke();
    const g = c.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 620); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function panel(c, x, y, w, h, edge, fill) {
    c.fillStyle = fill || C.panel; c.fillRect(x, y, w, h); c.strokeStyle = edge || C.edge; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function bar(c, x, y, w, frac, col) {
    c.fillStyle = C.ink; c.fillRect(x, y, w, 10); c.fillStyle = col;
    c.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * Math.min(1, Math.max(0, frac)))), 8);
  }
  function blit(c, sh, anim, f, x, y, s, flip, trim) {   // one sprite frame with its feet at (x, y), scaled by whole steps; 'trim' cuts that many source pixels off each side
    if (!sh) return;
    const row = ANIM_ROW[anim], tr = trim | 0, sw = FW - 2 * tr;
    c.save(); c.imageSmoothingEnabled = false; c.translate(x, y); if (flip) c.scale(-1, 1);
    c.drawImage(sh, f * FW + tr, row * FH, sw, FH, -sw / 2 * s, -(FEET + 1) * s, sw * s, FH * s); c.restore();
  }
  function drawTabs(c) {
    const w = 150, gap = 8, x0 = (W - (TABS.length * w + (TABS.length - 1) * gap)) / 2;
    TABS.forEach((n, i) => {
      const x = x0 + i * (w + gap), on = i === V.tab;
      panel(c, x, 76, w, 30, on ? C.gold : C.edge, on ? '#2a2108' : '#12102a');
      T(c, n, x + w / 2, 84, 2, on ? C.gold : C.dim, 'center');
      hit('tab:' + i, x, 76, w, 30, () => setTab(i));
    });
    T(c, 'Q', x0 - 24, 84, 2, C.dim, 'center'); T(c, 'E', x0 + TABS.length * (w + gap) - gap + 24, 84, 2, C.dim, 'center');
  }

  // ---------------------------------------------------------------- tab 1: fighters
  const SPAN = { spd: [2.8, 3.9], pow: [0.8, 1.1], hp: [85, 105] };
  const span = (k, v) => (v - SPAN[k][0]) / (SPAN[k][1] - SPAN[k][0]);
  function drawFighters(c) {
    const r = ROSTER[V.fi], id = r.id, w = ways(id), ci = cwIndex(id), a = ANIMS[V.an], gy = 470, cx = 330;
    panel(c, 40, 116, 580, 384, r.col, '#100e22');
    const g = c.createRadialGradient(cx, 400, 10, cx, 400, 260); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(42, 118, 576, 380);
    c.globalAlpha = 0.18; c.fillStyle = r.col; c.fillRect(42, gy + 4, 576, 28); c.globalAlpha = 1;   // the floor
    c.fillStyle = r.col; c.fillRect(42, gy + 3, 576, 2);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(cx, gy + 4, 92, 11, 0, 0, Math.PI * 2); c.fill();
    const fr = loopFrame(a.n, V.st - V.t0), sh = sheetOf(id, ci);
    blit(c, sh || SHEETS[id], a.n, fr, cx, gy, 3, V.flip, 0);
    T(c, a.n + '  ' + (fr + 1) + '/' + a.f, cx, 480, 2, C.dim, 'center');
    T(c, '<', 72, 300, 5, C.gold, 'center'); T(c, '>', 588, 300, 5, C.gold, 'center');
    hit('fighter:-1', 44, 200, 64, 200, () => setFighter(V.fi - 1)); hit('fighter:1', 552, 200, 64, 200, () => setFighter(V.fi + 1));
    hit('flip', 150, 150, 360, 330, () => { V.flip ^= 1; snd(450, 0.03); });
    T(c, (V.fi + 1) + '/' + ROSTER.length, 56, 128, 2, C.dim);
    panel(c, 640, 116, 280, 384);
    T(c, SHORT(r), 656, 128, 3, r.col); T(c, r.tag, 656, 158, 2, C.dim);
    wrapText(r.bio, 21).slice(0, 3).forEach((ln, i) => T(c, ln, 656, 182 + i * 16, 2, C.white));
    [['SPEED', 'spd', r.spd, r.spd.toFixed(1), C.cyan], ['POWER', 'pow', r.pow, r.pow.toFixed(2), C.red], ['HEALTH', 'hp', r.hp, String(r.hp), C.green]].forEach((q, i) => {
      const y = 238 + i * 20; T(c, q[0], 656, y, 2, C.dim); bar(c, 752, y + 2, 100, span(q[1], q[2]), q[4]); T(c, q[3], 904, y, 2, C.white, 'right');
    });
    T(c, 'ANIMATION', 656, 304, 2, C.gold);
    ANIMS.forEach((q, i) => {
      const col = i < 6 ? 0 : 1, row = i < 6 ? i : i - 6, x = 656 + col * 128, y = 326 + row * 19, on = i === V.an;
      if (on) { c.fillStyle = 'rgba(255,210,63,0.16)'; c.fillRect(x - 6, y - 3, 122, 19); }
      T(c, (on ? '>' : ' ') + q.n, x, y, 2, on ? C.gold : C.white);
      hit('anim:' + i, x - 6, y - 3, 122, 19, () => setAnim(i));
    });
    const cw = w[ci] || CLASSIC[0];
    T(c, 'COLOURWAY ' + cw.name, 656, 446, 2, C.gold);
    w.forEach((q, i) => {
      const x = 656 + i * 42, on = i === ci;
      panel(c, x, 466, 36, 26, on ? C.gold : q.locked ? '#2a2550' : C.edge, on ? '#2a2108' : '#12102a');
      T(c, q.locked ? '?' : String(i + 1), x + 18, 472, 2, q.locked ? '#4a4478' : on ? C.gold : C.white, 'center');
      hit('way:' + i, x, 466, 36, 26, () => { if (!q.locked) { V.cws[id] = i; snd(650, 0.05); } });
    });
  }

  // ---------------------------------------------------------------- tab 2: arenas
  function drawArenas(c) {
    const n = ARENAS.length, a = ARENAS[V.ai], plays = S.ar[a.id] | 0;
    panel(c, 40, 116, 564, 319, a.accent || C.edge, C.ink);
    a.thumb(c, 42, 118, 560, 315, V.st);
    hit('arena:next', 42, 118, 560, 315, () => setArena(V.ai + 1));
    T(c, a.name, 40, 446, 3, a.accent || C.white); T(c, a.tagline || '', 40, 476, 2, C.dim);
    T(c, 'PLAYED ' + plays, 604, 450, 2, plays ? C.gold : C.dim, 'right'); T(c, (V.ai + 1) + '/' + n, 604, 476, 2, C.dim, 'right');
    panel(c, 620, 116, 300, 384);
    const off = Math.max(0, Math.min(n - LIST_ROWS, V.ai - (LIST_ROWS >> 1)));
    for (let k = 0; k < LIST_ROWS && off + k < n; k++) {
      const i = off + k, q = ARENAS[i], y = 124 + k * 23, on = i === V.ai;
      if (on) { c.fillStyle = 'rgba(255,210,63,0.16)'; c.fillRect(626, y - 3, 288, 22); }
      c.fillStyle = q.accent || C.edge; c.fillRect(634, y + 1, 8, 10);
      T(c, q.name, 650, y, 2, on ? C.gold : C.white);
      hit('arena:' + i, 626, y - 3, 288, 22, () => setArena(i));
    }
    c.fillStyle = C.dim;   // a small arrow when the list goes on above or below
    if (off > 0) { c.beginPath(); c.moveTo(900, 118); c.lineTo(906, 126); c.lineTo(894, 126); c.fill(); }
    if (off + LIST_ROWS < n) { c.beginPath(); c.moveTo(900, 496); c.lineTo(906, 488); c.lineTo(894, 488); c.fill(); }
  }

  // ---------------------------------------------------------------- tab 3: colourways
  function drawWays(c) {
    ROSTER.forEach((r, i) => {
      const x = 40 + i * 176, on = i === V.cf, w = ways(r.id), open = w.filter(q => !q.locked).length;
      panel(c, x, 116, 170, 48, on ? C.gold : C.edge, on ? '#2a2108' : '#12102a');
      drawHeadIcon(c, r.id, x + 7, 122, 36);
      T(c, SHORT(r), x + 50, 126, 2, on ? r.col : C.dim); T(c, open + '/' + w.length + ' OPEN', x + 50, 146, 2, C.dim);
      hit('fighter:' + i, x, 116, 170, 48, () => { V.cf = i; V.cc = Math.min(V.cc, w.length - 1); snd(500, 0.04); });
    });
    const r = ROSTER[V.cf], w = ways(r.id);
    w.forEach((q, i) => {
      const x = 40 + i * 176, y = 176, on = i === V.cc, mx = x + 85;
      panel(c, x, y, 170, 322, on ? C.gold : q.locked ? '#2a2550' : C.edge, q.locked ? '#0f0d1e' : '#100e22');
      if (q.locked) T(c, '?', mx, 290, 10, '#4a4478', 'center');
      else {
        c.save(); c.beginPath(); c.rect(x + 2, y + 2, 166, 318); c.clip();
        const sh = sheetOf(r.id, i);
        if (sh) blit(c, sh, 'idle', loopFrame('idle', V.st), mx, y + 240, 2, false, 8); else T(c, '...', mx, 290, 3, C.dim, 'center');
        c.restore();
      }
      T(c, q.locked ? '???' : q.name, mx, y + 246, 2, on ? C.gold : C.white, 'center');
      T(c, q.locked ? 'LOCKED' : q.star ? 'STAR' : 'OPEN', mx, y + 266, 2, q.locked ? C.red : q.star ? C.gold : C.green, 'center');
      if (q.locked) wrapText('WIN A MATCH AS ' + SHORT(r), 13).slice(0, 2).forEach((ln, k) => T(c, ln, mx, y + 286 + k * 16, 2, C.dim, 'center'));
      hit('way:' + i, x, y, 170, 322, () => { V.cc = i; snd(500, 0.04); });
    });
  }

  // ---------------------------------------------------------------- tab 4: stats
  function drawStats(c) {
    const v = view(), rows = [['MATCHES', v.m], ['ROUNDS', v.r], ['KOS', v.ko], ['SPECIALS', v.sp], ['SUPERS', v.su], ['FINISHERS', v.fi],
      ['LONGEST COMBO', v.combo + (v.comboBy ? ' ' + SHORT(ROSTER.find(r => r.id === v.comboBy)) : '')]];
    if (v.arcade) rows.push(['BADGES', v.arcade.badges + '/' + v.arcade.badgeMax], ['LADDER CLEARS', v.arcade.clears], ['BEST SURVIVAL', v.arcade.surv]);
    panel(c, 40, 116, 480, 240);
    T(c, 'FIGHTER', 96, 126, 2, C.gold); T(c, 'WINS', 300, 126, 2, C.gold, 'right'); T(c, 'LOSS', 362, 126, 2, C.gold, 'right'); T(c, 'WIN%', 430, 126, 2, C.gold, 'right'); T(c, 'COMBO', 504, 126, 2, C.gold, 'right');
    ROSTER.forEach((r, i) => {
      const y = 156 + i * 38, s = v.f[r.id], n = s.w + s.l;
      drawHeadIcon(c, r.id, 52, y - 10, 34);
      T(c, SHORT(r), 96, y, 2, r.col); T(c, s.w, 300, y, 2, C.white, 'right'); T(c, s.l, 362, y, 2, C.white, 'right');
      T(c, n ? Math.round(100 * s.w / n) + '%' : '--', 430, y, 2, C.white, 'right'); T(c, s.c, 504, y, 2, C.white, 'right');
    });
    panel(c, 540, 116, 380, 240);
    rows.forEach((q, i) => { const y = 128 + i * 21; T(c, q[0], 556, y, 2, C.gold); T(c, q[1], 904, y, 2, C.white, 'right'); });
    panel(c, 40, 366, 880, 134);
    T(c, 'MOST PLAYED ARENAS', 56, 376, 2, C.gold);
    const top = Object.keys(v.ar).filter(k => v.ar[k] > 0).sort((p, q) => v.ar[q] - v.ar[p]).slice(0, 5);
    if (!top.length) T(c, 'PLAY A MATCH AND THE ARENAS SHOW UP HERE', W / 2, 440, 2, C.dim, 'center');
    top.forEach((k, i) => {
      const y = 400 + i * 19, ar = ARENAS.find(q => q.id === k);
      T(c, ar ? ar.name : k.toUpperCase(), 56, y, 2, C.white); bar(c, 400, y + 2, 440, v.ar[k] / v.ar[top[0]], ar && ar.accent || C.cyan); T(c, v.ar[k], 904, y, 2, C.white, 'right');
    });
  }

  HOOKS.add('drawTop', c => {
    if (!V.open) return;
    budget = 1; V.hit.length = 0;
    backdrop(c);
    drawTitleText(c, 'EXTRAS', W / 2, 40, 40, { align: 'center', style: 'gold', glow: true });
    panel(c, 20, 20, 112, 34, C.edge, '#12102a'); T(c, '< BACK', 76, 29, 2, C.white, 'center'); hit('back', 20, 20, 112, 34, close);
    drawTabs(c);
    [drawFighters, drawArenas, drawWays, drawStats][V.tab](c);
    const touchy = typeof touch === 'object' && touch.on;
    T(c, touchy ? 'TAP A TAB, A FIGHTER OR AN ARENA' : V.tab === 0 ? 'ARROWS: BROWSE  ENTER: COLOURWAY  F: FLIP  Q E: TAB  ESC: BACK' : 'ARROWS: BROWSE  Q E OR 1-4: TAB  ESC: BACK', W / 2, 514, 2, C.dim, 'center');
  });

  // ---------------------------------------------------------------- the pieces the tests (and curious people with a console) use
  window.VAULT = {
    TABS, state: V, open, close, setTab, view, flush, ways, stats: () => S,
    isOpen: () => V.open, click: (x, y) => V.open && press(x, y), hits: () => V.hit.map(h => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h })),
    anims: () => ANIMS.map(a => a.n),
    reset() { SETTINGS.reset(KEEP); S = blank(); dirty = false; last = JSON.stringify(S); },
  };
})();
