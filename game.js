// ===== AGENT BRAWL: parody arcade fighter. Engine, input, AI, phases, menus =====
// Load order (dev.html): pixelfont.js, sprites.js (fighters), arenas.js (ARENAS), hud.js (HUD, ANNOUNCER, FX), music.js (MUSIC), moves.js (MOVES), game.js.
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
// W, H and GROUND are declared in dev.html before every script (moves.js needs GROUND at load).
const TICK = 1000 / 60;            // fixed simulation step (ms)
const GRAV = 0.7, JUMP_V = -13.5;
const VS_LEN = 200, VS_LAND = 110, INTRO_LEN = 100, FINISH_LEN = 300;
const ATTACKS = new Set(['punch', 'kick', 'special', 'super']);

// ---------- scaling / resize ----------
// Desktop: quarter-pixel steps keep the pixels even. Touch + portrait: the canvas fills the width and the controls get their own block underneath.
// Touch + landscape: the canvas fits the screen with a column kept free at the right edge for the menu buttons, and the d-pad and buttons float over the playfield, clear of the HUD (touch.layout, in the touch section).
const shareEl = document.getElementById('share');
const touch = { on: false, coarse: false, ready: false, tip: '' };   // tip: fight text for under the game in the portrait layout (set by drawFight)
try { touch.coarse = touch.on = matchMedia('(pointer: coarse)').matches; } catch (e) { /* no matchMedia: the first touch turns the pad on */ }
const lay = { s: 1, x: 0, y: 0, stacked: false };   // canvas scale and top-left corner in CSS pixels, and whether the controls sit in a block below it
function fit() {
  const vw = innerWidth, vh = innerHeight, fill = Math.min(vw / W, vh / H);
  lay.stacked = touch.on && vw < vh && vh - H * (vw / W) >= 170;
  const gut = touch.on && !lay.stacked ? Math.max(72, Math.min(110, Math.round(vw * 0.08))) : 0;   // touch + landscape: a column at the right edge is kept free for the menu buttons
  lay.s = lay.stacked ? vw / W : touch.on ? Math.min(fill, (vw - gut) / W) : Math.max(0.25, Math.floor(fill * 4) / 4);
  lay.x = Math.round((vw - W * lay.s) / 2); lay.y = lay.stacked ? 0 : Math.round((vh - H * lay.s) / 2);
  if (gut) lay.x = Math.max(0, Math.min(lay.x, Math.floor(vw - Math.round(W * lay.s) - gut)));   // a 16:9 or 4:3 screen has no room beside the centred game: slide it left
  cv.style.width = Math.round(W * lay.s) + 'px'; cv.style.height = Math.round(H * lay.s) + 'px'; cv.style.left = lay.x + 'px'; cv.style.top = lay.y + 'px';
  if (shareEl) {
    shareEl.classList.toggle('tp', touch.on);   // touch: the button joins the menu buttons (placed by touch.layout); desktop: it floats over the end screen
    if (!touch.on) { shareEl.style.top = Math.round(lay.y + 150 * lay.s) + 'px'; shareEl.style.fontSize = Math.max(12, Math.round(18 * lay.s)) + 'px'; shareEl.style.left = shareEl.style.width = ''; shareEl.classList.remove('ovl'); shareEl.textContent = 'SHARE ON X'; }
  }
  if (touch.ready) touch.layout();
}
addEventListener('resize', fit); addEventListener('orientationchange', fit); if (window.visualViewport) visualViewport.addEventListener('resize', fit); fit();

// ---------- audio (tiny synth, unlocked on first interaction) ----------
let AC = null, muted = false;
try { muted = localStorage.getItem('brawl.muted') === '1'; } catch (e) { /* storage blocked: start unmuted */ }
function setMuted(v) { muted = v; try { localStorage.setItem('brawl.muted', v ? '1' : '0'); } catch (e) { /* not persisted */ } if (v && window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { } }
// Levels: music.js plays at about -17 dBFS RMS (each theme trimmed to match). Effects are scaled up to sit clearly above it (a normal hit peaks near -9 dBFS)
// and pass through a soft limiter (SFX), so effects stacked in a special move or a KO cannot clip the output.
const SFX_BEEP = 6, SFX_THUD = 9, SFX_CEIL = 0.6, SFX_RANGE = 4;
let SFX = null, audioFail = false;   // audioFail: this browser would not give us a context (the title then stops asking for a key press)
function audioInit() { // runs on every gesture type: a context made on a gesture the browser does not count (or left suspended / interrupted by Safari / iOS) is resumed by the next one
  if (!AC) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }   // Safari / iOS: Web Audio is silenced by the ring switch unless the page asks to play back
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); audioFail = false; } catch (e) { AC = null; audioFail = true; return; }
    try { const s = AC.createBufferSource(); s.buffer = AC.createBuffer(1, 1, 22050); s.connect(AC.destination); s.start(0); } catch (e) { }   // silent blip: the classic iOS unlock
  }
  if (!SFX) try { // effects bus: input is +-SFX_RANGE of signal, output tops out near SFX_CEIL (tanh curve: transparent when quiet, rounded when loud; the 2x oversampling can overshoot it by about 2 dB)
    const sh = AC.createWaveShaper(), c = new Float32Array(2049);
    for (let i = 0; i < c.length; i++) c[i] = SFX_CEIL * Math.tanh((i / 1024 - 1) * SFX_RANGE / SFX_CEIL);
    sh.curve = c; sh.oversample = '2x'; sh.connect(AC.destination); SFX = sh;
  } catch (e) { SFX = null; }
  if (AC.state !== 'running') try { const r = AC.resume(); if (r && r.catch) r.catch(() => { /* not a gesture the browser accepts: the next one retries */ }); } catch (e) { }
}
function beep(f, d, type = 'square', v = 0.06, slide = 0.5) {
  if (!AC || muted || AC.state !== 'running') return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v * SFX_BEEP / SFX_RANGE; o.connect(g); g.connect(SFX || AC.destination);
    const n = AC.currentTime; o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), n + d); g.gain.exponentialRampToValueAtTime(0.0001, n + d); o.start(); o.stop(n + d);
  } catch (e) { }
}
let NOISE = null;
function thud(d = 0.12, v = 0.12) { // short noise burst for impacts
  if (!AC || muted || AC.state !== 'running') return;
  try {
    if (!NOISE) { NOISE = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate); const ch = NOISE.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length); }
    const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter(); s.buffer = NOISE; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = v * SFX_THUD / SFX_RANGE;
    s.connect(f); f.connect(g); g.connect(SFX || AC.destination); const n = AC.currentTime; g.gain.exponentialRampToValueAtTime(0.0001, n + d); s.start(); s.stop(n + d);
  } catch (e) { }
}
for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) addEventListener(ev, audioInit, { passive: true });
function say(key, arg) { try { ANNOUNCER.say(key, arg); } catch (e) { /* the announcer is optional */ } }
function setGore(v) { FX.gore = v; try { localStorage.setItem('brawl.gore', v ? '1' : '0'); } catch (e) { } }

// ---------- input ----------
// P1: WASD + J punch, K kick, L special, I super (1P also: arrows + Z X C V). P2: arrows + numpad 1/2/3/0 (or , . / and right shift).
// Special: L alone, forward + L, down + L. Super: I, or J + K together. Holding back blocks. Moves beyond that (all with the same keys):
// P P P chain, FWD + P throw, DOWN + K sweep, DOWN + P low jab, P/K in the air, L in the air, double-tap forward = dash, double-tap back = backdash.
const keys = {}, pressed = {};
const MAP = [
  { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], p: ['KeyJ'], k: ['KeyK'], s: ['KeyL'], x: ['KeyI'] },
  { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], p: ['Numpad1', 'Comma'], k: ['Numpad2', 'Period'], s: ['Numpad3', 'Slash'], x: ['Numpad0', 'ShiftRight'] },
];
const ALT = { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], p: ['KeyZ'], k: ['KeyX'], s: ['KeyC'], x: ['KeyV'] }; // 1P only: arrows + Z X C V
const LABEL = [{ p: 'J', k: 'K', s: 'L', x: 'I' }, { p: 'NUM1', k: 'NUM2', s: 'NUM3', x: 'NUM0' }];
const ALTL = { p: 'Z', k: 'X', s: 'C', x: 'V' };   // the 1P alternate keys, shown next to LABEL[0] in the move lists
const GAME_KEYS = new Set(['Space', 'Enter', 'Escape', 'KeyP', 'KeyQ', 'KeyE', 'KeyM', 'KeyB', 'KeyT', 'Tab']);
for (const m of [...MAP, ALT]) for (const a in m) for (const c of m[a]) GAME_KEYS.add(c);
addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code)) e.preventDefault(); if (e.repeat) return; if (!keys[e.code]) pressed[e.code] = true; keys[e.code] = true;
  if (e.code === 'KeyM') setMuted(!muted);
  if (e.code === 'KeyT' && game.phase === 'over') share();   // opened here: popups need the key event itself
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; if (game.phase === 'fight') game.phase = 'pause'; });
function clearPressed() { for (const k in pressed) pressed[k] = false; }
function tap(c) { if (pressed[c]) { pressed[c] = false; return true; } return false; }
function codes(side, a) { const c = MAP[side][a]; return side === 0 && game.mode === 1 ? c.concat(ALT[a]) : c; }
function held(side, a) { return codes(side, a).some(c => keys[c]); }
function hit(side, a) { let r = false; for (const c of codes(side, a)) if (pressed[c]) { pressed[c] = false; r = true; } return r; }

// ---------- gamepads: pad 1 drives P1's keys, pad 2 P2's (A punch, B kick, X special, Y/RB super, Start) ----------
const padPrev = [{}, {}];
function pollPads() {
  if (!navigator.getGamepads) return;
  let pads; try { pads = [...navigator.getGamepads()].filter(Boolean).slice(0, 2); } catch (e) { return; }
  pads.forEach((gp, side) => {
    const m = MAP[side], ax = gp.axes || [], b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const now = { [m.l[0]]: b(14) || ax[0] < -0.5, [m.r[0]]: b(15) || ax[0] > 0.5, [m.u[0]]: b(12) || ax[1] < -0.6, [m.d[0]]: b(13) || ax[1] > 0.6, [m.p[0]]: b(0), [m.k[0]]: b(1), [m.s[0]]: b(2), [m.x[0]]: b(3) || b(5), Start: b(9), Back: b(8) };
    for (const c in now) {
      // engine: still held but the key was dropped behind our back (window blur clears every key) -> hold it again, without a fresh press
      if (now[c] === !!padPrev[side][c]) { if (now[c] && c !== 'Start' && c !== 'Back') keys[c] = true; continue; }
      padPrev[side][c] = now[c];
      if (c === 'Start') { if (now[c]) pressed[game.phase === 'fight' || game.phase === 'pause' ? 'KeyP' : 'Enter'] = true; continue; }
      if (c === 'Back') { if (now[c]) pressed.Escape = true; continue; }
      if (now[c] && !keys[c]) pressed[c] = true; keys[c] = now[c];
    }
  });
  // engine: a pad that vanishes (unplugged, asleep) while holding something used to leave that key stuck down for good
  for (let side = pads.length; side < 2; side++) { for (const c in padPrev[side]) if (padPrev[side][c] && c !== 'Start' && c !== 'Back') keys[c] = false; padPrev[side] = {}; }
}

