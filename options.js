'use strict';
// ===== AGENT BRAWL feature: OPTIONS. The options screen, key rebinding, the pause menu, fullscreen. Loaded after game.js and the other feature files. =====
// Owner: options (docs/features/options.md). Everything here goes through SETTINGS, BUS and HOOKS; game.js is not edited.
//   - OPTIONS screen (title entry "OPTIONS", pause row, pause key O): volumes, rounds, round time, difficulty, shake, flash, CRT, announcer, track toast, blood, fullscreen, reset.
//   - CONTROLS screen: rebinds every action for P1, P2 and the 1P alternate keys into SETTINGS 'binds' (game.js applyBinds reads it). This file keeps LABEL / ALTL (the key names
//     the move lists and hints print) and the touch buttons in step with the binds.
//   - The pause menu: RESUME, MOVES, OPTIONS, CONTROLS, QUIT TO TITLE (confirm). P / Esc / Q / B and the keys of other features' 'pauseItems' still reach the engine.
//   - F toggles fullscreen (and a button on the title). Settings added here: infTime, shake, reduceFlash, crt, announcer, trackToast; 'difficulty' gains 'nightmare'.
//   - Effects are applied by wrapping the draw functions (shake, flash, CRT, infinite-time HUD, track toast, hints). No engine edit is needed because calls resolve through the global object.
// window.OPTIONS is the small API the tests use.
(() => {
  window.STUB_OPTIONS = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.

  // ---------- settings this file adds ----------
  SETTINGS.define('difficulty', { def: 'normal', values: ['easy', 'normal', 'hard', 'nightmare'], label: 'DIFFICULTY' });
  if (!DIFFICULTY.nightmare) DIFFICULTY.nightmare = [0.9, 0.3];   // CPU level at the start of a match, and added after each round
  SETTINGS.define('infTime', { def: false, label: 'INFINITE ROUND TIME' });                               // true: the round clock never runs out (the HUD shows --)
  SETTINGS.define('shake', { def: 'full', values: ['off', 'low', 'full'], label: 'SCREEN SHAKE' });      // scales game.shake when the world is drawn
  SETTINGS.define('reduceFlash', { def: false, label: 'REDUCE FLASH' });                                  // caps the white screen flash
  SETTINGS.define('crt', { def: false, label: 'CRT FILTER' });                                            // scanlines on top of the hud.js post-processing
  SETTINGS.define('announcer', { def: true, label: 'ANNOUNCER ON' });                                     // false: ANNOUNCER.say is silent (voiceVol is the level)
  SETTINGS.define('trackToast', { def: true, label: 'TRACK TOAST' });                                     // the note with the name of the playing track

  const GOLD = '#ffd76a', STEEL = '#d8d2c4', DIM = '#7d7668', RED = '#ff6b5c', BLUE = '#7cc7ff', GREEN = '#7ee08a';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const blip = (f, d) => { try { beep(f, d || 0.04, 'square', 0.05); } catch (e) { /* audio is optional */ } };

  // ---------- key names and the labels the rest of the game prints ----------
  const KN = { Space: 'SPACE', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Backspace: 'BKSP', Enter: 'ENTER',
    Tab: 'TAB', Escape: 'ESC', NumpadAdd: 'NUM+', NumpadSubtract: 'NUM-', NumpadMultiply: 'NUM*', NumpadDivide: 'NUM/', NumpadDecimal: 'NUM.', NumpadEnter: 'NUM ENTER', Delete: 'DEL', Insert: 'INS',
    Home: 'HOME', End: 'END', PageUp: 'PG UP', PageDown: 'PG DN', CapsLock: 'CAPS' };
  function keyName(c) {
    if (KN[c]) return KN[c]; let m;
    if ((m = /^Key([A-Z])$/.exec(c))) return m[1]; if ((m = /^Digit(\d)$/.exec(c))) return m[1]; if ((m = /^Numpad(\d)$/.exec(c))) return 'NUM' + m[1];
    return String(c || '?').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
  }
  const ACT_OF = {}; for (const a in BIND_DEFAULTS.p1) ACT_OF[BIND_DEFAULTS.p1[a][0]] = a;   // default P1 key -> action, to move the touch buttons with the binds
  function syncLabels() {   // LABEL / ALTL are objects game.js and hud.js read at draw time: change them in place
    for (const a of ['p', 'k', 's', 'x']) { LABEL[0][a] = keyName(MAP[0][a][0]); LABEL[1][a] = keyName(MAP[1][a][0]); ALTL[a] = keyName(ALT[a][0]); }
    if (typeof TBTN !== 'undefined') for (const b of TBTN) { if (!b.base) b.base = b.code; const a = ACT_OF[b.base]; b.code = a ? MAP[0][a][0] : b.base; }
  }
  syncLabels(); BUS.on('settings', e => { if (e.key === 'binds') syncLabels(); });
  const dirKeys = m => { const s = [m.u, m.l, m.d, m.r].map(c => keyName(c[0])).join(' '); return s === 'W A S D' ? 'WASD' : s === 'UP LEFT DOWN RIGHT' ? 'ARROWS' : s; };
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsOK = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function titleHint() {
    const L = LABEL[0], A = ALTL;
    return 'W/S + ENTER · FIGHT WITH ' + dirKeys(MAP[0]) + ' + ' + [L.p, L.k, L.s, L.x].join(' ') + ' OR ' + dirKeys(ALT) + ' + ' + [A.p, A.k, A.s, A.x].join(' ') +
      ' · M ' + (muted ? 'UNMUTE' : 'MUTE') + ' · B BLOOD ' + (FX.gore ? 'ON' : 'OFF') + (fsOK() ? ' · F FULLSCREEN' : '');
  }
  function fightHint() { const L = LABEL[0]; return [L.p, L.p, L.p].join(' ') + ' COMBO · FWD + ' + L.p + ' THROW · DOWN + ' + L.k + ' SWEEP · ' + L.s + ' SPECIAL · TAP FWD TWICE DASH · ' + L.x + ' SUPER · HOLD BACK TO BLOCK'; }

  // ---------- binds: conflicts, reserved keys, writing SETTINGS 'binds' ----------
  const ACTS = [['l', 'LEFT'], ['r', 'RIGHT'], ['u', 'UP / JUMP'], ['d', 'DOWN / CROUCH'], ['p', 'PUNCH'], ['k', 'KICK'], ['s', 'SPECIAL'], ['x', 'SUPER']];
  const SHORTN = { l: 'LEFT', r: 'RIGHT', u: 'UP', d: 'DOWN', p: 'PUNCH', k: 'KICK', s: 'SPECIAL', x: 'SUPER' };
  const WHO = ['p1', 'p2', 'alt'], WHON = { p1: 'P1', p2: 'P2', alt: '1P ALT' };
  const mapOf = who => who === 'p1' ? MAP[0] : who === 'p2' ? MAP[1] : ALT;
  // keys that are in use at the same time: P1 with P2 (two players) and P1 with the alternate keys (one player). P2 and the alternate keys never play together (they share the arrows by default).
  const CLASH = { p1: ['p1', 'p2', 'alt'], p2: ['p1', 'p2'], alt: ['p1', 'alt'] };
  const RES = new Set(['Escape', 'Enter', 'NumpadEnter', 'Space', 'Tab', 'Backspace', 'KeyP', 'KeyQ', 'KeyM', 'KeyB', 'KeyT', 'KeyE', 'KeyR', 'KeyF', 'KeyO', 'MetaLeft', 'MetaRight', 'ContextMenu']);
  const reserved = c => RES.has(c) || /^F\d{1,2}$/.test(c);
  function conflictWith(who, a, code) {
    for (const w of CLASH[who]) for (const b in SHORTN) { if (w === who && b === a) continue; if (mapOf(w)[b].includes(code)) return { who: w, act: b }; }
    return null;
  }
  function setBind(who, a, codes) {   // codes null = back to the default
    const cur = JSON.parse(JSON.stringify(SETTINGS.get('binds') || {}));
    cur[who] = cur[who] || {};
    if (codes && JSON.stringify(codes) !== JSON.stringify(BIND_DEFAULTS[who][a])) cur[who][a] = codes.slice(); else delete cur[who][a];
    if (!Object.keys(cur[who]).length) delete cur[who];
    SETTINGS.set('binds', Object.keys(cur).length ? cur : null);
  }

  // ---------- ui state ----------
  const ui = { screen: null, stack: [], osel: 0, psel: 0, crow: 0, ccol: 0, qsel: 1, capture: null, msg: '', bad: false, msgT: -1e9, armT: -1e9, fsDown: false };
  const note = (msg, bad) => { ui.msg = msg; ui.bad = !!bad; ui.msgT = game.tick; };
  function go(s) { ui.stack.push(ui.screen); ui.screen = s; ui.capture = null; if (s === 'options') ui.osel = 0; }
  function back() { ui.screen = ui.stack.length ? ui.stack.pop() : null; ui.capture = null; ui.armT = -1e9; blip(330); }
  function rebind(who, a, code) {
    if (!code || reserved(code)) { note(keyName(code) + ' IS RESERVED. PICK ANOTHER KEY', true); return { ok: false, why: 'reserved' }; }
    const c = conflictWith(who, a, code);
    if (c) { note(keyName(code) + ' IS ALREADY ' + WHON[c.who] + ' ' + SHORTN[c.act] + '. PICK ANOTHER KEY', true); return { ok: false, why: 'conflict', with: c }; }
    setBind(who, a, [code]); note(WHON[who] + ' ' + SHORTN[a] + ' IS NOW ' + keyName(code)); return { ok: true };
  }
  const resetCell = () => { const who = WHO[ui.ccol], a = ACTS[ui.crow][0]; setBind(who, a, null); note(WHON[who] + ' ' + SHORTN[a] + ' BACK TO ' + keyName(BIND_DEFAULTS[who][a][0])); blip(500); };
  const resetAllBinds = () => { SETTINGS.set('binds', null); note('ALL KEYS BACK TO THEIR DEFAULTS'); blip(500); };

  // ---------- fullscreen ----------
  function toggleFullscreen() {
    try {
      if (fsEl()) { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) { const p = x.call(document); if (p && p.catch) p.catch(() => {}); } return; }
      const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen; if (!req) return;
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) { const q = o.lock('landscape'); if (q && q.catch) q.catch(() => {}); } } catch (e) { /* not allowed here: fine */ } };
      const p = req.call(el); if (p && p.then) p.then(lock, () => {}); else lock();
    } catch (e) { /* the browser refused: nothing to do */ }
  }
  addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen(); });

  // ---------- the OPTIONS rows ----------
  function cycle(key, list, d) { let i = list.indexOf(SETTINGS.get(key)); if (i < 0) i = list.length - 1; SETTINGS.set(key, list[(i + d + list.length) % list.length]); blip(560 + 60 * ((i + d + list.length) % list.length)); }
  function cycleTime(d) {
    const T = [30, 60, 99], tm = SETTINGS.get('time');
    let i = SETTINGS.get('infTime') ? 3 : T.reduce((b, v, j) => Math.abs(v - tm) < Math.abs(T[b] - tm) ? j : b, 0);
    i = (i + d + 4) % 4; if (i === 3) SETTINGS.set('infTime', true); else { SETTINGS.set('infTime', false); SETTINGS.set('time', T[i]); }
    blip(560 + 60 * i);
  }
  const volLevel = r => Math.round(SETTINGS.get(r.vol) * 10);
  const volSet = (r, l) => { SETTINGS.set(r.vol, clamp(l, 0, 10) / 10); try { beep(r.tone, 0.09, 'square', 0.06); } catch (e) { /* audio is optional */ } };
  const volStep = (r, d) => volSet(r, volLevel(r) + d);
  const tog = (label, key) => ({ label, show: () => SETTINGS.get(key) ? 'ON' : 'OFF', step: () => { SETTINGS.toggle(key); blip(SETTINGS.get(key) ? 880 : 440); } });
  const OWN = ['musicVol', 'sfxVol', 'voiceVol', 'rounds', 'time', 'infTime', 'difficulty', 'shake', 'reduceFlash', 'crt', 'announcer', 'trackToast', 'gore'];   // what RESET TO DEFAULTS puts back (not the binds, not mute)
  function resetDefaults() {
    if (game.tick - ui.armT > 240) { ui.armT = game.tick; note('PRESS AGAIN TO PUT EVERY OPTION BACK'); blip(300); return; }
    ui.armT = -1e9; for (const k of OWN) SETTINGS.reset(k); note('OPTIONS BACK TO THEIR DEFAULTS'); blip(900, 0.1);
  }
  let ROWS = null;
  function getRows() {
    if (ROWS) return ROWS;
    ROWS = [
      { label: 'MUSIC', vol: 'musicVol', tone: 523 }, { label: 'EFFECTS', vol: 'sfxVol', tone: 659 }, { label: 'VOICE', vol: 'voiceVol', tone: 392 },
      { label: 'ROUNDS', show: () => 'BEST OF ' + (2 * SETTINGS.get('rounds') - 1), step: d => cycle('rounds', [1, 2, 3], d) },
      { label: 'ROUND TIME', show: () => SETTINGS.get('infTime') ? 'INFINITE' : SETTINGS.get('time') + ' SEC', step: cycleTime },
      { label: 'DIFFICULTY', show: () => String(SETTINGS.get('difficulty')).toUpperCase(), step: d => cycle('difficulty', SETTINGS.list().find(x => x.key === 'difficulty').values, d) },
      { label: 'SCREEN SHAKE', show: () => String(SETTINGS.get('shake')).toUpperCase(), step: d => cycle('shake', ['off', 'low', 'full'], d) },
      tog('REDUCE FLASH', 'reduceFlash'), tog('CRT FILTER', 'crt'), tog('ANNOUNCER', 'announcer'), tog('TRACK TOAST', 'trackToast'), tog('BLOOD', 'gore'),
    ];
    if (fsOK()) ROWS.push({ label: 'FULLSCREEN', show: () => fsEl() ? 'ON' : 'OFF', step: toggleFullscreen, act: toggleFullscreen });
    ROWS.push({ label: 'CONTROLS', act: () => go('controls') }, { label: 'RESET TO DEFAULTS', act: resetDefaults, armed: true }, { label: 'BACK', act: back });
    return ROWS;
  }
  const rowStep = (r, d) => { if (r.vol) volStep(r, d); else if (r.step) r.step(d); };

  // ---------- input: the tick hook ----------
  const any = (...codes) => { let r = false; for (const c of codes) if (tap(c)) r = true; return r; };
  function readNav(top) {   // consumes the menu keys; the keys of the fight keep their meaning because only the menus are open here
    const n = {};
    n.up = any('KeyW', 'ArrowUp') | hit(0, 'u') | hit(1, 'u'); n.dn = any('KeyS', 'ArrowDown') | hit(0, 'd') | hit(1, 'd');
    n.lf = any('KeyA', 'ArrowLeft') | hit(0, 'l') | hit(1, 'l'); n.rt = any('KeyD', 'ArrowRight') | hit(0, 'r') | hit(1, 'r');
    n.ok = any('Enter', 'NumpadEnter', 'Space') | hit(0, 'p') | hit(1, 'p');
    n.back = top ? 0 : any('Escape') | (game.phase === 'pause' && any('KeyP')) | hit(0, 'k') | hit(1, 'k');
    for (const k in n) n[k] = !!n[k];
    return n;
  }
  const PAUSE_ROWS = ['RESUME', 'MOVES', 'OPTIONS', 'CONTROLS', 'QUIT TO TITLE'];
  function pauseDo(i) {
    ui.psel = i; blip(700, 0.06);
    if (i === 0) { game.phase = 'fight'; clearPressed(); } else if (i === 1) go('moves'); else if (i === 2) go('options'); else if (i === 3) go('controls'); else { go('quit'); ui.qsel = 1; }
  }
  function pauseNav(n) {
    if (n.up) { ui.psel = (ui.psel + PAUSE_ROWS.length - 1) % PAUSE_ROWS.length; blip(400); }
    if (n.dn) { ui.psel = (ui.psel + 1) % PAUSE_ROWS.length; blip(400); }
    if (n.ok) pauseDo(ui.psel);
  }
  function optionsNav(n) {
    const rows = getRows(), N = rows.length;
    if (n.up) { ui.osel = (ui.osel + N - 1) % N; ui.armT = -1e9; blip(400); }
    if (n.dn) { ui.osel = (ui.osel + 1) % N; ui.armT = -1e9; blip(400); }
    const r = rows[ui.osel];
    if (n.lf) rowStep(r, -1); if (n.rt) rowStep(r, 1);
    if (n.ok) { if (r.act) r.act(); else rowStep(r, 1); }
    if (n.back) back();
  }
  function cellOk() {
    if (ui.crow < 8) { ui.capture = { who: WHO[ui.ccol], a: ACTS[ui.crow][0] }; note('PRESS A KEY FOR ' + WHON[ui.capture.who] + ' ' + SHORTN[ui.capture.a] + ' · ESC CANCELS'); blip(600); } else if (ui.crow === 8) resetAllBinds(); else back();
  }
  function controlsNav(n) {
    if (n.up) ui.crow = (ui.crow + 9) % 10; if (n.dn) ui.crow = (ui.crow + 1) % 10;
    if (ui.crow < 8) { if (n.lf) ui.ccol = (ui.ccol + 2) % 3; if (n.rt) ui.ccol = (ui.ccol + 1) % 3; }
    if (tap('KeyR')) { if (ui.crow < 8) resetCell(); else resetAllBinds(); }
    if (n.ok) cellOk();
    if (n.back) back();
  }
  function quitNow() { ui.screen = null; ui.stack = []; setPhase('title'); clearPressed(); }
  function quitNav(n) {
    if (n.lf || n.rt || n.up || n.dn) { ui.qsel ^= 1; blip(400); }
    if (n.ok) { if (ui.qsel === 0) quitNow(); else back(); }
    if (n.back) back();
  }
  function onUpdate(g) {
    if (SETTINGS.get('infTime') && typeof g.timer === 'number' && g.timer < 5) g.timer = 90;   // the clock never reaches 0
    const ph = g.phase;
    if (ph !== 'title' && ph !== 'pause') { if (ui.screen) { ui.screen = null; ui.stack = []; ui.capture = null; } return; }
    if (!ui.screen && ph !== 'pause') return;
    const top = !ui.screen, n = readNav(top), keep = new Set(['KeyB']);
    if (top) { keep.add('KeyP'); keep.add('Escape'); keep.add('KeyQ'); for (const it of HOOKS.collect('pauseItems')) if (it && it.key) keep.add(it.key); }
    if (ui.capture) { if (n.back) { ui.capture = null; note('CANCELLED'); } }
    else if (top) pauseNav(n);
    else if (ui.screen === 'options') optionsNav(n);
    else if (ui.screen === 'controls') controlsNav(n);
    else if (ui.screen === 'moves') { if (n.back || n.ok) back(); }
    else if (ui.screen === 'quit') quitNav(n);
    for (const k in pressed) if (pressed[k] && !keep.has(k)) pressed[k] = false;
  }
  HOOKS.add('update', onUpdate, -5);
  HOOKS.add('titleItems', () => [{ id: 'options', label: 'OPTIONS', order: 900, run: () => { ui.stack = []; ui.screen = 'options'; ui.osel = 0; ui.capture = null; blip(700, 0.08); } }]);
  HOOKS.add('pauseItems', () => [{ id: 'options', key: 'KeyO', label: 'O OPTIONS', run: () => { if (game.phase === 'pause' && !ui.screen) go('options'); } }]);
  BUS.on('phase', e => { if (e.to === 'pause') { ui.psel = 0; } if (e.to === 'pause' || e.from === 'pause' || e.to === 'title') { ui.screen = null; ui.stack = []; ui.capture = null; ui.armT = -1e9; } });

  // the key that is being rebound: taken in the capture phase so the engine never sees it
  addEventListener('keydown', e => {
    if (!ui.capture) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || !e.code) return;
    if (e.code === 'Escape') { ui.capture = null; note('CANCELLED'); blip(300); return; }
    const r = rebind(ui.capture.who, ui.capture.a, e.code);
    if (r.ok) { ui.capture = null; blip(880, 0.08); } else blip(200, 0.12);
  }, true);

  // ---------- input: mouse and touch ----------
  const optY = i => 84 + i * 26, ctlY = i => i < 8 ? 104 + i * 27 : i === 8 ? 328 : 358, COLX = [430, 610, 790], pauseY = i => 170 + i * 48;
  const FSB = { x: 792, y: 8, w: 160, h: 30 };
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const pauseHit = (x, y) => { for (let i = 0; i < PAUSE_ROWS.length; i++) if (Math.abs(x - W / 2) < 170 && Math.abs(y - pauseY(i)) < 22) return i; return -1; };
  function optPtr(x, y) {
    const rows = getRows(), i = Math.floor((y - (optY(0) - 13)) / 26);
    if (i < 0 || i >= rows.length || x < 125 || x > 835) return;
    ui.osel = i; const r = rows[i];
    if (r.act === toggleFullscreen) { ui.fsDown = true; return; }   // a touch only counts as a user gesture when the finger lifts: pointerup does it
    if (r.act) { r.act(); return; }
    if (r.vol) { if (x < 505) return; if (x < 555) volStep(r, -1); else if (x <= 765) volSet(r, clamp(Math.ceil((x - 560) / 20), 1, 10)); else volStep(r, 1); return; }
    rowStep(r, x >= 505 && x < 600 ? -1 : 1);
  }
  function ctlPtr(x, y) {
    for (let r = 0; r < 10; r++) if (Math.abs(y - ctlY(r)) <= 13) {
      ui.crow = r;
      if (r < 8) { const c = COLX.findIndex(cx => Math.abs(x - cx) <= 85); if (c >= 0) { ui.ccol = c; cellOk(); } } else if (x > 300 && x < 660) cellOk();
      return;
    }
  }
  function ptrDown(x, y) {
    ui.capture = null;
    if (!ui.screen) { const i = pauseHit(x, y); if (i >= 0) pauseDo(i); return; }
    if (ui.screen === 'options') optPtr(x, y); else if (ui.screen === 'controls') ctlPtr(x, y); else if (ui.screen === 'moves') back();
    else if (ui.screen === 'quit') { if (Math.abs(y - 292) < 22) { if (Math.abs(x - (W / 2 - 80)) < 60) { ui.qsel = 0; quitNow(); } else if (Math.abs(x - (W / 2 + 80)) < 60) back(); } }
  }
  const canvasPos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  addEventListener('pointerdown', e => {
    if (e.target !== cv) return;
    const touchy = e.pointerType !== 'mouse', [x, y] = canvasPos(e), ph = game.phase;
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); if (touchy) touch.on = true; };
    if (ui.screen || (ph === 'pause' && pauseHit(x, y) >= 0)) { eat(); ptrDown(x, y); return; }
    if (ph !== 'title') return;
    if (fsOK() && inRect(x, y, FSB)) { eat(); ui.fsDown = true; return; }
    const items = titleItems();   // a tap on an entry picks that entry; the engine's tap-anywhere then confirms it
    const pgr = titlePager(items.length); if (pgr && !titleOverlayOpen() && Math.abs(x - pgr.x) < 56 && Math.abs(y - pgr.y - 8) < 26) { eat(); game.titleSel = ((pgr.page + 1) % pgr.pages) * pgr.size; beep(400, 0.04); return; }   // the PAGE note flips to the next page of entries
    for (let i = 0; i < items.length; i++) { const s = titleSlot(i, items.length); if (Math.abs(x - s.x) < 150 && Math.abs(y - s.y) < 16) { game.titleSel = i; if (!touchy && !touch.on) pressed.Enter = true; break; } }
  }, true);
  addEventListener('pointerup', () => { if (ui.fsDown) { ui.fsDown = false; toggleFullscreen(); } }, true);

  // ---------- drawing ----------
  function panel(x, y, w, h) { ctx.fillStyle = 'rgba(8,6,12,0.9)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  function footer(hint) {
    const live = game.tick - ui.msgT < 220 && ui.msg;
    ctx.fillStyle = 'rgba(5,3,4,0.95)'; ctx.fillRect(0, 506, W, H - 506);   // hides the title's own hint lines under the screen
    uiText(live ? ui.msg : hint, W / 2, 522, live ? 17 : 14, live ? (ui.bad ? RED : GREEN) : '#c9c3b8');
  }
  function drawVol(r, y, on) {
    const l = volLevel(r);
    for (let k = 0; k < 10; k++) { ctx.fillStyle = k < l ? (on ? GOLD : '#c9a24a') : '#3a3530'; ctx.fillRect(560 + k * 20, y - 7, 16, 14); }
    uiText(String(l), 826, y, 16, on ? GOLD : '#c9c3b8', 'right');
    if (on) { uiText('<', 538, y, 20, GOLD); uiText('>', 784, y, 20, GOLD); }
  }
  function drawOptions() {
    shade(0.84); drawTitleText(ctx, 'OPTIONS', W / 2, 32, 40, { align: 'center', style: 'gold', glow: true });
    panel(120, 56, 720, 448);
    getRows().forEach((r, i) => {
      const y = optY(i), on = i === ui.osel, armed = r.armed && game.tick - ui.armT < 240;
      if (on) { ctx.fillStyle = 'rgba(201,162,74,0.2)'; ctx.fillRect(128, y - 12, 704, 24); }
      uiText(armed ? 'PRESS AGAIN TO CONFIRM' : r.label, 150, y, 18, armed ? RED : on ? GOLD : STEEL, 'left');
      if (r.vol) drawVol(r, y, on);
      else if (r.show) { uiText(r.show(), 660, y, 18, on ? GOLD : STEEL, 'center'); if (on && r.step) { uiText('<', 530, y, 20, GOLD); uiText('>', 790, y, 20, GOLD); } }
    });
    footer(touch.on ? 'TAP A ROW · TAP < > OR THE BAR TO CHANGE' : 'W/S SELECT · A/D OR PUNCH CHANGE · ESC BACK · B BLOOD' + (fsOK() ? ' · F FULLSCREEN' : ''));
  }
  function drawControls() {
    shade(0.86); drawTitleText(ctx, 'CONTROLS', W / 2, 30, 40, { align: 'center', style: 'gold', glow: true });
    panel(60, 54, 840, 346);
    uiText('ACTION', 90, 80, 15, DIM, 'left');
    ['P1', 'P2', '1P ALT'].forEach((s, c) => uiText(s, COLX[c], 80, 16, BLUE));
    ACTS.forEach(([a, name], r) => {
      const y = ctlY(r); if (ui.crow === r) { ctx.fillStyle = 'rgba(201,162,74,0.14)'; ctx.fillRect(68, y - 13, 824, 26); }
      uiText(name, 90, y, 17, ui.crow === r ? GOLD : STEEL, 'left');
      WHO.forEach((who, c) => {
        const sel = ui.crow === r && ui.ccol === c, cap = ui.capture && ui.capture.who === who && ui.capture.a === a;
        ctx.fillStyle = cap ? 'rgba(255,107,92,0.35)' : sel ? 'rgba(255,215,106,0.25)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(COLX[c] - 78, y - 11, 156, 22);
        if (sel) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(COLX[c] - 77, y - 10, 154, 20); }
        uiText(cap ? 'PRESS A KEY' : mapOf(who)[a].map(keyName).join(' / '), COLX[c], y, 16, cap ? RED : sel ? GOLD : STEEL);
      });
    });
    if (ui.crow >= 8) { ctx.fillStyle = 'rgba(255,215,106,0.2)'; ctx.fillRect(300, ctlY(ui.crow) - 13, 360, 26); }
    uiText('RESET ALL KEYS', W / 2, ctlY(8), 17, ui.crow === 8 ? GOLD : STEEL); uiText('BACK', W / 2, ctlY(9), 17, ui.crow === 9 ? GOLD : STEEL);
    panel(60, 408, 840, 84);
    uiText('GAMEPAD (READ ONLY) · PAD 1 PLAYS P1, PAD 2 PLAYS P2', W / 2, 424, 15, BLUE);
    uiText('MOVE: D-PAD OR LEFT STICK · A PUNCH · B KICK · X SPECIAL · Y OR RB SUPER', W / 2, 446, 15, STEEL);
    uiText('START PAUSE OR CONFIRM · BACK = ESC · IN MENUS A CONFIRMS AND B GOES BACK', W / 2, 468, 15, STEEL);
    footer(touch.on ? 'TAP A KEY BOX, THEN PRESS A KEY' : 'W/S/A/D MOVE · ENTER REBINDS · R RESETS A KEY · ESC CANCELS OR GOES BACK');
  }
  function drawMoves() {
    shade(0.8); drawTitleText(ctx, 'MOVES', W / 2, 58, 44, { align: 'center', style: 'steel', glow: true });
    for (let s = 0; s < 2; s++) { const f = game.f[s]; if (f) drawMoveList(ctx, (f.cpu ? 'CPU · ' : 'P' + (s + 1) + ' · ') + SHORT(f.d), moveRows(f.d.id, s, f.cpu), s ? W / 2 + 10 : 40, 120, W / 2 - 50, 200); }
    const L = LABEL[0], M = LABEL[1], A = ALTL, one = game.mode === 1, both = a => one ? L[a] + '/' + A[a] : L[a];
    if (touch.on) {   // the on-screen pad: d-pad plus P K SP SU, no keys to name
      uiText('PAD  D-PAD MOVES · P PUNCH · K KICK · SP SPECIAL · SU SUPER · HOLD BACK TO BLOCK', W / 2, 346, 16, '#ddd');
      uiText('JUMP + P/K AIR ATTACK · DOWN + P LOW JAB · DOUBLE-TAP FORWARD DASH · DOUBLE-TAP BACK DODGE · PUNCH TECHS A THROW', W / 2, 428, 14, '#aab');
    } else {
      uiText('P1  ' + (one ? dirKeys(MAP[0]) + ' OR ' + dirKeys(ALT) : dirKeys(MAP[0])) + ' · ' + both('p') + ' PUNCH · ' + both('k') + ' KICK · ' + both('s') + ' SPECIAL · ' + both('x') + ' SUPER · HOLD BACK TO BLOCK', W / 2, 346, 16, '#ddd');
      uiText('P2  ' + dirKeys(MAP[1]) + ' · ' + M.p + ' PUNCH · ' + M.k + ' KICK · ' + M.s + ' SPECIAL · ' + M.x + ' SUPER', W / 2, 372, 16, '#ddd');
      uiText('GAMEPAD  A PUNCH · B KICK · X SPECIAL · Y SUPER · START PAUSE', W / 2, 398, 16, '#ddd');
      uiText('JUMP + P/K AIR ATTACK · DOWN + P LOW JAB · TAP FWD TWICE DASH · TAP BACK TWICE DODGE · PUNCH TECHS A THROW', W / 2, 428, 14, '#aab');
    }
    uiText('NO MATCH WINNER AFTER ROUND 3? SUDDEN DEATH: 30 SECONDS · 25% HEALTH · A TIE GOES TO THE FULLER SUPER METER', W / 2, 442, 12, '#ffb4a8');
    uiText(touch.on ? 'TAP TO GO BACK' : 'ESC OR ENTER: BACK', W / 2, 500, 18, '#c9a24a');
  }
  function drawPauseMenu() {
    shade(0.72); drawTitleText(ctx, 'PAUSED', W / 2, 70, 56, { align: 'center', style: 'steel', glow: true });
    PAUSE_ROWS.forEach((s, i) => { const on = ui.psel === i; drawTitleText(ctx, s, W / 2, pauseY(i), on ? 30 : 24, { align: 'center', style: on ? 'gold' : 'steel', alpha: on ? 1 : 0.6, glow: on }); });
    uiText(touch.on ? 'TAP A ROW · RESUME, SOUND AND QUIT ARE THE BUTTONS BELOW' : 'W/S + ENTER · P / ESC RESUME · Q QUIT TO TITLE · M ' + (muted ? 'UNMUTE' : 'MUTE') + ' · B BLOOD ' + (FX.gore ? 'ON' : 'OFF') + (fsOK() ? ' · F FULLSCREEN' : ''), W / 2, 450, 16, '#c9a24a');
    const extra = touch.on ? [] : HOOKS.collect('pauseItems').filter(it => it && it.id !== 'options' && it.label);   // keys other features add to the pause screen: { key, label, run(game) }; a touch screen has no keys to name
    if (extra.length) {   // many features add keys: break them into rows that fit the canvas instead of one line that runs off both sides
      ctx.save(); ctx.font = '16px Impact, Haettenschweiler, "Arial Narrow", sans-serif';
      const rows = []; let cur = '';
      for (const it of extra) { const nx = cur ? cur + ' \u00b7 ' + it.label : it.label; if (cur && ctx.measureText(nx).width > 880) { rows.push(cur); cur = it.label; } else cur = nx; }
      ctx.restore(); if (cur) rows.push(cur);
      rows.forEach((r, i) => uiText(r, W / 2, 480 + i * 18, 16, '#c9a24a'));
    }
  }
  function drawQuit() {
    panel(W / 2 - 190, 190, 380, 140); drawTitleText(ctx, 'QUIT TO TITLE?', W / 2, 226, 30, { align: 'center', style: 'steel' });
    [['YES', -80, 0], ['NO', 80, 1]].forEach(([s, dx, k]) => { const on = ui.qsel === k; if (on) { ctx.fillStyle = 'rgba(255,215,106,0.25)'; ctx.fillRect(W / 2 + dx - 60, 270, 120, 44); } uiText(s, W / 2 + dx, 292, 24, on ? GOLD : STEEL); });
  }
  function drawScreen() {
    const s = ui.screen;
    if (!s) drawPauseMenu(); else if (s === 'options') drawOptions(); else if (s === 'controls') drawControls(); else if (s === 'moves') drawMoves(); else if (s === 'quit') { drawPauseMenu(); drawQuit(); }
  }
  function drawFsButton() {
    if (!fsOK()) return;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(FSB.x, FSB.y, FSB.w, FSB.h); ctx.strokeStyle = DIM; ctx.lineWidth = 2; ctx.strokeRect(FSB.x + 1, FSB.y + 1, FSB.w - 2, FSB.h - 2);
    uiText(fsEl() ? 'EXIT FULLSCREEN' : 'F  FULLSCREEN', FSB.x + FSB.w / 2, FSB.y + FSB.h / 2 + 1, 15, '#c9c3b8');
  }

  // ---------- wrapping the engine's draw calls (they resolve through the global object, so reassigning window.name is enough) ----------
  const uiText0 = window.uiText;
  window.uiText = function (s, x, y, size, col, align, alpha) {
    if (typeof s === 'string') {
      if (s.charCodeAt(0) === 0x266a) { if (!SETTINGS.get('trackToast')) return; }   // the note with the track name
      else if (s.startsWith('W/S + ENTER \u00b7 FIGHT WITH')) { s = titleHint(); if (y === 506 && titleItems().length > 2) y = 510; }   // three or more entries reach down to the hint line
      else if (s === 'TAP TO START') { if (y === 506 && titleItems().length > 2) y = 510; }
      else if (s.startsWith('J J J COMBO')) s = fightHint();
    }
    return uiText0.call(this, s, x, y, size, col, align, alpha);
  };
  const drawWorld0 = window.drawWorld;
  window.drawWorld = function () {
    const sh = game.shake, m = SETTINGS.get('shake');
    if (sh && m !== 'full') game.shake = m === 'off' ? 0 : sh * 0.5;
    try { return drawWorld0.apply(this, arguments); } finally { game.shake = sh; }
  };
  const drawPost0 = window.drawPost;
  window.drawPost = function (c, t, opts) {
    opts = Object.assign({}, opts);
    if (SETTINGS.get('reduceFlash') && opts.flash) opts.flash = Math.min(opts.flash, 0.18);
    if (SETTINGS.get('crt') && !opts.scan) opts.scan = 1.5;
    return drawPost0.call(this, c, t, opts);
  };
  const drawHUD0 = window.drawHUD;
  window.drawHUD = function (c, g) {
    if (g && SETTINGS.get('infTime') && typeof g.timer === 'number') { const t = g.timer; g.timer = '--'; try { return drawHUD0.apply(this, arguments); } finally { g.timer = t; } }
    return drawHUD0.apply(this, arguments);
  };
  const drawFight0 = window.drawFight;
  window.drawFight = function () {
    if (game.phase !== 'pause') return drawFight0.apply(this, arguments);
    game._phase = 'fight'; game.still = true;   // the world, HUD and banner are drawn as in a fight (without its round 1 hint strips); the stock pause overlay (which needs phase 'pause') is replaced by the menu below
    try { drawFight0.apply(this, arguments); } finally { game._phase = 'pause'; game.still = false; }
    drawScreen();
  };
  const drawTitle0 = window.drawTitle;
  window.drawTitle = function () { drawTitle0.apply(this, arguments); if (ui.screen) drawScreen(); else drawFsButton(); };
  const drawTouch0 = window.drawTouch;
  window.drawTouch = function () { if (!drawTouch0 || ui.screen || game.phase === 'pause') return; return drawTouch0.apply(this, arguments); };   // the on-screen buttons would sit on top of the menus
  if (window.ANNOUNCER && ANNOUNCER.say) { const say0 = ANNOUNCER.say; ANNOUNCER.say = function () { if (!SETTINGS.get('announcer')) return; return say0.apply(this, arguments); }; }

  window.OPTIONS = {
    get screen() { return ui.screen; }, get capturing() { return !!ui.capture; }, get message() { return ui.msg; }, get warning() { return ui.bad && game.tick - ui.msgT < 220; },
    open(s) { ui.stack = game.phase === 'pause' ? [null] : []; ui.screen = s || 'options'; ui.capture = null; ui.osel = 0; },
    close() { ui.screen = null; ui.stack = []; ui.capture = null; },
    rows: () => getRows().map(r => r.label), state: ui,
    rebind, conflict: conflictWith, reserved, keyName, fullscreen: toggleFullscreen, resetDefaults, ownKeys: OWN.slice(),
  };
})();
