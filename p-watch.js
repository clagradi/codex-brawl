// ===== AGENT BRAWL feature file: P-WATCH (attract demo and WATCH mode). Loaded after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: the p-watch agent. Only that agent edits this file, tools/tests/x-p-watch.mjs and docs/features/p-watch.md.
// Area: two ways to just watch the CPU fight. (1) The attract demo: after 20 s without any input on the title (SETTINGS watch.idle) a CPU against CPU round plays with live
//   commentary captions and a blinking PRESS START banner; any key, tap, click or a lost window ends it and the title is back. (2) WATCH, a title entry: pick two CPU fighters,
//   an arena and a CPU level, then a whole match plays out by itself with the same captions; on the end screen Enter or R watches again, Esc goes back to the picker.
// Plug in with: MODES.register (watch, order 45, its onPick opens the picker and returns false), HOOKS 'update' (idle counter, picker keys, session flow), HOOKS 'drawTop'
//   (picker, captions, banner), BUS 'match:start' (both fighters become CPU, the chosen level), 'round:start', 'round:end', 'match:end', 'hit', 'block', 'knockdown', 'throw',
//   'special', 'super', 'finisher' (commentary) and 'phase' (a session ends when the title is back). The camera is the engine one (updateCam, wrapped by vfx.js), untouched.
// Settings: watch.attract, watch.idle, watch.captions, watch.level, watch.pick (see docs/ARCHITECTURE.md). Engine data it touches while a session runs: game.modeId 'watch',
//   game.mode 2, game.sel, game.arenaPick, game.cpuLevel (all put back when the session ends).
// Test hook: window.WATCH (screen, state, caption, log, demo, match, guard...) used by tools/tests/x-p-watch.mjs. Notes for players: docs/features/p-watch.md.
'use strict';
(() => {
  window.STUB_P_WATCH = 1;   // marker: the core test style checks that this file loaded.
  const NF = ROSTER.length, NA = ARENAS.length, TPS = 60;
  const GOLD = '#ffd24a', DIM = '#8fa3c9', INK = '#e8f0ff', RED = '#ff8a7a', BLUE = '#7cc7ff', GRN = '#8cf0a0', PANEL = '#0b1226', EDGE = '#2f3f73';
  const LEVELS = ['easy', 'normal', 'hard', 'nightmare'], LV = { easy: 0.2, normal: 0.45, hard: 0.7, nightmare: 0.95 };   // game.cpuLevel per level name (the same anchors as cpu2.js)
  const DEMO_LEVEL = 'hard', DEMO_MAX = 4200, DEMO_KO_HOLD = 90;   // the demo is lively, lasts one round at most and leaves 90 ticks after the KO (nextRound is at 100 or later)
  const mod = (n, m) => ((n % m) + m) % m;
  const nameOf = f => SHORT(f.d);

  // ---------------------------------------------------------------- settings (cached, the BUS 'settings' event keeps the cache current)
  SETTINGS.define('watch.attract', { def: true, label: 'ATTRACT DEMO' });
  SETTINGS.define('watch.idle', { def: 20, min: 5, max: 120, step: 1, label: 'ATTRACT DELAY' });
  SETTINGS.define('watch.captions', { def: true, label: 'COMMENTARY CAPTIONS' });
  SETTINGS.define('watch.level', { def: 'normal', values: LEVELS, label: 'WATCH CPU LEVEL' });
  SETTINGS.define('watch.pick', { def: {}, label: 'WATCH PICKS' });
  const cfg = { attract: true, idle: 20 * TPS, captions: true };
  const readCfg = () => { cfg.attract = !!SETTINGS.get('watch.attract'); cfg.idle = SETTINGS.get('watch.idle') * TPS; cfg.captions = !!SETTINGS.get('watch.captions'); };
  readCfg(); BUS.on('settings', e => { if (e && typeof e.key === 'string' && e.key.startsWith('watch.')) readCfg(); });

  // ---------------------------------------------------------------- state
  const S = { kind: null, prev: null, lvl: 'normal', t: 0, idle: 0, touched: false, n: Math.floor(Math.random() * 1000), low: [false, false], ten: false, blocks: [0, 0], lastCap: 0, lastSp: -999 };
  const UI = { scr: null };                 // the picker: { row, t } while it is open
  const P = { a: 0, b: NF - 1, arena: -1 }; // what the picker holds
  const CAP = { txt: '', col: INK, t: 0, life: 0, pri: 0 };   // the one caption on screen, changed in place
  const LOG = [], idx = {}, guards = [];

  // ---------------------------------------------------------------- the commentary: lines with {A} {B} {N} {M} {R} {L} {T} {W} {V} slots, cycled by a counter (no randomness, so a seed gives one broadcast)
  const LINES = {
    open: ['{A} VS {B} AT {R}. HERE WE GO.', 'WELCOME TO {R}. {A} AND {B} ARE READY.', 'LIVE FROM {R}: {A} AGAINST {B}.'],
    lead: ['ROUND {N}. {L} LEADS {W}-{V}.', 'ROUND {N}. {T} MUST ANSWER NOW.', 'ROUND {N}. {L} IS ONE STEP AHEAD.'],
    tie: ['ROUND {N}. ALL SQUARE AT {W}-{V}.', 'ROUND {N}. NOBODY HAS PULLED AHEAD.', 'ROUND {N}. IT IS ANYBODY\'S MATCH.'],
    sudden: ['SUDDEN DEATH. A QUARTER OF A HEALTH BAR EACH.', 'SUDDEN DEATH. ONE MISTAKE ENDS IT.', 'SUDDEN DEATH. 30 SECONDS TO SETTLE IT.'],
    combo: ['{A} STRINGS TOGETHER {N} HITS!', '{N} HIT COMBO FROM {A}!', '{A} KEEPS IT GOING. {N} HITS AND COUNTING.'],
    combo2: ['WHAT A STRING! {N} HITS FROM {A}!', '{A} WILL NOT LET GO. {N} HITS!', '{N} HITS! {B} CANNOT GET OUT!'],
    big: ['{A} LANDS A HEAVY ONE ON {B}.', '{B} FEELS THAT ONE.', 'CLEAN HIT BY {A}.'],
    block: ['{B} SITS BEHIND THE GUARD.', '{B} BLOCKS AND WAITS FOR AN OPENING.', '{A} CANNOT FIND A WAY THROUGH.'],
    knock: ['{B} IS DOWN!', '{A} PUTS {B} ON THE FLOOR.', '{B} HITS THE GROUND.'],
    thrw: ['{A} GRABS {B} AND THROWS!', '{A} TAKES {B} OFF THE FLOOR.', 'A THROW FROM {A}!'],
    special: ['{A} USES {M}.', '{M} FROM {A}!', '{A} TRIES {M}.'],
    sup: ['SUPER! {A} UNLEASHES {M}!', '{M}! {A} GOES ALL IN!', '{A} SPENDS THE METER ON {M}!'],
    fin: ['{A} ENDS IT WITH {M}.', '{M}! THAT IS THE MATCH.', '{A} CLOSES THE BOOK WITH {M}.'],
    low: ['{A} IS RUNNING LOW ON HEALTH.', '{A} IS ON THE ROPES.', 'DANGER FOR {A}. THE BAR IS ALMOST EMPTY.'],
    ten: ['TEN SECONDS. {A} IS AHEAD ON HEALTH.', 'TEN SECONDS LEFT. {B} NEEDS A HIT.', 'THE CLOCK IS ON {A} SIDE. TEN SECONDS.'],
    tenEven: ['TEN SECONDS AND IT IS EVEN.', 'TEN SECONDS. NEITHER SIDE IS AHEAD.'],
    lull: ['BOTH FIGHTERS CIRCLE EACH OTHER.', 'NOBODY WANTS TO BLINK FIRST.', '{A} AND {B} FEEL EACH OTHER OUT.'],
    ko: ['{A} TAKES THE ROUND. {B} GOES DOWN.', 'ROUND TO {A}. {W}-{V} IN ROUNDS.', '{B} IS OUT FOR THIS ROUND.'],
    perfect: ['NOT A SCRATCH ON {A}. A PERFECT ROUND!', '{A} TAKES IT WITHOUT A MARK ON THE BAR!'],
    time: ['TIME. {A} HAS MORE HEALTH AND TAKES THE ROUND.', 'THE CLOCK RUNS OUT. {A} TAKES IT ON HEALTH.'],
    draw: ['A DRAW. NOBODY TAKES THE ROUND.', 'LEVEL AT THE BELL. NO WINNER THIS ROUND.'],
    end: ['{A} WINS THE MATCH {W}-{V}!', 'THAT IS IT. {A} TAKES THE MATCH {W}-{V}.'],
  };
  function line(key, vals) {   // the next line of a pool, slots filled
    const pool = LINES[key], i = idx[key] | 0; idx[key] = i + 1;
    return pool[i % pool.length].replace(/\{(\w)\}/g, (m, k) => (vals && vals[k] != null ? vals[k] : ''));
  }
  // The caption on screen: a line with a higher priority is not pushed out in the first second by a lower one.
  function cap(txt, pri, col, life) {
    if (!S.kind || !cfg.captions || !txt) return;
    if (CAP.t < CAP.life && pri < CAP.pri && CAP.t < 60) return;
    CAP.txt = txt; CAP.pri = pri; CAP.col = col || INK; CAP.t = 0; CAP.life = life || 150; S.lastCap = game.tick;
    LOG.push(txt); if (LOG.length > 60) LOG.shift();
  }
  const clearCap = () => { CAP.txt = ''; CAP.t = CAP.life = CAP.pri = 0; };
  const capShown = () => !!CAP.txt && CAP.t < CAP.life && !!S.kind && cfg.captions;

  // ---------------------------------------------------------------- session: begin, end, the demo rotation
  const PAIRS = []; for (let i = 0; i < NF; i++) for (let j = i + 1; j < NF; j++) PAIRS.push([i, j]);
  function demoPick(n) {   // every pair of fighters and every arena come round in turn; odd turns swap the sides
    const pr = PAIRS[(n * 3) % PAIRS.length], odd = n % 2 === 1;
    return [odd ? pr[1] : pr[0], odd ? pr[0] : pr[1], (n * 5 + 2) % NA];
  }
  function begin(kind, a, b, arena, lvl) {
    if (S.kind) endSession();
    S.prev = { modeId: game.modeId === 'watch' ? 'versus' : game.modeId, mode: game.modeId === 'watch' ? 1 : game.mode, sel: game.sel.slice(), arenaPick: game.arenaPick };
    S.kind = kind; S.lvl = LV[lvl] != null ? lvl : 'normal'; S.t = 0; S.touched = false; S.idle = 0;
    for (const k in idx) delete idx[k];
    clearCap(); LOG.length = 0;
    MODES.pick('watch'); game.mode = 2;   // two seats: neither fighter is the player's, so the match is the same for everyone
    game.sel = [mod(a, NF), mod(b, NF)]; game.arenaPick = arena >= 0 ? arena % NA : -1;
    startMatch();
  }
  function endSession() {
    if (!S.kind) return;
    const p = S.prev; S.kind = null; S.prev = null; S.idle = 0; clearCap();
    if (p) { game.modeId = p.modeId; game.mode = p.mode; game.sel = p.sel; game.arenaPick = p.arenaPick; }
  }
  function cleanFight() {   // what the fight leaves lying about when it is cut short
    game.banner = null; game.proj = []; game.fx = []; game.popups = []; game.delayed = [];
    game.slow = game.hitstop = game.dark = game.flash = game.shake = 0; game.cam = { x: 0, zoom: 1 }; FX.clear();
    if (typeof hudReset === 'function') hudReset();
  }
  function leaveToTitle(consume) {
    cleanFight(); setPhase('title'); endSession();   // the 'phase' event ends the session too: calling both is harmless
    S.touched = false; S.idle = 0; if (consume) clearPressed();
  }
  const startDemo = () => { const d = demoPick(S.n++); begin('demo', d[0], d[1], d[2], DEMO_LEVEL); };

  // ---------------------------------------------------------------- input: anything at all counts as somebody being there
  function anyKey() { for (const k in pressed) if (pressed[k]) return true; for (const k in keys) if (keys[k]) return true; return false; }
  const busy = () => { const b = anyKey() || S.touched; S.touched = false; return b; };
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) addEventListener(ev, () => { S.touched = true; }, { passive: true, capture: true });
  function overlayOpen() {   // a screen drawn over the title by some feature: the demo never starts under it
    if (UI.scr) return true;
    try {
      if (window.OPTIONS && OPTIONS.screen) return true;
      if (window.MODES2 && MODES2.screen && MODES2.screen()) return true;
      if (window.ARCADE && ARCADE.S && ARCADE.S.screen) return true;
      if (window.BONUS && BONUS.active && BONUS.active()) return true;
    } catch (e) { /* a feature that is half loaded is not an overlay */ }
    for (let i = 0; i < guards.length; i++) { try { if (guards[i]()) return true; } catch (e) { /* a broken guard says nothing */ } }
    return false;
  }

  // ---------------------------------------------------------------- the update hook
  HOOKS.add('update', g => {
    if (UI.scr && g.phase !== 'title') UI.scr = null;
    if (S.kind) { session(g); return; }
    if (g.phase !== 'title') { S.idle = 0; return; }
    if (UI.scr) { pickerTick(); S.idle = 0; return; }
    if (!cfg.attract || overlayOpen() || busy()) { S.idle = 0; return; }
    if (++S.idle >= cfg.idle) startDemo();
  });
  function session(g) {
    S.t++; if (CAP.t < CAP.life && g.phase !== 'pause') CAP.t++;
    if (S.kind === 'demo') {
      const ph = g.phase, live = ph === 'vs' || ph === 'intro' || ph === 'fight' || ph === 'finish' || ph === 'finisher' || ph === 'ko';
      const user = busy();
      if (user || !live || (ph === 'ko' && g.phaseT >= DEMO_KO_HOLD) || S.t > DEMO_MAX) leaveToTitle(user);   // a key that ended the demo is not also a menu key
      else if (ph === 'fight') poll(g);
      return;
    }
    if (g.phase === 'over') {   // the end screen of a watched match: Enter or R again, Esc back to the picker (the engine's own end-screen keys are not reached)
      if (tap('Enter') || tap('Space') || hit(0, 'p') || hit(1, 'p') || tap('KeyR') || hit(0, 'x')) { clearPressed(); startMatch(); }
      else if (tap('Escape') || hit(0, 'k') || hit(1, 'k')) { cleanFight(); setPhase('title'); endSession(); clearPressed(); openPicker(); }
    } else if (g.phase === 'fight') poll(g);
  }
  function poll(g) {   // the commentary that comes from looking at the fight now and then (health, clock, a long quiet spell)
    if (g.tick % 15 || !cfg.captions) return;
    const [a, b] = g.f; if (!a || !b) return;
    for (let s = 0; s < 2; s++) {
      const f = g.f[s], r = f.hp / f.d.hp;
      if (r > 0 && r < 0.25 && !S.low[s]) { S.low[s] = true; cap(line('low', { A: nameOf(f) }), 3, RED); }
    }
    if (!g.sudden && !S.ten && g.timer <= 10 && g.timer > 5) {
      S.ten = true; const ra = a.hp / a.d.hp, rb = b.hp / b.d.hp;
      if (Math.abs(ra - rb) < 0.02) cap(line('tenEven'), 2, BLUE);
      else { const w = ra > rb ? a : b, l = w === a ? b : a; cap(line('ten', { A: nameOf(w), B: nameOf(l) }), 3, BLUE); }
    }
    if (g.tick - S.lastCap > 480) cap(line('lull', { A: nameOf(a), B: nameOf(b) }), 1, DIM, 140);
  }

  // ---------------------------------------------------------------- BUS: the match is CPU against CPU at the chosen level; the commentary listens to the fight
  BUS.on('match:start', e => {
    if (!S.kind) return;
    if (e.modeId !== 'watch') { endSession(); return; }   // some other mode took over: this session is over
    for (const f of e.fighters) f.cpu = true;
    game.cpuLevel = LV[S.lvl];
  });
  BUS.on('round:start', e => {
    if (!S.kind) return;
    game.cpuLevel = LV[S.lvl]; S.low[0] = S.low[1] = S.ten = false; S.blocks[0] = S.blocks[1] = 0; S.lastCap = game.tick;
    const a = game.f[0], b = game.f[1]; if (!a || !b) return;
    if (e.sudden) { cap(line('sudden'), 5, RED, 170); return; }
    if (e.round === 1) { cap(line('open', { A: nameOf(a), B: nameOf(b), R: ARENAS[game.arena].name }), 5, GOLD, 170); return; }
    const w = game.wins, tie = w[0] === w[1], lead = w[0] > w[1] ? a : b, trail = lead === a ? b : a;
    cap(tie ? line('tie', { N: e.round, W: w[0], V: w[1] }) : line('lead', { N: e.round, L: nameOf(lead), T: nameOf(trail), W: Math.max(w[0], w[1]), V: Math.min(w[0], w[1]) }), 5, GOLD, 170);
  });
  BUS.on('round:end', e => {
    if (!S.kind || !e) return;
    if (!e.winner) { cap(line('draw'), 9, INK, 170); return; }
    const w = e.winner, l = e.loser, v = { A: nameOf(w), B: nameOf(l), W: e.wins[w.side], V: e.wins[l.side] };
    if (e.reason === 'time') cap(line('time', v), 9, INK, 170);
    else if (w.dmgTaken === 0) cap(line('perfect', v), 9, GOLD, 180);
    else cap(line('ko', v), 9, GOLD, 170);
  });
  BUS.on('match:end', e => {
    if (!S.kind || !e || !e.winner) return;
    cap(line('end', { A: nameOf(e.winner), W: e.wins[e.winner.side], V: e.wins[e.loser.side] }), 10, GOLD, 240);
  });
  BUS.on('hit', e => {
    if (!S.kind || !e || !e.src || !e.victim) return;
    S.blocks[e.victim.side] = 0;
    const c = e.combo | 0, v = { A: nameOf(e.src), B: nameOf(e.victim), N: c };
    if (c === 3 || c === 5) cap(line('combo', v), 3, GOLD, 130);
    else if (c === 8 || c === 12 || c === 16) cap(line('combo2', v), 4, GOLD, 150);
    else if (c < 3 && e.dmg >= 12 && e.kind !== 'super') cap(line('big', v), 2, INK, 120);
  });
  BUS.on('block', e => {
    if (!S.kind || !e || !e.src || !e.victim) return;
    if (++S.blocks[e.victim.side] % 4 === 3) cap(line('block', { A: nameOf(e.src), B: nameOf(e.victim) }), 1, DIM, 120);
  });
  BUS.on('knockdown', e => { if (S.kind && e && e.src && e.victim) cap(line('knock', { A: nameOf(e.src), B: nameOf(e.victim) }), 3, RED, 120); });
  BUS.on('throw', e => { if (S.kind && e && e.src && e.victim) cap(line('thrw', { A: nameOf(e.src), B: nameOf(e.victim) }), 3, RED, 120); });
  BUS.on('special', e => {
    if (!S.kind || !e || !e.fighter || !e.move || game.tick - S.lastSp < 120) return;   // specials are common: one remark in two seconds
    S.lastSp = game.tick; cap(line('special', { A: nameOf(e.fighter), M: e.move.name }), 2, BLUE, 120);
  });
  BUS.on('super', e => { if (S.kind && e && e.fighter && e.move) { S.lastSp = game.tick; cap(line('sup', { A: nameOf(e.fighter), M: e.move.name }), 7, GOLD, 170); } });
  BUS.on('finisher', e => { if (S.kind && e && e.winner && e.move) cap(line('fin', { A: nameOf(e.winner), M: e.move.name }), 8, RED, 200); });
  BUS.on('phase', e => { if (S.kind && (e.to === 'title' || e.to === 'select' || e.to === 'sheet')) endSession(); });   // the title is back (or the engine went elsewhere): put the game as it was

  // ---------------------------------------------------------------- the WATCH entry and its picker
  MODES.register({ id: 'watch', label: 'WATCH', order: 45, players: 1, onPick() { openPicker(); return false; } });
  const ROWS = 7;   // 0 left fighter, 1 arena, 2 right fighter, 3 CPU level, 4 captions, 5 attract demo, 6 start
  const RECT = [{ x: 40, y: 108, w: 270, h: 216 }, { x: 345, y: 108, w: 270, h: 216 }, { x: 650, y: 108, w: 270, h: 216 },
    { x: 40, y: 340, w: 270, h: 34 }, { x: 345, y: 340, w: 270, h: 34 }, { x: 650, y: 340, w: 270, h: 34 }, { x: 300, y: 392, w: 360, h: 46 }];
  const BACK = { x: 14, y: 14, w: 100, h: 28 };
  function loadPicks() {
    const p = SETTINGS.get('watch.pick') || {};
    P.a = Number.isInteger(p.a) ? mod(p.a, NF) : 0; P.b = Number.isInteger(p.b) ? mod(p.b, NF) : NF - 1;
    P.arena = Number.isInteger(p.arena) && p.arena >= -1 && p.arena < NA ? p.arena : -1;
  }
  const savePicks = () => SETTINGS.set('watch.pick', { a: P.a, b: P.b, arena: P.arena });
  function openPicker() { loadPicks(); UI.scr = { row: 0, t: 0 }; clearPressed(); }
  function closePicker() { UI.scr = null; if (game.modeId === 'watch' && !S.kind) MODES.pick('versus'); clearPressed(); }
  function startFromPicker() { savePicks(); UI.scr = null; begin('match', P.a, P.b, P.arena, SETTINGS.get('watch.level')); }
  function edit(row, dx) {
    if (row === 0) P.a = mod(P.a + dx, NF);
    else if (row === 2) P.b = mod(P.b + dx, NF);
    else if (row === 1) P.arena = mod(P.arena + 1 + dx, NA + 1) - 1;
    else if (row === 3) SETTINGS.set('watch.level', LEVELS[mod(LEVELS.indexOf(SETTINGS.get('watch.level')) + dx, LEVELS.length)]);
    else if (row === 4) SETTINGS.set('watch.captions', !cfg.captions);
    else if (row === 5) SETTINGS.set('watch.attract', !cfg.attract);
    else return;
    beep(520 + row * 40, 0.04);
  }
  function randomize() { P.a = Math.floor(Math.random() * NF); P.b = Math.floor(Math.random() * NF); P.arena = Math.floor(Math.random() * NA); beep(760, 0.06); }
  function nav() {   // both players' keys, the pads and the touch layer all end up as the same key codes
    const o = {};
    for (const a of ['u', 'd', 'l', 'r']) { const x = hit(0, a), y = hit(1, a); o[a] = x || y; }
    const p0 = hit(0, 'p'), p1 = hit(1, 'p'), k0 = hit(0, 'k'), k1 = hit(1, 'k'), en = tap('Enter'), sp = tap('Space'), es = tap('Escape');
    o.ok = en || sp || p0 || p1; o.back = es || k0 || k1;
    return o;
  }
  function pickerTick() {
    const s = UI.scr, k = nav(); s.t++;
    if (k.back) { closePicker(); beep(300, 0.06); return; }
    if (k.u) { s.row = (s.row + ROWS - 1) % ROWS; beep(400, 0.03); }
    if (k.d) { s.row = (s.row + 1) % ROWS; beep(400, 0.03); }
    if (k.l) edit(s.row, -1);
    if (k.r) edit(s.row, 1);
    if (tap('KeyR')) randomize();
    if (k.ok) { if (s.row === ROWS - 1) { startFromPicker(); return; } s.row++; beep(700, 0.05); }
    clearPressed();   // nothing typed here reaches the title menu under the picker
  }
  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  function pointer(x, y) {   // a click or tap: the left third of a value steps back, the rest steps forward, toggles flip, START starts
    const s = UI.scr; if (!s) return;
    if (inRect(x, y, BACK)) { closePicker(); beep(300, 0.06); return; }
    for (let i = 0; i < ROWS; i++) {
      const r = RECT[i]; if (!inRect(x, y, r)) continue;
      s.row = i;
      if (i === ROWS - 1) { startFromPicker(); return; }
      edit(i, x < r.x + r.w / 3 ? -1 : 1); return;
    }
  }
  addEventListener('pointerdown', e => {
    if (!UI.scr || e.target !== cv) return;
    e.preventDefault(); e.stopImmediatePropagation();   // the engine's tap-anywhere (Enter) must not also fire
    const r = cv.getBoundingClientRect(); pointer((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
  }, true);

  // ---------------------------------------------------------------- drawing
  function backdrop(c, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a16'); g.addColorStop(1, '#141b36'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,150,255,0.07)'; const o = (t * 0.4) % 32;
    for (let x = -o; x < W; x += 32) c.fillRect(Math.round(x), 0, 1, H);
    for (let y = -o; y < H; y += 32) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  }
  function box(c, r, hot, t) {
    c.fillStyle = PANEL; c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = hot ? GOLD : EDGE; c.lineWidth = hot ? 2 : 1; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (hot) { c.fillStyle = 'rgba(255,210,74,' + (0.07 + 0.05 * Math.sin(t / 7)) + ')'; c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
  }
  function arrows(c, r, hot) { if (!hot) return; ptext(c, '<', r.x + 8, r.y + r.h / 2 - 7, 2, GOLD, 'left'); ptext(c, '>', r.x + r.w - 8, r.y + r.h / 2 - 7, 2, GOLD, 'right'); }
  function fighterPanel(c, r, i, side, hot, t) {
    box(c, r, hot, t);
    ptext(c, side ? 'RIGHT CORNER' : 'LEFT CORNER', r.x + r.w / 2, r.y + 10, 2, DIM, 'center');
    drawHeadIcon(c, ROSTER[i].id, r.x + r.w / 2 - 48, r.y + 34, 96, side === 1);
    ptext(c, SHORT(ROSTER[i]), r.x + r.w / 2, r.y + 142, 4, hot ? GOLD : INK, 'center');
    ptext(c, ROSTER[i].tag, r.x + r.w / 2, r.y + 184, 2, DIM, 'center');
    if (hot) { ptext(c, '<', r.x + 12, r.y + 80, 3, GOLD, 'left'); ptext(c, '>', r.x + r.w - 12, r.y + 80, 3, GOLD, 'right'); }
  }
  function arenaPanel(c, r, hot, t) {
    box(c, r, hot, t);
    ptext(c, P.arena < 0 ? 'ARENA' : 'ARENA ' + (P.arena + 1) + ' OF ' + NA, r.x + r.w / 2, r.y + 10, 2, DIM, 'center');
    const ax = r.x + 10, ay = r.y + 34, aw = r.w - 20, ah = Math.round(aw * 9 / 16);
    if (P.arena >= 0) drawArenaThumb(c, P.arena, ax, ay, aw, ah, t);
    else { drawArenaThumb(c, Math.floor(t / 20) % NA, ax, ay, aw, ah, t); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(ax, ay, aw, ah); ptext(c, '?', ax + aw / 2, ay + ah / 2 - 14, 4, GOLD, 'center'); }
    ptext(c, P.arena < 0 ? 'RANDOM' : ARENAS[P.arena].name, r.x + r.w / 2, r.y + 188, 2, hot ? GOLD : INK, 'center');
    if (hot) { ptext(c, '<', r.x + 3, r.y + 90, 3, GOLD, 'left'); ptext(c, '>', r.x + r.w - 3, r.y + 90, 3, GOLD, 'right'); }
  }
  function optionBox(c, r, label, value, hot, t, col) {
    box(c, r, hot, t); ptext(c, label, r.x + 14, r.y + 10, 2, DIM, 'left'); ptext(c, value, r.x + r.w - 14, r.y + 10, 2, col || (hot ? GOLD : INK), 'right'); arrows(c, r, false);
  }
  function drawPicker(c) {
    const s = UI.scr, t = s.t, hot = i => s.row === i;
    backdrop(c, t);
    drawTitleText(c, 'WATCH', W / 2, 44, 38, { align: 'center', style: 'gold', glow: true });
    ptext(c, 'PICK TWO CPU FIGHTERS AND AN ARENA. THEN SIT BACK.', W / 2, 76, 2, DIM, 'center');
    fighterPanel(c, RECT[0], P.a, 0, hot(0), t); arenaPanel(c, RECT[1], hot(1), t); fighterPanel(c, RECT[2], P.b, 1, hot(2), t);
    const lv = SETTINGS.get('watch.level').toUpperCase();
    optionBox(c, RECT[3], 'CPU LEVEL', lv, hot(3), t); optionBox(c, RECT[4], 'CAPTIONS', cfg.captions ? 'ON' : 'OFF', hot(4), t, cfg.captions ? GRN : RED);
    optionBox(c, RECT[5], 'DEMO IDLE', cfg.attract ? 'ON ' + SETTINGS.get('watch.idle') + ' S' : 'OFF', hot(5), t, cfg.attract ? GRN : RED);
    const st = RECT[6]; box(c, st, hot(6), t); ptext(c, 'START WATCHING', st.x + st.w / 2, st.y + 13, 3, hot(6) ? GOLD : INK, 'center');
    ptext(c, 'THE CPU PLAYS BOTH SIDES. THE WHOLE MATCH IS PLAYED, WITH COMMENTARY.', W / 2, 456, 2, DIM, 'center');
    ptext(c, 'AFTER IT: ENTER OR R WATCH AGAIN. ESC BACK HERE. P PAUSES, THEN Q LEAVES.', W / 2, 476, 2, DIM, 'center');
    ptext(c, 'UP DOWN MOVE - LEFT RIGHT CHANGE - ENTER NEXT - R RANDOM - ESC BACK', W / 2, 512, 2, '#9fb4d8', 'center');
    box(c, BACK, false, t); ptext(c, '< BACK', BACK.x + BACK.w / 2, BACK.y + 8, 2, INK, 'center');
  }
  function drawCaption(c, g) {
    const ph = g.phase; if (!capShown() || ph === 'vs' || ph === 'pause' || ph === 'over') return;
    const a = Math.min(1, CAP.t / 8, (CAP.life - CAP.t) / 20), txt = CAP.txt;
    const size = ptextWidth(txt, 3) <= 860 ? 3 : 2, w = ptextWidth(txt, size) + 28, h = 7 * size + 16, x = Math.round((W - w) / 2), y = 112;
    c.save(); c.globalAlpha = a;
    c.fillStyle = 'rgba(5,8,20,0.8)'; c.fillRect(x, y, w, h); c.strokeStyle = CAP.col; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ptext(c, txt, W / 2, y + 8, size, CAP.col, 'center');
    if (S.kind === 'demo' || size === 2) { c.fillStyle = '#d8392b'; c.fillRect(x + 4, y + 4, 4, 4); }   // the little red dot of a live feed
    c.restore();
  }
  function drawStart(c) {   // in the gap between the two super meters (x 324 to 636) so the HUD stays readable
    const w = 296, h = 52, x = (W - w) / 2, y = H - 54, on = S.t % 64 < 42;
    c.fillStyle = 'rgba(4,6,14,0.82)'; c.fillRect(x, y, w, h); c.strokeStyle = GOLD; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (on) ptext(c, 'PRESS START', W / 2, y + 8, 3, GOLD, 'center');
    ptext(c, 'ANY KEY FOR THE MENU', W / 2, y + 33, 2, DIM, 'center');
  }
  HOOKS.add('drawTop', (c, g) => {
    if (UI.scr) { drawPicker(c); return; }
    if (!S.kind) return;
    drawCaption(c, g);
    if (S.kind === 'demo') { drawStart(c); return; }
    if (g.phase === 'over') {
      c.fillStyle = 'rgba(0,0,0,0.92)'; c.fillRect(0, H - 40, W, 40);
      ptext(c, 'ENTER OR R WATCH AGAIN - ESC BACK TO THE PICKER - T SHARE ON X', W / 2, H - 28, 2, '#ddd', 'center');
    } else if (g.phase === 'fight' && S.t < 560) {
      c.save(); c.globalAlpha = Math.min(1, (560 - S.t) / 60); ptext(c, 'P PAUSES - Q LEAVES', W / 2, H - 30, 2, '#9fb4d8', 'center'); c.restore();
    }
  });

  // ---------------------------------------------------------------- test hook
  window.WATCH = {
    screen: () => UI.scr ? 'pick' : null,
    picker: P, row: () => UI.scr ? UI.scr.row : -1,
    state: () => ({ kind: S.kind, lvl: S.lvl, t: S.t, idle: S.idle, n: S.n, hasPrev: !!S.prev }),
    caption: () => capShown() ? CAP.txt : '',
    log: () => LOG.slice(),
    lines: LINES, line, demoPick, levels: LV,
    open: openPicker, close: closePicker, pointer,
    demo: (a, b, arena) => { const d = a == null ? demoPick(S.n++) : [a, b, arena == null ? -1 : arena]; begin('demo', d[0], d[1], d[2], DEMO_LEVEL); },
    match: (a, b, arena, lvl) => begin('match', a, b, arena == null ? -1 : arena, lvl || 'normal'),
    leave: () => leaveToTitle(false),
    clear: clearCap,
    guard: fn => { if (typeof fn === 'function') guards.push(fn); return () => { const i = guards.indexOf(fn); if (i >= 0) guards.splice(i, 1); }; },
    seed: n => { S.n = n | 0; },
    LIMITS: { demoMax: DEMO_MAX, koHold: DEMO_KO_HOLD },
  };
})();