// ---------- touch controls ----------
// A DOM layer for touch devices (it also appears after the first touch anywhere): an 8-way d-pad, P / K / SP / SU buttons and a few menu buttons.
// It drives the same keys{} / pressed{} as the keyboard, so every move works unchanged: a diagonal jumps forward or back, tapping a direction twice
// dashes, DOWN + K sweeps and FWD + P throws (left thumb on the d-pad, right thumb on the buttons). Taps on the canvas pick title rows, fighters and arenas.
// Browsers only count pointerup / touchend / click (never pointerdown) as the gesture that may start audio, so those unlock it too.
for (const ev of ['pointerup', 'touchend', 'click']) addEventListener(ev, audioInit, { passive: true });
(function () {
  const FIGHT = new Set(['intro', 'fight', 'finish', 'finisher', 'ko', 'outro']);
  const BTN = [{ code: 'KeyL', lbl: 'SP', col: '#7cc7ff' }, { code: 'KeyI', lbl: 'SU', col: '#ff4d6d' }, { code: 'KeyJ', lbl: 'P', col: '#ffd23f' }, { code: 'KeyK', lbl: 'K', col: '#ff7a5c' }];
  const DIR = { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS' };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; parent.appendChild(e); return e; };
  const TURN = 'TURN YOUR PHONE SIDEWAYS FOR A BIGGER SCREEN';
  const pad = mk('div', '', document.body), dpad = mk('div', '', pad), pills = mk('div', '', pad), hint = mk('div', 'hint', pad, TURN);
  pad.id = 'pad'; pad.hidden = true; dpad.id = 'dpad'; pills.id = 'pills';
  const arrows = {}; for (const k of ['u', 'd', 'l', 'r']) arrows[k] = mk('i', k, dpad);
  const btns = BTN.map(b => { const e = mk('div', 'tb', pad, b.lbl); e.style.setProperty('--c', b.col); return e; });

  // ----- keys held by the pad. A tap shorter than 40 ms still stays down for a couple of ticks so the 60 Hz input poll cannot miss it -----
  const down = {};
  const isDown = c => down[c] && !down[c].up;
  function press(code) { down[code] = { t: performance.now(), up: false }; pressed[code] = true; keys[code] = true; }
  function release(code) {
    const tok = down[code]; if (!tok || tok.up) return; tok.up = true;
    const go = () => { if (down[code] === tok) { keys[code] = false; delete down[code]; } }, rest = 40 - (performance.now() - tok.t);
    if (rest > 0) setTimeout(go, rest); else go();
  }
  function reset() { for (const c in down) { keys[c] = false; delete down[c]; } dpadPtr = -1; for (const k in arrows) arrows[k].classList.remove('on'); btns.forEach(b => b.classList.remove('on')); }
  addEventListener('blur', reset); document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  // ----- d-pad: eight sectors around the centre, so a diagonal holds two directions at once -----
  let dpadPtr = -1;
  function dirsAt(e) {
    const r = dpad.getBoundingClientRect(), R = r.width / 2, dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    if (Math.hypot(dx, dy) < 0.2) return {};
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));   // 0 right, 2 down, 4 / -4 left, -2 up
    return { r: Math.abs(a) <= 1, l: Math.abs(a) >= 3, d: a >= 1 && a <= 3, u: a <= -1 && a >= -3 };
  }
  function setDirs(dirs) {
    for (const k in DIR) { const want = !!dirs[k], c = DIR[k]; if (want && !isDown(c)) press(c); else if (!want && isDown(c)) release(c); arrows[k].classList.toggle('on', want); }
  }
  dpad.addEventListener('pointerdown', e => {
    e.preventDefault(); if (dpadPtr >= 0) return; dpadPtr = e.pointerId;
    try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer: no capture */ }
    setDirs(dirsAt(e));
  });
  dpad.addEventListener('pointermove', e => { if (e.pointerId === dpadPtr) setDirs(dirsAt(e)); });
  const dpadUp = e => { if (e.pointerId === dpadPtr) { dpadPtr = -1; setDirs({}); } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(ev, dpadUp);

  // ----- action buttons -----
  btns.forEach((b, i) => {
    const code = BTN[i].code; let ptr = -1;
    b.addEventListener('pointerdown', e => { e.preventDefault(); ptr = e.pointerId; try { b.setPointerCapture(e.pointerId); } catch (err) { } press(code); b.classList.add('on'); });
    const up = e => { if (e.pointerId !== ptr) return; ptr = -1; release(code); b.classList.remove('on'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
  });

  // ----- menu buttons ("pills"): what is useful on the current screen, as large targets. Each one presses the key the keyboard would. -----
  const key = c => { pressed[c] = true; };
  const sound = () => ({ t: muted ? 'SOUND OFF' : 'SOUND ON', f: () => setMuted(!muted) });
  const chooser = () => game.ready[0] ? 1 : 0;   // select: whose fighter the next tap sets (1P: you, then the CPU)
  const selectOk = () => key(game.mode === 2 ? MAP[chooser()].p[0] : 'Enter');
  const selectBack = () => key(game.mode === 2 && (game.ready[0] || game.ready[1]) ? MAP[game.ready[1] ? 1 : 0].k[0] : 'Escape');
  function pillList() {
    const p = game.phase;
    if (p === 'title') return [{ t: '1 PLAYER', f: () => { game.titleSel = 0; key('Enter'); } }, { t: '2 PLAYERS', f: () => { game.titleSel = 1; key('Enter'); } }, sound()];
    if (p === 'select') return [{ t: 'OK', f: selectOk }, { t: 'BACK', f: selectBack }, { t: '< ARENA', f: () => key('KeyQ') }, { t: 'ARENA >', f: () => key('KeyE') }];
    if (p === 'vs') return [{ t: 'SKIP', f: () => key('Enter') }];
    if (p === 'pause') return [{ t: 'RESUME', f: () => key('KeyP') }, sound(), { t: 'QUIT', f: () => key('KeyQ') }];
    if (p === 'over') return [{ t: 'SELECT', f: () => key('Enter') }, { t: 'REMATCH', f: () => key('KeyR') }, { t: 'TITLE', f: () => key('Escape') }];
    return FIGHT.has(p) ? [{ t: 'PAUSE', f: () => key('KeyP') }] : [];
  }
  pills.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.mb'); if (!b || !b._f) return;
    e.preventDefault(); b._f(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 140);
  });

  // ----- taps on the canvas (canvas units): title rows, fighter cells, the arena box, skip the versus screen -----
  const canvasPos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  function menuTap(x, y) {
    const p = game.phase;
    if (p === 'title') { if (y > 425 && y < 459) game.titleSel = 0; else if (y >= 459 && y < 493) game.titleSel = 1; key('Enter'); }
    else if (p === 'vs') key('Enter');
    else if (p === 'select') {
      const i = ROSTER.findIndex((r, n) => { const c = selectCell(n); return x >= c.x - 6 && x <= c.x + c.w + 6 && y >= c.y - 6 && y <= c.y + c.h + 26; });
      if (i >= 0) { const s = chooser(); if (game.sel[s] === i) selectOk(); else { game.sel[s] = i; beep(500 - s * 100, 0.04); } }
      else if (x > 376 && x < 584 && y > 372 && y < 512) key('KeyE');   // the arena picture and its name line
    }
  }
  cv.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); menuTap(...canvasPos(e)); });
  cv.addEventListener('contextmenu', e => e.preventDefault()); pad.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });   // the page never scrolls or zooms
  document.addEventListener('gesturestart', e => e.preventDefault());                     // iOS pinch
  // the first touch turns the pad on (a mouse never does); using the keyboard on a screen without a coarse pointer turns it off again
  addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && !touch.on) { touch.on = true; fit(); } }, true);
  addEventListener('keydown', () => { if (touch.on && !touch.coarse) { touch.on = false; reset(); fit(); } }, true);

  // a label must never spill out of its button: the gutter beside a phone in landscape is only about 68 px wide, and a device without Impact
  // (Android) falls back to a wider font. Start from the size in the CSS and shrink the text until it fits.
  function fitText(e) {
    if (!e.clientWidth) return;   // hidden: nothing to measure yet
    e.style.fontSize = '';
    const cs = getComputedStyle(e), room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1, r = document.createRange();
    r.selectNodeContents(e);
    for (let f = parseFloat(cs.fontSize); f > 9 && r.getBoundingClientRect().width > room; ) { f -= 0.5; e.style.fontSize = f + 'px'; }
  }
  // ----- layout. Portrait: game on top, the menu buttons right under it, the d-pad and buttons in the thumb zone at the bottom.
  // Landscape: the d-pad (left) and buttons (right) float over the playfield between the HUD bands; the menu buttons stack down the right edge. -----
  function layout() {
    const vw = innerWidth, vh = innerHeight, s = lay.s, st = lay.stacked, px = n => Math.round(n) + 'px';
    pad.hidden = !touch.on || game.phase === 'sheet';
    pad.classList.toggle('stk', st); pad.classList.toggle('ovl', !st);
    const place = (e, x, y, w, h) => { e.style.left = px(x); e.style.top = px(y); if (w) e.style.width = px(w); if (h) e.style.height = px(h); };
    const bottom = lay.y + H * s, hudTop = lay.y + 100 * s, hudBot = bottom - 62 * s;   // the HUD occupies canvas y < 100 and y >= 485 at the corners, and the fight tip runs from y 479
    let D, top, pl, pt, pw;
    if (st) { D = Math.max(110, Math.min(200, Math.round(vw * 0.44), vh - bottom - 130)); top = vh - 18 - D; pl = 12; pt = bottom + 12; pw = vw - 24; }
    else {
      D = Math.max(100, Math.min(190, Math.round(vh * 0.46), Math.round(hudBot - hudTop - 12))); top = hudBot - 4 - D;
      const gutter = vw - (lay.x + Math.round(W * s)); pw = Math.max(64, Math.min(110, Math.floor(gutter) - 8)); pl = vw - pw - 6; pt = gutter >= pw + 8 ? 8 : hudTop + 6;
    }
    const left = st ? 12 : 10, right = vw - (st ? 12 : 10) - D, half = D / 2;
    place(dpad, left, top, D, D);
    btns.forEach((b, i) => place(b, right + (i % 2) * half + 3, top + Math.floor(i / 2) * half + 3, half - 6, half - 6));   // SP SU over P K
    place(pills, pl, pt, pw); const pb = pills.getBoundingClientRect().bottom;
    if (shareEl && touch.on) {
      shareEl.classList.toggle('ovl', !st); shareEl.textContent = !st && pw < 100 ? 'SHARE X' : 'SHARE ON X';   // the short label for the narrow gutter beside a phone in landscape
      place(shareEl, st ? (vw - Math.min(vw - 24, 260)) / 2 : pl, pb + 8, st ? Math.min(vw - 24, 260) : pw);
    }
    for (const e of pills.children) fitText(e);
    if (shareEl && touch.on) fitText(shareEl);
    hint.textContent = touch.tip || TURN; hint.classList.toggle('tip', !!touch.tip);   // portrait: the fight tips (controls, sudden-death rules) are real text here
    place(hint, 12, pb + (game.phase === 'over' ? 66 : 12)); hint.hidden = !st || pb + (touch.tip ? 100 : 90) > top;
  }
  let sig = '';
  function sync() {   // every frame: rebuild the buttons only when the screen changed
    const p = game.phase, vis = touch.on && p !== 'sheet', fighting = vis && FIGHT.has(p), list = vis ? pillList() : [];
    const now = vis + '|' + (fighting ? 'f' : p) + '|' + lay.stacked + '|' + list.map(q => q.t).join(',') + '|' + touch.tip;
    if (now === sig) return; sig = now;
    if (!fighting) reset();
    dpad.hidden = !fighting; btns.forEach(b => { b.hidden = !fighting; });
    pills.textContent = ''; for (const q of list) mk('div', 'mb', pills, q.t)._f = q.f;
    layout();
  }
  touch.layout = layout; touch.sync = sync; touch.ready = true;
})();

