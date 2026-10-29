// Frame data meter for Agent Brawl. Owner: the x-qa agent. Area: quality tooling (a node tool, not a game script: it is not listed in dev.html).
// What it does: loads the game in headless Chrome and measures every move of every fighter by simulation, one tick at a time (window.step, no wall clock):
// startup, active frames, recovery, total length, damage, chip damage on block, frame advantage on hit and on block, reach, special cooldown. It writes docs/FRAMEDATA.md.
// Hooks used: HOOKS 'input' (holds the guard for the block trials), BUS.emit (wrapped for the length of one trial: hit, block, knockdown events), game state set directly.
// Method: both sides play a mirror match; each trial resets both fighters, starts the move with the engine's own starter (startAtk, startMove, startThrow) and counts ticks.
// Usage: node tools/framedata.mjs [--out docs/FRAMEDATA.md] [--stdout] [--fighters tibo,dot] [--index]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, ROOT } from './fuzz.mjs';

// Runs inside the page. Defines window.__fd. Must stay self-contained (it is sent with toString()).
export function pageFD() {
  if (window.__fd) return true;
  const fd = window.__fd = {};
  const LADDER = [56, 68, 80, 94, 110, 128, 150, 180, 220, 270, 330, 410, 520, 680];   // distances (px between the two fighters) tried for every move
  let vBlock = false;
  HOOKS.add('input', (input, side) => (vBlock && side === fd.vside ? { l: false, r: false, u: false, d: true, p: false, k: false, s: false, x: false } : undefined), 90);
  const sum = (a, k) => Math.round(a.reduce((s, e) => s + e[k], 0) * 100) / 100;

  // a mirror match with the attacker on side `aside`, stepped to the first fighting tick
  fd.open = (id, aside) => {
    if (typeof hold === 'function') hold(true);
    if (typeof MODES !== 'undefined' && MODES.pick) MODES.pick('versus2'); else game.mode = 2;
    const i = ROSTER.findIndex(r => r.id === id);
    game.sel = [i, i]; game.arenaPick = 0;
    startMatch();
    for (let n = 0; n < 600 && game.phase !== 'fight'; n++) step(1);
    fd.id = id; fd.aside = aside; fd.vside = 1 - aside;
    return game.phase;
  };

  fd.specs = id => {
    const M = MOVES[id], out = [];
    out.push({ k: 'atk', key: 'punch', input: 'P', type: 'normal' }, { k: 'atk', key: 'kick', input: 'K', type: 'normal' }, { k: 'atk', key: 'low', input: 'DOWN+P', type: 'normal' }, { k: 'atk', key: 'sweep', input: 'DOWN+K', type: 'normal' });
    out.push({ k: 'atk', key: 'punch2', input: 'P > P', type: 'chain' }, { k: 'atk', key: 'punch3', input: 'P > P > P', type: 'chain' }, { k: 'atk', key: 'kickf', input: 'P > P > K', type: 'chain' });
    out.push({ k: 'atk', key: 'airp', input: 'P (jumping)', type: 'air', air: true }, { k: 'atk', key: 'airk', input: 'K (jumping)', type: 'air', air: true });
    out.push({ k: 'throw', key: 'throw', input: 'FWD+P', type: 'throw' });
    M.sp.forEach((m, i) => out.push({ k: 'sp', idx: i, key: m.name, input: m.input, type: 'special' }));
    out.push({ k: 'sp', idx: 0, key: M.sp[0].name + ' (air)', input: 'jumping ' + M.sp[0].input, type: 'special', air: true });
    out.push({ k: 'su', key: M.su.name, input: 'P+K (meter full)', type: 'super' });
    return out;
  };

  // one trial: reset, place, start the move, step until everything is back to neutral. mode: 'hit' (foe stands), 'block' (foe holds guard), 'rehit' (foe is put back on its feet every tick)
  fd.trial = (spec, dist, mode) => {
    const A = game.f[fd.aside], V = game.f[fd.vside], dir = fd.aside ? -1 : 1, M = MOVES[fd.id];
    for (const f of game.f) f.reset();
    game.proj = []; game.delayed = []; game.fx = []; game.popups = []; game.hitstop = 0; game.slow = 0; game.dark = 0; game.flash = 0; game.shake = 0; game.timer = 99; game.clock = 0;
    const vx = W / 2 + dir * dist / 2;
    A.x = W / 2 - dir * dist / 2; V.x = vx; A.face = dir; V.face = -dir; A.hp = V.hp = 1e6; A.meter = 100;
    if (spec.air) { A.y = GROUND - 100; A.vy = 0; A.state = 'jump'; A.st = 12; }
    vBlock = mode === 'block';
    const ev = [], emit0 = BUS.emit; let n = 0, kd = false, tk = 0, curTk = 0;   // n counts steps, tk counts the steps the game really advanced (hit stop and the super flash freeze it)
    BUS.emit = function (name, p) {
      if (p && p.src === A) { if (name === 'hit' || name === 'block') ev.push({ n, tk: curTk, name, dmg: p.dmg, ast: A.st }); else if (name === 'knockdown') kd = true; }
      return emit0.call(BUS, name, p);
    };
    try {
      if (spec.k === 'atk') A.startAtk(spec.key);
      else if (spec.k === 'sp') A.startMove(M.sp[spec.idx], 'special', V);
      else if (spec.k === 'su') A.startMove(M.su, 'super', V);
      else if (spec.k === 'throw') { if (!A.canThrow(V)) return { err: 'cannot throw', ev: 0, hits: 0, blocks: 0 }; A.startThrow(V); }
      const aB = [A.busy()], vB = [V.busy()], hs = [game.hitstop], cap = spec.k === 'su' ? 420 : 260;
      let spawn = -1, maxSt = 0, idleAt = -1, cool = 0, still = 0, ended = false, proj = false;
      for (n = 1; n <= cap; n++) {
        if (mode === 'rehit') { V.set('idle'); V.inv = 0; V.vx = V.vy = 0; V.x = vx; V.y = GROUND; V.hp = 1e6; }
        const fr = game.hitstop > 0; curTk = fr ? tk : tk + 1;
        step(1); tk = curTk;
        const ab = A.busy(), vb = V.busy(), mine = game.proj.some(p => p.owner === A);
        aB[n] = ab; vB[n] = vb; hs[n] = game.hitstop;
        if (ab && A.st > maxSt) maxSt = A.st;
        if (idleAt < 0 && !ab) { idleAt = n; cool = A.cool; }
        if (mine) { proj = true; if (spawn < 0) spawn = tk; }
        if (!ab && !vb && !mine && game.delayed.length === 0 && n > 6) { if (++still >= 3) { ended = true; break; } } else still = 0;
      }
      const hits = ev.filter(e => e.name === 'hit'), blocks = ev.filter(e => e.name === 'block');
      const r = { dist, ev: ev.length, hits: hits.length, blocks: blocks.length, dmg: sum(hits, 'dmg'), chip: sum(blocks, 'dmg'), kd, proj, spawn, total: idleAt > 0 ? maxSt + 1 : null, cool,
        first: ev.length ? ev[0].ast : null, firstTk: ev.length ? ev[0].tk : null, last: ev.length ? ev[ev.length - 1].ast : null, hitAst: hits.length ? [hits[0].ast, hits[hits.length - 1].ast] : null, adv: null, ended };
      if (ev.length) {   // advantage: first update after the hit stop where each fighter is free to act, counted from the last contact; positive = the attacker is free first
        const h = ev[ev.length - 1].n, u0 = h + hs[h] + 1;
        const free = B => { if (u0 - 1 >= B.length) return ended ? u0 : null; for (let u = u0; u - 1 < B.length; u++) if (!B[u - 1]) return u; return null; };   // past the recorded steps everybody was idle (that is why the trial ended)
        const uA = free(aB), uV = free(vB);
        r.adv = uA != null && uV != null ? uV - uA : null;
      }
      return r;
    } finally { BUS.emit = emit0; vBlock = false; }
  };

  // scan the distance ladder, then measure at the closest distance that connects (shots: at mid range, where the flight shows)
  fd.move = spec => {
    const scanMode = spec.k === 'throw' ? 'hit' : 'rehit', scan = [];
    let seen = false, miss = 0;
    for (const d of LADDER) {
      const r = fd.trial(spec, d, scanMode); scan.push({ d, r });
      if (r.hits + r.blocks > 0) { seen = true; miss = 0; } else if (seen && ++miss >= 2) break;
    }
    const conn = scan.filter(s => s.r.hits + s.r.blocks > 0);
    if (!conn.length) return { spec, noHit: true };
    const shot = scan.some(s => s.r.proj), pick = shot ? (conn.find(s => s.d >= 220) || conn[0]) : conn[0];
    const spawns = scan.map(s => s.r.spawn).filter(v => v >= 0);
    return { spec, shot, spawn: spawns.length ? Math.min(...spawns) : null, D0: pick.d, lo: conn[0].d, hi: conn[conn.length - 1].d, r0: pick.r, hit: fd.trial(spec, pick.d, 'hit'), blk: fd.trial(spec, pick.d, 'block') };
  };

  fd.fighter = id => {
    const d = ROSTER.find(r => r.id === id), tbl = k => (typeof ATK !== 'undefined' ? ATK[k] : null);
    fd.open(id, 0);
    const rows = fd.specs(id).map(fd.move);
    fd.open(id, 1);
    for (const r of rows) if (!r.noHit) { r.hit1 = fd.trial(r.spec, r.D0, 'hit'); r.blk1 = fd.trial(r.spec, r.D0, 'block'); }
    return {
      id, name: d.name, tag: d.tag, hp: d.hp, spd: d.spd, pow: d.pow,
      rows: rows.map(r => {
        const s = r.spec, A = s.k === 'atk' ? tbl(s.key) : null, mv = s.k === 'sp' ? MOVES[id].sp[s.idx] : s.k === 'su' ? MOVES[id].su : null;
        const row = { key: s.key, input: s.input, type: s.type, air: !!s.air, noHit: !!r.noHit, table: A ? { len: A.len, hit: A.hit, dmg: A.dmg, stun: A.stun } : mv ? { len: mv.len, hit: mv.hit, cool: mv.cool ?? 40 } : s.k === 'throw' ? { len: 32, hit: 24 } : null };
        if (r.noHit) return row;
        const r0 = r.r0, shot = r.shot;
        if (shot) row.type = s.type === 'super' ? 'super (shot)' : 'special (shot)';
        row.D0 = r.D0; row.reach = [r.lo, r.hi];
        row.startup = shot ? r.spawn : r0.first;
        row.active = shot ? null : (r0.hitAst ? r0.hitAst[1] - r0.hitAst[0] + 1 : null);
        row.total = r0.total != null ? r0.total : r.hit.total;
        row.recovery = row.total != null && row.startup != null ? Math.max(0, row.total - row.startup - (row.active || 0)) : null;
        row.travel = shot && r0.firstTk != null && r.spawn != null ? r0.firstTk - r.spawn : null;
        row.dmg = r.hit.dmg; row.hits = r.hit.hits; row.dmg1 = r0.hitAst ? Math.round(r0.dmg / Math.max(1, r0.hits) * 100) / 100 : null;
        row.chip = r.blk.chip; row.blockHits = r.blk.blocks; row.thrownOnBlock = r.blk.hits > 0;
        row.advHit = [r.hit.adv, r.hit1 ? r.hit1.adv : null]; row.advBlock = [r.blk.adv, r.blk1 ? r.blk1.adv : null];
        row.kd = r.hit.kd; row.cool = s.k === 'sp' || s.k === 'su' ? r.hit.cool : null;
        row.flags = [];
        if (A && A.launch) row.flags.push('launcher'); if (A && A.knock) row.flags.push('knockdown');
        if (row.kd && !row.flags.includes('knockdown')) row.flags.push('knockdown');
        if (!shot && row.table && row.startup !== row.table.hit && s.k !== 'throw') row.flags.push('startup differs from table (' + row.table.hit + ')');
        return row;
      }),
    };
  };
  return true;
}

