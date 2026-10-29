// Seeded fuzzer for Agent Brawl. Owner: the x-qa agent. Area: quality tooling (a node tool, not a game script: it is not listed in dev.html).
// What it does: loads the game in headless Chrome, plays whole matches for every fighter pair over several arenas with seeded random input streams
// (no wall clock: only window.step(n) advances the game), and asserts after every tick that nothing is broken: no exception or console error, no NaN,
// fighters inside the stage, health within bounds, nobody stuck in a state, and every match ends within a tick budget.
// Hooks used: HOOKS 'input' (the random input stream for human-driven sides), BUS.emit (event counts, restored afterwards); keyboard events for pause.
// This file also exports the shared harness (openGame, pageQA, rng, ROOT) that tools/balance.mjs, tools/framedata.mjs and tools/tests/x-qa.mjs reuse.
// Usage: node tools/fuzz.mjs [--seed0 1] [--seeds 1] [--arenas 3] [--modes human2,human1,cpu] [--fighters tibo,dot] [--arena K] [--time 99] [--render 240]
//                            [--budget TICKS] [--quick] [--sound] [--index] [--json] [--one SEED:P1:P2:ARENA:MODE] [--strict]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Runs before the game scripts in every page this tool opens: no real-time loop and no render loop (so nothing but step() advances the game), a clean localStorage.
const PRELOAD = 'window.requestAnimationFrame = function () { return 0; }; try { localStorage.clear(); } catch (e) { }';

// Opens the game in `p` (a page from withPage). page: 'dev' (default, always the current sources) or 'index' (the built file). Returns { roster, arenas, arenaNames }.
export async function openGame(p, { page = 'dev', sound = false } = {}) {
  if (!p.__qaPreload) { await p.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD }); p.__qaPreload = true; }
  await p.goto('file://' + path.join(ROOT, page === 'index' ? 'index.html' : 'dev.html'));
  await p.eval('(' + pageQA.toString() + ')()');
  if (!sound) await p.eval('setMuted(true)');
  return p.eval('({ roster: ROSTER.map(r => r.id), arenas: ARENAS.length, arenaNames: ARENAS.map(a => a.name) })');
}