// ---------- roster (move sets live in moves.js) ----------
// handle: X account (without @) tagged in the end-screen share post; left empty until the owner fills it in.
// tag: the one-line affiliation shown on the select and versus screens. It names only the real organisation a character is a parody of
// (Tibo: Codex at OpenAI, Dot: OpenAI's dots, Alexandr Wang: Meta, Muse: Meta's agent); Poteto gets a gag title, never a claim about anyone.
// bio: one line about the look and the moves (kept in step with INFO in tools/export-pets.mjs).
const ROSTER = [
  { id: 'tibo', name: 'TIBO', tag: 'CODEX @ OPENAI', col: '#7cc7ff', spd: 3.2, pow: 1.0, hp: 100, handle: '', bio: 'HOODIE, COMMITS AND REVERTS. SHIPS FAST.' },
  { id: 'poteto', name: 'POTETO', tag: 'SPUD SLINGER', col: '#f6c544', spd: 3.4, pow: 0.95, hp: 100, handle: '', bio: 'LONG HAIR, ROUND GLASSES. THROWS HOT SWEET POTATOES.' },
  { id: 'dot', name: 'DOT', tag: "OPENAI'S DOTS", col: '#f8f6f1', spd: 3.7, pow: 0.9, hp: 92, handle: '', bio: 'SOFT, ROUND AND SURPRISINGLY FAST. FRAGILE THOUGH.' },
  { id: 'wang', name: 'ALEXANDR WANG', tag: 'AI @ META', col: '#b98cff', spd: 3.1, pow: 1.05, hp: 100, handle: '', bio: 'CALM. IRIDESCENT BUBBLES. SUMMONS THE LAB.' },
  { id: 'muse', name: 'MUSE', tag: "META'S AGENT", col: '#f2a9ab', spd: 3.3, pow: 0.95, hp: 100, handle: '', bio: 'FLUFFY AND QUICK. PINGS, UNDOES AND SWARMS.' },
];
const SHORT = r => r.id === 'wang' ? 'WANG' : r.name;

// ---------- share on X (end screen): T key or the button over the canvas ----------
// The post text is the match result and nothing else; the game link goes in the separate url= parameter, so the link is never part of the text.
// Both the button (an anchor with target=_blank) and the T key (window.open) land on https://x.com/intent/post in a new tab.
const GAME_URL = 'https://clagradi.github.io/codex-brawl/';
const named = r => SHORT(r) + (r.handle ? ' (@' + r.handle.replace(/^@/, '') + ')' : '');
function shareText() {
  const [a, b] = game.f; if (!a) return 'Agent Brawl: a parody fighter starring AI agents.';
  const w = game.wins[0] >= 2 ? a : b, l = w === a ? b : a, score = game.wins[w.side] + '-' + game.wins[l.side];
  const fin = game.fin ? ', finished with ' + game.fin.name : '';
  if (game.mode === 1 && w.cpu) return named(w.d) + ' destroyed my ' + named(l.d) + ' ' + score + fin + ' in Agent Brawl.';
  if (game.mode === 1) return 'I beat ' + named(l.d) + ' with ' + named(w.d) + ' ' + score + fin + ' in Agent Brawl.';
  return named(w.d) + ' beat ' + named(l.d) + ' ' + score + fin + ' in Agent Brawl.';
}
const shareUrl = () => 'https://x.com/intent/post?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(GAME_URL);
function share() { try { window.open(shareUrl(), '_blank', 'noopener'); } catch (e) { /* popup blocked: the button still works */ } }
// move-list rows for the select and pause screens (max 10), labelled with that player's keys; 1P also shows the Z X C V alternates.
// The CPU, and P1 on a touch screen, show the on-screen button names (P K SP SU) instead of keys.
// Input syntax (hud.js drawMoveList): '+' joins keys held together, '>' is a sequence of taps, '/' lists alternate keys.
function moveRows(id, side, cpu) {
  const btn = cpu || (touch.on && side === 0), M = MOVES[id], L = btn ? { s: 'SP', x: 'SU', p: 'P', k: 'K' } : LABEL[side], dual = side === 0 && !btn && game.mode === 1;
  const key = (a, both) => L[a] + (dual && both ? ' / ' + ALTL[a] : '');
  const lbl = inp => inp.replace('L', key('s', true)).replace('FWD+', 'FWD + ').replace('DOWN+', 'DOWN + ');
  const rows = [
    { input: [L.p, L.p, L.p].join('>'), name: 'LAUNCHER' }, { input: [L.p, L.p, L.k].join('>'), name: 'TRIP KICK' },
    { input: 'FWD + ' + key('p', true), name: 'THROW' }, { input: 'DOWN + ' + key('k', true), name: 'SWEEP' },
  ];
  for (const m of M.sp) rows.push({ input: lbl(m.input), name: m.name });
  rows.push({ input: 'UP + ' + key('s', true), name: M.air.name });
  rows.push({ input: key('x', true), name: M.su.name, col: '#ffd23f' });
  rows.push({ input: key('x', true), name: M.fin.name, col: '#ff6b5c' });
  return rows;
}

// ---------- normal attacks ----------
// row: sheet row shown, st: fighter state while it runs, len: total ticks, hit: tick the hitbox fires, frames: ticks spent on each sheet frame (sum = len),
// box: [x0, x1, y0, y1] in front of the fighter, chain: attack that follows on contact (p / k), launch / knock: hit effects, tag: popup, air: jump-only
const ATK = {
  punch: { row: 'punch', st: 'punch', len: 14, hit: 6, frames: [3, 3, 3, 3, 2], box: [8, 70, -150, -30], dmg: 5, kb: 3, stun: 14, chain: { p: 'punch2', k: 'kick' } },
  punch2: { row: 'punch', st: 'punch', len: 14, hit: 5, frames: [2, 3, 3, 3, 3], box: [8, 74, -145, -35], dmg: 5, kb: 3, stun: 15, chain: { p: 'punch3', k: 'kickf' } },
  punch3: { row: 'kick', st: 'punch', len: 24, hit: 8, frames: [3, 5, 5, 5, 6], box: [8, 78, -175, -35], dmg: 8, kb: 3.5, stun: 26, kind: 'kick', launch: true, tag: 'LAUNCH' },
  kickf: { row: 'kick', st: 'kick', len: 26, hit: 9, frames: [4, 5, 6, 6, 5], box: [10, 102, -55, 0], dmg: 8, kb: 5, stun: 20, kind: 'kick', knock: true, tag: 'SWEEP' },
  kick: { row: 'kick', st: 'kick', len: 22, hit: 9, frames: [4, 5, 5, 4, 4], box: [10, 84, -120, -5], dmg: 8, kb: 7, stun: 20 },
  low: { row: 'punch', st: 'punch', len: 13, hit: 5, frames: [3, 3, 2, 3, 2], box: [8, 66, -70, 0], dmg: 4, kb: 2, stun: 13, chain: { k: 'sweep' } },
  sweep: { row: 'kick', st: 'kick', len: 28, hit: 10, frames: [4, 5, 6, 7, 6], box: [10, 100, -50, 0], dmg: 7, kb: 5, stun: 20, kind: 'kick', knock: true, tag: 'SWEEP' },
  airp: { row: 'punch', st: 'punch', len: 18, hit: 4, frames: [3, 3, 4, 4, 4], box: [8, 68, -140, -10], dmg: 5, kb: 4, stun: 15, air: true },
  airk: { row: 'kick', st: 'kick', len: 22, hit: 6, frames: [3, 4, 5, 5, 5], box: [6, 82, -110, 28], dmg: 8, kb: 6, stun: 20, air: true },
};
function frameFromTimeline(frames, st) { let acc = 0; for (let i = 0; i < frames.length; i++) { acc += frames[i]; if (st < acc) return i; } return frames.length - 1; }
const BUSY = ['punch', 'kick', 'special', 'super', 'hurt', 'ko', 'win', 'dizzy', 'down', 'grabbed', 'throw'];
const THROWABLE = ['idle', 'walk', 'block', 'punch', 'kick', 'dash'];
const DASH_LEN = 14, TAP_WIN = 14, THROW_REACH = 70, THROW_T = 24, DOWN_LIE = 28;

