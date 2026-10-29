// Tests for arenas2.js (six more stages: cliff, hall, stadium, sewer, lagoon, dojo). Owner: the content agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Covers: the list has 15 stages, each new one renders headless (one screenshot each in tools/shots/), thumbnails exist, the select screen (Q/E), the random pick and the versus roulette reach every stage,
// the stage gag fires every 8 to 12 s when the game is stepped, the KO and wall-hit reactions change the picture, the round-1 pan changes the picture, no console errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDS = ['cliff', 'hall', 'stadium', 'sewer', 'lagoon', 'dojo'];
const w = (...parts) => parts.join('');   // the banned words are written in pieces so this file does not trip its own scan
const BAN = new RegExp([w('mortal ko', 'mbat'), w('fata', 'lity'), w('finish ', 'him'), w('flawless ', 'victory'), w('get over ', 'here'), w('toa', 'sty'), w('scor', 'pion'), w('sub-', 'zero'), w('rai', 'den'),
  w('hado', 'uken'), w('shory', 'uken'), w('street ', 'fighter'), w('tek', 'ken'), w('baba', 'lity'), w('bru', 'tality')].join('|'), 'i');

export async function run(t) {
  const { check, tap } = t, ev = t.eval, p = t.p;
  const e0 = p.errors.length;
  fs.mkdirSync(path.join(ROOT, 'tools', 'shots'), { recursive: true });
  await t.open('');

  // ---- the list ----
  const info = await ev(`(() => ({ n: ARENAS.length, ids: ARENAS.map(a => a.id), names: ARENAS.map(a => a.name), tags: ARENAS.map(a => a.tagline), acc: ARENAS.map(a => a.accent),
    fns: ARENAS.every(a => typeof a.draw === 'function' && typeof a.thumb === 'function' && typeof a._ensure === 'function'), fronts: ARENAS.slice(9).every(a => typeof a.front === 'function'),
    pub: window.ARENAS2 ? ARENAS2.ids.join() : null }))()`);
  check(info.n === 15, 'ARENAS.length is 15: ' + info.n);
  check(JSON.stringify(info.ids.slice(9)) === JSON.stringify(IDS) && info.pub === IDS.join(), 'the six new stages come after the nine old ones, in order: ' + info.ids.slice(9).join(' '));
  check(new Set(info.ids).size === 15 && new Set(info.names).size === 15 && new Set(info.tags).size === 15, 'ids, names and taglines are unique across the 15 stages');
  check(info.names.slice(9).join('|') === 'CONTEXT WINDOW CLIFF|HALLUCINATION HALL|BENCHMARK STADIUM|PROMPT INJECTION SEWER|LATENCY LAGOON|ALIGNMENT DOJO', 'the new stage names: ' + info.names.slice(9).join(' | '));
  check(info.names.slice(9).every(n => n === n.toUpperCase()) && info.tags.slice(9).every(n => n === n.toUpperCase() && n.length > 8) && info.acc.slice(9).every(c => /^#[0-9a-f]{6}$/i.test(c)), 'names and taglines are caps, accents are hex colours');
  check(info.fns && info.fronts, 'every stage has draw, thumb and _ensure; the new ones also have a foreground layer');
  const src = fs.readFileSync(path.join(ROOT, 'arenas2.js'), 'utf8');
  check(!BAN.test(src), 'arenas2.js has none of the banned names');

  // ---- every new stage renders: not blank, thumbnail there, reactions change the picture ----
  const pix = await ev(`(() => {
    const out = {}, cv = document.createElement('canvas'); cv.width = 960; cv.height = 540; const g = cv.getContext('2d', { willReadFrequently: true }), cam = { x: 0, zoom: 1 };
    const grab = (i, tk) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 540); drawArena(g, i, tk, cam); drawArenaFront(g, i, tk, cam); return g.getImageData(0, 0, 960, 540).data; };
    const thumb = (i, tk) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 540); drawArenaThumb(g, i, 0, 0, 192, 108, tk); return g.getImageData(0, 0, 192, 108).data; };
    const diff = (a, b) => { let n = 0; for (let k = 0; k < a.length; k += 4) if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) n++; return n; };
    const stats = d => { const seen = new Set(); let lum = 0, c = 0; for (let k = 0; k < d.length; k += 12) { seen.add(((d[k] >> 4) << 8) | ((d[k + 1] >> 4) << 4) | (d[k + 2] >> 4)); lum += d[k] + d[k + 1] + d[k + 2]; c++; } return { colors: seen.size, lum: Math.round(lum / c / 3) }; };
    prewarmArenas(); const S = ARENAS2.state, off = { ko: -99999, wall: -99999, pan: -99999, side: 1 };
    for (let n = 0; n < 6; n++) {
      const i = 9 + n, id = ARENAS[i].id, r = {}; Object.assign(S, off);
      const base = grab(i, 1234); r.draw = stats(base); r.thumb = stats(thumb(i, 40));
      // a time with the gag clearly under way (age 30); the same time with the gag switched off (duration 0) is the same picture without it
      let tg = -1; for (let tk = 700; tk < 2400 && tg < 0; tk++) { const s = ARENAS2.gag(tk, id); if (s.on && s.age === 30) tg = tk; }
      r.tg = tg; const withGag = grab(i, tg), cfg = ARENAS2.cfg[id], d0 = cfg.dur; cfg.dur = 0; const noGag = grab(i, tg); r.gagOff = !ARENAS2.gag(tg, id).on; cfg.dur = d0; r.gagDiff = diff(withGag, noGag);
      Object.assign(S, off); const quiet = grab(i, 1000); S.ko = 994; r.ko = diff(quiet, grab(i, 1000)); Object.assign(S, off);
      S.wall = 992; S.side = -1; r.wallL = diff(quiet, grab(i, 1000)); S.side = 1; r.wallR = diff(quiet, grab(i, 1000)); Object.assign(S, off);
      S.pan = 980; r.pan = diff(quiet, grab(i, 1000)); Object.assign(S, off);
      out[id] = r;
    }
    return out; })()`);
  for (const id of IDS) {
    const r = pix[id];
    check(r.draw.colors >= 40 && r.draw.lum > 6 && r.draw.lum < 200, id + ' renders a full picture (' + r.draw.colors + ' colours, mean brightness ' + r.draw.lum + ')');
    check(r.thumb.colors >= 25 && r.thumb.lum > 6, id + ' has a thumbnail (' + r.thumb.colors + ' colours)');
    check(r.tg > 0 && r.gagOff && r.gagDiff > 150, id + ' stage gag changes the picture (tick ' + r.tg + ', ' + r.gagDiff + ' px)');
    check(r.ko > 30, id + ' reacts to a KO (' + r.ko + ' px)');
    check(r.wallL > 8 && r.wallR > 8, id + ' reacts to a heavy hit by a wall, both sides (' + r.wallL + ' / ' + r.wallR + ' px)');
    check(r.pan > 400, id + ' round-1 backdrop pan moves the picture (' + r.pan + ' px)');
  }

  // ---- the gag schedule: every 8 to 12 s, a pure function of the tick ----
  const sch = await ev(`(() => { const out = {}; for (const id of ${JSON.stringify(IDS)}) { const starts = []; let prev = -1; for (let tk = 0; tk < 12000; tk++) { const s = ARENAS2.gag(tk, id); if (s.on && s.age === 0) starts.push(tk); if (s.on && prev >= 0 && s.age !== prev + 1 && s.age !== 0) starts.push(-1); prev = s.on ? s.age : -1; }
    const gaps = starts.slice(1).map((x, i) => x - starts[i]); out[id] = { n: starts.length, min: Math.min(...gaps), max: Math.max(...gaps), dur: ARENAS2.cfg[id].dur, same: JSON.stringify(ARENAS2.gag(777, id)) === JSON.stringify(ARENAS2.gag(777, id)) }; } return out; })()`);
  for (const id of IDS) check(sch[id].n >= 18 && sch[id].min >= 480 && sch[id].max <= 720 && sch[id].dur < 480 && sch[id].same, id + ' gag comes every 480 to 720 ticks (8 to 12 s): ' + sch[id].min + '..' + sch[id].max + ', ' + sch[id].n + ' in 200 s, lasts ' + sch[id].dur);

  // ---- the gag fires on the bus while the game is stepped (fighters idle so the round does not end) ----
  for (const [i, id] of [[9, 'cliff'], [12, 'sewer']]) {
    await t.open('#demo=0,1&arena=' + i + '&stop'); await ev('hold(true)');
    const g = await ev(`(() => { const got = []; BUS.on('arena:gag', e => got.push([e.arena, e.index, e.k, e.tick])); let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
      game.f[0].cpu = false; game.f[1].cpu = false; for (let k = 0; k < 2700; k++) step(1); return { got, phase: game.phase, arena: ARENAS[game.arena].id }; })()`);
    const ticks = g.got.map(e => e[3]), gaps = ticks.slice(1).map((x, k) => x - ticks[k]);
    check(g.arena === id && g.phase === 'fight' && g.got.length >= 3 && g.got.every(e => e[0] === id && e[1] === i) && gaps.every(x => x >= 480 && x <= 720), id + ': BUS arena:gag fires while stepping, 8 to 12 s apart (' + g.got.length + ' in 2700 ticks, gaps ' + gaps.join(',') + ')');
  }

  // ---- the KO and wall hit listeners ----
  await t.open('#demo=0,1&arena=10&stop'); await ev('hold(true)');
  const rx = await ev(`(() => { const S = ARENAS2.state, out = {}; let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1); step(5);
    Object.assign(S, { ko: -99999, wall: -99999, side: 1, pan: -99999 });
    BUS.emit('hit', { src: game.f[0], victim: { x: 40 }, dmg: 4, kind: 'punch' }); out.light = S.wall;
    BUS.emit('hit', { src: game.f[0], victim: { x: 480 }, dmg: 12, kind: 'punch' }); out.mid = S.wall;
    BUS.emit('hit', { src: game.f[0], victim: { x: 40 }, dmg: 9, kind: 'kick' }); out.left = [S.wall === game.tick, S.side]; S.wall = -99999;
    BUS.emit('hit', { src: game.f[0], victim: { x: 920 }, dmg: 3, kind: 'super' }); out.right = [S.wall === game.tick, S.side]; S.wall = -99999;
    BUS.emit('ko', { winner: game.f[0], loser: game.f[1], flawless: false }); out.ko = S.ko === game.tick; BUS.emit('round:start', { round: 2, sudden: false, time: 99 }); out.pan2 = S.pan; BUS.emit('round:start', { round: 1, sudden: false, time: 99 }); out.pan1 = S.pan === game.tick;
    return out; })()`);
  check(rx.light === -99999 && rx.mid === -99999, 'a light hit by a wall and a heavy hit in mid-screen do not trigger the wall reaction');
  check(rx.left[0] && rx.left[1] === -1 && rx.right[0] && rx.right[1] === 1, 'a heavy hit (or a super) near the left or right wall triggers the wall reaction on that side');
  check(rx.ko && rx.pan2 === -99999 && rx.pan1, 'BUS ko is picked up, the pan starts on round 1 only');

  // ---- the boot route #...&arena=K works for K = 9 and up ----
  await t.open('#demo=0,1&arena=14&stop');
  const bt = await ev(`({ id: ARENAS[game.arena].id, pick: game.arenaPick, ph: game.phase, cpu: game.f[0].cpu && game.f[1].cpu })`);
  check(bt.id === 'dojo' && bt.pick === 14 && bt.ph === 'vs' && bt.cpu, 'the debug route #demo=0,1&arena=14 opens the ALIGNMENT DOJO: ' + JSON.stringify(bt));
  await t.open('#arena=11'); check(await ev('game.arenaPick') === 11, 'the debug route #arena=11 sets the pick');

  // ---- select screen, random pick, versus roulette ----
  await t.open('#select'); await ev('game.arenaPick = 13');
  const seq = []; for (const k of ['KeyE', 'KeyE', 'KeyE', 'KeyQ', 'KeyQ']) { await tap(k); seq.push(await ev('game.arenaPick')); }
  check(seq.join() === '14,-1,0,-1,14', 'select screen: E and Q cycle through all 15 stages and the random slot: ' + seq.join());
  await t.wait(200);
  const rnd = await ev(`(() => { const old = Math.random, out = {}; game.arenaPick = -1; Math.random = () => 0.999; startMatch(); out.hi = game.arena; Math.random = () => 0.6; startMatch(); out.mid = game.arena; Math.random = old;
    const seen = new Set(); game.arena = 13; for (let tk = 0; tk <= VS_LAND; tk++) seen.add(rouletteArena(tk)); out.landed = rouletteArena(VS_LAND); out.seen = [...seen].filter(x => x >= 9).length; out.max = Math.max(...seen); return out; })()`);
  check(rnd.hi === 14 && rnd.mid === 9, 'the random pick can land on the last and the first new stage: ' + rnd.mid + ', ' + rnd.hi);
  check(rnd.landed === 13 && rnd.seen === 6 && rnd.max === 14, 'the versus roulette runs over all 15 stages and lands on the chosen new one: ' + JSON.stringify(rnd));

  // ---- one screenshot of each new stage in a fight ----
  for (const [n, id] of IDS.entries()) {
    await t.open('#demo=0,1&arena=' + (9 + n) + '&stop'); await ev('hold(true)'); await t.wait(120);
    const r = await ev(`(() => { let k = 0; while (game.phase !== 'fight' && k++ < 3000) step(1); step(40); return { phase: game.phase, id: ARENAS[game.arena].id }; })()`);
    await t.wait(120); const file = path.join(ROOT, 'tools', 'shots', 'arena-' + id + '.png'); await p.shot(file);
    check(r.phase === 'fight' && r.id === id && fs.existsSync(file) && fs.statSync(file).size > 20000, id + ': fight screenshot written to tools/shots/arena-' + id + '.png');
  }
  check(p.errors.length === e0, 'arenas2: no console errors' + (p.errors.length > e0 ? ': ' + p.errors.slice(e0).join(' | ') : ''));
}
