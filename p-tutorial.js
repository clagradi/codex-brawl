// p-tutorial.js: the TUTORIAL mode. Owner: the p-tutorial agent. Area: onboarding.
// Ten short interactive lessons against a scripted practice dummy: MOVE, ATTACK, BLOCK, CHAIN, THROW, SPECIAL, SUPER, DASH, AIR, GET UP.
// Each lesson is a list of steps; a step is cleared by a success check (a BUS event such as 'hit' or 'throw', or a per-tick test)
// and the lesson panel ticks it off. Nobody can be knocked out and the round clock stands still, so a lesson never ends on its own.
// Progress (one bit per cleared lesson) is kept in SETTINGS 'tutorial.done'. The title entry opens a lesson list (pick a lesson and a fighter).
// Plugs in through MODES ('tutorial', order 28), HOOKS (update, input, fighterUpdate, damage, pauseItems, drawHud, drawFighter, drawTop),
// BUS (listens to hit, block, knockdown, throw, special, super, defense:rise, defense:roll; emits tutorial:step and tutorial:done) and SETTINGS.
// No engine edits. Zero cost when no lesson is running and the list is closed: every hook returns at its first test.
(function () {
  'use strict';
  window.STUB_PTUTORIAL = 1;   // marker: this file loaded

  const KEY = 'tutorial.done';
  SETTINGS.define(KEY, { def: 0, min: 0, max: 1023, step: 1, label: 'TUTORIAL PROGRESS' });   // bit k set = lesson k cleared

  // ---------- text helpers (the pixel font has capitals, digits and a few signs, no apostrophe) ----------
  const clean = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 .,!?:;\-_/"()[\]+=><&@#%*]/g, '');
  const moveName = (id, k) => { const M = (typeof MOVES === 'object' && MOVES[id]) || {}; const mv = k === 'su' ? M.su : M.sp && M.sp[k]; return clean(mv && mv.name) || (k === 'su' ? 'SUPER' : 'SPECIAL'); };
  function fmt(str, face, id) {   // {F} toward, {B} away (as keys for a fighter facing that way), {S0..2} {SU} the move names of fighter id
    return clean(str.replace(/\{F\}/g, face > 0 ? 'D' : 'A').replace(/\{B\}/g, face > 0 ? 'A' : 'D')
      .replace(/\{S([012])\}/g, (m, k) => moveName(id, +k)).replace(/\{SU\}/g, () => moveName(id, 'su')));
  }

  // ---------- the lessons ----------
  // step: { t: text, need: count (default 1), ev: BUS event that clears it with ok(e, p, d), tick(p, d): per-tick check, miss: { event: (e, p, d) => hint or '' }, enter(p, d) }
  // lesson.dummy / step.dummy: what the dummy does (idle, strike, low, grab, jumpin, sweeper)
  const defenseOn = () => typeof DEFENSE === 'object' && DEFENSE && DEFENSE.on !== false;
  const dist = (p, d) => Math.abs(d.x - p.x);
  const mine = (e, p) => e && e.src === p;
  const LESSONS = [
    { id: 'move', name: 'MOVE', info: ['WALK WITH A AND D, JUMP WITH W.', 'WALK UP TO THE DUMMY, BACK AWAY,', 'THEN JUMP.'], steps: [
      { t: 'HOLD {F}: WALK UP TO THE DUMMY', tick: (p, d) => dist(p, d) <= 150 },
      { t: 'HOLD {B}: BACK AWAY', tick: (p, d) => dist(p, d) >= 300 },
      { t: 'PRESS W: JUMP', need: 2, tick: p => p.state === 'jump' && S.pst !== 'jump' },
    ] },
    { id: 'attack', name: 'ATTACK', info: ['J PUNCHES, K KICKS.', 'HOLD S FOR LOW ATTACKS: S + K', 'SWEEPS THE FOE OFF ITS FEET.'], steps: [
      { t: 'GET CLOSE, PRESS J: PUNCH', ev: 'hit', ok: (e, p) => mine(e, p) && p.state === 'punch' },
      { t: 'PRESS K: KICK', ev: 'hit', ok: (e, p) => mine(e, p) && p.state === 'kick' && !p.air },
      { t: 'HOLD S + PRESS K: SWEEP', ev: 'knockdown', ok: (e, p) => mine(e, p) && p.atk === 'sweep' },
    ] },
    { id: 'block', name: 'BLOCK', dummy: 'strike', info: ['HOLD AWAY FROM THE FOE TO BLOCK.', 'LOW ATTACKS MUST BE BLOCKED LOW:', 'HOLD S (CROUCH) AS THEY COME.'], steps: [
      { t: 'HOLD {B} (AWAY): BLOCK ITS ATTACKS', need: 3, ev: 'block', ok: (e, p) => e.victim === p, miss: { hit: (e, p) => (e.victim === p ? 'HOLD {B} BEFORE IT HITS' : '') } },
      { t: 'LOW KICKS: HOLD S TO BLOCK LOW', need: 2, dummy: 'low', ev: 'block', ok: (e, p, d) => e.victim === p && (d.atk === 'sweep' || d.atk === 'low'),
        miss: { hit: (e, p) => (e.victim === p ? 'LOW ATTACK: HOLD S (CROUCH) TO BLOCK' : '') } },
    ] },
    { id: 'chain', name: 'CHAIN', info: ['PRESS J THREE TIMES FAST FOR A', '3 HIT CHAIN. PRESS L AS A HIT LANDS', 'TO CANCEL IT INTO A SPECIAL MOVE.'], steps: [
      { t: 'PRESS J J J FAST: 3 HIT CHAIN', ev: 'hit', ok: (e, p) => mine(e, p) && e.combo >= 3 },
      { t: 'J, THEN L AS IT HITS: CANCEL', ev: 'special', ok: (e, p) => e.fighter === p && (S.pst === 'punch' || S.pst === 'kick') && S.pContact,
        miss: { special: (e, p) => (e.fighter === p ? 'PRESS L RIGHT AFTER THE HIT LANDS' : '') } },
    ] },
    { id: 'throw', name: 'THROW', info: ['UP CLOSE, HOLD TOWARD + J TO THROW.', 'WHEN THE DUMMY GRABS YOU, PRESS J', 'AT ONCE TO BREAK FREE (A TECH).'], steps: [
      { t: 'UP CLOSE, HOLD {F} + PRESS J: THROW', ev: 'throw', ok: mine },
      { t: 'WHEN IT GRABS, PRESS J AT ONCE: TECH', dummy: 'grab', tick: p => S.pst === 'grabbed' && p.state !== 'grabbed' && p.state !== 'down',
        miss: { knockdown: (e, p, d) => (e.victim === p && e.src === d ? 'TOO LATE: PRESS J THE MOMENT IT GRABS' : '') } },
    ] },
    { id: 'special', name: 'SPECIAL', info: ['L IS YOUR SPECIAL MOVE.', 'TOWARD + L AND S + L', 'GIVE YOUR OTHER TWO.'], steps: [
      { t: 'PRESS L: {S0}', ev: 'special', ok: (e, p) => e.fighter === p && e.move === MOVES[p.d.id].sp[0], miss: { special: (e, p) => (e.fighter === p ? 'OTHER MOVE: NO DIRECTION, JUST L' : '') } },
      { t: 'HOLD {F} + PRESS L: {S1}', ev: 'special', ok: (e, p) => e.fighter === p && e.move === MOVES[p.d.id].sp[1], miss: { special: (e, p) => (e.fighter === p ? 'OTHER MOVE: HOLD {F} WHILE YOU PRESS L' : '') } },
      { t: 'HOLD S + PRESS L: {S2}', ev: 'special', ok: (e, p) => e.fighter === p && e.move === MOVES[p.d.id].sp[2], miss: { special: (e, p) => (e.fighter === p ? 'OTHER MOVE: HOLD S WHILE YOU PRESS L' : '') } },
    ] },
    { id: 'super', name: 'SUPER', info: ['EVERY HIT FILLS THE SUPER BAR', 'UNDER YOUR HEALTH. WHEN IT IS FULL,', 'PRESS I FOR YOUR SUPER.'], steps: [
      { t: 'LAND HITS TO FILL THE SUPER BAR', tick: p => p.meter >= 100, enter: p => { p.meter = Math.max(p.meter, 60); } },
      { t: 'PRESS I: {SU}', ev: 'super', ok: (e, p) => e.fighter === p, enter: p => { p.meter = 100; } },
    ] },
    { id: 'dash', name: 'DASH', info: ['TAP TOWARD TWICE TO DASH IN,', 'AWAY TWICE TO HOP BACK.', 'A DASH CAN GO STRAIGHT INTO A HIT.'], steps: [
      { t: 'TAP {F} TWICE: DASH IN', tick: p => p.state === 'dash' && !p.dashBack && S.pst !== 'dash' },
      { t: 'TAP {B} TWICE: BACKDASH', tick: p => p.state === 'dash' && p.dashBack && S.pst !== 'dash' },
      { t: 'DASH IN, THEN HIT THE DUMMY', ev: 'hit', ok: (e, p) => mine(e, p) && game.tick - S.dashT <= 45,
        miss: { hit: (e, p) => (mine(e, p) ? 'DASH FIRST (TAP {F} TWICE), THEN HIT' : '') } },
    ] },
    { id: 'air', name: 'AIR', info: ['JUMP IN AND ATTACK ON THE WAY DOWN.', 'A FOE THAT JUMPS AT YOU CAN BE', 'HIT OUT OF THE AIR.'], steps: [
      { t: 'JUMP IN, PRESS K IN THE AIR', ev: 'hit', ok: (e, p) => mine(e, p) && !!p.air, miss: { hit: (e, p) => (mine(e, p) ? 'JUMP FIRST (W), THEN PRESS K' : '') } },
      { t: 'IT JUMPS IN: HIT IT IN THE AIR', dummy: 'jumpin', ev: 'hit', ok: (e, p, d) => mine(e, p) && e.victim === d && d.y < GROUND - 2,
        miss: { hit: (e, p, d) => (mine(e, p) && e.victim === d ? 'TOO LATE: HIT IT BEFORE IT LANDS' : '') } },
    ] },
    { id: 'getup', name: 'GET UP', dummy: 'sweeper', info: ['KNOCKED DOWN? PRESS J AS YOU LAND', 'TO RISE AT ONCE, OR HOLD A', 'DIRECTION + J TO ROLL AWAY.'], steps: [
      { t: 'SWEPT? PRESS J ON LANDING: QUICK RISE', ev: 'defense:rise', ok: (e, p) => e.fighter === p, tick: p => !defenseOn() && S.pst === 'down' && p.state !== 'down',
        miss: { knockdown: (e, p) => (e.victim === p ? 'NOW: PRESS J!' : ''), block: (e, p) => (e.victim === p ? 'DO NOT BLOCK: LET THE SWEEP LAND' : '') } },
      { t: 'SWEPT? {F} OR {B} + J: ROLL', ev: 'defense:roll', ok: (e, p) => e.fighter === p, tick: p => !defenseOn() && S.pst === 'down' && p.state !== 'down',
        miss: { knockdown: (e, p) => (e.victim === p ? 'NOW: HOLD {F} OR {B} AND PRESS J!' : ''), block: (e, p) => (e.victim === p ? 'DO NOT BLOCK: LET THE SWEEP LAND' : '') } },
    ] },
  ];
  const N = LESSONS.length;

  // ---------- state ----------
  const S = {
    screen: null, sel: 0, pid: 0, done: 0, cheer: 0,   // lesson list (on the title screen)
    on: false, k: 0, step: 0, n: 0,                      // the lesson being played: index, step, count inside the step
    flash: 0, msg: '', msgTx: '', msgT: 0, doneT: 0,     // panel feedback, countdown after LESSON CLEAR
    dcool: 0, tele: 0, alt: 0,                           // dummy: cooldown, grab telegraph, punch/kick toggle
    pst: 'idle', pContact: false, dashT: -999,           // the player's state and hit-confirm at the end of the last tick, start of the last forward dash
    head: '', tx: null, prog: '',
  };
  const bits = () => SETTINGS.get(KEY) | 0;
  const isDone = k => !!(bits() >> k & 1);
  const count = v => { let c = 0; for (let k = 0; k < N; k++) if (v >> k & 1) c++; return c; };
  const cur = () => (S.on ? LESSONS[S.k].steps[S.step] : null);
  const behaviour = () => { const L = LESSONS[S.k], st = L.steps[S.step]; return (st && st.dummy) || L.dummy || 'idle'; };
  const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.floor(+v) || 0));

  function note(raw) { const p = game.f[0]; S.msg = raw; S.msgTx = fmt(raw, p ? p.face : 1, p ? p.d.id : ''); S.msgT = 150; }

  // ---------- starting, clearing, leaving ----------
  function start(k, pid) {
    k = clampI(k, 0, N - 1); pid = clampI(pid, 0, ROSTER.length - 1);
    S.screen = null; S.on = true; S.k = k; S.pid = pid;
    MODES.pick('tutorial');
    game.sel[0] = pid; game.sel[1] = (pid + 1) % ROSTER.length;
    const ap = game.arenaPick; game.arenaPick = 0; startMatch(); game.arenaPick = ap;
    startRound();
    game.phaseT = typeof INTRO_LEN === 'number' ? Math.max(0, INTRO_LEN - 60) : 40;   // a short intro
    const L = LESSONS[k], p = game.f[0], d = game.f[1];
    banner('LESSON ' + (k + 1), { style: 'gold', life: 60, sub: L.name });
    d.noTech = true; d.cpu2off = true; d.meter = 0;   // the dummy never quick-rises and no other brain drives it
    S.step = 0; S.n = 0; S.flash = 0; S.msg = ''; S.msgT = 0; S.doneT = 0; S.dcool = 40; S.tele = 0; S.alt = 0; S.pst = 'idle'; S.pContact = false; S.dashT = -999;
    S.head = 'LESSON ' + (k + 1) + '/' + N + '  ' + L.name;
    S.tx = [L.steps.map(s => fmt(s.t, 1, p.d.id)), L.steps.map(s => fmt(s.t, -1, p.d.id))];   // both facings, built once
    enter();
  }
  function enter() { const st = cur(); if (st && st.enter) st.enter(game.f[0], game.f[1]); }
  function progress() {
    const st = cur(); if (!st) return;
    S.n++; S.flash = 24; S.msgT = 0;
    if (S.n < (st.need || 1)) { beep(660, 0.05, 'square', 0.04); return; }
    const L = LESSONS[S.k];
    BUS.emit('tutorial:step', { lesson: S.k, id: L.id, step: S.step });
    S.step++; S.n = 0; S.tele = 0; S.dcool = 40;
    if (S.step < L.steps.length) { beep(880, 0.08, 'square', 0.05); enter(); return; }
    const v = SETTINGS.set(KEY, bits() | 1 << S.k);
    BUS.emit('tutorial:done', { lesson: S.k, id: L.id, cleared: count(v), total: N });
    banner('LESSON CLEAR', { style: 'gold', life: 100 }); beep(990, 0.25, 'square', 0.06, 1.5);
    S.doneT = 110;
  }
  function next() {
    if (S.k < N - 1) { start(S.k + 1, S.pid); return; }
    S.on = false; setPhase('title'); openList(N - 1); S.cheer = count(bits()) === N ? 240 : 0;
  }
  function openList(sel) {
    S.screen = 'list'; S.on = false; S.done = bits(); S.prog = 'PROGRESS ' + count(S.done) + '/' + N;
    S.sel = sel != null ? clampI(sel, 0, N - 1) : firstOpen(S.done);
    S.pid = clampI(game.sel && game.sel[0], 0, ROSTER.length - 1);
  }
  function firstOpen(v) { for (let k = 0; k < N; k++) if (!(v >> k & 1)) return k; return 0; }

  MODES.register({ id: 'tutorial', label: 'TUTORIAL', order: 28, players: 1, onPick() { openList(); return false; } });

  // ---------- every tick ----------
  function listNav() {
    const up = hit(0, 'u'), dn = hit(0, 'd'), lf = hit(0, 'l'), rt = hit(0, 'r');
    const ok = hit(0, 'p') | tap('Enter') | tap('Space'), back = hit(0, 'k') | tap('Escape') | tap('Backspace');
    if (up || dn) { S.sel = (S.sel + (up ? N - 1 : 1)) % N; beep(400, 0.04); }
    if (lf || rt) { S.pid = (S.pid + (lf ? ROSTER.length - 1 : 1)) % ROSTER.length; beep(520, 0.04); }
    if (back) { S.screen = null; beep(300, 0.06); } else if (ok) { beep(700, 0.1); start(S.sel, S.pid); }
    clearPressed();
  }
  HOOKS.add('update', g => {
    if (S.screen) { if (g.phase !== 'title') S.screen = null; else { if (S.cheer > 0) S.cheer--; listNav(); } return; }
    if (!S.on) return;
    const ph = g.phase;
    if (ph === 'title') { openList(S.k); return; }                    // quit from the pause menu: back to the lesson list
    if (g.modeId !== 'tutorial' || ph === 'select' || ph === 'sheet') { S.on = false; return; }
    if (ph === 'ko' || ph === 'finish' || ph === 'outro' || ph === 'over') { start(S.k, S.pid); return; }   // cannot happen (no KO), but never strand the player
    if (ph === 'pause') return;
    if (S.flash > 0) S.flash--; if (S.msgT > 0) S.msgT--;
    if (ph === 'fight' && g.clock % 60 === 59) g.clock++;             // the round clock never counts down
    if (S.doneT > 0 && --S.doneT === 0) next();
  }, -8);

  // the dummy: one reused input object, filled by the current behaviour (last in the input chain, so no CPU brain overrides it)
  const DI = { l: false, r: false, u: false, d: false, p: false, k: false, s: false, x: false, dash: 0 };
  function drive(d, p) {
    const dx = p.x - d.x, gap = Math.abs(dx), tw = dx > 0 ? 'r' : 'l', aw = dx > 0 ? 'l' : 'r';
    const free = d.onGround && !d.busy() && d.state !== 'jump', pUp = p.state !== 'down' && p.state !== 'grabbed' && p.state !== 'ko';
    switch (behaviour()) {
      case 'strike': case 'low':
        if (!pUp) break;
        if (gap > 74) { if (free) DI[tw] = true; break; }
        if (S.dcool <= 0 && free) { if (behaviour() === 'low') { DI.d = true; DI.k = true; } else if ((S.alt ^= 1)) DI.p = true; else DI.k = true; S.dcool = 50; }
        break;
      case 'grab':
        if (!pUp || d.state === 'throw') break;
        if (S.tele > 0) { if (S.tele === 1) { if (free && d.canThrow(p)) { DI[tw] = true; DI.p = true; } S.dcool = 90; } break; }
        if (gap > 60) { if (free) DI[tw] = true; break; }
        if (S.dcool <= 0 && free) S.tele = 36;
        break;
      case 'jumpin':
        if (!d.onGround) { DI[tw] = true; break; }
        if (!free || !pUp) break;
        if (gap > 330) DI[tw] = true;
        else if (gap < 150 && d.x > 90 && d.x < W - 90) DI[aw] = true;
        else if (S.dcool <= 0) { DI.u = true; DI[tw] = true; S.dcool = 80; }
        break;
      case 'sweeper':
        if (!pUp || p.inv > 0) break;
        if (gap > 80) { if (free) DI[tw] = true; break; }
        if (S.dcool <= 0 && free) { DI.d = true; DI.k = true; S.dcool = 60; }
        break;
    }
  }
  HOOKS.add('input', (i, side, f) => {
    if (!S.on || side !== 1 || game.modeId !== 'tutorial') return;
    DI.l = DI.r = DI.u = DI.d = DI.p = DI.k = DI.s = DI.x = false; DI.dash = 0;
    if (game.phase === 'fight' && !S.doneT && game.f[0]) drive(f, game.f[0]);
    return DI;
  }, 1000);

  HOOKS.add('fighterUpdate', (a, b) => {
    if (!S.on) return;
    if (S.dcool > 0) S.dcool--; if (S.tele > 0) S.tele--;
    b.meter = 0;
    if ((a.state === 'idle' || a.state === 'walk') && a.hp < a.d.hp) a.hp = a.d.hp;   // health comes back between exchanges
    if ((b.state === 'idle' || b.state === 'walk') && b.hp < b.d.hp) b.hp = b.d.hp;
    if (a.state === 'dash' && !a.dashBack && S.pst !== 'dash') S.dashT = game.tick;
    if (game.phase === 'fight' && !S.doneT) { const st = cur(); if (st && st.tick && st.tick(a, b)) progress(); }
    S.pst = a.state; S.pContact = !!a.contact;
  });

  // nobody is knocked out in a lesson: the last point of health cannot be taken (runs last, after every other damage filter)
  HOOKS.add('damage', pl => {
    if (!S.on || !pl || !pl.victim || !(pl.dmg > 0)) return;
    const cap = Math.max(0, pl.victim.hp - 1); if (pl.dmg > cap) pl.dmg = cap;
    return pl;
  }, 1000);

  // success checks and hints from the engine's events
  function onEvent(name) {
    return e => {
      if (!S.on || game.phase !== 'fight' || S.doneT) return;
      const st = cur(), p = game.f[0], d = game.f[1]; if (!st || !p || !d) return;
      if (st.ev === name && st.ok(e, p, d)) progress();
      else if (st.miss && st.miss[name]) { const m = st.miss[name](e, p, d); if (m) note(m); }
    };
  }
  for (const n of ['hit', 'block', 'knockdown', 'throw', 'special', 'super', 'defense:rise', 'defense:roll']) BUS.on(n, onEvent(n));

  // pause menu: restart this lesson or skip to the next one
  const PAUSE = [
    { id: 'tutorial-restart', key: 'KeyR', label: 'R RESTART LESSON', run: () => { if (S.on && game.phase === 'pause') start(S.k, S.pid); } },
    { id: 'tutorial-next', key: 'KeyN', label: 'N NEXT LESSON', run: () => { if (S.on && game.phase === 'pause') next(); } },
  ];
  HOOKS.add('pauseItems', () => (S.on ? PAUSE : null));

  // ---------- drawing ----------
  const GOLD = '#ffd34a', OKC = '#5fe08a', DIM = '#7a7f98', RED = '#ff8a7a';
  const CNT = {};
  const counter = (n, need) => (CNT[need] || (CNT[need] = Array.from({ length: need + 1 }, (_, i) => i + '/' + need)))[Math.min(n, need)];
  function box(c, x, y, w, h, fill, edge) { c.fillStyle = fill; c.fillRect(x, y, w, h); if (edge) { c.strokeStyle = edge; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); } }

  HOOKS.add('drawHud', (c, g) => {
    if (!S.on || (g.phase !== 'fight' && g.phase !== 'intro') || !S.tx || !g.f[0]) return;
    const L = LESSONS[S.k], rows = S.tx[g.f[0].face > 0 ? 0 : 1], n = rows.length, cleared = S.doneT > 0;
    const w = 620, x = W / 2 - w / 2, y = 104, h = 36 + n * 22 + (S.msgT > 0 ? 24 : 0);
    c.save();
    box(c, x, y, w, h, 'rgba(8,10,18,0.8)', '#c9a24a');
    ptext(c, S.head, x + 12, y + 10, 2, GOLD);
    ptext(c, 'P: MENU', x + w - 12, y + 10, 2, DIM, 'right');
    for (let i = 0; i < n; i++) {
      const ry = y + 34 + i * 22, done = cleared || i < S.step, now = !cleared && i === S.step, st = L.steps[i];
      if (now && S.flash > 0) { c.globalAlpha = S.flash / 40; box(c, x + 6, ry - 4, w - 12, 20, OKC); c.globalAlpha = 1; }
      ptext(c, done ? 'OK' : now ? '>' : '-', x + 14, ry, 2, done ? OKC : now ? '#fff' : DIM);
      ptext(c, rows[i], x + 46, ry, 2, done ? OKC : now ? '#fff' : DIM);
      if (now && st.need > 1) ptext(c, counter(S.n, st.need), x + w - 12, ry, 2, GOLD, 'right');
    }
    if (S.msgT > 0) ptext(c, S.msgTx, W / 2, y + 36 + n * 22, 2, RED, 'center');
    c.restore();
  });
  HOOKS.add('drawFighter', (c, f) => {   // the grab warning over the dummy's head (world space)
    if (!S.on || S.tele <= 0 || f !== game.f[1]) return;
    ptext(c, '!', f.x, f.y - 250, 5, S.tele & 4 ? '#ff5a4a' : GOLD, 'center');
  });

  // the lesson list, drawn over the title screen
  const ROWS = LESSONS.map((l, i) => (i < 9 ? '0' : '') + (i + 1) + '  ' + l.name);
  const INFO = LESSONS.map(l => l.info.map(clean));
  const NAMES = ROSTER.map(r => clean(r.name || r.id));
  const R = { rowX: 40, rowY: 100, rowH: 32, rowW: 400, prev: [640, 196, 56, 40], next: [708, 196, 56, 40], back: [470, 436, 200, 44], go: [690, 436, 230, 44] };
  const inR = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  function button(c, r, label, col, on) { box(c, r[0], r[1], r[2], r[3], on ? 'rgba(201,162,74,0.25)' : 'rgba(255,255,255,0.05)', col); ptext(c, label, r[0] + r[2] / 2, r[1] + r[3] / 2 - 7, 2, col, 'center'); }
  HOOKS.add('drawTop', (c, g) => {
    if (S.screen !== 'list' || g.phase !== 'title') return;
    c.save(); c.globalAlpha = 1;
    box(c, 0, 0, W, H, '#0b0d16');
    box(c, 0, 0, W, 4, GOLD);
    ptext(c, 'TUTORIAL', W / 2, 18, 5, GOLD, 'center');
    ptext(c, 'TEN SHORT LESSONS WITH A PRACTICE DUMMY', W / 2, 64, 2, DIM, 'center');
    for (let i = 0; i < N; i++) {
      const y = R.rowY + i * R.rowH, sel = i === S.sel, ok = S.done >> i & 1;
      if (sel) box(c, R.rowX - 8, y - 7, R.rowW + 16, 28, 'rgba(201,162,74,0.22)', GOLD);
      ptext(c, ROWS[i], R.rowX + 18, y, 2, sel ? '#fff' : '#c8cbe0');
      if (sel && (g.tick >> 4 & 1)) ptext(c, '>', R.rowX, y, 2, GOLD);
      if (ok) ptext(c, 'OK', R.rowX + R.rowW - 4, y, 2, OKC, 'right');
    }
    const id = ROSTER[S.pid].id;
    box(c, 468, 98, 154, 154, '#151a28', '#c9a24a');
    if (typeof drawPortrait === 'function') drawPortrait(c, id, 470, 100, 150, 150);
    ptext(c, NAMES[S.pid], 640, 108, 3, '#fff');
    ptext(c, 'YOUR FIGHTER', 640, 142, 2, DIM);
    button(c, R.prev, '<', GOLD); button(c, R.next, '>', GOLD);
    ptext(c, ROWS[S.sel].slice(4), 470, 276, 3, GOLD);
    const info = INFO[S.sel]; for (let j = 0; j < info.length; j++) ptext(c, info[j], 470, 310 + j * 22, 2, '#e6e8f2');
    ptext(c, S.cheer > 0 ? 'ALL LESSONS CLEAR!' : S.prog, 470, 384, 2, S.cheer > 0 ? OKC : '#c8cbe0');
    box(c, 470, 404, 450, 10, '#20263a');
    const done = count(S.done); if (done) box(c, 470, 404, Math.round(450 * done / N), 10, done === N ? OKC : GOLD);
    button(c, R.back, 'BACK', DIM); button(c, R.go, 'START', GOLD, true);
    ptext(c, 'W/S LESSON   A/D FIGHTER   ENTER START   ESC BACK', W / 2, 506, 2, DIM, 'center');
    c.restore();
  });

  // mouse and touch on the list: a row picks the lesson (again starts it), the arrows change the fighter, START and BACK
  addEventListener('pointerdown', e => {
    if (S.screen !== 'list' || game.phase !== 'title' || typeof cv === 'undefined' || e.target !== cv) return;
    e.preventDefault(); e.stopImmediatePropagation(); pressed.Enter = false;   // the title menu under the list must not react
    const ti = titleItems().findIndex(it => it.id === 'tutorial'); if (ti >= 0) game.titleSel = ti;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    for (let i = 0; i < N; i++) {
      const ry = R.rowY + i * R.rowH - 7;
      if (x >= R.rowX - 8 && x <= R.rowX + R.rowW + 8 && y >= ry && y < ry + R.rowH) { if (S.sel === i) start(i, S.pid); else { S.sel = i; beep(400, 0.04); } return; }
    }
    if (inR(x, y, R.prev) || inR(x, y, R.next)) { S.pid = (S.pid + (inR(x, y, R.prev) ? ROSTER.length - 1 : 1)) % ROSTER.length; beep(520, 0.04); }
    else if (inR(x, y, R.back)) { S.screen = null; beep(300, 0.06); }
    else if (inR(x, y, R.go)) start(S.sel, S.pid);
  }, true);

  window.TUTORIAL = {
    lessons: LESSONS.map(l => ({ id: l.id, name: l.name, steps: l.steps.length })),
    state: () => ({ screen: S.screen, on: S.on, lesson: S.k, step: S.step, n: S.n, sel: S.sel, pid: S.pid, doneT: S.doneT, tele: S.tele, msg: S.msgT > 0 ? S.msgTx : '', behaviour: S.on ? behaviour() : null }),
    open: sel => { setPhase('title'); MODES.pick('tutorial'); openList(sel); },
    start, isDone, progress: () => count(bits()), reset: () => SETTINGS.set(KEY, 0),
  };
})();