// ---------- fighter ----------
class Fighter {
  constructor(def, side, cpu) { this.d = def; this.side = side; this.cpu = cpu; this.reset(); }
  reset() {
    this.x = this.side ? W * 0.68 : W * 0.32; this.y = GROUND; this.vx = 0; this.vy = 0; this.face = this.side ? -1 : 1;
    this.hp = this.d.hp; this.meter = 0; this.state = 'idle'; this.st = 0; this.t = 0; this.hitDone = false; this.stun = 0; this.cool = 0; this.inv = 0; this.shield = 0; this.land = 0; this.combo = 0;
    this.mv = null; this.back = false; this.hidden = false; this.lastP = -99; this.lastK = -99; this.dmgTaken = 0;
    this.atk = null; this.air = false; this.airSp = false; this.contact = false; this.bufP = this.bufK = this.bufS = 0;   // current attack key, jump attack flag, hit-confirm, input buffers
    this.tapT = { l: -99, r: -99 }; this.prevDir = { l: false, r: false }; this.dashCool = 0; this.dashBack = false; this.dashV = 0; this.lie = 0; this.grabber = null; this.thr = null;
    this.ai = { t: 0, act: null, lastX: this.x, stuck: 0, mv: -1, fin: null };
  }
  get onGround() { return this.y >= GROUND; }
  busy() { return BUSY.includes(this.state); }
  curAtk() { return this.state === 'punch' || this.state === 'kick' ? ATK[this.atk || this.state] : null; }
  // a normal that connected can be cancelled for ~9 ticks: into the next chain step, a special or the super
  get cancelOpen() { const A = this.curAtk(); return !!A && this.contact && !A.air && this.st >= A.hit && this.st <= A.hit + 9; }
  set(s) {
    this.state = s; this.st = 0; this.hitDone = false; this.atk = null; this.air = false; this.contact = false; if (s !== 'special' && s !== 'super') this.mv = null;
    if (s === 'hurt' || s === 'down' || s === 'grabbed' || s === 'ko' || s === 'dizzy') { this.bufP = this.bufK = this.bufS = 0; this.lie = 0; }
  }
  startAtk(key) { const A = ATK[key]; this.set(A.st); this.atk = key; this.air = !!A.air; if (A.st === 'kick') beep(220, 0.06); else beep(300, 0.05); }
  input() { if (this.cpu) return this.aiInput(); const s = this.side, i = {}; for (const a of ['l', 'r', 'u', 'd']) i[a] = held(s, a); for (const a of ['p', 'k', 's', 'x']) i[a] = hit(s, a); return i; }
  // ---- CPU brain: picks an intent every few ticks, reacts to threats, chains after a landed hit, never camps in a corner ----
  aiInput() {
    const o = game.f[1 - this.side], a = this.ai, i = {}, M = MOVES[this.d.id];
    const dx = o.x - this.x, dist = Math.abs(dx), lvl = game.cpuLevel;
    const toward = dx > 0 ? 'r' : 'l', away = dx > 0 ? 'l' : 'r';
    if (game.phase === 'finish') { // winner of the match: usually performs its finisher
      if (game.phaseT > 45 && !a.fin) a.fin = Math.random() < 0.75 ? 'fin' : 'hit';
      if (a.fin === 'fin') i.x = true; else if (a.fin === 'hit') { if (dist > 80) i[toward] = true; else if (!this.busy()) i.p = true; }
      return i;
    }
    if (this.state === 'grabbed') { if (this.st <= 5 && Math.random() < 0.04 + lvl * 0.07) i.p = true; return i; }   // sometimes techs a throw
    const threat = ATTACKS.has(o.state) && dist < 170 && o.st < 10;
    const incoming = game.proj.find(p => p.owner !== this && p.t >= 0 && Math.sign(p.vx) === Math.sign(this.x - p.x) && Math.abs(p.x - this.x) < 230 && Math.abs(p.x - this.x) > 40);
    const atWall = this.x < 70 || this.x > W - 70;
    const inRange = k => { const m = M.sp[k], r = m && (m.ai || { min: 0, max: 999 }); return !!m && dist >= r.min && dist <= r.max; };
    const pick = () => { const ok = [0, 1, 2].filter(inRange); return ok.length && this.cool <= 0 ? ok[Math.floor(Math.random() * ok.length)] : -1; };
    const A = this.curAtk();
    if (A && this.contact && this.st === A.hit && !A.air) { // input() runs before st++, so st is still the hit tick; a hit landed: sometimes cancel into a special, sometimes keep the chain going
      const r = Math.random(), sp = pick();
      if (sp >= 0 && r < 0.1 + lvl * 0.25) { i.s = true; i.mv = sp; } else if (A.chain && r < 0.65 + lvl * 0.3) { if (A.chain.p && (!A.chain.k || Math.random() < 0.6)) i.p = true; else i.k = true; }
      return i;
    }
    a.t--;
    if (Math.abs(this.x - a.lastX) < 0.5 && dist < 130) a.stuck++; else a.stuck = 0; a.lastX = this.x;
    if (a.t <= 0 || (threat && Math.random() < 0.2 + lvl * 0.25) || (incoming && Math.random() < 0.3)) {
      a.t = 8 + Math.random() * (22 - lvl * 6); const r = Math.random(), k = pick(); a.mv = k;
      const pressed = this.state === 'block' && this.st > 12 && dist < 130 && !atWall && this.dashCool <= 0;   // been guarding a while: hop out
      if (this.meter >= 100 && Math.random() < 0.35 + lvl * 0.3 && dist < 420) a.act = 'super';
      else if (!o.onGround && dist < 220 && this.cool <= 0 && inRange(2) && r < 0.25 + lvl * 0.4) { a.act = 'special'; a.mv = 2; }
      else if (pressed && r < 0.4 + lvl * 0.2) a.act = 'backdash';
      else if (threat) a.act = r < 0.4 + lvl * 0.15 ? 'block' : r < 0.55 + lvl * 0.1 && dist < 130 && !atWall && this.dashCool <= 0 ? 'backdash' : r < 0.8 ? 'jump' : 'punch';
      else if (incoming) a.act = r < 0.45 ? 'jump' : 'block';
      else if (a.stuck > 40 || (atWall && dist < 120 && r < 0.5)) a.act = r < 0.5 ? 'jumpover' : 'kick';
      else if (dist <= 70 && o.onGround && (o.state === 'block' || r < 0.12) && Math.random() < 0.5 + lvl * 0.2) a.act = 'throw';   // guards get thrown
      else if (dist > 340) a.act = r < 0.3 && k >= 0 ? 'special' : r < 0.5 ? 'dashin' : r < 0.9 ? 'approach' : 'jumpfwd';
      else if (dist > 140) a.act = r < 0.25 && k >= 0 ? 'special' : r < 0.38 ? 'dashin' : r < 0.78 ? 'approach' : r < 0.9 ? 'jumpfwd' : 'retreat';
      else if (r < 0.26) a.act = 'punch';
      else if (r < 0.42) a.act = 'kick';
      else if (r < 0.52) a.act = dist > 50 && dist < 110 ? 'sweep' : 'kick';
      else if (r < 0.58) a.act = dist <= 70 && o.onGround ? 'throw' : 'punch';
      else if (r < 0.63) a.act = 'low';
      else if (r < 0.73) a.act = k >= 0 ? 'special' : 'punch';
      else a.act = r < 0.81 ? 'block' : r < 0.9 ? 'retreat' : 'wait';
    }
    switch (a.act) {
      case 'approach': i[toward] = true; break;
      case 'retreat': if (!atWall) i[away] = true; else a.act = 'jumpover'; break;
      case 'block': i.d = true; break;
      case 'jump': i.u = true; a.act = 'wait'; break;
      case 'jumpfwd': i.u = true; i[toward] = true; if (!this.onGround) a.act = 'airfwd'; break;
      case 'airfwd': i[toward] = true; if (this.onGround) a.act = 'approach'; else if (dist < 120 && o.onGround) { if (Math.random() < 0.18 + lvl * 0.12) i.k = true; } else if (dist > 150 && inRange(0) && this.cool <= 0 && Math.random() < 0.012 + lvl * 0.012) i.s = true; break;
      case 'jumpover': i.u = true; i[toward] = true; if (!this.onGround) a.act = 'airover'; break;
      case 'airover': i[toward] = true; if (this.onGround) { a.act = 'wait'; a.stuck = 0; } break;
      case 'punch': i.p = true; a.act = 'wait'; break;
      case 'kick': i.k = true; a.act = 'wait'; break;
      case 'sweep': i.d = true; i.k = true; a.act = 'wait'; break;
      case 'low': i.d = true; i.p = true; a.act = 'wait'; break;
      case 'throw': i[toward] = true; i.p = true; a.act = 'wait'; break;
      case 'backdash': i.dash = away === 'r' ? 1 : -1; a.act = 'wait'; break;
      case 'dashin': i.dash = toward === 'r' ? 1 : -1; a.act = 'approach'; break;
      case 'special': if (this.cool <= 0 && a.mv >= 0) { i.s = true; i.mv = a.mv; } a.act = 'wait'; break;
      case 'super': i.x = true; a.act = 'wait'; break;
    }
    return i;
  }
  // an attack is coming: holding back turns into a guard
  threatened(o) {
    if (ATTACKS.has(o.state) && Math.abs(o.x - this.x) < 240) return true;
    return game.proj.some(p => p.owner === o && p.t >= 0 && Math.abs(p.x - this.x) < 220);
  }
  startMove(mv, kind, o) {
    if (!mv) return;
    this.set(kind); this.mv = mv; this.airSp = !this.onGround;   // airSp: moves.js bends special 1 into a dive shot
    if (kind === 'super') { this.meter = 0; game.flash = 8; game.hitstop = 10; game.dark = 50; banner(mv.name, { style: 'gold', life: 80, size: 64, y: 150 }); beep(880, 0.4, 'sawtooth', 0.07); }
    else beep(520, 0.06, 'triangle');
    if (mv.start) mv.start(this, o);
  }
  // on contact a normal cancels into the next chain step or a special; presses were buffered, so mashing works. The super cancel lives in update().
  tryCancel(o, i, A, fwd) {
    if (!this.cancelOpen) return false;
    if (this.bufS > 0 && this.cool <= 0 && this.onGround) {
      this.bufS = this.bufP = this.bufK = 0; game.hitstop = Math.max(game.hitstop, 3); game.popups.push({ x: this.x, y: this.y - 240, t: 36, txt: 'CANCEL' });
      this.startMove(MOVES[this.d.id].sp[i.mv ?? (i.d ? 2 : fwd ? 1 : 0)], 'special', o); return true;
    }
    const c = A.chain || {}, nx = this.bufP > 0 && c.p ? c.p : this.bufK > 0 && c.k ? c.k : null;
    if (nx) { this.bufP = this.bufK = 0; this.startAtk(nx); return true; }
    return false;
  }
  canThrow(o) { return this.onGround && o.onGround && !o.hidden && o.inv <= 0 && Math.abs(o.x - this.x) <= THROW_REACH && THROWABLE.includes(o.state); }
  startThrow(o) {
    this.set('throw'); this.thr = o; this.vx = 0; o.set('grabbed'); o.grabber = this; o.vx = o.vy = 0; o.face = -this.face; o.y = GROUND;
    beep(200, 0.1, 'sawtooth', 0.05); game.popups.push({ x: this.x, y: this.y - 215, t: 40, txt: 'THROW' });
  }
  runThrow() {
    const v = this.thr, f = this.face;
    if (v && (v.state !== 'grabbed' || v.grabber !== this)) { this.thr = null; this.set('idle'); this.cool = Math.max(this.cool, 8); return; }   // teched or broken
    if (v) {
      const u = Math.min(1, this.st / THROW_T); v.x = Math.max(46, Math.min(W - 46, this.x + f * (-9 + 51 * Math.cos(Math.PI * u)))); v.y = GROUND - 92 * Math.sin(Math.PI * u);   // lifted over the shoulder (engine: kept inside the arena when the thrower stands at the wall)
      if (this.st === THROW_T) { // release: lands behind, knocked down
        v.grabber = null; v.inv = 0; v.x = Math.max(46, Math.min(W - 46, this.x - f * 62)); v.y = GROUND - 20; this.thr = null; FX.dust(v.x, GROUND);
        v.takeHit(this, 12 * this.d.pow, 4, 0, 'kick', { knock: true, unblock: true, force: true }); if (v.state === 'grabbed') v.set('idle');
      }
    }
    if (this.st >= THROW_T + 8) { this.set('idle'); this.cool = Math.max(this.cool, 6); }
  }
  runGrabbed(i) {
    const g = this.grabber; this.inv = Math.max(this.inv, 2);
    if (!g || g.state !== 'throw' || g.thr !== this) { this.set('idle'); return; }
    if (this.st <= 6 && i.p) { // throw tech: both pushed apart, no damage
      i.p = false; this.bufP = 0; g.thr = null; g.set('idle'); g.cool = 10; g.vx = -g.face * 6; this.set('idle'); this.grabber = null; this.inv = 0; this.y = GROUND; this.vx = this.face * 6;
      game.hitstop = Math.max(game.hitstop, 5); FX.sparks((this.x + g.x) / 2, this.y - 100, '#ffffff', 10); beep(700, 0.08, 'square', 0.05); game.popups.push({ x: this.x, y: this.y - 215, t: 40, txt: 'TECH' });
    }
  }
  // pick an action for this tick: air specials and attacks, throw, specials, crouch attacks, normals (buffered presses count)
  act(o, i, fwd) {
    if (this.state === 'jump' && this.st <= 3) return;   // jump squat
    const M = MOVES[this.d.id], P = i.p || this.bufP > 0, K = i.k || this.bufK > 0, S = i.s || this.bufS > 0;
    if (!this.onGround) {
      if (S && this.cool <= 0 && this.y < GROUND - 24) { this.bufS = 0; this.startMove(M.sp[0], 'special', o); }
      else if (K) { this.bufK = this.bufP = 0; this.startAtk('airk'); }
      else if (P) { this.bufP = this.bufK = 0; this.startAtk('airp'); }
      return;
    }
    if (S && this.cool <= 0) { this.bufS = 0; this.startMove(M.sp[i.mv ?? (i.d ? 2 : fwd ? 1 : 0)], 'special', o); }
    else if (i.p && fwd && game.phase === 'fight' && this.canThrow(o)) { this.bufP = 0; this.startThrow(o); }
    else if (P) { this.bufP = 0; this.startAtk(i.d ? 'low' : 'punch'); }
    else if (K) { this.bufK = 0; this.startAtk(i.d ? 'sweep' : 'kick'); }
  }
  update(o) {
    this.t++; if (this.cool > 0) this.cool--; if (this.inv > 0) this.inv--; if (this.shield > 0) this.shield--; if (this.land > 0) this.land--; if (this.dashCool > 0) this.dashCool--;
    const active = game.phase === 'fight' || (game.phase === 'finish' && this === game.winner);
    const i = active ? this.input() : {};
    this.st++;
    const fwd = this.face > 0 ? i.r : i.l, bk = this.face > 0 ? i.l && !i.r : i.r && !i.l;
    this.back = !!bk;
    if (i.p) this.lastP = this.t; if (i.k) this.lastK = this.t;
    // input buffer: a press is remembered for 10 ticks (8 for specials) until an action uses it
    this.bufP = i.p ? 10 : Math.max(0, this.bufP - 1); this.bufK = i.k ? 10 : Math.max(0, this.bufK - 1); this.bufS = i.s ? 8 : Math.max(0, this.bufS - 1);
    if (!active) this.bufP = this.bufK = this.bufS = 0;   // engine: nobody holds the controls in the KO, the finisher or the outro; a press buffered before it (frozen through the finisher) used to fire a move afterwards
    // dash: a second fresh press of the same direction within 14 ticks (the CPU asks for it with i.dash)
    let dash = i.dash || 0;
    for (const d of ['l', 'r']) { const now = !!i[d], was = this.prevDir[d]; this.prevDir[d] = now; if (now && !was && !this.cpu) { if (this.t - this.tapT[d] <= TAP_WIN) { dash = d === 'r' ? 1 : -1; this.tapT[d] = -99; } else this.tapT[d] = this.t; } }
    // P+K together is the super, except mid-chain where a quick K after the second punch is the trip kick
    const wantSuper = i.x || ((i.p || i.k) && Math.abs(this.lastP - this.lastK) <= 4 && !(this.state === 'punch' && this.atk !== 'punch'));
    if (wantSuper && this.onGround && (!this.busy() || ((this.state === 'punch' || this.state === 'kick') && (this.st <= 5 || this.cancelOpen)))) {
      if (game.phase === 'finish') { startFinisher(this, o); return; }
      if (this.meter >= 100) { this.startMove(MOVES[this.d.id].su, 'super', o); i.p = i.k = i.s = false; this.bufP = this.bufK = this.bufS = 0; }
    }
    if (!this.busy() && this.state !== 'block') this.face = o.x > this.x ? 1 : -1;
    if (this.state === 'grabbed') { this.runGrabbed(i); if (this.state === 'grabbed') { this.vx = this.vy = 0; return; } }
    if (this.state === 'hurt') { if (this.st > this.stun && (this.onGround || this.st > this.stun + 30)) this.set('idle'); }
    else if (this.state === 'dizzy') { /* stands there until the finisher, a last hit or the window closes */ }
    else if (this.state === 'down') { this.inv = Math.max(this.inv, 2); if (this.onGround && ++this.lie >= DOWN_LIE && this.st >= 36) { this.set('idle'); this.inv = 14; this.land = 0; } }   // knocked down: untouchable, gets up after ~40 ticks
    else if (this.state === 'throw') this.runThrow();
    else if (this.busy()) {
      const A = this.curAtk(), mv = this.mv;
      if (A && !mv && this.tryCancel(o, i, A, fwd)) { /* a chain step or special took over this tick */ }
      else if (mv) {
        if (mv.update) mv.update(this, o, this.st);
        if (this.st === Math.max(1, mv.hit)) mv.fire(this, o);
        if (this.st >= mv.len && this.mv === mv) { this.cool = mv.cool ?? 40; this.set('idle'); }
      } else if (A) { if (this.st === A.hit && !this.hitDone) this.doHit(o, A); if (this.st >= A.len) this.set('idle'); }
      else if (this.state === 'special' || this.state === 'super') { if (this.st >= 40) this.set('idle'); }
    } else {
      let mv = 0; if (i.l) mv -= 1; if (i.r) mv += 1;
      if (this.state === 'jump' && this.st === 3 && this.onGround) { this.vy = JUMP_V; beep(500, 0.08, 'triangle'); }  // jump squat
      if (dash && this.onGround && this.dashCool <= 0 && (this.state === 'idle' || this.state === 'walk' || this.state === 'block')) { // forward dash runs in, backdash hops out with 6 i-frames
        this.dashBack = dash !== this.face; this.set('dash'); this.dashV = dash * this.d.spd * (this.dashBack ? 2.3 : 2.5); this.dashCool = this.dashBack ? 26 : 8;
        if (this.dashBack) this.inv = Math.max(this.inv, 6); FX.dust(this.x, GROUND); beep(this.dashBack ? 180 : 260, 0.07, 'triangle', 0.04);
      }
      const guard = i.d || (bk && this.threatened(o));
      if (this.state === 'dash') { this.vx = this.dashV * (1 - this.st / (DASH_LEN * 1.6)); if (this.st >= DASH_LEN) this.set('idle'); }
      else if (guard && this.onGround && this.state !== 'jump') { if (this.state !== 'block') this.set('block'); this.vx = 0; }
      else {
        if (this.state === 'block') this.set('idle');
        this.vx = mv * this.d.spd * (this.onGround ? 1 : 0.85) * (bk ? 0.85 : 1);
        if (i.u && this.onGround && this.state !== 'jump') this.set('jump');
        if (this.onGround && this.state !== 'jump') this.state = mv ? 'walk' : 'idle';
        else if (!this.onGround) this.state = 'jump';
      }
      if (this.state !== 'dash' || this.st >= 7) this.act(o, i, fwd);   // a dash can be cancelled into an attack after 7 ticks
    }
    // physics
    if (['punch', 'kick', 'special', 'super', 'ko', 'win', 'block', 'dizzy', 'down'].includes(this.state) && this.onGround) this.vx *= this.mv ? (this.mv.friction ?? 0.7) : 0.7;
    if (this.state === 'hurt' && this.onGround) this.vx *= 0.86;
    if (this.airSp && this.state === 'special' && !this.onGround) { this.vy *= 0.5; this.vx *= 0.92; }   // air special: hang for a moment
    this.x += this.vx; this.vy += GRAV; this.y += this.vy;
    if (this.y > GROUND) {
      const wasAir = this.vy > 4; this.y = GROUND; this.vy = 0;
      if (wasAir) { this.land = 4; FX.dust(this.x, GROUND); if (this.state === 'jump') this.state = 'idle'; if (this.state === 'ko' || this.state === 'down') { game.shake = Math.max(game.shake, this.state === 'ko' ? 6 : 4); thud(0.15, 0.12); } }
      if (this.air && (this.state === 'punch' || this.state === 'kick')) { this.set('idle'); this.land = 5; }   // landing cancels a jump attack
    }
    this.x = Math.max(46, Math.min(W - 46, this.x));
    const ov = 56 - Math.abs(this.x - o.x); // push apart
    if (ov > 0 && Math.abs(this.y - o.y) < 100 && this.state !== 'ko' && o.state !== 'ko' && this.state !== 'grabbed' && o.state !== 'grabbed' && !this.hidden && !o.hidden) {
      // engine: a fighter pinned against the wall used to be shoved up to 28 px out of the arena; it now stays inside and the foe takes the rest of the push
      const s = this.x < o.x ? -1 : 1, nx = Math.max(46, Math.min(W - 46, this.x + s * ov / 2)), moved = (nx - this.x) * s;
      this.x = nx; if (moved < ov / 2 - 0.001) o.x = Math.max(46, Math.min(W - 46, o.x - s * (ov - moved)));
    }
  }
  doHit(o, A) {
    this.hitDone = true;
    const [x0, x1, y0, y1] = A.box; const f = this.face;
    const ax0 = this.x + Math.min(x0 * f, x1 * f), ax1 = this.x + Math.max(x0 * f, x1 * f);
    const bx0 = o.x - 26, bx1 = o.x + 26, by0 = o.y - 150, by1 = o.y;
    // engine: a vanished fighter (Dot mid POP IN) is untargetable for normals too, as it already is for shots, specials and throws
    if (!o.hidden && ax1 > bx0 && ax0 < bx1 && this.y + y1 > by0 && this.y + y0 < by1) { this.contact = true; o.takeHit(this, A.dmg * this.d.pow, A.kb, A.stun, A.kind || (A.st === 'kick' ? 'kick' : 'punch'), A); }
    else if (o.state !== 'ko') beep(140, 0.03, 'triangle', 0.02); // whiff
  }
  // opt: launch (pops the target up), knock (knockdown), unblock (throws), force (ignores i-frames), tag (popup text)
  takeHit(src, dmg, kb, stun, kind = 'hit', opt = {}) {
    if (game.phase === 'finish' && this === game.loser && src !== this) { finishOff(); return; }
    if (this.state === 'ko' || this.state === 'dizzy' || game.phase !== 'fight') return;
    if (!opt.force && (this.inv > 0 || this.state === 'down' || this.state === 'grabbed')) return;
    const facingSrc = (src.x > this.x) === (this.face > 0);
    const guarding = !opt.unblock && (this.state === 'block' || (this.back && this.onGround && !this.busy())) && facingSrc;
    let soft = false;
    if (this.shield > 0) { dmg *= 0.35; kb *= 0.4; soft = true; FX.sparks(this.x, this.y - 90, '#7ef0ff', 8); }
    if (guarding) {
      dmg *= kind === 'super' ? 0.25 : 0.15; kb *= 0.5; if (this.state !== 'block') this.set('block');
      FX.sparks(this.x + this.face * 30, this.y - 100, '#9cf', 8); beep(160, 0.05, 'square', 0.04); game.hitstop = Math.max(game.hitstop, 4);
    } else {
      // a combo continues only while the victim is still reeling (hurt, airborne or down) from the last hit
      const reeling = this.state === 'hurt' || this.state === 'hit' || this.state === 'down' || this.state === 'grabbed' || !this.onGround;
      const dir = this.x < src.x ? -1 : 1, n = src.lastHitT && this.t - src.lastHitT < 70 && reeling ? src.combo : 0;
      dmg *= Math.max(0.6, 1 - 0.06 * Math.max(0, n - 1));   // long combos scale down a little
      if (opt.knock) { this.set('down'); this.vy = -5; } else this.set('hurt');
      this.stun = stun; thud(); beep(120, 0.1, 'sawtooth', 0.06);
      if (!soft) FX.blood(this.x - dir * 8, this.y - 112, dir, Math.min(3, 0.6 + dmg / 8));
      FX.sparks(this.x - dir * 14, this.y - 105, '#fff3b0', kind === 'super' ? 16 : 8);
      game.shake = Math.max(game.shake, kind === 'super' ? 14 : kind === 'kick' ? 8 : 6); game.hitstop = Math.max(game.hitstop, kind === 'super' ? 10 : kind === 'kick' ? 7 : 5);
      this.inv = 6; src.combo = n ? src.combo + 1 : 1; src.lastHitT = this.t;
      if (src.combo >= 2) game.popups.push({ x: src.x, y: src.y - 215, t: 50, txt: src.combo + ' HIT COMBO' });
      if (opt.tag) game.popups.push({ x: this.x, y: this.y - 235, t: 36, txt: opt.tag });
      if (opt.launch) this.vy = -9.5; else if (!this.onGround || kb >= 10) this.vy = Math.min(this.vy, -4);
    }
    this.hp = Math.max(0, this.hp - dmg); this.dmgTaken += dmg; this.vx = (this.x < src.x ? -1 : 1) * kb;
    src.meter = Math.min(100, src.meter + dmg * 1.5); this.meter = Math.min(100, this.meter + dmg * 0.7);
    if (this.hp <= 0) game.koBy(src, this);
  }
  // which sheet row/frame to show right now
  frame() {
    const s = this.state, A = this.curAtk();
    if (s === 'idle' || s === 'walk' || s === 'win' || s === 'block') { if (this.land > 0 && s !== 'block') return ['jump', 0]; return [s, loopFrame(s, this.t)]; }
    if (s === 'dash') return this.dashBack ? ['jump', 0] : ['walk', loopFrame('walk', this.t * 2)];
    if (s === 'dizzy') return ['hit', [0, 1, 0, 2][Math.floor(this.t / 14) % 4]];
    if (s === 'jump') { if (this.st <= 3 && this.onGround) return ['jump', 0]; return ['jump', this.vy < -5 ? 1 : this.vy < 4 ? 2 : 3]; }
    if ((s === 'special' || s === 'super') && this.mv) { const a = this.mv.anim || s; return [a, timedFrame(a, Math.min(0.999, this.st / this.mv.len))]; }
    if (A) return [A.row, frameFromTimeline(A.frames, this.st)];
    if (s === 'throw') return this.thr ? ['punch', 2] : ['punch', 3];
    if (s === 'grabbed') return this.grabber && this.grabber.st > THROW_T * 0.5 ? ['jump', 3] : ['hit', 1];
    if (s === 'down') { const l = this.lie; return ['ko', !this.onGround ? 1 : l < 3 ? 2 : l < 8 ? 3 : l < 22 ? 4 : l < 26 ? 3 : 2]; }
    if (s === 'special' || s === 'super') return [s, timedFrame(s, Math.min(0.999, this.st / 40))];
    if (s === 'hurt' || s === 'hit') return ['hit', Math.min(2, Math.floor(this.st / Math.max(1, this.stun || 20) * 3))];
    if (s === 'ko') return ['ko', this.st < 6 ? 0 : this.st < 16 ? 1 : !this.onGround ? 1 : this.st < 26 ? 2 : this.st < 40 ? 3 : 4];
    return ['idle', 0];
  }
  draw() {
    if (this.hidden) return;
    const [anim, f] = this.frame();
    const airH = GROUND - this.y, sh = Math.max(0.4, 1 - airH / 320);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(this.x, GROUND + 2, 40 * sh, 7 * sh, 0, 0, 7); ctx.fill();
    drawSprite(ctx, this.d.id, anim, f, Math.round(this.x), Math.round(this.y), this.face);
    if (this.state === 'dizzy') for (let k = 0; k < 3; k++) { const a = this.t / 9 + k * 2.1; drawFxMap(ctx, 'star', this.x + Math.cos(a) * 30, this.y - 190 + Math.sin(a) * 7, 1); }
    if (this.shield > 0) {
      const a = 0.35 + 0.25 * Math.sin(this.t / 4); ctx.strokeStyle = 'rgba(126,240,255,' + a + ')'; ctx.lineWidth = 4;
      ctx.strokeRect(this.x - 66, this.y - 200, 132, 204); ctx.fillStyle = 'rgba(126,240,255,0.07)'; ctx.fillRect(this.x - 66, this.y - 200, 132, 204);
      uiText('SECURE VM', this.x, this.y - 222, 16, '#7ef0ff');
    }
  }
}

