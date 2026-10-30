// ===== AGENT BRAWL premium feature: GAMEPAD. Owner: the p-gamepad agent. Loaded last (after vfx.js). Docs: docs/features/p-gamepad.md =====
// Everything here only does something while a gamepad is connected, so without one the game is exactly what it was.
//   - Rumble: vibrationActuator 'dual-rumble' on a human fighter's pad for hits taken (scaled by damage), blocks, knockdowns, throws, supers and the KO. Setting gamepad.rumble.
//   - Button glyphs: when the last thing the player touched was a pad, a strip of glyphs (A / B / Y, shapes, or numbers on a pad with no standard layout) replaces the key hints at the foot of the
//     title, the select screen and the end screen, and the pause screen offers the setup. Follows the player's remapping. Settings gamepad.hints and gamepad.glyphs.
//   - Remapping: the GAMEPAD SETUP screen (title entry, pause key G, or the super button on the pause screen) rebinds the ten pad actions per controller id; saved in SETTINGS gamepad.maps.
//     The engine's pollPads() reads the pad through the 'pad' filter hook, which hands it a virtual pad built from the saved map (no map: the real pad, untouched).
//   - Hot-plug toast: a short note when a pad appears or goes away, and which player it is.
// Hooks used: pad (filter, added to game.js for this), menuHint (run, added to game.js for this), update, drawTop, titleItems, pauseItems. BUS: hit, block, knockdown, throw, super, ko, settings.
// Test API: window.GAMEPAD.
(function () {
  'use strict';
  window.STUB_P_GAMEPAD = 1;   // marker: tools/tests style check that this file loaded

  SETTINGS.define('gamepad.rumble', { def: true, label: 'GAMEPAD RUMBLE' });
  SETTINGS.define('gamepad.hints', { def: true, label: 'GAMEPAD BUTTON HINTS' });
  SETTINGS.define('gamepad.glyphs', { def: 'auto', values: ['auto', 'letters', 'swapped', 'shapes'], label: 'GAMEPAD GLYPHS' });   // auto picks from the controller id
  SETTINGS.define('gamepad.maps', { def: null, label: 'GAMEPAD BUTTONS' });   // null, or { controllerId: { l, r, u, d, p, k, s, x, st, bk: [button indexes] } }; only changed pads are stored

  // ---------- the ten pad actions and the engine's own layout (pollPads in game.js) ----------
  const ACTS = ['l', 'r', 'u', 'd', 'p', 'k', 's', 'x', 'st', 'bk'];
  const NAMES = { l: 'LEFT', r: 'RIGHT', u: 'UP', d: 'DOWN', p: 'PUNCH', k: 'KICK', s: 'SPECIAL', x: 'SUPER', st: 'START', bk: 'BACK' };
  const DEF = { l: [14], r: [15], u: [12], d: [13], p: [0], k: [1], s: [2], x: [3, 5], st: [9], bk: [8] };   // standard layout: d-pad, A B X, Y or RB, start, back
  const ENGINE = { l: 14, r: 15, u: 12, d: 13, p: 0, k: 1, s: 2, x: 3, st: 9, bk: 8 };   // the button numbers pollPads() reads; the virtual pad fills these
  const MAXBTN = 32, MAXMAPS = 6, TOAST_LIFE = 170;

  const P = {
    n: 0, last: 'key', seen: null, toasts: [], src: null, parsed: null,
    open: false, from: '', sel: 0, tab: 0, cap: null, capT: 0, init: false, prev: [], pax: { u: false, d: false, l: false, r: false }, held: [],
    blank: [false, false], blankAt: [0, 0], rum: [{ until: 0, mag: 0 }, { until: 0, mag: 0 }],
  };
  const mkPad = () => { const b = []; for (let i = 0; i < 17; i++) b.push({ pressed: false, value: 0 }); return { id: 'virtual', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: b }; };
  const VIRT = [mkPad(), mkPad()], BLANK = [mkPad(), mkPad()];

  const pads = () => { if (!navigator.getGamepads) return []; try { return [...navigator.getGamepads()].filter(Boolean); } catch (e) { return []; } };   // the engine's slice(0, 2) is the first two
  const beepSafe = (f, d) => { try { if (typeof beep === 'function') beep(f, d, 'square', 0.04); } catch (e) { /* no audio */ } };

  // ---------- the saved maps ----------
  function cleanMap(raw) {   // a stored entry as { act: [buttons] } with every action present; null when it is the default layout or unusable
    if (!raw || typeof raw !== 'object') return null;
    const m = {}; let same = true;
    for (const a of ACTS) {
      const v = Array.isArray(raw[a]) ? raw[a].filter((n, i, a) => Number.isInteger(n) && n >= 0 && n < MAXBTN && a.indexOf(n) === i) : [];
      m[a] = v.length ? v.slice(0, 3) : DEF[a].slice();
      if (m[a].join() !== DEF[a].join()) same = false;
    }
    return same ? null : m;
  }
  function mapFor(id) {   // the saved map for a controller id, or null (the real pad is used as it is)
    const all = SETTINGS.get('gamepad.maps'); if (!all || typeof all !== 'object') return null;
    if (all !== P.src) { P.src = all; P.parsed = Object.create(null); }
    if (!(id in P.parsed)) P.parsed[id] = cleanMap(all[id]);
    return P.parsed[id];
  }
  function effective(id) { const m = mapFor(id), o = {}; for (const a of ACTS) o[a] = (m ? m[a] : DEF[a]).slice(); return o; }
  function saveMap(id, map) {
    const all = SETTINGS.get('gamepad.maps') || {}, out = {};
    for (const k of Object.keys(all)) if (k !== id) out[k] = all[k];
    if (map && cleanMap(map)) out[id] = map;   // back to the default layout stores nothing
    const keys = Object.keys(out); while (keys.length > MAXMAPS) delete out[keys.shift()];
    SETTINGS.set('gamepad.maps', keys.length ? out : null);
  }
  function assign(id, act, idx) {   // bind button idx to act; whoever had idx loses it, and takes act's old buttons when that leaves it with none
    const cur = effective(id), old = cur[act].slice();
    for (const a of ACTS) if (a !== act && cur[a].includes(idx)) { cur[a] = cur[a].filter(n => n !== idx); if (!cur[a].length) cur[a] = old.filter(n => n !== idx).length ? old.filter(n => n !== idx) : old.slice(); }
    cur[act] = [idx]; saveMap(id, cur); return cur;
  }

  // ---------- the 'pad' hook: what pollPads() gets to see ----------
  const rawOn = gp => { const b = gp.buttons || []; for (let i = 0; i < b.length; i++) if (b[i] && b[i].pressed) return true; const ax = gp.axes || []; for (let i = 0; i < ax.length && i < 4; i++) if (Math.abs(ax[i]) > 0.5) return true; return false; };
  HOOKS.add('pad', (gp, side) => {
    if (!gp || !gp.buttons || side > 1) return gp;
    if (P.last !== 'pad' && rawOn(gp)) P.last = 'pad';
    if (P.open || P.blank[side]) {   // the setup screen has the pad to itself; after it closes the buttons stay dead until they are let go, so a held A does not hit or pick anything
      if (!P.open && (!rawOn(gp) || game.tick - P.blankAt[side] > 90)) P.blank[side] = false;
      else return BLANK[side];
    }
    const m = mapFor(gp.id); if (!m) return gp;
    const v = VIRT[side], B = v.buttons, raw = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
    for (let i = 0; i < B.length; i++) B[i].pressed = false;
    for (const a of ACTS) { let on = false; for (const n of m[a]) if (raw(n)) { on = true; break; } B[ENGINE[a]].pressed = on; }
    v.axes = gp.axes || v.axes; v.id = gp.id; v.index = gp.index;
    return v;
  });

  // ---------- rumble ----------
  const human = f => !!f && !f.cpu && (f.side === 0 || f.side === 1);
  function rumble(side, strong, weak, ms) {   // returns true when an effect was started
    if (!SETTINGS.get('gamepad.rumble')) return false;
    const gp = pads()[side]; if (!gp) return false;
    const act = gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]); if (!act) return false;
    const R = P.rum[side], mag = Math.max(strong, weak), tick = game.tick;
    if (tick < R.until && R.mag >= mag) return false;   // a stronger effect is still playing: let it
    R.until = tick + Math.ceil(ms / 16.7); R.mag = mag;
    try {
      if (typeof act.playEffect === 'function') { const r = act.playEffect('dual-rumble', { startDelay: 0, duration: Math.round(ms), weakMagnitude: Math.min(1, weak), strongMagnitude: Math.min(1, strong) }); if (r && typeof r.catch === 'function') r.catch(() => {}); }
      else if (typeof act.pulse === 'function') act.pulse(Math.min(1, mag), Math.round(ms));
      else return false;
    } catch (e) { return false; }
    return true;
  }
  const hurt = (e, r) => human(e.victim) && rumble(e.victim.side, 0.25 + 0.6 * r, 0.15 + 0.5 * r, 60 + 160 * r);
  BUS.on('hit', e => {
    const r = Math.min(1, (e.dmg || 0) / ((e.victim && e.victim.d && e.victim.d.hp) || 100) * 5);
    hurt(e, r); if (human(e.src)) rumble(e.src.side, 0.05, 0.22, 40);   // the one who lands it feels a light tap
  });
  BUS.on('block', e => { if (human(e.victim)) rumble(e.victim.side, 0.1, 0.25, 45); });
  BUS.on('knockdown', e => { if (human(e.victim)) rumble(e.victim.side, 0.85, 0.5, 220); });
  BUS.on('throw', e => { if (human(e.victim)) rumble(e.victim.side, 0.7, 0.4, 200); });
  BUS.on('super', e => { if (human(e.fighter)) rumble(e.fighter.side, 0.45, 0.8, 300); });
  BUS.on('ko', e => { if (human(e.loser)) rumble(e.loser.side, 1, 0.9, 650); if (human(e.winner)) rumble(e.winner.side, 0.25, 0.3, 200); });
  BUS.on('settings', e => {   // rumble switched off: stop whatever is still running
    if (e.key !== 'gamepad.rumble' || e.value) return;
    for (const gp of pads()) { const act = gp.vibrationActuator; try { if (act && typeof act.reset === 'function') { const r = act.reset(); if (r && typeof r.catch === 'function') r.catch(() => {}); } } catch (x) { /* nothing running */ } }
    P.rum[0].until = P.rum[1].until = 0;
  });

  // ---------- glyphs ----------
  const FACE_COL = ['#5fd35f', '#e8524a', '#4aa3ff', '#ffd23f'], SHAPE_COL = ['#6ea8ff', '#ff6b6b', '#e58bd6', '#5fe0a0'];
  function styleOf(gp) {   // 'letters' | 'swapped' | 'shapes' | 'num' (a pad with no standard layout shows plain button numbers)
    const g = SETTINGS.get('gamepad.glyphs'); if (g !== 'auto') return g;
    const id = gp && gp.id || '';
    if (gp && gp.mapping === '') return 'num';
    const m = /Vendor:\s*([0-9a-f]{4})/i.exec(id) || /^([0-9a-f]{4})-[0-9a-f]{4}/i.exec(id), v = m ? m[1].toLowerCase() : '';
    return v === '054c' ? 'shapes' : v === '057e' ? 'swapped' : 'letters';
  }
  function specFor(idx, st) {
    if (st === 'num') return { t: 'pill', label: 'B' + idx };
    if (idx <= 3) {
      if (st === 'shapes') return { t: 'shape', shape: ['cross', 'circle', 'square', 'triangle'][idx], col: SHAPE_COL[idx], label: ['CROSS', 'CIRCLE', 'SQUARE', 'TRIANGLE'][idx] };
      return { t: 'face', label: (st === 'swapped' ? ['B', 'A', 'Y', 'X'] : ['A', 'B', 'X', 'Y'])[idx], col: st === 'swapped' ? '#e8e0cc' : FACE_COL[idx] };
    }
    if (idx >= 12 && idx <= 15) return { t: 'arrow', dir: ['up', 'down', 'left', 'right'][idx - 12], label: ['UP', 'DOWN', 'LEFT', 'RIGHT'][idx - 12] };
    const sh = st === 'shapes', names = { 4: sh ? 'L1' : 'LB', 5: sh ? 'R1' : 'RB', 6: sh ? 'L2' : 'LT', 7: sh ? 'R2' : 'RT', 8: 'SEL', 9: 'START', 10: 'L3', 11: 'R3', 16: 'HOME' };
    return { t: 'pill', label: names[idx] || 'B' + idx };
  }
  const specW = q => q.t === 'pill' ? ptextWidth(q.label, 2) + 14 : q.t === 'arrow' ? 22 : 24;
  function rr(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    c.fillStyle = fill; c.fill(); c.lineWidth = 2; c.strokeStyle = stroke; c.stroke();
  }
  function drawGlyph(c, q, x, cy) {   // x is the left edge, cy the middle; returns the width
    const w = specW(q); c.save();
    if (q.t === 'pill') { rr(c, x, cy - 11, w, 22, 6, '#14121a', '#9a9384'); ptext(c, q.label, x + w / 2, Math.round(cy - 7), 2, '#fff', 'center'); }
    else if (q.t === 'arrow') {
      rr(c, x, cy - 11, 22, 22, 5, '#14121a', '#9a9384'); c.translate(x + 11, cy); c.fillStyle = '#fff'; c.beginPath();
      if (q.dir === 'up') { c.moveTo(0, -6); c.lineTo(6, 4); c.lineTo(-6, 4); } else if (q.dir === 'down') { c.moveTo(0, 6); c.lineTo(6, -4); c.lineTo(-6, -4); }
      else if (q.dir === 'left') { c.moveTo(-6, 0); c.lineTo(4, -6); c.lineTo(4, 6); } else { c.moveTo(6, 0); c.lineTo(-4, -6); c.lineTo(-4, 6); }
      c.closePath(); c.fill();
    } else {
      const cx = x + 12; c.fillStyle = '#14121a'; c.strokeStyle = q.col; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.fill(); c.stroke();
      if (q.t === 'face') ptext(c, q.label, cx + 1, Math.round(cy - 7), 2, q.col, 'center');
      else {
        c.translate(cx, cy); c.lineWidth = 2.5; c.strokeStyle = q.col; c.beginPath();
        if (q.shape === 'cross') { c.moveTo(-4.5, -4.5); c.lineTo(4.5, 4.5); c.moveTo(4.5, -4.5); c.lineTo(-4.5, 4.5); }
        else if (q.shape === 'circle') c.arc(0, 0, 4.8, 0, Math.PI * 2);
        else if (q.shape === 'square') c.rect(-4.5, -4.5, 9, 9);
        else { c.moveTo(0, -5.5); c.lineTo(5.5, 4); c.lineTo(-5.5, 4); c.closePath(); }
        c.stroke();
      }
    }
    c.restore(); return w;
  }
  function specsFor(acts, gp) {   // the glyphs for the buttons these actions are on now (distinct ones, in order)
    const m = effective(gp ? gp.id : ''), st = styleOf(gp), seen = [], out = [];
    for (const a of acts) { const idx = m[a][0]; if (seen.includes(idx)) continue; seen.push(idx); out.push(specFor(idx, st)); }
    return out;
  }

  // ---------- the hint strips ----------
  const HINTS = {
    title: [['ud', 'CHOOSE'], ['p', 'PICK']],
    select: [['lrud', 'MOVE'], ['p', 'PICK'], ['k', 'UNDO'], ['x', 'ARENA'], ['bk', 'TITLE']],
    over: [['p', 'SELECT'], ['x', 'REMATCH'], ['bk', 'TITLE']],
    pause: [['x', 'GAMEPAD SETUP']],
  };
  const GROUPS = { ud: ['u', 'd'], lrud: ['l', 'r', 'u', 'd'] };
  const BANDS = { title: [494, 26], select: [518, 24], over: [507, 30], pause: [6, 28, 'corner'] };   // y and height: the strips cover the engine's key hint line, nothing else; the pause screen gets a corner pill instead
  const padActive = () => P.n > 0 && P.last === 'pad';
  function hintItems(phase) {
    const gp = pads()[0], rows = HINTS[phase]; if (!rows) return [];
    return rows.map(([a, text]) => ({ specs: specsFor(GROUPS[a] || [a], gp), text }));
  }
  function drawStrip(c, phase) {
    const band = BANDS[phase], items = hintItems(phase); if (!band || !items.length) return;
    const parts = items.map(it => { const gw = it.specs.reduce((s, q) => s + specW(q) + 4, -4), tw = ptextWidth(it.text, 2); return { it, gw, w: gw + 8 + tw }; });
    let total = parts.reduce((s, p) => s + p.w + 22, -22);
    while (parts.length > 1 && total > W - 40) { total -= parts.pop().w + 22; }
    const cy = band[0] + band[1] / 2, corner = band[2] === 'corner'; let x = corner ? 22 : Math.round(W / 2 - total / 2);
    c.save();
    if (corner) rr(c, 12, band[0], total + 20, band[1], 6, 'rgba(8,6,10,0.92)', 'rgba(201,162,74,0.7)');   // a small pill in the free top-left corner (the pause screen has no free bottom line)
    else { c.fillStyle = 'rgba(8,6,10,0.94)'; c.fillRect(0, band[0], W, band[1]); c.fillStyle = 'rgba(201,162,74,0.55)'; c.fillRect(0, band[0], W, 1); }
    c.restore();
    for (const p of parts) {
      let gx = x; for (const q of p.it.specs) gx += drawGlyph(c, q, gx, cy) + 4;
      ptext(c, p.it.text, x + p.gw + 8, Math.round(cy - 7), 2, '#e8e0cc'); x += p.w + 22;
    }
  }
  HOOKS.add('menuHint', (c, g) => { if (SETTINGS.get('gamepad.hints') && padActive() && !P.open) drawStrip(c, g.phase); });

  // ---------- hot-plug toast ----------
  function toast(txt, up) { P.toasts.push({ txt, up, t: 0 }); if (P.toasts.length > 3) P.toasts.shift(); beepSafe(up ? 760 : 330, 0.07); }
  function hotplug(list) {
    const keys = list.map(gp => gp.index + ':' + gp.id);
    if (P.seen === null) { P.seen = keys; return; }
    if (keys.length === P.seen.length && keys.every((k, i) => k === P.seen[i])) return;
    const who = i => i < 2 ? ' · P' + (i + 1) : ' · SPARE';
    P.seen.forEach((k, i) => { if (!keys.includes(k)) toast('GAMEPAD DISCONNECTED' + who(i), false); });
    keys.forEach((k, i) => { if (!P.seen.includes(k)) { toast('GAMEPAD CONNECTED' + who(i), true); P.last = 'pad'; } });
    P.seen = keys;
  }
  const toastTop = () => P.open ? 486 : (game.phase !== 'title' && game.phase !== 'select' && game.phase !== 'over' && game.phase !== 'pause') ? 118 : 6;   // setup screen: the free line above its help text; mid-fight: under the names, clear of the timer and bars; menus: the free top edge
  function drawToasts(c) {
    const ty = toastTop();
    P.toasts.forEach((q, i) => {
      const e = q.t < 14 ? q.t / 14 : q.t > TOAST_LIFE - 20 ? Math.max(0, (TOAST_LIFE - q.t) / 20) : 1, tw = ptextWidth(q.txt, 2), w = tw + 56, x = Math.round(W / 2 - w / 2), y = ty + (P.open ? -i : i) * 34 - Math.round((1 - e) * 10);
      c.save(); c.globalAlpha = Math.min(1, e + 0.05); rr(c, x, y, w, 28, 6, 'rgba(8,6,10,0.9)', q.up ? '#5fd35f' : '#e8524a');
      c.fillStyle = q.up ? '#5fd35f' : '#e8524a'; rr(c, x + 9, y + 8, 24, 13, 5, c.fillStyle, '#0b0a0d');   // a small pad: body, d-pad, two buttons
      c.fillStyle = '#0b0a0d'; c.fillRect(x + 14, y + 13, 7, 2); c.fillRect(x + 16.5, y + 10.5, 2, 7); c.fillRect(x + 25, y + 12, 2, 2); c.fillRect(x + 28, y + 14, 2, 2);
      ptext(c, q.txt, x + 42, y + 7, 2, '#fff'); c.restore();
    });
  }

  // ---------- the setup screen ----------
  const rows = () => [{ k: 'pad' }].concat(ACTS.map(a => ({ k: 'act', a })), [{ k: 'rumble' }, { k: 'glyphs' }, { k: 'hints' }, { k: 'reset' }, { k: 'done' }]);
  function open(from) {
    if (P.open) return; P.open = true; P.from = from || game.phase; P.sel = 0; P.cap = null; P.capT = 0; P.init = false; P.tab = 0; P.held = [];
    beepSafe(700, 0.08); clearPressed();
  }
  function close() {
    if (!P.open) return; P.open = false; P.cap = null; P.blank = [true, true]; P.blankAt = [game.tick, game.tick]; clearPressed(); beepSafe(520, 0.06);
  }
  function activate(r, gp) {
    if (r.k === 'act') { if (gp) { P.cap = r.a; P.capT = 0; beepSafe(900, 0.05); } }
    else if (r.k === 'rumble') { SETTINGS.toggle('gamepad.rumble'); if (SETTINGS.get('gamepad.rumble')) { P.rum[P.tab].until = 0; rumble(P.tab, 0.7, 0.7, 180); } }
    else if (r.k === 'glyphs') { const v = SETTINGS.list().find(x => x.key === 'gamepad.glyphs').values; SETTINGS.set('gamepad.glyphs', v[(v.indexOf(SETTINGS.get('gamepad.glyphs')) + 1) % v.length]); }
    else if (r.k === 'hints') SETTINGS.toggle('gamepad.hints');
    else if (r.k === 'pad') { const n = pads().length; if (n > 1) P.tab = (P.tab + 1) % Math.min(2, n); }
    else if (r.k === 'reset') { if (gp) { saveMap(gp.id, null); beepSafe(600, 0.08); } }
    else if (r.k === 'done') close();
  }
  function screenUpdate(g, list) {
    if (g.phase !== 'title' && g.phase !== 'pause') { close(); return; }
    const gp = list[Math.min(P.tab, Math.max(0, Math.min(1, list.length - 1)))], key = k => !!pressed[k];
    const n = gp ? (gp.buttons || []).length : 0, now = [], ax = gp && gp.axes || [];
    for (let i = 0; i < n; i++) now.push(!!(gp.buttons[i] && gp.buttons[i].pressed));
    const sx = { u: ax[1] < -0.6, d: ax[1] > 0.6, l: ax[0] < -0.5, r: ax[0] > 0.5 };
    if (!P.init) { P.prev = now.slice(); P.pax = sx; P.init = true; }
    const edge = i => !!now[i] && !P.prev[i], aedge = a => sx[a] && !P.pax[a];
    P.held = []; for (let i = 0; i < n && P.held.length < 6; i++) if (now[i]) P.held.push(i);
    const m = gp ? effective(gp.id) : DEF, mapped = a => m[a].some(edge);
    const list2 = rows();
    if (P.cap) {   // waiting for a button: Esc on the keyboard gives up, so does a long silence
      let hit = -1; for (let i = 0; i < n; i++) if (edge(i)) { hit = i; break; }
      if (key('Escape')) { P.cap = null; beepSafe(400, 0.05); }
      else if (hit >= 0 && gp) { assign(gp.id, P.cap, hit); P.cap = null; beepSafe(1000, 0.06); }
      else if (++P.capT > 600) P.cap = null;
    } else {
      const up = key('KeyW') || key('ArrowUp') || edge(12) || aedge('u') || mapped('u'), dn = key('KeyS') || key('ArrowDown') || edge(13) || aedge('d') || mapped('d');
      const lf = key('KeyA') || key('ArrowLeft') || edge(14) || aedge('l') || mapped('l'), rt = key('KeyD') || key('ArrowRight') || edge(15) || aedge('r') || mapped('r');
      const ok = key('Enter') || key('Space') || key('KeyJ') || edge(0) || edge(9) || mapped('p'), bk = key('Escape') || key('KeyK') || key('KeyG') || key('KeyP') || edge(1) || edge(8) || mapped('k');
      if (up !== dn) { P.sel = (P.sel + (up ? list2.length - 1 : 1)) % list2.length; beepSafe(420, 0.03); }
      const r = list2[P.sel];
      if (bk) close();
      else if (ok) activate(r, gp);
      else if (lf !== rt && (r.k === 'rumble' || r.k === 'glyphs' || r.k === 'hints' || r.k === 'pad')) { if (r.k === 'glyphs' && lf) { const v = SETTINGS.list().find(x => x.key === 'gamepad.glyphs').values; SETTINGS.set('gamepad.glyphs', v[(v.indexOf(SETTINGS.get('gamepad.glyphs')) + v.length - 1) % v.length]); } else activate(r, gp); }
    }
    P.prev = now; P.pax = sx;
    for (const k in pressed) pressed[k] = false;   // the screen takes every key: nothing reaches the engine or the options menu behind it
  }
  const onOff = v => v ? 'ON' : 'OFF';
  function drawScreen(c) {
    const list = pads(), gp = list[Math.min(P.tab, Math.max(0, Math.min(1, list.length - 1)))], m = gp ? effective(gp.id) : DEF, st = styleOf(gp), lst = rows();
    c.save(); c.fillStyle = 'rgba(6,4,10,0.97)'; c.fillRect(0, 0, W, H);
    drawTitleText(c, 'GAMEPAD SETUP', W / 2, 38, 36, { align: 'center', style: 'gold', glow: true });
    const x0 = 236, rw = 488, y0 = 90, rh = 23;
    lst.forEach((r, i) => {
      const y = y0 + i * rh, on = P.sel === i, col = on ? '#ffd76a' : '#c9c3b8', ty = Math.round(y - 7), vx = x0 + 232;
      if (on) { c.fillStyle = 'rgba(255,215,106,0.16)'; c.fillRect(x0 - 10, y - 11, rw + 20, 22); }
      let label = '';
      if (r.k === 'act') label = NAMES[r.a]; else if (r.k === 'pad') label = 'GAMEPAD'; else if (r.k === 'rumble') label = 'RUMBLE'; else if (r.k === 'glyphs') label = 'GLYPHS';
      else if (r.k === 'hints') label = 'MENU HINTS'; else if (r.k === 'reset') label = 'RESET THIS GAMEPAD'; else label = 'DONE';
      ptext(c, label, x0, ty, 2, col);
      if (r.k === 'act') {
        if (P.cap === r.a) ptext(c, Math.floor(game.tick / 18) % 2 ? 'PRESS A BUTTON' : 'PRESS A BUTTON...', vx, ty, 2, '#ff9d4d');
        else if (!gp) ptext(c, '-', vx, ty, 2, '#7d7668');
        else { let gx = vx; for (const idx of m[r.a].slice(0, 2)) gx += drawGlyph(c, specFor(idx, st), gx, y) + 6; }
      } else if (r.k === 'pad') ptext(c, gp ? 'PAD ' + (P.tab + 1) + (list.length > 1 ? ' OF ' + Math.min(2, list.length) : '') + ' · ' + (st === 'num' ? 'NUMBERS' : st.toUpperCase()) : 'NONE FOUND', vx, ty, 2, gp ? col : '#ff9d4d');
      else if (r.k === 'rumble') ptext(c, onOff(SETTINGS.get('gamepad.rumble')), vx, ty, 2, col);
      else if (r.k === 'glyphs') ptext(c, SETTINGS.get('gamepad.glyphs').toUpperCase(), vx, ty, 2, col);
      else if (r.k === 'hints') ptext(c, onOff(SETTINGS.get('gamepad.hints')), vx, ty, 2, col);
    });
    const fy = y0 + lst.length * rh + 14;
    if (gp) { ptext(c, 'HELD', x0, fy - 7, 2, '#7d7668'); let gx = x0 + 70; for (const idx of P.held) gx += drawGlyph(c, specFor(idx, st), gx, fy) + 6; }
    else ptext(c, 'PRESS A BUTTON ON YOUR GAMEPAD TO WAKE IT UP', W / 2, fy - 7, 2, '#ff9d4d', 'center');
    const help = P.cap ? 'PRESS THE NEW BUTTON FOR ' + NAMES[P.cap] + ' · ESC CANCELS' : 'W/S OR D-PAD CHOOSE · ENTER OR A CHANGES · ESC OR B CLOSES';
    ptext(c, help, W / 2, H - 20, 2, '#c9a24a', 'center');
    c.restore();
  }

  // ---------- plugging in ----------
  addEventListener('keydown', e => { if (!e.repeat) P.last = 'key'; });   // a real key press hands the hints back to the keyboard (pad input never fires key events: pollPads sets keys[] itself)
  HOOKS.add('update', g => {
    const list = pads(); P.n = list.length;
    for (let s = 0; s < 2; s++) if (!list[s]) P.blank[s] = false;   // nothing to keep quiet on an empty slot
    hotplug(list);
    for (const q of P.toasts) q.t++;
    while (P.toasts.length && P.toasts[0].t > TOAST_LIFE) P.toasts.shift();
    if (P.open) screenUpdate(g, list);
    else if (g.phase === 'pause' && padActive() && !(window.OPTIONS && window.OPTIONS.screen)) {   // the pause screen's pad shortcut: the super button (the key it stands for, so rebinding keys does not break it)
      const k0 = MAP[0].x[0], k1 = MAP[1].x[0];
      if (pressed[k0] || pressed[k1]) { pressed[k0] = pressed[k1] = false; open('pause'); }
    }
  }, -10);
  HOOKS.add('titleItems', () => P.n > 0 ? { id: 'gamepad', label: 'GAMEPAD', order: 905, run() { open('title'); } } : null);
  HOOKS.add('pauseItems', () => P.n > 0 ? { key: 'KeyG', label: 'G GAMEPAD SETUP', run() { open('pause'); } } : null);
  HOOKS.add('drawTop', (c, g) => {
    if (P.open) drawScreen(c);
    else if (g.phase === 'pause' && SETTINGS.get('gamepad.hints') && padActive() && !(window.OPTIONS && window.OPTIONS.screen)) drawStrip(c, 'pause');
    drawToasts(c);
  }, 50);

  window.GAMEPAD = {
    open, close, rumble, assign, mapFor, effective, styleOf,
    isOpen: () => P.open, active: padActive,
    reset: id => saveMap(id, null),
    hint: phase => hintItems(phase).map(it => ({ text: it.text, glyphs: it.specs.map(q => q.label) })),
    glyph: (idx, gp) => specFor(idx, styleOf(gp)).label,
    state: () => ({ open: P.open, from: P.from, sel: P.sel, tab: P.tab, cap: P.cap, n: P.n, last: P.last, blank: P.blank.slice(), held: P.held.slice(), toasts: P.toasts.map(q => q.txt) }),
  };
})();
