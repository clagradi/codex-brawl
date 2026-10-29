// Tests for modes2.js: TEAM BATTLE, TOURNAMENT and KING OF THE HILL. Owner: the modes2 agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// The long runs are fast-forwarded with step() under a seeded random generator that is installed only while stepping, so one seed gives one result:
// the team battle, the watched four-entrant tournament and the king of the hill session are each run twice and compared; the skipped bracket is run under two different generators.
export async function run(t) {
  try { await body(t); } finally { try { await t.eval('localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }   // leave the stored settings (rounds) as found for the test files that run after this one
}

async function body(t) {
  const { check, tap } = t, ev = t.eval, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const SEEDED = `window.__s = 1; window.reseed = n => { window.__s = n >>> 0; };
    window.m2step = n => { const old = Math.random; Math.random = () => { let a = (window.__s = (window.__s + 0x6D2B79F5) >>> 0); a = Math.imul(a ^ a >>> 15, a | 1); a ^= a + Math.imul(a ^ a >>> 7, a | 61); return ((a ^ a >>> 14) >>> 0) / 4294967296; }; try { step(n); } finally { Math.random = old; } };
    window.m2press = c => { pressed[c] = true; m2step(1); };
    window.m2auto = () => { let n = 0; while (game.phase !== 'vs' && n < 5) { m2step(1); n++; } game.f.forEach(f => { f.cpu = true; }); return 1; };   // the AI plays both sides
    window.m2quick = () => { let n = 0; while (game.phase !== 'over' && n < 20000) { if (game.phase === 'fight' && game.f[1].hp > 2) game.f[1].hp = 2; m2step(1); n++; } return n; };   // the right side is kept nearly dead, so the left side sweeps the match fast
    1`;
  const fresh = async seed => { await t.open(); await ev('hold(true); game.arenaPick = 0; 1'); await ev(SEEDED); await ev(`reseed(${seed || 1}); 1`); };
  const press = async code => { await tap(code); await ev('step(1); 1'); };   // a real key event, then one tick that consumes it
  const title = async id => { await ev(`game.titleSel = titleItems().findIndex(i => i.id === '${id}'); step(1); 1`); await press('Enter'); };
  const screen = () => ev('MODES2.screen()');
  await t.open(); await ev('localStorage.clear(); 1');

  // ---- the title menu and the registry ----
  await fresh();
  const items = await ev("titleItems().map(i => i.label)");
  check(['TEAM BATTLE', 'TOURNAMENT', 'KING OF THE HILL'].every(l => items.includes(l)), 'the title menu offers TEAM BATTLE, TOURNAMENT and KING OF THE HILL: ' + items.join(' | '));
  check(await ev("['team', 'tournament', 'koth'].every(id => MODES.get(id) && typeof MODES.get(id).onPick === 'function') && typeof MODES2 === 'object'"), 'the three modes are registered with MODES');

  // ---- team battle: the setup screen by keys ----
  await fresh();
  await title('team');
  check((await screen()) === 'team' && (await ev('game.phase')) === 'title' && (await ev('game.modeId')) === 'team', 'TEAM BATTLE opens its setup screen without the character select');
  await press('ArrowRight');   // P1 first slot: Poteto and Dot are already in the team, so the next free fighter is taken (no doubles inside a team)
  check(same(await ev('MODES2.team.cfg.teams[0]'), [3, 1, 2]), 'a team never holds the same fighter twice: ' + JSON.stringify(await ev('MODES2.team.cfg.teams[0]')));
  await press('ArrowDown'); await press('ArrowLeft'); await press('ArrowDown');   // same column of the other team, change it, then down to START
  await press('Enter');
  check((await ev('game.phase')) === 'vs' && (await ev('game.modeId')) === 'team' && (await ev('game.mode')) === 1 && same(await ev('game.sel'), [3, 1]), 'START BATTLE begins the match with each side first fighter: ' + (await ev('JSON.stringify([game.phase, game.sel, MODES2.team.state().map(s => s.ids)])')));
  check(await ev('game.toWin === 3 && roundsToWin() === 3'), 'a team battle is first to three bouts (HUD slots and roundsToWin)');
  await ev('(() => { let n = 0; while (game.phase !== "fight" && n < 900) { m2step(1); n++; } return 1; })()'); await t.wait(120);
  check(await ev('game.phase === "fight" && MODES2.team.state().every(s => s.idx === 0 && s.out.every(o => !o))'), 'the fight starts with both first fighters in, nobody out');

  // ---- team battle: a whole CPU against CPU battle, twice ----
  const teamRun = async seed => {
    await fresh(seed);
    await ev('MODES2.team.cfg.teams[0] = [0, 1, 2]; MODES2.team.cfg.teams[1] = [3, 4, 0]; MODES2.team.cfg.two = false; 1');
    return ev(`(() => {
      const log = [], bad = []; let prev = null;
      BUS.on('round:end', i => { const w = i.winner, mx = w ? w.d.hp : 0; log.push(['end', i.round, i.reason, w ? w.side : -1, w ? w.d.id : '', i.loser ? i.loser.d.id : '', w ? Math.round(w.hp) : 0]); prev = w ? { side: w.side, hp: w.hp, mx } : null; });
      BUS.on('round:start', i => {
        log.push(['start', i.round, game.f.map(f => f.d.id + ':' + Math.round(f.hp)).join(' ')]);
        if (prev && !game.sudden) {
          const w = game.f[prev.side], l = game.f[1 - prev.side];
          if (Math.round(w.hp) !== Math.min(prev.mx, Math.round(prev.hp + prev.mx * 0.2))) bad.push('winner health in round ' + i.round + ': ' + w.hp + ' after ' + prev.hp);
          if (l.hp !== l.d.hp) bad.push('the next fighter of the loser is not at full health in round ' + i.round);
        }
      });
      MODES2.team.start(); m2auto();
      let n = 0; while (game.phase !== 'over' && n < 60000) { m2step(1); n++; }
      const S = MODES2.team.state();
      return { n, phase: game.phase, wins: game.wins.slice(), log, bad, out: S.map(s => s.out.filter(Boolean).length), idx: S.map(s => s.idx), left: game.f.map(f => f.d.id), rtw: roundsToWin(), saved: JSON.parse(localStorage.getItem('brawl.settings') || '{}').rounds === undefined };
    })()`);
  };
  const A = await teamRun(31), B = await teamRun(31);
  check(A.phase === 'over' && A.n < 60000 && Math.max(...A.wins) === 3, 'a team battle runs to the end by itself: ' + A.wins.join('-') + ' after ' + A.n + ' ticks, ' + A.log.filter(l => l[0] === 'end').length + ' bouts');
  check(A.out[0] === A.wins[1] && A.out[1] === A.wins[0] && (A.wins[0] === 3 ? A.out[1] === 3 : A.out[0] === 3), 'a bout lost puts one fighter of that side out; the losing side ends with all three out: ' + JSON.stringify(A.out));
  check(!A.bad.length, 'the winner stays with its health plus 20% and the loser sends in the next fighter at full health' + (A.bad.length ? ': ' + A.bad[0] : ''));
  check(A.rtw === 3 && A.saved, 'three bouts to win comes from memory only: the stored rounds setting is untouched');
  check(same(A, B), 'the same seed plays the same team battle twice (' + A.log.length + ' events)');

  // ---- team battle: the end screen (Enter -> new teams, R -> same teams) ----
  await fresh(31);
  await ev('MODES2.team.cfg.teams[0] = [0, 1, 2]; MODES2.team.cfg.teams[1] = [3, 4, 0]; MODES2.team.start(); m2auto(); m2quick()'); await t.wait(120);   // the wait lets the end screen draw
  check(await ev('game.phase === "over" && game.wins[0] === 3 && game.wins[1] === 0 && MODES2.team.state()[1].out.every(Boolean)'), 'a forced sweep ends the battle 3-0 with the whole losing team out');
  await ev('m2press("KeyR"); 1');
  check(await ev('game.phase === "vs" && game.f[0].d.id === "tibo" && game.f[1].d.id === "wang" && MODES2.team.state().every(s => s.idx === 0 && s.out.every(o => !o))'), 'R on the end screen rematches with the same teams, first fighters back in');
  await ev('m2auto(); m2quick()');
  await ev('m2press("Enter"); 1');
  check((await screen()) === 'team' && (await ev('game.phase')) === 'title' && (await ev('roundsToWin()')) === 2 && (await ev('game.toWin')) === 0, 'Enter on the end screen goes back to the team setup and the normal rounds are back');

  // ---- tournament: the setup screen, a human match, quitting it from the pause menu ----
  await fresh();
  await title('tournament');
  check((await screen()) === 'tourSetup', 'TOURNAMENT opens its setup screen');
  await press('ArrowUp'); await press('ArrowRight');
  check((await ev('MODES2.tournament.state().model.n')) === 8, 'the entrants row switches between four and eight');
  await press('ArrowLeft'); await press('ArrowUp'); await press('Enter');   // up from the first row wraps to START TOURNAMENT
  check((await screen()) === 'bracket' && (await ev('MODES2.tournament.state().rounds.length')) === 2 && (await ev('MODES2.tournament.state().ents.map(e => e.human).join()')) === 'true,false,false,false', 'START TOURNAMENT shows the bracket: one human and three CPU entrants');
  await t.wait(100);
  await press('Enter');   // the only entry for a human match is PLAY MATCH
  check((await ev('game.modeId')) === 'tournament' && (await ev('game.phase')) === 'vs' && (await ev('game.mode')) === 1 && (await ev('!game.f[0].cpu && game.f[1].cpu')), 'PLAY MATCH starts the human match: the human on the left, the CPU on the right');
  await ev('(() => { let n = 0; while (game.phase !== "fight" && n < 900) { m2step(1); n++; } return 1; })()');
  check((await ev('game.f[0].d.id === ROSTER[MODES2.tournament.state().ents[0].f].id && game.f[1].d.id === ROSTER[MODES2.tournament.state().ents[1].f].id')), 'the entrants fight with the fighters they picked');
  await ev('m2press("KeyP"); 1'); await ev('m2press("KeyQ"); m2step(2); 1');
  check((await screen()) === 'bracket' && (await ev('MODES2.tournament.state().rounds[0][0].w')) === null && (await ev('MODES2.tournament.next().i')) === 0, 'quitting a tournament match from the pause menu returns to the bracket with that match still to play');
  await press('Escape'); check((await screen()) === 'bracket', 'one Escape on the bracket only asks to confirm');
  await press('Escape'); check((await screen()) === null && (await ev('game.phase')) === 'title', 'a second Escape quits the tournament');

  // ---- tournament: four CPU entrants, watched to the champion, twice ----
  const tourRun = async seed => {
    await fresh(seed); await ev('SETTINGS.set("rounds", 1); 1');   // one round to win keeps the fast-forward short; the rules are the same
    return ev(`(() => {
      MODES2.tournament.start({ seed: 21, ents: [0, 1, 2, 3].map(f => ({ human: false, f })) }); m2step(2);
      const seen = []; let guard = 0, ticks = 0;
      while (MODES2.screen() === 'bracket' && guard++ < 8) {
        const m = MODES2.tournament.next(); seen.push([m.r, m.i, m.a, m.b]);
        m2press('Enter'); let n = 0; while (!MODES2.screen() && n < 40000) { m2step(1); n++; } ticks += n; m2step(2);
      }
      const T = MODES2.tournament.state();
      return { screen: MODES2.screen(), seen, ticks, rounds: T.rounds.map(r => r.map(m => [m.a, m.b, m.w, m.score, m.sim])) };
    })()`);
  };
  const T1 = await tourRun(5), T2 = await tourRun(5), fin = T1.rounds[1][0];
  check(T1.screen === 'champion' && T1.seen.length === 3 && same(T1.seen.map(s => s[0]), [0, 0, 1]), 'a four-entrant all-CPU tournament plays two semi-finals and the final, then shows the champion (' + T1.ticks + ' ticks)');
  check(fin[2] === fin[0] || fin[2] === fin[1], 'the champion is one of the two finalists');
  check(fin[0] === T1.rounds[0][0][2] && fin[1] === T1.rounds[0][1][2] && T1.rounds.flat().every(m => m[3] && Math.max(...m[3]) === 1 && m[4] === false), 'the semi-final winners reach the final and every match was played out, not simulated: ' + JSON.stringify(T1.rounds));
  check(same(T1, T2), 'the same seed plays the same tournament twice');
  await ev('m2press("Enter"); 1');
  check((await screen()) === null, 'Enter on the champion screen leaves the tournament');

  // ---- tournament: eight CPU entrants skipped all the way: no randomness at all ----
  const skipRun = async rand => {
    await fresh(rand); await ev('SETTINGS.set("rounds", 1); 1');
    return ev(`(() => {
      MODES2.tournament.start({ seed: 8, ents: [0, 1, 2, 3, 4, 0, 1, 2].map(f => ({ human: false, f })) }); m2step(2);
      m2press('ArrowRight'); m2press('ArrowRight'); m2press('Enter'); m2step(2);
      const T = MODES2.tournament.state();
      return { screen: MODES2.screen(), n: T.n, rounds: T.rounds.map(r => r.map(m => [m.a, m.b, m.w, m.score, m.sim])), tag: game.phase };
    })()`);
  };
  const S1 = await skipRun(1), S2 = await skipRun(777);
  check(S1.screen === 'champion' && S1.n === 8 && S1.rounds.length === 3 && S1.rounds.flat().length === 7 && S1.rounds.flat().every(m => m[2] != null && m[4] === true), 'SKIP ALL CPU MATCHES plays the whole eight-entrant bracket at once (seven simulated matches)');
  check(same(S1, S2), 'a skipped bracket does not depend on the random generator: the tournament seed decides it');

  // ---- king of the hill ----
  await fresh();
  await title('koth');
  check((await screen()) === 'kothSetup', 'KING OF THE HILL opens its setup screen');
  await press('ArrowUp'); await press('ArrowRight');   // the players row: two to eight
  check((await ev('MODES2.koth.state().model.n')) === 4, 'the players row goes from three to four');
  await press('ArrowDown');   // first player: change the name letters by keys
  await press('Enter'); await press('ArrowRight');
  check((await ev('MODES2.koth.state().model.ents[0].tag')) === 'Q1 ', 'the name letters of a player are edited with left and right (P1 became Q1)');
  await press('Escape'); check((await screen()) === null, 'Escape leaves the setup');
  const kothRun = async seed => {
    await fresh(seed); await ev('SETTINGS.set("rounds", 1); 1');
    return ev(`(() => {
      MODES2.koth.start({ ents: [{ tag: 'AAA', f: 0 }, { tag: 'BOB', f: 1 }, { tag: 'CYD', f: 2 }, { tag: 'DEE', f: 3 }] }); m2step(2);
      const out = [];
      for (let i = 0; i < 4; i++) {
        const K = MODES2.koth.state(), before = { at: K.at.slice(), q: K.queue.slice() };
        m2press('Enter'); m2auto(); let g = 0; while (!MODES2.screen() && g < 40000) { m2step(1); g++; } m2step(2);
        out.push({ before, at: K.at.slice(), q: K.queue.slice(), last: { w: K.last.w, l: K.last.l, score: K.last.score.slice() }, ents: K.ents.map(e => [e.wins, e.streak, e.best]), g, mode: game.mode });
      }
      m2press('ArrowDown'); m2press('Enter'); m2step(2);
      return { out, end: MODES2.screen() };
    })()`);
  };
  const K1 = await kothRun(11), K2 = await kothRun(11);
  let kok = K1.end === 'kothEnd', kwhy = '';
  K1.out.forEach((o, i) => {
    const wi = o.before.at.indexOf(o.last.w), sw = o.last.w;
    if (wi < 0 || o.at[wi] !== sw) { kok = false; kwhy = 'the winner left its side in match ' + (i + 1); }
    if (o.at[1 - wi] !== o.before.q[0]) { kok = false; kwhy = 'the next in line did not take the free side in match ' + (i + 1); }
    if (!same(o.q, [...o.before.q.slice(1), o.last.l])) { kok = false; kwhy = 'the loser did not join the back of the queue in match ' + (i + 1); }
    if (o.ents[sw][1] < 1 || o.ents[o.last.l][1] !== 0 || o.ents.reduce((s, e) => s + e[0], 0) !== i + 1 || o.last.score[0] !== 1 || o.last.score[1] !== 0 || o.mode !== 2) { kok = false; kwhy = 'streaks, wins or score are off in match ' + (i + 1); }
  });
  check(kok, 'king of the hill: the winner stays on its side, the loser queues up, the next in line steps in, streaks and wins add up' + (kwhy ? ' (' + kwhy + ')' : ''));
  check(same(K1, K2), 'the same seed plays the same king of the hill session twice');
}