// ---------- game state ----------
const game = {
  phase: 'title', phaseT: 0, mode: 1, sel: [0, ROSTER.length - 1], ready: [false, false], f: [], proj: [], fx: [], popups: [], round: 1, wins: [0, 0], timer: 99, clock: 0, tick: 0,
  shake: 0, flash: 0, hitstop: 0, slow: 0, dark: 0, banner: null, arena: 0, arenaPick: -1, titleSel: 0, cpuLevel: 0.5, sudden: false, delayed: [],
  cam: { x: 0, zoom: 1 }, winner: null, loser: null, fin: null, finT: 0, flawless: false, endAt: 160,
  later(t, fn) { this.delayed.push({ t, fn }); },
};
function setPhase(p) { game.phase = p; game.phaseT = 0; }
function banner(txt, opts = {}) { const life = opts.life || 90; game.banner = { txt, t: 0, life, opts: Object.assign({ dur: life }, opts) }; }
function startMatch() {
  game.f = [new Fighter(ROSTER[game.sel[0]], 0, false), new Fighter(ROSTER[game.sel[1]], 1, game.mode === 1)];
  game.wins = [0, 0]; game.round = 1; game.sudden = false; game.cpuLevel = 0.45;
  game.arena = game.arenaPick >= 0 ? game.arenaPick : Math.floor(Math.random() * ARENAS.length);
  game.proj = []; game.fx = []; game.popups = []; game.delayed = []; game.banner = null; game.fin = null; FX.clear();
  setPhase('vs'); clearPressed();
}
function startRound() {
  game.f.forEach(f => f.reset()); game.proj = []; game.fx = []; game.popups = []; game.delayed = []; FX.clear();
  game.timer = game.sudden ? 30 : 99; game.clock = 0; game.hitstop = 0; game.slow = 0; game.dark = 0; game.winner = game.loser = game.fin = null; game.cam = { x: 0, zoom: 1 };
  if (game.sudden) game.f.forEach(f => f.hp = Math.ceil(f.d.hp * 0.25));
  if (typeof hudReset === 'function') hudReset();
  setPhase('intro'); banner(game.sudden ? 'SUDDEN DEATH' : 'ROUND ' + game.round, { style: game.sudden ? 'blood' : 'gold', life: INTRO_LEN, sub: game.round === 1 ? ARENAS[game.arena].name : '' });
  say(game.sudden ? 'sudden' : 'round', game.round); clearPressed();
}
// a fighter hit 0 HP: the match-deciding KO opens the FINISH IT window, any other one ends the round
game.koBy = function (w, l) {
  if (game.phase !== 'fight') return;
  game.wins[w.side]++; game.winner = w; game.loser = l; game.flawless = w.dmgTaken === 0;
  game.proj = []; game.dark = 0;
  if (game.wins[w.side] >= 2 && MOVES[w.d.id].fin) {
    setPhase('finish'); l.set('dizzy'); l.hp = 0; l.vx = (l.x < w.x ? -1 : 1) * 5; l.inv = 0;
    if (w.busy()) w.set('idle');
    game.slow = 40; game.hitstop = 14; game.shake = 12; game.flash = 6; thud(0.3, 0.2);
    banner('FINISH IT!', { style: 'blood', life: 150 }); say('finish');
  } else knockOut(w, l);
};
function knockOut(w, l) {
  setPhase('ko'); l.set('ko'); l.vy = -9; l.vx = (l.x < w.x ? -1 : 1) * 7;
  game.slow = 70; game.hitstop = 12; game.shake = 14; game.flash = 8; game.endAt = game.flawless ? 210 : 160;
  banner('K.O.', { style: 'blood', life: 110 }); beep(110, 0.6, 'sawtooth', 0.08); thud(0.3, 0.2);
  FX.blood(l.x, l.y - 110, l.x < w.x ? -1 : 1, 3);
  game.later(50, () => { if (w.state !== 'ko') w.set('win'); });
  if (game.flawless) game.later(95, () => { banner('FLAWLESS', { style: 'gold', life: 100 }); say('flawless'); });
}
function finishOff() { if (game.phase === 'finish') knockOut(game.winner, game.loser); }
function startFinisher(w, l) {
  const fin = MOVES[w.d.id].fin; if (!fin) return finishOff();
  game.fin = fin; game.finT = 0; setPhase('finisher');
  w.set('idle'); w.vx = 0; l.vx = 0; game.proj = []; game.dark = 30;
  banner(fin.name, { style: 'toxic', life: 140 }); say('finisher', fin.name); beep(220, 0.8, 'sawtooth', 0.07, 0.25);
  if (fin.start) fin.start(w, l);
}
function endRoundTime() {
  const [a, b] = game.f; setPhase('ko'); game.endAt = 170;
  const pa = a.hp / a.d.hp, pb = b.hp / b.d.hp; let w = Math.abs(pa - pb) < 0.001 ? -1 : (pa > pb ? 0 : 1);
  if (w < 0 && game.round >= 4) w = a.meter >= b.meter ? 0 : 1;   // sudden death never draws
  banner(w < 0 ? 'DRAW' : 'TIME', { style: 'steel', life: 120 });
  if (w >= 0) { game.wins[w]++; game.winner = game.f[w]; game.loser = game.f[1 - w]; game.f[w].set('win'); game.f[1 - w].set('ko'); game.f[1 - w].vy = -6; }
}
function nextRound() {
  if (game.wins[0] >= 2 || game.wins[1] >= 2) { // match over: winner call, then the end screen
    const w = game.f[game.wins[0] >= 2 ? 0 : 1];
    setPhase('outro'); banner(SHORT(w.d) + ' WINS', { style: 'gold', life: 140 }); say('wins', SHORT(w.d)); return;
  }
  game.round++; game.cpuLevel = Math.min(1, game.cpuLevel + 0.2);
  if (game.round >= 4) game.sudden = true;
  startRound();
}

