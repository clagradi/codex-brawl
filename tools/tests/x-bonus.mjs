// Tests for bonus.js: the BENCHMARK BREAK and BUG SQUASH modes and BONUS.run. Owner: bonus agent.
// Everything is deterministic: the real-time loop is frozen with hold(true), keys are dispatched as KeyboardEvents inside one eval and the game
// advances only with step(n), so no check depends on the wall clock. The simulation uses the seeded generator in BONUS.seed.

const HELPERS = `
window.__kd = c => dispatchEvent(new KeyboardEvent('keydown', { code: c }));
window.__ku = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
window.__tap = (c, n = 1) => { __kd(c); step(n); __ku(c); };                 // press, advance n ticks, release
window.__title = id => { game.titleSel = titleItems().findIndex(i => i.id === id); __tap('Enter'); };   // pick a title entry the way a player does
// plays BENCHMARK BREAK: alternate J and K until the meter is high enough, then L; stops when the run leaves 'play'
window.__bench = (ticks = 6000) => {
  let n = 0;
  while (BONUS.active() && BONUS.state().scr === 'play' && n++ < ticks) {
    const st = BONUS.state();
    if (st.brk) { step(1); continue; }
    if (st.meter >= Math.min(95, st.line + 20)) { __tap('KeyL'); continue; }
    __tap(n % 2 ? 'KeyJ' : 'KeyK');
  }
  return BONUS.state();
};
// plays BUG SQUASH: face the nearest bug, punch or sweep it when it is close, use the special when the screen fills up
window.__bot = (ticks = 5000) => {
  let n = 0;
  while (BONUS.active() && BONUS.state().scr === 'play' && n++ < ticks) {
    const st = BONUS.state(), near = st.bugs.slice().sort((a, b) => Math.abs(a.x - 480) - Math.abs(b.x - 480)), b = near[0], ks = [];
    if (b) {
      const dx = b.x - 480; ks.push(dx < 0 ? 'KeyA' : 'KeyD');
      if (near.filter(q => Math.abs(q.x - 480) < 300).length >= 4 && st.sp <= 0) ks.push('KeyL');
      else if (Math.abs(dx) < 105) ks.push(b.kind !== 'fly' && n % 2 ? 'KeyK' : 'KeyJ');
    }
    ks.forEach(__kd); step(1); ks.forEach(__ku);
  }
  return BONUS.state();
};
// lets a run play itself out with no input at all
window.__idle = (ticks = 6000) => { let n = 0; while (BONUS.active() && BONUS.state().scr !== 'result' && n++ < ticks) step(1); return BONUS.state(); };
hold(true);
`;

