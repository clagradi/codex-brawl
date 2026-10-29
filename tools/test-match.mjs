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

  // audio: music is audible, starts with the first gesture, follows the arena and can be muted; effects stay above it without clipping
  // (regression: the live site played no music in Safari: it sat ~25 dB under the effects and the announcer, and a suspended context was never resumed)
  const until = async (js, ms = 1000) => { for (let t = 0; t <= ms; t += 50) { if (await p.eval(js)) return true; await p.wait(50); } return false; };
  const dB = x => 20 * Math.log10(Math.max(x, 1e-9));
  const spy = "window.__ui = []; { const u = uiText; uiText = (s, ...a) => { __ui.push(String(s)); return u(s, ...a); }; }";   // records the HUD strings drawn from now on
  const shown = async re => { await p.eval('__ui.length = 0'); await p.wait(120); return p.eval('__ui.some(s => ' + re + '.test(s))'); };
  await p.goto(URL_BASE); await p.wait(400); await p.eval(spy);
  check(await p.eval('AC === null && MUSIC.now === null && MUSIC.theme === "title"'), 'audio: nothing plays before the first gesture');
  check(await shown('/FOR SOUND/'), 'audio: the title asks for a key press or tap while the context is not running');
  await tap('KeyS');   // first key press on the title (also moves the menu cursor)
  check(await until('MUSIC.now === "title"', 1000) && await p.eval('MUSIC.err == null && AC.state === "running"'), 'audio: the first key on the title starts the title music within 1 s');
  check(!await shown('/FOR SOUND/'), 'audio: the sound hint is gone once the context runs');
  const live = await p.eval(`new Promise(res => { const m = MUSIC.master, an = AC.createAnalyser(), buf = new Float32Array(2048); an.fftSize = 2048; m.connect(an); let ss = 0, n = 0;
    const iv = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) { ss += v * v; n++; } }, 25); setTimeout(() => { clearInterval(iv); m.disconnect(an); res(Math.sqrt(ss / n)); }, 3000); })`);
  check(dB(live) > -23 && dB(live) < -11, `audio: the live title music measures ${dB(live).toFixed(1)} dBFS RMS (expected about -17)`);
  await tap('KeyM'); check(await until('MUSIC.now === null', 600), 'audio: M mutes the music on the title');
  await tap('KeyM'); check(await until('MUSIC.now === "title"', 1000), 'audio: M again brings it back');
  check(await p.eval('AC.suspend().then(() => AC.state)') === 'suspended' && await until('MUSIC.now === null', 600), 'audio: a suspended context silences the music');
  await tap('KeyW'); check(await until('AC.state === "running" && MUSIC.now === "title"', 2000), 'audio: a suspended context is resumed (by the next gesture or by the music clock) and the music returns');
  for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) { // Safari / iOS only accept some of these as an unlock: every one must start the audio
    await p.goto(URL_BASE); await p.wait(150);
    const was = await p.eval('AC === null'); await p.eval(`dispatchEvent(new Event('${ev}'))`);
    check(was && await p.eval('!!AC && AC.state === "running"'), `audio: a ${ev} event creates and starts the context`);
  }
  await p.goto(`${URL_BASE}#demo=0,1&arena=2&stop`); await p.wait(300); await p.eval(spy);
  await tap('KeyH');   // a gesture inside the demo
  check(await until('MUSIC.now === "vs"', 1000), 'audio: the versus screen plays its own jingle');
  await stepUntil('fight');
  check(await until('MUSIC.now === ARENAS[game.arena].id', 1000) && await p.eval('MUSIC.err == null'), 'audio: a fight plays the music of its arena (' + await p.eval('ARENAS[game.arena].id') + ')');
  check(await shown('/\\u266a ' + (await p.eval('ARENAS[game.arena].name')) + '/'), 'audio: the arena track name is shown at the start of round 1');
  await p.eval('step(140)'); check(!await shown('/\\u266a/'), 'audio: the track name goes away after about 2 s');
  await tap('KeyM'); check(await until('MUSIC.now === null', 600), 'audio: M mutes a fight');
  await tap('KeyM'); check(await until('MUSIC.now === ARENAS[game.arena].id', 1000), 'audio: M again brings the arena music back');
  await p.goto(URL_BASE); await p.wait(300);
  const names = ['title', 'vs', 'over', 'gpupit', 'cathedral', 'bridge', 'furnace', 'forest', 'temple', 'graveyard', 'rooftop', 'wasteland'];
  const rms = await p.eval(`(async () => { const out = []; for (const n of ${JSON.stringify(names)}) { const d = (await MUSIC.render(n)).getChannelData(0); let s = 0; for (const v of d) s += v * v; out.push(Math.sqrt(s / d.length)); } return out; })()`);
  check(rms.every(r => dB(r) > -18.5 && dB(r) < -15.5), 'audio: all ' + names.length + ' themes render within -18.5..-15.5 dBFS RMS: ' + rms.map((r, i) => names[i] + ' ' + dB(r).toFixed(1)).join(', '));
  const fx = await p.eval(`(async () => {   // effects through a tapped output: a normal hit must clear the music, a pile-up of big effects must stay below clipping
    AC = new AudioContext(); await AC.resume(); const real = AC.destination, sp = AC.createScriptProcessor(1024, 1, 1), sum = AC.createGain(); let pk = 0, on = false;
    sp.onaudioprocess = e => { if (!on) return; for (const v of e.inputBuffer.getChannelData(0)) if (Math.abs(v) > pk) pk = Math.abs(v); };
    sum.connect(sp); sp.connect(real); Object.defineProperty(AC, 'destination', { get: () => sum }); MUSIC.stop(); audioInit();
    const peak = async f => { pk = 0; on = true; f(); await new Promise(r => setTimeout(r, 700)); on = false; return pk; };
    return { hit: await peak(() => { thud(); beep(120, 0.1, 'sawtooth', 0.06); }), pile: await peak(() => { for (let i = 0; i < 12; i++) { thud(0.5, 0.3); thud(0.3, 0.2); beep(110, 0.5, 'sawtooth', 0.09, 0.5); beep(70, 0.35, 'sawtooth', 0.1, -0.3); } }) };
  })()`);
  check(dB(fx.hit) >= -12, `audio: a normal hit peaks at ${dB(fx.hit).toFixed(1)} dBFS, at least 5 dB above the music (-17 dBFS RMS)`);
  check(dB(fx.pile) < -1.5, `audio: 48 stacked effects peak at ${dB(fx.pile).toFixed(1)} dBFS, clear of clipping (limiter ceiling is -4.4, its 2x oversampling overshoots by up to ~2 dB; without the bus this pile is far above 0)`);

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}