// ---------- update ----------
function updateCam() {
  const c = game.cam; let tz = 1, tx = 0;
  if (game.f.length === 2 && ['ko', 'finish', 'finisher', 'outro'].includes(game.phase)) {
    const [a, b] = game.f, focus = game.loser || a;
    if (Math.abs(a.x - b.x) < 560 || game.phase !== 'finish') {
      tz = 1.2; const half = W / 2 / tz, mid = game.phase === 'finish' ? (a.x + b.x) / 2 : focus.x;
      tx = Math.max(half, Math.min(W - half, mid)) - W / 2;
    }
  }
  c.zoom += (tz - c.zoom) * 0.07; c.x += (tx - c.x) * 0.07;
}
function update() {
  game.tick++; pollPads();
  if (game.shake > 0) game.shake--; if (game.flash > 0) game.flash--;
  if (game.banner && ++game.banner.t > game.banner.life) game.banner = null;
  if (tap('KeyB') && ['title', 'select', 'pause'].includes(game.phase)) setGore(!FX.gore);
  if (game.phase === 'sheet' || !game.f.length && !['title', 'select'].includes(game.phase)) { if (game.phase !== 'sheet') game.phase = 'title'; return; }
  if (game.phase === 'title') {
    if (tap('KeyW') || tap('ArrowUp') || tap('KeyS') || tap('ArrowDown')) { game.titleSel ^= 1; beep(400, 0.04); }
    if (tap('Enter') || tap('Space') || hit(0, 'p') || tap('Numpad1')) { game.mode = game.titleSel ? 2 : 1; setPhase('select'); game.ready = [false, false]; beep(700, 0.1); say('choose'); clearPressed(); }
    return;
  }
  if (game.phase === 'select') { updateSelect(); return; }
  if (game.phase === 'vs') {
    game.phaseT++;
    const k = rouletteStep(game.phaseT); if (k !== rouletteStep(game.phaseT - 1) && game.phaseT <= VS_LAND) beep(700 + (k % 3) * 90, 0.03, 'square', 0.03);
    if (game.phaseT === VS_LAND) { say('arena', ARENAS[game.arena].name); thud(0.4, 0.2); game.flash = 6; }
    if (game.phaseT >= VS_LEN || (game.phaseT > 30 && (tap('Enter') || hit(0, 'p') || hit(1, 'p')))) startRound();
    return;
  }
  if (game.phase === 'over') {
    if (tap('Enter') || tap('Space') || hit(0, 'p') || hit(1, 'p')) { setPhase('select'); game.ready = [false, false]; say('choose'); }
    if (tap('KeyR') || hit(0, 'x')) startMatch();
    if (tap('Escape')) setPhase('title');
    return;
  }
  if (game.phase === 'pause') { if (tap('KeyP') || tap('Escape') || tap('Enter')) { game.phase = 'fight'; clearPressed(); } if (tap('KeyQ')) setPhase('title'); return; }
  if (game.phase === 'fight' && (tap('KeyP') || tap('Escape'))) { game.phase = 'pause'; return; }
  game.phaseT++;
  if (game.phase === 'intro' && game.phaseT >= INTRO_LEN) { setPhase('fight'); banner('FIGHT!', { style: 'blood', life: 50 }); say('fight'); beep(1000, 0.3, 'square', 0.06); clearPressed(); }
  if (game.phase === 'finish' && game.phaseT >= FINISH_LEN) finishOff();
  if (game.phase === 'ko' && game.phaseT >= game.endAt) nextRound();
  if (game.phase === 'outro' && game.phaseT >= 150) { setPhase('over'); clearPressed(); return; }
  FX.update(); updateCam();
  for (const p of game.popups) { p.t--; p.y -= 1; } game.popups = game.popups.filter(p => p.t > 0);
  if (game.hitstop > 0) { game.hitstop--; return; }   // hit stop: freeze the fighters and projectiles
  if (game.slow > 0 && game.slow-- % 2) return;        // slow motion on knockouts: simulate every other tick
  if (game.dark > 0) game.dark--;
  const [a, b] = game.f;
  if (game.phase === 'finisher') { // the finisher owns both fighters: no physics, no AI
    for (const f of game.f) { f.t++; f.st++; }
    game.finT++; if (game.fin.update) game.fin.update(game.winner, game.loser, game.finT);
    if (game.finT >= game.fin.len) { setPhase('ko'); game.endAt = 100; game.later(20, () => { if (!game.winner.hidden) game.winner.set('win'); }); }
  } else { a.update(b); b.update(a); }
  for (const d of game.delayed) d.t--; for (const d of game.delayed.filter(d => d.t <= 0)) d.fn(); game.delayed = game.delayed.filter(d => d.t > 0);
  if (game.phase === 'fight' && ++game.clock % 60 === 0) { game.timer--; if (game.timer <= 0) endRoundTime(); }
  updateProjectiles();
  for (const fx of game.fx) { fx.t = (fx.t || 0) + 1; if (fx.update) fx.update(fx); }
  game.fx = game.fx.filter(f => f.t < (f.life || 80));
}
// projectiles follow the moves.js contract: own update/draw, or simple built-in motion (grav, grow, wob, home)
function updateProjectiles() {
  // engine: shots exist only while the fight (or the finish window) is on. A move still running at the bell, at a KO or after a finisher used to fire one more shot
  // that then crossed the arena through the whole outro; it is dropped here before it is ever drawn.
  if (game.phase !== 'fight' && game.phase !== 'finish') { game.proj = []; return; }
  for (const p of game.proj) {
    p.t = (p.t || 0) + 1; if (p.t < 0) continue; p.life--;
    const tgt = game.f[1 - p.owner.side];
    if (p.update) p.update(p);
    else {
      if (p.grav) p.vy += p.grav; if (p.grow) p.r += p.grow; if (p.wob) p.y += Math.sin(p.t / 6) * 1.5;
      if (p.home) { const dy = (tgt.y - 90) - p.y, dx = tgt.x - p.x; p.vy += Math.sign(dy) * 0.14; p.vx += Math.sign(dx) * 0.16; p.vx = Math.max(-6.5, Math.min(6.5, p.vx)); p.vy = Math.max(-3.5, Math.min(3.5, p.vy)); }
      p.x += p.vx; p.y += p.vy;
      if (p.grav && p.y > GROUND - 8) { p.life = 0; FX.dust(p.x, GROUND); }
    }
    if (p.life > 0 && !tgt.hidden && Math.abs(p.x - tgt.x) < p.r + 24 && Math.abs(p.y - (tgt.y - 80)) < p.r + 70 && tgt.state !== 'ko' && tgt.state !== 'down' && tgt.state !== 'grabbed' && (game.phase === 'fight' || game.phase === 'finish')) {
      if (!p.hit) { tgt.takeHit(p.owner, p.dmg, p.kb, p.stun, p.super ? 'super' : 'hit'); if (p.super) p.hit = true; else p.life = 0; }
    }
    if (p.x < -200 || p.x > W + 200 || p.y > H + 120) p.life = 0;
  }
  for (const p of game.proj) for (const q of game.proj) if (p !== q && p.owner !== q.owner && p.life > 0 && q.life > 0 && p.t >= 0 && q.t >= 0 && !p.super && !q.super && !p.noClash && !q.noClash && Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) { p.life = 0; q.life = 0; FX.sparks((p.x + q.x) / 2, (p.y + q.y) / 2, '#ff0', 12); beep(900, 0.08, 'square', 0.04); }
  game.proj = game.proj.filter(p => p.life > 0);
}
// select: 3 over 2 portrait grid, arena picker (Q/E or the super button), punch confirms, kick goes back
function updateSelect() {
  const N = ROSTER.length, COLS = 3, ROWS = Math.ceil(N / COLS);
  // Up/down keep the column and wrap by row; a short last row clamps to its last cell instead of jumping across the grid.
  const vert = (c, dir) => { const col = c % COLS, row = (Math.floor(c / COLS) + dir + ROWS) % ROWS; return Math.min(row * COLS + col, N - 1); };
  const nav = (s, side) => { let c = game.sel[s]; if (hit(side, 'l')) c = (c + N - 1) % N; if (hit(side, 'r')) c = (c + 1) % N; if (hit(side, 'u')) c = vert(c, -1); if (hit(side, 'd')) c = vert(c, 1); if (c !== game.sel[s]) beep(500 - s * 100, 0.04); game.sel[s] = c; };
  const A = ARENAS.length + 1;   // -1 = random
  if (tap('KeyE') || hit(0, 'x') || hit(1, 'x')) { game.arenaPick = (game.arenaPick + 2) % A - 1; beep(620, 0.04); }
  if (tap('KeyQ')) { game.arenaPick = (game.arenaPick + A) % A - 1; beep(620, 0.04); }
  if (game.mode === 1) {
    const s = game.ready[0] ? 1 : 0; nav(s, 0);
    if (hit(0, 'p') || tap('Enter')) { game.ready[s] = true; beep(900, 0.12); }
    else if (hit(0, 'k') || tap('Escape')) { if (s === 1) game.ready[0] = false; else setPhase('title'); beep(300, 0.06); }
  } else {
    for (let s = 0; s < 2; s++) { if (game.ready[s]) { if (hit(s, 'k')) { game.ready[s] = false; beep(300, 0.06); } continue; } nav(s, s); if (hit(s, 'p') || (s === 0 && tap('Enter'))) { game.ready[s] = true; beep(900, 0.12); } }
    if (tap('Escape')) { setPhase('title'); game.ready = [false, false]; }
  }
  if (game.ready[0] && game.ready[1]) { game.ready = [false, false]; startMatch(); }
}
// arena roulette: eases out and lands on game.arena at VS_LAND
function rouletteStep(t) { const S = ARENAS.length * 3, p = 1 - Math.pow(1 - Math.min(1, t / VS_LAND), 2.6); return Math.floor(p * S); }
function rouletteArena(t) { const S = ARENAS.length * 3, N = ARENAS.length; return ((game.arena - S + rouletteStep(t)) % N + N) % N; }

