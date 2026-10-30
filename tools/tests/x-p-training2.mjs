// Tests for p-training2.js (the TRAINING mode). Owner: the p-training2 agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Fully deterministic: hold(true) freezes the real-time loop, only step() advances time, keys are set directly (keys.KeyD = held, pressed.KeyJ = one press).
// Covers the mode registration, the input display, the frame-advantage readout (checked against docs/FRAMEDATA.md), every dummy behaviour (stand, crouch,
// jump, block all against mids, lows and overheads, block after the first hit), the 5 second record and looped playback, the hitbox overlay, the input
// display toggle, the position reset and corner reset, the endless round (no KO, frozen clock, health and meter refill), the pause keys, keys bound to
// actions being left alone, and that other modes are untouched.
import { readFileSync } from 'node:fs';

export async function run(t) {
  const ck = (c, m) => t.check(c, 'training2: ' + m), ev = code => t.eval(code);
  const dev = readFileSync(new URL('../../dev.html', import.meta.url), 'utf8');
  ck(/<script src="vfx\.js"><\/script>\s*<script src="p-training2\.js"><\/script>/.test(dev), 'dev.html loads p-training2.js right after vfx.js');
  // Tibo's punch row in docs/FRAMEDATA.md: "+6 / +7" on hit (P1 attacker first) and "-8" on block
  const fd = readFileSync(new URL('../../docs/FRAMEDATA.md', import.meta.url), 'utf8');
  const tibo = fd.slice(fd.indexOf('## TIBO')), row = name => (tibo.split('\n').find(l => l.startsWith('| ' + name + ' |')) || '').split('|').map(s => s.trim());
  const punchHit = parseInt(row('punch')[10], 10), punchBlock = parseInt(row('punch')[11], 10);
  ck(Number.isFinite(punchHit) && Number.isFinite(punchBlock), 'FRAMEDATA.md has the punch advantage (' + punchHit + ' / ' + punchBlock + ')');

  await t.open();
  // page helpers: start a training match, set up a clean duel, spy on the dummy's input after the training hook
  await ev(`window.__t2 = (() => {
    const clr = () => { for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; };
    const start = (p1 = 0, p2 = 1) => { hold(true); clr(); MODES.pick('training'); game.sel = [p1, p2]; game.arenaPick = 0; startMatch(); let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1); clr(); return game.phase; };
    const duel = (gap = 70, mode = 'stand') => {
      const [a, b] = game.f; SETTINGS.set('training2.dummy', mode); clr(); step(20);
      game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const f of [a, b]) { f.set('idle'); f.inv = 0; f.cool = 0; f.hp = f.d.hp; f.vx = 0; f.vy = 0; f.y = GROUND; f.combo = 0; }
      a.x = 420; b.x = 420 + gap; a.face = 1; b.face = -1; if (window.DEFENSE && DEFENSE.reset) DEFENSE.reset();
      const S = TRAINING2.state(); S.meas = null; S.adv = null; S.guardT = 0; S.combo = { hits: 0, dmg: 0 }; S.rec.mode = 'idle'; step(2);
    };
    const log = { hit: 0, block: 0, ko: 0, last: null };
    BUS.on('hit', e => { if (e.victim === game.f[1]) { log.hit++; log.last = 'hit'; } });
    BUS.on('block', e => { if (e.victim === game.f[1]) { log.block++; log.last = 'block'; log.d = window.__di && window.__di.d; } });
    BUS.on('ko', () => { log.ko++; });
    HOOKS.add('input', (i, side) => { if (side === 1 && i) window.__di = Object.assign({}, i); }, -999);
    // step until the readout has a fresh result (or n ticks)
    const advAfter = (n = 120) => { let k = 0; while (!TRAINING2.state().adv && k++ < n) step(1); return TRAINING2.state().adv; };
    const waitContact = (n = 60) => { const c = log.hit + log.block; let k = 0; while (log.hit + log.block === c && k++ < n) step(1); return log.hit + log.block > c ? log.last : null; };
    return { clr, start, duel, log, advAfter, waitContact };
  })(); 1`);

  // ---- registration ----
  const reg = await ev(`(() => { const m = MODES.get('training'), items = titleItems();
    return { marker: window.STUB_P_TRAINING2, label: m && m.label, order: m && m.order, players: m && m.players, i0: items[0] && items[0].id, i1: items[1] && items[1].id,
      inMenu: items.some(x => x.id === 'training'), defs: ['training2.dummy', 'training2.hitbox', 'training2.inputs', 'training2.refill'].map(k => SETTINGS.get(k)) }; })()`);
  ck(reg.marker === 1, 'p-training2.js loaded');
  ck(reg.label === 'TRAINING' && reg.order === 27 && reg.players === 1 && reg.inMenu, 'TRAINING mode registered (order 27, 1 player) and on the title menu');
  ck(reg.i0 === 'versus' && reg.i1 === 'versus2', 'the first two title entries are still 1 PLAYER VS CPU and 2 PLAYERS');
  ck(JSON.stringify(reg.defs) === JSON.stringify(['stand', false, true, true]), 'settings defaults: dummy STAND, hitboxes off, input display on, refill on');

  const st = await ev(`(() => { const ph = __t2.start(0, 3); const [a, b] = game.f; return { ph, mode: game.modeId, cpu0: a.cpu, cpu1: b.cpu, ids: [a.d.id, b.d.id] }; })()`);
  ck(st.ph === 'fight' && st.mode === 'training', 'a training match reaches the fight');
  ck(st.cpu0 === false && st.cpu1 === false, 'the dummy is not driven by the CPU AI');

  // ---- input display ----
  const inp = await ev(`(() => {
    __t2.duel(200); const S = TRAINING2.state(), out = {}; S.hist = [];
    keys.KeyD = true; step(5); keys.KeyD = false; step(3); keys.KeyS = true; keys.KeyA = true; step(4); keys.KeyS = false; keys.KeyA = false; pressed.KeyJ = true; step(1);
    out.first = S.hist.slice(0, 4).map(e => [e.dir, e.b, e.n]);
    __t2.duel(200); S.hist = []; for (let k = 0; k < 30; k++) { keys.KeyW = false; keys.KeyD = k % 2 === 0; step(1); }
    keys.KeyD = false; out.len = S.hist.length;
    // facing left: holding D (right) is back, 4
    __t2.duel(200); const [a, b] = game.f; a.x = 640; b.x = 420; step(2); S.hist = []; keys.KeyD = true; step(3); keys.KeyD = false; out.mirror = S.hist[0] && S.hist[0].dir; out.face = a.face;
    __t2.clr(); return out; })()`);
  ck(JSON.stringify(inp.first) === JSON.stringify([[6, 0, 5], [5, 0, 3], [1, 0, 4], [5, 1, 1]]), 'input display logs forward x5, neutral x3, down-back x4, then the punch press: ' + JSON.stringify(inp.first));
  ck(inp.len === 12, 'input display keeps the last 12 inputs (' + inp.len + ')');
  ck(inp.face === -1 && inp.mirror === 4, 'directions are relative to the facing: right while facing left reads as back (4)');

  // ---- frame advantage ----
  const fa = await ev(`(() => {
    const out = {}, S = TRAINING2.state(), [a, b] = game.f;
    __t2.duel(70, 'stand'); pressed.KeyJ = true; step(1); out.hit = __t2.waitContact(); out.onHit = __t2.advAfter();
    // independent count from the contact: advancing ticks (the clock moves) until each fighter is out of its attack, stun or block stun
    const indep = (mode, ev) => {
      __t2.duel(70, mode); let c = null, n = 0, ua = null, uv = null; const ok = f => !f.busy() && f.onGround && !(window.DEFENSE && DEFENSE.rec[f.side].bstun > 0);
      const off = BUS.on(ev, () => { c = game.clock; });
      pressed.KeyJ = true; for (let k = 0; k < 120 && (ua == null || uv == null); k++) { const c0 = game.clock; step(1); if (c == null) continue; if (game.clock !== c0) { n++; if (ua == null && ok(a)) ua = n; if (uv == null && ok(b)) uv = n; } }
      off(); return uv - ua;
    };
    out.indep = indep('stand', 'hit'); out.indepBlock = indep('block', 'block');
    __t2.duel(70, 'block'); pressed.KeyJ = true; step(1); out.blk = __t2.waitContact(); out.onBlock = __t2.advAfter();
    __t2.duel(70, 'block'); keys.KeyS = true; pressed.KeyK = true; step(2); keys.KeyS = false; out.sweep = __t2.waitContact(); out.sweepAdv = __t2.advAfter();
    __t2.duel(70, 'stand'); b.startAtk('punch'); out.dummyAtk = __t2.advAfter();
    out.combo = null; __t2.duel(70, 'stand'); pressed.KeyJ = true; step(1); __t2.waitContact(); for (let k = 0; k < 6; k++) step(1); pressed.KeyJ = true; __t2.waitContact(); out.combo = Object.assign({}, S.combo);
    __t2.clr(); return out; })()`);
  ck(fa.hit === 'hit' && fa.onHit && fa.onHit.kind === 'hit' && fa.onHit.side === 0, 'a punch on the standing dummy hits and the readout shows ON HIT');
  ck(fa.onHit && fa.onHit.adv === punchHit, 'punch on hit reads ' + (fa.onHit && fa.onHit.adv) + ', FRAMEDATA.md says ' + punchHit);
  ck(fa.onHit && fa.onHit.adv === fa.indep, 'the readout matches a separate tick count (' + fa.indep + ')');
  // FRAMEDATA.md lists the base game, which has no block stun; defense.js adds one, so on block the readout is checked against the separate count instead
  ck(fa.blk === 'block' && fa.onBlock && fa.onBlock.kind === 'block' && fa.onBlock.adv === fa.indepBlock && fa.onBlock.adv < 0 && fa.onBlock.adv >= punchBlock,
    'punch on block reads ' + (fa.onBlock && fa.onBlock.adv) + ' (separate count ' + fa.indepBlock + ', base game without block stun ' + punchBlock + ')');
  ck(fa.sweep === 'block' && fa.sweepAdv && fa.sweepAdv.adv < fa.onBlock.adv, 'a blocked sweep is more negative than a blocked punch (' + (fa.sweepAdv && fa.sweepAdv.adv) + ')');
  ck(fa.dummyAtk && fa.dummyAtk.side === 1, 'a dummy attack is measured too, with the dummy as the attacker');
  ck(fa.combo && fa.combo.hits === 2 && fa.combo.dmg > 0, 'a two-hit chain counts as a 2 hit combo with its damage (' + JSON.stringify(fa.combo) + ')');

  // ---- dummy behaviours ----
  const dm = await ev(`(() => {
    const out = {}, [a, b] = game.f, L = __t2.log, inp = () => Object.keys(__di).filter(k => __di[k]).join('');
    __t2.duel(200, 'stand'); keys.KeyS = true; step(6); out.stand = inp(); out.standState = b.state; keys.KeyS = false;
    __t2.duel(200, 'crouch'); step(6); out.crouch = inp();
    __t2.duel(200, 'jump'); let air = false; for (let k = 0; k < 30; k++) { step(1); if (b.y < GROUND - 20) air = true; } out.jump = inp(); out.air = air;
    // block all: a mid, a low (dummy crouches), an air attack coming down (dummy stands)
    __t2.duel(70, 'block'); let h0 = L.hit; pressed.KeyJ = true; step(1); out.mid = __t2.waitContact(); out.midD = L.d;
    __t2.duel(70, 'block'); keys.KeyS = true; pressed.KeyJ = true; step(2); keys.KeyS = false; out.low = __t2.waitContact(); out.lowD = L.d;
    out.air = air; out.ovh = null;
    for (let w = 0; w < 30 && !out.ovh; w += 2) {
      __t2.duel(150, 'block'); keys.KeyW = true; keys.KeyD = true; step(2); keys.KeyW = false; step(w); keys.KeyD = false;
      let k = 0; while (k++ < 40 && !(a.vy > 0)) step(1); pressed.KeyK = true; out.ovh = __t2.waitContact(50); out.ovhD = L.d; out.ovhAtt = a.atk || a.state;
      let g = 0; while (g++ < 80 && !a.onGround) step(1);
    }
    out.hitsInBlock = L.hit - h0;
    // block after hit: the first punch lands, the next one is blocked, a quiet second later it lands again
    __t2.duel(70, 'after'); pressed.KeyJ = true; step(1); out.after1 = __t2.waitContact(); step(30); a.x = 420; b.x = 490; pressed.KeyJ = true; step(1); out.after2 = __t2.waitContact();
    step(30 + 70); a.x = 420; b.x = 490; pressed.KeyJ = true; step(1); out.after3 = __t2.waitContact();
    __t2.clr(); return out; })()`);
  ck(dm.stand === '' && dm.standState === 'idle', 'STAND: the dummy gets no input at all (P1 keys do not drive it)');
  ck(dm.crouch === 'd', 'CROUCH: the dummy holds down');
  ck(dm.jump === 'u' && dm.air, 'JUMP: the dummy holds up and leaves the ground');
  ck(dm.mid === 'block' && dm.midD === true, 'BLOCK ALL: a punch is blocked (crouch guard)');
  ck(dm.low === 'block' && dm.lowD === true, 'BLOCK ALL: a low punch is blocked crouching');
  ck(dm.ovh === 'block' && dm.ovhD === false, 'BLOCK ALL: an air kick coming down is blocked standing (' + dm.ovh + ', ' + dm.ovhAtt + ')');
  ck(dm.hitsInBlock === 0, 'BLOCK ALL: nothing landed on the dummy');
  ck(dm.after1 === 'hit' && dm.after2 === 'block' && dm.after3 === 'hit', 'BLOCK AFTER HIT: hit, then blocked, then hit again after a quiet second (' + [dm.after1, dm.after2, dm.after3] + ')');

  // ---- record and playback ----
  const rp = await ev(`(() => {
    const out = {}, [a, b] = game.f, S = TRAINING2.state(); __t2.duel(200, 'stand'); TRAINING2.reset(); step(2);
    const ax0 = a.x, bx0 = b.x; pressed.Digit2 = true; step(1); out.mode = S.rec.mode;
    const xs = []; keys.KeyA = true; for (let k = 0; k < 60; k++) { step(1); xs.push(b.x); } keys.KeyA = false; out.p1Still = Math.abs(a.x - ax0) < 0.01; out.dummyFwd = b.x < bx0 - 30;
    step(30); keys.KeyD = true; step(60); keys.KeyD = false; let k = 0; while (S.rec.mode === 'rec' && k++ < 400) step(1);
    out.len = S.rec.frames.length; out.after = S.rec.mode; out.f10 = S.rec.frames[10] && S.rec.frames[10].f; out.b120 = S.rec.frames[120] && S.rec.frames[120].b;
    TRAINING2.reset(); step(2); pressed.Digit3 = true; step(1); out.play = S.rec.mode;
    const seq = [], ps = []; for (let j = 0; j < 610; j++) { step(1); seq.push(__di.l ? 'L' : __di.r ? 'R' : '.'); if (j < 60) ps.push(b.x); }
    const want = S.rec.frames.map(f => f.f ? 'L' : f.b ? 'R' : '.');
    let bad = 0; for (let j = 0; j < seq.length; j++) if (seq[j] !== want[(j + 1) % 300]) bad++;
    let bad0 = 0; for (let j = 0; j < seq.length; j++) if (seq[j] !== want[j % 300]) bad0++;
    out.bad = Math.min(bad, bad0); out.loopMode = S.rec.mode; out.drift = Math.max(...ps.map((x, j) => Math.abs(x - xs[j])));
    pressed.Digit3 = true; step(1); out.stopped = S.rec.mode;
    __t2.clr(); return out; })()`);
  ck(rp.mode === 'rec', 'key 2 starts recording');
  ck(rp.p1Still && rp.dummyFwd, 'while recording P1 stands still and the keys drive the dummy (left walks it towards P1)');
  ck(rp.len === 300 && rp.after === 'idle', 'the recording stops by itself after 5 seconds (300 ticks)');
  ck(rp.f10 === true && rp.b120 === true, 'frames are stored relative to the dummy facing (left = forward, right = back)');
  ck(rp.play === 'play', 'key 3 plays the recording');
  ck(rp.bad === 0 && rp.loopMode === 'play', 'playback feeds back exactly the recorded inputs and loops past 5 seconds');
  ck(rp.drift < 0.5, 'after a reset the playback walks the dummy along the same path as the recording (drift ' + rp.drift + ')');
  ck(rp.stopped === 'idle', 'key 3 again stops the playback');

  // ---- hitboxes, input display toggle, reset, pause keys ----
  const ui = await ev(`(() => {
    const out = {}, [a, b] = game.f, S = TRAINING2.state(); __t2.duel(70, 'stand');
    const cp = CanvasRenderingContext2D.prototype, of = cp.fillRect, op = window.ptext; let rects = 0, words = [];
    cp.fillRect = function () { rects++; return of.apply(this, arguments); }; window.ptext = function (c, s) { words.push(String(s)); return op.apply(this, arguments); };
    const frame = () => { rects = 0; words = []; render(); return { rects, words: words.slice() }; };
    try {
      const r0 = frame(); pressed.Digit4 = true; step(1); out.hb = SETTINGS.get('training2.hitbox'); a.startAtk('punch'); step(5); const r1 = frame();
      out.moreRects = r1.rects - r0.rects; pressed.Digit4 = true; step(1); out.hbOff = SETTINGS.get('training2.hitbox');
      out.panels = ['INPUTS', 'FRAMES'].map(w => r0.words.includes(w)); pressed.Digit5 = true; step(1); out.inOff = SETTINGS.get('training2.inputs');
      const r2 = frame(); out.noInputs = !r2.words.includes('INPUTS') && r2.words.includes('FRAMES'); pressed.Digit5 = true; step(1); out.inOn = SETTINGS.get('training2.inputs');
    } finally { cp.fillRect = of; window.ptext = op; }
    step(30); a.x = 200; b.x = 250; b.hp = 10; a.hp = 20; const r0 = S.resets; pressed.KeyR = true; step(1);
    out.reset = { resets: S.resets - r0, ax: Math.round(a.x), bx: Math.round(b.x), bhp: b.hp === b.d.hp, ahp: a.hp === a.d.hp, wantA: Math.round(W * 0.32), wantB: Math.round(W * 0.68) };
    keys.KeyA = true; pressed.KeyR = true; step(1); keys.KeyA = false; out.left = { ax: a.x, bx: b.x };
    step(10); keys.KeyD = true; pressed.KeyR = true; step(1); keys.KeyD = false; out.right = { ax: a.x, bx: b.x };
    // pause keys
    step(10); const d0 = SETTINGS.get('training2.dummy'); game.phase = 'pause'; out.items = HOOKS.collect('pauseItems').map(i => i.label);
    pressed.Digit1 = true; step(1); out.cycled = [d0, SETTINGS.get('training2.dummy')]; pressed.KeyP = true; step(1); out.back = game.phase;
    // a key bound to an action is left alone
    SETTINGS.set('training2.dummy', 'stand'); MAP[0].x.push('Digit1'); try { pressed.Digit1 = true; step(1); out.boundKept = SETTINGS.get('training2.dummy'); } finally { MAP[0].x.pop(); }
    __t2.clr(); return out; })()`);
  ck(ui.hb === true && ui.hbOff === false, 'key 4 turns the hitbox overlay on and off');
  ck(ui.moreRects >= 3, 'the hitbox overlay draws the hurtboxes and the attack box (' + ui.moreRects + ' more rects)');
  ck(ui.panels[0] && ui.panels[1], 'the HUD shows the INPUTS and FRAMES panels');
  ck(ui.inOff === false && ui.noInputs && ui.inOn === true, 'key 5 hides and shows the input display');
  ck(ui.reset.resets === 1 && Math.abs(ui.reset.ax - ui.reset.wantA) <= 4 && Math.abs(ui.reset.bx - ui.reset.wantB) <= 4 && ui.reset.bhp && ui.reset.ahp, 'R resets positions and health ' + JSON.stringify(ui.reset));
  ck(ui.left.bx <= 70 && ui.left.ax > ui.left.bx, 'R + left puts the dummy in the left corner, P1 in front of it');
  ck(ui.right.bx >= 960 - 70 && ui.right.ax < ui.right.bx, 'R + right puts the dummy in the right corner');
  const mine = ui.items.filter(l => /^[145] (DUMMY|HITBOXES|INPUTS) /.test(l));
  ck(mine.length === 3 && mine[0] === '1 DUMMY STAND', 'the pause screen lists the training keys: ' + mine.join(', '));
  ck(ui.cycled[0] !== ui.cycled[1] && ui.back === 'fight', 'key 1 on the pause screen changes the dummy behaviour');
  ck(ui.boundKept === 'stand', 'a training key the player bound to an action is not taken over');

  // ---- endless round ----
  const er = await ev(`(() => {
    const out = {}, [a, b] = game.f, L = __t2.log; __t2.duel(70, 'stand'); const ko0 = L.ko, t0 = game.timer;
    b.hp = 3; for (let k = 0; k < 4; k++) { a.x = 420; b.x = 490; pressed.KeyK = true; step(1); __t2.waitContact(); step(40); if (b.hp < out.min || out.min == null) out.min = b.hp; }
    a.hp = 2; a.x = 420; b.x = 490; b.startAtk('kick'); step(30); out.ahp = a.hp;
    out.ko = L.ko - ko0; out.phase = game.phase;
    step(700); out.timer = [t0, game.timer]; out.hpBack = b.hp === b.d.hp; out.meter = a.meter;
    SETTINGS.set('training2.refill', false); b.hp = 30; step(90); out.noRefill = b.hp; SETTINGS.set('training2.refill', true); step(60); out.refill = b.hp === b.d.hp;
    return out; })()`);
  ck(er.min >= 1 && er.ahp >= 1 && er.ko === 0 && er.phase === 'fight', 'nobody is knocked out: health stops at 1 (dummy ' + er.min + ', P1 ' + er.ahp + ')');
  ck(er.timer[0] === er.timer[1], 'the round clock does not run down (' + er.timer + ')');
  ck(er.hpBack && er.meter === 100, 'health refills after a quiet moment and P1 keeps a full meter');
  ck(er.noRefill === 30 && er.refill, 'the refill can be turned off in SETTINGS');

  // ---- other modes are untouched ----
  const vs = await ev(`(() => {
    const out = {}; __t2.clr(); MODES.pick('versus'); game.sel = [0, 1]; startMatch(); let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
    const [a, b] = game.f; a.cpu = b.cpu = false; const t0 = game.timer; step(130); out.timer = [t0, game.timer];
    game.modeId = 'training'; const x = {}; out.flipOnly = HOOKS.filter('input', x, 1, b) === x && HOOKS.filter('damage', { src: a, victim: b, dmg: 500, kb: 3, stun: 10, kind: 'punch', guarding: false, opt: {} }).dmg > b.hp; game.modeId = 'versus';
    const op = window.ptext, words = []; window.ptext = function (c, s) { words.push(String(s)); return op.apply(this, arguments); }; try { render(); } finally { window.ptext = op; }
    out.panel = words.includes('FRAMES') || words.includes('INPUTS');
    b.hp = 2; a.x = 420; b.x = 490; a.face = 1; b.face = -1; a.startAtk('kick'); for (let k = 0; k < 40 && b.hp > 0; k++) step(1); out.bhp = b.hp;
    out.items = HOOKS.collect('pauseItems').some(i => /DUMMY/.test(i.label || ''));
    return out; })()`);
  ck(vs.timer[1] < vs.timer[0], 'in versus the clock still runs down');
  ck(!vs.panel && !vs.items, 'in versus there is no training HUD and no training pause keys');
  ck(vs.bhp === 0, 'in versus a hit still knocks out (no health floor)');
  ck(vs.flipOnly, 'only fighters of a real training match are driven: flipping game.modeId alone changes nothing');

  // leave the shared state as it was
  await ev(`(() => { hold(true); for (const k of ['training2.dummy', 'training2.hitbox', 'training2.inputs', 'training2.refill']) SETTINGS.reset(k); MODES.pick('versus'); setPhase('title'); return 1; })()`);
}
