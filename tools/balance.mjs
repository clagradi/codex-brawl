// Balance meter for Agent Brawl. Owner: the x-qa agent. Area: quality tooling (a node tool, not a game script: it is not listed in dev.html).
// What it does: loads the game in headless Chrome and plays CPU against CPU round robins, K seeded matches for every ordered pair of fighters (so both sides and mirror matches are covered),
// as fast as step(n) allows (no wall clock). It reports the win-rate matrix, the average match length and the damage each move deals, and writes docs/BALANCE.md.
// Hooks used: BUS.emit (wrapped while a match runs: hit, block, special, super, throw), SETTINGS (difficulty, time, rounds), game state set directly (CPU brain on both sides).
// Usage: node tools/balance.mjs [--k 12] [--seed0 1] [--difficulty normal] [--time 99] [--rounds 2] [--fighters tibo,dot] [--out docs/BALANCE.md] [--stdout] [--index]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, ROOT } from './fuzz.mjs';

// Runs inside the page. Defines window.__bal. Must stay self-contained (it is sent with toString()).
export function pageBal() {
  if (window.__bal) return true;
  const bal = window.__bal = {};
  bal.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  bal.run = cfg => {
    const out = { p1: cfg.p1, p2: cfg.p2, seed: cfg.seed, arena: cfg.arena, ticks: 0, ended: false, rounds: 0, wins: [0, 0], winner: -1, dmg: [{}, {}], hits: [{}, {}], used: [{}, {}], blocks: [0, 0], chip: [0, 0], throws: [0, 0], supers: [0, 0], maxCombo: [0, 0], err: null };
    const saved = { rand: Math.random, emit: BUS.emit, set: {} }, last = [null, null], lastSuper = [null, null];
    try {
      if (typeof hold === 'function') hold(true);
      for (const k of ['time', 'rounds', 'difficulty']) if (cfg[k] != null) { saved.set[k] = SETTINGS.get(k); SETTINGS.set(k, cfg[k]); }
      Math.random = bal.rng(cfg.seed ^ 0x2545F491);
      if (typeof MODES !== 'undefined' && MODES.pick) MODES.pick('versus'); else game.mode = 1;
      game.sel = [ROSTER.findIndex(r => r.id === cfg.p1), ROSTER.findIndex(r => r.id === cfg.p2)]; game.arenaPick = cfg.arena;
      startMatch(); game.f[0].cpu = true; game.f[1].cpu = true;
      const keyOf = p => {   // which move did this damage come from?
        const s = p.src, k = p.kind;
        if (s.state === 'throw' && !s.mv) return 'throw';
        if (k === 'super') return lastSuper[s.side] || 'super';
        if (s.mv && (s.state === 'special' || s.state === 'super') && k !== 'hit') return s.mv.name;
        if (k === 'hit') return last[s.side] || 'shot';
        if ((s.state === 'punch' || s.state === 'kick') && s.atk) return s.atk;
        return last[s.side] || 'other';
      };
      BUS.emit = function (name, p) {
        if (name === 'special' || name === 'super') { const s = p.fighter.side, n = p.move.name; out.used[s][n] = (out.used[s][n] || 0) + 1; last[s] = n; if (name === 'super') { out.supers[s]++; lastSuper[s] = n; } }
        else if (name === 'hit') { const s = p.src.side, key = keyOf(p); out.dmg[s][key] = (out.dmg[s][key] || 0) + p.dmg; out.hits[s][key] = (out.hits[s][key] || 0) + 1; if (p.combo > out.maxCombo[s]) out.maxCombo[s] = p.combo; }
        else if (name === 'block') { const s = p.src.side; out.blocks[s]++; out.chip[s] += p.dmg; }
        else if (name === 'throw') out.throws[p.src.side]++;
        return saved.emit.call(BUS, name, p);
      };
      const rt = SETTINGS.get('rounds'), tm = SETTINGS.get('time'), max = cfg.maxTicks || (VS_LEN + 2 * rt * (tm * 120 + 700) + 2000);
      for (let t = 0; t < max; t++) { step(1); out.ticks = t + 1; if (game.phase === 'over') { out.ended = true; break; } }
      out.rounds = game.round; out.wins = game.wins.slice();
      out.winner = out.ended && game.wins[0] !== game.wins[1] ? (game.wins[0] > game.wins[1] ? 0 : 1) : -1;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 400); }
    finally { BUS.emit = saved.emit; Math.random = saved.rand; for (const k in saved.set) SETTINGS.set(k, saved.set[k]); }
    return out;
  };
  return true;
}

// ---- node side ----

export function planBalance({ roster, k = 12, seed0 = 1, arenaCount = 9, time, rounds, difficulty }) {
  const plan = []; let n = 0;
  for (const a of roster) for (const b of roster) for (let j = 0; j < k; j++, n++) plan.push({ p1: a, p2: b, seed: seed0 + n, arena: n % arenaCount, time, rounds, difficulty });
  return plan;
}