// ---------- render ----------
function uiText(s, x, y, size, col = '#fff', align = 'center', alpha = 1) { // small UI text: condensed sans with a dark outline
  ctx.save(); ctx.globalAlpha = alpha; ctx.font = size + 'px Impact, Haettenschweiler, "Arial Narrow", sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.restore();
}
function shade(a) { ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.fillRect(0, 0, W, H); }
function drawTitle() {
  const t = game.tick, ai = Math.floor(t / 480) % ARENAS.length;
  drawArena(ctx, ai, t, { x: Math.sin(t / 260) * 60, zoom: 1 }); shade(0.5);
  drawLogo(ctx, W / 2, 112, 1, t);
  ROSTER.forEach((r, i) => drawSprite(ctx, r.id, 'idle', loopFrame('idle', t + i * 11), W / 2 + (i - (ROSTER.length - 1) / 2) * 170, 410, i < 2 ? 1 : i > 2 ? -1 : 1));
  ['1 PLAYER VS CPU', '2 PLAYERS'].forEach((o, i) => { const on = game.titleSel === i; drawTitleText(ctx, o, W / 2, 442 + i * 34, on ? 28 : 22, { align: 'center', style: on ? 'gold' : 'steel', alpha: on ? 1 : 0.55, glow: on }); });
  const keysHint = game.titleSel ? 'P1 WASD + J K L I · P2 ARROWS + NUM1 NUM2 NUM3 NUM0' : 'WASD + J K L I OR ARROWS + Z X C V';   // the keys for the mode that is highlighted
  uiText(touch.on ? 'TAP 1 PLAYER TO FIGHT · 2 PLAYERS NEEDS A KEYBOARD OR TWO GAMEPADS'
    : 'W/S + ENTER · ' + keysHint + ' · M ' + (muted ? 'UNMUTE' : 'MUTE') + ' · B BLOOD ' + (FX.gore ? 'ON' : 'OFF'), W / 2, 506, 15, '#c9c3b8');
  uiText('UNOFFICIAL FAN PARODY. NOT AFFILIATED WITH OPENAI, META OR XAI.', W / 2, 528, 11, '#7d7668');
  if (!muted && !audioFail && !(AC && AC.state === 'running')) {   // browsers keep a page silent until the first key press / tap
    const s = (touch.on ? 'TAP' : 'PRESS ANY KEY OR TAP') + ' FOR SOUND';
    ctx.save(); ctx.font = '16px Impact, Haettenschweiler, "Arial Narrow", sans-serif'; const w = ctx.measureText(s).width + 30; ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(Math.round(W / 2 - w / 2), 11, Math.round(w), 27);
    uiText(s, W / 2, 25, 16, '#ffd76a', 'center', 0.75 + 0.25 * Math.sin(t / 12));
  }
}
function selectCell(i) {
  const COLS = 3, cw = 96, ch = 112, gap = 12, row = Math.floor(i / COLS), col = i % COLS, rowCount = Math.min(COLS, ROSTER.length - row * COLS);
  const gx = W / 2 - (COLS * cw + (COLS - 1) * gap) / 2 + (COLS - rowCount) * (cw + gap) / 2;
  return { x: gx + col * (cw + gap), y: 78 + row * (ch + 38), w: cw, h: ch };   // 38 px between the rows: the name sits clear of the P1 and P2 cursor boxes
}
function drawSelect() {
  const t = game.tick;
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 30, W / 2, H / 2, 620); g.addColorStop(0, '#3a0d0d'); g.addColorStop(0.6, '#140607'); g.addColorStop(1, '#050304'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,90,40,0.035)'; ctx.fillRect(0, (i * 97 + t * 0.6) % H, W, 30); }
  drawTitleText(ctx, 'CHOOSE YOUR AGENT', W / 2, 38, 38, { align: 'center', style: 'gold', glow: true });
  ROSTER.forEach((r, i) => {
    const c = selectCell(i);
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(c.x, c.y, c.w, c.h); drawPortrait(ctx, r.id, c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 2; ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    uiText(SHORT(r), c.x + c.w / 2, c.y + c.h + 19, 15, '#e8e0cc');
    for (let s = 0; s < 2; s++) if (game.sel[s] === i) {
      const col = s ? '#ff4d4d' : '#4dc3ff', on = game.ready[s] || Math.floor(t / 8) % 2, o = s * 5;
      ctx.strokeStyle = col; ctx.lineWidth = on ? 5 : 3; ctx.strokeRect(c.x - 4 - o, c.y - 4 - o, c.w + 8 + o * 2, c.h + 8 + o * 2);
      uiText(s ? (game.mode === 1 ? 'CPU' : 'P2') : 'P1', c.x + (s ? c.w - 6 : 6), c.y + 10, 13, col, s ? 'right' : 'left');
    }
  });
  for (let s = 0; s < 2; s++) { // side panels: fighter, name, move list
    const r = ROSTER[game.sel[s]], pw = 300, px = s ? W - 12 - pw : 12, cx = px + pw / 2, cpu = s === 1 && game.mode === 1;
    const anim = game.ready[s] ? 'win' : 'idle';
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, 62, pw, 470);
    uiText(s ? (cpu ? 'CPU' : 'P2') : 'P1', cx, 78, 20, s ? '#ff4d4d' : '#4dc3ff');
    drawSprite(ctx, r.id, anim, loopFrame(anim, t), cx, 286, s ? -1 : 1);
    drawTitleText(ctx, SHORT(r), cx, 312, 28, { align: 'center', style: game.ready[s] ? 'gold' : 'steel' });
    uiText(r.tag, cx, 338, 14, r.col);
    drawMoveList(ctx, game.ready[s] ? 'READY' : 'MOVES', moveRows(r.id, s, cpu), px + 6, 352, pw - 12, 174);
  }
  // arena picker
  const ax = W / 2 - 96, ay = 380, aw = 192, ah = 108, pick = game.arenaPick;   // (the touch hit area for the box is in the touch section: keep them in step)
  ctx.fillStyle = '#000'; ctx.fillRect(ax - 3, ay - 3, aw + 6, ah + 6);
  if (pick >= 0) drawArenaThumb(ctx, pick, ax, ay, aw, ah, t);
  else { drawArenaThumb(ctx, Math.floor(t / 20) % ARENAS.length, ax, ay, aw, ah, t); shade(0); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ax, ay, aw, ah); drawTitleText(ctx, '?', W / 2, ay + ah / 2, 54, { align: 'center', style: 'gold' }); }
  ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(ax, ay, aw, 18); uiText('ARENA', W / 2, ay + 9, 13, '#c9a24a');   // the title rides on a strip over the top of the picture, so it never crowds the fighter names above
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; ctx.strokeRect(ax - 1, ay - 1, aw + 2, ah + 2);
  uiText((pick >= 0 ? ARENAS[pick].name : 'RANDOM') + (touch.on ? '   TAP TO CHANGE' : '   ‹ Q / E ›'), W / 2, ay + ah + 14, 15, '#fff');
  // the line at the foot says what to press for the mode on screen (the 1P keyboard flow also takes Enter and the Z X C V keys)
  const hint = touch.on ? (game.ready[0] ? 'NOW TAP THE CPU FIGHTER · TAP AGAIN OR OK TO PICK · BACK UNDOES YOURS' : 'TAP A FIGHTER · TAP AGAIN OR OK TO PICK · BACK GOES TO THE TITLE')
    : game.mode === 1 ? (game.ready[0] ? 'NOW PICK THE CPU · J OR ENTER PICKS · K OR ESC UNDOES YOURS · Q / E ARENA' : 'WASD OR ARROWS MOVE · J OR ENTER PICKS · ESC TITLE · Q / E ARENA')
    : 'P1 WASD + J PICKS, K UNDOES · P2 ARROWS + NUM1 PICKS, NUM2 UNDOES · Q / E ARENA · ESC TITLE';
  uiText(hint + (touch.on ? '' : ' · B BLOOD ' + (FX.gore ? 'ON' : 'OFF')), W / 2, 530, 13, '#9a9384');
}
function drawVs() {
  const t = game.phaseT, [a, b] = game.f, landed = t >= VS_LAND;
  const i = landed ? game.arena : rouletteArena(t), aw = 176, ah = 99, ax = W / 2 - aw / 2, ay = 378;
  drawVersus(ctx, a.d, b.d, t, ARENAS[i].name);   // the strip's arena name spins with the roulette, then lands
  ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 4, aw + 8, ah + 8); drawArenaThumb(ctx, i, ax, ay, aw, ah, game.tick);
  ctx.strokeStyle = landed && t % 16 < 8 ? '#fff' : '#c9a24a'; ctx.lineWidth = 3; ctx.strokeRect(ax - 2, ay - 2, aw + 4, ah + 4);
}
function drawProj(p) {
  if (p.t < 0) return;
  if (p.draw) { p.draw(ctx, p); return; }
  if (p.map) drawFxMap(ctx, p.map, p.x, p.y, p.scale || PX, p.spin ? Math.floor(p.t / 5) % 4 * Math.PI / 2 : 0, p.vx < 0);
}
function drawWorld() {
  const t = game.tick, c = game.cam, AY = GROUND - 60;
  ctx.save();
  if (game.shake) ctx.translate(Math.round((Math.random() - 0.5) * game.shake * 2), Math.round((Math.random() - 0.5) * game.shake * 2));
  ctx.translate(W / 2, AY); ctx.scale(c.zoom, c.zoom); ctx.translate(-(W / 2 + c.x), -AY);
  drawArena(ctx, game.arena, t, c);
  if (game.dark > 0) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.55, game.dark / 50) + ')'; ctx.fillRect(-100, -100, W + 200, H + 200); }
  FX.draw(ctx, 'floor');
  for (const fx of game.fx) if (!fx.front) fx.draw(ctx, fx);
  const rank = f => ATTACKS.has(f.state) || f === game.winner ? 1 : 0; [...game.f].sort((x, y) => rank(x) - rank(y)).forEach(f => f.draw());
  if (game.fin) game.fin.draw(ctx, game.winner, game.loser, game.finT);
  for (const p of game.proj) drawProj(p);
  FX.draw(ctx, 'air');
  for (const fx of game.fx) if (fx.front) fx.draw(ctx, fx);
  drawArenaFront(ctx, game.arena, t, c);
  for (const p of game.popups) drawTitleText(ctx, p.txt, p.x, p.y, 20, { align: 'center', style: 'steel', alpha: Math.min(1, p.t / 15) });
  ctx.restore();
}
// The line at the foot of the playfield, kept clear of the super meters: the finisher prompt, the sudden-death rules, or the controls in round 1.
// On a portrait phone the canvas is too small to read it, so it goes to the text under the game instead (touch.tip, shown by the touch layer).
function fightTip() {
  const [a, b] = game.f, ph = game.phase, early = ph === 'fight' && game.clock < 360, fade = Math.min(1, (360 - game.clock) / 60);
  if (ph === 'finish') {
    const w = game.winner, key = w.cpu ? 'CPU' : touch.on && w.side === 0 ? 'SU' : LABEL[w.side].x;
    return { txt: key + ' FOR THE FINISHER · ANY HIT ENDS IT', y: H - 20, size: 16, col: '#ff6b5c', a: game.tick % 30 < 20 ? 1 : 0.5 };
  }
  if (game.sudden && (ph === 'intro' || early))
    return { txt: 'SUDDEN DEATH · 30 SECONDS · EVERYONE STARTS AT 25% HEALTH · TIME OUT: MORE HEALTH WINS, THEN THE FULLER SUPER METER', y: 486, size: 14, col: '#ffb4a8', a: ph === 'intro' ? 1 : fade };
  if (early && game.round === 1 && !(a.cpu && b.cpu)) {
    const txt = touch.on ? 'P P P COMBO · FWD + P THROW · DOWN + K SWEEP · TAP A DIRECTION TWICE TO DASH · SP SPECIAL · SU SUPER · HOLD BACK TO BLOCK'
      : game.mode === 1 ? 'J J J COMBO · FWD + J THROW · DOWN + K SWEEP · L SPECIAL · TAP FWD TWICE DASH · I SUPER · HOLD BACK TO BLOCK'
      : 'P1 J K L I · P2 NUM1 NUM2 NUM3 NUM0 (PUNCH KICK SPECIAL SUPER) · FWD + PUNCH THROW · DOWN + KICK SWEEP · TAP FWD TWICE DASH';
    return { txt, y: 486, size: 14, col: '#fff', a: fade };
  }
  return null;
}
function drawPause() {
  shade(0.72); drawTitleText(ctx, 'PAUSED', W / 2, 70, 56, { align: 'center', style: 'steel', glow: true });
  for (let s = 0; s < 2; s++) { const f = game.f[s]; drawMoveList(ctx, (f.cpu ? 'CPU · ' : 'P' + (s + 1) + ' · ') + SHORT(f.d), moveRows(f.d.id, s, f.cpu), s ? W / 2 + 10 : 40, 120, W / 2 - 50, 200); }
  const L = [];   // [text, size, colour]: only what applies (the P2 keys in 2P, button names on a touch screen)
  if (touch.on) L.push(['D-PAD MOVES · P PUNCH · K KICK · SP SPECIAL · SU SUPER · HOLD BACK TO BLOCK', 16, '#ddd']);
  else if (game.mode === 1) L.push(['WASD OR ARROWS · J/Z PUNCH · K/X KICK · L/C SPECIAL · I/V SUPER · HOLD BACK TO BLOCK', 16, '#ddd']);
  else L.push(['P1  WASD · J PUNCH · K KICK · L SPECIAL · I SUPER · HOLD BACK TO BLOCK', 16, '#ddd'], ['P2  ARROWS · NUM1 PUNCH · NUM2 KICK · NUM3 SPECIAL · NUM0 SUPER  (OR , . / RIGHT SHIFT)', 16, '#ddd']);
  if (!touch.on) L.push(['GAMEPAD  A PUNCH · B KICK · X SPECIAL · Y OR RB SUPER · START PAUSE', 16, '#ddd']);
  L.push([(touch.on ? 'TAP A DIRECTION TWICE TO DASH' : 'TAP FWD TWICE DASH · TAP BACK TWICE BACKDASH') + ' · JUMP + P/K AIR ATTACK · DOWN + P LOW JAB · PUNCH TECHS A THROW', 14, '#aab']);
  L.push(['NO MATCH WINNER AFTER ROUND 3? SUDDEN DEATH: 30 SECONDS · 25% HEALTH · A TIE GOES TO THE FULLER SUPER METER', 14, '#ffb4a8']);
  let y = 346; for (const [txt, size, col] of L) { uiText(txt, W / 2, y, size, col); y += size + 10; }
  uiText(touch.on ? 'RESUME TO FIGHT ON · QUIT GOES TO THE TITLE' : 'P / ESC / ENTER RESUME · Q QUIT TO TITLE · M ' + (muted ? 'UNMUTE' : 'MUTE') + ' · B BLOOD ' + (FX.gore ? 'ON' : 'OFF'), W / 2, Math.max(470, y + 14), 18, '#c9a24a');
}
function drawFight() {
  drawWorld(); drawHUD(ctx, game);
  if (game.banner) drawBanner(ctx, game.banner.txt, game.banner.t, game.banner.opts);
  if (game.phase === 'fight' && game.round === 1 && game.phaseT < 130 && window.MUSIC && MUSIC.now && MUSIC.now === MUSIC.theme)   // the arena track starts with the fight: show its name for ~2 s
    uiText('\u266a ' + ARENAS[game.arena].name, 22, 98, 14, '#ffd76a', 'left', Math.min(1, game.phaseT / 12, (130 - game.phaseT) / 25));
  const tip = fightTip();
  if (touch.on && lay.stacked) touch.tip = tip ? tip.txt : ''; else if (tip) uiText(tip.txt, W / 2, tip.y, tip.size, tip.col, 'center', tip.a);
  if (muted) uiText('MUTED', W - 14, H - 14, 12, '#99a', 'right');
  if (game.phase === 'pause') drawPause();
}
function drawOver() {
  const t = game.tick, [a, b] = game.f, w = game.wins[0] >= 2 ? a : b, l = w === a ? b : a;
  drawArena(ctx, game.arena, t, { x: Math.sin(t / 200) * 40, zoom: 1 }); shade(0.55);
  drawSprite(ctx, l.d.id, 'ko', 4, W / 2 + 230, GROUND, -1);
  drawSprite(ctx, w.d.id, 'win', loopFrame('win', t), W / 2 - 40, GROUND, 1, 3);
  drawTitleText(ctx, SHORT(w.d) + ' WINS', W / 2, 64, 56, { align: 'center', style: 'gold', glow: true });
  uiText((w.cpu ? 'CPU' : 'P' + (w.side + 1)) + ' TAKES IT ' + game.wins[w.side] + '-' + game.wins[l.side] + (game.fin ? ' · ' + game.fin.name : ''), W / 2, 110, 20, '#fff');
  uiText(touch.on ? 'TAP SELECT, REMATCH OR TITLE · SHARE ON X POSTS THE RESULT' : 'ENTER CHARACTER SELECT · R REMATCH · T SHARE ON X · ESC TITLE', W / 2, H - 18, 16, '#ddd');
}
function drawSheet() { // debug: #sheet=tibo
  ctx.fillStyle = '#3a4370'; ctx.fillRect(0, 0, W, H);
  const id = (location.hash.split('=')[1] || 'tibo').split(',')[0]; const sh = SHEETS[id] || SHEETS.tibo; ctx.imageSmoothingEnabled = false;
  const z = Math.min(W / sh.width, H / sh.height); ctx.drawImage(sh, 0, 0, sh.width * z, sh.height * z);
  ANIMS.forEach((a, r) => uiText(a.n, 4, r * FH * z + 8, 11, '#fff', 'left'));
}
function render() {
  ctx.imageSmoothingEnabled = false;
  const p = game.phase; touch.tip = '';   // drawFight may set the text for under the game (portrait touch layout)
  if (p === 'sheet') drawSheet(); else if (p === 'title') drawTitle(); else if (p === 'select') drawSelect(); else if (p === 'vs') drawVs(); else if (p === 'over') drawOver(); else drawFight();
  if (p !== 'sheet') drawPost(ctx, game.tick, { flash: Math.min(1, game.flash / 10), red: p === 'finish' || p === 'finisher' ? 0.35 : 0 });
  if (shareEl && shareEl.hidden === (p === 'over')) { shareEl.hidden = p !== 'over'; if (p === 'over') shareEl.href = shareUrl(); }   // shown before the touch layer is laid out, so it is sized with the other buttons
  touch.sync();   // the touch layer follows the screen: buttons per phase, hidden on the debug sheet
}

