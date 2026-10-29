// Tests for vfx.js (cut-in, hit-stop tiers, impact frames, KO slow motion, instant replay, accessibility). Owner: the vfx agent. Runs after core.mjs.
// Everything is driven with hold(true) and step(n), so the checks are deterministic; render() is called at the key moments to run the draw hooks.
// Hooks used by vfx.js: update, damage, drawWorld, drawHud, drawTop. Settings: vfx.replay, vfx.cutin, vfx.impact.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    window.V = {};
    V.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    V.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    V.fresh = (i, j, wins) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); V.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; if (wins) game.wins = wins.slice(); step(1); return [a, b];
    };
    V.place = (dx) => {
      const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; }
      f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o];
    };
    V.sum = () => { const d = ctx.getImageData(0, 0, 960, 540).data; let s = 0; for (let k = 0; k < d.length; k += 97) s = (s * 31 + d[k]) | 0; return s; };
  })()`);

  // ---- structure and settings ----
  const s0 = await ev(`({ api: typeof VFX === 'object' && typeof VFX.state === 'function', tiers: JSON.stringify(VFX.tiers), keys: ['vfx.replay', 'vfx.cutin', 'vfx.impact'].map(k => SETTINGS.get(k)),
    hooks: ['update', 'damage', 'drawWorld', 'drawHud', 'drawTop'].every(h => HOOKS.has(h)) })`);
  check(s0.api && s0.hooks, 'VFX is loaded and uses the update, damage, drawWorld, drawHud and drawTop hooks');
  check(s0.tiers === '{"light":3,"medium":5,"heavy":8,"super":12}' && s0.keys.every(v => v === true), 'hit-stop tiers are 3 / 5 / 8 / 12 and the vfx settings default to on');

  // ---- hit-stop tiers, counters, impact frames, sparks ----
  const h = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = {}; V.place(260);
    const hitWith = (kind, dmg, o, state) => { V.place(260); step(30); b.inv = 0; b.hp = b.d.hp; b.set(state || 'idle'); game.hitstop = 0; b.takeHit(a, dmg, 3, 10, kind, o || {}); return game.hitstop; };
    out.light = hitWith('punch', 4); out.lightImpact = VFX.state().impact; out.sparks = VFX.state().sparks;
    out.medium = hitWith('kick', 8);
    out.counter = hitWith('punch', 4, {}, 'punch'); out.counterImpact = VFX.state().impact;
    step(30); out.heavy = hitWith('hit', 14, { knock: true }); out.heavyImpact = VFX.state().impact; render(); out.renderedImpact = V.sum();
    step(1); out.impact1 = VFX.state().impact; step(1); out.impact2 = VFX.state().impact;
    step(30); out.super = hitWith('super', 30); out.superImpact = VFX.state().impact;
    step(30); out.gapA = hitWith('hit', 14, { knock: true }); out.gapStart = VFX.state().impact; step(4); out.gapEnded = VFX.state().impact;
    b.inv = 0; b.hp = b.d.hp; b.set('idle'); game.hitstop = 0; b.takeHit(a, 14, 3, 10, 'hit', { knock: true }); out.gapB = VFX.state().impact;
    return out;
  })()`);
  check(h.light === 3 && h.medium === 5 && h.counter >= 5 && h.heavy === 8 && h.super === 12, 'hit-stop is 3 for a light hit, 5 medium (a counter bumps a light one at least to medium; combat.js may push it higher), 8 heavy, 12 super: ' + JSON.stringify([h.light, h.medium, h.counter, h.heavy, h.super]));
  check(h.lightImpact === -1 && h.counterImpact === 0 && h.heavyImpact === 0 && h.superImpact === 0, 'impact frames start on counters, heavy hits and supers but not on light hits: ' + JSON.stringify([h.lightImpact, h.counterImpact, h.heavyImpact, h.superImpact]));
  check(h.impact1 === 1 && h.impact2 === -1, 'an impact lasts exactly 2 frames: ' + h.impact1 + ',' + h.impact2);
  check(h.sparks >= 1, 'a hit spawns a styled spark');
  check(h.gapStart === 0 && h.gapEnded === -1 && h.gapB === -1, 'impact frames keep a cooldown so they cannot strobe: ' + JSON.stringify([h.gapStart, h.gapEnded, h.gapB]));

  // ---- super cut-in: freeze, then the move plays ----
  const c = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = {}; V.place(300); a.meter = 100; step(1); V.T('KeyI'); step(1);
    out.state = a.state; out.hs = game.hitstop; const st = VFX.state(); out.cut = st.cut; out.name = a.mv && a.mv.name; out.punch = st.punch;
    const s0 = a.st; render(); out.during = V.sum(); out.stDuring = [];
    step(20); render(); out.mid = VFX.state().cut && VFX.state().cut.t; out.frozen = a.st === s0;
    step(19); out.last = VFX.state().cut && VFX.state().cut.t; out.hsLast = game.hitstop; out.frozenLast = a.st === s0;
    step(1); out.endCut = VFX.state().cut; out.hsEnd = game.hitstop; out.stillFrozen = a.st === s0;
    step(1); out.moves = a.st > s0; out.cam = game.cam.zoom;
    return out;
  })()`);
  check(c.state === 'super' && c.hs === 40 && c.cut && c.cut.label === 'SUPER' && c.cut.name === c.name, 'a super freezes the game for 40 ticks and shows the cut-in with the move name: ' + JSON.stringify([c.state, c.hs, c.cut]));
  check(c.frozen && c.mid === 20 && c.last === 39 && c.hsLast === 1 && c.frozenLast && c.endCut === null && c.hsEnd === 0 && c.stillFrozen && c.moves, 'the fighters stay frozen for exactly 40 ticks, then the move plays: ' + JSON.stringify([c.frozen, c.mid, c.last, c.hsLast, c.endCut, c.hsEnd, c.stillFrozen, c.moves]));
  check(c.punch >= 0, 'a super punches the camera in');
  const off = await ev(`(() => { SETTINGS.set('vfx.cutin', false); const [a] = V.fresh(0, 1); V.place(300); a.meter = 100; step(1); V.T('KeyI'); step(1); const r = { cut: VFX.state().cut, hs: game.hitstop }; SETTINGS.set('vfx.cutin', true); return r; })()`);
  check(off.cut === null && off.hs <= 10, 'vfx.cutin off keeps the engine freeze only: ' + JSON.stringify(off));

  // ---- KO slow motion: quarter speed, impact zoom, deterministic ----
  const ko = () => ev(`(() => {
    const [a, b] = V.fresh(0, 1), tr = []; V.place(120); a.meter = 0; step(1); b.hp = 1; b.inv = 0; b.takeHit(a, 6, 7, 15, 'punch');
    const hs0 = game.hitstop; let freeze = 0; while (game.hitstop > 0 && freeze < 40) { step(1); freeze++; tr.push([game.phaseT, Math.round(b.x * 100), b.st, Math.round(game.cam.zoom * 1000)]); }
    const st0 = b.st; let zmax = 0; for (let k = 0; k < 40; k++) { step(1); zmax = Math.max(zmax, game.cam.zoom); tr.push([game.phaseT, Math.round(b.x * 100), b.st, Math.round(game.cam.zoom * 1000)]); }
    const advanced = b.st - st0; for (let k = 0; k < 60; k++) { step(1); tr.push([game.phaseT, Math.round(b.x * 100), b.st, Math.round(game.cam.zoom * 1000)]); }
    return { phase: game.phase, hs0, advanced, zmax, pending: VFX.state().pending, plays: VFX.state().plays, slow: VFX.state().slow, tr: JSON.stringify(tr), recorded: VFX.state().recorded };
  })()`);
  const k1 = await ko(), k2 = await ko();
  check(k1.hs0 >= 12 && k1.advanced >= 8 && k1.advanced <= 12, 'KO plays at quarter speed after the engine hit-stop (about 10 simulation ticks in 40): ' + k1.advanced);
  check(k1.zmax > 1.35, 'the KO zooms in on the impact beyond the engine zoom: ' + k1.zmax.toFixed(2));
  check(k1.tr === k2.tr, 'KO slow motion is deterministic under step(n): two runs trace the same positions, frames and zoom');
  check(k1.pending === false && k1.plays === 0, 'a round-ending KO that does not decide the match gets no replay');

  // ---- instant replay: starts, holds the KO phase, skips on any button after the grace, ends by itself ----
  const decide = (setup) => ev(`(() => {
    ${setup}
    const [a, b] = V.fresh(0, 1, [1, 0]), out = {}; V.place(120); step(150); b.hp = 1; b.inv = 0; b.takeHit(a, 6, 7, 15, 'punch');
    out.afterHit = [game.phase, VFX.state().pending];
    out.until = V.until(() => VFX.state().replay || game.phase === 'outro' || game.phase === 'over', 900); const r = VFX.state();
    out.started = !!r.replay; out.phase = game.phase; out.recorded = r.recorded; out.stopped = r.stopped;
    if (r.replay) { render(); step(1); render(); out.held = game.phase === 'ko' && game.phaseT < game.endAt; V.T('KeyJ'); step(2); out.graceOk = !!VFX.state().replay && VFX.state().skips === 0; }
    return out;
  })()`);
  const r1 = await decide('SETTINGS.set("vfx.replay", true);');
  check(r1.afterHit[1] === true, 'the match-deciding KO arms the replay: ' + JSON.stringify(r1.afterHit));
  check(r1.started && r1.phase === 'ko' && r1.recorded === 120 && r1.stopped, 'the replay starts in the KO phase from a full ring of 120 ticks that stopped recording after the KO: ' + JSON.stringify([r1.started, r1.phase, r1.recorded, r1.stopped]));
  check(r1.held && r1.graceOk, 'the replay holds the KO phase and ignores a button mashed during the grace period: ' + JSON.stringify([r1.held, r1.graceOk]));
  const r2 = await ev(`(() => {
    const out = {}; step(VFX.grace + 2); out.still = !!VFX.state().replay; render(); out.i = VFX.state().replay && VFX.state().replay.i;
    V.T('KeyJ'); step(1); out.skipped = VFX.state().replay === null; out.skips = VFX.state().skips; out.phase = game.phase;
    step(3); out.next = game.phase; out.hs = game.hitstop; return out;
  })()`);
  check(r2.still && r2.skipped && r2.skips === 1, 'any button skips the replay once the grace period is over: ' + JSON.stringify([r2.still, r2.skipped, r2.skips]));
  check(r2.phase === 'ko' && r2.next === 'outro' && r2.hs === 0, 'after a skip the match goes on to the winner call: ' + r2.phase + ' then ' + r2.next);
  const r3 = await decide('SETTINGS.set("vfx.replay", true);');
  const r4 = await ev(`(() => { let n = 0; while (VFX.state().replay && n < 400) { step(1); n++; } const mid = game.phase; step(5); return { n, plays: VFX.state().plays, skips: VFX.state().skips, mid, phase: game.phase }; })()`);
  check(r3.started && r4.n >= 100 && r4.n <= 140 && r4.mid === 'ko' && r4.phase === 'outro' && r4.skips === 1, 'an untouched replay runs its 120 recorded ticks plus the hold, ends by itself and the match goes on: ' + JSON.stringify(r4));
  const r5 = await decide('SETTINGS.set("vfx.replay", false);');
  check(r5.started === false && r5.phase === 'outro', 'vfx.replay off: no replay, the KO goes straight to the winner call: ' + JSON.stringify([r5.started, r5.phase]));
  await ev('SETTINGS.set("vfx.replay", true)');

  // ---- the whole match flow still completes with the effects on (CPU vs CPU, draw hooks exercised) ----
  const flow = await ev(`(() => {
    game.mode = 1; game.sel = [2, 3]; game.arenaPick = 1; startMatch(); let n = 0, cuts = 0, plays = 0, draws = 0;
    while (game.phase !== 'over' && n < 30000) { step(1); n++; const s = VFX.state(); if (s.cut) cuts++; if (s.replay) plays++; if (n % 40 === 0) { render(); draws++; } if (s.cut && s.cut.t === 5) render(); if (s.replay && s.replay.t === 30) render(); }
    return { phase: game.phase, n, cuts, plays, draws, wins: game.wins, replays: VFX.state().plays };
  })()`);
  check(flow.phase === 'over' && flow.n < 30000, 'a full CPU match reaches the end screen with cut-ins and replay on: ' + JSON.stringify(flow));

  // ---- accessibility: flash and shake settings ----
  const acc = await ev(`(() => {
    const out = {}; for (const k of ['shake', 'flash']) if (SETTINGS.get(k) === undefined) { try { SETTINGS.define(k, { def: true, label: k.toUpperCase() }); } catch (e) { /* defined by the options file */ } }
    if (SETTINGS.get('shake') === undefined || SETTINGS.get('flash') === undefined) return { skipped: true };
    const off = k => { SETTINGS.set(k, false); if (SETTINGS.get(k) !== false) SETTINGS.set(k, 'off'); }, on = k => { SETTINGS.set(k, true); if (SETTINGS.get(k) !== true) SETTINGS.set(k, 'on'); };
    on('shake'); on('flash'); game.shake = 0; game.flash = 0; game.shake = 10; game.flash = 8; out.onShake = game.shake; out.onFlash = game.flash; game.shake--; out.dec = game.shake; game.shake = Math.max(game.shake, 4); out.keep = game.shake;
    off('shake'); off('flash'); game.shake = 0; game.flash = 0; game.shake = 10; game.flash = 8; out.offShake = game.shake; out.offFlash = game.flash;
    const [a, b] = V.fresh(0, 1); V.place(260); step(30); b.inv = 0; b.set('idle'); b.takeHit(a, 14, 3, 10, 'hit', { knock: true }); out.impact = VFX.state().impact; render(); out.drew = true;
    on('shake'); on('flash'); return out;
  })()`);
  if (acc.skipped) check(true, 'flash and shake settings are not defined on this branch: accessibility scaling is checked when the options file lands');
  else {
    check(acc.onShake === 10 && acc.onFlash === 8 && acc.dec === 9 && acc.keep === 9, 'shake and flash on: values pass through, decrements and Math.max reads stay intact: ' + JSON.stringify([acc.onShake, acc.onFlash, acc.dec, acc.keep]));
    check(acc.offShake === 0 && acc.offFlash === 0, 'shake and flash off: the engine values stay at 0 when set');
    check(acc.impact === 0 && acc.drew, 'with flashing off the impact still runs and draws a soft tint without errors');
  }
}
