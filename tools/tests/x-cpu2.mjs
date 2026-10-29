// Tests for cpu2.js (smarter CPU opponents). Owner: the x-cpu2 agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Every match here is deterministic: Math.random is replaced by a seeded generator and a whole match runs inside one synchronous page call, so the real-time loop
// cannot interleave. The NIGHTMARE vs EASY check is the one statistical test; it is seeded too, so it repeats exactly.
export async function run(t) {
  const { check } = t, ev = t.eval;
  const clean = async (hash = '') => { await t.open(); await ev('localStorage.clear()'); await t.open(hash); };

  // helpers that live in the page: a seeded CPU vs CPU match, and a ptext spy for the screens
  const SIM = `
    window.__rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    window.__sim = (i, j, lv0, lv1, seed, max) => {
      Math.random = __rng(seed); SETTINGS.set('rounds', 1); SETTINGS.set('time', 30); hold(true);
      game.mode = 1; game.modeId = 'versus'; game.sel = [i, j]; game.arenaPick = -1; CPU2.levels = [lv0, lv1];
      startMatch(); game.f[0].cpu = true; game.f[1].cpu = true;
      let n = 0; while (game.phase !== 'over' && n < max) { step(1); n++; }
      CPU2.levels = [null, null];
      return { phase: game.phase, n, wins: game.wins.slice(), hp: game.f.map(f => Math.round(f.hp)) };
    };
    window.__spy = fn => { const calls = [], orig = window.ptext; window.ptext = (c, s, ...r) => { calls.push(String(s)); return orig(c, s, ...r); }; try { fn(); } finally { window.ptext = orig; } return calls; };
    true`;

  // ---- difficulty: four levels, a monotone skill curve, NIGHTMARE reachable from the options row ----
  await clean(); await ev(SIM);
  const api = await ev(`(() => { const d = SETTINGS.list().find(x => x.key === 'difficulty'); return { on: typeof CPU2 === 'object' && CPU2.enabled === true, vals: d.values, nm: DIFFICULTY.nightmare, hard: DIFFICULTY.hard,
    names: [0.2, 0.45, 0.7, 0.95].map(CPU2.levelName), ks: [0.2, 0.45, 0.7, 0.95].map(s => CPU2.params(s)) }; })()`);
  check(api.on, 'CPU2 layer is loaded and enabled');
  check(api.vals.join() === 'easy,normal,hard,nightmare', 'the difficulty setting offers easy, normal, hard and nightmare: ' + api.vals.join());
  check(Array.isArray(api.nm) && api.nm[0] > api.hard[0], 'DIFFICULTY.nightmare starts above hard: ' + JSON.stringify(api.nm));
  check(api.names.join() === 'easy,normal,hard,nightmare', 'skill anchors map to the four level names');
  check(api.ks.every((k, i) => !i || (k.D < api.ks[i - 1].D && k.miss < api.ks[i - 1].miss && k.block > api.ks[i - 1].block && k.punish > api.ks[i - 1].punish && k.aa > api.ks[i - 1].aa)),
    'reaction delay and mistake rate fall, guard / punish / anti-air rise with the level: delay ' + api.ks.map(k => k.D).join('/'));
  check(await ev(`SETTINGS.set('difficulty', 'nightmare'), SETTINGS.get('difficulty')`) === 'nightmare', 'NIGHTMARE can be stored in the difficulty setting');

  // ---- personalities: one profile per fighter, all different ----
  const prof = await ev(`ROSTER.map(r => { const p = CPU2.profileOf({ d: r }); return [p.tag, p.aggr, p.range.join('-'), p.fav.join(',')].join('|'); })`);
  check(new Set(prof.map(s => s.split('|')[0])).size === prof.length && prof.every(s => !s.startsWith('BALANCED')), 'every fighter has its own personality: ' + prof.map(s => s.split('|')[0]).join(', '));
  check(new Set(prof.map(s => s.split('|').slice(1).join('|'))).size === prof.length, 'the personalities differ in numbers (aggression, range, specials)');

  // ---- the input hook: replaces the CPU's input, never a human's, steps aside in training-like modes and when switched off ----
  const hk = await ev(`(() => {
    hold(true); SETTINGS.set('difficulty', 'normal'); game.mode = 1; game.modeId = 'versus'; game.sel = [0, 1]; startMatch();
    let n = 0; while (game.phase !== 'fight' && n < 3000) { step(1); n++; }
    const human = { l: true }, cpu = {}, out = {};
    out.phase = game.phase; out.human = HOOKS.filter('input', human, 0, game.f[0]) === human;
    const r = HOOKS.filter('input', cpu, 1, game.f[1]); out.cpuReplaced = r !== cpu && typeof r === 'object';
    game.f[1].cpu = false; out.notCpu = HOOKS.filter('input', cpu, 1, game.f[1]) === cpu; game.f[1].cpu = true;
    game.modeId = 'training'; out.training = HOOKS.filter('input', cpu, 1, game.f[1]) === cpu; game.modeId = 'versus';
    CPU2.enabled = false; out.off = HOOKS.filter('input', cpu, 1, game.f[1]) === cpu; CPU2.enabled = true;
    return out; })()`);
  check(hk.phase === 'fight', 'a 1P match reaches the fight phase');
  check(hk.human, "a human fighter's input passes through untouched");
  check(hk.cpuReplaced, "the CPU fighter's input is replaced by the personality brain");
  check(hk.notCpu && hk.training && hk.off, 'the brain steps aside for non-CPU fighters, training-like modes and CPU2.enabled = false');

  // ---- every fighter plays a deterministic CPU vs CPU match to the end; the same seed repeats exactly ----
  const N = await ev('ROSTER.length'), sig = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 2) % N, r = await ev(`__sim(${i}, ${j}, null, null, ${4100 + i}, 40000)`);
    sig.push(JSON.stringify(r));
    check(r.phase === 'over' && r.n > 300, `CPU vs CPU ${await ev(`ROSTER[${i}].id + ' vs ' + ROSTER[${j}].id`)} runs to the end (${r.n} ticks, wins ${r.wins})`);
  }
  const again = await ev(`__sim(0, 2, null, null, 4100, 40000)`);
  check(JSON.stringify(again) === sig[0], 'the same seed gives the same match again');

  // ---- NIGHTMARE beats EASY over a few seeded fast rounds (sides swapped) ----
  let nm = 0, ez = 0;
  for (let k = 0; k < 8; k++) {
    const i = k % N, j = (k * 2 + 1) % N, swap = k % 2, r = await ev(`__sim(${i}, ${j}, ${swap ? "'easy'" : "'nightmare'"}, ${swap ? "'nightmare'" : "'easy'"}, ${77 + k * 13}, 40000)`);
    const w = r.wins[0] > r.wins[1] ? 0 : r.wins[1] > r.wins[0] ? 1 : -1;
    if (w >= 0) { if ((w === 0) === !swap) nm++; else ez++; }
  }
  check(nm >= 6 && nm > ez + 3, `NIGHTMARE beats EASY over 8 seeded matches (${nm} to ${ez})`);

  // ---- adaptation: a scripted human who jumps in from afar and pokes low is read, and the CPU says so ----
  await clean(); await ev(SIM);
  const ad = await ev(`(() => {
    Math.random = __rng(9); hold(true); SETTINGS.set('rounds', 4); SETTINGS.set('time', 99); game.mode = 1; game.modeId = 'versus'; game.sel = [0, 3]; game.arenaPick = -1;
    CPU2.levels = [null, 'hard']; startMatch(); let n = 0; while (game.phase !== 'fight' && n < 3000) { step(1); n++; }
    game.f[0].hp = 5000;
    const off = HOOKS.add('input', (inp, side, f) => {
      if (side !== 0 || f.cpu) return;
      const o = game.f[1], dist = Math.abs(o.x - f.x), toward = o.x > f.x ? 'r' : 'l', i = {};
      if (dist > 170) { i[toward] = true; if (f.onGround) i.u = true; } else if (f.state === 'idle' || f.state === 'walk') { i.d = true; i.p = true; }
      return i; }, 10);
    const seen = new Set(), pops = new Set(); let phaseOk = true;
    for (let k = 0; k < 360; k++) { step(5); if (game.phase !== 'fight') { phaseOk = false; break; } seen.add(CPU2.intent(1)); for (const p of game.popups) if (/^READ /.test(p.txt)) pops.add(p.txt); }
    off(); const hb = CPU2.habits(0), rd = CPU2.reads(0); CPU2.levels = [null, null];
    return { phaseOk, jump: hb.jump, low: hb.low, atk: hb.atk, rj: rd.jump, pops: [...pops], seen: [...seen] }; })()`);
  check(ad.phaseOk, 'the adaptation match stayed in the fight phase');
  check(ad.jump >= 3 && ad.low >= 2, `the jump-ins and low pokes of the human are counted (jumps ${ad.jump.toFixed(1)}, lows ${ad.low.toFixed(1)})`);
  check(ad.rj > 0.3, 'repeated jump-ins become a read habit: ' + ad.rj.toFixed(2));
  check(ad.pops.length > 0, 'the CPU announces what it has read: ' + ad.pops.join(', '));
  check(ad.seen.includes('ANTI-AIR'), 'the CPU answers jump-ins with anti-airs: ' + ad.seen.join(', '));

  // ---- the screens: CPU level on the VS screen in 1P, both personalities in CPU vs CPU ----
  await clean(); await ev(SIM);
  const vs = await ev(`(() => { hold(true); const out = {};
    for (const lv of ['easy', 'normal', 'hard', 'nightmare']) { SETTINGS.set('difficulty', lv); game.mode = 1; game.modeId = 'versus'; game.sel = [2, 1]; startMatch(); step(20);
      out[lv] = { phase: game.phase, calls: __spy(() => HOOKS.run('drawTop', ctx, game)) }; }
    game.mode = 2; game.f[1].cpu = false; out.twoP = __spy(() => HOOKS.run('drawTop', ctx, game));
    return out; })()`);
  for (const lv of ['easy', 'normal', 'hard', 'nightmare']) check(vs[lv].phase === 'vs' && vs[lv].calls.includes('CPU LEVEL ' + lv.toUpperCase()), `the VS screen shows CPU LEVEL ${lv.toUpperCase()} in 1P`);
  check(vs.twoP.every(s => !/CPU LEVEL/.test(s)), 'the VS screen shows no CPU level in two player matches');
  await t.open('#demo=2,4&stop');
  await ev(SIM);
  const dm = await ev(`(() => { hold(true); CPU2.levels = ['hard', 'nightmare']; let n = 0; while (game.phase !== 'fight' && n < 3000) { step(1); n++; } step(200);
    const tags = game.f.map(f => CPU2.profileOf(f).tag), calls = __spy(() => HOOKS.run('drawHud', ctx, game)); CPU2.levels = [null, null]; return { tags, calls, both: game.f.every(f => f.cpu) }; })()`);
  check(dm.both, 'the #demo route puts two CPUs in the ring');
  check(dm.tags[0] !== dm.tags[1] && dm.calls.some(s => s.startsWith(dm.tags[0] + ' / HARD')) && dm.calls.some(s => s.startsWith(dm.tags[1] + ' / NIGHTMARE')),
    'CPU vs CPU shows both personalities and levels: ' + dm.calls.filter(s => / \/ /.test(s)).join(', '));

  await clean();
}