// Everything below runs inside the page. Defines window.__qa: rng, run(cfg), and the invariant checks. Must stay self-contained (it is sent with toString()).
export function pageQA() {
  if (window.__qa) return true;
  const qa = window.__qa = { errs: [], cur: null };
  qa.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  for (const k of ['error', 'warn']) { const orig = console[k].bind(console); console[k] = (...a) => { if (qa.errs.length < 20) qa.errs.push({ k, t: qa.cur ? qa.cur.t : -1, msg: a.map(String).join(' ').slice(0, 300) }); orig(...a); }; }

  // A random player: holds a direction or a crouch for a few ticks, taps buttons, and now and then double-taps a direction (dash). Directions are relative to the foe.
  qa.gen = seed => {
    const r = qa.rng(seed); let cur = { l: false, r: false, u: false, d: false }, left = 0, seq = null;
    return (me, foe) => {
      const toward = foe.x > me.x ? 'r' : 'l', away = toward === 'r' ? 'l' : 'r';
      if (left-- <= 0 && !seq) {
        const k = r(); cur = { l: false, r: false, u: false, d: false }; left = 3 + (r() * 28 | 0);
        if (k < 0.30) cur[toward] = true;
        else if (k < 0.38) cur[away] = true;
        else if (k < 0.48) { cur.d = true; if (r() < 0.5) cur[away] = true; }
        else if (k < 0.58) { cur.u = true; if (r() < 0.7) cur[toward] = true; }
        else if (k < 0.66) { seq = [1, 0, 1, 1, 1, 1].map(v => v ? toward : null); }
        else if (k < 0.70) { seq = [1, 0, 1, 1].map(v => v ? away : null); }
        else if (k < 0.78) { cur[toward] = true; cur.d = true; }
      }
      let held = cur;
      if (seq) { held = { l: false, r: false, u: false, d: false }; const s = seq.shift(); if (s) held[s] = true; if (!seq.length) { seq = null; left = 0; } }
      const o = { l: held.l, r: held.r, u: held.u, d: held.d, p: false, k: false, s: false, x: false }, b = r();
      if (b < 0.10) o.p = true; else if (b < 0.18) o.k = true; else if (b < 0.22) o.s = true; else if (b < 0.235) o.x = true; else if (b < 0.245) o.p = o.k = true;
      return o;
    };
  };

  const TRANSIENT = { hurt: 1, punch: 1, kick: 1, special: 1, super: 1, down: 1, grabbed: 1, throw: 1, jump: 1, dash: 1 };
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));

  // cfg: { p1, p2 (roster ids), arena, seed, mode: 'human2' | 'human1' | 'cpu', maxTicks, render, pauses, time, rounds, difficulty }
  qa.run = cfg => {
    const out = { cfg, ticks: 0, ended: false, phase: '', round: 0, wins: [0, 0], winner: null, violations: [], events: {}, states: {}, phases: {}, maxCombo: 0, soft: { wall: 0 }, errs: [], hash: '' };
    const cur = qa.cur = { t: 0 }, saved = { rand: Math.random, emit: BUS.emit, settings: {} };
    const viol = (kind, msg) => { if (out.violations.length < 8 && !out.violations.some(v => v.kind === kind && v.msg === msg)) out.violations.push({ t: cur.t, kind, msg: String(msg).slice(0, 300) }); };
    qa.errs.length = 0;
    let off = null;
    try { if (typeof hold === 'function') hold(true); } catch (e) { /* no real-time loop to freeze */ }
    try {
      for (const k of ['time', 'rounds', 'difficulty']) if (cfg[k] != null) { saved.settings[k] = SETTINGS.get(k); SETTINGS.set(k, cfg[k]); }
      Math.random = qa.rng(cfg.seed ^ 0x5bd1e995);   // the game's own randomness (CPU brain, effects, random arena) follows the seed
      BUS.emit = function (name, payload) { out.events[name] = (out.events[name] || 0) + 1; return saved.emit.call(BUS, name, payload); };
      const human = cfg.mode === 'human2' ? [true, true] : cfg.mode === 'human1' ? [true, false] : [false, false];
      const gens = [qa.gen(cfg.seed * 2 + 1), qa.gen(cfg.seed * 2 + 2)], pr = qa.rng(cfg.seed + 777);
      off = HOOKS.add('input', (input, side, f) => (human[side] ? gens[side](f, game.f[1 - side]) : undefined), 50);
      if (typeof MODES !== 'undefined' && MODES.pick) MODES.pick(cfg.mode === 'human2' ? 'versus2' : 'versus'); else game.mode = cfg.mode === 'human2' ? 2 : 1;
      game.sel = [ROSTER.findIndex(r => r.id === cfg.p1), ROSTER.findIndex(r => r.id === cfg.p2)]; game.arenaPick = cfg.arena;
      startMatch();
      if (cfg.mode === 'cpu') { game.f[0].cpu = true; game.f[1].cpu = true; }
      const rt = SETTINGS.get('rounds'), tm = SETTINGS.get('time');
      const max = cfg.maxTicks || (VS_LEN + 2 * rt * (tm * 120 + 700) + 2000);   // the budget: every round at twice its clock (hit stop freezes the clock), plus the intros, KOs and the end
      let pauseUntil = 0, lastPhase = '', phaseSince = 0, firstTick = game.tick;
      for (let t = 0; t < max; t++) {
        cur.t = t;
        if (cfg.pauses && !pauseUntil && game.phase === 'fight' && pr() < 0.0012) { const k = pr() < 0.5 ? 'KeyP' : 'Escape'; key(k, true); key(k, false); pauseUntil = t + 1 + (pr() * 40 | 0); }
        else if (pauseUntil && t >= pauseUntil) { pauseUntil = 0; if (game.phase === 'pause') { key('KeyP', true); key('KeyP', false); } }
        try { step(1); } catch (e) { viol('exception', (e && e.stack || e)); out.ticks = t + 1; break; }
        out.ticks = t + 1;
        const ph = game.phase;
        out.phases[ph] = (out.phases[ph] || 0) + 1;
        if (ph !== lastPhase) { lastPhase = ph; phaseSince = t; if (cfg.render) { try { render(); } catch (e) { viol('render', (e && e.stack || e)); break; } } }
        else if (cfg.render && t % cfg.render === 0) { try { render(); } catch (e) { viol('render', (e && e.stack || e)); break; } }
        if (ph !== 'fight' && ph !== 'pause' && t - phaseSince > 3000) viol('phase-stuck', 'phase ' + ph + ' for ' + (t - phaseSince) + ' ticks');
        const fs = game.f;
        for (let i = 0; i < fs.length; i++) {
          const f = fs[i], who = 'P' + (i + 1) + ' ' + f.d.id + ' ';
          for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'meter']) if (!Number.isFinite(f[k])) viol('nan', who + k + '=' + f[k]);
          if (f.x < 0 || f.x > W) viol('out-of-stage', who + 'x=' + f.x.toFixed(1)); else if (f.x < 48 || f.x > W - 48) out.soft.wall++;
          if (f.y > GROUND + 0.01 || f.y < -300) viol('out-of-stage', who + 'y=' + f.y.toFixed(1));
          if (f.hp < 0 || f.hp > f.d.hp + 1e-6) viol('health', who + 'hp=' + f.hp + ' max ' + f.d.hp);
          if (f.meter < 0 || f.meter > 1000) viol('meter', who + 'meter=' + f.meter);
          if (ph === 'fight' && TRANSIENT[f.state] && f.st > 420) viol('stuck', who + 'in ' + f.state + ' for ' + f.st + ' ticks');
          out.states[f.state] = (out.states[f.state] || 0) + 1;
          if (f.combo > out.maxCombo) out.maxCombo = f.combo;
        }
        for (const p of game.proj) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) viol('nan', 'projectile x=' + p.x + ' y=' + p.y);
        if (game.proj.length > 120 || game.fx.length > 900 || game.popups.length > 150 || game.delayed.length > 250) viol('leak', 'proj ' + game.proj.length + ' fx ' + game.fx.length + ' popups ' + game.popups.length + ' delayed ' + game.delayed.length);
        if (!Number.isFinite(game.timer)) viol('nan', 'game.timer=' + game.timer);
        if (qa.errs.length) { for (const e of qa.errs.splice(0)) { out.errs.push(e); viol('console-' + e.k, e.msg); } }
        if (ph === 'over') { out.ended = true; break; }
        if (out.violations.length >= 8) break;
      }
      if (!out.ended && !out.violations.length) viol('budget', 'match not over after ' + out.ticks + ' ticks (phase ' + game.phase + ', round ' + game.round + ', wins ' + game.wins + ')');
      out.phase = game.phase; out.round = game.round; out.wins = game.wins.slice();
      const w = game.winner; out.winner = out.ended && game.wins[0] !== game.wins[1] ? ROSTER[game.sel[game.wins[0] > game.wins[1] ? 0 : 1]].id : null; void w;
      out.hash = [out.ticks, out.round, game.wins.join(), game.f.map(f => [f.hp.toFixed(3), f.meter.toFixed(3), f.x.toFixed(2), f.state].join(':')).join('|')].join('/');
    } catch (e) { viol('harness', (e && e.stack || e)); }
    finally {
      if (off) off(); BUS.emit = saved.emit; Math.random = saved.rand;
      for (const k in saved.settings) SETTINGS.set(k, saved.settings[k]);
      qa.cur = null;
    }
    return out;
  };
  return true;
}