// ---- node side ----

const fmtSigned = v => v == null ? '-' : (v > 0 ? '+' + v : String(v));
const fmtPair = pair => pair[0] == null && pair[1] == null ? '-' : pair[0] === pair[1] || pair[1] == null ? fmtSigned(pair[0]) : `${fmtSigned(pair[0])} / ${fmtSigned(pair[1])}`;

export function renderMarkdown(data) {
  const L = [];
  L.push('# Frame data', '');
  L.push('Generated by `node tools/framedata.mjs` (do not edit by hand). Every number comes from simulating the game one tick at a time in headless Chrome; the game runs at 60 ticks per second.', '');
  L.push('How the numbers are measured', '');
  L.push('- Both players are the same fighter (a mirror match), the foe stands still, nothing else happens. Each move is started with the engine\'s own starter, and tick 0 is the press.');
  L.push('- **Startup**: the tick the hit lands (the press is tick 0; a startup of 6 means the hit lands on the 6th tick after the press). For shots, the tick the projectile appears.');
  L.push('- **Active**: how many ticks the hitbox can land (found by putting the foe back on its feet every tick). **Recovery**: the rest of the move (total minus startup minus active). **Total** is the length of the move until the fighter can act again.');
  L.push('- **Dmg** is the damage of the whole move against a foe who stands there (combo scaling included), **Chip** against a foe who holds the guard. **Hits** is how many hits landed.');
  L.push('- **On hit / On block**: frame advantage counted from the last contact of the move, after the hit stop: how many ticks sooner the attacker can act than the foe. Positive means the attacker acts first. Where two numbers are shown the first is for player 1 as attacker, the second for player 2 (see "Update order" below).');
  L.push('- **Reach** is the closest and the farthest distance in pixels between the fighters (centre to centre) at which the move connected, on a coarse ladder of distances (56, 68, 80, 94, 110, 128, 150, 180, 220, 270, 330, 410, 520, 680).');
  L.push('- The base game has no block stun: a guarding fighter can act again right after the hit stop, so every move is negative on block by its remaining recovery.', '');
  L.push('Update order: the game updates player 1 before player 2 inside one tick, so a foe that is hit by player 1 is one tick ahead in its stun compared with a foe hit by player 2. The tables show both numbers where they differ.', '');
  for (const f of data) {
    L.push(`## ${f.name}`, '', `${f.tag}. HP ${f.hp}, speed ${f.spd}, power x${f.pow}.`, '');
    L.push('| Move | Input | Type | Startup | Active | Recovery | Total | Dmg | Chip | On hit | On block | Reach | Cool | Notes |');
    L.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |');
    for (const r of f.rows) {
      if (r.noHit) { L.push(`| ${r.key} | ${r.input} | ${r.type} | - | - | - | - | - | - | - | - | never connected | - | not hit at any tested distance |`); continue; }
      const notes = [...r.flags];
      if (r.hits > 1) notes.push(r.hits + ' hits');
      if (r.thrownOnBlock) notes.push('unblockable');
      if (r.travel != null) notes.push('lands ' + r.travel + ' ticks after it appears (at ' + r.D0 + ' px)');
      L.push(`| ${r.key} | ${r.input} | ${r.type} | ${r.startup ?? '-'} | ${r.active ?? '-'} | ${r.recovery ?? '-'} | ${r.total ?? '-'} | ${r.dmg} | ${r.thrownOnBlock ? '-' : r.chip} | ${r.air ? '-' : fmtPair(r.advHit)} | ${r.air || r.thrownOnBlock ? '-' : fmtPair(r.advBlock)} | ${r.reach[0] === r.reach[1] ? r.reach[0] : r.reach[0] + '-' + r.reach[1]} | ${r.cool ?? '-'} | ${notes.join(', ') || '-'} |`);
    }
    L.push('');
  }
  // quick read
  const all = data.flatMap(f => f.rows.filter(r => !r.noHit).map(r => ({ ...r, who: f.name })));
  const norm = all.filter(r => r.type === 'normal' && r.startup != null);
  const pick = (arr, key, dir) => arr.slice().sort((a, b) => dir * (a[key] - b[key]))[0];
  if (norm.length) {
    const fast = norm.slice().sort((a, b) => a.startup - b.startup || b.dmg - a.dmg)[0], strong = pick(norm.filter(r => r.dmg != null), 'dmg', -1);
    const specials = all.filter(r => r.type.startsWith('special') && r.dmg != null), sup = all.filter(r => r.type.startsWith('super') && r.dmg != null);
    L.push('## Quick read', '');
    L.push(`- Fastest normal: ${fast.who} ${fast.key} (${fast.startup} ticks). Strongest normal: ${strong.who} ${strong.key} (${strong.dmg} damage).`);
    if (specials.length) { const s = pick(specials, 'dmg', -1); L.push(`- Hardest-hitting special: ${s.who} ${s.key} (${s.dmg} damage, startup ${s.startup}).`); }
    if (sup.length) L.push('- Supers: ' + sup.map(r => `${r.who} ${r.key} (${r.dmg} damage over ${r.hits} hit${r.hits === 1 ? '' : 's'}, startup ${r.startup})`).join('; ') + '.');
    L.push('');
  }
  return L.join('\n');
}

