// Tests for p-daily.js: SPRINT OF THE DAY (a daily challenge seeded from the local date, a streak and a result card). Owner: the p-daily agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// Three layers: the pure functions (dates, the plan of a day, the streak), the sprint itself (fixed rules, modifiers, the stats the goals are judged on) and the screens (briefing, versus, result card, keys).
// Matches are fast-forwarded with step() under a seeded random generator that is installed only while stepping; a round is decided with game.koBy(), the engine's own KO path.
export async function run(t) {
  const errors0 = t.p.errors.length;
  try { await body(t, errors0); } finally { try { await t.eval('localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }   // leave the stored settings as found for the test files that run after this one
}

// The plans of three fixed days (fighter, opponent, modifier, goal, goal number). The arena is left out on purpose: it is picked from however many arenas the game has.
const SNAP = [['2026-01-01', 2, 0, 'rookie', 'nospecial', 0], ['2026-10-30', 2, 4, 'nometer', 'noblock', 0], ['2027-02-14', 3, 4, 'glass', 'specials', 2]];
const BACK_X = 600;   // inside the BACK button (x from 490 to 710, y from 476 to 508)

async function body(t, errors0) {
  const { check, tap } = t, ev = t.eval, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const SETUP = `window.__s = 1;
    window.dstep = n => { const old = Math.random; Math.random = () => { let a = (window.__s = (window.__s + 0x6D2B79F5) >>> 0); a = Math.imul(a ^ a >>> 15, a | 1); a ^= a + Math.imul(a ^ a >>> 7, a | 61); return ((a ^ a >>> 14) >>> 0) / 4294967296; }; try { step(n); } finally { Math.random = old; } };
    window.dpress = c => { pressed[c] = true; dstep(1); };
    window.dfight = () => { let n = 0; while (game.phase !== 'fight' && game.phase !== 'over' && game.phase !== 'title' && n < 1500) { dstep(1); n++; } return game.phase; };   // through the versus screen and the intro
    window.dko = side => { if (dfight() !== 'fight') return game.phase; game.koBy(game.f[side], game.f[1 - side]); let n = 0; while (n < 4000 && game.phase !== 'over' && game.phase !== 'intro') { if (game.phase === 'finish') finishOff(); dstep(1); n++; } return game.phase; };   // side wins the round
    window.dwin = side => { for (let i = 0; i < 6 && game.phase !== 'over'; i++) dko(side); return game.phase; };   // side wins the match, however many rounds it takes
    window.texts = fn => { const out = [], u = window.uiText, d = window.drawTitleText; window.uiText = function (s) { out.push(String(s)); return u.apply(this, arguments); }; window.drawTitleText = function (c, s) { out.push(String(s)); return d.apply(this, arguments); }; try { fn(); } finally { window.uiText = u; window.drawTitleText = d; } return out; };
    window.seen = () => texts(() => render());
    window.findDay = (pred, from, span) => { const b = DAILY.dayNum(from || '2026-01-01'); for (let i = 0; i < (span || 900); i++) { const k = DAILY.keyOf(b + i); if (pred(DAILY.planFor(k), k)) return k; } return null; };
    window.nextKey = (k, n) => DAILY.keyOf(DAILY.dayNum(k) + (n === undefined ? 1 : n));
    window.EASY = ['nojump', 'noblock', 'taken', 'nospecial', 'noloss', 'speed'];   // goals that a match in which you do nothing satisfies
    window.HARD = ['combo', 'specials', 'super', 'throws', 'knocks', 'hits'];      // goals that it misses
    1`;
  const fresh = async today => {
    await ev('localStorage.clear(); 1'); await t.open(); await ev('hold(true); 1'); await ev(SETUP);   // the options of an earlier part must not leak into this one
    await ev(`SETTINGS.set('daily.state', null); DAILY.setToday(${today ? JSON.stringify(today) : 'null'}); game.arenaPick = 2; 1`);
  };
  const press = async code => { await tap(code); await ev('dstep(1); 1'); };   // a real key event, then one tick that consumes it
  const title = async id => { await ev(`game.titleSel = titleItems().findIndex(i => i.id === '${id}'); dstep(1); 1`); await press('Enter'); };
  const D = x => ev('DAILY.' + x);
  const day = pred => ev(`findDay(${pred})`);
  const go = async key => {   // the sprint of `key`, started from wherever the game is
    await ev(`DAILY.setToday('${key}'); if (game.phase !== 'title') setPhase('title'); dstep(1); 1`);
    if ((await D('screen()')) !== 'daily') await title('daily');
    await press('Enter');
  };
  const near = (a, b) => Math.abs(a - b) < 0.2;

  // ================= pure: dates =================
  await t.open();
  check(await ev("typeof DAILY === 'object' && typeof MODES.get('daily') === 'object'"), 'DAILY is exposed and the mode is registered');
  check(await ev("DAILY.dateKey(new Date(2026, 0, 5, 23, 59, 59)) === '2026-01-05' && DAILY.dateKey(new Date(2026, 11, 31, 0, 0, 1)) === '2026-12-31' && DAILY.dateKey(new Date(2024, 1, 29, 12)) === '2024-02-29'"), 'the day key is the LOCAL calendar date: late evening and just after midnight stay on their own day');
  check(await ev("DAILY.setToday(null); DAILY.today() === DAILY.dateKey(new Date())"), 'without an override today is the local date of this computer');
  check(await ev("DAILY.setToday('2031-07-04'); const a = DAILY.today(); DAILY.setToday(null); a === '2031-07-04' && DAILY.today() !== '2031-07-04'"), 'the test override replaces today and clears again');
  check(await ev("DAILY.dayNum('1970-01-01') === 0 && DAILY.dayNum('1970-01-02') === 1 && DAILY.dayNum('2026-03-10') - DAILY.dayNum('2026-03-09') === 1 && isNaN(DAILY.dayNum('nope')) && isNaN(DAILY.dayNum(20260310))"), 'dayNum counts whole days since 1970 and refuses anything but YYYY-MM-DD');
  check(await ev("(() => { const b = DAILY.dayNum('2025-12-01'); for (let i = 0; i < 1500; i++) { const k = DAILY.keyOf(b + i); if (DAILY.dayNum(k) !== b + i || !DAILY.validKey(k)) return false; } return true; })()"), 'keyOf and dayNum round-trip for 1500 days, including every daylight saving change and leap day');
  check(await ev("DAILY.prevKey('2026-03-01') === '2026-02-28' && DAILY.prevKey('2024-03-01') === '2024-02-29' && DAILY.prevKey('2026-01-01') === '2025-12-31' && DAILY.prevKey('2026-03-30') === '2026-03-29' && DAILY.prevKey('2026-10-26') === '2026-10-25'"), 'the previous day is right over month ends, a leap day, the new year and the clock changes of March and October');
  check(await ev("['2026-02-31', '2026-13-01', '2026-00-10', '2026-1-1', '', 'x', null, 5, undefined, '2026-02-29'].every(k => !DAILY.validKey(k)) && DAILY.validKey('2024-02-29') && DAILY.validKey('2026-12-31')"), 'validKey rejects impossible dates and non strings');
  check(await ev("DAILY.dayLabel('2026-10-30') === 'FRI 30 OCT 2026' && DAILY.dayLabel('2024-02-29') === 'THU 29 FEB 2024'"), 'the day label has the weekday, the day, the month and the year');
  check(await ev("DAILY.fmtTime(0) === '0:00' && DAILY.fmtTime(75.9) === '1:15' && DAILY.fmtTime(600) === '10:00'"), 'times print as minutes and seconds');

  // ================= pure: the seeds and the plan of a day =================
  check(await ev("DAILY.hashStr('') === 2166136261 && DAILY.hashStr('a') === 3826002220 && DAILY.hashStr('2026-01-01') !== DAILY.hashStr('2026-01-02')"), 'the string hash is FNV-1a (known test values)');
  check(await ev("(() => { const a = DAILY.rng(7), b = DAILY.rng(7), c = DAILY.rng(8); let ok = true, diff = false; for (let i = 0; i < 200; i++) { const x = a(), y = b(), z = c(); if (x !== y) ok = false; if (x !== z) diff = true; if (!(x >= 0 && x < 1)) ok = false; } return ok && diff; })()"), 'the generator repeats for one seed, differs for another and stays in [0, 1)');
  check(await ev("(() => { const a = JSON.stringify(DAILY.planFor('2026-05-05')), old = Math.random; Math.random = () => { throw new Error('planFor must not use Math.random'); }; try { return a === JSON.stringify(DAILY.planFor('2026-05-05')); } finally { Math.random = old; } })()"), 'a day gives the same plan every time and never asks for a random number');
  const snap = await ev(`${JSON.stringify(SNAP.map(s => s[0]))}.map(k => { const p = DAILY.planFor(k); return [k, p.f, p.o, p.mod, p.goal, p.n]; })`);
  check(same(snap, SNAP), 'the plans of three fixed days are pinned (a change of the algorithm would change everybody\'s day): ' + JSON.stringify(snap));
  const survey = await ev(`(() => {
    const b = DAILY.dayNum('2026-01-01'), n = ROSTER.length, f = new Array(n).fill(0), o = f.slice(), ar = new Set(), mods = new Set(), goals = new Set(), bad = [], keys = new Set();
    for (let i = 0; i < 700; i++) {
      const k = DAILY.keyOf(b + i), p = DAILY.planFor(k), mod = DAILY.MODS.find(m => m.id === p.mod), goal = DAILY.GOALS.find(g => g.id === p.goal);
      f[p.f]++; o[p.o]++; ar.add(p.arena); mods.add(p.mod); goals.add(p.goal); keys.add(JSON.stringify([p.f, p.o, p.arena, p.mod, p.goal, p.n]));
      if (p.f === p.o) bad.push(k + ' same fighter');
      if (!(p.f >= 0 && p.f < n && p.o >= 0 && p.o < n && p.arena >= 0 && p.arena < ARENAS.length)) bad.push(k + ' out of range');
      if (!mod || !goal) { bad.push(k + ' unknown mod or goal'); continue; }
      if ((mod.clash || []).includes(p.goal)) bad.push(k + ' ' + p.mod + ' clashes with ' + p.goal);
      if (goal.n ? !goal.n.includes(p.n) : p.n !== 0) bad.push(k + ' bad n ' + p.n);
      if (p.key !== k || p.day !== b + i) bad.push(k + ' key or day');
      const r = p.rules; if (!(r.rounds >= 1 && r.rounds <= 3 && r.time >= 30 && r.time <= 99 && ['easy', 'normal', 'hard'].includes(r.difficulty))) bad.push(k + ' rules ' + JSON.stringify(r));
      for (const key of Object.keys(mod.rules || {})) if (r[key] !== mod.rules[key]) bad.push(k + ' rule ' + key);
      if (DAILY.goalText(p).length < 8) bad.push(k + ' goal text');
    }
    return { f, o, arenas: ar.size, nArenas: ARENAS.length, mods: mods.size, nMods: DAILY.MODS.length, goals: goals.size, nGoals: DAILY.GOALS.length, bad: bad.slice(0, 5), distinct: keys.size };
  })()`);
  check(!survey.bad.length, 'over 700 days every plan is valid: two different fighters, an arena that exists, a modifier and a goal that do not clash, a goal count from the list' + (survey.bad.length ? ': ' + survey.bad.join(' | ') : ''));
  check(Math.min(...survey.f) > 80 && Math.min(...survey.o) > 80, 'every fighter plays and every fighter is faced a fair share of days: ' + survey.f.join(',') + ' / ' + survey.o.join(','));
  check(survey.arenas === survey.nArenas && survey.mods === survey.nMods && survey.goals === survey.nGoals, 'every arena (' + survey.arenas + '), modifier (' + survey.mods + ') and goal (' + survey.goals + ') comes up within 700 days');
  check(survey.distinct > 650, 'the days are varied: ' + survey.distinct + ' different plans in 700 days');
  check(await ev("DAILY.MODS.length >= 8 && DAILY.GOALS.length >= 10 && DAILY.MODS.every(m => /^[A-Z0-9 ]+$/.test(m.name) && /^[A-Z0-9 .,-]+$/.test(m.text)) && DAILY.GOALS.every(g => (g.n || [0]).every(n => /^[A-Z0-9 -]+$/.test(g.text(n))))"), 'every modifier and goal text is capitals, digits and plain punctuation only (the pixel font)');
  check(await ev("DAILY.BASE_RULES.rounds === 2 && DAILY.BASE_RULES.time === 99 && DAILY.BASE_RULES.difficulty === 'normal'"), 'the base rules are two rounds, 99 seconds, normal CPU');

  // ================= pure: goals =================
  check(await ev(`(() => { const s = o => Object.assign({ jumps: 0, blocks: 0, throws: 0, specials: 0, supers: 0, knocks: 0, hits: 0, maxCombo: 0, taken: 0, secs: 0, lost: 0 }, o), g = DAILY.goalMet; return [
    g('nojump', 0, s({})), !g('nojump', 0, s({ jumps: 1 })), g('noblock', 0, s({})), !g('noblock', 0, s({ blocks: 2 })),
    g('taken', 45, s({ taken: 45 })), !g('taken', 45, s({ taken: 45.5 })), g('combo', 3, s({ maxCombo: 3 })), !g('combo', 4, s({ maxCombo: 3 })),
    g('specials', 2, s({ specials: 2 })), !g('specials', 3, s({ specials: 2 })), g('super', 0, s({ supers: 1 })), !g('super', 0, s({ specials: 5 })),
    g('nospecial', 0, s({})), !g('nospecial', 0, s({ supers: 1 })), !g('nospecial', 0, s({ specials: 1 })), g('throws', 2, s({ throws: 3 })), !g('throws', 2, s({ throws: 1 })),
    g('knocks', 3, s({ knocks: 3 })), !g('knocks', 3, s({ knocks: 2 })), g('noloss', 0, s({})), !g('noloss', 0, s({ lost: 1 })),
    g('speed', 50, s({ secs: 49.9 })), !g('speed', 50, s({ secs: 50 })), g('hits', 12, s({ hits: 12 })), !g('hits', 12, s({ hits: 11 }))].every(Boolean); })()`), 'every goal judges its numbers on the right side of the limit (jumps, blocks, damage, combo, specials, super, throws, knockdowns, rounds lost, time, hits)');

  // ================= pure: the saved state and the streak =================
  const st = await ev(`(() => {
    const A = DAILY.applyResult, L = DAILY.liveStreak, k0 = '2026-03-10', k1 = '2026-03-11', k2 = '2026-03-12', k4 = '2026-03-14', k5 = '2026-03-15', r = {};
    let s = DAILY.sanitize(null); r.empty = JSON.stringify(s);
    s = A(s, k0, 2); r.d0 = [s.streak, s.best, s.cleared, s.won, s.played, s.last, s.h[k0].s, s.h[k0].n];
    s = A(s, k1, 2); r.d1 = [s.streak, s.best, s.cleared, s.last];
    const again = A(s, k1, 2); r.retry = [again.streak, again.cleared, again.played, again.h[k1].n];
    r.live = [L(s, k1), L(s, k2), L(s, k4)];                       // shown the same day, the next day (yesterday was cleared) and after a gap
    const lostFirst = A(A(DAILY.sanitize(null), k0, 0), k0, 2); r.lostThenCleared = [lostFirst.streak, lostFirst.played, lostFirst.won, lostFirst.cleared, lostFirst.h[k0].s, lostFirst.h[k0].n];
    const missed = A(s, k2, 1); r.missed = [missed.streak, missed.last, missed.won, missed.cleared, missed.h[k2].s];
    const lost = A(s, k2, 0); r.lost = [lost.streak, lost.last, lost.won, lost.played, lost.h[k2].s];
    const gap = A(s, k4, 2); r.gap = [gap.streak, gap.best, gap.last, L(gap, k4), L(gap, k5)];
    const old = A(s, '2026-03-01', 2); r.old = [old.streak, old.last, old.cleared, old.best];     // an older day cleared late changes neither the streak nor the last day
    let m = DAILY.sanitize(null); for (const k of ['2026-02-27', '2026-02-28', '2026-03-01']) m = A(m, k, 2); r.month = [m.streak, m.last];
    let y = DAILY.sanitize(null); for (const k of ['2024-02-28', '2024-02-29', '2024-03-01']) y = A(y, k, 2); r.leap = [y.streak];
    let c = DAILY.sanitize(null); for (const k of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) c = A(c, k, 2); r.dst = [c.streak, c.best];
    let big = DAILY.sanitize(null); for (let i = 0; i < 45; i++) big = A(big, DAILY.keyOf(DAILY.dayNum('2026-01-01') + i), i % 3); r.trim = [Object.keys(big.h).length, Object.keys(big.h).sort()[0], big.played];
    const before = JSON.stringify(s); A(s, k2, 2); r.pure = before === JSON.stringify(s);
    r.badArgs = JSON.stringify(A(s, 'not a day', 2)) === JSON.stringify(s) && JSON.stringify(A(s, k2, 7)) === JSON.stringify(s) && JSON.stringify(A(s, k2, '2')) === JSON.stringify(s);
    return r;
  })()`);
  check(JSON.parse(st.empty).streak === 0 && JSON.parse(st.empty).last === '' && JSON.parse(st.empty).v === 1, 'an empty state has no streak');
  check(same(st.d0, [1, 1, 1, 1, 1, '2026-03-10', 2, 1]), 'the first cleared day starts a streak of 1: ' + JSON.stringify(st.d0));
  check(same(st.d1, [2, 2, 2, '2026-03-11']), 'the next day cleared makes 2: ' + JSON.stringify(st.d1));
  check(same(st.retry, [2, 2, 2, 2]), 'clearing the same day again counts a try but not a second clear or streak day: ' + JSON.stringify(st.retry));
  check(same(st.live, [2, 2, 0]), 'the streak shows on the day after the last clear and is gone after a missed day: ' + JSON.stringify(st.live));
  check(same(st.lostThenCleared, [1, 1, 1, 1, 2, 2]), 'losing and then clearing the same day plays it once, wins it once, clears it once and counts both tries: ' + JSON.stringify(st.lostThenCleared));
  check(same(st.missed, [2, '2026-03-11', 3, 2, 1]), 'a win that missed the goal keeps the streak where it was (and does not extend it): ' + JSON.stringify(st.missed));
  check(same(st.lost, [2, '2026-03-11', 2, 3, 0]), 'a lost day does not touch the streak: ' + JSON.stringify(st.lost));
  check(same(st.gap, [1, 2, '2026-03-14', 1, 1]), 'a gap restarts the streak at 1 and keeps the best: ' + JSON.stringify(st.gap));
  check(same(st.old, [2, '2026-03-11', 3, 2]), 'clearing an older day late does not move the streak: ' + JSON.stringify(st.old));
  check(same(st.month, [3, '2026-03-01']) && same(st.leap, [3]) && same(st.dst, [3, 3]), 'the streak runs over a month end, a leap day and the clock changes: ' + JSON.stringify([st.month, st.leap, st.dst]));
  check(st.trim[0] === 30 && st.trim[1] === '2026-01-16' && st.trim[2] === 45, 'only the last 30 days are kept in the history while the totals keep counting: ' + JSON.stringify(st.trim));
  check(st.pure && st.badArgs, 'applyResult does not change its input and ignores a bad day or status');
  const san = await ev(`(() => { const S = DAILY.sanitize, r = [];
    for (const bad of ['x', 7, true, [1, 2], [], () => 1, { last: '2026-02-31', streak: 9 }, { last: '2026-03-10', streak: -5 }, { last: '2026-03-10', streak: NaN, best: Infinity, cleared: 'a' }, { h: { bad: { s: 2, n: 1 }, '2026-03-10': { s: 7, n: 1 }, '2026-03-11': null } }, { last: 5, streak: 3 }])
      { try { const s = S(bad); r.push(JSON.stringify([s.v, typeof s.streak, s.streak, s.best >= s.streak, Object.keys(s.h).length, s.last])); } catch (e) { r.push('threw ' + e.message); } }
    const big = S({ last: '2026-03-10', streak: 1e12, best: 1e12, cleared: 1e12, h: { '2026-03-10': { s: 2, n: 1e12 } } });
    return { r, big: [big.streak, big.best, big.cleared, big.h['2026-03-10'].n], keep: JSON.stringify(S({ last: '2026-03-10', streak: 4, best: 6, cleared: 5, won: 6, played: 7, h: { '2026-03-10': { s: 2, n: 3 } } })) }; })()`);
  check(san.r.every(x => !x.startsWith('threw')), 'sanitize survives any junk: ' + san.r.filter(x => x.startsWith('threw')).join(' | '));
  check(san.r.slice(0, 6).every(x => JSON.parse(x)[0] === 1 && JSON.parse(x)[2] === 0 && JSON.parse(x)[4] === 0), 'junk that is not an object reads as an empty state: ' + san.r.slice(0, 6).join(' '));
  check(san.r[6].endsWith(',""]') && JSON.parse(san.r[7])[2] === 0 && JSON.parse(san.r[8])[2] === 0 && JSON.parse(san.r[9])[4] === 0 && JSON.parse(san.r[10])[5] === '', 'a bad last day, a negative or NaN count and a bad history entry all fall back to empty values: ' + san.r.slice(6).join(' '));
  check(same(san.big, [99999, 99999, 99999, 99999]), 'huge numbers are capped');
  check(JSON.parse(san.keep).streak === 4 && JSON.parse(san.keep).best === 6 && JSON.parse(san.keep).h['2026-03-10'].n === 3 && JSON.parse(san.keep).cleared === 5, 'a good state passes through unchanged');

  // ================= the title menu and the briefing =================
  await fresh('2026-06-15');
  const items = await ev('titleItems().map(i => i.label)');
  check(items.includes('SPRINT OF THE DAY'), 'the title menu offers SPRINT OF THE DAY: ' + items.join(' | '));
  check(await ev("(() => { const m = MODES.get('daily'); return m.id === 'daily' && m.players === 1 && typeof m.onPick === 'function' && typeof m.onMatchEnd === 'function' && m.label === 'SPRINT OF THE DAY'; })()"), 'the mode is a one player mode with a picker and a match end handler');
  await title('daily');
  check((await D('screen()')) === 'daily' && (await ev('game.phase')) === 'title', 'picking it opens the briefing over the title without the character select');
  let sc = await ev('seen()');
  const plan = await ev("DAILY.planFor('2026-06-15')");
  const mod = await ev(`DAILY.MODS.find(m => m.id === '${plan.mod}')`);
  const goalLine = await ev("DAILY.goalText(DAILY.planFor('2026-06-15'))");
  check(sc.includes('SPRINT OF THE DAY') && sc.includes(goalLine) && sc.includes(mod.name) && sc.includes(mod.text) && sc.includes('MON 15 JUN 2026 - THE SAME CHALLENGE FOR EVERYBODY TODAY'), 'the briefing shows the date, the modifier with its rule and the goal: ' + sc.slice(0, 9).join(' | '));
  check(sc.includes('FIGHT') && sc.includes('BACK') && sc.includes('TODAY: NOT PLAYED YET') && sc.includes('0') && sc.includes('DAYS STREAK'), 'it offers FIGHT and BACK and says the day is not played yet, with a streak of 0');
  const fname = await ev(`SHORT(ROSTER[${plan.f}])`), oname = await ev(`SHORT(ROSTER[${plan.o}])`);
  check(sc.includes(fname) && sc.includes(oname) && sc.includes('YOU') && sc.includes('OPPONENT (CPU)') && sc.includes(await ev(`ARENAS[${plan.arena}].name`)), 'it names both fighters and the arena: ' + fname + ' vs ' + oname);
  await press('ArrowRight');
  check((await D('screen()')) === 'daily', 'the arrows keep the briefing open');
  await press('Enter');
  check((await D('screen()')) === null && (await ev('game.phase')) === 'title' && !(await D('run().on')), 'BACK (chosen with the arrows) closes the briefing and nothing was started');
  await title('daily'); await press('Escape');
  check((await D('screen()')) === null && (await ev('game.phase')) === 'title', 'Escape also goes back');
  await title('daily'); await ev('DAILY.setToday("2026-06-16"); dstep(1); 1');
  sc = await ev('seen()');
  check(sc.some(x => x.startsWith('TUE 16 JUN 2026')) && sc.includes(await ev("DAILY.goalText(DAILY.planFor('2026-06-16'))")), 'when midnight passes with the briefing open it switches to the new day');
  await ev('DAILY.setToday("2026-06-15"); dstep(1); 1');
  // a tap on the canvas (touch and mouse): the engine turns it into ENTER, so a tap on BACK has to pick BACK first
  const tapAt = (x, y) => ev(`(() => { const c = document.getElementById('c'), r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + ${x} * r.width / W, clientY: r.top + ${y} * r.height / H, button: 0, pointerType: 'mouse', bubbles: true })); dstep(1); return DAILY.screen() + '/' + game.phase; })()`);
  check((await tapAt(BACK_X, 492)) === 'null/title', 'a tap on the BACK button goes back');
  await title('daily');
  check((await tapAt(480, 300)) === 'null/vs', 'a tap anywhere else starts the sprint');

  // ================= a sprint: start, fixed rules, the versus screen, leaving it =================
  await fresh('2026-06-15');
  const keepSel = await ev('game.sel.slice()');
  await ev("SETTINGS.set('rounds', 4); SETTINGS.set('time', 40); SETTINGS.set('difficulty', 'hard'); 1");
  const plainDay = await day("(p, k) => !DAILY.MODS.find(m => m.id === p.mod).rules && !DAILY.MODS.find(m => m.id === p.mod).meterLock && p.mod !== 'glass'");
  await ev(`DAILY.setToday('${plainDay}'); 1`);
  const pp = await ev(`DAILY.planFor('${plainDay}')`);
  await title('daily'); await press('Enter');
  check((await ev('game.phase')) === 'vs' && (await ev('game.modeId')) === 'daily' && (await ev('game.mode')) === 1 && (await D('run().on')), 'FIGHT starts the sprint on the versus screen in one player mode');
  check(same(await ev('game.sel'), [pp.f, pp.o]) && (await ev('game.f[0].d.id === ROSTER[' + pp.f + '].id && game.f[1].d.id === ROSTER[' + pp.o + '].id && !game.f[0].cpu && game.f[1].cpu')), 'the day fighter is yours and the day opponent is the CPU: ' + JSON.stringify([pp.f, pp.o]));
  check((await ev('game.arena')) === pp.arena && (await ev('game.arenaPick')) === 2, 'the fight is in the arena of the day and your own arena pick is untouched');
  check((await ev('roundsToWin()')) === 2 && (await ev('game.cpuLevel')) === 0.45, 'the rules are the fixed ones whatever the options say: two rounds to win, normal CPU (options say 4 and hard)');
  sc = await ev('seen()');
  check(sc.includes('GOAL: ' + (await ev(`DAILY.goalText(DAILY.planFor('${plainDay}'))`))) && sc.some(x => x.startsWith('SPRINT OF THE DAY - ')), 'the versus screen shows the modifier and the goal');
  await ev('dfight(); 1');
  check((await ev('game.timer')) === 99, 'the round clock starts at the fixed 99 seconds (options say 40)');
  sc = await ev('seen()');
  check(sc.some(x => x.startsWith('GOAL: ')) && sc.includes(await ev(`'SPRINT OF THE DAY - ' + DAILY.MODS.find(m => m.id === '${pp.mod}').name`)), 'during the fight the HUD keeps the goal, its progress and the modifier on screen');
  check((await ev("SETTINGS.get('rounds')")) === 2 && (await ev("JSON.parse(localStorage.getItem('brawl.settings') || '{}').rounds")) === 4, 'the stored options are not touched while the sprint runs (the rules are read in memory only)');
  await ev('game.phase = "pause"; 1'); await press('KeyQ'); await ev('dstep(2); 1');   // quit from the pause menu
  check((await ev('game.phase')) === 'title' && (await D('screen()')) === 'daily' && !(await D('run().on')) && same(await ev('game.sel'), keepSel), 'quitting from the pause menu returns to the briefing with no result and your own fighter selection back');
  check((await ev("SETTINGS.get('rounds')")) === 4 && (await ev("SETTINGS.get('time')")) === 40 && (await ev("SETTINGS.get('difficulty')")) === 'hard', 'your options are back after the sprint: 4 rounds, 40 seconds, hard');
  check(same(await D('state().h'), {}) && (await D('state().played')) === 0, 'a sprint that was left is not scored');

  // ================= the modifiers, and no leakage into the other modes =================
  await fresh('2026-06-15');
  const measure = `(() => { const [a, b] = game.f; a.cpu = false; b.cpu = false; a.x = 300; b.x = 700; a.face = 1; b.face = -1; a.inv = b.inv = 0; a.set('idle'); b.set('idle');
    const hb = b.hp, ha = a.hp; b.takeHit(a, 20, 0, 6, 'punch', {}); a.inv = 0; a.set('idle'); a.takeHit(b, 20, 0, 6, 'punch', {});
    return { toCpu: hb - b.hp, toMe: ha - a.hp }; })()`;
  const normal = async () => { await ev("setPhase('title'); dstep(1); game.mode = 1; game.modeId = 'versus'; game.sel = [0, 1]; game.arenaPick = 0; startMatch(); dfight(); 1"); };
  await normal();
  const base = await ev(measure);
  check(base.toCpu > 0 && base.toMe > 0 && (await ev('roundsToWin()')) === 2 && (await ev('game.timer')) === (await ev("SETTINGS.get('time')")), 'baseline in a normal match: the hit lands both ways (' + base.toCpu.toFixed(2) + ' / ' + base.toMe.toFixed(2) + ')');
  const modRun = async id => {
    const k = await day(`p => p.mod === '${id}'`);
    await go(k); await ev('dfight(); 1');
    return { k, m: await ev(measure) };
  };
  const glass = (await modRun('glass')).m, fragile = (await modRun('fragile')).m, bulky = (await modRun('bulky')).m;
  check(near(glass.toCpu, base.toCpu * 1.6) && near(glass.toMe, base.toMe * 1.6), 'GLASS CANNONS: damage is x1.6 for both sides (' + glass.toCpu.toFixed(2) + ' / ' + glass.toMe.toFixed(2) + ' against ' + base.toCpu.toFixed(2) + ' / ' + base.toMe.toFixed(2) + ')');
  check(near(fragile.toCpu, base.toCpu * 1.5) && near(fragile.toMe, base.toMe), 'FRAGILE FOE: the CPU takes 50 percent more, you take the normal damage (' + fragile.toCpu.toFixed(2) + ' / ' + fragile.toMe.toFixed(2) + ')');
  check(near(bulky.toCpu, base.toCpu * 0.7) && near(bulky.toMe, base.toMe), 'IRON FOE: the CPU takes 30 percent less (' + bulky.toCpu.toFixed(2) + ' / ' + bulky.toMe.toFixed(2) + ')');
  const rk = await modRun('rookie');
  check(near(rk.m.toCpu, base.toCpu) && near(rk.m.toMe, base.toMe) && (await ev('game.cpuLevel')) === 0.2, 'ROOKIE CPU leaves the damage alone and sets the CPU to easy (level 0.2)');
  await modRun('nometer');
  await ev('game.f[0].meter = 80; game.f[1].meter = 60; dstep(30); 1');   // past the hit stop of the measuring hits
  check(same(await ev('game.f.map(f => f.meter)'), [0, 0]), 'NO METER: both meters are kept empty');
  await modRun('fast'); check((await ev('game.timer')) === 45, 'SPEED ROUNDS: the round clock starts at 45 seconds: ' + (await ev('game.timer')));
  await modRun('one'); check((await ev('roundsToWin()')) === 1, 'ONE ROUND: one round to win');
  await modRun('marathon'); check((await ev('roundsToWin()')) === 3, 'MARATHON: three rounds to win');
  await modRun('hard'); check((await ev('game.cpuLevel')) === 0.7, 'HARD CPU: the CPU starts at the hard level (0.7)');
  // after the sprint nothing of it remains
  await ev('game.phase = "pause"; 1'); await press('KeyQ'); await ev('dstep(2); 1'); await press('Escape');
  await normal();
  const after = await ev(measure);
  check(near(after.toCpu, base.toCpu) && near(after.toMe, base.toMe) && (await ev('roundsToWin()')) === 2 && (await ev('game.timer')) === (await ev("SETTINGS.get('time')")) && (await ev('game.cpuLevel')) === 0.45, 'after a sprint a normal match has the normal damage, rules and CPU again (' + after.toCpu.toFixed(2) + ' / ' + after.toMe.toFixed(2) + ')');
  check(!(await D('run().on')), 'and the sprint is no longer running');
  await ev('game.f[0].meter = 70; dstep(2); 1');
  check((await ev('game.f[0].meter')) > 0, 'the meter of a normal match is not locked any more');
  // another feature takes the game over in the middle of a sprint
  await fresh('2026-06-15');
  await title('daily'); await press('Enter'); await ev('dfight(); 1');
  await ev("game.modeId = 'versus'; dstep(2); 1");
  check(!(await D('run().on')), 'if another mode takes the game over the sprint is over and its rules go with it');
  check((await ev("SETTINGS.get('rounds')")) === (await ev("SETTINGS.defaults ? SETTINGS.defaults.rounds : SETTINGS.get('rounds')")), 'and the options read as the stored ones');

  // ================= the stats the goals are judged on =================
  await fresh('2026-06-15');
  const calm = await day("p => p.mod === 'rookie'");
  await go(calm); await ev('dfight(); (() => { const [a, b] = game.f; b.cpu = false; a.x = 200; b.x = 760; a.face = 1; b.face = -1; })(); dstep(1); 1');
  const stats = () => D('run().stats');
  const zero = { jumps: 0, blocks: 0, throws: 0, specials: 0, supers: 0, knocks: 0, hits: 0, maxCombo: 0, taken: 0, secs: 0, lost: 0 };
  check(same(await stats(), zero), 'the sprint starts with all stats at zero');
  await t.key('KeyD', true); await ev('dstep(20); 1'); await t.key('KeyD', false); await ev('dstep(2); 1');
  check((await stats()).jumps === 0 && (await ev('game.f[0].x')) > 200, 'walking is not a jump');
  const jump = async () => { await t.key('KeyW', true); await ev('dstep(4); 1'); await t.key('KeyW', false); return ev('(() => { let n = 0; while (game.f[0].onGround && n < 30) { dstep(1); n++; } let m = 0; while (!game.f[0].onGround && m < 300) { dstep(1); m++; } dstep(6); return m; })()'); };   // hold up, wait for the take off, wait for the landing
  const air = await jump();
  check((await stats()).jumps === 1 && air > 5, 'one jump from the ground counts once (' + air + ' ticks in the air)');
  await jump();
  check((await stats()).jumps === 2, 'a second jump counts again: ' + (await stats()).jumps);
  const close = 'const [a, b] = game.f; a.x = 300; b.x = 340; a.face = 1; b.face = -1; a.inv = b.inv = 0; a.cool = b.cool = 0; a.set("idle"); b.set("idle"); a.vx = b.vx = 0;';
  await ev(`(() => { ${close} })(); 1`);
  await ev('game.f[1].takeHit(game.f[0], 8, 2, 8, "punch", {}); 1');
  check((await stats()).hits === 1 && (await stats()).taken === 0 && (await stats()).maxCombo === 1, 'a hit you land counts as a hit (a combo of 1), not as damage taken');
  await ev(`(() => { ${close} })(); game.f[0].takeHit(game.f[1], 11, 2, 8, "punch", {}); 1`);
  const s2 = await stats();
  check(s2.hits === 1 && s2.taken > 0 && s2.taken < 30, 'a hit you take counts as damage taken: ' + s2.taken);
  await ev(`(() => { ${close} a.set("block"); })(); game.f[0].takeHit(game.f[1], 11, 2, 8, "punch", {}); 1`);
  check((await stats()).blocks === 1 && (await stats()).taken === s2.taken, 'a blocked hit counts as a block and no damage taken');
  await ev(`(() => { ${close} })(); game.f[1].takeHit(game.f[0], 8, 2, 8, "punch", { knock: true }); 1`);
  check((await stats()).knocks === 1, 'a knockdown you cause counts');
  const before = await stats();
  await ev('BUS.emit("knockdown", { src: game.f[1], victim: game.f[0] }); BUS.emit("block", { src: game.f[0], victim: game.f[1] }); BUS.emit("throw", { src: game.f[1], victim: game.f[0] }); BUS.emit("special", { fighter: game.f[1], foe: game.f[0], move: {} }); BUS.emit("super", { fighter: game.f[1], foe: game.f[0], move: {} }); BUS.emit("hit", { src: game.f[1], victim: game.f[1], dmg: 5, combo: 9 }); 1');
  check(same(await stats(), before), 'what the CPU does (its knockdowns, throws, specials, supers, combos) is never counted for you');
  await ev('BUS.emit("special", { fighter: game.f[0], foe: game.f[1], move: {} }); BUS.emit("super", { fighter: game.f[0], foe: game.f[1], move: {} }); BUS.emit("throw", { src: game.f[0], victim: game.f[1] }); 1');
  const mine = await stats();
  check(mine.specials === before.specials + 1 && mine.supers === before.supers + 1 && mine.throws === before.throws + 1, 'your own special, super and throw events count (special ' + mine.specials + ', super ' + mine.supers + ', throw ' + mine.throws + ')');
  // the real inputs: a throw next to the foe, a special and a super on their keys
  await ev('dstep(80); 1');
  const free = 'const [a, b] = game.f; let n = 0; while ((a.busy() || b.busy() || game.hitstop > 0) && n < 600) { dstep(1); n++; } a.x = 200; b.x = 760; a.face = 1; b.face = -1; a.inv = b.inv = 0; a.cool = b.cool = 0; a.set("idle"); b.set("idle"); a.vx = b.vx = 0; a.meter = 100; dstep(1);';
  await ev(`(() => { ${free} a.x = 300; b.x = 340; dstep(1); })(); 1`);
  const th0 = (await stats()).throws;
  await t.key('KeyD', true); await tap('KeyJ'); await ev('dstep(3); 1'); await t.key('KeyD', false); await ev('dstep(2); 1');
  check((await stats()).throws === th0 + 1, 'a throw (forward and punch next to the foe) counts: ' + th0 + ' to ' + (await stats()).throws);
  await ev('dstep(150); 1'); await ev(`(() => { ${free} })(); 1`);
  const sp0 = (await stats()).specials;
  await tap('KeyL'); await ev('dstep(2); 1');
  check((await stats()).specials === sp0 + 1, 'a special move thrown with its key counts: ' + sp0 + ' to ' + (await stats()).specials);
  await ev('dstep(150); 1'); await ev(`(() => { ${free} })(); 1`);
  const su0 = (await stats()).supers;
  await tap('KeyI'); await ev('dstep(2); 1');
  check((await stats()).supers === su0 + 1, 'a super thrown with its key counts: ' + su0 + ' to ' + (await stats()).supers);
  // time: the round clock between the round start and the round end
  await fresh('2026-06-15');
  await go(calm); await ev('dfight(); (() => { const [a, b] = game.f; b.cpu = false; a.x = 200; b.x = 760; })(); dstep(600); 1');
  await ev('dko(0); 1');
  const secs = (await stats()).secs;
  check(secs > 9 && secs < 11.2, 'the time of a round is the fight time: about 10 seconds after 600 ticks (' + secs.toFixed(2) + ')');
  check((await ev('game.phase')) === 'intro' && (await ev('game.wins.join()')) === '1,0', 'the round is won and the next one starts');
  await ev('dko(1); 1');
  check((await stats()).lost === 1 && (await ev('game.wins.join()')) === '1,1' && (await ev('game.phase')) === 'intro', 'a round lost is counted: the sudden death round follows at 1-1 (rounds lost: ' + (await stats()).lost + ')');
  await ev('dko(0); 1');
  const r0 = await D('run().result');
  check(r0 && r0.won && (await ev('game.phase')) === 'over', 'the match is over with the result in place');
  check(r0 && r0.stats.secs >= secs && r0.stats.lost === 1, 'the stats of the three rounds add up (time ' + (r0 ? r0.stats.secs.toFixed(1) : '?') + ', rounds lost ' + (r0 ? r0.stats.lost : '?') + ')');

  // ================= a whole sprint: cleared, missed and lost; the streak over days =================
  const run6 = await ev(`(() => { const b = DAILY.dayNum('2026-04-01');
    for (let i = 0; i < 900; i++) {
      const k = DAILY.keyOf(b + i), P = n => DAILY.planFor(nextKey(k, n));
      if (EASY.includes(P(0).goal) && EASY.includes(P(1).goal) && HARD.includes(P(2).goal) && EASY.includes(P(4).goal) && EASY.includes(P(5).goal)) return k;
    } return null; })()`);
  check(!!run6, 'a run of days with the needed goals exists for the streak test: ' + run6);
  const dk = [];
  for (let n = 0; n < 8; n++) dk.push(await ev(`nextKey('${run6}', ${n})`));
  const [d0, d1, d2, d3, d4, d5] = dk;
  await fresh(d0);
  const sprint = async (key, win) => { await go(key); await ev(`dwin(${win ? 0 : 1}); 1`); await t.wait(60); return D('run().result'); };
  const c0 = await sprint(d0, true);
  check((await ev('game.phase')) === 'over' && c0 && c0.won && c0.met && c0.status === 2 && c0.streak === 1 && c0.firstClear && c0.tries === 1, 'a won sprint with its goal met is CLEARED, the first clear of the day, streak 1, try 1: ' + JSON.stringify(c0 && [c0.status, c0.streak, c0.tries]));
  const g0 = await ev(`DAILY.goalText(DAILY.planFor('${d0}'))`);
  sc = await ev('seen()');
  check(sc.includes('SPRINT CLEARED') && sc.includes(g0) && sc.includes('STREAK 1 DAY') && sc.includes('TODAY IS IN THE BOOKS') && sc.includes('TIME') && sc.includes('HITS LANDED') && sc.includes('BEST COMBO') && sc.includes('DAMAGE TAKEN') && sc.includes('JUMPS') && sc.includes('BLOCKS'), 'the result card shows the verdict, the goal, the stats and the streak: ' + sc.filter(x => /CLEARED|STREAK|BOOKS/.test(x)).join(' | '));
  check(sc.some(x => x.startsWith('ENTER BRIEFING')) && sc.findIndex(x => x.startsWith('ENTER BRIEFING')) > sc.findIndex(x => x.startsWith('ENTER CHARACTER SELECT')), 'the key line of the card is drawn over the engine\'s own (which says CHARACTER SELECT): ' + sc.filter(x => /ENTER|SELECT|RETRY/.test(x)).join(' | '));
  const stored = await ev("JSON.parse(localStorage.getItem('brawl.settings'))['daily.state']");
  check(stored && stored.last === d0 && stored.streak === 1 && stored.best === 1 && stored.cleared === 1 && stored.h[d0].s === 2 && stored.h[d0].n === 1, 'the result is stored with the options in the browser: ' + JSON.stringify(stored && [stored.last, stored.streak, stored.cleared]));
  // keys on the card
  await ev('dpress("KeyR"); dpress("Enter"); 1');
  check((await ev('game.phase')) === 'over' && (await D('run().result')) !== null, 'a key pressed in the first moments of the end screen is ignored (a mashed fight key must not skip the card)');
  await ev('dstep(60); 1');
  const arenaBefore = await ev('game.arena');
  await ev('game.arenaPick = (game.arena + 1) % ARENAS.length; 1');
  await ev('dpress("KeyR"); 1');
  check((await ev('game.phase')) === 'vs' && (await ev('game.modeId')) === 'daily' && (await ev('game.arena')) === arenaBefore && (await D('run().result')) === null && (await D('run().stats.hits')) === 0, 'R retries the same sprint: same arena of the day, fresh stats, no result');
  await ev('dwin(0); 1'); await ev('dstep(60); 1');
  const c0b = await D('run().result');
  check(c0b && c0b.status === 2 && !c0b.firstClear && c0b.tries === 2 && c0b.streak === 1 && c0b.cleared === 1, 'clearing the same day again is try 2, not a first clear, and the streak stays 1: ' + JSON.stringify(c0b && [c0b.tries, c0b.firstClear, c0b.streak]));
  sc = await ev('seen()');
  check(sc.includes('ALREADY CLEARED - PRACTICE'), 'the card says it was already cleared');
  const h0 = (await D('state()')).h[d0];
  check(same(h0, { s: 2, n: 2 }) && (await D('state().cleared')) === 1 && (await D('state().played')) === 1, 'the history has two tries for the day and one clear');
  const selBefore = await ev('DAILY.run().keep.sel');
  await ev('dpress("Enter"); 1');
  check((await ev('game.phase')) === 'title' && (await D('screen()')) === 'daily' && !(await D('run().on')), 'Enter on the card goes to the briefing, not to the character select');
  sc = await ev('seen()');
  check(sc.includes('TODAY: CLEARED (2 TRIES)') && sc.includes('PLAY AGAIN') && sc.includes('1') && sc.includes('DAY STREAK'), 'the briefing now shows the day as cleared, PLAY AGAIN and a streak of 1');
  check(same(await ev('game.sel'), selBefore), 'your own selection is back after the sprint');
  await press('Escape');
  // day 2: cleared, streak 2
  const c1 = await sprint(d1, true);
  check(c1 && c1.status === 2 && c1.streak === 2 && c1.firstClear && c1.newBest && c1.best === 2, 'the next day cleared makes the streak 2 and a new best: ' + JSON.stringify(c1 && [c1.streak, c1.newBest, c1.best]));
  sc = await ev('seen()'); check(sc.includes('STREAK 2 DAYS') && sc.includes('NEW BEST STREAK'), 'the card shows STREAK 2 DAYS and NEW BEST STREAK');
  // day 3: a goal that doing nothing misses -> won, goal missed
  await ev('dstep(60); dpress("Enter"); 1');
  const c2 = await sprint(d2, true);
  check(c2 && c2.won && !c2.met && c2.status === 1 && c2.streak === 2, 'a win without the goal is GOAL MISSED and the streak is not extended: ' + JSON.stringify(c2 && [c2.status, c2.streak]));
  sc = await ev('seen()'); check(sc.includes('GOAL MISSED') && sc.some(x => /^TRY #1 /.test(x)), 'the card says GOAL MISSED and invites a retry');
  check((await D('state().cleared')) === 2 && (await D('state().won')) === 3 && (await D('state().played')) === 3, 'the totals: 2 cleared, 3 won, 3 played');
  // day 4: lost; day 3 was never cleared, so the streak on display is broken
  await ev('dstep(60); dpress("Enter"); 1');
  const c3 = await sprint(d3, false);
  check(c3 && !c3.won && c3.status === 0 && c3.streak === 0, 'a lost sprint after a missed day: streak 0 shown (the day before was not cleared)');
  sc = await ev('seen()'); check(sc.includes('SPRINT LOST') && sc.includes('STREAK 0 DAYS'), 'the card says SPRINT LOST and STREAK 0 DAYS');
  check((await D('state().best')) === 2 && (await D('state().streak')) === 2 && (await D('state().last')) === d1, 'the stored streak waits at 2 on day 2, the best is 2');
  // day 5: cleared after the gap -> new streak 1; day 6 -> 2
  await ev('dstep(60); dpress("Enter"); 1');
  const c4 = await sprint(d4, true);
  check(c4 && c4.status === 2 && c4.streak === 1 && c4.best === 2 && !c4.newBest, 'after a gap the streak starts again at 1 and the best stays 2: ' + JSON.stringify(c4 && [c4.streak, c4.best]));
  await ev('dstep(60); dpress("Enter"); 1');
  const c5 = await sprint(d5, true);
  check(c5 && c5.status === 2 && c5.streak === 2 && c5.best === 2 && !c5.newBest, 'a second day in a row makes 2 again, which ties the best but is not a new best');
  // share text on the end screen
  const share = await ev('window.shareText()');
  check(share.startsWith('Sprint of the day ' + d5 + ' in Agent Brawl: cleared as ') && share.endsWith('Streak: 2 days.') && share.length < 230, 'the share text on the sprint end screen names the day, the result, the fighters, the goal, the modifier and the streak: ' + share);
  check((await ev("shareUrl().startsWith('https://x.com/intent/post?text=')")) && (await ev('shareUrl()')).includes(encodeURIComponent('Sprint of the day')), 'and the SHARE ON X link carries it');
  // Escape on the card
  await ev('dstep(60); dpress("Escape"); 1');
  check((await ev('game.phase')) === 'title' && (await D('screen()')) === null && !(await D('run().on')), 'Escape on the card goes to the title');
  check(!/Sprint of the day/.test(await ev('window.shareText()')), 'outside a sprint the share text is the engine\'s own');
  const hist = await D('state()');
  check(Object.keys(hist.h).length === 6 && hist.played === 6 && hist.cleared === 4 && hist.won === 5, 'the history of the six days is kept: ' + JSON.stringify([Object.keys(hist.h).length, hist.played, hist.cleared, hist.won]));
  // the briefing reads the stored streak
  await ev(`DAILY.setToday('${d5}'); 1`); await title('daily');
  sc = await ev('seen()'); check(sc.includes('TODAY: CLEARED (1 TRY)') && sc.includes('BEST 2   CLEARED 4   PLAYED 6'), 'the briefing shows the best, the cleared and the played counts: ' + sc.find(x => x.startsWith('BEST')));
  await ev(`DAILY.setToday('${dk[7]}'); dstep(1); 1`);
  sc = await ev('seen()'); check(sc.includes('0') && sc.includes('DAYS STREAK') && sc.includes('TODAY: NOT PLAYED YET'), 'two days later the streak is gone and the new day is not played');
  await press('Escape');

  // ================= a stored state that was damaged by hand =================
  await fresh('2026-08-01');
  await ev(`localStorage.setItem('brawl.settings', JSON.stringify({ 'daily.state': { last: 'garbage', streak: 'x', h: 5 } })); 1`);
  await t.open(); await ev('hold(true); 1'); await ev(SETUP); await ev("DAILY.setToday('2026-08-01'); 1");
  check(same(await ev('DAILY.state().streak + "/" + DAILY.state().played + "/" + Object.keys(DAILY.state().h).length'), '0/0/0'), 'a damaged stored state reads as an empty one');
  await title('daily'); sc = await ev('seen()');
  check(sc.includes('TODAY: NOT PLAYED YET') && (await D('screen()')) === 'daily', 'and the briefing still opens');

  // ================= the whole thing ran clean =================
  const errs = t.p.errors.slice(errors0);
  check(!errs.length, 'no console errors during the sprint tests' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
}
