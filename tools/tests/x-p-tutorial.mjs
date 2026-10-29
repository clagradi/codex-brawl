// Tests for p-tutorial.js (the TUTORIAL mode). Owner: the p-tutorial agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Fully deterministic: hold(true) freezes the real-time loop, only step() advances time and the keys are set directly (keys.KeyD = held, pressed.KeyJ = a press).
// Covers the title entry and the lesson list (keys, character pick, back), every one of the ten lessons played to the end with real inputs
// (including the hints shown for a wrong try), automatic advance, the tutorial:step / tutorial:done events, no KO and no round clock,
// the pause keys (restart, next, quit to the list), the saved progress across a page load and the final return to the list.
import { readFileSync } from 'node:fs';

// page helpers: P / D are the player and the dummy, S() the tutorial state, close / away walk to a distance, tries(fn, ok, n) repeats an attempt
const HELP = `window.__T = (() => {
  const P = () => game.f[0], D = () => game.f[1], S = () => TUTORIAL.state();
  const clr = () => { for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; };
  const until = (fn, max = 600) => { let n = 0; while (!fn() && n < max) { step(1); n++; } return !!fn(); };
  const gap = () => Math.abs(D().x - P().x);
  const F = () => (P().face > 0 ? 'KeyD' : 'KeyA'), B = () => (P().face > 0 ? 'KeyA' : 'KeyD');
  const free = () => P().onGround && !P().busy() && P().state !== 'jump' && P().state !== 'dash';
  const idle = (max = 200) => until(free, max);
  const ready = (max = 300) => until(() => free() && P().cool <= 0, max);   // free and past the cooldown that follows a special
  let cur = 0;
  const done = () => S().doneT > 0 || TUTORIAL.isDone(cur);                  // LESSON CLEAR shown (or already over and the next lesson started)
  const go = (k, pid = 0) => { clr(); cur = k; TUTORIAL.start(k, pid); until(() => game.phase === 'fight', 300); step(2); return game.phase; };
  const walk = (c, fn, max) => { let last = -1, still = 0, n = 0; keys[c] = true; while (!fn() && n++ < max && still < 8) { step(1); const g = gap(); still = Math.abs(g - last) < 0.01 ? still + 1 : 0; last = g; } keys[c] = false; };
  const close = (to = 62, max = 240) => { idle(); walk(F(), () => gap() <= to, max); return gap(); };
  const away = (to = 160, max = 240) => { idle(); walk(B(), () => gap() >= to, max); return gap(); };
  const press = (c, n = 1) => { pressed[c] = true; step(n); };
  const tries = (fn, ok, n = 8) => { let i = 0; while (!ok() && i < n) fn(i++); return ok(); };
  const dtap = c => { keys[c] = true; step(2); keys[c] = false; step(2); keys[c] = true; step(3); keys[c] = false; };
  const draw = () => { try { render(); return 'ok'; } catch (e) { return String(e && e.message || e); } };
  const ev = { step: [], done: [] };
  BUS.on('tutorial:step', e => ev.step.push(e.lesson + ':' + e.step));
  BUS.on('tutorial:done', e => ev.done.push(e));
  return { P, D, S, clr, until, gap, F, B, free, idle, ready, done, go, close, away, press, tries, dtap, draw, ev };
})(); true`;

