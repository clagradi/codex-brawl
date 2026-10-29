// Tests for defense.js (x-defense). Owner: the x-defense agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Fully deterministic: hold(true) freezes the real-time loop, only step() advances time and the keys are set directly (keys.KeyA = held back, pressed.KeyJ = a punch press).
// Covers the perfect guard (window, no chip, short blockstun, flash and chime), the guard pushback (meter, separation, invulnerability),
// quick rise / tech roll / stay down, air recovery, the wake-up reversal, the CPU's difficulty-tied use of both, and the on-screen hints.
import { readFileSync } from 'node:fs';

export async function run(t) {
  const ck = (c, m) => t.check(c, m), ev = code => t.eval(code);
  const dev = readFileSync(new URL('../../dev.html', import.meta.url), 'utf8');
  ck(/<script src="touch\.js"><\/script>\s*<script src="defense\.js"><\/script>/.test(dev), 'dev.html loads defense.js right after touch.js');

  await t.open('#demo=0,1&stop');
  const R = await ev(`(() => {
    hold(true); let n = 0; while (game.phase !== 'fight' && n++ < 2000) step(1);
    const [a, b] = game.f, out = {}, D = DEFENSE, rec = D.rec[0], rnd = Math.random; a.cpu = b.cpu = false;
    let chimes = 0; const ob = window.beep; window.beep = function (f) { if (f === 1320) chimes++; return ob.apply(this, arguments); };
    // fresh duel: a (left, faces right) defends, b attacks; 20 idle ticks first so the double-tap dash window of the previous run is over
    const setup = () => {
      for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; step(20);
      game.proj = []; game.fx = []; game.delayed = []; game.popups = []; game.hitstop = 0; game.slow = 0;
      for (const f of [a, b]) { f.set('idle'); f.inv = 0; f.cool = 0; f.hp = 100; f.meter = 0; f.vx = 0; f.vy = 0; f.y = GROUND; f.hidden = false; f.noTech = false; f.combo = 0; f.lastHitT = 0; f.cpu = false; }
      a.x = 400; b.x = 470; a.face = 1; b.face = -1; D.reset(); step(2);
    };
    // b punches (the hit lands on its 6th tick); a presses back "early" ticks before that tick (null = never)
    const guard = early => {
      setup(); const c0 = D.count.perfect; chimes = 0; b.startAtk('punch'); let peak = 0, flash = 0;
      for (let k = 0; k < 24; k++) { if (early != null && k === 5 - early) keys.KeyA = true; step(1); peak = Math.max(peak, rec.bstun); flash = Math.max(flash, D.state.flash); }
      keys.KeyA = false; return { early, hp: a.hp, pg: D.count.perfect - c0, peak, flash, chimes };
    };
    out.g0 = guard(0); out.g4 = guard(4); out.g5 = guard(5); out.none = guard(null);
    // blocked normally (back held from the start): then L spends meter and shoves b away
    const blocked = () => { setup(); b.startAtk('punch'); keys.KeyA = true; let k = 0; while (!(rec.bstun > 0) && k++ < 30) step(1); };
    blocked(); a.meter = 100; { const x0 = Math.abs(a.x - b.x), c0 = D.count.push; pressed.KeyL = true; let w = 0; while (w++ < 12 && D.count.push === c0) step(1);
      out.push = { n: D.count.push - c0, meter: a.meter, cost: D.meter().cost, bState: b.state, inv: a.inv, x0 }; step(14); out.push.gap = Math.abs(a.x - b.x) - x0; keys.KeyA = false; }
    blocked(); a.meter = 10; { const c1 = D.count.push; pressed.KeyL = true; step(8); out.nopush = { n: D.count.push - c1, meter: a.meter, bState: b.state }; keys.KeyA = false; pressed.KeyL = false; }
    // knocked down: measure the ticks from landing to standing for each option
    const down = mode => {
      setup(); a.cpu = !!mode.cpu; a.takeHit(b, 5, 3, 14, 'kick', { knock: true });
      let landed = -1, up = -1, hid = false, invMid = 0, xl = 0, k = 0;
      for (; k < 160; k++) {
        if (landed < 0 && a.onGround && a.state === 'down' && a.lie >= 1) { landed = k; xl = a.x; }
        if (landed >= 0 && mode.at === k - landed) { for (const c of mode.keys || []) keys[c] = true; if (mode.tap) pressed[mode.tap] = true; }
        if (mode.preAt != null && k === mode.preAt) pressed[mode.tap] = true;
        if (landed >= 0 && mode.release && k - landed === mode.release) for (const c of mode.keys) keys[c] = false;
        step(1); if (a.hidden) { hid = true; invMid = Math.max(invMid, a.inv); }
        if (landed >= 0 && up < 0 && a.state !== 'down') { up = k; break; }
      }
      for (const c of ['KeyD', 'KeyA', 'KeyS']) keys[c] = false; pressed.KeyJ = pressed.KeyK = false;   // let go of the stick, as a player would, and watch the roll play out
      step(24); return { landed, len: up - landed, dx: Math.round(a.x - xl), hid, invMid, hiddenAfter: a.hidden, st: a.state };
    };
    out.natural = down({}); const L0 = out.natural.landed;
    out.quickJ = down({ at: 2, tap: 'KeyJ' }); out.quickK = down({ at: 8, tap: 'KeyK' }); out.late = down({ at: 10, tap: 'KeyJ' });
    out.pre = down({ preAt: L0 - 2, tap: 'KeyJ' }); out.tooEarly = down({ preAt: L0 - 7, tap: 'KeyJ' });
    out.rollF = down({ at: 2, tap: 'KeyJ', keys: ['KeyD'], release: 8 }); out.rollB = down({ at: 2, tap: 'KeyJ', keys: ['KeyA'], release: 8 });
    out.stay = down({ at: 0, keys: ['KeyS'] });
    // air recovery: reeling in the air for more than 30 ticks, one button flips the victim out, once per combo
    setup(); a.takeHit(b, 5, 3, 14, 'punch', { launch: true }); a.vy = -20; { let k = 0; while (rec.air <= 31 && k++ < 90) step(1); }
    out.air = { before: rec.air, st0: a.state, up: !a.onGround }; { const c0 = D.count.air; pressed.KeyJ = true; step(1); out.air.n = D.count.air - c0; out.air.st = a.state; out.air.inv = a.inv;
      a.set('hurt'); a.y = GROUND - 150; a.vy = -10; rec.air = 40; pressed.KeyJ = true; step(1); out.air.again = D.count.air - c0; pressed.KeyJ = false; }
    setup(); a.takeHit(b, 5, 3, 14, 'punch', { launch: true }); a.vy = -20; step(8); { const c0 = D.count.air; pressed.KeyJ = true; step(1); out.airEarly = D.count.air - c0; pressed.KeyJ = false; }
    // wake-up reversal: special pressed just before standing up
    const wake = press => { setup(); a.takeHit(b, 5, 3, 14, 'kick', { knock: true }); const r0 = D.count.reversal; let landed = -1;
      for (let k = 0; k < 160; k++) { if (landed < 0 && a.onGround && a.state === 'down' && a.lie >= 1) landed = k; if (press && landed >= 0 && k - landed === 23) pressed.KeyL = true; step(1); if (landed >= 0 && a.state !== 'down') break; }
      step(1); pressed.KeyL = false; return { n: D.count.reversal - r0, inv: a.inv }; };
    out.wake = wake(true); out.wakeCtl = wake(false);
    // CPU: perfect guard and quick rise follow SETTINGS difficulty
    out.rates = {}; for (const d of ['easy', 'normal', 'hard']) { SETTINGS.set('difficulty', d); out.rates[d] = D.rates(); } SETTINGS.set('difficulty', 'normal');
    setup(); a.cpu = true; { const hp0 = a.hp, c0 = D.count.perfect; Math.random = () => 0.01; a.set('block'); a.takeHit(b, 5, 3, 14, 'punch'); out.cpuPg = { n: D.count.perfect - c0, kept: a.hp === hp0 };
      Math.random = () => 0.99; a.inv = 0; a.set('block'); a.takeHit(b, 5, 3, 14, 'punch'); out.cpuNoPg = { n: D.count.perfect - c0, chip: a.hp < hp0 }; Math.random = rnd; a.cpu = false; }
    SETTINGS.set('difficulty', 'easy'); Math.random = () => 0.4; out.cpuEasy = down({ cpu: true }); SETTINGS.set('difficulty', 'hard'); Math.random = () => 0.4; out.cpuHard = down({ cpu: true });
    SETTINGS.set('difficulty', 'normal'); Math.random = rnd;
    // the hints are drawn: round 1 strip while the clock is young, pause panel on pause
    setup(); const seen = [], ou = window.uiText; window.uiText = function (s) { seen.push(String(s)); return ou.apply(this, arguments); };
    game.round = 1; game.clock = 100; render(); out.hintFight = seen.filter(s => /PERFECT GUARD|KNOCKED DOWN/.test(s)).length;
    seen.length = 0; game.phase = 'pause'; render(); out.hintPause = seen.filter(s => /^DEFENSE|^KNOCKED DOWN/.test(s)).length; game.phase = 'fight'; window.uiText = ou; window.beep = ob;
    return out;
  })()`);

  const { g0, g4, g5, none } = R;
  ck(g0.pg === 1 && g0.hp === 100, 'back pressed on the tick a punch lands is a perfect guard: no chip damage ' + JSON.stringify(g0));
  ck(g4.pg === 1 && g4.hp === 100, 'back pressed 4 ticks before the hit is still a perfect guard ' + JSON.stringify(g4));
  ck(g5.pg === 0 && g5.hp < 100 && g5.hp > 95, 'back pressed 5 ticks early is an ordinary block with chip damage ' + JSON.stringify(g5));
  ck(none.pg === 0 && none.hp < 96, 'no guard takes the full hit ' + JSON.stringify(none));
  ck(g0.peak > 0 && g0.peak <= 4 && g5.peak > g0.peak, 'perfect guard cuts the blockstun to 4 ticks (ordinary block ' + g5.peak + ')');
  ck(g0.flash > 0 && g0.chimes >= 1 && g5.flash === 0 && g5.chimes === 0, 'perfect guard flashes the screen blue and plays the chime, an ordinary block does not');

  const p = R.push;
  ck(p.n === 1 && Math.abs(p.meter - (100 - p.cost)) < 1 && p.cost > 0, 'L during blockstun spends the guard cost in meter ' + JSON.stringify(p));
  ck(p.gap >= 60 && p.bState === 'hurt' && p.inv >= 8, 'pushback separates the fighters, staggers the attacker and makes the defender briefly invulnerable ' + JSON.stringify(p));
  ck(R.nopush.n === 0 && Math.abs(R.nopush.meter - 10) < 1, 'pushback without enough meter does nothing and keeps the meter ' + JSON.stringify(R.nopush));

  const nat = R.natural.len;
  ck(nat >= 20, 'a knockdown with no input lies there for the normal time (' + nat + ' ticks)');
  ck(R.quickJ.len <= nat - 10 && R.quickJ.st === 'idle', 'P within 10 ticks of landing is a quick rise: ' + R.quickJ.len + ' ticks instead of ' + nat);
  ck(R.quickK.len <= nat - 10, 'K on the last tick of the window is a quick rise too: ' + R.quickK.len + ' ticks');
  ck(R.late.len === nat && R.tooEarly.len === nat, 'a press after the window or long before landing changes nothing (' + R.late.len + ', ' + R.tooEarly.len + ')');
  ck(R.pre.len <= nat - 10, 'a press in the last ticks of the fall is kept: ' + R.pre.len + ' ticks');
  ck(R.rollF.dx >= 40 && R.rollB.dx <= -40, 'P with a direction rolls that way (forward ' + R.rollF.dx + ', back ' + R.rollB.dx + ' px)');
  ck(R.rollF.hid && R.rollF.invMid > 0 && !R.rollF.hiddenAfter && R.rollF.st === 'idle', 'a roll is invulnerable while it lasts and the fighter is back on his feet afterwards ' + JSON.stringify(R.rollF));
  ck(R.stay.len >= nat + 15, 'holding down stays down longer: ' + R.stay.len + ' ticks instead of ' + nat);

  ck(R.air.up && R.air.before > 30 && R.air.n === 1 && R.air.st === 'jump' && R.air.inv >= 8, 'air recovery after 30 ticks of juggle flips the victim out of the combo ' + JSON.stringify(R.air));
  ck(R.air.again === 1, 'air recovery works once per combo');
  ck(R.airEarly === 0, 'a button early in a juggle does not trigger air recovery');
  ck(R.wake.n === 1 && R.wakeCtl.n === 0 && R.wake.inv >= R.wakeCtl.inv + 5, 'a special on the first tick of getting up adds invulnerable ticks ' + JSON.stringify([R.wake, R.wakeCtl]));

  const r = R.rates;
  ck(r.easy.pg < r.normal.pg && r.normal.pg < r.hard.pg && r.easy.rise < r.normal.rise && r.normal.rise < r.hard.rise, 'CPU perfect guard and quick rise rates grow with the difficulty setting ' + JSON.stringify(r));
  ck(R.cpuPg.n === 1 && R.cpuPg.kept && R.cpuNoPg.n === 1 && R.cpuNoPg.chip, 'a CPU victim perfect-guards when its roll succeeds and takes chip damage when it fails ' + JSON.stringify([R.cpuPg, R.cpuNoPg]));
  ck(R.cpuHard.len <= R.cpuEasy.len - 10, 'the same dice make a hard CPU quick rise while an easy one lies there (' + R.cpuHard.len + ' vs ' + R.cpuEasy.len + ')');
  ck(R.hintFight >= 2 && R.hintPause >= 2, 'the round 1 strip and the pause screen list the defense inputs (' + R.hintFight + ', ' + R.hintPause + ')');
}
