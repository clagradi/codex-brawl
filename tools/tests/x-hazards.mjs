// Tests for hazards.js. Owner: the x-hazards agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Area: interactive arenas and stage finishes. Every arena object fires on K+L in a forced arena (#demo=i,j&arena=K&stop) and hurts through takeHit;
// every stage finish plays to the end and the match ends normally; the regular finishers still work.
const IDS = ['gpupit', 'cathedral', 'bridge', 'furnace', 'forest', 'temple', 'graveyard', 'rooftop', 'wasteland'];
const NAMES = ['OOM KILLED', 'BELL CURVED', '429 RATE LIMITED', 'RECYCLED INTO A CHIP', 'SUNSET NOTICE', 'MERGE CONFLICT', 'GARBAGE COLLECTED', 'SHIPPED TO PROD', 'HASH BROWNED'];

export async function run(t) {
  const { check } = t, ev = t.eval;

  // ---- registry ----
  await t.open('#demo=0,1&arena=0&stop');
  const reg = await ev(`(() => {
    const out = { ids: HAZARDS.list(), g: typeof HAZARDS.register, q: typeof HAZARD_QUEUE.push };
    HAZARD_QUEUE.push(['zz-test', { name: 'TEST OBJECT', x: 300, use: () => false }]); out.queued = HAZARDS.has('zz-test') && HAZARDS.get('zz-test').name === 'TEST OBJECT';
    out.fallback = HAZARDS.get('no-such-arena').name; return out; })()`);
  check(IDS.every(id => reg.ids.includes(id)) && reg.ids.includes('generic'), 'HAZARDS has an object for each of the nine arenas and a generic one');
  check(reg.g === 'function' && reg.q === 'function' && reg.queued, 'HAZARDS.register and HAZARD_QUEUE.push register an arena object');
  check(reg.fallback === 'CRATE', 'an arena without an object falls back to the generic one');

  // ---- each arena object fires, hurts through takeHit, cools down ----
  for (let k = 0; k < IDS.length; k++) {
    await t.open('#demo=0,1&arena=' + k + '&stop');
    const r = await ev(`(() => {
      const out = {}; let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
      const [a, b] = game.f; a.cpu = b.cpu = false; out.arena = ARENAS[game.arena].id;
      const s0 = HAZARDS.state(); out.name = s0 && s0.name; out.ready0 = s0 && s0.ready; const sd = s0.x < 480 ? 1 : -1;
      a.set('idle'); b.set('idle'); a.x = s0.x; b.x = s0.x + sd * 170; a.face = sd; b.face = -sd; a.inv = b.inv = 0; a.cool = b.cool = 0; render();
      const dmg = [], tags = []; HOOKS.add('damage', pl => { if (pl.src === a) { dmg.push(pl.dmg); tags.push(pl.opt ? [pl.opt.tag, !!pl.opt.unblock] : [null, false]); } });
      let fired = 0, payload = null; BUS.on('hazard', p => { fired++; payload = p; });
      const hp0 = b.hp; pressed.KeyK = true; pressed.KeyL = true; step(1);
      const s1 = HAZARDS.state(); out.uses = s1.uses; out.cool1 = s1.cool; out.fired = fired; out.payload = !!payload && payload.user === a && payload.foe === b && payload.id === out.arena;
      out.again = HAZARDS.use(0); out.uses2 = HAZARDS.state().uses;
      for (let i = 0; i < 160; i++) { step(1); if (i % 5 === 0) render(); }
      out.hurt = hp0 - b.hp; out.n = dmg.length; out.blockable = tags.every(g => !g[1]); out.cool2 = HAZARDS.state().cool; out.broken = HAZARDS.stats().broken; out.proj = game.proj.length;
      return out; })()`);
    check(r.arena === IDS[k] && r.ready0, IDS[k] + ': the object is mounted and ready (' + r.name + ')');
    check(r.uses === 1 && r.fired === 1 && r.payload && r.cool1 > 300, IDS[k] + ': K+L next to it uses it once, starts the cooldown and emits "hazard"');
    check(r.again === false && r.uses2 === 1, IDS[k] + ': a second use during the cooldown is refused');
    check(r.n > 0 && r.hurt > 0 && r.blockable, IDS[k] + ': it hurt the foe through takeHit and the hit is blockable (' + r.hurt + ' damage in ' + r.n + ' hits)');
    check(!r.broken && r.cool2 < r.cool1, IDS[k] + ': no faults and the cooldown ticks down');
  }

  // ---- a staggered K then L still counts; far from the object nothing happens ----
  await t.open('#demo=0,1&arena=0&stop');
  const st = await ev(`(() => {
    const out = {}; let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
    const [a, b] = game.f; a.cpu = b.cpu = false; const x0 = HAZARDS.state().x;
    a.set('idle'); b.set('idle'); a.x = 600; b.x = 800; a.inv = b.inv = 0; a.cool = 0; pressed.KeyK = true; pressed.KeyL = true; step(1); for (let i = 0; i < 40; i++) step(1); out.far = HAZARDS.state().uses;
    a.set('idle'); b.set('idle'); a.x = x0; b.x = x0 + 170; a.face = 1; b.face = -1; a.cool = 0; b.inv = 0; step(2);
    pressed.KeyK = true; step(1); step(1); step(1); pressed.KeyL = true; step(1); out.stagger = HAZARDS.state().uses; out.state = a.state; return out; })()`);
  check(st.far === 0, 'K+L far from the object does not use it');
  check(st.stagger === 1, 'K then L three ticks later next to the object uses it');

  // ---- stage finishes ----
  const finishRun = (k, loserX, down, extra) => `(() => {
    const out = {}; let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
    const [a, b] = game.f; a.cpu = b.cpu = false; ${extra || ''}
    let ends = 0, sf = 0, errs = 0; BUS.on('match:end', () => ends++); BUS.on('stagefinish', () => sf++);
    game.wins[0] = roundsToWin() - 1; a.set('idle'); b.set('idle'); a.x = 400; b.x = 300; a.inv = b.inv = 0; b.hp = 1; game.koBy(a, b);
    out.finish = game.phase; n = 0; while ((game.hitstop > 0 || game.slow > 0) && n++ < 300) step(1);
    b.x = ${loserX}; b.vx = 0; a.x = ${loserX} + (${loserX} < 480 ? 150 : -150); render();
    ${down ? 'keys.KeyS = true;' : ''} pressed.KeyI = true; for (let i = 0; i < 8 && game.phase === 'finish'; i++) step(1); keys.KeyS = false; for (let i = 0; i < 3; i++) step(1);   // vfx's KO slow motion freezes 3 ticks in 4: hold until a tick runs
    out.phase = game.phase; out.name = game.fin && game.fin.name; out.stage = !!(game.fin && game.fin.stage); out.restored = !!MOVES[a.d.id].fin && !MOVES[a.d.id].fin.stage;
    n = 0; while (game.phase !== 'over' && n++ < 4000) { step(1); if (n % 4 === 0) render(); }
    out.end = game.phase; out.ends = ends; out.sf = sf; out.stats = HAZARDS.stats(); out.winner = game.winner === a; return out; })()`;
  for (let k = 0; k < IDS.length; k++) {
    await t.open('#demo=0,1&arena=' + k + '&stop');
    const spot = await ev('HAZARDS.get(ARENAS[game.arena].id).x');
    const r = await ev(finishRun(k, spot, true));
    check(r.finish === 'finish' && r.phase === 'finisher' && r.stage && r.name === NAMES[k], IDS[k] + ': DOWN + SUPER near the finish spot plays the stage finish ' + NAMES[k] + ' (got ' + r.name + ')');
    check(r.end === 'over' && r.ends === 1 && r.sf === 1 && r.stats.finishes === 1 && r.winner && !r.stats.broken, IDS[k] + ': the stage finish completes and the match ends normally');
    check(r.restored, IDS[k] + ': the regular finisher is put back after the stage finish');
  }
  // regular finishers keep working: SUPER alone, or DOWN + SUPER with the loser out of reach
  await t.open('#demo=0,1&arena=2&stop');
  const reg1 = await ev(finishRun(2, 120, false));
  check(reg1.phase === 'finisher' && !reg1.stage && reg1.end === 'over' && reg1.ends === 1 && reg1.sf === 0, 'SUPER alone in FINISH IT! still plays the regular finisher (' + reg1.name + ') and the match ends');
  await t.open('#demo=0,1&arena=2&stop');
  const reg2 = await ev(finishRun(2, 760, true));
  check(reg2.phase === 'finisher' && !reg2.stage && reg2.end === 'over' && reg2.sf === 0, 'DOWN + SUPER with the loser out of reach plays the regular finisher (' + reg2.name + ')');
  // an arena registered without a finish uses the generic one at the nearest edge
  await t.open('#demo=0,1&arena=0&stop');
  const gen = await ev(finishRun(0, 130, true, "HAZARDS.register('gpupit', { name: 'BARE', x: 96, use: () => false });"));
  check(gen.phase === 'finisher' && gen.stage && gen.name === 'FORCE PUSH' && gen.end === 'over' && gen.ends === 1, 'an arena without its own finish falls back to the generic stage finish (' + gen.name + ')');
}