const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
const r2 = v => Math.round(v * 100) / 100;
const f1 = v => v == null ? '-' : v.toFixed(1);

// results -> numbers
export function analyze(results, roster) {
  const ids = roster, N = ids.length;
  const mat = Object.fromEntries(ids.map(a => [a, Object.fromEntries(ids.map(b => [b, { w: 0, l: 0, d: 0, n: 0, ticks: 0, rounds: 0 }]))]));
  const fighter = Object.fromEntries(ids.map(id => [id, { id, w1: 0, n1: 0, w2: 0, n2: 0, wx: 0, nx: 0, dmg: {}, hits: {}, used: {}, matches: 0, dealt: 0, blocks: 0, chip: 0, throws: 0, supers: 0, maxCombo: 0 }]));
  let unfinished = 0, errors = 0, p1w = 0, nDec = 0, ticks = 0, rounds = 0;
  for (const r of results) {
    if (r.err) { errors++; continue; }
    if (!r.ended) { unfinished++; continue; }
    const c = mat[r.p1][r.p2]; c.n++; c.ticks += r.ticks; c.rounds += r.rounds; ticks += r.ticks; rounds += r.rounds;
    if (r.winner === 0) { c.w++; p1w++; } else if (r.winner === 1) c.l++; else c.d++;
    if (r.winner >= 0) nDec++;
    for (const side of [0, 1]) {
      const id = side ? r.p2 : r.p1, f = fighter[id], won = r.winner === side;
      f.matches++; if (side === 0) { f.n1++; if (won) f.w1++; } else { f.n2++; if (won) f.w2++; }
      if (r.p1 !== r.p2) { f.nx++; if (won) f.wx++; }
      for (const k in r.dmg[side]) { f.dmg[k] = (f.dmg[k] || 0) + r.dmg[side][k]; f.dealt += r.dmg[side][k]; }
      for (const k in r.hits[side]) f.hits[k] = (f.hits[k] || 0) + r.hits[side][k];
      for (const k in r.used[side]) f.used[k] = (f.used[k] || 0) + r.used[side][k];
      f.blocks += r.blocks[side]; f.chip += r.chip[side]; f.throws += r.throws[side]; f.supers += r.supers[side]; f.maxCombo = Math.max(f.maxCombo, r.maxCombo[side]);
    }
  }
  const done = results.length - unfinished - errors;
  return { ids, N, mat, fighter, unfinished, errors, done, p1Rate: pct(p1w, nDec), avgTicks: done ? ticks / done : 0, avgRounds: done ? rounds / done : 0 };
}