export async function run(t) {
  const { check } = t, ev = t.eval;
  const fresh = async legacy => {   // a clean page with the helpers installed; 'legacy' puts a value under the old brawl.bonus key first
    await t.open(); await ev('localStorage.clear()' + (legacy ? '; localStorage.setItem("brawl.bonus", ' + JSON.stringify(JSON.stringify(legacy)) + ')' : ''));
    // a very busy machine can hand the reloaded page a stale copy of the storage: reload until it shows what was written (a real bug would not go away on a retry)
    for (let i = 0; i < 5; i++) {
      await t.wait(150); await t.open();
      if (await ev(legacy ? 'localStorage.getItem("brawl.bonus") !== null' : 'localStorage.getItem("brawl.bonus") === null && JSON.stringify(SETTINGS.get("bonus.scores")) === \'{"benchmark":[],"squash":[]}\'')) break;
    }
    await ev(HELPERS);
  };

  // ---- registration, the title menu and the old score key ----
  await fresh();
  const reg = await ev("({ modes: MODES.list().filter(m => m.id === 'benchmark' || m.id === 'squash').map(m => m.id + ':' + m.label + ':' + m.players), items: titleItems().map(i => i.label), api: [typeof BONUS.run, typeof BONUS.open, typeof BONUS.state, typeof BONUS.best].join(), scores: JSON.stringify(SETTINGS.get('bonus.scores')), active: BONUS.active() })");
  check(JSON.stringify(reg.modes) === '["benchmark:BENCHMARK BREAK:1","squash:BUG SQUASH:1"]' && reg.items.includes('BENCHMARK BREAK') && reg.items.includes('BUG SQUASH'), 'BENCHMARK BREAK and BUG SQUASH are one player modes on the title menu');
  check(reg.api === 'function,function,function,function' && reg.scores === '{"benchmark":[],"squash":[]}' && reg.active === false, 'BONUS exposes run, open, state and best; the score lists start empty and nothing runs');
  await fresh({ squash: [{ s: 5, f: 1 }, { s: 777, f: 2 }], benchmark: 'junk' });
  check(await ev("BONUS.best('squash') === 777 && BONUS.board('squash').length === 2 && BONUS.board('squash')[0].f === 2 && BONUS.best('benchmark') === 0"), 'scores in the old brawl.bonus key are read once, sorted and cleaned');

  // ---- BENCHMARK BREAK from the title: lobby, countdown, mashing, a weak press, a perfect break ----
  await fresh();
  await ev("__title('benchmark')");
  check(await ev("BONUS.active() && BONUS.state().id === 'benchmark' && BONUS.state().scr === 'lobby' && game.phase === 'title' && game.mode === 1"), 'Enter on BENCHMARK BREAK opens its lobby over the title');
  const selIn = await ev('game.titleSel');
  await ev("__tap('KeyD'); __tap('KeyD'); __tap('KeyS'); render()");
  check(await ev('BONUS.state().who === 2 && BONUS.state().scr === "lobby" && game.titleSel === ' + selIn), 'D picks the next fighter in the lobby and the title menu underneath does not move');
  await ev("__tap('KeyA')");
  check((await ev('BONUS.state().who')) === 1, 'A picks the previous fighter');
  await ev("__tap('Enter'); step(40); __tap('KeyJ'); __tap('KeyK'); render()");
  check(await ev("BONUS.state().scr === 'ready' && BONUS.state().meter === 0"), 'the countdown ignores the attack keys');
  await ev('step(60); render()');
  check(await ev("BONUS.state().scr === 'play' && BONUS.state().lv === 0 && BONUS.state().line === 35"), 'the first stack, the wood crate, is up when the countdown ends');
  await ev("__tap('KeyJ'); __tap('KeyK'); __tap('KeyJ'); render()");
  const m1 = await ev('BONUS.state().meter');
  check(m1 > 15 && m1 < 40, 'J and K fill the power meter (alternating counts extra): ' + m1);
  await ev('step(100); render()');
  const m2 = await ev('BONUS.state().meter');
  check(m2 < m1, 'the meter drains when nobody mashes: ' + m1 + ' to ' + m2);
  await ev("__tap('KeyL')");
  check(await ev("BONUS.state().miss === 1 && BONUS.state().score === 0 && !BONUS.state().brk"), 'L below the break line is a weak hit: no break, no points');
  await ev("let g = 0; while (BONUS.state().meter < 99 && g++ < 60) __tap(g % 2 ? 'KeyJ' : 'KeyK'); __tap('KeyL'); step(20); render()");
  const b1 = await ev('BONUS.state()');
  check(b1.brk && b1.grades.length === 1 && b1.grades[0] === 'S' && b1.score >= 300, 'a full meter on L breaks the stack with the top grade: ' + JSON.stringify(b1.grades) + ' ' + b1.score);
  await ev('step(130)');
  check(await ev("BONUS.state().lv === 1 && BONUS.state().line === 45 && !BONUS.state().brk && BONUS.state().meter === 0"), 'the next stack, the server rack, comes in with a higher break line');
  const bEnd = await ev('__bench()');
  check(bEnd.scr === 'result' && bEnd.res.id === 'benchmark' && bEnd.res.grades.length === 5 && bEnd.res.grades.every(g => 'SABC-'.includes(g)) && bEnd.res.score >= bEnd.score && bEnd.res.score > 300, 'five stacks later the run ends with a score and a grade for each: ' + JSON.stringify(bEnd.res.grades) + ' ' + bEnd.res.score);
  await ev('render()');
  const best = await ev('BONUS.best("benchmark")');
  check(best === bEnd.res.score && bEnd.res.rank === 0 && (await ev('BONUS.board("benchmark")[0].f')) === 1, 'the score is saved as the best result with the fighter who earned it');
  await ev("step(10); __tap('Enter')");
  check(await ev("BONUS.state().scr === 'result'"), 'the result screen ignores keys for half a second');
  await ev("step(40); __tap('Escape')");
  check(await ev("!BONUS.active() && game.phase === 'title' && game.modeId === 'versus' && game.mode === 1"), 'Esc on the result screen returns to the title with the normal mode restored');
  for (let i = 0; i < 5; i++) { await t.wait(150); await t.open(); if ((await ev('BONUS.best("benchmark")')) === best) break; }   // retried for the same busy-machine reason as in fresh()
  check((await ev('BONUS.best("benchmark")')) === best, 'the best result survives a reload');
  await ev(HELPERS);

  // ---- BENCHMARK BREAK: running out of time costs the stack, and pause works ----
  await fresh();
  await ev("__title('benchmark'); __tap('Enter'); step(100)");
  await ev("__tap('KeyP'); step(30); render()");
  const p1 = await ev('BONUS.state()');
  await ev('step(120)');
  const p2 = await ev('BONUS.state()');
  check(p1.paused && p2.paused && p2.left === p1.left && p2.t === p1.t, 'P pauses the benchmark: the timer stands still');
  await ev("__tap('KeyP'); step(5)");
  check(await ev("!BONUS.state().paused && BONUS.state().left < " + p1.left), 'P again resumes it');
  await ev("let n = 0; while (BONUS.state().lv === 0 && n++ < 2000) step(1)");
  const to = await ev('BONUS.state()');
  check(to.lv === 1 && to.grades[0] === '-' && to.score === 0, 'a stack not broken in twelve seconds scores nothing and the next one comes');
  await ev("__tap('Escape'); __tap('KeyQ')");
  check(await ev("!BONUS.active() && game.phase === 'title' && BONUS.best('benchmark') === 0"), 'Q from the pause menu quits to the title without saving');

  // ---- BUG SQUASH from the title ----
  await fresh();
  await ev("__title('squash')");
  check(await ev("BONUS.active() && BONUS.state().id === 'squash' && BONUS.state().scr === 'lobby' && game.phase === 'title'"), 'Enter on BUG SQUASH opens its lobby over the title');
  await ev("__tap('KeyA'); __tap('Enter'); render(); step(100)");
  check(await ev("BONUS.state().scr === 'play' && BONUS.state().hp === 5 && BONUS.state().who === 4"), 'the lobby picked the last fighter; the run starts with five hearts');
  await ev('step(80); render()');
  const bug0 = await ev('BONUS.state().bugs');
  check(bug0.length >= 1 && bug0.some(b => b.x < 240 || b.x > 720), 'bugs crawl in from the screen edges: ' + JSON.stringify(bug0.slice(0, 3)));
  await ev("__tap('KeyA')");
  check((await ev('BONUS.state().face')) === -1, 'A turns the fighter left');
  await ev("__tap('KeyD')");
  check((await ev('BONUS.state().face')) === 1, 'D turns the fighter right');
  await ev("__tap('KeyL')");
  const sp = await ev('BONUS.state().sp');
  await ev("__tap('KeyL'); step(5)");
  check(sp >= 298 && (await ev('BONUS.state().sp')) < sp && (await ev('BONUS.state().sp')) > 280, 'L fires the special once; it then needs five seconds to recharge: ' + sp);
  await ev("__tap('KeyP'); step(40); render()");
  const q1 = await ev('BONUS.state().t');
  await ev('step(40)');
  check(await ev('BONUS.state().paused') && (await ev('BONUS.state().t')) === q1, 'P pauses the bug hunt');
  await ev("__tap('KeyP')");
  const play = await ev('__bot(1500)');
  check(play.kills >= 8 && play.score > play.kills * 10 && play.maxCombo >= 5, 'the scripted hunt squashes bugs and the combo multiplier pays more than the base points: ' + play.kills + ' bugs, ' + play.score + ' points, combo ' + play.maxCombo);
  check(play.hp > 0 && play.wave >= 1, 'it stays alive into the second wave');
  const full = await ev('__bot(5000)');
  check(full.scr === 'result' && full.res.id === 'squash' && full.res.score >= play.score && (full.res.reason === 'TIME' || full.res.reason === 'CRASH'), 'the run ends with a score: ' + full.res.reason + ' ' + full.res.score);
  await ev('render()');
  check(full.res.reason === 'TIME' ? (await ev('BONUS.state().t')) >= 3590 : true, 'a surviving run lasts the full sixty seconds');
  check((await ev('BONUS.best("squash")')) === full.res.score && full.res.rank === 0 && full.res.kills >= play.kills, 'the score is saved in the top five: ' + full.res.score);
  await ev("step(40); __tap('Enter')");
  check(await ev("BONUS.state().scr === 'ready' && BONUS.state().score === 0 && BONUS.state().hp === 5"), 'Enter on the result screen plays again');
  await ev("__tap('Escape'); __tap('KeyQ')");
  check(await ev("!BONUS.active() && game.phase === 'title' && game.modeId === 'versus'"), 'pause and Q go back to the title');

  // ---- BUG SQUASH: standing still ends in a crash and an unscored run is not saved ----
  await fresh();
  await ev("__title('squash'); __tap('Enter'); step(100)");
  const crash = await ev('__idle()');
  check(crash.scr === 'result' && crash.res.reason === 'CRASH' && crash.res.score === 0 && crash.hp === 0 && crash.res.rank === -1, 'bugs that are not squashed take every heart and crash the run');
  await ev('render()');
  check(await ev("BONUS.board('squash').length === 0"), 'a run without points is not saved');
  await ev("step(40); __tap('Escape')");
  check(await ev('!BONUS.active() && game.phase === "title"'), 'Esc leaves the result screen');

  // ---- BONUS.run: the hook for a later arcade ladder ----
  await fresh();
  await ev("game.mode = 2; game.modeId = 'versus2'; window.__done = 'none'; window.__ok = BONUS.run('squash', r => { window.__done = r; }, { fighter: 'wang' }); render()");
  check(await ev("window.__ok === true && BONUS.state().scr === 'ready' && ROSTER[BONUS.state().who].id === 'wang' && BONUS.run('benchmark') === false && BONUS.run('nope') === false"), 'BONUS.run starts a bonus stage without a lobby on the chosen fighter, and refuses a second one');
  await ev('step(100)');
  const ran = await ev('__bot(5000)');
  check(ran.scr === 'result' && (await ev("window.__done === 'none'")), 'the callback waits for the player to leave the result screen');
  await ev("step(40); __tap('Enter')");
  const done = await ev('window.__done');
  check(done && done.id === 'squash' && done.score === ran.res.score && done.finished === true && !(await ev('BONUS.active()')) && (await ev("game.modeId === 'versus2' && game.mode === 2")), 'Enter hands the result to the callback and restores the mode: ' + JSON.stringify(done && { id: done.id, score: done.score }));
  await ev("window.__done = 'none'; BONUS.run('benchmark', r => { window.__done = r; }); __tap('KeyP'); __tap('KeyQ')");
  check(await ev("window.__done === null && !BONUS.active()"), 'quitting a bonus stage calls the callback with null');
  check(await ev("(() => { const p = game.phase; game.phase = 'pause'; const r = BONUS.run('squash'); game.phase = p; return r === false && !BONUS.active(); })()"), 'BONUS.run never starts in the middle of a fight');
  check(await ev("(() => { const ok = BONUS.run('benchmark', null, { fighter: 'dot' }); const w = ROSTER[BONUS.state().who].id; BONUS.close(); return ok && w === 'dot' && !BONUS.active(); })()"), 'BONUS.close stops a running stage');
}
