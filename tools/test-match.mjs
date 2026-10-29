// Automated smoke test: loads the built index.html in headless Chrome, drives the menus with key
// events, then plays several full CPU-vs-CPU matches via window.step() and checks that every match
// reaches the 'over' phase without console errors or exceptions. Run: node tools/headless.mjs --test
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = 'file://' + path.join(ROOT, 'index.html');

export async function runTests(p) {
  let ok = true;
  const tap = async c => { await p.tap(c); await p.wait(45); };
  const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) ok = false; };

  // 1. menus: title -> select -> pick -> intro -> fight
  await p.goto(URL_BASE); await p.wait(400);
  check(await p.eval('game.phase') === 'title', 'boots to title');
  await tap('Enter'); await p.wait(50);
  check(await p.eval('game.phase') === 'select', 'enter opens select');
  await tap('KeyD'); await tap('KeyF'); await p.wait(50); check(await p.eval('game.ready[0]'), 'P1 confirmed');
  await tap('KeyG'); await p.wait(50); check(await p.eval('!game.ready[0]'), 'G un-confirms P1');
  await tap('KeyF'); await tap('KeyS'); await tap('KeyF'); await p.wait(50);
  check(await p.eval('game.phase') === 'intro', 'both picks start a match');
  await p.eval('step(130)'); check(await p.eval('game.phase') === 'fight', 'intro leads to fight');
  await tap('KeyP'); await p.wait(30); check(await p.eval('game.phase') === 'pause', 'P pauses');
  await tap('KeyP'); await p.wait(30); check(await p.eval('game.phase') === 'fight', 'P resumes');
  // hold right + punch, make sure human input moves and attacks (park the CPU far away first)
  await p.eval("game.f[1].cpu = false; game.f[1].x = 880; game.f[0].set('idle'); game.f[0].x = 300; game.hitstop = 0; game.proj = []");
  await p.key('KeyD', true); await p.eval('step(30)'); await p.key('KeyD', false);
  check(await p.eval('game.f[0].x') > 340, 'P1 walks right');
  await tap('KeyF'); await p.eval('step(2)'); check(await p.eval('game.f[0].state') === 'punch', 'punch key attacks');
  await p.shot(path.join(ROOT, 'tools', '.shot-fight.png'));

  // 1b. two-player select flow and the end screen's rematch / back-to-select keys
  await p.goto(URL_BASE); await p.wait(300); await tap('KeyS'); await tap('Enter');
  check(await p.eval('game.phase === "select" && game.mode === 2'), '2P mode select');
  await tap('ArrowRight'); await tap('KeyK'); await tap('KeyF'); await p.wait(50);
  check(await p.eval('game.phase') === 'intro', '2P picks start a match');
  await p.eval("game.phase = 'over'; game.wins = [2, 0]"); await tap('KeyR'); check(await p.eval('game.phase') === 'intro', 'R rematches');
  await p.eval("game.phase = 'over'"); await tap('Enter'); check(await p.eval('game.phase') === 'select', 'enter returns to select');

  // 2. full CPU vs CPU matches for every pairing of a few rosters, fast-forwarded
  const N = await p.eval('ROSTER.length');
  const pairs = []; for (let i = 0; i < N; i++) pairs.push([i, (i + 3) % N]); pairs.push([N - 1, N - 1], [0, 2]);
  for (const [i, j] of pairs) {
    await p.goto(`${URL_BASE}#demo=${i},${j}&stop`); await p.wait(250);
    const r = await p.eval(`(() => { let n = 0; while (game.phase !== 'over' && n < 60000) { step(60); n += 60; }
      return { phase: game.phase, ticks: n, wins: game.wins, round: game.round, sudden: game.sudden, hp: game.f.map(f => Math.round(f.hp)) }; })()`);
    check(r.phase === 'over', `match ${i} vs ${j} finishes (${r.ticks} ticks, wins ${r.wins}, rounds ${r.round}${r.sudden ? ', sudden death' : ''})`);
    check(r.ticks < 60000 && r.round <= 5, `match ${i} vs ${j} ends in a sane number of rounds`);
  }
  await p.shot(path.join(ROOT, 'tools', '.shot-over.png'));

  // 3. every attack of every fighter runs without throwing, super included
  const r2 = await p.eval(`(() => { const out = []; for (let i = 0; i < ROSTER.length; i++) { game.sel = [i, (i + 1) % ROSTER.length]; startMatch(); game.phase = 'fight'; game.msg = null;
    const f = game.f[0]; f.cpu = true; game.f[1].cpu = true; f.meter = 100; f.set('super'); step(ATK.super.len + 90); f.set('special'); step(ATK.special.len + 160); f.set('kick'); step(30); f.set('punch'); step(20);
    out.push(ROSTER[i].id + ':' + game.phase); } return out; })()`);
  check(r2.length === N, 'all specials/supers ran: ' + r2.join(' '));

  // 4. the sheet debug view and the select screen render
  await p.goto(URL_BASE + '#sheet=muse'); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-sheet.png'));
  await p.goto(URL_BASE + '#select'); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-select.png'));
  await p.goto(URL_BASE); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-title.png'));

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}