export async function measureAll(p, { fighters = null } = {}) {
  const info = await openGame(p, p.__qaOpts || {});
  await p.eval('(' + pageFD.toString() + ')()');
  const ids = fighters && fighters.length ? info.roster.filter(r => fighters.includes(r)) : info.roster, data = [];
  for (const id of ids) data.push(await p.eval(`__fd.fighter(${JSON.stringify(id)})`));
  return data;
}

async function main() {
  const args = process.argv.slice(2), flag = n => args.includes(n), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
  const t0 = Date.now();
  const { withPage } = await import('./headless.mjs');   // lazy: keeps this file importable from inside the test run (see tools/fuzz.mjs)
  const ok = await withPage(async p => {
    p.__qaOpts = { page: flag('--index') ? 'index' : 'dev' };
    const data = await measureAll(p, { fighters: arg('--fighters', '').split(',').filter(Boolean) });
    const md = renderMarkdown(data);
    if (flag('--stdout')) console.log(md);
    else {
      const out = path.resolve(ROOT, arg('--out', 'docs/FRAMEDATA.md'));
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, md);
      console.log(`framedata: ${data.length} fighters, ${data.reduce((s, f) => s + f.rows.length, 0)} moves measured in ${((Date.now() - t0) / 1000).toFixed(1)} s, written to ${path.relative(ROOT, out)}`);
    }
    if (p.errors.length) console.log('console errors:\n' + p.errors.slice(0, 3).join('\n'));
    return !p.errors.length;
  });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