// ---- node side ----

export const MODES_ALL = ['human2', 'human1', 'cpu'];
const arg = (args, name, def) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };

// The list of matches: every ordered pair of `roster` (or those named), `arenas` stages each (rotating so all stages are visited), modes rotating, seeds counting up from seed0.
export function planMatches({ roster, arenaCount, arenas = 3, modes = MODES_ALL, seed0 = 1, seeds = 1, only = null, arena = -1, time, rounds, difficulty, render = 240, budget, pauses = true }) {
  const ids = only && only.length ? roster.filter(r => only.includes(r)) : roster, plan = [];
  let n = 0;
  for (let s = 0; s < seeds; s++) ids.forEach((a, i) => ids.forEach((b, j) => {
    const pair = i * ids.length + j;
    for (let k = 0; k < arenas; k++) {
      const ar = arena >= 0 ? arena % arenaCount : (pair + k * Math.max(1, Math.floor(arenaCount / arenas))) % arenaCount;
      plan.push({ p1: a, p2: b, arena: ar, seed: seed0 + n, mode: modes[n % modes.length], render, pauses, maxTicks: budget, time, rounds, difficulty }); n++;
    }
  }));
  return plan;
}

export const reproLine = c => `node tools/fuzz.mjs --one ${c.seed}:${c.p1}:${c.p2}:${c.arena}:${c.mode}` + (c.time != null ? ` --time ${c.time}` : '') + (c.rounds != null ? ` --rounds ${c.rounds}` : '') + (c.difficulty != null ? ` --difficulty ${c.difficulty}` : '') + (c.maxTicks != null ? ` --budget ${c.maxTicks}` : '');

export async function runPlan(p, plan, { info, log = () => { }, determinism = true } = {}) {
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const c = plan[i], before = p.errors.length;
    await openGame(p, p.__qaOpts);
    const r = await p.eval('__qa.run(' + JSON.stringify(c) + ')');
    await p.wait(4);
    r.pageErrors = p.errors.slice(before).filter(e => !r.errs.some(x => e.includes(x.msg.slice(0, 40))));
    if (r.pageErrors.length) r.violations.push({ t: r.ticks, kind: 'page-error', msg: r.pageErrors[0].slice(0, 300) });
    results.push(r); log(i + 1, plan.length, r);
  }
  // determinism: the first match again on a fresh page must end in the same state, or the seed printed with a failure would not reproduce it
  if (determinism && plan.length) {
    await openGame(p, p.__qaOpts);
    const again = await p.eval('__qa.run(' + JSON.stringify(plan[0]) + ')');
    if (again.hash !== results[0].hash) results[0].violations.push({ t: 0, kind: 'nondeterminism', msg: 'the same seed ended differently: ' + results[0].hash + ' vs ' + again.hash });
  }
  return results;
}

