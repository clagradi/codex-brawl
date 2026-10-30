// Tests for p-ranked.js (RANKED: the PERFORMANCE REVIEW rating against the CPU). Owner: the p-ranked agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// The maths are checked as pure functions; the flow is checked on the real engine: matches are played with hold(true) and step(n), a round is decided with game.koBy,
// so the match:end, round:start and phase events are the engine's own. Hooks used by p-ranked.js: update, drawTop. Settings: ranked.rating, ranked.record.
export async function run(t) {
  try { await body(t); } finally { try { await t.eval('localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }   // leave the stored settings as found for the next file
}

async function body(t) {
  const { check, tap } = t, ev = t.eval, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const HELP = `window.RK = {
    until: (phase, n) => { let i = 0; while (game.phase !== phase && i < (n || 3000)) { step(1); i++; } return game.phase === phase; },
    start: (a, b) => { MODES.pick('ranked'); game.sel = [a == null ? 0 : a, b == null ? 3 : b]; game.arenaPick = 0; startMatch(); return game.phase; },
    win: () => { RK.until('fight'); game.koBy(game.f[0], game.f[1]); step(1); },     // the human (P1) takes the round
    lose: () => { RK.until('fight'); game.koBy(game.f[1], game.f[0]); step(1); },    // the CPU takes the round
    // seq: 'WW' = the player wins two rounds in a row, 'LWL' = lost, won, lost ... then the engine runs on to the end screen
    play: seq => { for (const ch of seq) { if (ch === 'W') RK.win(); else RK.lose(); } return RK.until('over'); },
    seed: (r, games, extra) => { SETTINGS.set('ranked.rating', r); SETTINGS.set('ranked.record', Object.assign({ games: games, wins: Math.round(games / 2), losses: games - Math.round(games / 2), streak: 0, best: 0, peak: r, forfeits: 0, hist: [] }, extra || {})); },
    log: [], texts: [],
    spy: () => { if (RK.spied) return; RK.spied = true;
      const d0 = window.drawTitleText, u0 = window.uiText;
      window.drawTitleText = function (c, txt) { RK.texts.push(String(txt)); return d0.apply(this, arguments); };
      window.uiText = function (s) { RK.texts.push(String(s)); return u0.apply(this, arguments); }; },
    drawn: () => { RK.texts = []; render(); return RK.texts.slice(); },
  };
  BUS.on('ranked:result', r => RK.log.push(r));
  1`;
  const fresh = async () => { await t.open('#demo=0,1&stop'); await ev('localStorage.clear(); hold(true); 1'); await ev(HELP); await ev('RANKED.reset(); RK.spy(); 1'); };
  const rec = () => ev('RANKED.record()');

  // ---- structure ----
  await fresh();
  check(await ev("typeof RANKED === 'object' && ['calc', 'schedule', 'levelFor', 'tierOf', 'rankOf', 'state', 'reset'].every(k => typeof RANKED[k] === 'function')"), 'RANKED is loaded with its maths and its state');
  check(same(await ev('RANKED.RANKS.map(r => r.id)'), ['INTERN', 'JUNIOR', 'SENIOR', 'STAFF', 'PRINCIPAL', 'DISTINGUISHED']), 'the six ranks, lowest first');
  check(await ev("HOOKS.has('update') && HOOKS.has('drawTop') && MODES.get('ranked') && MODES.get('ranked').players === 1 && MODES.get('ranked').label === 'RANKED'"), 'RANKED is a one-player mode and uses the update and drawTop hooks');
  const ids = await ev('titleItems().map(i => i.id)');
  check(ids.includes('ranked') && ids.indexOf('ranked') > ids.indexOf('versus2') && ids[0] === 'versus' && ids[1] === 'versus2', 'the title menu has RANKED after the two classic entries: ' + ids.join(','));
  check((await ev("SETTINGS.get('ranked.rating')")) === 1000 && same(await rec(), { games: 0, wins: 0, losses: 0, streak: 0, best: 0, peak: 0, forfeits: 0, hist: [] }), 'a new player starts at 1000 with an empty record');
  check(await ev("SETTINGS.list().some(d => d.key === 'ranked.rating') && SETTINGS.list().some(d => d.key === 'ranked.record')"), 'the rating and the record are SETTINGS keys');

  // ---- the maths ----
  const m = await ev(`({
    e1: RANKED.expected(1000, 1000), e2: RANKED.expected(1200, 1000), e3: RANKED.expected(1000, 1200),
    ranks: [0, 1099, 1100, 1249, 1250, 1399, 1400, 1549, 1550, 1699, 1700, 5000].map(r => RANKED.rankOf(r).id),
    lv: [0, 450, 1000, 1417, 1867, 3000].map(RANKED.levelFor), tiers: [0.12, 0.324, 0.325, 0.45, 0.574, 0.575, 0.7, 0.824, 0.825, 0.97].map(RANKED.tierOf),
    win20: RANKED.calc(1000, 1000, 0, true, 2, 0, 2), win21: RANKED.calc(1000, 1000, 0, true, 2, 1, 2),
    lose02: RANKED.calc(1000, 1000, 0, false, 0, 2, 2), lose12: RANKED.calc(1000, 1000, 0, false, 1, 2, 2),
    old: RANKED.calc(1000, 1000, 10, true, 2, 0, 2), evenW: RANKED.calc(1000, 1000, 50, true, 2, 0, 2), evenL: RANKED.calc(1000, 1000, 50, false, 0, 2, 2),big: RANKED.calc(1800, 450, 50, true, 2, 0, 2), small: RANKED.calc(450, 1800, 50, false, 0, 2, 2),
    floor: RANKED.calc(0, 450, 50, false, 0, 2, 2), top: RANKED.calc(5000, 1870, 50, true, 2, 0, 2), up: RANKED.calc(1000, 1300, 50, true, 2, 0, 2), dn: RANKED.calc(1000, 1300, 50, false, 0, 2, 2),
  })`);
  check(m.e1 === 0.5 && Math.abs(m.e2 - 0.7597) < 0.001 && Math.abs(m.e3 + m.e2 - 1) < 1e-9, 'the Elo expectation: 0.5 between equals, 0.76 for a 200 point edge, and the two sides add up to 1');
  check(same(m.ranks, ['INTERN', 'INTERN', 'JUNIOR', 'JUNIOR', 'SENIOR', 'SENIOR', 'STAFF', 'STAFF', 'PRINCIPAL', 'PRINCIPAL', 'DISTINGUISHED', 'DISTINGUISHED']), 'rank borders are 1100, 1250, 1400, 1550 and 1700: ' + m.ranks.join(','));
  check(m.lv[2] === 0.45 && m.lv[0] === 0.12 && m.lv[1] === 0.12 && m.lv[4] === 0.97 && m.lv[5] === 0.97 && m.lv.every((v, i, a) => !i || v >= a[i - 1]), 'the CPU level follows the rating, starts at the NORMAL 0.45, is clamped to 0.12..0.97 and never drops as the rating climbs: ' + m.lv.join(','));
  check(same(m.tiers, ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'nightmare', 'nightmare']), 'a level maps to the nearest engine difficulty: ' + m.tiers.join(','));
  check(m.win20.delta === 25 && m.lose02.delta === -20 && m.old.delta === 15, 'an even match is worth +25 for a 2-0 win, -20 for a 0-2 loss, and the K factor drops from 40 to 24 after ten matches (+15): ' + [m.win20.delta, m.lose02.delta, m.old.delta].join(' '));
  check(m.win20.delta > m.win21.delta && m.win21.delta > 0 && Math.abs(m.lose02.delta) > Math.abs(m.lose12.delta) && m.lose12.delta < 0, 'a wider win pays more and a loss that took a round costs less: ' + [m.win20.delta, m.win21.delta, m.lose02.delta, m.lose12.delta].join(' '));
  check(m.big.delta >= 1 && m.small.delta <= -1, 'a win always gains at least 1 and a loss always costs at least 1, even against a huge gap');
  check(m.floor.next === 0 && m.floor.delta === 0 && m.top.next <= RANKED_CAP(m) && m.up.delta > m.evenW.delta && m.dn.delta > m.evenL.delta, 'the rating stays in 0..5000, beating a stronger opponent pays more than an even match (' + m.up.delta + ' against ' + m.evenW.delta + ') and losing to a stronger one costs less (' + m.dn.delta + ' against ' + m.evenL.delta + ')');
  const sc = await ev(`({ cyc: [0, 1, 2, 3, 4, 5, 6].map(g => RANKED.schedule(g, 1200).label + ':' + RANKED.schedule(g, 1200).opp), lo: RANKED.schedule(0, 100).opp, hi: RANKED.schedule(1, 3000).opp, lv: RANKED.schedule(0, 1000).level })`);
  check(same(sc.cyc, ['PEER:1200', 'STRETCH GOAL:1300', 'PEER:1200', 'WARM-UP:1100', 'PEER:1200', 'PEER:1200', 'STRETCH GOAL:1300']), 'the opponents cycle PEER, STRETCH GOAL, PEER, WARM-UP, PEER around the rating: ' + sc.cyc.join(' '));
  check(sc.lo === 450 && sc.hi === 1870 && sc.lv === 0.45, 'the opponent rating is clamped to 450..1870 and the first match is at level 0.45');
  const pv = await ev('RANKED.preview()');
  check(pv.rating === 1000 && pv.win === 20 && pv.lose === -20 && pv.label === 'PEER' && pv.level === 0.45, 'the stakes shown before a match are the base win and loss of the next opponent: ' + JSON.stringify([pv.win, pv.lose, pv.label]));

  // ---- the stored data is sanitised on every read ----
  await ev(`SETTINGS.set('ranked.record', { games: 'x', wins: -5, losses: 99, streak: 1.6, best: NaN, peak: 99999, forfeits: null, hist: [1, 'a', NaN, 99999, 1500, null] }); 1`);
  const dirty = await rec();
  check(dirty.games === 0 && dirty.wins === 0 && dirty.losses === 0 && dirty.streak === 2 && dirty.best === 0 && dirty.peak === 5000 && same(dirty.hist, [1, 5000, 1500]), 'a damaged record is cleaned up (counts are whole and consistent, the history keeps only numbers): ' + JSON.stringify(dirty));
  for (const bad of [null, 'junk', 42, [1, 2], { games: 3, wins: 9, losses: 9 }]) { await ev(`SETTINGS.set('ranked.record', ${JSON.stringify(bad)}); 1`); const r = await rec(); check(r.wins <= r.games && r.wins + r.losses <= r.games && Array.isArray(r.hist), 'a record of ' + JSON.stringify(bad) + ' reads back consistent: ' + JSON.stringify([r.games, r.wins, r.losses])); }
  await ev("SETTINGS.set('ranked.rating', 99999); 1"); check((await ev("SETTINGS.get('ranked.rating')")) === 5000, 'the rating is clamped to 5000');
  await ev("SETTINGS.set('ranked.rating', -50); 1"); check((await ev("SETTINGS.get('ranked.rating')")) === 0, 'and to 0');
  await ev('RANKED.reset(); 1');

  // ---- picking RANKED on the title, and the select flow by real keys ----
  await ev("setPhase('title'); step(2); game.titleSel = titleItems().findIndex(i => i.id === 'ranked'); step(1); 1"); await tap('Enter'); await ev('step(1); 1');
  check(same(await ev('[game.phase, game.modeId, game.mode]'), ['select', 'ranked', 1]), 'RANKED on the title opens the character select as a one-player mode');
  await tap('Enter'); await ev('step(1); 1'); await tap('Enter'); await ev('step(1); 1');
  check(same(await ev('[game.phase, game.modeId, RANKED.state().live]'), ['vs', 'ranked', true]), 'two Enter presses (P1, then the CPU fighter) start a rated match: ' + (await ev('game.phase')));
  const pick = await ev('RANKED.state()');
  check(pick.sched.level === 0.45 && (await ev('game.cpuLevel')) === 0.45 && !pick.started, 'the match starts at the level of the rating (0.45) before any round has begun');
  const vsTexts = await ev('RK.drawn()');
  check(vsTexts.some(s => s.startsWith('RANKED  -  INTERN 1000')) && vsTexts.some(s => s.includes('WIN +20 LOSE -20')), 'the VS screen shows the rank, the opponent and the stakes: ' + vsTexts.filter(s => s.includes('RANKED')).join('|'));

  // ---- a 2-0 win: rating, record, event, card ----
  await fresh();
  await ev("SETTINGS.set('difficulty', 'hard'); RK.start(0, 3); 1");
  check((await ev('game.cpuLevel')) === 0.45, 'a ranked match ignores the DIFFICULTY setting (hard would start at 0.7) and uses the rating level');
  await ev('RK.until("fight"); 1');
  check((await ev("SETTINGS.get('difficulty')")) === 'normal' && (await ev("JSON.parse(localStorage.getItem('brawl.settings')).difficulty")) === 'hard', 'on screen the engine reads the rating tier (normal), while the stored setting is still hard');
  await ev("game.phase = 'pause'; step(1); 1");
  check((await ev("SETTINGS.get('difficulty')")) === 'hard', 'the paused options menu shows the real setting');
  const warn = await ev('RK.drawn()');
  check(warn.some(s => s.startsWith('RANKED MATCH  -  QUITTING COUNTS AS A LOSS (-')), 'the pause screen warns that quitting counts as a loss: ' + warn.filter(s => s.includes('QUITTING')).join('|'));
  await ev("game.phase = 'fight'; step(1); 1");
  check(await ev('RANKED.live()'), 'the match is live once the first round has begun');
  await ev('RK.win(); 1');
  check((await ev('game.cpuLevel')) === 0.45, 'the level does not ramp from round to round');
  await ev('RK.until("fight"); 1');
  check((await ev('game.cpuLevel')) === 0.45 && (await ev('game.round')) === 2, 'not even in round 2 (the engine would have added 0.20)');
  check(await ev('RK.play("W")'), 'the match runs on to the end screen');
  const r1 = await ev('RANKED.last()');
  check(r1 && r1.won && r1.before === 1000 && r1.after === 1025 && r1.delta === 25 && r1.rankAfter === 0 && !r1.promoted && !r1.forfeit && same(r1.wins, [2, 0]), 'a 2-0 win against the 1000 opponent: +25 to 1025: ' + JSON.stringify([r1.before, r1.after, r1.delta, r1.wins]));
  check((await ev("SETTINGS.get('ranked.rating')")) === 1025 && same(await rec(), { games: 1, wins: 1, losses: 0, streak: 1, best: 1, peak: 1025, forfeits: 0, hist: [1025] }), 'the rating and the record are stored');
  check((await ev('RK.log.length')) === 1 && (await ev("SETTINGS.get('difficulty')")) === 'hard', 'BUS ranked:result fired once, and after the match the difficulty reads the real setting again');
  check(await ev("JSON.parse(localStorage.getItem('brawl.settings'))['ranked.rating'] === 1025"), 'the rating is in localStorage (SETTINGS)');
  await ev('step(60); 1');
  const card = await ev('RK.drawn()');
  check(['PERFORMANCE REVIEW', 'INTERN', 'EXCEEDS EXPECTATIONS'].every(s => card.includes(s)) && card.includes('1025') && card.includes('+25') && card.includes('1-0'), 'the end screen carries the rank card: title, rank, rating, change, verdict and record: ' + card.filter(s => /REVIEW|INTERN|EXPECT|1025|\+25|1-0/.test(s)).join('|'));
  check(card.some(s => s.startsWith('NEXT CPU LEVEL 53')) && card.some(s => s.startsWith('VS CPU LEVEL 45 - PEER - ROUNDS 2-0')), 'it names the opponent just played and the level of the next one: ' + card.filter(s => /CPU LEVEL/.test(s)).join('|'));
  await ev("game.modeId = 'versus'; 1");
  check(!(await ev('RK.drawn()')).includes('PERFORMANCE REVIEW'), 'the card is only drawn in a ranked match');
  await ev("game.modeId = 'ranked'; 1");

  // ---- the next match: level follows the rating, a loss, the streak ----
  await ev('RK.start(0, 3); 1');
  check(Math.abs((await ev('game.cpuLevel')) - 0.525) < 1e-9 && (await ev('RANKED.state().sched.label')) === 'STRETCH GOAL', 'match two is a STRETCH GOAL: the opponent is rated 1125, so the CPU is at level ' + (await ev('game.cpuLevel')));
  check(await ev('RK.play("LL")'), 'two rounds lost');
  const r2 = await ev('RANKED.last()');
  check(!r2.won && r2.delta < 0 && r2.after === 1025 + r2.delta && same(r2.wins, [0, 2]) && r2.k === 40, 'a 0-2 loss against a stronger opponent costs rating: ' + r2.delta);
  const rc2 = await rec();
  check(rc2.games === 2 && rc2.wins === 1 && rc2.losses === 1 && rc2.streak === 0 && rc2.best === 1 && rc2.peak === 1025 && same(rc2.hist, [1025, r2.after]), 'the record shows 1-1, the streak is back to 0 and the best streak and the peak are kept: ' + JSON.stringify(rc2));
  await ev('step(80); 1'); const lost = await ev('RK.drawn()');
  check(lost.includes('BELOW EXPECTATIONS') && lost.includes(String(r2.delta)), 'the card says so (BELOW EXPECTATIONS and the negative change)');
  await ev('RK.start(0, 3); 1'); await ev('RK.play("LWW"); 1');
  const r3 = await ev('RANKED.last()');
  check(r3.won && same(r3.wins, [2, 1]) && r3.mult === 1.125, 'a comeback win 2-1 gets the smaller margin bonus (x1.125): ' + JSON.stringify([r3.wins, r3.mult]));
  check(same(await ev('RANKED.state().record.hist.length'), 3) && (await ev('RK.log.length')) === 3, 'three rated matches, three results');

  // ---- promotion and demotion ----
  await fresh();
  await ev('RK.seed(1095, 20); RK.start(0, 3); 1'); await ev('RK.play("WW"); 1');
  const up = await ev('RANKED.last()');
  check(up.promoted && up.rankBefore === 0 && up.rankAfter === 1 && up.after >= 1100 && (await ev("RANKED.rankOf(SETTINGS.get('ranked.rating')).id")) === 'JUNIOR', 'a win across the border is a promotion to JUNIOR: ' + up.before + ' to ' + up.after);
  await ev('step(80); 1'); const upCard = await ev('RK.drawn()');
  check(upCard.includes('PROMOTION APPROVED') && upCard.includes('JUNIOR'), 'the card shows PROMOTION APPROVED and the new rank');
  await ev('RK.seed(1105, 20); RK.start(0, 3); 1'); await ev('RK.play("LL"); 1');
  const dn = await ev('RANKED.last()');
  check(dn.demoted && dn.rankBefore === 1 && dn.rankAfter === 0 && dn.after < 1100, 'a loss back across the border is a demotion to INTERN: ' + dn.before + ' to ' + dn.after);
  await ev('step(80); 1'); check((await ev('RK.drawn()')).includes('PERFORMANCE PLAN'), 'the card shows PERFORMANCE PLAN');
  await ev('RK.seed(1690, 40); RK.start(0, 3); 1'); await ev('RK.play("WW"); 1');
  const top = await ev('RANKED.last()');
  check(top.rankAfter === 5 && top.promoted,'DISTINGUISHED is reached at 1700 (the bar is full, there is no next rank): ' + top.after);
  await ev('step(80); 1'); check((await ev('RK.drawn()')).includes('TOP OF THE LADDER'), 'the top rank has no next border to show');

  // ---- the CPU level at the top and at the bottom ----
  await ev('RK.seed(1800, 40); RK.start(0, 3); 1');
  check((await ev('game.cpuLevel')) > 0.9 && (await ev("SETTINGS.get('difficulty')")) === 'nightmare' || (await ev('game.cpuLevel')) > 0.9, 'at 1800 the CPU is at level ' + (await ev('game.cpuLevel')));
  await ev('RK.seed(300, 40); startMatch(); 1');
  check((await ev('game.cpuLevel')) <= 0.2, 'at 300 the CPU is gentle (level ' + (await ev('game.cpuLevel')) + ')');

  // ---- leaving a live match is a loss ----
  await fresh();
  await ev('RK.start(0, 3); 1'); await ev("setPhase('title'); step(1); 1");
  check((await ev("SETTINGS.get('ranked.rating')")) === 1000 && (await rec()).games === 0, 'leaving the VS screen before round one costs nothing');
  await ev('RK.start(0, 3); RK.until("fight"); step(30); game.phase = "pause"; step(1); setPhase("title"); step(1); 1');
  const fo = await ev('RANKED.last()'), frec = await rec();
  check(fo && fo.forfeit && !fo.won && fo.delta === -20 && fo.after === 980 && frec.games === 1 && frec.losses === 1 && frec.forfeits === 1 && frec.streak === 0, 'QUIT TO TITLE in the middle of a match is a full loss (-20): ' + JSON.stringify([fo && fo.delta, frec.forfeits]));
  const toast = await ev('RANKED.toast()');
  check(toast && toast.delta === -20 && toast.after === 980, 'the title says what it cost');
  const tt = await ev('RK.drawn()');
  check(tt.includes('RANKED MATCH LEFT - COUNTED AS A LOSS') && tt.includes('-20  RATING 980  INTERN'), 'the note is drawn on the title: ' + tt.filter(s => s.includes('RATING')).join('|'));
  await ev('step(430); 1'); check((await ev('RANKED.toast()')) === null, 'and goes away by itself');
  await ev('RK.start(0, 3); RK.until("fight"); step(10); 1'); await ev('startMatch(); 1');
  check((await rec()).forfeits === 2 && (await ev('RANKED.state().live')) === true && (await ev('RANKED.live()')) === false, 'restarting a live match counts as leaving it, and the new match is rated afresh');
  await ev("setPhase('title'); step(1); 1"); check((await rec()).forfeits === 2, 'leaving it again before its first round costs nothing');
  await ev("RK.seed(1000, 0); RK.start(0, 3); RK.play('WW'); step(5); setPhase('select'); step(1); setPhase('title'); step(1); 1");
  check((await rec()).games === 1 && (await rec()).forfeits === 0, 'a finished match is never forfeited afterwards (end screen to select to title)');
  await fresh(); await ev("RK.start(0, 3); RK.until('fight'); game.phase = 'pause'; step(1); 1");
  await ev("render(); 1"); check(await ev("(() => { RK.texts = []; render(); return RK.texts.some(s => s.includes('QUITTING COUNTS')); })()"), 'the pause warning shows while the match is live');
  await ev("game.phase = 'fight'; step(1); game.koBy(game.f[0], game.f[1]); step(1); 1");

  // ---- the other modes are untouched ----
  await fresh();
  await ev("SETTINGS.set('difficulty', 'easy'); MODES.pick('versus'); game.sel = [0, 3]; game.arenaPick = 0; startMatch(); 1");
  check((await ev('game.cpuLevel')) === 0.2 && (await ev("SETTINGS.get('difficulty')")) === 'easy' && (await ev('RANKED.state().live')) === false, 'a normal 1 player match still uses the DIFFICULTY setting (easy, 0.2) and is not rated');
  await ev('RK.play("WW"); 1');
  check((await ev("SETTINGS.get('ranked.rating')")) === 1000 && (await rec()).games === 0 && (await ev('RK.log.length')) === 0, 'and moves no rating');
  await ev("setPhase('title'); step(1); MODES.pick('versus2'); game.sel = [0, 3]; startMatch(); RK.until('fight'); setPhase('title'); step(1); 1");
  check((await rec()).forfeits === 0, 'quitting a two player match costs nothing');
  check(!(await ev('RK.drawn()')).some(s => s.includes('RATING') || s.includes('NO MATCHES YET')), 'no rating note shows on the title while another entry is highlighted');
  await ev("game.titleSel = titleItems().findIndex(i => i.id === 'ranked'); step(1); 1");
  check((await ev('RK.drawn()')).some(s => s.startsWith('INTERN 1000  -  NO MATCHES YET')), 'with RANKED highlighted the title shows the rank and rating');

  // ---- the rating survives a reload ----
  await ev('RK.seed(1333, 30); 1'); await t.open('#demo=0,1&stop'); await ev('hold(true); 1');
  check((await ev("SETTINGS.get('ranked.rating')")) === 1333 && (await ev("RANKED.rankOf(RANKED.rating()).id")) === 'SENIOR' && (await ev('RANKED.record().games')) === 30, 'after a reload the rating, the rank and the record are still there');
  await ev('RANKED.reset(); 1'); check((await ev('RANKED.rating()')) === 1000 && (await rec()).games === 0, 'RANKED.reset() puts a player back to 1000 with an empty record');

  // ---- every screen draws without throwing (the page console must stay clean) ----
  await ev(HELP); await ev('RK.spy(); RK.seed(1555, 25, { wins: 15, losses: 10, streak: 3, best: 4, peak: 1580, hist: [1380, 1400, 1420, 1450, 1470, 1440, 1500, 1480, 1520, 1555] }); MODES.pick("ranked"); game.phase = "select"; step(1); 1');
  check((await ev('RK.drawn()')).some(s => s.startsWith('PRINCIPAL 1555 - WIN +')), 'the select screen shows the badge (rank, rating, stakes)');
  await ev('RK.start(1, 2); 1'); await ev('RK.play("WW"); step(50); 1');
  const fin = await ev('RK.drawn()');
  check(fin.includes('PRINCIPAL') && fin.some(s => /^\+\d+$/.test(s)) && fin.includes('16-10'), 'a PRINCIPAL card renders with the new record');
  for (const [a, b] of [[0, 4], [2, 1], [4, 2]]) { await ev(`RK.start(${a}, ${b}); RK.play('LL'); step(60); render(); 1`); }
  check(await ev("game.phase === 'over' && RANKED.record().games === 29 && RANKED.record().hist.length === 12"), 'matches with other fighters are rated the same way, and the history keeps the last 12 ratings');
}

function RANKED_CAP(m) { return 5000; }
