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

  // 1c. the new moves, driven with real key events (demo URL freezes the real-time loop, so only step() advances time)
  await p.goto(`${URL_BASE}#demo=0,1&stop`); await p.wait(250);
  await p.eval(`window.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    window.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return fn(); };
    window.setup = dx => { while (game.phase !== 'fight') step(1); const [f, o] = game.f; f.cpu = o.cpu = false; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; }
      f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o]; };`);
  const down = c => p.key(c, true), up = c => p.key(c, false);
  const chain = await p.eval(`(() => { const [f, o] = setup(50); T('KeyJ'); until(() => f.atk === 'punch' && f.contact, 30); T('KeyJ'); const a2 = until(() => f.atk === 'punch2', 20);
    until(() => f.atk === 'punch2' && f.contact, 30); T('KeyJ'); const a3 = until(() => f.atk === 'punch3', 20); const hit3 = until(() => f.combo >= 3, 40); return { a2, a3, hit3, launched: !o.onGround && o.vy < 0, dmg: o.hp < o.d.hp, combo: f.combo }; })()`);
  check(chain.a2 && chain.a3 && chain.hit3 && chain.dmg, 'P, P, P chains into the launcher and the third hit lands (combo ' + chain.combo + ')');
  check(chain.launched, 'the third punch launches the target into the air');
  const canc = await p.eval(`(() => { const [f, o] = setup(50); T('KeyJ'); until(() => f.atk === 'punch' && f.contact, 30); T('KeyL'); const sp = until(() => f.state === 'special', 12); return { sp, cancel: f.mv === MOVES[f.d.id].sp[0] }; })()`);
  check(canc.sp && canc.cancel, 'a landed punch cancels into a special');
  await down('KeyS');
  const sweep = await p.eval(`(() => { const [f, o] = setup(50); step(2); T('KeyK'); const d = until(() => o.state === 'down', 50); const hp = o.hp < o.d.hp; const lie = o.state === 'down' && o.inv > 0; const before = o.hp; o.takeHit(f, 20, 4, 14, 'punch'); const safe = o.hp === before;
    const up = until(() => o.state === 'idle', 90); return { d, hp, safe, lie, up, inv: o.inv > 0 }; })()`);
  await up('KeyS');
  check(sweep.d && sweep.hp, 'DOWN + K sweeps the foe into a knockdown');
  check(sweep.safe && sweep.up && sweep.inv, 'a knocked-down fighter cannot be juggled, gets up on its own and is briefly invulnerable');
  await down('KeyS');
  const jab = await p.eval(`(() => { const [f, o] = setup(50); step(2); T('KeyJ'); step(2); return f.atk === 'low' && f.state === 'punch'; })()`);
  await up('KeyS');
  check(jab, 'DOWN + P throws a low jab');
  await down('KeyW'); await p.eval(`(() => { const [f, o] = setup(300); step(1); })()`); await p.eval('step(8)'); await up('KeyW');
  const air = await p.eval(`(() => { const [f, o] = game.f; const up = until(() => !f.onGround && f.st > 4 && f.vy > -6, 40); T('KeyK'); step(2); const k = f.atk === 'airk' && f.state === 'kick'; until(() => f.onGround, 60); return { up, k, landed: f.state === 'idle' }; })()`);
  check(air.up && air.k, 'K while jumping throws an air kick');
  check(air.landed, 'landing cancels the air attack');
  await down('KeyW'); await p.eval(`(() => { const [f, o] = setup(300); step(1); })()`); await p.eval('step(8)'); await up('KeyW');
  const asp = await p.eval(`(() => { const [f, o] = game.f; until(() => !f.onGround && f.st > 4 && f.y < GROUND - 30, 40); T('KeyL'); step(2); const ok = f.state === 'special' && f.airSp && f.mv === MOVES[f.d.id].sp[0]; step(f.mv.hit + 3); const q = game.proj[0], y0 = q && q.y; step(3); const shot = !!q && q.y > y0 + 6; return { ok, shot }; })()`);   // the shot drops while it flies
  check(asp.ok && asp.shot, 'L while jumping fires the air special downwards');
  await down('KeyD');
  const thr = await p.eval(`(() => { const [f, o] = setup(50); step(2); T('KeyJ'); const g = until(() => o.state === 'grabbed', 4); const d = until(() => o.state === 'down', 60); return { g, d, hp: o.d.hp - o.hp, behind: o.x < f.x }; })()`);
  await up('KeyD');
  check(thr.g && thr.d && thr.hp >= 10, 'FWD + P throws a close foe (' + Math.round(thr.hp) + ' damage, knockdown)');
  check(thr.behind, 'the thrown foe lands behind the thrower');
  await down('KeyD');
  const tech = await p.eval(`(() => { const [f, o] = setup(50); step(2); T('KeyJ'); until(() => o.state === 'grabbed', 4); step(2); T('Numpad1'); step(2); return { idle: o.state === 'idle' && f.state === 'idle', hp: o.hp === o.d.hp }; })()`);
  await up('KeyD');
  check(tech.idle && tech.hp, 'pressing P within 6 ticks techs the throw');
  const far = await p.eval(`(() => { const [f, o] = setup(50); o.x = 560; step(1); f.x = 300; return 1; })()`);
  await down('KeyD'); await p.eval('step(2)'); await up('KeyD'); await p.eval('step(2)'); await down('KeyD'); await p.eval('step(3)');
  const dash = await p.eval(`(() => { const [f, o] = game.f; return { s: f.state, back: f.dashBack, x: f.x }; })()`); await up('KeyD');
  check(dash.s === 'dash' && !dash.back && dash.x > 305, 'double-tap forward starts a dash');
  await p.eval(`(() => { const [f, o] = setup(150); return 1; })()`);
  await down('KeyA'); await p.eval('step(2)'); await up('KeyA'); await p.eval('step(2)'); await down('KeyA'); await p.eval('step(3)');
  const bdash = await p.eval(`(() => { const [f, o] = game.f; return { s: f.state, back: f.dashBack, inv: f.inv, x: f.x }; })()`); await up('KeyA');
  check(bdash.s === 'dash' && bdash.back && bdash.inv > 0 && bdash.x < 300, 'double-tap back is a backdash with invulnerable frames');
  const rows = await p.eval(`(() => { const out = []; for (const r of ROSTER) for (const s of [0, 1]) for (const cpu of [false, true]) { const n = moveRows(r.id, s, cpu).length; if (n > 10 || !MOVES[r.id].air.name) out.push(r.id + ':' + n); } return out; })()`);
  check(rows.length === 0, 'move lists stay within 10 rows and every fighter has an air special name' + (rows.length ? ': ' + rows.join(' ') : ''));
  await p.eval(`(() => { game.phase = 'pause'; })()`); await p.wait(80); await p.shot(path.join(ROOT, 'tools', '.shot-pause2.png'));

  // 2. full CPU vs CPU matches, fast-forwarded; each must end with a finisher window
  const N = await p.eval('ROSTER.length');
  const pairs = []; for (let i = 0; i < N; i++) pairs.push([i, (i + 3) % N]); pairs.push([N - 1, N - 1], [0, 2]);
  let sawFinish = 0, sawFinisher = 0; const use = {};
  for (const [i, j] of pairs) {
    await p.goto(`${URL_BASE}#demo=${i},${j}&stop`); await p.wait(250);
    const r = await p.eval(`(() => { window.__use = {}; const bump = k => { __use[k] = (__use[k] || 0) + 1; }, sa = Fighter.prototype.startAtk, st = Fighter.prototype.startThrow, sm = Fighter.prototype.startMove;
      Fighter.prototype.startAtk = function (k) { bump(k); return sa.call(this, k); }; Fighter.prototype.startThrow = function (o) { bump('throw'); return st.call(this, o); }; Fighter.prototype.startMove = function (mv, kind, o) { if (kind === 'special' && this.airSp) bump('airsp'); return sm.call(this, mv, kind, o); };
      let n = 0, fin = false, fr = false; while (game.phase !== 'over' && n < 60000) { step(10); n += 10; if (game.phase === 'finish') fin = true; if (game.phase === 'finisher') fr = true; }
      return { phase: game.phase, ticks: n, wins: game.wins, round: game.round, sudden: game.sudden, fin, fr, arena: ARENAS[game.arena].name }; })()`);
    for (const [k, v] of Object.entries(await p.eval('__use'))) use[k] = (use[k] || 0) + v;
    if (r.fin) sawFinish++; if (r.fr) sawFinisher++;
    check(r.phase === 'over', `match ${i} vs ${j} finishes in ${r.arena} (${r.ticks} ticks, wins ${r.wins}, rounds ${r.round}${r.sudden ? ', sudden death' : ''}${r.fr ? ', finisher' : ''})`);
    check(r.ticks < 60000 && r.round <= 5, `match ${i} vs ${j} ends in a sane number of rounds`);
  }
  check(use.punch2 > 0 && ['sweep', 'airk', 'throw'].every(k => use[k] > 0), 'CPUs use chains, sweeps, air kicks and throws: ' + JSON.stringify(use));
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

  // 5. ENGINE block: regression checks from the gameplay-engine hunt (round ends, shots, pause, input, throws, gamepads).
  //    Every scenario runs on the frozen demo page (only step() advances time) with a seeded Math.random, so each result is deterministic.
  //    Checks tagged (fix) pin down a bug the hunt found and fixed; the others guard behaviour the hunt verified.
  const ENG = `
    window.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    window.D = c => dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    window.U = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    window.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return fn(); };
    window.fresh = (i, j, K) => { Math.random = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(11);
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = K || 0; startMatch(); until(() => game.phase === 'fight', 900); const [a, b] = game.f; a.cpu = b.cpu = false; return [a, b]; };
    window.place = (dx, ax) => { const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; }
      f.x = ax || 300; o.x = f.x + dx; f.face = 1; o.face = -1; step(1); return [f, o]; };
    window.expire = () => { game.timer = 1; game.clock = 59; };
    window.mvOf = (f, name) => [...MOVES[f.d.id].sp, MOVES[f.d.id].su].find(m => m.name === name);
    window.snap = () => { const [a, b] = game.f; return { phase: game.phase, banner: game.banner && game.banner.txt, wins: game.wins.slice(), round: game.round, a: a.state, b: b.state, proj: game.proj.length }; };`;
  const enginePage = async () => { await p.goto(`${URL_BASE}#demo=0,1&stop`); await p.wait(200); await p.eval(ENG); };
  const eng = async (name, code, pred) => {
    let r, err = ''; try { r = await p.eval(code); } catch (e) { err = ' threw ' + e.message.slice(0, 160); }
    let good = false; try { good = !err && !!pred(r); } catch (e) { err = ' predicate threw ' + e.message; }
    check(good, 'engine: ' + name + (good ? '' : err || ' ' + JSON.stringify(r)));
  };
  const eq = (r, o) => Object.entries(o).every(([k, v]) => JSON.stringify(r[k]) === JSON.stringify(v));
  await enginePage();

  // 5a. walls and throws
  await eng('(fix) a fighter pinned at a wall stays inside the arena and the foe takes the push', `(() => { const out = []; for (const side of [1, -1]) { const [a, b] = fresh(0, 1); place(10, 300); a.x = side > 0 ? 46 : W - 46; b.x = a.x + side * 10; let bad = 0; for (let i = 0; i < 30; i++) { step(1); for (const f of [a, b]) if (f.x < 45.99 || f.x > W - 45.99) bad++; } out.push({ side, bad, gap: Math.abs(a.x - b.x) }); } return out; })()`,
    r => r.length === 2 && r.every(x => x.bad === 0 && x.gap >= 55.9));
  await eng('(fix) a foe lifted by a thrower standing at either wall stays inside the arena', `(() => { const out = []; for (const side of [1, -1]) { const [a, b] = fresh(0, 1); place(50); a.x = side > 0 ? 46 : W - 46; b.x = a.x + side * 50; step(1); D(side > 0 ? 'KeyD' : 'KeyA'); step(1); T('KeyJ'); let lo = 9999, hi = -9999, g = false; for (let i = 0; i < 40; i++) { step(1); if (b.state === 'grabbed') g = true; lo = Math.min(lo, b.x); hi = Math.max(hi, b.x); } U('KeyD'); U('KeyA'); out.push({ side, g, ok: lo >= 45.99 && hi <= W - 45.99, lo, hi }); } return out; })()`,
    r => r.length === 2 && r.every(x => x.g && x.ok));

  // 5b. the bell: time-out, draw, sudden death, and what is still in the air or mid-move when it rings
  await eng('time-out: the higher hp wins the round and the next one starts clean', `(() => { const [a, b] = fresh(0, 1); place(200); b.hp = b.d.hp * 0.5; expire(); step(1); const r = snap(); until(() => game.phase === 'intro', 600); r.next = { phase: game.phase, round: game.round, full: a.hp === a.d.hp && b.hp === b.d.hp, st: a.state + '/' + b.state, timer: game.timer }; return r; })()`,
    r => eq(r, { phase: 'ko', banner: 'TIME', wins: [1, 0], a: 'win', b: 'ko', proj: 0 }) && r.next.round === 2 && r.next.full && r.next.st === 'idle/idle' && r.next.timer === 99);
  await eng('time-out: equal hp is a draw that scores for nobody', `(() => { const [a, b] = fresh(0, 1); place(200); expire(); step(1); const r = snap(); until(() => game.phase === 'intro', 600); r.next = { round: game.round }; return r; })()`,
    r => eq(r, { phase: 'ko', banner: 'DRAW', wins: [0, 0] }) && r.next.round === 2);
  await eng('time-out: sudden death goes to the higher meter, then to P1, and never draws', `(() => { const sd = (i, j, set) => { const [a, b] = fresh(i, j); game.round = 4; game.sudden = true; startRound(); until(() => game.phase === 'fight', 400); place(200); set(a, b); expire(); step(1); return snap(); };
    return { meter: sd(0, 1, (a, b) => { a.meter = 10; b.meter = 40; }), tie: sd(0, 1, (a, b) => { a.meter = b.meter = 30; }), flat: sd(2, 4, () => {}) }; })()`,
    r => eq(r.meter, { phase: 'ko', banner: 'TIME', wins: [0, 1] }) && eq(r.tie, { phase: 'ko', banner: 'TIME', wins: [1, 0] }) && r.flat.banner === 'TIME' && r.flat.wins[0] + r.flat.wins[1] === 1);
  await eng('time-out: at match point the outro leads straight to the end screen, no finisher', `(() => { const [a, b] = fresh(0, 1); place(200); game.wins = [1, 0]; b.hp = 10; expire(); step(1); const seen = {}; let n = 0; while (game.phase !== 'over' && n++ < 1200) { step(1); seen[game.phase] = 1; } return { seen: Object.keys(seen), wins: game.wins.slice(), phase: game.phase }; })()`,
    r => r.phase === 'over' && !r.seen.includes('finish') && !r.seen.includes('finisher') && r.wins[0] === 2);
  await eng('(fix) time-out: a shot in flight is cleared at the bell, for every fighter', `(() => { const out = []; for (let i = 0; i < ROSTER.length; i++) { const [a, b] = fresh(i, (i + 1) % ROSTER.length); place(420); let got = null; for (const mv of MOVES[a.d.id].sp) { a.set('idle'); a.cool = 0; game.proj = []; a.startMove(mv, 'special', b); if (until(() => game.proj.length > 0, mv.len + 20)) { got = mv.name; break; } } expire(); step(1); const at = game.proj.length; step(8); out.push({ id: a.d.id, got, at, later: game.proj.length, ph: game.phase }); } return out; })()`,
    r => r.length === 5 && r.filter(x => x.got).length >= 3 && r.every(x => x.ph === 'ko' && x.at === 0 && x.later === 0));
  await eng('(fix) time-out: a special still running at the bell fires no shot afterwards', `(() => { const [a, b] = fresh(0, 1); place(420); a.startMove(MOVES[a.d.id].sp[0], 'special', b); step(a.mv.hit - 3); const before = game.proj.length; expire(); step(1); const ph = game.phase; let max = 0, still = false; for (let i = 0; i < 160; i++) { step(1); max = Math.max(max, game.proj.length); if (a.state === 'special') still = true; } return { before, ph, max, still }; })()`,
    r => r.before === 0 && r.ph === 'ko' && r.still && r.max === 0);
  await eng('time-out: a vanished Dot is back in sight when the round is called', `(() => { const [a, b] = fresh(2, 0); place(200); a.startMove(mvOf(a, 'POP IN'), 'special', b); const hid = until(() => a.hidden, 40); b.hp = b.d.hp * 0.5; expire(); step(2); return { hid, hidden: a.hidden, phase: game.phase, wins: game.wins.slice() }; })()`,
    r => r.hid && !r.hidden && r.phase === 'ko' && r.wins[0] === 1);
  await eng('time-out: the bell hands Muse her own takeHit back from the UNDO stance', `(() => { const [a, b] = fresh(4, 0); place(200); a.startMove(mvOf(a, 'UNDO'), 'special', b); const own = Object.prototype.hasOwnProperty.call(a, 'takeHit'); step(3); expire(); step(3); return { own, after: Object.prototype.hasOwnProperty.call(a, 'takeHit'), phase: game.phase }; })()`,
    r => r.own && !r.after && r.phase === 'ko');
  await eng('time-out: a thrower who leads wins mid-throw and the victim ends up lying down', `(() => { const [a, b] = fresh(0, 1); place(50); b.hp = b.d.hp * 0.5; D('KeyD'); step(1); T('KeyJ'); const g = until(() => b.state === 'grabbed', 6); step(8); U('KeyD'); expire(); step(1); const r = snap(); step(80); r.g = g; r.onFloor = b.y === GROUND; r.bs = b.state; return r; })()`,
    r => r.g && r.a === 'win' && r.b === 'ko' && r.onFloor && r.bs === 'ko');
  await eng('time-out: a draw mid-throw does not strand the victim in the air', `(() => { const [a, b] = fresh(0, 1); place(50); D('KeyD'); step(1); T('KeyJ'); const g = until(() => b.state === 'grabbed', 6); step(8); U('KeyD'); expire(); step(1); step(60); return { g, a: a.state, b: b.state, hp: b.hp === b.d.hp }; })()`,
    r => r.g && r.b !== 'grabbed' && r.a !== 'throw' && r.hp);

  // 5c. the KO and the finisher: nothing swings or shoots on a stale button press
  await eng('(fix) ko: the winner mid-special fires no shot after the KO', `(() => { const [a, b] = fresh(0, 1); place(400); a.startMove(MOVES[a.d.id].sp[0], 'special', b); step(a.mv.hit - 3); const before = game.proj.length; b.hp = 1; b.takeHit(a, 30, 2, 10, 'punch'); const ph = game.phase; let max = 0, still = false; for (let i = 0; i < 160; i++) { step(1); max = Math.max(max, game.proj.length); if (a.state === 'special') still = true; } return { before, ph, max, still }; })()`,
    r => r.before === 0 && r.ph === 'ko' && r.still && r.max === 0);
  await eng('(fix) ko: a punch, kick or special buffered before the KO does not swing after it', `(() => { const [a, b] = fresh(0, 1); place(60); b.hp = 1; b.takeHit(a, 30, 2, 10, 'punch'); a.bufP = 10; a.bufK = 10; a.bufS = 8; a.set('idle'); let swung = false; for (let i = 0; i < 40; i++) { step(1); if (['punch', 'kick', 'special', 'super', 'throw'].includes(a.state)) swung = true; } return { swung, shots: game.proj.length }; })()`,
    r => !r.swung && r.shots === 0);
  await eng('(fix) finish: a press buffered on the finisher tick does not fire once the finisher is over', `(() => { const [a, b] = fresh(0, 1); place(100); game.wins = [1, 0]; b.hp = 1; b.takeHit(a, 30, 2, 10, 'punch'); const f = game.phase; until(() => game.phaseT > 20, 30); D('KeyL'); D('KeyI'); step(2); U('KeyL'); U('KeyI'); const ph = game.phase; let n = 0; while (game.phase !== 'ko' && n++ < 600) step(1); const reached = game.phase; let max = 0, swung = false; for (let i = 0; i < 90; i++) { step(1); max = Math.max(max, game.proj.length); if (a.state === 'special' || a.state === 'punch') swung = true; } return { f, ph, reached, max, swung }; })()`,
    r => r.f === 'finish' && r.ph === 'finisher' && r.reached === 'ko' && r.max === 0 && !r.swung);
  await eng('a button pressed during the KO does not leak into the next round', `(() => { const [a, b] = fresh(0, 1); place(300); b.hp = 1; a.hp = a.d.hp; game.wins = [0, 0]; b.takeHit(a, 50, 2, 10, 'punch'); T('KeyJ'); T('KeyK'); T('KeyL'); until(() => game.phase === 'fight' && game.round === 2, 900); step(3); return { ph: game.phase, a: a.state, bufs: [a.bufP, a.bufK, a.bufS] }; })()`,
    r => r.ph === 'fight' && r.a === 'idle' && r.bufs.every(v => v === 0));
  await eng('every finisher on every opponent (25 pairs) plays out and reaches the end screen cleanly', `(() => { const bad = [];
    for (let i = 0; i < ROSTER.length; i++) for (let j = 0; j < ROSTER.length; j++) {
      const tag = ROSTER[i].id + '>' + ROSTER[j].id, seen = {}; const [a, b] = fresh(i, j, (i * 5 + j) % ARENAS.length); place(110); game.wins = [1, 0]; b.hp = 1; b.takeHit(a, 30, 2, 10, 'punch');
      if (game.phase !== 'finish') { bad.push(tag + ' no finish window'); continue; }
      until(() => game.phaseT > 20, 60); D('KeyI'); step(4); U('KeyI');
      let n = 0, why = ''; while (game.phase !== 'over' && n++ < 2400) { step(1); seen[game.phase] = 1; if (game.proj.length) why = why || 'shot alive in ' + game.phase; for (const f of game.f) for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'meter']) if (!Number.isFinite(f[k])) why = why || f.d.id + '.' + k + ' not finite'; }
      if (game.phase !== 'over') why = why || 'never reached the end screen'; else if (!seen.finisher) why = why || 'no finisher'; else if (a.hidden || game.dark) why = why || (a.hidden ? 'winner still hidden' : 'dark ' + game.dark + ' left over');
      if (why) bad.push(tag + ' ' + why); }
    return bad; })()`, r => r.length === 0);

  // 5d. pause and unpause in the middle of everything
  await eng('pause: mid punch freezes the move and resumes it', `(() => { const [a, b] = fresh(0, 1); place(50); T('KeyJ'); step(3); const s0 = [a.state, a.st, a.t]; T('KeyP'); step(1); const ph1 = game.phase; step(120); const s1 = [a.state, a.st, a.t]; T('KeyP'); step(1); const ph2 = game.phase; until(() => a.state === 'idle', 40); return { s0, s1, ph1, ph2, hit: b.hp < b.d.hp }; })()`,
    r => r.ph1 === 'pause' && r.ph2 === 'fight' && r.s1[1] === r.s0[1] && r.s1[2] === r.s0[2] && r.hit);
  await eng('pause: mid throw freezes both fighters and the throw still lands', `(() => { const [a, b] = fresh(0, 1); place(50); D('KeyD'); step(1); T('KeyJ'); until(() => b.state === 'grabbed', 6); step(6); U('KeyD'); const st = a.st; T('KeyP'); step(1); step(100); const frozen = a.st === st && a.state === 'throw' && b.state === 'grabbed'; T('KeyP'); step(1); const d = until(() => b.state === 'down', 60); return { frozen, d, hp: b.d.hp - b.hp }; })()`,
    r => r.frozen && r.d && r.hp >= 10);
  await eng('pause: mid knockdown keeps the lie timer and the getup works', `(() => { const [a, b] = fresh(0, 1); place(50); D('KeyS'); step(2); T('KeyK'); until(() => b.state === 'down', 60); step(6); U('KeyS'); const lie = b.lie, st = b.st; T('KeyP'); step(1); step(100); const same = b.lie === lie && b.st === st && b.state === 'down'; T('KeyP'); step(1); const up = until(() => b.state === 'idle', 120); return { same, up }; })()`,
    r => r.same && r.up);
  await eng('pause: Dot stays vanished through the pause and then reappears', `(() => { const [a, b] = fresh(2, 0); place(200); a.startMove(mvOf(a, 'POP IN'), 'special', b); until(() => a.hidden, 40); step(2); T('KeyP'); step(1); const ph = game.phase; step(150); const still = a.hidden && a.state === 'special'; T('KeyP'); step(1); const back = until(() => !a.hidden, 60); const done = until(() => a.state === 'idle', 80); return { ph, still, back, done, hidden: a.hidden }; })()`,
    r => r.ph === 'pause' && r.still && r.back && r.done && !r.hidden);
  await eng('pause: Muse keeps her UNDO stance through the pause and still gives it back', `(() => { const [a, b] = fresh(4, 0); place(200); a.startMove(mvOf(a, 'UNDO'), 'special', b); step(4); T('KeyP'); step(1); step(100); const own = Object.prototype.hasOwnProperty.call(a, 'takeHit'); T('KeyP'); step(1); until(() => a.state === 'idle', 80); step(2); return { own, after: Object.prototype.hasOwnProperty.call(a, 'takeHit'), state: a.state }; })()`,
    r => r.own && !r.after && r.state === 'idle');
  await eng('pause: an air special survives the pause and still fires its shot', `(() => { const [a, b] = fresh(0, 1); place(300); D('KeyW'); step(1); U('KeyW'); until(() => a.y < GROUND - 60 && a.vy > -6, 40); T('KeyL'); step(2); const sp = a.state === 'special' && a.airSp; T('KeyP'); step(1); step(100); const frz = a.state === 'special'; T('KeyP'); step(1); step(a.mv.hit + 3); return { sp, frz, proj: game.proj.length }; })()`,
    r => r.sp && r.frz && r.proj >= 1);
  await eng('pause: mid super ends cleanly and the screen darkening is lifted', `(() => { const [a, b] = fresh(0, 1); place(150); a.meter = 100; T('KeyI'); step(14); const s = a.state; T('KeyP'); step(1); step(100); T('KeyP'); step(1); until(() => a.state === 'idle', 200); return { s, end: a.state, dark: game.dark }; })()`,
    r => r.s === 'super' && r.end === 'idle' && r.dark === 0);
  await eng('pause: losing window focus pauses and drops held keys', `(() => { const [a, b] = fresh(0, 1); place(300); D('KeyD'); step(3); dispatchEvent(new Event('blur')); step(1); const ph = game.phase; const held = keys.KeyD; T('KeyP'); step(1); const x0 = a.x; step(10); return { ph, held: !!held, moved: a.x - x0, ph2: game.phase }; })()`,
    r => r.ph === 'pause' && !r.held && r.moved === 0 && r.ph2 === 'fight');
  await eng('pause: P does nothing outside the fight', `(() => { const [a, b] = fresh(0, 1); game.phase = 'ko'; game.phaseT = 0; T('KeyP'); step(1); const p1 = game.phase; startRound(); T('KeyP'); step(1); return { p1, p2: game.phase }; })()`,
    r => r.p1 === 'ko' && r.p2 === 'intro');

  // 5e. input edge cases and simultaneous events
  await eng('input: left and right held together cancel out', `(() => { const [a, b] = fresh(0, 1); place(300); D('KeyA'); D('KeyD'); const x0 = a.x; step(20); const x1 = a.x; U('KeyD'); step(10); const x2 = a.x; U('KeyA'); return { moved: x1 - x0, after: x2 - x1 }; })()`,
    r => Math.abs(r.moved) < 0.01 && r.after < -1);
  await eng('input: a dash cannot be started out of hitstun', `(() => { const [a, b] = fresh(0, 1); place(300); a.takeHit(b, 5, 2, 20, 'punch'); const x0 = a.x; T('KeyD'); step(2); T('KeyD'); step(2); return { s: a.state, dx: a.x - x0 }; })()`,
    r => r.s === 'hurt' && Math.abs(r.dx) < 12);
  await eng('input: the super is refused mid-throw and while being thrown', `(() => { const [a, b] = fresh(0, 1); place(50); a.meter = b.meter = 100; D('KeyD'); step(1); T('KeyJ'); until(() => b.state === 'grabbed', 6); T('KeyI'); T('Numpad0'); step(2); const r = { a: a.state, am: a.meter, b: b.state, bm: b.meter }; U('KeyD'); return r; })()`,
    r => r.a === 'throw' && r.am === 100 && r.b === 'grabbed' && r.bm === 100);
  await eng('input: an air special just above the floor ends cleanly on the ground', `(() => { const [a, b] = fresh(0, 1); place(380); a.set('jump'); a.st = 10; a.y = GROUND - 30; a.vy = 6; T('KeyL'); step(1); const air = a.state === 'special' && a.airSp; const idle = until(() => a.state === 'idle' && a.onGround, 160); return { air, idle, onFloor: a.y === GROUND }; })()`,
    r => r.air && r.idle && r.onFloor);
  await eng('trade: both punches landing on the same tick (1 hp each) leave exactly one winner', `(() => { const [a, b] = fresh(0, 1); place(50); a.hp = b.hp = 1; a.startAtk('punch'); b.startAtk('punch'); until(() => game.phase !== 'fight', 40); return { ph: game.phase, wins: game.wins.slice() }; })()`,
    r => r.ph !== 'fight' && r.wins[0] + r.wins[1] === 1);
  await eng('trade: both supers on the same tick resolve and the dark screen clears', `(() => { const [a, b] = fresh(0, 3); place(160); a.meter = b.meter = 100; T('KeyI'); T('Numpad0'); step(2); const s0 = [a.state, b.state]; until(() => game.dark === 0 && a.state !== 'super' && b.state !== 'super', 600); return { s0, st: [a.state, b.state], dark: game.dark, hp: [a.hp, b.hp] }; })()`,
    r => r.s0.every(s => s === 'super') && r.st.every(s => s !== 'super') && r.dark === 0 && r.hp.every(h => h >= 0));
  await eng('2P: both humans fight with their own keys', `(() => { const [a, b] = fresh(0, 1); place(60); T('KeyJ'); T('Numpad1'); step(3); const s = [a.state, b.state]; step(30); return { s, hurt: [a.hp < a.d.hp, b.hp < b.d.hp], cpu: [a.cpu, b.cpu] }; })()`,
    r => r.s[0] === 'punch' && r.s[1] === 'punch' && (r.hurt[0] || r.hurt[1]) && !r.cpu[0] && !r.cpu[1]);
  await eng('(fix) hit: a normal passes through a vanished Dot but hits the same Dot in sight', `(() => { const [a, b] = fresh(2, 0); place(60); b.startAtk('punch'); const hp0 = a.hp; until(() => b.state === 'idle', 40); const control = a.hp < hp0;
    place(60); a.cool = 0; a.startMove(mvOf(a, 'POP IN'), 'special', b); const hid = until(() => a.hidden, 40); const hp = a.hp; b.cool = 0; b.set('idle'); b.startAtk('punch'); let mid = false; for (let i = 0; i < 12; i++) { step(1); if (a.hidden) mid = true; } return { control, hid, mid, hurt: a.hp < hp }; })()`,
    r => r.control && r.hid && r.mid && !r.hurt);

  // 5f. gamepads (the stub replaces navigator.getGamepads, so each case gets a fresh page)
  const PAD = (axes, btn) => `({ axes: [${axes}], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: [${btn}].includes(i) })) })`;
  const padCases = [
    ['pad: the stick drives player one and stops when released', `(() => { const [a, b] = fresh(0, 1); place(400); let pads = [${PAD('0.9,0', '')}]; navigator.getGamepads = () => pads; const x0 = a.x; step(10); const moved = a.x - x0; pads = [${PAD('0,0', '')}]; step(3); const x1 = a.x; step(10); return { moved, stopped: a.x - x1 }; })()`,
      r => r.moved > 5 && Math.abs(r.stopped) < 0.5],
    ['(fix) pad: unplugging a pad mid-hold does not leave its key stuck down', `(() => { const [a, b] = fresh(0, 1); place(400); let pads = [${PAD('0.9,0', '')}]; navigator.getGamepads = () => pads; step(5); pads = []; step(3); const x1 = a.x; step(20); return { drift: a.x - x1, held: !!keys.KeyD }; })()`,
      r => Math.abs(r.drift) < 0.5 && !r.held],
    ['pad: the second pad drives player two and Start pauses and resumes', `(() => { const [a, b] = fresh(0, 1); place(400); let pads = [${PAD('0,0', '')}, ${PAD('-0.9,0', '')}]; navigator.getGamepads = () => pads; const x0 = b.x; step(10); const moved = b.x - x0; pads = [${PAD('0,0', '9')}, ${PAD('0,0', '')}]; step(1); const ph = game.phase; pads = [${PAD('0,0', '')}, ${PAD('0,0', '')}]; step(2); pads = [${PAD('0,0', '9')}, ${PAD('0,0', '')}]; step(1); return { moved, ph, ph2: game.phase }; })()`,
      r => r.moved < -5 && r.ph === 'pause' && r.ph2 === 'fight'],
    ['pad: a lone pad in slot 1 is taken as player one', `(() => { const [a, b] = fresh(0, 1); place(400); navigator.getGamepads = () => [null, ${PAD('0.9,0', '')}]; const x0 = a.x; step(10); return { moved: a.x - x0 }; })()`,
      r => r.moved > 5],
    ['pad: one button press is one punch', `(() => { const [a, b] = fresh(0, 1); place(300); let pads = [${PAD('0,0', '0')}]; navigator.getGamepads = () => pads; step(1); const s = a.state; pads = [${PAD('0,0', '')}]; step(1); return { s }; })()`,
      r => r.s === 'punch'],
    ['(fix) pad: a stick still held after a window-blur pause keeps driving the fighter', `(() => { const [a, b] = fresh(0, 1); place(400); let pads = [${PAD('0.9,0', '')}]; navigator.getGamepads = () => pads; step(5); dispatchEvent(new Event('blur')); step(1); const ph = game.phase; T('KeyP'); step(1); const x0 = a.x; step(12); return { ph, moved: a.x - x0, ph2: game.phase }; })()`,
      r => r.ph === 'pause' && r.ph2 === 'fight' && r.moved > 5],
  ];
  for (const [name, code, pred] of padCases) { await enginePage(); await eng(name, code, pred); }

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}
