// Tests for arenas3.js: six more stages (TECH-DEBT SWAMP, CACHE MISS CANYON, OPEN-PLAN OFFICE, CLOUD BILLING VOLCANO, NIGHTLY BUILD EXPRESS, KEYNOTE STAGE), each with its own chiptune
// theme, a foreground layer and one background reaction to the BUS 'hit' and 'ko' events. Owner: x-arenas3. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Everything is deterministic: stages are painted by hand at fixed ticks onto an offscreen canvas, matches are driven with hold() and step(), and stages are looked up by id, never by
// index, because other features may register stages too. Note on `&arena=K` in the URL: game.js reads it before this file has registered anything, so arenas3.js re-applies it (tested below).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDS = ['techdebt', 'cachemiss', 'openplan', 'billing', 'nightlytrain', 'keynote'];
const KO_GAGS = ['openplan', 'billing', 'keynote'];   // the stages with an extra reaction to a knockout (GG, OVERDUE, SHIPPED)
const NAMES = ['TECH-DEBT SWAMP', 'CACHE MISS CANYON', 'OPEN-PLAN OFFICE', 'CLOUD BILLING VOLCANO', 'NIGHTLY BUILD EXPRESS', 'KEYNOTE STAGE'];
const BANNED = new RegExp(['mortal kom' + 'bat', 'fatal' + 'ity', 'finish h' + 'im', 'flaw' + 'less vic' + 'tory', 'get over h' + 'ere', 'toas' + 'ty', 'scorp' + 'ion', 'sub-ze' + 'ro', 'rai' + 'den', 'hado' + 'uken', 'shory' + 'uken', 'street fig' + 'hter', 'tek' + 'ken', 'babal' + 'ity', 'brutal' + 'ity'].join('|'), 'i');   // the list from the project rules, split so this file does not trip its own scan

// page-side helpers: paint a stage onto an offscreen 960x540 canvas and compare frames (only small numbers cross back to the test)
const SETUP = `(() => {
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540; const g = cv.getContext('2d', { willReadFrequently: true });
  const T3 = window.__t3 = {
    arena: id => ARENAS.find(a => a.id === id),
    snap(id, t, cam) { const a = T3.arena(id); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 540); g.fillStyle = '#000'; g.fillRect(0, 0, 960, 540); a.draw(g, t, cam); if (a.front) a.front(g, t, cam); return g.getImageData(0, 0, 960, 540).data; },
    stat(d) { const s = new Set(); let lum = 0, n = 0; for (let i = 0; i < d.length; i += 28) { s.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); lum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; } return { colors: s.size, lum: Math.round(lum / n) }; },
    diff(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 18) n++; return n; },
    front(id, t) { const a = T3.arena(id); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 540); if (!a.front) return -1; a.front(g, t); const d = g.getImageData(0, 0, 960, 540).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; },
    thumb(id, t) { const a = T3.arena(id); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 540); a.thumb(g, 10, 10, 192, 108, t); const d = g.getImageData(10, 10, 192, 108).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); return s.size; },
  };
  return true;
})()`;