// ---------- main loop: fixed 60 Hz simulation, render once per animation frame ----------
let acc = 0, last = performance.now(), running = true;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  let n = 0; while (acc >= TICK && n < 4) { if (running) update(); acc -= TICK; n++; }
  if (acc >= TICK) acc = 0;
  render(); requestAnimationFrame(frame);
}
// debug / test hooks: #select, #demo=i,j[&ff=N][&arena=K][&stop] (CPU vs CPU), #sheet=id; window.step(n) advances the simulation
window.step = n => { for (let i = 0; i < n; i++) update(); };
window.hold = on => { running = !on; };   // tests freeze the real-time loop so only step() advances the game
(function () {
  const h = location.hash;
  if (h.startsWith('#sheet')) game.phase = 'sheet';
  if (h === '#select') { game.mode = 1; game.phase = 'select'; }
  const ar = h.match(/arena=(\d+)/); if (ar) game.arenaPick = +ar[1] % ARENAS.length;
  const m = h.match(/^#demo=(\d+),(\d+)/); if (m) { game.sel = [+m[1] % ROSTER.length, +m[2] % ROSTER.length]; startMatch(); game.f[0].cpu = true; game.f[1].cpu = true; }
  const ff = h.match(/ff=(\d+)/); if (ff) window.step(+ff[1]);
  if (h.includes('stop')) running = false;
})();
buildSheets();
requestAnimationFrame(frame);
