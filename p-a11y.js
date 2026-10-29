// ===== AGENT BRAWL feature file: A11Y (accessibility). =====
// Owner: a11y agent (branch feat/p-a11y).
// Area: colour-blind filters (protan, deutan, tritan) composited onto the finished frame, a high-contrast HUD, larger UI text, reduced motion
//       (no shake, no flashes, no slow motion; the vfx effects follow it), an aria-live region that tells screen readers about rounds, winners and
//       menus, and simple specials (L, L + LEFT or RIGHT, L + DOWN, whichever way the fighter faces). Every option is a SETTINGS row and the
//       ACCESSIBILITY screen (title entry, or Y on the title and pause screens) edits them.
// Hooks used: 'update' (reduced motion, the screen's keys, menu announcements), 'input' (simple specials, humans only), 'drawTop' (the high-contrast
//             HUD, the ACCESSIBILITY screen, then the colour filter over everything), 'titleItems', 'pauseItems'.
// BUS used: settings, phase, match:start, round:start, round:end, match:end.
// Settings: a11y.cb, a11y.contrast, a11y.bigText, a11y.motion, a11y.live, a11y.simpleSp.
// Engine touch points that are not hooks (nothing in game.js is edited): window.uiText and window.ptext are wrapped (larger text), window.drawWorld and
//   window.drawPost are wrapped (no shake, no flash), window.moveRows is wrapped (the move list shows LEFT / RIGHT when simple specials are on), and
//   SETTINGS.get answers the 'reducedFlash' alias that vfx.js reads with true while reduced motion is on (no other key is touched).
// Public: window.A11Y (open, close, rows, announce, matrix, mix, applyFilter, text, state) for tests and other feature files.
'use strict';
(() => {
  window.STUB_A11Y = 1;   // marker: the feature tests check that this file loaded. Keep the line.

  const mq = q => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch (e) { return false; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CB = ['off', 'protan', 'deutan', 'tritan'];
  SETTINGS.define('a11y.cb', { def: 'off', values: CB, label: 'COLOR FILTER' });
  SETTINGS.define('a11y.contrast', { def: mq('(prefers-contrast: more)'), label: 'HIGH CONTRAST HUD' });
  SETTINGS.define('a11y.bigText', { def: false, label: 'LARGER TEXT' });
  SETTINGS.define('a11y.motion', { def: mq('(prefers-reduced-motion: reduce)'), label: 'REDUCED MOTION' });
  SETTINGS.define('a11y.live', { def: true, label: 'SCREEN READER' });
  SETTINGS.define('a11y.simpleSp', { def: false, label: 'SIMPLE SPECIALS' });

  // the settings, cached: the per-tick hooks read these fields, never SETTINGS itself
  const S = { cb: 'off', contrast: false, big: false, motion: false, live: true, simple: false };
  const stats = { filtered: 0, slowCut: 0, postFlash: 0, said: 0, last: '', log: [] };
  function sync() {
    S.cb = SETTINGS.get('a11y.cb'); S.contrast = SETTINGS.get('a11y.contrast'); S.big = SETTINGS.get('a11y.bigText');
    S.motion = SETTINGS.get('a11y.motion'); S.live = SETTINGS.get('a11y.live'); S.simple = SETTINGS.get('a11y.simpleSp');
  }
  sync();

  // ---------- colour-blind filters: one 3x3 matrix per deficiency, applied to the whole frame through an SVG feColorMatrix ----------
  // Daltonisation: simulate what the viewer sees (the Machado, Oliveira and Fernandes 2009 dichromat matrices, full severity), take the difference
  // from the real colour, and move that lost difference into channels the viewer still separates (red-green loss into green and blue, blue-yellow
  // loss into red and green). Simulation, difference and shift are all linear, so each mode folds into a single matrix. Rows of every simulation sum
  // to 1, so greys and white pass through unchanged.
  const SIM = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  };
  const SHIFT = { protan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]], deutan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]], tritan: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]] };
  const ID3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (a, b) => a.map(r => [0, 1, 2].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
  const MAT = {};
  for (const k in SIM) {
    const err = ID3.map((r, i) => r.map((v, j) => v - SIM[k][i][j])), fix = mul(SHIFT[k], err);
    MAT[k] = ID3.map((r, i) => r.map((v, j) => +(v + fix[i][j]).toFixed(5)));
  }
  const mix = (mode, rgb) => { const m = MAT[mode]; if (!m) return rgb.slice(0, 3); return m.map(r => clamp(Math.round(r[0] * rgb[0] + r[1] * rgb[1] + r[2] * rgb[2]), 0, 255)); };

  const NS = 'http://www.w3.org/2000/svg';
  function addFilters() {
    if (!document.body || document.getElementById('a11y-filters')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'a11y-filters'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    for (const k in MAT) {
      const f = document.createElementNS(NS, 'filter'), cm = document.createElementNS(NS, 'feColorMatrix'), m = MAT[k];
      f.id = 'a11y-cb-' + k; f.setAttribute('color-interpolation-filters', 'sRGB');
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', [m[0].concat(0, 0), m[1].concat(0, 0), m[2].concat(0, 0), [0, 0, 0, 1, 0]].map(r => r.join(' ')).join('  '));
      f.appendChild(cm); svg.appendChild(f);
    }
    document.body.appendChild(svg);
  }
  addFilters();
  const CAN_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return !!c && 'filter' in c; } catch (e) { return false; } })();
  let buf = null;
  function applyFilter(c, mode) {
    mode = mode || S.cb;
    if (!MAT[mode] || !c || !CAN_FILTER) return false;
    const cvs = c.canvas, w = cvs.width, h = cvs.height;
    if (!buf) buf = document.createElement('canvas');
    if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
    const b = buf.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'copy'; b.drawImage(cvs, 0, 0);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'copy'; c.filter = 'url(#a11y-cb-' + mode + ')';
    c.drawImage(buf, 0, 0); c.restore();
    stats.filtered++;
    return true;
  }
  // a browser without canvas filters still gets the same matrix, as a CSS filter on the canvas element
  function cssFallback() { if (!CAN_FILTER && typeof cv !== 'undefined' && cv.style) cv.style.filter = MAT[S.cb] ? 'url(#a11y-cb-' + S.cb + ')' : ''; }
  cssFallback();

  // ---------- larger text: small UI text grows by a quarter, never past the edge of the screen and never below its own size ----------
  const FONT = 'px Impact, Haettenschweiler, "Arial Narrow", sans-serif';
  const room = (x, align) => align === 'left' ? W - 8 - x : align === 'right' ? x - 8 : 2 * Math.min(x - 8, W - 8 - x);
  const uiText1 = window.uiText;
  if (typeof uiText1 === 'function') window.uiText = function (s, x, y, size, col, align, alpha) {
    if (S.big && typeof size === 'number' && size > 0 && size <= 28 && typeof s === 'string' && typeof x === 'number') {
      let z = size * 1.25;
      try { ctx.save(); ctx.font = z + FONT; const w = ctx.measureText(s).width, r = room(x, align || 'center'); ctx.restore(); if (w > r) z = Math.max(size, z * r / w); } catch (e) { /* measuring is optional */ }
      size = z;
    }
    return uiText1.call(this, s, x, y, size, col, align, alpha);
  };
  const ptext1 = window.ptext;
  if (typeof ptext1 === 'function') window.ptext = function (c, str, x, y, size, col, align, shadow) {
    if (S.big && (size === 2 || size === 3) && typeof x === 'number') {
      const z = size + 1, w = (String(str).length * 6 - 1) * z;
      if (w <= room(x, align || 'left')) size = z;
    }
    return ptext1.call(this, c, str, x, y, size, col, align, shadow);
  };

  // ---------- reduced motion: no shake, no flash, no slow motion ----------
  const drawWorld1 = window.drawWorld;
  if (typeof drawWorld1 === 'function') window.drawWorld = function () { if (S.motion && game.shake) game.shake = 0; return drawWorld1.apply(this, arguments); };
  const drawPost1 = window.drawPost;
  if (typeof drawPost1 === 'function') window.drawPost = function (c, tick, opts) {
    if (S.motion && opts && opts.flash) opts.flash = 0;
    stats.postFlash = opts && typeof opts.flash === 'number' ? opts.flash : 0;
    return drawPost1.apply(this, arguments);
  };
  // vfx.js turns its flashes into a soft tint when 'reducedFlash' reads true; no file defines that key, so this alias cannot change anybody's stored value
  const get1 = SETTINGS.get;
  SETTINGS.get = function (key) { if (key === 'reducedFlash' && S.motion) return true; return get1.apply(this, arguments); };
  function calm(g) { if (g.shake) g.shake = 0; if (g.flash) g.flash = 0; if (g.slow) g.slow = 0; }
  // vfx.js plays the KO at quarter speed by setting a 1-tick hit-stop on three ticks of four (its update hook, order 50): undone right after it
  let hsBefore = 0;
  HOOKS.add('update', g => { hsBefore = g.hitstop; }, 49);
  HOOKS.add('update', g => {
    if (S.motion && hsBefore <= 0 && g.hitstop === 1 && (g.phase === 'ko' || g.phase === 'finish')) { g.hitstop = 0; stats.slowCut++; }
  }, 51);

  // ---------- screen reader: a polite live region; messages of one tick are joined and sent together ----------
  let live = null;
  function liveEl() {
    if (live || !document.body) return live;
    live = document.createElement('div');
    live.id = 'a11y-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    live.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;pointer-events:none';
    document.body.appendChild(live);
    return live;
  }
  liveEl();
  if (typeof cv !== 'undefined' && cv.setAttribute && !cv.hasAttribute('aria-label')) cv.setAttribute('aria-label', 'Agent Brawl game screen');
  const queue = [];
  function say(msg) { if (S.live && msg) queue.push(String(msg)); }
  function flush() {
    if (!queue.length) return;
    const el = liveEl(), msg = queue.join(' '); queue.length = 0;
    if (!el || !S.live) return;
    el.textContent = msg === stats.last ? msg + ' ' : msg;   // the same words twice still count as a change
    stats.last = msg; stats.said++; stats.log.push(msg); if (stats.log.length > 40) stats.log.shift();
  }
  // words for the ear: names and labels in capitals become Title Case, short ones (CPU, VS, KO) stay as they are
  const speak = s => String(s || '').split(' ').map(w => w.length > 3 ? w.charAt(0) + w.slice(1).toLowerCase() : w).join(' ');
  const nameOf = f => { if (typeof f === 'number') f = game.f && game.f[f]; return f && f.d && f.d.name ? speak(f.d.name) : 'Nobody'; };
  const PAUSE_ROWS = ['Resume', 'Moves', 'Options', 'Controls', 'Quit to title'];
  const seen = { title: -1, sel: [-1, -1], ready: [false, false], psel: -1, oscreen: null, osel: -1 };
  function forget() { seen.title = -1; seen.sel = [-1, -1]; seen.ready = [false, false]; seen.psel = -1; seen.oscreen = null; seen.osel = -1; }
  function watchMenus(g) {
    if (!S.live || ui.open) return;
    const ph = g.phase;
    if (ph === 'title') {
      if (g.titleSel !== seen.title) {
        seen.title = g.titleSel;
        const items = titleItems(), it = items[g.titleSel];
        if (it) say(speak(it.label) + ', ' + (g.titleSel + 1) + ' of ' + items.length + '.');
      }
    } else if (ph === 'select' && g.sel && g.ready) {
      for (let s = 0; s < 2; s++) {
        const who = s === 1 && g.mode === 1 ? 'CPU' : 'Player ' + (s + 1);
        if (g.sel[s] !== seen.sel[s]) { seen.sel[s] = g.sel[s]; const d = typeof ROSTER !== 'undefined' && ROSTER[g.sel[s]]; if (d) say(who + ': ' + speak(d.name) + '.'); }
        if (!!g.ready[s] !== seen.ready[s]) { seen.ready[s] = !!g.ready[s]; if (seen.ready[s]) say(who + ' ready.'); }
      }
    } else if (ph === 'pause') {
      const o = window.OPTIONS && OPTIONS.state;
      if (!o) return;
      if (o.screen !== seen.oscreen) { seen.oscreen = o.screen; seen.psel = -1; seen.osel = -1; if (o.screen) say(speak(String(o.screen)) + ' screen. Escape goes back.'); }
      if (!o.screen && o.psel !== seen.psel) { seen.psel = o.psel; if (PAUSE_ROWS[o.psel]) say(PAUSE_ROWS[o.psel] + '.'); }
      if (o.screen === 'options' && o.osel !== seen.osel && typeof OPTIONS.rows === 'function') { seen.osel = o.osel; const r = OPTIONS.rows()[o.osel]; if (r) say(speak(r) + '.'); }
    }
  }
  BUS.on('phase', e => {
    forget();
    if (!e) return;
    const to = e.to;
    if (to === 'title') say('Title menu. Up and down choose, Enter starts, Y opens accessibility.');
    else if (to === 'select') say('Choose your fighter. Left and right move, punch confirms, kick goes back.');
    else if (to === 'vs' && game.f && game.f[0] && game.f[1]) say(nameOf(game.f[0]) + ' versus ' + nameOf(game.f[1]) + '.');
    else if (to === 'fight') say(e.from === 'pause' ? 'Resumed.' : 'Fight!');
    else if (to === 'pause') say('Paused. Up and down choose, Enter selects, P resumes, Y opens accessibility.');
    else if (to === 'finish') say('Finish it! Super for the finisher, or any hit.');
    else if (to === 'over') say('Match over. Enter: character select. R: rematch. Escape: title.');
  });
  BUS.on('round:start', e => { if (e) say(e.sudden ? 'Sudden death, round ' + e.round + '.' : 'Round ' + e.round + '.'); });
  BUS.on('round:end', e => {
    if (!e) return;
    const score = Array.isArray(e.wins) ? ' Rounds: ' + nameOf(0) + ' ' + e.wins[0] + ', ' + nameOf(1) + ' ' + e.wins[1] + '.' : '';
    if (e.reason === 'draw' || e.winner == null) say('Round ' + e.round + ' is a draw.' + score);
    else if (e.reason === 'time') say('Time up. ' + nameOf(e.winner) + ' wins round ' + e.round + '.' + score);
    else say('KO! ' + nameOf(e.winner) + ' wins round ' + e.round + '.' + score);
  });
  BUS.on('match:end', e => {
    if (!e) return;
    const w = typeof e.winner === 'number' ? e.winner : e.winner && e.winner.side, ws = Array.isArray(e.wins) ? e.wins : [0, 0];
    const a = ws[w] | 0, b = ws[1 - w] | 0;
    say(nameOf(e.winner) + ' wins the match, ' + a + ' rounds to ' + b + '.');
  });

  // ---------- simple specials: L alone, L + LEFT or RIGHT, L + DOWN, for human players, whichever way they face ----------
  // A direction released up to LENIENT ticks before L still counts; the choice is kept while the press sits in the engine's special buffer.
  const LENIENT = 6;
  const sp = [{ d: -99, h: -99, latch: -1 }, { d: -99, h: -99, latch: -1 }];
  HOOKS.add('input', (i, side, f) => {
    if (!S.simple || !i || !f || f.cpu || (side !== 0 && side !== 1)) return i;
    const st = sp[side], t = f.t | 0;
    if (i.d) st.d = t;
    if (i.l || i.r) st.h = t;
    if (i.s) {
      st.latch = i.d ? 2 : (i.l || i.r) ? 1 : (t - st.d <= LENIENT || t - st.h <= LENIENT) ? (st.d >= st.h ? 2 : 1) : 0;
    } else if (st.latch >= 0 && f.bufS > 0) {
      if (st.latch === 0) st.latch = i.d ? 2 : (i.l || i.r) ? 1 : 0;   // a direction that arrives while the press waits in the buffer upgrades a neutral press
    } else st.latch = -1;
    if (st.latch >= 0 && i.mv === undefined) i.mv = st.latch;
    return i;
  }, -10);
  BUS.on('match:start', () => { for (const st of sp) { st.d = st.h = -99; st.latch = -1; } });
  const moveRows1 = window.moveRows;
  if (typeof moveRows1 === 'function') window.moveRows = function (id, side, cpu) {
    const rows = moveRows1.apply(this, arguments);
    if (!S.simple || cpu || !Array.isArray(rows)) return rows;
    const M = typeof MOVES !== 'undefined' && MOVES[id], name = M && M.sp && M.sp[1] && M.sp[1].name;
    return rows.map(r => r && r.name === name && typeof r.input === 'string' && r.input.startsWith('FWD + ') ? Object.assign({}, r, { input: 'LEFT / RIGHT + ' + r.input.slice(6) }) : r);
  };

  // ---------- the ACCESSIBILITY screen ----------
  const ROWS = [
    { key: 'a11y.cb', label: 'COLOR FILTER', say: 'Color filter', help: { off: 'NO COLOR CHANGE', protan: 'FOR RED-WEAK VISION', deutan: 'FOR GREEN-WEAK VISION', tritan: 'FOR BLUE-WEAK VISION' } },
    { key: 'a11y.contrast', label: 'HIGH CONTRAST HUD', say: 'High contrast HUD', help: 'SOLID BARS, WHITE OUTLINES, BIG TIMER' },
    { key: 'a11y.bigText', label: 'LARGER TEXT', say: 'Larger text', help: 'MENU AND HINT TEXT GROWS WHERE IT FITS' },
    { key: 'a11y.motion', label: 'REDUCED MOTION', say: 'Reduced motion', help: 'NO SHAKE, NO FLASHES, NO SLOW MOTION' },
    { key: 'a11y.live', label: 'SCREEN READER', say: 'Screen reader announcements', help: 'ANNOUNCES ROUNDS, WINNERS AND MENUS' },
    { key: 'a11y.simpleSp', label: 'SIMPLE SPECIALS', say: 'Simple specials', help: 'L, L + LEFT OR RIGHT, L + DOWN: FACING DOES NOT MATTER' },
    { key: null, label: 'BACK', say: 'Back', help: '' },
  ];
  const ui = { open: false, sel: 0, from: 'title', opened: 0 };
  const valueOf = r => r.key ? SETTINGS.get(r.key) : null;
  const shown = v => v === true ? 'ON' : v === false ? 'OFF' : String(v).toUpperCase();
  const blip = (f, d) => { try { beep(f, d || 0.05); } catch (e) { /* sound is optional */ } };
  function sayRow() { const r = ROWS[ui.sel]; say(r.say + (r.key ? ': ' + speak(shown(valueOf(r))) : '') + '. ' + (ui.sel + 1) + ' of ' + ROWS.length + '.'); }
  function open() {
    if (ui.open || (game.phase !== 'title' && game.phase !== 'pause')) return false;
    ui.open = true; ui.sel = 0; ui.from = game.phase; ui.opened++;
    try { clearPressed(); } catch (e) { /* engine helper */ }
    shield(true); blip(700, 0.08);
    say('Accessibility. Up and down choose, left, right or Enter change, Escape goes back.'); sayRow();
    return true;
  }
  function close() {
    if (!ui.open) return false;
    ui.open = false; shield(false); forget();
    try { clearPressed(); } catch (e) { /* engine helper */ }
    blip(400); say(ui.from === 'pause' ? 'Back to pause.' : 'Back to the title menu.');
    return true;
  }
  function change(dir) {
    const r = ROWS[ui.sel];
    if (!r.key) { close(); return; }
    const v = valueOf(r);
    if (typeof v === 'boolean') SETTINGS.set(r.key, !v);
    else { const n = CB.length, k = CB.indexOf(v); SETTINGS.set(r.key, CB[((k < 0 ? 0 : k) + (dir < 0 ? n - 1 : 1)) % n]); }
    blip(dir < 0 ? 520 : 660); sayRow();
  }
  function move(d) { ui.sel = (ui.sel + d + ROWS.length) % ROWS.length; blip(500, 0.04); sayRow(); }
  const anyTap = (...codes) => { let r = false; for (const c of codes) if (tap(c)) r = true; return r; };
  const both = a => hit(0, a) | hit(1, a);
  function nav() {
    const up = anyTap('KeyW', 'ArrowUp') | both('u'), dn = anyTap('KeyS', 'ArrowDown') | both('d');
    const lf = anyTap('KeyA', 'ArrowLeft') | both('l'), rt = anyTap('KeyD', 'ArrowRight') | both('r');
    const ok = anyTap('Enter', 'NumpadEnter', 'Space') | both('p');
    const back = anyTap('Escape', 'Backspace', 'KeyY') | both('k') | (game.phase === 'pause' && tap('KeyP'));
    if (back) { close(); return; }
    if (up) move(-1); else if (dn) move(1);
    if (lf) change(-1); else if (rt || ok) change(1);
  }
  HOOKS.add('update', g => {
    if (S.motion) calm(g);
    const ph = g.phase;
    if (ui.open) {
      if (ph !== 'title' && ph !== 'pause') { ui.open = false; shield(false); }
      else { nav(); try { clearPressed(); } catch (e) { /* engine helper */ } }
    } else if (ph === 'title' && tap('KeyY')) open();
    watchMenus(g);
  }, -20);
  HOOKS.add('update', flush, 1000);
  // just before OPTIONS (900), which stays the last entry: wrapping up from the first entry still lands on OPTIONS
  HOOKS.add('titleItems', () => ({ id: 'a11y', label: 'ACCESSIBILITY', order: 890, run() { open(); } }));
  HOOKS.add('pauseItems', () => ({ id: 'a11y', key: 'KeyY', label: 'Y ACCESSIBILITY', run() { const o = window.OPTIONS && OPTIONS.state; if (game.phase === 'pause' && !(o && o.screen)) open(); } }));

  // mouse and touch: while the screen is open a transparent layer over the canvas takes the pointer, so the menus underneath never see the tap
  let layer = null;
  const rowY = i => 156 + i * 40;
  function shield(on) {
    if (!document.body) return;
    if (!layer) {
      layer = document.createElement('div'); layer.id = 'a11y-layer';
      layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:40;display:none;background:transparent;touch-action:none';
      layer.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
        pointer((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
      });
      document.body.appendChild(layer);
    }
    layer.style.display = on ? 'block' : 'none';
    if (on) place();
  }
  function place() {
    if (!layer || typeof cv === 'undefined') return;
    const r = cv.getBoundingClientRect(), s = layer.style, px = v => Math.round(v) + 'px';
    if (s.left !== px(r.left) || s.top !== px(r.top) || s.width !== px(r.width) || s.height !== px(r.height)) { s.left = px(r.left); s.top = px(r.top); s.width = px(r.width); s.height = px(r.height); }
  }
  function pointer(x, y) {
    if (!ui.open) return;
    for (let i = 0; i < ROWS.length; i++) if (Math.abs(y - rowY(i)) <= 18 && x > 160 && x < 800) { ui.sel = i; change(1); return; }
    if (x < 150 || x > 810 || y < 60 || y > 484) close();
  }

  const GOLD = '#ffd76a', STEEL = '#d8d2c4', DIM = '#9a937f';
  function fitText(c, s, x, y, size, col, align, maxW) {
    const z = Math.max(1, Math.min(size, Math.floor(maxW / Math.max(1, String(s).length * 6 - 1) * 2) / 2));
    ptext1(c, s, x, y - Math.round(3.5 * z), z, col, align);
  }
  function drawScreen(c) {
    place();
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(0,0,0,0.78)'; c.fillRect(0, 0, W, H);
    const hc = S.contrast;
    c.fillStyle = hc ? '#000' : 'rgba(8,6,12,0.94)'; c.fillRect(150, 60, 660, 424);
    c.strokeStyle = hc ? '#fff' : '#c9a24a'; c.lineWidth = hc ? 3 : 2; c.strokeRect(151, 61, 658, 422);
    if (typeof drawTitleText === 'function') drawTitleText(c, 'ACCESSIBILITY', W / 2, 104, 38, { align: 'center', style: 'steel', glow: true });
    else ptext1(c, 'ACCESSIBILITY', W / 2, 90, 4, '#fff', 'center');
    for (let i = 0; i < ROWS.length; i++) {
      const r = ROWS[i], y = rowY(i), on = i === ui.sel;
      if (on) {
        c.fillStyle = hc ? '#fff' : 'rgba(255,215,106,0.22)'; c.fillRect(170, y - 17, 620, 34);
        if (!hc) { c.strokeStyle = GOLD; c.lineWidth = 2; c.strokeRect(171, y - 16, 618, 32); }
      }
      const col = hc ? (on ? '#000' : '#fff') : on ? GOLD : STEEL;
      if (r.key) {
        ptext1(c, r.label, 190, y - 10, 3, col, 'left', !(hc && on));
        const v = valueOf(r), vs = shown(v), vc = hc ? col : v === false || v === 'off' ? DIM : on ? '#fff' : '#9fe0ff';
        ptext1(c, (on ? '< ' : '') + vs + (on ? ' >' : ''), 770, y - 10, 3, vc, 'right', !(hc && on));
      } else ptext1(c, r.label, W / 2, y - 10, 3, col, 'center', !(hc && on));
    }
    const r = ROWS[ui.sel], help = !r.key ? (ui.from === 'pause' ? 'BACK TO THE PAUSE MENU' : 'BACK TO THE TITLE MENU') : typeof r.help === 'string' ? r.help : r.help[valueOf(r)] || '';
    const big = S.big ? 2.5 : 2;
    fitText(c, help, W / 2, 438, big, hc ? '#fff' : '#ffe9a8', 'center', 630);
    const foot = (typeof touch !== 'undefined' && touch.on) ? 'TAP A ROW TO CHANGE IT - TAP OUTSIDE TO LEAVE' : 'W/S SELECT - A/D OR ENTER CHANGE - ESC BACK';
    fitText(c, foot, W / 2, 468, big, hc ? '#fff' : '#c9a24a', 'center', 630);
    c.restore();
  }
  HOOKS.add('drawTop', (c, g) => { if (ui.open) drawScreen(c); }, 9000);
  HOOKS.add('drawTop', c => { if (S.cb !== 'off') applyFilter(c, S.cb); }, 10000);   // last of all: the filter sees the whole frame, menus included

  // ---------- high-contrast HUD: solid bars on black with white outlines, player colours that differ in brightness, a big timer ----------
  const HC = { p1: '#ffe600', p2: '#00c8ff' };
  function hudBox(c, x, y, w, h) { c.fillStyle = '#000'; c.fillRect(x, y, w, h); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  // drawn in drawTop, after the engine's post effects, so the vignette and the colour grade cannot dim it; the pause menu and a replay keep it hidden
  const HUD_PHASES = new Set(['intro', 'fight', 'ko', 'finish', 'finisher', 'outro']);
  function drawContrast(c, g) {
    if (!S.contrast || !g || !HUD_PHASES.has(g.phase) || !g.f || !g.f[0] || !g.f[1]) return;
    if (window.VFX && typeof VFX.state === 'function') { const v = VFX.state(); if (v && v.replay) return; }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
    for (let s = 0; s < 2; s++) {
      const f = g.f[s], max = (f.d && f.d.hp) || 100, r = clamp((+f.hp || 0) / max, 0, 1), col = s ? HC.p2 : HC.p1;
      // health
      const bw = 352, x0 = s ? W - 72 - bw : 72, y0 = 12, bh = 36, iw = bw - 12, fw = Math.round(iw * r);
      hudBox(c, x0, y0, bw, bh);
      c.fillStyle = col; c.fillRect(s ? x0 + 6 + iw - fw : x0 + 6, y0 + 6, fw, bh - 12);
      c.fillStyle = '#000'; for (let k = 1; k < 4; k++) c.fillRect(x0 + 6 + Math.round(iw * k / 4) - 1, y0 + 6, 2, bh - 12);
      // name tag
      const tag = 'P' + (s + 1) + (f.cpu ? ' CPU' : '') + ' ' + String((f.d && f.d.name) || '').toUpperCase(), tw = (tag.length * 6 - 1) * 2 + 12;
      const tx = s ? W - 72 - tw : 72;
      c.fillStyle = '#000'; c.fillRect(tx, 52, tw, 22);
      ptext1(c, tag, tx + 6, 56, 2, col, 'left', false);
      // super meter
      const m = clamp((+f.meter || 0) / 100, 0, 1), sx = s ? W - 330 : 18, sw = 312, sh = 27, sy = 500;
      hudBox(c, sx, sy, sw, sh);
      c.fillStyle = col; const mw = Math.round((sw - 10) * m); c.fillRect(s ? sx + 5 + (sw - 10) - mw : sx + 5, sy + 5, mw, sh - 10);
      const st = m >= 0.999 ? 'SUPER READY' : 'SUPER ' + Math.floor(m * 100) + '%', stw = (st.length * 6 - 1) * 2 + 12, stx = s ? sx - 6 - stw : sx + sw + 6;
      c.fillStyle = '#000'; c.fillRect(stx, sy + 2, stw, 22);
      ptext1(c, st, stx + 6, sy + 6, 2, m >= 0.999 ? col : '#fff', 'left', false);
    }
    // timer
    const tm = g.timer, ts = typeof tm === 'number' ? String(Math.max(0, Math.round(tm))).padStart(2, '0') : '--', urgent = typeof tm === 'number' && tm <= 10;
    hudBox(c, W / 2 - 38, 6, 76, 64);
    if (urgent) { c.strokeStyle = '#ff4040'; c.lineWidth = 3; c.strokeRect(W / 2 - 33.5, 10.5, 67, 55); }
    ptext1(c, ts, W / 2, 24, 5, '#fff', 'center', false);
    c.restore();
  }
  HOOKS.add('drawTop', drawContrast, 8000);

  BUS.on('settings', e => {
    if (!e || typeof e.key !== 'string' || e.key.indexOf('a11y.') !== 0) return;
    sync();
    if (e.key === 'a11y.cb') cssFallback();
    if (e.key === 'a11y.live') { queue.length = 0; const el = liveEl(); if (el) el.textContent = ''; }
  });

  window.A11Y = {
    keys: ROWS.filter(r => r.key).map(r => r.key),
    open, close, rows: () => ROWS.map(r => r.label),
    announce: msg => { say(msg); flush(); },
    matrix: mode => MAT[mode] ? MAT[mode].map(r => r.slice()) : null,
    mix, applyFilter, canFilter: CAN_FILTER,
    text: () => (liveEl() ? liveEl().textContent : ''),
    state: () => ({ open: ui.open, sel: ui.sel, from: ui.from, opened: ui.opened, settings: Object.assign({}, S), filtered: stats.filtered, slowCut: stats.slowCut, postFlash: stats.postFlash, said: stats.said, last: stats.last, log: stats.log.slice() }),
  };
})();
