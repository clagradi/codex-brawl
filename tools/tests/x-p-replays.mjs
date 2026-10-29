// Tests for p-replays: input-based match replays (p-replays.js). Owner: the p-replays agent. Runs after core.mjs and the other feature files in alphabetical order.
// Covers: a VERSUS match is recorded (inputs, seed, result, checksums) and saved in SETTINGS 'replays.list', newest first, at most 5; playing it back ends with the
// same winner and the same health, also after a reload; a 2-player match started from the select screen with scripted keys, a P pause and a lost-focus pause
// replays the same; a tampered replay is caught as DESYNC; the viewer controls (pause, one frame, 2X, restart, exit) on the real key path; the REPLAYS title
// screen (open, pick, erase twice, watch, back); the viewer's own settings come back after a replay and after a page closed mid-replay; quitting a match or a test
// that seeded Math.random itself records nothing; no console errors. Every step is deterministic: hold(true), step(n) and key taps.
export async function run(t) {
  const { check, tap } = t, ev = t.eval;
  const errors0 = t.p.errors.length;

  // page helpers: __kd / __ku press and release a key the way the keydown / keyup handlers do; __cpu starts a CPU vs CPU versus match; __run plays to the end
  const HELPERS = `(() => {
    window.__kd = c => { if (!keys[c]) pressed[c] = true; keys[c] = true; };
    window.__ku = c => { keys[c] = false; };
    window.__cpu = (a, b) => { MODES.pick('versus'); game.sel = [a, b]; startMatch(); game.f[0].cpu = true; game.f[1].cpu = true; };
    window.__run = (max = 9000) => { let n = 0; while (game.phase !== 'over' && n < max) { step(1); n++; } return n; };
    window.__watch = (max = 9000) => { let n = 0; while (!REPLAYS.state().done && n < max) { step(1); n++; } return n; };
    window.__native = () => /\\[native code\\]/.test(String(Math.random));
    return true;
  })()`;
  const open = async (hash = '') => { await t.open(hash); await ev(HELPERS); await ev('hold(true)'); };
  const short = "SETTINGS.set('rounds', 1); SETTINGS.set('time', 30); SETTINGS.set('infTime', false); SETTINGS.set('difficulty', 'normal');";
  const press = async code => { await tap(code); await ev('step(1)'); };   // the pressed flag waits for the next update, so a tap plus one step is one press
  const key = async code => { await tap(code); return ev('REPLAYS.advance(TICK)'); };   // a viewer key during playback, read by the playback clock
  const len = () => ev("SETTINGS.get('replays.list').length");

  // the stored settings of the files that ran before stay as they were
  await t.open();
  const savedStore = await ev("localStorage.getItem('brawl.settings')");
  await ev("localStorage.removeItem('brawl.settings')");
  await open();
  const api = await ev("window.STUB_P_REPLAYS === 1 && typeof REPLAYS === 'object' && ['play', 'exit', 'advance', 'pause', 'speed', 'stepFrame', 'restart', 'list', 'state'].every(k => typeof REPLAYS[k] === 'function') && REPLAYS.KEEP === 5");
  check(api, 'p-replays.js is loaded: REPLAYS with play, exit, advance, pause, speed, stepFrame, restart, list and state; keeps 5');
  check(await ev("Array.isArray(SETTINGS.get('replays.list')) && SETTINGS.get('replays.list').length === 0 && SETTINGS.get('replays.restore') === null"), "the SETTINGS keys 'replays.list' (empty) and 'replays.restore' (null) are defined");

  // ---- 1. a CPU vs CPU versus match is recorded ----
  await ev(short);
  const rec = await ev(`(() => {
    __cpu(0, 2); const during = REPLAYS.state(), pinned = REPLAYS.pinned(); const n = __run();
    const e = SETTINGS.get('replays.list')[0] || {}, w = game.winner ? game.winner.side : -1;
    return { n, phase: game.phase, during, pinned, native: __native(), after: REPLAYS.state(), count: SETTINGS.get('replays.list').length,
      e: { v: e.v, ids: e.ids, modeId: e.modeId, cpu: e.cpu, seed: e.seed, len: e.len, ck: (e.ck || '').length, res: e.res, arenaId: e.arenaId, set: e.set && e.set.rounds, tk: typeof e.tk },
      w, hp: [game.f[0].hp, game.f[1].hp], arena: ARENAS[game.arena].id };
  })()`);
  check(rec.phase === 'over' && rec.during.rec === true && rec.pinned, 'a VERSUS match is recorded while it runs, with Math.random pinned to the replay seed (' + rec.n + ' ticks)');
  check(rec.count === 1 && rec.e.v === 1 && rec.e.ids.join() === 'tibo,dot' && rec.e.modeId === 'versus' && rec.e.cpu.join() === '1,1' && rec.e.arenaId === rec.arena,
    'the saved entry names the fighters, the mode, the CPU sides and the arena: ' + JSON.stringify({ ids: rec.e.ids, cpu: rec.e.cpu, arena: rec.e.arenaId }));
  check(Number.isInteger(rec.e.seed) && rec.e.seed >= 0 && rec.e.len > 600 && rec.e.ck === Math.floor(rec.e.len / 30) * 3 && rec.e.set === 1 && rec.e.tk === 'number',
    'the entry keeps the seed, the length in ticks, a checksum every 30 ticks and the match settings (len ' + rec.e.len + ', checksum chars ' + rec.e.ck + ')');
  check(rec.e.res.w === rec.w && rec.e.res.hp[0] === rec.hp[0] && rec.e.res.hp[1] === rec.hp[1], 'the entry keeps the result: winner side ' + rec.w + ', health ' + rec.hp.join(' / '));
  check(rec.native && rec.after.rec === false, 'after the match Math.random is the browser one again and nothing is recording');

  // ---- 2. playing it back gives the same winner and health; it still does after a reload ----
  const watch = async i => ev(`(() => {
    let ends = 0, hits = 0; const off1 = BUS.on('match:end', () => ends++), off2 = BUS.on('hit', () => hits++);
    const ok = REPLAYS.play(${i}), held = typeof running === 'boolean' && running === false, n = __watch(), s = REPLAYS.state();
    off1(); off2();
    const e = SETTINGS.get('replays.list')[${i}];
    return { ok, held, n, s, ends, hits, chk: e.chk, want: e.res, len: e.len, hp: [game.f[0].hp, game.f[1].hp], w: game.winner ? game.winner.side : -1 };
  })()`);
  let pb = await watch(0);
  check(pb.ok && pb.held && pb.s.active && pb.s.done, 'REPLAYS.play(0) starts the replay and it runs to its end panel');
  check(pb.ends === 0 && pb.hits > 0, 'a replayed match is not counted again: other match:end listeners stay silent (' + pb.ends + '), while hit events still fire (' + pb.hits + ')');
  check(pb.s.verified === true && pb.s.bad === -1 && pb.w === pb.want.w && pb.hp[0] === pb.want.hp[0] && pb.hp[1] === pb.want.hp[1],
    'the replay ends with the same winner and the same health as the match: ' + JSON.stringify({ got: pb.s.got, want: pb.want }));
  check(pb.chk === 1, 'the entry is marked VERIFIED in the list');
  await ev('REPLAYS.exit()');
  check(await ev('__native() && !REPLAYS.state().active'), 'leaving the replay puts the browser Math.random back');
  await open();
  pb = await watch(0);
  check(pb.s.verified === true && pb.hp.join() === pb.want.hp.join(), 'after a page reload the stored replay still ends the same (' + pb.hp.join(' / ') + ')');
  await ev('REPLAYS.exit()');

  // ---- 3. a 2-player match from the select screen, with scripted keys, a P pause and a lost-focus pause ----
  await open();
  await ev(short);
  const two = await ev(`(() => {
    const items = titleItems(); game.titleSel = items.findIndex(it => it.mode && it.mode.id === 'versus2');
    __kd('Enter'); step(1); __ku('Enter'); step(2);
    const atSelect = game.phase, sel = game.sel.slice();
    __kd(MAP[0].p[0]); __kd(MAP[1].p[0]); step(1); __ku(MAP[0].p[0]); __ku(MAP[1].p[0]);
    const started = game.phase === 'vs' && REPLAYS.state().rec, cpu = [game.f[0].cpu, game.f[1].cpu];
    let s = 0x2545f491; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const acts = ['l', 'r', 'u', 'd', 'p', 'k', 's', 'x'];
    let n = 0, pauses = 0, blurs = 0, fightAt = -1, paused = 0;
    while (game.phase !== 'over' && n < 9000) {
      if (game.phase === 'fight' && fightAt < 0) fightAt = n;
      if (fightAt >= 0 && n === fightAt + 200) { __kd('KeyP'); }
      if (fightAt >= 0 && n === fightAt + 201) { __ku('KeyP'); if (game.phase === 'pause') pauses++; }
      if (fightAt >= 0 && n === fightAt + 240) { __kd('KeyP'); }
      if (fightAt >= 0 && n === fightAt + 241) { __ku('KeyP'); }
      if (fightAt >= 0 && n === fightAt + 400 && game.phase === 'fight') { dispatchEvent(new Event('blur')); if (game.phase === 'pause') blurs++; }
      if (fightAt >= 0 && n === fightAt + 430) { __kd('Enter'); }
      if (fightAt >= 0 && n === fightAt + 431) { __ku('Enter'); }
      if (game.phase === 'fight') for (let side = 0; side < 2; side++) if (rnd() < 0.18) { const c = MAP[side][acts[Math.floor(rnd() * acts.length)]][0]; if (keys[c]) __ku(c); else __kd(c); }
      step(1); n++; if (game.phase === 'pause') paused++;
    }
    for (const c in keys) keys[c] = false;
    const e = SETTINGS.get('replays.list')[0];
    return { atSelect, sel, started, cpu, n, pauses, blurs, paused, phase: game.phase, modeId: e.modeId, events: e.ev.split(';').length, pz: e.pz, codes: e.codes.length, count: SETTINGS.get('replays.list').length };
  })()`);
  check(two.atSelect === 'select' && two.started && two.cpu.join() === 'false,false', 'a 2-player match started from the select screen (inside the game tick) is being recorded');
  check(two.phase === 'over' && two.count === 2 && two.modeId === 'versus2' && two.events > 50 && two.codes > 8,
    'the 2-player match is saved first in the list with its key changes (' + two.events + ' changes, ' + two.codes + ' key codes)');
  check(two.pauses === 1 && two.blurs === 1 && Array.isArray(two.pz) && two.pz.length === 4, 'the P pause and the lost-focus pause are recorded as pause ticks: ' + JSON.stringify(two.pz));
  const pb2 = await ev(`(() => {
    const e = SETTINGS.get('replays.list')[0]; REPLAYS.play(0); let n = 0, paused = 0;
    while (!REPLAYS.state().done && n < 9000) { step(1); n++; if (game.phase === 'pause') paused++; }
    const s = REPLAYS.state();
    return { s, paused, want: e.res, hp: [game.f[0].hp, game.f[1].hp] };
  })()`);
  check(pb2.s.verified === true && pb2.hp.join() === pb2.want.hp.join() && pb2.s.got.w === pb2.want.w,
    'the 2-player replay ends with the same winner and health: ' + JSON.stringify({ got: pb2.s.got, want: pb2.want }));
  check(two.paused > 30 && pb2.paused === two.paused, 'the replay is paused for exactly the ticks the match was paused (' + pb2.paused + ' of ' + two.paused + ')');

  // ---- 4. a lost focus while watching pauses the viewer, not the match ----
  const blur = await ev(`(() => {
    REPLAYS.restart(); let n = 0; while (game.phase !== 'fight' && n < 2000) { step(1); n++; }
    step(5); dispatchEvent(new Event('blur')); const mid = game.phase; step(1);
    const s = REPLAYS.state(), ph = game.phase; REPLAYS.pause(false); __watch(); return { mid, ph, paused: s.paused, end: REPLAYS.state() };
  })()`);
  check(blur.mid === 'pause' && blur.ph === 'fight' && blur.paused === true, 'a lost focus during a replay puts the match back to the fight and pauses the viewer instead');
  check(blur.end.verified === true, 'and the replay still ends the same');
  await ev('REPLAYS.exit()');

  // ---- 5. tampered replays are caught ----
  const bad = await ev(`(() => {
    const l = SETTINGS.get('replays.list'), a = Object.assign({}, l[1], { at: 11, seed: (l[1].seed ^ 0x1234567) >>> 0 }), b = Object.assign({}, l[0], { at: 12, ev: '' });
    SETTINGS.set('replays.list', [a, b].concat(l)); const out = [];
    for (const i of [0, 1]) { REPLAYS.play(i); __watch(); const s = REPLAYS.state(); out.push({ done: s.done, verified: s.verified, bad: s.bad }); REPLAYS.exit(); }
    const chk = SETTINGS.get('replays.list').slice(0, 2).map(e => e.chk);
    SETTINGS.set('replays.list', SETTINGS.get('replays.list').slice(2));
    return { out, chk };
  })()`);
  check(bad.out.every(o => o.done && o.verified === false && o.bad > 0) && bad.chk.join() === '0,0',
    'a replay with another seed or with its inputs removed ends as DESYNC with the first differing frame: ' + JSON.stringify(bad.out));

  // ---- 6. the viewer controls on the real key path, the viewer's settings and state come back ----
  await ev("SETTINGS.set('rounds', 3); SETTINGS.set('sfxVol', 0.3); game.sel = [3, 4]; game.arenaPick = -1;");
  await ev('REPLAYS.play(1)');   // the CPU match (recorded with 1 round to win)
  const inside = await ev("({ rounds: SETTINGS.get('rounds'), sfx: SETTINGS.get('sfxVol'), guard: SETTINGS.get('replays.restore'), a: REPLAYS.state().active })");
  check(inside.a && inside.rounds === 1 && inside.sfx === 0.3 && inside.guard && inside.guard.rounds === 3,
    "while watching, the match's own settings apply (rounds 1), the viewer keeps the sound ones, and 'replays.restore' holds the viewer's settings");
  await ev('for (let i = 0; i < 10; i++) REPLAYS.advance(TICK)');
  const r0 = await ev('REPLAYS.state().rt');
  await key('Space');
  await ev('for (let i = 0; i < 6; i++) REPLAYS.advance(TICK)');
  const r1 = await ev('REPLAYS.state()');
  check(r0 === 10 && r1.paused && r1.rt === r0, 'at 1X one tick passes per tick of real time; SPACE pauses it (' + r0 + ', then ' + r1.rt + ')');
  await key('Period');
  const r2 = await ev('REPLAYS.state()');
  check(r2.rt === r0 + 1 && r2.paused, 'the step key moves exactly one frame and stays paused');
  await key('Space'); await key('KeyK');
  const r3a = await ev('REPLAYS.state()');
  await ev('for (let i = 0; i < 10; i++) REPLAYS.advance(TICK)');
  const r3 = await ev('REPLAYS.state()');
  check(r3.speed === 2 && r3.rt - r3a.rt === 20, 'K switches to 2X: twice as many ticks in the same time (' + (r3.rt - r3a.rt) + ' in 10)');
  await key('KeyR');
  const r4 = await ev('REPLAYS.state()');
  check(r4.active && r4.rt === 0 && r4.speed === 1 && !r4.paused, 'R restarts the replay from the first tick');
  await ev('step(30)');
  await key('Escape');
  const out = await ev(`({ phase: game.phase, s: REPLAYS.state(), screen: REPLAYS.screen(), rounds: SETTINGS.get('rounds'), sfx: SETTINGS.get('sfxVol'),
    guard: SETTINGS.get('replays.restore'), sel: game.sel.join(), pick: game.arenaPick, held: running === false, native: __native() })`);
  check(out.phase === 'title' && !out.s.active && out.screen.open && out.screen.sel === 1, 'ESC leaves the replay for the REPLAYS list, on the replay just watched');
  check(out.rounds === 3 && out.sfx === 0.3 && out.guard === null && out.sel === '3,4' && out.pick === -1 && out.held && out.native,
    "the viewer's settings, fighters, arena pick and paused loop are back: " + JSON.stringify({ rounds: out.rounds, sel: out.sel, guard: out.guard }));

  // ---- 7. the REPLAYS title screen ----
  await open();
  const idx = await ev("titleItems().findIndex(it => it.id === 'replays')");
  check(idx >= 0 && await ev("titleItems().find(it => it.id === 'replays').label === 'REPLAYS'"), 'the title menu has a REPLAYS item');
  await ev('game.titleSel = ' + idx);
  await press('Enter');
  check(await ev('REPLAYS.screen().open && game.phase === "title"'), 'ENTER on it opens the REPLAYS list');
  await t.wait(120);   // a few real frames draw the list
  await press('KeyS');
  const s1 = await ev('REPLAYS.screen().sel');
  await press('KeyW');
  const s0 = await ev('REPLAYS.screen().sel');
  check(s1 === 1 && s0 === 0 && await ev('game.titleSel') === idx, 'S and W move through the list, not the title menu underneath');
  const n0 = await len();
  await press('Delete');
  const armed = await ev('REPLAYS.screen().armed'), n1 = await len();
  await press('Delete');
  const n2 = await len();
  check(armed === 0 && n1 === n0 && n2 === n0 - 1, 'DEL asks once and erases on the second press (' + n0 + ' then ' + n2 + ')');
  await press('Enter');
  const watching = await ev('REPLAYS.state()');
  check(watching.active && watching.rt === 0 && await ev('game.phase') === 'vs', 'ENTER starts watching the picked replay');
  await t.wait(120);   // real frames draw the playback bar
  await ev('REPLAYS.exit()');
  await press('Escape');
  check(await ev('!REPLAYS.screen().open && game.phase === "title"'), 'ESC closes the list and the title menu is back');

  // ---- 8. at most 5, newest first ----
  await ev(short);
  const cap = await ev(`(() => {
    const e = SETTINGS.get('replays.list')[0], fake = [1, 2, 3, 4, 5].map(i => Object.assign({}, e, { at: i }));
    SETTINGS.set('replays.list', fake); __cpu(1, 3); __run();
    const l = SETTINGS.get('replays.list'); return { n: l.length, first: l[0].ids.join(), ats: l.slice(1).map(x => x.at).join() };
  })()`);
  check(cap.n === 5 && cap.first === 'poteto,wang' && cap.ats === '1,2,3,4', 'the list keeps the 5 newest: the new match first, the oldest dropped (' + cap.ats + ')');

  // ---- 9. no recording when the match is left early, or when a test seeded Math.random itself ----
  const skip = await ev(`(() => {
    const before = JSON.stringify(SETTINGS.get('replays.list'));
    __cpu(0, 1); step(300); const was = REPLAYS.state().rec; setPhase('title'); const quit = { rec: REPLAYS.state().rec, native: __native() };
    const own = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); Math.random = own;
    __cpu(2, 4); const mine = Math.random === own && !REPLAYS.state().rec; __run();
    return { was, quit, mine, same: JSON.stringify(SETTINGS.get('replays.list')) === before };
  })()`);
  check(skip.was && !skip.quit.rec && skip.quit.native, 'a match left before its end is dropped and Math.random is given back');
  check(skip.mine && skip.same, "a match run with a test's own seeded Math.random is left alone and not recorded");

  // ---- 10. a page closed during a replay gets the viewer's settings back on the next load ----
  await open();
  await ev("SETTINGS.set('rounds', 4); REPLAYS.play(0)");
  const mid = await ev("({ rounds: SETTINGS.get('rounds'), guard: (SETTINGS.get('replays.restore') || {}).rounds })");
  await open();
  const back = await ev("({ rounds: SETTINGS.get('rounds'), guard: SETTINGS.get('replays.restore'), active: REPLAYS.state().active })");
  check(mid.rounds === 1 && mid.guard === 4 && back.rounds === 4 && back.guard === null && !back.active, "settings changed by a replay that never ended are put back from 'replays.restore' on the next load");

  check(t.p.errors.length === errors0, 'no console errors from the replays');
  await t.open();
  await ev(`(s => { if (s === null) localStorage.removeItem('brawl.settings'); else localStorage.setItem('brawl.settings', s); })(${JSON.stringify(savedStore)})`);
  await t.open();
}
