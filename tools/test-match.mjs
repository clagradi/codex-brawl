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

  // 5. ART REGRESSION (sprites.js and the drawing half of moves.js): sheet geometry, the dedicated throw / low jab / sweep poses,
  //    the thrown-victim tumble, plain frames everywhere else, and diving shots that lean into their dive
  await p.goto(`${URL_BASE}#demo=0,1&stop`); await p.wait(250);
  const art = await p.eval(`(() => {
    const bad = [], edge = g => { for (let x = 0; x < g.w; x++) if (g.c[x] || g.c[(g.h - 1) * g.w + x]) return true; for (let y = 0; y < g.h; y++) if (g.c[y * g.w] || g.c[y * g.w + g.w - 1]) return true; return false; };
    const under = g => { for (let y = FEET + 1; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.c[y * g.w + x]) return true; return false; };
    const bare = (n, fn) => { const orig = POSE[n]; POSE[n] = i => { const q = orig(i); q.fx = null; q.aura = 0; return q; }; try { return fn(); } finally { POSE[n] = orig; } };   // body only, no effects
    const strips = [...ANIMS.map(a => [a.n, a.f]), ...XROWS.map(n => [n, XFRAMES])];
    for (const id in LOOK) for (const [n, nf] of strips) for (let f = 0; f < nf; f++) {
      const tag = id + ' ' + n + '[' + f + ']';
      if (edge(renderFrame(id, n, f))) bad.push(tag + ' touches the cell edge');
      if (bare(n, () => under(renderFrame(id, n, f)))) bad.push(tag + ' dips below the ground line');
    }
    const reach = [];   // the drawn foot / fist at the hit tick stays near the attack box (loose: Dot's short legs are the extreme)
    for (const k of ['low', 'sweep', 'kickf']) { const A = ATK[k], n = XROWS[XPOSE[k][0]], f = frameFromTimeline(A.frames, A.hit);
      for (const id in LOOK) { const r = (bare(n, () => renderFrame(id, n, f)).bounds().x1 + 1 - FW / 2) * PX; if (r < A.box[1] - 36 || r > A.box[1] + 24) reach.push(id + ' ' + k + ' ' + r + 'px vs box ' + A.box[1]); } }
    const heads = Object.keys(LOOK).filter(id => { const h = HEADCANVAS[id]; if (!h) return true; const d = h.getContext('2d').getImageData(0, 0, h.width, h.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n < 500; });
    const xs = Object.keys(XSHEETS).map(id => XSHEETS[id].width + 'x' + XSHEETS[id].height);
    return { dims: [FW, FH, ANIMS.length, MAXF].join('x'), xs: [...new Set(xs)].join() + ' for ' + xs.length, rows: XROWS.join(), n: bad.length, bad: bad.slice(0, 5), reach, heads,
      farfur: FARFUR, wang: { lid: FACE.wang.lid, ry: FACE.wang.ry } };
  })()`);
  check(art.dims === '96x104x11x8', 'sprite cell stays 96x104 with 11 animation rows (the Codex pet atlas depends on it): ' + art.dims);
  check(art.rows === 'throw,low,sweep' && art.xs === '480x312 for 5', 'extra pose strips throw, low and sweep exist for all five fighters (' + art.xs + ')');
  check(art.n === 0, 'no sheet or pose frame touches the cell edge or dips below the ground line' + (art.n ? ': ' + art.bad.join('; ') : ''));
  check(art.reach.length === 0, 'drawn low jab, sweep and forward kick reach stays near their attack boxes' + (art.reach.length ? ': ' + art.reach.join('; ') : ''));
  check(art.heads.length === 0, 'every fighter has a filled portrait / head icon' + (art.heads.length ? ': ' + art.heads.join(' ') : ''));
  check(parseInt(art.farfur.slice(1, 3), 16) > parseInt(art.farfur.slice(5, 7), 16) + 20, 'plush far-side limbs shade towards warm rose, not cold violet (' + art.farfur + ')');
  check(art.wang.lid && art.wang.ry <= 2.6, 'Wang keeps calm narrow half-lidded eyes');
  const live = await p.eval(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 400; const g = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => g.getImageData(0, 0, 400, 400).data.slice();
    const ndiff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const snap = (q, anim, fr, off) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 400, 400); g.setTransform(1, 0, 0, 1, 200 - Math.round(q.x) - off, 300 - Math.round(q.y)); drawSprite(g, q.d.id, anim, fr, q.x + off, q.y, q.face); g.setTransform(1, 0, 0, 1, 0, 0); return grab(); };
    const view = q => { const [a, fr] = q.frame(); return [snap(q, a, fr, 0), snap(q, a, fr, 3), a + ':' + fr]; };   // 3px off its real spot matches no live fighter, so that one is the plain sheet frame
    game.sel = [0, 1]; startMatch(); startRound(); game.phase = 'fight'; game.banner = null;
    const [f, o] = game.f; f.cpu = o.cpu = false;
    const reset = dx => { game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0; for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.lie = 0; q.land = 0; } f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; };
    const out = { thrower: [], names: [], victim: [], steps: [], tum: [], atk: {} };
    reset(50); f.startThrow(o); let prev = null, prevV = null;
    for (const k of [3, 9, 15, 21, 26]) {
      for (let n = 0; f.st < k && n < 60; n++) step(1);
      const [a, b, name] = view(f); out.thrower.push(ndiff(a, b)); out.names.push(name); out.steps.push(prev ? ndiff(a, prev) : 99); prev = a;
      if (o.state === 'grabbed') { const [va, vb] = view(o); out.victim.push(ndiff(va, vb)); out.tum.push(prevV ? ndiff(va, prevV) : 99); prevV = va; }
    }
    reset(200); const cell = snap(f, 'punch', 2, 3); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 400, 400); g.imageSmoothingEnabled = false;
    g.drawImage(SHEETS[f.d.id], 2 * FW, ANIM_ROW.punch * FH, FW, FH, 200 - FW / 2 * PX, 300 - (FEET + 1) * PX, FW * PX, FH * PX); out.plain = ndiff(cell, grab());
    for (const k of ['low', 'sweep', 'kickf']) { reset(200); f.startAtk(k); step(ATK[k].hit); const [a, b, name] = view(f); out.atk[k] = [f.atk, ndiff(a, b), name]; }
    return out;
  })()`);
  check(live.names.slice(0, 4).every(s => s.startsWith('punch:')) && live.thrower.slice(0, 4).every(n => n > 60), 'a throwing fighter is drawn in its own throw pose, not the punch frame (' + live.thrower.join(',') + ' px differ)');
  check(live.steps.slice(1, 4).every(n => n > 20) && live.thrower[4] > 60, 'the throw pose changes from grab to lift to overhead to slam and release (' + live.steps.join(',') + ')');
  check(live.victim.length === 4 && live.victim.every(n => n > 60) && live.tum.slice(1).every(n => n > 20), 'the thrown foe tumbles over the thrower instead of showing one hit frame (' + live.victim.join(',') + ')');
  check(live.plain === 0, 'a sprite that matches no live fighter (menus, finishers) is exactly the plain sheet frame (' + live.plain + ' px differ)');
  check(['low', 'sweep', 'kickf'].every(k => live.atk[k][0] === k && live.atk[k][1] > 40), 'low jab, sweep and forward kick are drawn with their own low poses: ' + JSON.stringify(live.atk));
  const dive = await p.eval(`(() => {
    const out = {}, cv = document.createElement('canvas'); cv.width = cv.height = 400; const g = cv.getContext('2d', { willReadFrequently: true });
    const shot = (q, a) => { q.ang = a; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 400, 400); g.setTransform(1, 0, 0, 1, 200 - q.x, 200 - q.y); q.draw(g, q); g.setTransform(1, 0, 0, 1, 0, 0); return g.getImageData(0, 0, 400, 400).data.slice(); };
    for (let i = 0; i < ROSTER.length; i++) for (const face of [1, -1]) {
      game.sel = [i, (i + 1) % ROSTER.length]; startMatch(); startRound(); game.phase = 'fight'; game.banner = null;
      const [f, o] = game.f, mv = MOVES[f.d.id].sp[0]; f.cpu = o.cpu = false; game.proj = [];
      f.set('idle'); f.cool = 0; f.x = face > 0 ? 300 : 660; f.face = face; f.vx = 0; f.y = GROUND - 150; f.vy = -1; o.set('idle'); o.x = face > 0 ? 840 : 120;
      f.startMove(mv, 'special', o); step(mv.hit + 3);
      const q = game.proj.find(s => s.owner === f); let diff = 0;
      if (q && q.ang) { const ang = q.ang, a = shot(q, ang), b = shot(q, 0); q.ang = ang; for (let k = 3; k < a.length; k += 4) if (a[k] !== b[k]) diff++; }
      out[f.d.id + (face > 0 ? ' R' : ' L')] = q ? { air: f.airSp, ang: q.ang || 0, face, diff } : null;
    }
    return out;
  })()`);
  const tilts = Object.entries(dive).filter(([k]) => /^(tibo|dot|muse) /.test(k)), flat = Object.entries(dive).filter(([k]) => /^(poteto|wang) /.test(k));
  check(tilts.length === 6 && tilts.every(([, v]) => v && v.air && Math.sign(v.ang) === v.face && Math.abs(v.ang) > 0.3 && Math.abs(v.ang) < 1.5 && v.diff > 20), 'diving air specials of Tibo, Dot and Muse lean into the dive, both ways round: ' + JSON.stringify(tilts));
  check(flat.length === 4 && flat.every(([, v]) => v && v.ang === 0), "Wang's bubble and Poteto's lob keep their upright art: " + JSON.stringify(flat));

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}
