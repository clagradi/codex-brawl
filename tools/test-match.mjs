// Automated smoke test: loads the built index.html in headless Chrome, drives the menus with key
// events, then plays several full CPU-vs-CPU matches via window.step() and checks that every match
// reaches the 'over' phase without console errors or exceptions. Run: node tools/headless.mjs --test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = 'file://' + path.join(ROOT, 'index.html');

export async function runTests(p) {
  let ok = true;
  const tap = async c => { await p.tap(c); await p.wait(45); };
  const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) ok = false; };
  const stepUntil = (phase, max = 2000) => p.eval(`(() => { let n = 0; while (game.phase !== '${phase}' && n < ${max}) { step(1); n++; } return game.phase; })()`);

  // 0. the build stays self-contained and free of third-party game trademarks
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(!/<script[^>]+src=|<link[^>]+rel="?stylesheet|<img[^>]+src=|\bfetch\(/i.test(html), 'index.html loads no external scripts, styles or images');
  check(/property="og:image" content="https:\/\/clagradi\.github\.io\/codex-brawl\/og\.png"/.test(html) && /twitter:card" content="summary_large_image/.test(html), 'Open Graph and X card meta present');
  check(fs.existsSync(path.join(ROOT, 'og.png')), 'og.png share image exists');
  const banned = html.match(/mortal kombat|fatality|finish him|flawless victory|get over here|toasty|scorpion|sub-zero|raiden/gi);
  check(!banned, 'no third-party game trademarks' + (banned ? ': ' + [...new Set(banned)].join(', ') : ''));

  // 1. menus: title -> select -> pick -> arena reveal -> intro -> fight
  await p.goto(URL_BASE); await p.wait(400);
  check(await p.eval('game.phase') === 'title', 'boots to title');
  await tap('Enter'); await p.wait(50);
  check(await p.eval('game.phase') === 'select', 'enter opens select');
  await tap('KeyD'); await tap('KeyJ'); await p.wait(50); check(await p.eval('game.ready[0]'), 'J confirms P1');
  await tap('KeyK'); await p.wait(50); check(await p.eval('!game.ready[0]'), 'K un-confirms P1');
  await tap('KeyE'); check(await p.eval('game.arenaPick') === 0, 'E picks an arena');
  await tap('KeyQ'); check(await p.eval('game.arenaPick') === -1, 'Q goes back to random');
  await tap('KeyJ'); await tap('KeyS'); await tap('KeyJ'); await p.wait(50);
  check(await p.eval('game.phase') === 'vs', 'both picks open the versus screen');
  check(await p.eval('game.arena >= 0 && game.arena < ARENAS.length'), 'random arena chosen');
  check(await stepUntil('intro') === 'intro', 'arena reveal leads to round intro');
  check(await stepUntil('fight') === 'fight', 'intro leads to fight');
  await tap('KeyP'); await p.wait(30); check(await p.eval('game.phase') === 'pause', 'P pauses');
  await p.shot(path.join(ROOT, 'tools', '.shot-pause.png'));
  await tap('KeyP'); await p.wait(30); check(await p.eval('game.phase') === 'fight', 'P resumes');
  // hold right + punch, make sure human input moves and attacks (park the CPU far away first)
  await p.eval('hold(true)'); // from here on only step() advances time, so key taps cannot race the real-time loop
  const park = "game.f[1].cpu = false; game.f[1].x = 880; game.f[0].set('idle'); game.f[0].x = 300; game.f[0].cool = 0; game.hitstop = 0; game.slow = 0; game.proj = []; game.fx = []; game.delayed = []; game.f[1].set('idle'); game.f[1].hidden = false";
  await p.eval(park);
  await p.key('KeyD', true); await p.eval('step(30)'); await p.key('KeyD', false);
  check(await p.eval('game.f[0].x') > 340, 'P1 walks right');
  await tap('KeyJ'); await p.eval('step(2)'); { const s = await p.eval('[game.f[0].state, game.f[0].st, game.f[0].cool, game.hitstop, game.phase, game.f[0].x|0].join()'); check(s.startsWith('punch'), 'J punches' + (s.startsWith('punch') ? '' : ' (' + s + ')')); }
  await p.eval(park + '; step(1)'); await tap('KeyK'); await p.eval('step(2)'); check(await p.eval('game.f[0].state') === 'kick', 'K kicks');
  await p.eval(park + '; step(1)'); await tap('KeyL'); await p.eval('step(2)'); check(await p.eval('game.f[0].state === "special" && game.f[0].mv === MOVES[game.f[0].d.id].sp[0]'), 'L fires special 1');
  await p.eval(park + '; step(1)');
  await p.key('KeyD', true); await tap('KeyL'); await p.eval('step(2)'); await p.key('KeyD', false);
  check(await p.eval('game.f[0].mv === MOVES[game.f[0].d.id].sp[1]'), 'forward + L fires special 2');
  await p.eval(park + '; step(1)');
  await p.key('KeyS', true); await tap('KeyL'); await p.eval('step(2)'); await p.key('KeyS', false);
  check(await p.eval('game.f[0].mv === MOVES[game.f[0].d.id].sp[2]'), 'down + L fires special 3');
  await p.eval(park + '; game.f[0].meter = 100; step(1)');
  await p.key('KeyJ', true); await p.key('KeyK', true); await p.eval('step(2)'); await p.key('KeyJ', false); await p.key('KeyK', false);
  check(await p.eval('game.f[0].state === "super" && game.f[0].meter === 0'), 'J + K fires the super with a full meter');
  // holding back against an incoming attack blocks
  await p.key('KeyA', true); // hold back first so the real-time loop cannot land the kick before the guard
  await p.eval("game.f[1].cpu = false; game.f[0].x = 400; game.f[0].y = GROUND; game.f[0].vy = 0; game.f[1].x = 470; game.f[1].y = GROUND; game.f[1].vy = 0; game.f[0].set('idle'); game.f[1].set('idle'); game.proj = []; game.hitstop = 0; game.slow = 0; game.delayed = []; game.f[0].face = 1; game.f[1].face = -1; step(1); game.f[1].set('kick'); step(12)");
  await p.eval('step(1)'); await p.key('KeyA', false);
  check(await p.eval('game.f[0].state') === 'block', 'holding back blocks an incoming kick');
  await p.shot(path.join(ROOT, 'tools', '.shot-fight.png'));

  // 1b. two-player select flow and the end screen's rematch / back-to-select keys
  await p.goto(URL_BASE); await p.wait(300); await tap('KeyS'); await tap('Enter');
  check(await p.eval('game.phase === "select" && game.mode === 2'), '2P mode select');
  await tap('ArrowRight'); await tap('Numpad1'); await tap('KeyJ'); await p.wait(50);
  check(await p.eval('game.phase') === 'vs', '2P picks start a match');
  await p.eval("game.phase = 'over'; game.wins = [2, 0]"); await tap('KeyR'); check(await p.eval('game.phase') === 'vs', 'R rematches');
  await p.eval("game.phase = 'over'"); await p.wait(60);
  check(await p.eval("!document.getElementById('share').hidden && document.getElementById('share').href.startsWith('https://x.com/intent/post?text=')"), 'share on X button shows on the end screen');
  await tap('Enter'); check(await p.eval('game.phase') === 'select', 'enter returns to select');
  check(await p.eval("document.getElementById('share').hidden"), 'share button hides off the end screen');

  // 2. full CPU vs CPU matches, fast-forwarded; each must end with a finisher window
  const N = await p.eval('ROSTER.length');
  const pairs = []; for (let i = 0; i < N; i++) pairs.push([i, (i + 3) % N]); pairs.push([N - 1, N - 1], [0, 2]);
  let sawFinish = 0, sawFinisher = 0;
  for (const [i, j] of pairs) {
    await p.goto(`${URL_BASE}#demo=${i},${j}&stop`); await p.wait(250);
    const r = await p.eval(`(() => { let n = 0, fin = false, fr = false; while (game.phase !== 'over' && n < 60000) { step(10); n += 10; if (game.phase === 'finish') fin = true; if (game.phase === 'finisher') fr = true; }
      return { phase: game.phase, ticks: n, wins: game.wins, round: game.round, sudden: game.sudden, fin, fr, arena: ARENAS[game.arena].name }; })()`);
    if (r.fin) sawFinish++; if (r.fr) sawFinisher++;
    check(r.phase === 'over', `match ${i} vs ${j} finishes in ${r.arena} (${r.ticks} ticks, wins ${r.wins}, rounds ${r.round}${r.sudden ? ', sudden death' : ''}${r.fr ? ', finisher' : ''})`);
    check(r.ticks < 60000 && r.round <= 5, `match ${i} vs ${j} ends in a sane number of rounds`);
  }
  check(sawFinish > 0, `FINISH IT window reached in ${sawFinish}/${pairs.length} matches (finisher performed in ${sawFinisher})`);
  await p.shot(path.join(ROOT, 'tools', '.shot-over.png'));

  // 3. every special, super and finisher of every fighter runs without throwing
  const r2 = await p.eval(`(() => { const out = []; for (let i = 0; i < ROSTER.length; i++) {
    game.sel = [i, (i + 1) % ROSTER.length]; startMatch(); startRound(); game.phase = 'fight';
    const [f, o] = game.f, M = MOVES[f.d.id]; f.cpu = false; o.cpu = false;
    for (const mv of [...M.sp, M.su]) { f.set('idle'); f.cool = 0; f.x = 360; o.x = 560; o.set('idle'); o.hp = o.d.hp; f.meter = 100; f.startMove(mv, mv === M.su ? 'super' : 'special', o); step(mv.len + 120); }
    o.hp = 1; game.wins = [1, 0]; f.set('idle'); o.set('idle'); o.inv = 0; o.takeHit(f, 50, 5, 20, 'hit'); const p1 = game.phase;
    startFinisher(f, o); const p2 = game.phase; let n = 0; while (game.phase !== 'over' && n < 3000) { step(10); n += 10; }
    out.push(f.d.id + ':' + p1 + '>' + p2 + '>' + game.phase); } return out; })()`);
  check(r2.length === N && r2.every(s => s.endsWith(':finish>finisher>over')), 'all specials, supers and finishers ran: ' + r2.join(' '));

  // 4. a finisher mid-way, the sheet debug view, the select screen and the title render
  await p.goto(`${URL_BASE}#demo=0,1&stop`); await p.wait(200);
  await p.eval(`(() => { const [f, o] = game.f; while (game.phase !== 'fight') step(1); f.cpu = o.cpu = false; o.hp = 1; game.wins = [1, 0]; o.takeHit(f, 50, 5, 20, 'hit'); step(30); startFinisher(f, o); step(Math.floor(MOVES[f.d.id].fin.len * 0.6)); })()`);
  await p.shot(path.join(ROOT, 'tools', '.shot-finisher.png'));
  await p.goto(`${URL_BASE}#demo=2,3&ff=140&stop`); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-vs.png'));
  await p.goto(URL_BASE + '#sheet=muse'); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-sheet.png'));
  await p.goto(URL_BASE + '#select'); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-select.png'));
  await p.goto(URL_BASE); await p.wait(200); await p.shot(path.join(ROOT, 'tools', '.shot-title.png'));

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}