export async function run(t) {
  const ck = (c, m) => t.check(c, m), ev = code => t.eval(code), js = v => JSON.stringify(v);
  // one page-side block: T is the helper set, r the result object; an exception comes back as r.err
  const L = body => ev(`(() => { const r = {}; try { const T = __T, P = T.P, D = T.D, S = T.S; ${body}
    } catch (e) { r.err = String(e && e.stack || e).slice(0, 300); } return r; })()`);
  const dev = readFileSync(new URL('../../dev.html', import.meta.url), 'utf8');
  ck(/<script src="vfx\.js"><\/script>\s*<script src="p-tutorial\.js"><\/script>/.test(dev), 'dev.html loads p-tutorial.js right after vfx.js');

  await t.open('');
  await ev(HELP);
  await ev('TUTORIAL.reset(); hold(true); step(3); true');

  // ---------- the title entry and the lesson list ----------
  const A = await L(`
    const ids = titleItems().map(i => i.id), m = MODES.get('tutorial');
    r.mode = m && [m.order, m.label, m.players].join(); r.ids = ids; r.total = TUTORIAL.lessons.length; r.steps = TUTORIAL.lessons.map(l => l.steps);
    r.pid0 = game.sel[0] | 0;
    game.titleSel = ids.indexOf('tutorial'); const ts = game.titleSel;
    T.press('Enter', 2); r.open = { phase: game.phase, screen: S().screen, sel: S().sel, on: S().on };
    T.press('KeyS', 1); r.down = S().sel; T.press('KeyS', 1); T.press('KeyW', 1); r.up = S().sel;
    T.press('KeyD', 1); r.pid = S().pid; r.titleKept = game.titleSel === ts && game.phase === 'title';
    r.draw1 = T.draw();
    T.press('Escape', 1); r.closed = { screen: S().screen, phase: game.phase };
    T.press('Enter', 2); r.reopen = S().screen; r.resel = [S().sel, S().pid];
    T.press('KeyS', 1); T.press('KeyD', 1); T.press('KeyJ', 2);
    r.started = { on: S().on, lesson: S().lesson, step: S().step, sel0: game.sel[0], id0: game.f[0].d.id, id1: game.f[1].d.id, want0: ROSTER[r.pid].id, want1: ROSTER[(r.pid + 1) % ROSTER.length].id, modeId: game.modeId, cpu: [game.f[0].cpu, game.f[1].cpu] };
    T.until(() => game.phase === 'fight', 300); r.fight = game.phase; step(2); r.draw2 = T.draw();
  `);
  ck(!A.err, 'title and list block ran' + (A.err ? ': ' + A.err : ''));
  ck(A.mode === '28,TUTORIAL,1', 'MODES has tutorial (order 28, label TUTORIAL, one player): ' + A.mode);
  ck(A.ids && A.ids.includes('tutorial') && ['survival', 'arcade'].every(id => !A.ids.includes(id) || A.ids.indexOf(id) < A.ids.indexOf('tutorial')), 'TUTORIAL sits on the title menu after arcade and survival: ' + js(A.ids));
  ck(A.total === 10 && js(A.steps) === js([3, 3, 2, 2, 2, 3, 2, 3, 2, 2]), 'ten lessons with their steps: ' + js(A.steps));
  ck(A.open && A.open.phase === 'title' && A.open.screen === 'list' && A.open.sel === 0 && !A.open.on, 'Enter on TUTORIAL opens the lesson list on the title screen, first open lesson selected: ' + js(A.open));
  ck(A.down === 1 && A.up === 1, 'S and W move through the lessons: ' + A.down + ' ' + A.up);
  ck(A.pid === (A.pid0 + 1) % 5 && A.titleKept, 'D picks the next fighter and the title menu underneath does not move: ' + A.pid);
  ck(A.draw1 === 'ok' && A.draw2 === 'ok', 'the list and a lesson draw without errors: ' + A.draw1 + ' / ' + A.draw2);
  ck(A.closed && A.closed.screen === null && A.closed.phase === 'title' && A.reopen === 'list', 'Esc closes the list back to the title menu, Enter opens it again: ' + js(A.closed));
  ck(js(A.resel) === js([0, A.pid0]), 'a reopened list starts again on the first open lesson and the current fighter: ' + js(A.resel));
  const s0 = A.started || {};
  ck(s0.on && s0.lesson === 1 && s0.step === 0 && s0.modeId === 'tutorial' && s0.sel0 === A.pid && s0.id0 === s0.want0 && s0.id1 === s0.want1 && s0.cpu && !s0.cpu[0] && s0.cpu[1] && A.fight === 'fight',
    'J starts the selected lesson with the chosen fighter against a CPU dummy and reaches the fight: ' + js(s0));

  // ---------- no KO, no round clock, pause keys ----------
  const B = await L(`
    T.go(0, 0);
    const t0 = game.timer; step(700); r.timer = [t0, game.timer, game.phase]; r.idleStep = S().step;
    P().takeHit(D(), 999, 3, 14, 'punch', {}); D().takeHit(P(), 999, 3, 14, 'punch', {}); r.hp = [P().hp, D().hp];
    step(60); r.after = game.phase; T.idle(200); r.refill = [P().hp === P().d.hp, D().hp === D().d.hp, D().meter];
    keys[T.F()] = true; T.until(() => S().step >= 1, 300); T.clr(); r.before = S().step;
    T.press('KeyP', 1); r.pause = game.phase; r.items = HOOKS.collect('pauseItems').map(i => i && i.id).filter(Boolean);
    r.draw = T.draw();
    T.press('KeyR', 2); r.restart = { phase: game.phase, lesson: S().lesson, step: S().step, on: S().on };
    T.until(() => game.phase === 'fight', 300);
    T.press('KeyP', 1); T.press('KeyN', 2); r.skip = { lesson: S().lesson, step: S().step, phase: game.phase, behaviour: S().behaviour };
    T.until(() => game.phase === 'fight', 300);
    T.press('KeyP', 1); T.press('KeyQ', 3); r.quit = { phase: game.phase, screen: S().screen, sel: S().sel, on: S().on };
    r.itemsOut = HOOKS.collect('pauseItems').map(i => i && i.id).filter(Boolean);
    r.bits = TUTORIAL.progress(); r.steps = T.ev.step.slice();
  `);
  ck(!B.err, 'rules and pause block ran' + (B.err ? ': ' + B.err : ''));
  ck(B.timer && B.timer[0] === B.timer[1] && B.timer[2] === 'fight' && B.idleStep === 0, 'the round clock does not count down in a lesson (700 ticks) and nothing clears by itself: ' + js(B.timer));
  ck(B.hp && B.hp[0] >= 1 && B.hp[1] >= 1 && B.after === 'fight', 'a huge hit leaves both the player and the dummy standing (no KO): ' + js(B.hp) + ' ' + B.after);
  ck(B.refill && B.refill[0] && B.refill[1] && B.refill[2] === 0, 'health comes back between exchanges and the dummy never builds meter: ' + js(B.refill));
  ck(B.before === 1 && B.pause === 'pause' && B.items.includes('tutorial-restart') && B.items.includes('tutorial-next') && B.draw === 'ok', 'the pause screen offers R RESTART LESSON and N NEXT LESSON: ' + js(B.items));
  ck(B.restart && B.restart.on && B.restart.lesson === 0 && B.restart.step === 0 && B.restart.phase === 'intro', 'R restarts the lesson from its first step: ' + js(B.restart));
  ck(B.skip && B.skip.lesson === 1 && B.skip.step === 0 && B.skip.behaviour === 'idle', 'N skips to the next lesson: ' + js(B.skip));
  ck(B.quit && B.quit.phase === 'title' && B.quit.screen === 'list' && B.quit.sel === 1 && !B.quit.on, 'Q in the pause menu goes back to the lesson list on the current lesson: ' + js(B.quit));
  ck(B.itemsOut && !B.itemsOut.some(id => /^tutorial/.test(id)), 'outside a lesson the pause menu has no tutorial keys: ' + js(B.itemsOut));
  ck(B.bits === 0 && js(B.steps) === js(['0:0']), 'skipping does not count as clearing; one tutorial:step event so far: ' + js(B.steps));

  // ---------- the ten lessons, played with real inputs ----------
  // 1 MOVE: walk in, back away, jump twice; then the next lesson starts by itself
  const M = await L(`
    T.ev.step.length = 0; T.ev.done.length = 0; T.go(0, 0); r.text = S().behaviour;
    keys[T.F()] = true; T.until(() => S().step >= 1, 300); T.clr(); r.a = S().step;
    keys[T.B()] = true; T.until(() => S().step >= 2, 300); T.clr(); r.b = S().step;
    T.tries(() => { T.idle(); keys.KeyW = true; step(4); keys.KeyW = false; T.until(() => P().onGround && P().state !== 'jump', 90); step(2); }, T.done, 5);
    r.done = T.done(); r.bit = TUTORIAL.isDone(0); r.steps = T.ev.step.slice(); r.ev = T.ev.done[0] || null;
    T.until(() => S().lesson === 1, 200); r.next = S().lesson; T.until(() => game.phase === 'fight', 300); r.ph = game.phase;
  `);
  ck(!M.err && M.a === 1 && M.b === 2 && M.done && M.bit, 'lesson MOVE clears by walking in, backing away and jumping twice: ' + js(M));
  ck(js(M.steps) === js(['0:0', '0:1', '0:2']) && M.ev && M.ev.lesson === 0 && M.ev.id === 'move' && M.ev.cleared === 1 && M.ev.total === 10, 'tutorial:step fires for each step and tutorial:done once with the count: ' + js(M.ev));
  ck(M.next === 1 && M.ph === 'fight', 'after LESSON CLEAR the next lesson starts by itself');

  // 2 ATTACK: punch, kick, sweep
  const AT = await L(`
    T.go(1, 0);
    T.tries(() => { T.close(); T.press('KeyJ', 30); T.idle(); }, () => S().step >= 1, 6); r.a = S().step;
    T.tries(() => { T.close(); T.press('KeyK', 34); T.idle(); }, () => S().step >= 2, 6); r.b = S().step;
    T.tries(() => { T.close(); keys.KeyS = true; T.press('KeyK', 6); keys.KeyS = false; step(60); T.idle(); }, T.done, 6);
    r.done = T.done();
  `);
  ck(!AT.err && AT.a === 1 && AT.b === 2 && AT.done, 'lesson ATTACK clears with a punch, a kick and a sweep: ' + js(AT));

  // 3 BLOCK: the dummy strikes; a hit taken shows the hint, then three blocks; then low kicks blocked crouching
  const BL = await L(`
    T.go(2, 0); r.beh = S().behaviour; const back = T.B() === 'KeyA' ? 'A' : 'D';
    r.miss = T.until(() => /BEFORE IT HITS/.test(S().msg), 600); r.missText = S().msg; r.wantMiss = 'HOLD ' + back + ' BEFORE IT HITS';
    keys[T.B()] = true; T.until(() => S().step >= 1, 1500); T.clr(); r.a = S().step; r.beh2 = S().behaviour;
    r.low = T.until(() => /HOLD S/.test(S().msg), 900); r.lowText = S().msg;
    keys.KeyS = true; T.until(T.done, 1500); T.clr(); r.done = T.done();
  `);
  ck(!BL.err && BL.beh === 'strike' && BL.miss && BL.missText === BL.wantMiss, 'BLOCK: a hit taken shows the hint with the right key: ' + js([BL.missText, BL.err]));
  ck(BL.a === 1 && BL.beh2 === 'low' && BL.low && BL.lowText === 'LOW ATTACK: HOLD S (CROUCH) TO BLOCK', 'BLOCK: three blocks clear the step, then the dummy kicks low and a standing guard gets the low hint: ' + js(BL));
  ck(BL.done, 'lesson BLOCK clears by blocking the low kicks crouching');

  // 4 CHAIN: J J J, then L too early (hint), then J and L on contact
  const CH = await L(`
    T.go(3, 0);
    T.tries(() => { T.close(); for (let i = 0; i < 4; i++) T.press('KeyJ', 6); step(40); T.idle(); }, () => S().step >= 1, 6); r.a = S().step;
    T.idle(); T.away(220); T.press('KeyL', 3); r.miss = T.until(() => /RIGHT AFTER/.test(S().msg), 60); r.missText = S().msg; T.idle(300);
    T.tries(() => { T.close(); pressed.KeyJ = true; T.until(() => P().contact, 20); T.press('KeyL', 40); T.idle(300); }, T.done, 6);
    r.done = T.done();
  `);
  ck(!CH.err && CH.a === 1 && CH.miss && CH.missText === 'PRESS L RIGHT AFTER THE HIT LANDS' && CH.done, 'lesson CHAIN clears with a 3 hit chain and a special cancel; a plain special shows the hint: ' + js(CH));

  // 5 THROW: forward + J up close; the dummy grabs after a warning: too late shows a hint, a quick J breaks free
  const TH = await L(`
    T.go(4, 0);
    T.tries(() => { T.close(); keys[T.F()] = true; T.press('KeyJ', 3); T.clr(); step(70); T.idle(); }, () => S().step >= 1, 6); r.a = S().step; r.beh = S().behaviour;
    r.tele = T.until(() => S().tele > 0, 600);
    r.late = T.until(() => /TOO LATE/.test(S().msg), 600); T.until(() => P().state !== 'down', 200);
    T.tries(() => { T.until(() => P().state === 'grabbed', 900); r.grabbed = P().state; T.press('KeyJ', 3); step(20); }, T.done, 4);
    r.done = T.done();
  `);
  ck(!TH.err && TH.a === 1 && TH.beh === 'grab' && TH.tele && TH.late && TH.done, 'lesson THROW clears with a throw and a tech; the dummy warns before it grabs and a late press gets the hint: ' + js(TH));

  // 6 SPECIAL: L, forward + L, down + L; the wrong one shows a hint
  const SP = await L(`
    T.go(5, 0);
    T.tries(() => { T.ready(); T.press('KeyL', 3); T.ready(); }, () => S().step >= 1, 4); r.a = S().step;
    T.ready(); const fk = T.F() === 'KeyD' ? 'D' : 'A'; T.press('KeyL', 3); r.missText = S().msg; r.want = 'OTHER MOVE: HOLD ' + fk + ' WHILE YOU PRESS L'; T.ready();
    T.tries(() => { T.ready(); if (T.gap() < 120) { T.away(200); T.ready(); } keys[T.F()] = true; T.press('KeyL', 3); T.clr(); T.ready(); }, () => S().step >= 2, 4); r.b = S().step;
    T.tries(() => { T.ready(); keys.KeyS = true; T.press('KeyL', 3); T.clr(); T.ready(); }, T.done, 4);
    r.done = T.done();
  `);
  ck(!SP.err && SP.a === 1 && SP.missText === SP.want && SP.b === 2 && SP.done, 'lesson SPECIAL clears with the three special moves; the wrong one shows which key to hold: ' + js(SP));

  // 7 SUPER: hits fill the bar, then I
  const SU = await L(`
    T.go(6, 0); r.m0 = P().meter;
    T.tries(() => { T.close(); T.press('KeyJ', 30); T.idle(); }, () => S().step >= 1, 30); r.a = S().step; r.m1 = P().meter;
    T.tries(() => { T.ready(); T.press('KeyI', 3); step(60); T.idle(300); }, T.done, 4);
    r.done = T.done();
  `);
  ck(!SU.err && SU.m0 >= 60 && SU.a === 1 && SU.m1 >= 100 && SU.done, 'lesson SUPER clears by filling the bar with hits and pressing I: ' + js(SU));

  // 8 DASH: dash in, backdash, then a hit straight out of a dash (a plain hit gets the hint)
  const DA = await L(`
    T.go(7, 0);
    T.tries(() => { T.idle(); step(16); T.dtap(T.F()); step(20); }, () => S().step >= 1, 4); r.a = S().step;
    T.tries(() => { T.idle(); step(16); T.dtap(T.B()); step(20); }, () => S().step >= 2, 4); r.b = S().step;
    step(60); T.close(); T.press('KeyJ', 20); r.missText = S().msg; r.want = 'DASH FIRST (TAP ' + (T.F() === 'KeyD' ? 'D' : 'A') + ' TWICE), THEN HIT'; T.idle();
    T.tries(i => { T.idle(); T.away(150 + i * 10); step(16); T.dtap(T.F()); T.until(() => T.gap() <= 75 || P().state !== 'dash', 30);
      if (T.gap() > 75) { keys[T.F()] = true; T.until(() => T.gap() <= 75, 30); T.clr(); }
      T.press('KeyJ', 30); T.idle(); }, T.done, 6);
    r.done = T.done();
  `);
  ck(!DA.err && DA.a === 1 && DA.b === 2 && DA.missText === DA.want && DA.done, 'lesson DASH clears with a dash, a backdash and a dash into a hit; a hit without a dash shows the hint: ' + js(DA));

  // 9 AIR: a ground kick shows the hint, then a jump-in kick; the dummy jumps in and is hit before it lands
  const AI = await L(`
    T.go(8, 0);
    T.close(); T.press('KeyK', 30); r.missText = S().msg; T.idle();
    T.tries(i => { T.idle(); T.away(150 + (i % 4) * 20); keys.KeyW = true; keys[T.F()] = true; step(4); keys.KeyW = false;
      T.until(() => T.gap() <= 105 || T.free(), 60); pressed.KeyK = true; T.until(() => T.free(), 90); T.clr(); }, () => S().step >= 1, 10);
    r.a = S().step; r.beh = S().behaviour;
    // right after a jump-in lands, the dummy stands in the corner for a moment (it backs away from a close player elsewhere, which also blocks): a hit there is too late
    T.tries(() => { T.idle(); T.until(() => !D().onGround, 400); T.until(() => D().onGround && D().state !== 'jump' && !D().busy(), 120);
      D().x = W - 70; P().x = W - 132; step(1); T.press('KeyJ', 12); T.idle(); }, () => /TOO LATE/.test(S().msg), 3);
    r.late = S().msg;
    let n = 0, swing = 0;
    while (!T.done() && n++ < 3000) {
      const p = P(), d = D();
      if (swing <= 0 && !d.onGround && d.vy > -4 && T.gap() <= 120 && T.free()) { pressed[(n & 1) ? 'KeyJ' : 'KeyK'] = true; swing = 24; }
      step(1); swing--;
    }
    r.n = n; r.done = T.done();
  `);
  ck(!AI.err && AI.missText === 'JUMP FIRST (W), THEN PRESS K' && AI.a === 1 && AI.beh === 'jumpin', 'AIR: a ground kick shows the hint, a jump-in kick clears the step: ' + js([AI.missText, AI.a, AI.err]));
  ck(AI.late === 'TOO LATE: HIT IT BEFORE IT LANDS' && AI.done, 'lesson AIR clears by hitting the jumping dummy before it lands; a hit on the ground is too late: ' + js(AI));

  // 10 GET UP: blocking the sweep gets a hint; J on landing rises at once; a direction + J rolls; then the list opens again
  const GU = await L(`
    T.go(9, 0); r.beh = S().behaviour; r.defense = typeof DEFENSE === 'object' && DEFENSE.on !== false;
    keys.KeyS = true; r.block = T.until(() => /DO NOT BLOCK/.test(S().msg), 600); T.clr();
    T.tries(() => { T.until(() => P().state === 'down', 600); r.now = S().msg; T.until(() => P().state === 'down' && P().onGround && P().vy >= 0, 80); T.press('KeyJ', 3); step(30); T.idle(); }, () => S().step >= 1, 4);
    r.a = S().step;
    T.tries(() => { T.until(() => P().state === 'down', 600); T.until(() => P().state === 'down' && P().onGround && P().vy >= 0, 80); keys[T.B()] = true; T.press('KeyJ', 3); T.clr(); step(40); T.idle(); }, T.done, 4);
    r.done = T.done(); r.bits = TUTORIAL.progress();
    T.until(() => game.phase === 'title', 200); step(2);
    r.end = { phase: game.phase, screen: S().screen, sel: S().sel, on: S().on }; r.draw = T.draw();
  `);
  ck(!GU.err && GU.beh === 'sweeper' && GU.block && GU.now === 'NOW: PRESS J!' && GU.a === 1 && GU.done, 'lesson GET UP clears with a quick rise and a roll; a block and a knockdown show their hints: ' + js(GU));
  ck(GU.end && GU.end.phase === 'title' && GU.end.screen === 'list' && GU.end.sel === 9 && !GU.end.on && GU.draw === 'ok', 'after the last lesson the game goes back to the lesson list: ' + js(GU.end));
  ck(GU.bits === 10, 'all ten lessons are marked clear: ' + GU.bits);

  // ---------- saved progress ----------
  await t.open('');
  await ev(HELP);
  const PR = await L(`
    hold(true); step(2); r.n = TUTORIAL.progress(); r.k = [0, 4, 9].map(TUTORIAL.isDone); r.raw = SETTINGS.get('tutorial.done');
    TUTORIAL.reset(); r.after = TUTORIAL.progress(); r.k2 = TUTORIAL.isDone(0);
  `);
  ck(!PR.err && PR.n === 10 && PR.k.every(Boolean) && PR.raw === 1023, 'progress survives a page load (SETTINGS tutorial.done = 1023): ' + js(PR));
  ck(PR.after === 0 && PR.k2 === false, 'TUTORIAL.reset() clears the progress');
}