export async function run(t) {
  const { check, tap } = t, ev = t.eval;
  const src = fs.readFileSync(path.join(ROOT, 'arenas3.js'), 'utf8'), docPath = path.join(ROOT, 'docs', 'features', 'x-arenas3.md');
  const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : '';

  // ---- the files: no trademarks, no network, no module syntax, documented ----
  check(!BANNED.test(src) && !BANNED.test(doc), 'arenas3.js and its notes name no third-party game trademarks');
  check(!/\bfetch\(|XMLHttpRequest|https?:\/\/|^\s*(import|export)\s/m.test(src), 'arenas3.js is a classic script with no network requests');
  check(/^\/\/ .*\n\/\/ Owner: /.test(src) && /'use strict'/.test(src) && /window\.STUB_ARENAS3 = 1;/.test(src), 'arenas3.js has its owner header, strict mode and marker global');
  check(doc.length > 800 && NAMES.every(n => doc.includes(n)), 'docs/features/x-arenas3.md describes all six stages');

  // ---- registration: additive, by id ----
  await t.open();
  const reg = await ev(`(() => ({
    marker: window.STUB_ARENAS3, ids: window.ARENAS3 && ARENAS3.ids, idx: ${JSON.stringify(IDS)}.map(id => ARENAS.findIndex(a => a.id === id)),
    info: ${JSON.stringify(IDS)}.map(id => { const a = ARENAS.find(x => x.id === id) || {}; return [a.name, a.tagline, a.accent, typeof a.draw, typeof a.front, typeof a.thumb]; }),
    uniqueIds: new Set(ARENAS.map(a => a.id)).size === ARENAS.length, uniqueNames: new Set(ARENAS.map(a => a.name)).size === ARENAS.length, builtIns: ARENAS.slice(0, 9).map(a => a.id).join() }))()`);
  check(reg.marker === 1 && JSON.stringify(reg.ids) === JSON.stringify(IDS), 'arenas3.js loads and exposes ARENAS3.ids: ' + JSON.stringify(reg.ids));
  check(reg.idx.every((v, i) => v >= 9 && (i === 0 || v > reg.idx[i - 1])), 'the six stages are pushed onto ARENAS after the nine built-ins, in order: ' + reg.idx.join(','));
  check(reg.builtIns === 'gpupit,cathedral,bridge,furnace,forest,temple,graveyard,rooftop,wasteland', 'the built-in stages are untouched: ' + reg.builtIns);
  check(reg.info.every((r, i) => r[0] === NAMES[i] && r[1] && /^#[0-9a-f]{6}$/i.test(r[2]) && r[3] === 'function' && r[4] === 'function' && r[5] === 'function'), 'every stage has its name, tagline, accent colour, draw, front and thumb: ' + JSON.stringify(reg.info.map(r => r.slice(0, 3))));
  check(reg.uniqueIds && reg.uniqueNames, 'stage ids and names are unique across ARENAS');

  // ---- themes: one per stage, well formed, at the house loudness ----
  const th = await ev(`(() => { const names = MUSIC.themes(); return ${JSON.stringify(IDS)}.map(id => { const T = ARENAS3.themes[id], bad = []; if (!T || !names.includes(id)) return { reg: false };
    for (const v of ['l', 'b', 'a']) if (T[v]) for (const p of T[v][3]) for (const grp of p.split(' ')) if (!/^[.\\-0-9a-z]{16}$/.test(grp)) bad.push(v + ':' + grp);
    for (const k of ['k', 's', 'h', 't']) if (T.d[k] && (T.d[k].replace(/ /g, '').length % 16 || !/^[.xXgo ]+$/.test(T.d[k]))) bad.push('d.' + k);
    return { reg: true, bad, voices: ['l', 'b', 'a'].filter(v => T[v]).length, bpm: T.bpm }; }); })()`);
  check(th.every(x => x.reg), 'every stage has a registered theme (MUSIC.themes) under its own id');
  check(th.every(x => x.reg && !x.bad.length && x.voices >= 2), 'theme patterns are well formed (16-step groups, drum rows in whole bars): ' + th.map(x => (x.bad || []).join('|')).join(' '));
  check(new Set(th.map(x => x.bpm)).size === 6, 'the six themes run at six different tempos: ' + th.map(x => x.bpm).join(','));
  const rms = await ev(`(async () => { const out = []; for (const n of ${JSON.stringify(IDS)}) { const d = (await MUSIC.render(n)).getChannelData(0); let s = 0; for (const v of d) s += v * v; out.push(Math.sqrt(s / d.length)); } return out; })()`);
  const dB = v => 20 * Math.log10(v);
  check(rms.every(r => dB(r) > -18.5 && dB(r) < -15.5), 'audio: the six stage themes render within -18.5..-15.5 dBFS RMS: ' + rms.map((r, i) => IDS[i] + ' ' + dB(r).toFixed(1)).join(', '));

  // ---- painting: each stage on its own, at fixed ticks ----
  await ev(SETUP);
  for (const id of IDS) {
    const r = await ev(`(() => { const T3 = window.__t3, out = {}; try {
      const f1 = T3.snap(${JSON.stringify(id)}, 120), f2 = T3.snap(${JSON.stringify(id)}, 150);
      out.stat = T3.stat(f1); out.anim = T3.diff(f1, f2); out.par = T3.diff(f1, T3.snap(${JSON.stringify(id)}, 120, { x: 140, zoom: 1 }));
      out.front = T3.front(${JSON.stringify(id)}, 120); out.thumb = T3.thumb(${JSON.stringify(id)}, 120);
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); } return out; })()`);
    check(!r.err && r.stat.colors >= 40 && r.stat.lum > 5 && r.stat.lum < 200, id + ' paints a full, dark-arcade frame (' + (r.err || r.stat.colors + ' colours, mean luma ' + r.stat.lum) + ')');
    check(!r.err && r.anim > 400, id + ' is animated: ' + r.anim + ' px change over 30 ticks');
    check(!r.err && r.par > 8000, id + ' has parallax: ' + r.par + ' px change when the camera moves');
    check(!r.err && r.front > 300, id + ' has a foreground layer: ' + r.front + ' px drawn over the fighters');
    check(!r.err && r.thumb >= 24, id + ' draws its own thumbnail for the picker (' + r.thumb + ' colours)');
  }

  // ---- background reactions: a big hit and a KO change the picture, and the BUS wiring feeds ARENAS3.rx ----
  await t.open('#demo=0,1&ff=400&stop');
  await ev(SETUP);
  for (const id of IDS) {
    const r = await ev(`(() => { const T3 = window.__t3, R = ARENAS3.rx, f = game.f, out = {}; let T = game.tick; const id = ${JSON.stringify(id)}, clear = () => { R.hit = R.big = R.ko = R.block = -1e6; };
      try {
        for (let n = 0; n < 400 && game.phase !== 'fight'; n++) step(5);
        T = game.tick; game.arena = ARENAS.findIndex(a => a.id === id); clear();
        const idle = T3.snap(id, T + 6).slice(); BUS.emit('hit', { src: f[0], victim: f[1], dmg: 20, kind: 'super', combo: 5, hp: f[1].hp });
        out.big = R.big === T && R.mag > 0.5 && R.hits >= 1 && R.cost > 0; out.hit = T3.diff(idle, T3.snap(id, T + 6));
        R.big = -1e6; const calm = T3.snap(id, T + 60).slice(); BUS.emit('ko', { winner: f[0], loser: f[1] });
        out.ko = R.ko === T; out.koDiff = T3.diff(calm, T3.snap(id, T + 60));
        BUS.emit('block', { src: f[0], victim: f[1] }); out.block = R.block === T; clear();
      } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); } return out; })()`);
    check(!r.err && r.big && r.ko && r.block, id + ' listens to BUS hit, block and ko' + (r.err ? ': ' + r.err : ''));
    check(!r.err && r.hit > 500, id + ' reacts to a big hit: ' + r.hit + ' px change');
    if (KO_GAGS.includes(id)) check(!r.err && r.koDiff > 500, id + ' also reacts to a KO: ' + r.koDiff + ' px change');   // the other three react to big hits only
  }

  // ---- in a real match: the full flow with each stage, every phase painted, the theme follows the stage ----
  for (const id of IDS) {
    const a = await ev(`(() => { const out = { phases: [], ms: 0, n: 0 }, id = ${JSON.stringify(id)}; try {
      hold(true); game.arenaPick = ARENAS.findIndex(a => a.id === id); game.sel = [3, 4]; startMatch(); game.f[0].cpu = game.f[1].cpu = true;
      out.arena = ARENAS[game.arena].id;
      for (let n = 0; n < 200 && game.phase !== 'fight'; n++) { step(10); render(); }
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); } out.phase = game.phase; return out; })()`);
    await t.wait(200);
    const th2 = await ev('MUSIC.theme');
    const b = await ev(`(() => { const out = { phases: [], ms: 0, n: 0 }; try {
      game.wins = [roundsToWin() - 1, roundsToWin() - 1]; game.f[1].hp = 1;   // the next knockout ends the match, so the finish, finisher and outro are painted too
      for (let n = 0; n < 400 && game.phase !== 'over'; n++) { step(15); const t0 = performance.now(); render(); out.ms += performance.now() - t0; out.n++; if (out.phases[out.phases.length - 1] !== game.phase) out.phases.push(game.phase); }
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); } out.hits = ARENAS3.rx.hits; out.phase = game.phase; out.avg = Math.round(out.ms / Math.max(1, out.n)); return out; })()`);
    check(!a.err && !b.err && a.arena === id && a.phase === 'fight', id + ' is picked by game.arenaPick and the match reaches the fight' + (a.err || b.err ? ': ' + (a.err || b.err) : ''));
    check(th2 === id, id + ' plays its own theme during the fight (MUSIC.theme is ' + th2 + ')');
    check(b.phase === 'over' && b.phases.some(p => ['ko', 'finish', 'finisher', 'outro'].includes(p)) && (b.hits > 0 || b.phases.includes('ko')), id + ' survives a whole finish in every phase (' + b.phases.join('>') + ', ' + b.hits + ' hits seen by the reactions)');
    check(b.avg < 120, id + ' paints a full frame in ' + b.avg + ' ms on average here (limit 120)');
  }

  // ---- the picker: Q / E reach every new stage, the preview shows it, and the URL route lands on it ----
  await t.open('#select');
  for (const id of IDS) {
    let n = 0; while (n++ < 60 && (await ev('(ARENAS[game.arenaPick] || {}).id')) !== id) await tap('KeyE');
    await t.wait(150);
    const s = await ev(`(() => { const d = ctx.getImageData(384, 384, 192, 108).data, c = new Set(); for (let i = 0; i < d.length; i += 4) c.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); return { id: (ARENAS[game.arenaPick] || {}).id, colors: c.size }; })()`);
    check(s.id === id && s.colors >= 24, 'the picker reaches ' + id + ' with E and previews it (' + s.colors + ' colours)');
  }
  await tap('KeyQ'); check(await ev('ARENAS[game.arenaPick].id') === 'nightlytrain', 'Q steps back from KEYNOTE STAGE to NIGHTLY BUILD EXPRESS');
  for (const id of [IDS[0], IDS[5]]) {
    const k = reg.idx[IDS.indexOf(id)];
    await t.open('#demo=0,1&arena=' + k + '&ff=30&stop');
    check(await ev('[game.arena, game.arenaPick, ARENAS[game.arena].id].join()') === [k, k, id].join(), '#demo=..&arena=' + k + ' lands on ' + id + ' even though game.js runs before the stage is registered');
  }
}
