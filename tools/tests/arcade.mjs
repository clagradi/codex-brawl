// Tests for arcade.js. Owner: the arcade agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Every check freezes the real-time loop with hold(true) and drives the game with real key events plus step(n), so the runs are deterministic.
export async function run(t) {
  const { check } = t, ev = t.eval;
  const press = async (code, n = 1) => { await t.key(code, true); await t.key(code, false); await ev('step(' + n + ')'); };
  const until = (cond, max = 3000) => ev(`(() => { let n = 0; while (!(${cond}) && n < ${max}) { step(1); n++; } return !!(${cond}); })()`);
  const fresh = async (hash = '') => { await t.open(); await ev('localStorage.clear()'); await t.open(hash); await ev('hold(true)'); };
  // the scripted KO: `w` wins `rounds` rounds by koBy (the engine's own KO path), waiting for each fight phase first
  const win = async (w, rounds = 2) => {
    for (let r = 0; r < rounds; r++) {
      if (!await until("game.phase === 'fight'", 2500)) return false;
      await ev(`game.koBy(game.f[${w}], game.f[${1 - w}])`);
    }
    return true;
  };
  const S = expr => ev(`(() => { const S = ARCADE.S; return ${expr}; })()`);

  // ---- the title: ARCADE first, SURVIVAL next, STATS as a title item, and the arcade run is startable by keys ----
  await fresh();
  const ids = await ev('titleItems().map(i => i.id)');
  check(ids[0] === 'arcade' && ids[1] === 'survival' && ids.includes('stats') && ids.includes('versus') && ids.includes('versus2'), 'ARCADE is first on the title menu, then SURVIVAL, with STATS and the two classic modes: ' + ids.join(','));
  check(await ev("game.titleSel === 0 && MODES.get('arcade').order === 5 && MODES.get('survival').label === 'SURVIVAL'"), 'the title cursor starts on ARCADE (mode order 5)');
  await press('Enter');
  check(await S("S.screen === 'select' && S.kind === 'arcade' && game.phase === 'title'"), 'Enter on ARCADE opens the fighter and difficulty screen');
  await press('KeyD'); await press('KeyS');
  check(await S('S.sel === 1 && S.diffSel === 2'), 'D picks the next fighter and S the next difficulty tier');
  await press('KeyW'); await ev('render()');
  await press('KeyJ');
  check(await S("S.screen === 'ladder' && !!S.run && S.run.kind === 'arcade' && S.run.pid === 1 && S.run.idx === 0 && SETTINGS.get('difficulty') === 'normal'"), 'J starts the run: ladder screen, the chosen fighter, the chosen difficulty stored in SETTINGS');
  const ord = await S('S.run.order.slice()');
  check(ord.length === 4 && new Set(ord).size === 4 && !ord.includes(1), 'the ladder holds the four other fighters, once each, in random order: ' + ord.join(','));
  await ev('render()');
  await ev('step(12)'); await press('KeyJ');
  check(await ev(`game.phase === 'vs' && game.modeId === 'arcade' && game.sel[0] === 1 && game.sel[1] === ${ord[0]} && game.arena === ARCADE.S.run.arenas[0]`), 'a button starts the first fight against the first rival on the stage arena');

  // ---- a scripted win advances the ladder; stats, badges and the toast follow ----
  check(await win(0), 'the fight starts after the vs screen and the intro');
  check(await until("ARCADE.S.screen === 'ladder' && ARCADE.S.run.idx === 1", 6000), 'two scripted KOs win the match and the ladder moves to the next rival');
  check(await S('S.run.won.length === 1 && S.run.won[0] === 0 && game.phase === "title"'), 'the won fight is marked and the engine end screen is skipped');
  await ev('render()');
  const st1 = await ev('ARCADE.stats()'), rival = await ev(`ROSTER[${ord[0]}].id`);
  check(st1.f.poteto.w === 1 && st1.f[rival].l === 1 && st1.matches === 1, 'stats count the win and the loss per fighter');
  check(st1.badges.first_blood === 1 && st1.badges.clean_merge === 1 && (await S('S.toasts.length')) >= 1, 'FIRST BLOOD and CLEAN MERGE were earned and toasted');
  check(await ev("JSON.parse(localStorage.getItem('brawl.stats')).f.poteto.w") === 1, "stats persist in localStorage 'brawl.stats'");

  // ---- the final boss: overclocked mirror, +15% speed and damage, then the ending cards and the credits ----
  await ev('(() => { const R = ARCADE.S.run; R.idx = 4; ARCADE.launchFight(); })()');
  const boss = await ev('({ name: game.f[1].d.name, id: game.f[1].d.id, oc: !!game.f[1].d.oc, spd: game.f[1].d.spd, pow: game.f[1].d.pow, base: { spd: ROSTER[1].spd, pow: ROSTER[1].pow } })');
  check(boss.oc && boss.id === 'poteto' && boss.name === 'POTETO (OVERCLOCKED)' && Math.abs(boss.spd / boss.base.spd - 1.15) < 1e-9 && Math.abs(boss.pow / boss.base.pow - 1.15) < 1e-9, 'the last rival is the player fighter overclocked: ' + boss.name);
  check(await ev('ROSTER[1].spd === ' + boss.base.spd + ' && game.f[0].d === ROSTER[1]'), 'the roster entry itself is left alone');
  await until("game.phase === 'intro'", 400); await ev('step(60); render()');
  check(await win(0), 'the boss fight starts');
  check(await until("ARCADE.S.screen === 'ending'", 6000), 'beating the boss opens the ending');
  check(await S("S.card === 0 && ARCADE.ENDINGS.poteto.length === 3 && ARCADE.ENDINGS.poteto.every(c => c.length === 2 && c.every(l => l.length <= 40))"), 'the ending has three cards of two short lines for the fighter');
  const st2 = await ev('ARCADE.stats()');
  check(st2.clears.normal === 1 && st2.ends.poteto === 1 && st2.badges.ladder_climber === 1, 'the clear is counted for the difficulty, the ending is unlocked and LADDER CLIMBER is earned');
  await ev('step(200); render()'); await press('Enter'); await ev('render()'); await press('Enter');
  check(await S('S.card === 1'), 'Enter finishes the typing and then moves to the next card');
  await press('Escape');
  check(await S("S.screen === 'credits'"), 'Esc skips the ending cards to the credits');
  await ev('step(30); render()'); await press('Enter');
  check(await S('S.screen === null && S.run === null') && await ev("game.phase === 'title'"), 'Enter skips the credits and returns to the title');

  // ---- CONTINUE?: ladder kept, a button continues, no answer returns to the title after 10 seconds ----
  await fresh();
  await ev("ARCADE.startRun('arcade', 0, 'easy'); ARCADE.launchFight();");
  check(await win(1), 'the CPU wins the first match');
  check(await until("ARCADE.S.screen === 'continue'", 6000), 'a lost fight opens CONTINUE?');
  check(await S('S.cd > 590 && S.cd <= 600 && S.run.idx === 0 && S.run.won.length === 0 && S.run.conts === 1'), 'the countdown starts at 10 seconds and the ladder is kept');
  await ev('step(120); render()');
  check(await S("S.screen === 'continue' && S.cd > 440 && S.cd < 490"), 'the countdown runs down one second per 60 ticks');
  await press('KeyK');
  check(await ev("game.phase === 'vs' && game.modeId === 'arcade' && ARCADE.S.run.idx === 0 && game.wins[0] === 0 && game.wins[1] === 0"), 'any button continues: the same stage again with the fight reset');
  check(await win(1) && await until("ARCADE.S.screen === 'continue'", 6000), 'losing again opens CONTINUE? again');
  await ev('step(560)');
  check(await S("S.screen === 'continue'"), 'the continue screen waits out the full ten seconds');
  await ev('step(60)');
  check(await S('S.screen === null && S.run === null') && await ev("game.phase === 'title'"), 'no answer: back to the title and the run is over');
  await ev('render()');

  // ---- SURVIVAL: health carries over, score, initials entry, top 10 ----
  await fresh();
  await press('KeyS'); await press('Enter');
  check(await S("S.screen === 'select' && S.kind === 'survival'"), 'S + Enter on the title opens SURVIVAL');
  await press('KeyJ');
  check(await ev("game.phase === 'vs' && game.modeId === 'survival' && ARCADE.S.screen === null"), 'J starts the first survival fight');
  await until("game.phase === 'fight'", 800);
  await ev("game.f[0].hp = 40; game.f[0].meter = 55; BUS.emit('hit', { src: game.f[0], victim: game.f[1], dmg: 4, kind: 'punch', combo: 10, hp: 90 });");
  check((await ev('ARCADE.stats()')).badges.ten_hit === 1, 'a ten hit combo earns TEN HIT');
  const mx = await ev('game.f[0].d.hp');
  check(await win(0, 1), 'one KO decides a survival fight');
  check(await until("ARCADE.S.screen === 'surv'", 6000), 'the win leads to the survival break screen');
  const r1 = await S('({ wins: S.run.wins, score: S.run.score, hp: S.run.hp, meter: S.run.meter })');
  check(r1.wins === 1 && r1.score >= 1000 && r1.score <= 1000 + 300 + 99 * 3 && Math.abs(r1.hp - Math.min(mx, 40 + mx * 0.25)) < 0.01 && r1.meter === 55, 'score is 1000 plus health and time bonus; health carries with +25% healing, the meter is kept: ' + JSON.stringify(r1));
  await ev('render()'); await press('KeyJ');
  check(await ev("game.phase === 'vs' && game.f[0].d.id === ROSTER[ARCADE.S.run.pid].id && game.f[1].d.id !== game.f[0].d.id"), 'a new rival is next');
  await until("game.phase === 'intro'", 800); await ev('step(2)');
  check(await ev(`Math.abs(game.f[0].hp - ${Math.min(mx, 40 + mx * 0.25)}) < 0.01 && game.f[0].meter === 55`), 'the next fight starts with the carried health and meter');
  await until("game.phase === 'fight'", 800);
  check(await win(1, 1) && await until("ARCADE.S.screen === 'initials'", 6000), 'losing ends the run and a score in the top ten asks for initials');
  await ev('render()');
  await press('KeyS'); await press('KeyJ'); await press('KeyS'); await press('KeyS'); await press('KeyJ'); await press('KeyW'); await ev('render()');
  check(await S("S.entry.l.join() === '1,2,25' && S.entry.pos === 2"), 'up and down change the letter, punch confirms it');
  await press('KeyJ');
  check(await S("S.screen === 'top10' && S.rank === 0"), 'the third letter confirms the entry and shows the top 10');
  await ev('render()');
  const top1 = await ev('ARCADE.top()');
  check(top1.length === 1 && top1[0].n === 'BCZ' && top1[0].s === r1.score && top1[0].w === 1, 'the run is stored with the initials, score and wins: ' + JSON.stringify(top1[0]));
  check((await ev('ARCADE.stats()')).surv.score === r1.score, 'the best survival run is kept in the stats');
  await ev('step(40)'); await press('KeyJ');
  check(await S('S.screen === null && S.run === null') && await ev("game.phase === 'title'"), 'a button leaves the high score table');
  await t.open();
  const top2 = await ev('ARCADE.top()');
  check(top2.length === 1 && top2[0].n === 'BCZ' && top2[0].s === r1.score, "the table survives a reload ('brawl.survival')");

  // ---- the top 10 table sorts, keeps ten and rejects scores that do not qualify ----
  await fresh();
  const rank = await ev(`(() => { const out = []; for (const s of [500, 9000, 1200, 7000, 300, 4000, 2500, 800, 6000, 3500, 1500, 9500]) out.push(ARCADE.addScore('ab1c', s, Math.round(s / 1000), 'hard')); return out; })()`);
  const tt = await ev('ARCADE.top()');
  check(tt.length === 10 && tt.every((e, i) => i === 0 || tt[i - 1].s >= e.s) && tt[0].s === 9500 && tt[9].s === 800, 'ten scores kept, sorted high to low: ' + tt.map(e => e.s).join(','));
  check(tt[0].n === 'ABC' && tt[0].d === 'hard' && rank[1] === 0, 'initials are three capital letters, ranks are returned');
  check(await ev('ARCADE.qualifies(900) && !ARCADE.qualifies(800) && !ARCADE.qualifies(0) && ARCADE.qualifies(10000)'), 'qualifies() compares with the tenth place');
  await t.open();
  check(JSON.stringify(await ev('ARCADE.top()')) === JSON.stringify(tt), 'the full table persists across a reload');
  await ev("localStorage.setItem('brawl.survival', '{broken'); localStorage.setItem('brawl.stats', 'nope')"); await t.open();
  check(await ev('ARCADE.top().length === 0 && ARCADE.stats().matches === 0'), 'corrupt stored stats and scores fall back to empty');

  // ---- stats after a demo match, and the STATS screen ----
  await fresh('#demo=0,1&stop');
  check(await until("game.phase === 'over'", 40000), 'a demo match runs to the end screen');
  const sd = await ev('ARCADE.stats()');
  const wins = Object.values(sd.f).reduce((a, x) => a + x.w, 0), losses = Object.values(sd.f).reduce((a, x) => a + x.l, 0);
  check(wins === 1 && losses === 1 && sd.matches === 1 && (sd.f.tibo.w + sd.f.tibo.l) === 1 && (sd.f.poteto.w + sd.f.poteto.l) === 1, 'stats update after a demo match: one win and one loss between the two fighters');
  check(JSON.stringify(await ev("JSON.parse(localStorage.getItem('brawl.stats')).f.tibo")) === JSON.stringify(sd.f.tibo), 'and they are written to localStorage');
  await t.open(); await ev('hold(true)');
  const items = await ev("titleItems().find(i => i.id === 'stats')");
  check(!!items && items.label === 'STATS', 'STATS is reachable from the title');
  await ev("game.titleSel = titleItems().findIndex(i => i.id === 'stats')"); await press('Enter');
  check(await S("S.screen === 'stats'"), 'Enter on STATS opens the stats screen');
  await ev('render()'); await press('Escape');
  check(await S('S.screen === null') && await ev("game.phase === 'title'"), 'Esc leaves the stats screen');

  // ---- badges and the unlock event ----
  await fresh();
  await ev("window.__un = []; BUS.on('unlock', e => window.__un.push(e));");
  check(await ev("ARCADE.earn('uptime') === true && ARCADE.earn('uptime') === false"), 'a badge is earned once');
  const un = await ev('window.__un');
  check(un.length === 1 && un[0].id === 'uptime' && typeof un[0].name === 'string' && typeof un[0].desc === 'string', "BUS 'unlock' fires once with { id, name, desc }");
  check(await S("S.toasts.length === 1 && S.toasts[0].b.id === 'uptime'") && await ev("ARCADE.stats().badges.uptime === 1 && JSON.parse(localStorage.getItem('brawl.stats')).badges.uptime === 1"), 'the unlock toast is queued and the badge persists');
  await ev('step(40); render()');
  await ev('step(200)');
  check(await S('S.toasts.length === 0'), 'the toast goes away by itself');
  await ev("ARCADE.earn('first_blood'); ARCADE.earn('hot_fix'); step(1)");
  check(await ev('ARCADE.BADGES.length === 8 && ARCADE.BADGES.every(b => b.name === b.name.toUpperCase() && b.desc.length > 8)'), 'badges have their own names and descriptions');
  await ev("game.phase = 'select'; step(1); render()");
  await ev("game.phase = 'title'");

  // ---- difficulty tiers: four values, the CPU still fights on every one of them ----
  await fresh();
  check(await ev("JSON.stringify(SETTINGS.list().find(d => d.key === 'difficulty').values) === '[\"easy\",\"normal\",\"hard\",\"nightmare\"]' && JSON.stringify(DIFFICULTY.nightmare) === '[0.95,0.3]'"), 'SETTINGS difficulty has the four tiers and the CPU ramp for nightmare');
  for (const d of ['easy', 'normal', 'hard', 'nightmare']) {
    await fresh();
    await ev(`ARCADE.startRun('arcade', 0, '${d}'); ARCADE.launchFight();`);
    const lvl = await ev('game.cpuLevel');
    check(await until("game.phase === 'fight'", 800), `${d}: the fight starts`);
    await ev('game.f[0].cpu = false; step(1200); render()');
    const hurt = await ev('game.f[0].hp < game.f[0].d.hp || game.phase !== "fight" || game.wins[1] > 0');
    check(hurt, `${d}: the CPU (level ${lvl}) attacks an idle player`);
  }
  await fresh();
  await ev("ARCADE.startRun('arcade', 0, 'easy'); ARCADE.launchFight()");
  const lv = await ev('game.cpuLevel');
  await fresh();
  await ev("ARCADE.startRun('arcade', 0, 'nightmare'); ARCADE.launchFight()");
  const lvN = await ev('game.cpuLevel');
  check(lv < 0.3 && lvN >= 0.95, `the CPU level follows the tier: easy ${lv}, nightmare ${lvN}`);

  // ---- leaving a run from the pause menu abandons it; nothing is left on screen ----
  await fresh();
  await ev("ARCADE.startRun('arcade', 2, 'normal'); ARCADE.launchFight();");
  await until("game.phase === 'fight'", 800);
  await ev("game.phase = 'pause'; step(1); game.phase = 'title'; step(2); render()");
  check(await S('S.run === null && S.screen === null'), 'leaving a fight for the title abandons the run');
}