export function renderMarkdown(an, meta, names) {
  const L = [], nm = id => names[id] || id.toUpperCase();
  L.push('# Balance report', '');
  L.push(`Generated by \`node tools/balance.mjs\` (do not edit by hand). CPU against CPU, ${meta.k} seeded matches for every ordered pair of fighters (${an.done} finished matches, seeds ${meta.seed0} to ${meta.seed0 + meta.total - 1}), difficulty ${meta.difficulty}, ${meta.rounds} rounds to win, ${meta.time} seconds per round, arenas rotating.`, '');
  const se = n => Math.round(50 / Math.sqrt(n)), perFighter = 2 * an.N * meta.k;
  L.push(`Read it with care: the players are the CPU brain, which plays every fighter by the same rules, so this measures how well the brain uses each move set and where the numbers lean, not what a human can do. One standard error is about ${se(meta.k)} points for a matrix cell (${meta.k} matches) and about ${se(perFighter)} points for a fighter row (${perFighter} matches), so treat a gap smaller than twice that as noise and re-run with another \`--seed0\` before acting on it.`, '');
  if (an.unfinished || an.errors) L.push(`**${an.unfinished} matches did not finish inside the tick budget and ${an.errors} threw; they are left out of the numbers.**`, '');
  L.push('## Win rate matrix', '');
  L.push('Row fighter as player 1, column fighter as player 2; the cell is the row fighter\'s win rate in percent.', '');
  L.push('| P1 \\ P2 | ' + an.ids.map(nm).join(' | ') + ' | overall as P1 |');
  L.push('| --- | ' + an.ids.map(() => '---:').join(' | ') + ' | ---: |');
  for (const a of an.ids) {
    const cells = an.ids.map(b => { const c = an.mat[a][b]; return c.n ? f1(pct(c.w, c.n)) : '-'; });
    const f = an.fighter[a];
    L.push(`| ${nm(a)} | ${cells.join(' | ')} | ${f1(pct(f.w1, f.n1))} |`);
  }
  L.push('');
  L.push(`Player 1 wins ${an.p1Rate == null ? '-' : an.p1Rate}% of all decided matches${an.p1Rate != null && Math.abs(an.p1Rate - 50) > 6 ? ' (a lean to one side: the game updates player 1 first in every tick)' : ''}. The diagonal (mirror matches) shows the same effect on its own.`, '');
  L.push('## Fighters', '');
  L.push('| Fighter | Win rate | Win rate vs the others | As P1 | As P2 | Damage per match | Supers per match | Throws per match | Longest combo |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const id of an.ids) {
    const f = an.fighter[id];
    L.push(`| ${nm(id)} | ${f1(pct(f.w1 + f.w2, f.n1 + f.n2))} | ${f1(pct(f.wx, f.nx))} | ${f1(pct(f.w1, f.n1))} | ${f1(pct(f.w2, f.n2))} | ${f.matches ? f1(f.dealt / f.matches) : '-'} | ${f.matches ? r2(f.supers / f.matches) : '-'} | ${f.matches ? r2(f.throws / f.matches) : '-'} | ${f.maxCombo} |`);
  }
  L.push('');
  L.push('## Match length', '');
  L.push(`Average match: ${f1(an.avgTicks / 60)} seconds (${Math.round(an.avgTicks)} ticks) over ${f1(an.avgRounds)} rounds played.`, '');
  L.push('| P1 \\ P2 | ' + an.ids.map(nm).join(' | ') + ' |');
  L.push('| --- | ' + an.ids.map(() => '---:').join(' | ') + ' |');
  for (const a of an.ids) L.push(`| ${nm(a)} | ` + an.ids.map(b => { const c = an.mat[a][b]; return c.n ? f1(c.ticks / c.n / 60) + ' s' : '-'; }).join(' | ') + ' |');
  L.push('');
  L.push('## Damage per move', '');
  L.push('Damage is attributed to the move that was running (or, for a shot that lands later, the last special the fighter started). Share is the part of that fighter\'s total damage.', '');
  for (const id of an.ids) {
    const f = an.fighter[id], keys = Object.keys(f.dmg).sort((a, b) => f.dmg[b] - f.dmg[a]);
    L.push(`### ${nm(id)}`, '', '| Move | Uses | Hits | Damage | Share | Per hit | Per use |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const k of keys) {
      const used = f.used[k] || null, hits = f.hits[k] || 0;
      L.push(`| ${k} | ${used ?? '-'} | ${hits} | ${Math.round(f.dmg[k])} | ${f1(pct(f.dmg[k], f.dealt))}% | ${hits ? r2(f.dmg[k] / hits) : '-'} | ${used ? r2(f.dmg[k] / used) : '-'} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

async function main() {
  const args = process.argv.slice(2), flag = n => args.includes(n), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
  const t0 = Date.now();
  const { withPage } = await import('./headless.mjs');   // lazy: keeps this file importable from inside the test run (see tools/fuzz.mjs)
  const ok = await withPage(async p => {
    p.__qaOpts = { page: flag('--index') ? 'index' : 'dev' };
    const info = await openGame(p, p.__qaOpts);
    await p.eval('(' + pageBal.toString() + ')()');
    const names = await p.eval('Object.fromEntries(ROSTER.map(r => [r.id, r.name]))'), defaults = await p.eval('({ time: SETTINGS.get("time"), rounds: SETTINGS.get("rounds"), difficulty: SETTINGS.get("difficulty") })');
    const only = arg('--fighters', '').split(',').filter(Boolean), roster = only.length ? info.roster.filter(r => only.includes(r)) : info.roster;
    const k = +arg('--k', 12), seed0 = +arg('--seed0', 1);
    const meta = { k, seed0, difficulty: arg('--difficulty', defaults.difficulty), time: +arg('--time', defaults.time), rounds: +arg('--rounds', defaults.rounds) };
    const plan = planBalance({ roster, k, seed0, arenaCount: info.arenas, time: meta.time, rounds: meta.rounds, difficulty: meta.difficulty });
    meta.total = plan.length;
    console.log(`balance: ${plan.length} matches (${roster.length} fighters x ${roster.length} x K ${k}), difficulty ${meta.difficulty}, ${meta.rounds} rounds, ${meta.time} s`);
    const results = [];
    for (let i = 0; i < plan.length; i++) {
      await openGame(p, p.__qaOpts); await p.eval('(' + pageBal.toString() + ')()');
      results.push(await p.eval('__bal.run(' + JSON.stringify(plan[i]) + ')'));
      if ((i + 1) % 25 === 0 || i + 1 === plan.length) process.stdout.write(`  ${i + 1}/${plan.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    }
    const an = analyze(results, roster), md = renderMarkdown(an, meta, names);
    if (flag('--stdout')) console.log(md);
    else { const out = path.resolve(ROOT, arg('--out', 'docs/BALANCE.md')); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, md); console.log(`balance: written to ${path.relative(ROOT, out)}`); }
    console.log(roster.map(id => { const f = an.fighter[id]; return `${id} ${f1(pct(f.w1 + f.w2, f.n1 + f.n2))}%`; }).join(', ') + `; P1 wins ${an.p1Rate}%; avg match ${f1(an.avgTicks / 60)} s; ${an.unfinished} unfinished, ${an.errors} errors`);
    if (p.errors.length) console.log('console errors:\n' + p.errors.slice(0, 3).join('\n'));
    return !p.errors.length && !an.errors;
  });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