export function summarize(results, info) {
  const lines = [], bad = results.filter(r => r.violations.length), ticks = results.reduce((s, r) => s + r.ticks, 0);
  const sum = (key, o) => results.reduce((s, r) => s + (r[o][key] || 0), 0);
  const evNames = [...new Set(results.flatMap(r => Object.keys(r.events)))].filter(n => n !== 'phase').sort();
  lines.push(`fuzz: ${results.length} matches, ${ticks} ticks, ${results.filter(r => r.ended).length} ended, ${bad.length} failed`);
  lines.push('events: ' + evNames.map(n => n + ' ' + sum(n, 'events')).join(', '));
  lines.push('fighter states seen: ' + [...new Set(results.flatMap(r => Object.keys(r.states)))].sort().join(', '));
  lines.push('phases seen: ' + [...new Set(results.flatMap(r => Object.keys(r.phases)))].join(', ') + '; longest combo ' + Math.max(0, ...results.map(r => r.maxCombo)) + '; wall-hugging samples ' + results.reduce((s, r) => s + r.soft.wall, 0));
  for (const r of bad) {
    const c = r.cfg, an = info && info.arenaNames ? info.arenaNames[c.arena] : '';
    lines.push(`FAIL seed=${c.seed} ${c.p1} vs ${c.p2} arena=${c.arena}${an ? ' (' + an + ')' : ''} mode=${c.mode} first at tick ${r.violations[0].t}`);
    for (const v of r.violations.slice(0, 4)) lines.push(`  tick ${v.t}: ${v.kind}: ${v.msg.split('\n')[0]}`);
    lines.push('  repro: ' + reproLine(c));
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2), flag = n => args.includes(n);
  const quick = flag('--quick'), t0 = Date.now();
  const opts = { page: flag('--index') ? 'index' : 'dev', sound: flag('--sound') };
  const { withPage } = await import('./headless.mjs');   // lazy: tools/tests/x-qa.mjs imports this file from inside the test run, where a static import of headless.mjs would wait on itself
  const ok = await withPage(async p => {
    p.__qaOpts = opts;
    const info = await openGame(p, opts);
    let plan;
    const one = arg(args, '--one', null);
    const num = name => arg(args, name, undefined) && +arg(args, name, undefined);
    if (one) { const [seed, p1, p2, ar, mode] = one.split(':'); plan = [{ p1, p2, arena: +ar, seed: +seed, mode: mode || 'human2', render: +arg(args, '--render', 240), pauses: true, time: num('--time'), rounds: num('--rounds'), difficulty: arg(args, '--difficulty', undefined), maxTicks: num('--budget') }]; }
    else plan = planMatches({
      roster: info.roster, arenaCount: info.arenas, arenas: +arg(args, '--arenas', quick ? 1 : 3), modes: arg(args, '--modes', MODES_ALL.join(',')).split(','), seed0: +arg(args, '--seed0', 1), seeds: +arg(args, '--seeds', 1),
      only: arg(args, '--fighters', '').split(',').filter(Boolean), arena: +arg(args, '--arena', -1), time: arg(args, '--time', quick ? '40' : undefined) && +arg(args, '--time', quick ? 40 : undefined),
      rounds: num('--rounds'), difficulty: arg(args, '--difficulty', undefined),
      render: +arg(args, '--render', 240), budget: num('--budget'),
    });
    console.log(`fuzz: ${plan.length} matches (${info.roster.length} fighters, ${info.arenas} arenas), page ${opts.page}.html${opts.sound ? ', sound on' : ', muted'}`);
    let shown = 0;
    const results = await runPlan(p, plan, { info, determinism: !one && !flag('--no-determinism'), log: (i, n, r) => { if (!flag('--json')) { process.stdout.write(r.violations.length ? 'F' : '.'); if (i % 50 === 0 || i === n) process.stdout.write(` ${i}/${n}\n`); shown = i; } } });
    if (shown % 50) process.stdout.write('\n');
    if (flag('--json')) console.log(JSON.stringify(results));
    console.log(summarize(results, info) + `\nin ${((Date.now() - t0) / 1000).toFixed(1)} s` + (p.errors.length ? `\nconsole errors seen by the page driver: ${p.errors.length}\n` + p.errors.slice(0, 3).join('\n') : ''));
    return results.every(r => !r.violations.length) && (!p.errors.length || !flag('--strict'));
  });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
