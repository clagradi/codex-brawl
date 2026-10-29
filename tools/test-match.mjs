// Automated smoke test: loads the built index.html in headless Chrome, drives the menus with key
// events, then plays several full CPU-vs-CPU matches via window.step() and checks that every match
// reaches the 'over' phase without console errors or exceptions. It also checks the README and the
// in-game text against the code, the match rules, share on X and the menu keys (uxDesktopChecks), and
// runPhoneTests repeats the menus and controls on an emulated touch phone. Run: node tools/headless.mjs --test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const hits = bannedHits();
  check(!hits.length, 'no third-party game trademarks or catchphrases in any text file' + more(hits));
  for (const f of ['index.html', 'dev.html']) {
    const h = read(f), meta = (attr, name) => (h.match(new RegExp('<meta[^>]*' + attr + '="' + name + '"[^>]*content="([^"]*)"', 'i')) || [])[1] || '';
    check(/<title>Agent Brawl<\/title>/.test(h) && meta('name', 'description').length > 40 && meta('name', 'viewport').includes('width=device-width'), f + ' has the title, description and viewport meta');
    check(meta('property', 'og:image') === 'https://clagradi.github.io/codex-brawl/og.png' && meta('name', 'twitter:image') === 'https://clagradi.github.io/codex-brawl/og.png', f + ' points og:image and twitter:image at the absolute og.png URL');
  }

  // 1. menus: title -> select -> pick -> arena reveal -> intro -> fight
  await p.goto(URL_BASE); await p.wait(400);
  check(await p.eval('game.phase') === 'title', 'boots to title');
  await p.eval("game.titleSel = titleItems().findIndex(i => i.id === 'versus')");   // feature files add title entries (arcade is first), so the classic ones are picked by id
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
  await p.goto(URL_BASE); await p.wait(300); await p.eval("game.titleSel = titleItems().findIndex(i => i.id === 'versus2')"); await tap('Enter');
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
  const rows = await p.eval(`(() => { const out = []; for (const r of ROSTER) for (const s of [0, 1]) for (const cpu of [false, true]) { const n = moveRows(r.id, s, cpu).length; if (n > 12 || !MOVES[r.id].air.name) out.push(r.id + ':' + n); } return out; })()`);
  check(rows.length === 0, 'move lists stay within 12 rows and every fighter has an air special name' + (rows.length ? ': ' + rows.join(' ') : ''));
  await p.eval(`(() => { game.phase = 'pause'; })()`); await p.wait(80); await p.shot(path.join(ROOT, 'tools', '.shot-pause2.png'));

  // 1d. README facts against the code, the rules, share on X, menu keys and text fit (see uxDesktopChecks below)
  await uxDesktopChecks(p, check, tap);

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
  check(sawFinisher > 0, 'the CPU goes for its finisher (README: "usually")');
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
  const liveRms = await p.eval(`new Promise(res => { const m = MUSIC.master, an = AC.createAnalyser(), buf = new Float32Array(2048); an.fftSize = 2048; m.connect(an); let ss = 0, n = 0;
    const iv = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) { ss += v * v; n++; } }, 25); setTimeout(() => { clearInterval(iv); m.disconnect(an); res(Math.sqrt(ss / n)); }, 3000); })`);
  check(dB(liveRms) > -23 && dB(liveRms) < -11, `audio: the live title music measures ${dB(liveRms).toFixed(1)} dBFS RMS (expected about -17)`);
  await tap('KeyM'); check(await until('MUSIC.now === null', 600), 'audio: M mutes the music on the title');
  await tap('KeyM'); check(await until('MUSIC.now === "title"', 1000), 'audio: M again brings it back');
  await p.eval('AC.resume = () => new Promise(() => { })');   // the music clock asks a suspended context to resume by itself, which brings the music back within a tick or two: hold that off for the length of the check, or the silence is too short to catch
  check(await p.eval('AC.suspend().then(() => AC.state)') === 'suspended' && await until('MUSIC.now === null', 600), 'audio: a suspended context silences the music');
  await p.eval('delete AC.resume');
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

  // 6. ART REGRESSION (sprites.js and the drawing half of moves.js): sheet geometry, the dedicated throw / low jab / sweep poses,
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
  const artLive = await p.eval(`(() => {
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
  check(artLive.names.slice(0, 4).every(s => s.startsWith('punch:')) && artLive.thrower.slice(0, 4).every(n => n > 60), 'a throwing fighter is drawn in its own throw pose, not the punch frame (' + artLive.thrower.join(',') + ' px differ)');
  check(artLive.steps.slice(1, 4).every(n => n > 20) && artLive.thrower[4] > 60, 'the throw pose changes from grab to lift to overhead to slam and release (' + artLive.steps.join(',') + ')');
  check(artLive.victim.length === 4 && artLive.victim.every(n => n > 60) && artLive.tum.slice(1).every(n => n > 20), 'the thrown foe tumbles over the thrower instead of showing one hit frame (' + artLive.victim.join(',') + ')');
  check(artLive.plain === 0, 'a sprite that matches no live fighter (menus, finishers) is exactly the plain sheet frame (' + artLive.plain + ' px differ)');
  check(['low', 'sweep', 'kickf'].every(k => artLive.atk[k][0] === k && artLive.atk[k][1] > 40), 'low jab, sweep and forward kick are drawn with their own low poses: ' + JSON.stringify(artLive.atk));
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

  // Feature tests: every tools/tests/*.mjs, core.mjs first and then alphabetical, each exporting `async function run(t)`. New checks do not go above this line; they go in
  // tools/tests/core.mjs (scaffold, engine and extension layer) or the file named after the feature (docs/ARCHITECTURE.md, "How to add a test").
  const t = {
    p, check, tap, stepUntil, park,
    key: (code, down) => p.key(code, down),                                   // raw key event; tap(code) is down + up
    wait: ms => p.wait(ms),
    open: async (hash = '') => { await p.goto(URL_BASE + hash); await p.wait(300); },   // fresh page load of index.html, optionally with a #hash route
    eval: expr => p.eval(expr),
  };
  const testDir = path.join(ROOT, 'tools', 'tests');
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.mjs')).sort((a, b) => (a === 'core.mjs' ? -1 : b === 'core.mjs' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  for (const f of testFiles) {
    try { await (await import(pathToFileURL(path.join(testDir, f)).href)).run(t); }
    catch (e) { check(false, 'tools/tests/' + f + ' threw: ' + String(e && e.message || e).split('\n')[0]); }
  }

  if (p.errors.length) { console.log('console errors:\n' + p.errors.join('\n')); ok = false; } else console.log('ok    no console errors');
  return ok;
}

// ---------- helpers for the UX checks below (README facts, in-game text, share on X, menu keys, touch layout) ----------
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const more = a => a.length ? ': ' + a.slice(0, 5).join('; ') + (a.length > 5 ? ' (+' + (a.length - 5) + ' more)' : '') : '';
const IDS = ['tibo', 'poteto', 'dot', 'wang', 'muse'];

// Names the game must never use. They are assembled from fragments so that this file does not contain them itself.
const BANNED = [['mortal', ' kombat'], ['fatal', 'ity'], ['finish', ' him'], ['flawless', ' victory'], ['get over', ' here'], ['toast', 'y'], ['scorp', 'ion'], ['sub', '-zero'], ['rai', 'den']].map(a => a.join(''));
function allFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) allFiles(f, out); else out.push(f);
  }
  return out;
}
function bannedHits() { // file names and the text of every source, doc and data file
  const hits = [];
  for (const f of allFiles()) {
    const rel = path.relative(ROOT, f);
    if (BANNED.some(b => rel.toLowerCase().includes(b))) hits.push(rel + ' (file name)');
    if (!/\.(js|mjs|html|json|md|txt|css|svg)$/i.test(f)) continue;
    const txt = fs.readFileSync(f, 'utf8').toLowerCase();
    if (BANNED.some(b => txt.includes(b))) hits.push(rel);
  }
  return hits;
}

// Real organisations a fighter's text may name: the four affiliations of the README roster table (Poteto has none).
const ORG_WORDS = /\b(openai|codex|meta|xai|grok|google|deepmind|anthropic|claude|microsoft|amazon|apple|nvidia|tesla|spacex|twitter|facebook|instagram|mistral|perplexity|scale ai)\b/gi;
const ORG_OK = { tibo: ['openai', 'codex'], poteto: [], dot: ['openai'], wang: ['meta'], muse: ['meta'] };
const orgsIn = s => [...new Set((String(s).match(ORG_WORDS) || []).map(x => x.toLowerCase()))];
const orgProblems = (id, s, where) => orgsIn(s).filter(o => !ORG_OK[id].includes(o)).map(o => where + ' names ' + o);
function petInfo() { // the INFO table at the top of tools/export-pets.mjs
  const info = {};
  for (const m of read('tools/export-pets.mjs').matchAll(/^\s+(tibo|poteto|dot|wang|muse): (['"])(.*)\2,?\s*$/gm)) info[m[1]] = m[3];
  return info;
}

// In-page helpers. __key sends a key press and advances the game, window.open is stubbed (calls land in __opens) and the real-time loop is frozen.
// __fight / __over put the game straight into a round or the end screen (cpu: P2 is the CPU in 1P mode, as in a real match).
const INIT = `(() => {
  window.__opens = []; window.open = (...a) => { __opens.push(a); return null; };
  window.__key = (code, n = 1) => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); step(n); };
  window.__fight = (sel = [0, 2], mode = 1, round = 1, cpu = false) => {
    game.mode = mode; game.sel = sel; startMatch(); game.round = round; game.sudden = round >= 4; startRound(); game.phase = 'fight'; game.phaseT = 0; game.banner = null;
    const [f, o] = game.f; f.cpu = false; o.cpu = cpu && mode === 1;
    for (const q of [f, o]) { q.set('idle'); q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; }
    f.x = 300; o.x = 700; f.face = 1; o.face = -1; game.hitstop = 0; game.slow = 0; return [f, o];
  };
  window.__over = (mode, sel, winSide, fin) => {
    __fight(sel, mode, 1, true); game.wins = winSide ? [1, 2] : [2, 1]; game.fin = fin ? MOVES[game.f[winSide].d.id].fin : null; game.phase = 'over'; game.phaseT = 0; return shareText();
  };
  hold(true);
})()`;

// In-page text capture: every fillText on the game canvas becomes a box in canvas pixels, so a test can look for text that leaves the
// screen or overlaps other text. (Text that the HUD draws through its offscreen canvases is not seen here.)
const CAPTURE = `(() => {
  const cap = window.__cap = { on: false, list: [] }, orig = CanvasRenderingContext2D.prototype.fillText, shadeOrig = window.shade;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y, mw) {
    if (cap.on && this === ctx) {
      const m = this.measureText(String(s)), t = this.getTransform(), k = mw && m.width > mw ? mw / m.width : 1;
      const pt = q => [t.a * q[0] + t.c * q[1] + t.e, t.b * q[0] + t.d * q[1] + t.f];
      const A = pt([x - m.actualBoundingBoxLeft * k, y - m.actualBoundingBoxAscent]), B = pt([x + m.actualBoundingBoxRight * k, y + m.actualBoundingBoxDescent]);
      cap.list.push({ s: String(s), x0: Math.min(A[0], B[0]), x1: Math.max(A[0], B[0]), y0: Math.min(A[1], B[1]), y1: Math.max(A[1], B[1]) });
    }
    return orig.apply(this, arguments);
  };
  window.shade = function (a) { if (cap.on && a >= 0.5) cap.list.length = 0; return shadeOrig.apply(this, arguments); };   // a dark veil hides what was drawn before it
  window.__draw = () => { cap.list = []; cap.on = true; try { render(); } finally { cap.on = false; } return cap.list; };
})()`;

function layoutProblems(list) { // text boxes (canvas pixels) that leave the 960x540 canvas or overlap another line of text
  const seen = [];
  for (const b of list) if (b.s.trim() && !seen.some(q => q.s === b.s && Math.abs(q.x0 - b.x0) < 8 && Math.abs(q.y0 - b.y0) < 8)) seen.push(b);   // outline and shadow copies count once
  const out = [];
  for (const b of seen) if (b.x0 < -0.5 || b.x1 > 960.5 || b.y0 < -0.5 || b.y1 > 540.5) out.push('"' + b.s + '" leaves the canvas');
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], b = seen[j];
    if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1) out.push('"' + a.s + '" overlaps "' + b.s + '"');
  }
  return out;
}

// In-page geometry of the touch layer (CSS pixels): what is visible, where it is, whether a label fits and whether a tap would reach it.
const GEOM = `(() => {
  const vis = e => !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const textFits = e => { if (!e.clientWidth) return true; const cs = getComputedStyle(e), rg = document.createRange(); rg.selectNodeContents(e); return rg.getBoundingClientRect().width <= e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5; };
  const reach = e => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && e.contains(t); };
  window.__geom = () => {
    const items = [], add = (name, e, type) => { if (!vis(e)) return; const r = e.getBoundingClientRect(); items.push({ name, type, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, fits: type === 'dpad' || type === 'hint' || textFits(e), reach: type === 'hint' || reach(e) }); };
    add('d-pad', document.getElementById('dpad'), 'dpad');
    document.querySelectorAll('#pad .tb').forEach(e => add('button ' + e.textContent, e, 'btn'));
    document.querySelectorAll('#pills .mb').forEach(e => add('menu button ' + e.textContent, e, 'menu'));
    add('share button', document.getElementById('share'), 'menu');
    add('hint', document.querySelector('#pad .hint'), 'hint');
    const c = cv.getBoundingClientRect(), de = document.documentElement;
    return { vw: innerWidth, vh: innerHeight, scrollW: Math.max(de.scrollWidth, document.body.scrollWidth), scrollH: Math.max(de.scrollHeight, document.body.scrollHeight),
      canvas: { x0: c.left, y0: c.top, x1: c.right, y1: c.bottom }, lay: { s: lay.s, x: lay.x, y: lay.y, stacked: lay.stacked }, items };
  };
})()`;

function geomProblems(g, texts = []) { // layout rules for the touch layer on one screen size and one game screen
  const { vw, vh, canvas: c, items, lay } = g, s = lay.s, out = [];
  if (g.scrollW > vw + 1 || g.scrollH > vh + 1) out.push('the page scrolls (' + g.scrollW + 'x' + g.scrollH + ' in ' + vw + 'x' + vh + ')');
  if (c.x0 < -1 || c.y0 < -1 || c.x1 > vw + 1 || c.y1 > vh + 1) out.push('the canvas leaves the screen');
  if (Math.abs((c.x1 - c.x0) / (c.y1 - c.y0) - 16 / 9) > 0.02) out.push('the canvas is not 16:9');
  for (const it of items) {
    const w = it.x1 - it.x0, h = it.y1 - it.y0;
    if (it.x0 < -0.5 || it.y0 < -0.5 || it.x1 > vw + 0.5 || it.y1 > vh + 0.5) out.push(it.name + ' leaves the screen');
    if ((it.type === 'btn' || it.type === 'menu') && Math.min(w, h) < 40) out.push(it.name + ' is only ' + Math.round(Math.min(w, h)) + ' px');
    if (it.type === 'dpad' && Math.min(w, h) < 100) out.push('the d-pad is only ' + Math.round(w) + ' px');
    if (!it.fits) out.push(it.name + ' label is clipped');
    if (!it.reach) out.push(it.name + ' is covered by something else');
    if (lay.stacked && it.y0 < c.y1 - 0.5) out.push(it.name + ' overlaps the game');
    if (!lay.stacked && it.type === 'menu' && it.x0 < c.x1 - 0.5) out.push(it.name + ' sits over the playfield');
    if (!lay.stacked && (it.type === 'dpad' || it.type === 'btn') && (it.y0 < c.y0 + 100 * s - 1 || it.y1 > c.y1 - 55 * s + 1)) out.push(it.name + ' reaches into the HUD');
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5) out.push(a.name + ' overlaps ' + b.name);
  }
  if (!lay.stacked) for (const t of texts) for (const it of items) { // controls floating over the canvas must not hide its text
    if (it.type === 'hint') continue;
    const x0 = lay.x + t.x0 * s, x1 = lay.x + t.x1 * s, y0 = lay.y + t.y0 * s, y1 = lay.y + t.y1 * s;
    if (Math.min(x1, it.x1) - Math.max(x0, it.x0) > 2 && Math.min(y1, it.y1) - Math.max(y0, it.y0) > 2) out.push('"' + t.s + '" is covered by the ' + it.name);
  }
  return out;
}

const groupOf = check => async (name, fn) => { try { await fn(); } catch (e) { check(false, name + ' threw: ' + String((e && e.message) || e).split('\n')[0]); } };
const verbose = (what, bad) => { if (process.env.UX_VERBOSE) for (const b of bad) console.log('       ' + what + ': ' + b); };

// ---------- README, in-game text, rules, share on X, menus and keys (desktop page) ----------
export async function uxDesktopChecks(p, check, tap) {
  const readme = read('README.md'), group = groupOf(check);
  const fresh = async (hash = '') => { await p.goto(URL_BASE + hash); await p.wait(300); await p.eval(INIT); await p.eval(CAPTURE); };
  const section = title => { const i = readme.indexOf('\n## ' + title); if (i < 0) return ''; const j = readme.indexOf('\n## ', i + 4); return readme.slice(i, j < 0 ? undefined : j); };
  const word = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n];
  const cells = line => line.split('|').slice(1, -1).map(c => c.trim());

  await group('roster facts', async () => {
    await fresh();
    const ro = await p.eval(`ROSTER.map(r => ({ id: r.id, name: r.name, tag: r.tag, bio: r.bio, handle: r.handle, mv: [...MOVES[r.id].sp.map(m => m.name), MOVES[r.id].air.name, MOVES[r.id].su.name, MOVES[r.id].fin.name] }))`);
    check(ro.map(r => r.id).join() === IDS.join(), 'the roster is exactly Tibo, Poteto, Dot, Wang and Muse');
    check(ro.every(r => r.handle === ''), 'fighter X handles stay empty');
    const NEED = { tibo: ['OPENAI'], poteto: [], dot: ['OPENAI'], wang: ['META'], muse: ['META'] };   // what the in-game tag has to say
    const bad = ro.flatMap(r => [r.name, r.tag, r.bio, ...r.mv].flatMap(s => orgProblems(r.id, s, r.id + ' "' + s + '"')));
    for (const r of ro) for (const w of NEED[r.id]) if (!r.tag.includes(w)) bad.push(r.id + ' tag "' + r.tag + '" does not say ' + w);
    check(!bad.length, 'in-game fighter text carries only the allowed affiliations (Tibo: Codex at OpenAI, Dot: OpenAI, Wang: Meta, Muse: Meta, Poteto: none)' + more(bad));
    const info = petInfo(), petBad = [];
    for (const r of ro) {
      let pet = {}; try { pet = JSON.parse(read('pets/' + r.id + '/pet.json')); } catch (e) { petBad.push(r.id + ': pet.json unreadable'); }
      const dn = r.id === 'wang' ? 'Alexandr Wang' : r.id[0].toUpperCase() + r.id.slice(1);
      if (!info[r.id]) petBad.push(r.id + ': no INFO line');
      if (pet.description !== info[r.id]) petBad.push(r.id + ': pet.json description differs from INFO');
      if (pet.id !== 'brawl-' + r.id || pet.displayName !== dn) petBad.push(r.id + ': id or displayName');
      petBad.push(...orgProblems(r.id, (info[r.id] || '') + ' ' + (pet.description || ''), r.id + ' pet text'));
      for (const w of { tibo: ['OpenAI', 'Codex'], poteto: [], dot: ["OpenAI's dots"], wang: ['Meta'], muse: ["Meta's agent"] }[r.id]) if (!(info[r.id] || '').includes(w)) petBad.push(r.id + ': INFO does not say ' + w);
    }
    check(!petBad.length, 'the INFO strings in tools/export-pets.mjs match pets/*/pet.json and name only the allowed affiliations' + more(petBad));
  });

  await group('README against the code', async () => {
    await fresh();
    const N = await p.eval('ROSTER.length'), names = await p.eval('ARENAS.map(a => a.name)');
    const rows = readme.split('\n').filter(l => /^\| (Tibo|Poteto|Dot|Alexandr Wang|Muse)\b/.test(l)).map(cells);
    const mv = await p.eval(`ROSTER.map(r => { const M = MOVES[r.id], by = i => (M.sp.find(m => m.input === i) || {}).name; return [by('L'), by('FWD+L'), by('DOWN+L'), M.air.name, M.su.name, M.fin.name]; })`);
    const AFF = ['Tibo (Codex at OpenAI)', 'Poteto', "Dot (OpenAI's dots)", 'Alexandr Wang (Meta)', "Muse (Meta's agent)"], tbl = [];
    if (rows.length !== mv.length) tbl.push('the README roster table has ' + rows.length + ' rows, the game has ' + mv.length + ' fighters');
    rows.forEach((r, i) => {
      if (r[0] !== AFF[i]) tbl.push('row ' + (i + 1) + ' says "' + r[0] + '", expected "' + AFF[i] + '"');
      (mv[i] || []).forEach((n, k) => { if (!n || (r[k + 1] || '').toLowerCase() !== n.toLowerCase()) tbl.push((AFF[i] || i) + ' column ' + (k + 1) + ': README "' + r[k + 1] + '" vs game "' + n + '"'); });
    });
    check(!tbl.length, 'README roster table: affiliations and every special, air special, super and finisher match the game' + more(tbl));
    const listed = (section('Arenas').match(/\n\n([^\n]+?)\. Each has/) || [])[1] || '';
    check(listed.split(', ').map(s => s.toLowerCase()).sort().join('|') === names.map(s => s.toLowerCase()).sort().join('|'), 'README lists the ' + names.length + ' arenas by their in-game names');
    const counted = [...readme.matchAll(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (fighters?|arenas?)\b/gi)].map(m => [m[2].toLowerCase().replace(/s$/, ''), m[1].toLowerCase()]);
    const miscount = counted.filter(([what, n]) => { const want = what === 'fighter' ? N : names.length; return n !== word(want) && n !== String(want); });
    check(counted.some(c => c[0] === 'fighter') && counted.some(c => c[0] === 'arena') && !miscount.length, 'every count of fighters (' + N + ') and arenas (' + names.length + ') in the README is right' + more(miscount.map(c => c.join(' '))));
    const kb = +(readme.match(/under (\d+) KB/) || [])[1], size = fs.statSync(path.join(ROOT, 'index.html')).size;
    check(kb > 0 && size < kb * 1024, 'index.html (' + (size / 1024).toFixed(1) + ' KB) is within the README size claim (under ' + kb + ' KB)');
    const dev = section('Development'), refs = [...new Set([...dev.matchAll(/`([\w./-]+\.(?:js|mjs|html))`/g)].map(m => m[1]))], cmds = [...dev.matchAll(/\bnode ([\w./-]+\.mjs)/g)].map(m => m[1]);
    const gone = [...refs.filter(f => !fs.existsSync(path.join(ROOT, f)) && !fs.existsSync(path.join(ROOT, 'tools', f))), ...cmds.filter(f => !fs.existsSync(path.join(ROOT, f)))];
    check(refs.length > 8 && cmds.length >= 4 && !gone.length, 'every file and command that the README Development section names exists' + more(gone));
    const pngs = IDS.map(id => { const b = fs.readFileSync(path.join(ROOT, 'pets', id, 'spritesheet.png')); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); });
    check(pngs.every(s => s === '1536x2288') && /8 x 11 cells of 192x208/.test(readme), 'the Codex pet sheets are 8 x 11 cells of 192x208 (1536x2288), as the README says');
    check(/unofficial fan parody/i.test(readme) && /not affiliated with or endorsed by OpenAI, Meta, xAI/.test(readme), 'README keeps the unofficial fan parody disclaimer');
    // debug hashes
    const hashes = [];
    await p.goto(URL_BASE + '#select'); await p.wait(250); if (await p.eval('game.phase') !== 'select') hashes.push('#select');
    await p.goto(URL_BASE + '#demo=1,2&arena=5&stop'); await p.wait(250); if (!await p.eval('game.sel.join() === "1,2" && game.arena === 5 && game.f.every(f => f.cpu)')) hashes.push('#demo=1,2&arena=5');
    await p.goto(URL_BASE + '#demo=0,1&ff=40&stop'); await p.wait(250); if (!await p.eval('game.tick >= 40')) hashes.push('#demo ff');
    await p.goto(URL_BASE + '#sheet=muse'); await p.wait(250); if (await p.eval('game.phase') !== 'sheet') hashes.push('#sheet');
    check(!hashes.length, 'the debug URL hashes in the README work' + more(hashes));
  });

  await group('page meta', async () => {   // title, description and the Open Graph / X card, in the source page and in the built one
    const OG = 'https://clagradi.github.io/codex-brawl/og.png', bad = [];
    for (const f of ['dev.html', 'index.html']) {
      const html = read(f), m = Object.fromEntries([...html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"/g)].map(x => [x[1], x[2]]));
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1], d = m.description || '';
      if (title !== 'Agent Brawl') bad.push(f + ': the title is "' + title + '"');
      if (d.length < 60 || d.length > 200) bad.push(f + ': the description is ' + d.length + ' characters long');
      if (m['og:description'] !== d || m['twitter:description'] !== d) bad.push(f + ': the og and twitter descriptions differ from the description');
      if (!/^Agent Brawl/.test(m['og:title'] || '') || m['og:title'] !== m['twitter:title']) bad.push(f + ': og:title and twitter:title');
      if (m['og:image'] !== OG || m['twitter:image'] !== OG) bad.push(f + ': og:image and twitter:image must be exactly ' + OG);
      if (m['og:image:width'] !== '1200' || m['og:image:height'] !== '630' || m['twitter:card'] !== 'summary_large_image') bad.push(f + ': the card size or type');
      if (!/width=device-width/.test(m.viewport || '')) bad.push(f + ': the viewport meta');
      if (!['Tibo', 'Poteto', 'Dot', 'Wang', 'Muse'].every(n => new RegExp('\\b' + n + '\\b').test(d))) bad.push(f + ': the description does not name the five fighters');
      for (const o of orgsIn(d)) bad.push(f + ': the description names ' + o);
    }
    const og = fs.readFileSync(path.join(ROOT, 'og.png'));
    if (og.readUInt32BE(16) !== 1200 || og.readUInt32BE(20) !== 630) bad.push('og.png is ' + og.readUInt32BE(16) + 'x' + og.readUInt32BE(20) + ', the card meta says 1200x630');
    check(!bad.length, 'the title, description and Open Graph / X card meta are right in dev.html and index.html, and og.png is the 1200x630 card' + more(bad));
  });

  await group('keys', async () => {
    await fresh();
    const tokCode = t => /^[A-Z]$/.test(t) ? 'Key' + t : { ',': 'Comma', '.': 'Period', '/': 'Slash', Shift: 'ShiftRight' }[t] || t;
    const toks = c => [...(c || '').matchAll(/`([^`]+)`/g)].map(m => tokCode(m[1]));
    const line = n => cells(readme.split('\n').find(l => l.startsWith('| ' + n + ' |')) || '').slice(1);
    const m = await p.eval('({ MAP, ALT, LABEL, ALTL })'), bad = [], M0 = m.MAP[0], M1 = m.MAP[1], p1 = line('P1'), p2 = line('P2');
    const eq = (a, b, what) => { if (a.join() !== b.join()) bad.push(what + ': README ' + a.join(' ') + ' vs code ' + b.join(' ')); };
    eq(toks(p1[0]), [M0.u[0], M0.l[0], M0.d[0], M0.r[0]], 'P1 movement'); eq(toks(p1[1]), M0.p, 'P1 punch'); eq(toks(p1[2]), M0.k, 'P1 kick'); eq(toks(p1[3]), M0.s, 'P1 special');
    eq(toks(p1[4]), [M0.p[0], M0.k[0], M0.x[0]], 'P1 super (J + K together, or I)');
    eq([M1.l[0], M1.r[0], M1.u[0], M1.d[0]], ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], 'P2 movement'); if (!/arrows/i.test(p2[0] || '')) bad.push('README does not say P2 moves with the arrows');
    eq(toks(p2[1]), M1.p, 'P2 punch'); eq(toks(p2[2]), M1.k, 'P2 kick'); eq(toks(p2[3]), M1.s, 'P2 special'); eq(toks(p2[4]), M1.x, 'P2 super');
    eq(['Z', 'X', 'C', 'V'].map(tokCode), [m.ALT.p[0], m.ALT.k[0], m.ALT.s[0], m.ALT.x[0]], '1P alternate keys'); if (!/`Z` `X` `C` `V`/.test(readme)) bad.push('README does not list the Z X C V keys');
    const lab = (l, side) => /^NUM\d$/.test(l) ? 'Numpad' + l[3] : 'Key' + l;
    for (const a of ['p', 'k', 's', 'x']) { if (lab(m.LABEL[0][a]) !== M0[a][0]) bad.push('LABEL[0].' + a); if (lab(m.LABEL[1][a]) !== M1[a][0]) bad.push('LABEL[1].' + a); if ('Key' + m.ALTL[a] !== m.ALT[a][0]) bad.push('ALTL.' + a); }
    check(!bad.length, 'README controls table, the Z X C V alternates and the on-screen key labels match the key maps' + more(bad));
    const c = await p.eval(`(() => { const r = {}; game.mode = 1; r.p1 = codes(0, 'p').join(); r.l1 = codes(0, 'l').join(); r.p2 = codes(1, 'p').join(); game.mode = 2; r.p1m2 = codes(0, 'p').join(); r.l1m2 = codes(0, 'l').join(); game.mode = 1; return r; })()`);
    check(c.p1 === 'KeyJ,KeyZ' && c.l1 === 'KeyA,ArrowLeft' && c.p1m2 === 'KeyJ' && c.l1m2 === 'KeyA' && c.p2 === 'Numpad1,Comma', 'the arrows and Z X C V drive P1 in 1P mode only');
  });

  await group('share on X', async () => {
    await fresh();
    const cases = [['1P win', 1, [0, 3], 0, false, null, 'I beat WANG with TIBO 2-1 in Agent Brawl.'], ['1P loss', 1, [0, 3], 1, false, null, 'WANG destroyed my TIBO 2-1 in Agent Brawl.'],
      ['2P', 2, [2, 4], 1, false, null, 'MUSE beat DOT 2-1 in Agent Brawl.'], ['finisher', 1, [1, 2], 0, true, f => 'I beat DOT with POTETO 2-1, finished with ' + f + ' in Agent Brawl.', null]];
    const bad = [];
    for (const [label, mode, sel, side, fin, build, fixed] of cases) {
      const r = await p.eval(`({ text: __over(${mode}, ${JSON.stringify(sel)}, ${side}, ${fin}), fin: game.fin && game.fin.name, url: shareUrl() })`);
      const want = fixed || build(r.fin), u = new URL(r.url);
      if (r.text !== want) bad.push(label + ': "' + r.text + '" vs "' + want + '"');
      if (!/^(?:I beat [A-Z ]+ with [A-Z ]+|[A-Z ]+ destroyed my [A-Z ]+|[A-Z ]+ beat [A-Z ]+) \d-\d(?:, finished with [A-Z' -]+)? in Agent Brawl\.$/.test(r.text)) bad.push(label + ': the text is not just the result');
      if (r.text.length > 200 || /https?:|@|#/.test(r.text)) bad.push(label + ': the text carries a link, a handle, a tag or is long');
      if (u.origin !== 'https://x.com' || u.pathname !== '/intent/post' || [...u.searchParams.keys()].join() !== 'text,url' || u.searchParams.get('text') !== r.text || u.searchParams.get('url') !== 'https://clagradi.github.io/codex-brawl/' || /[ "<>]/.test(r.url)) bad.push(label + ': the intent URL is wrong (' + r.url.slice(0, 80) + ')');
    }
    check(!bad.length, 'the X post is the match result alone, URL-encoded, with the game link in the url parameter' + more(bad));
    const a = await p.eval(`(() => { __over(1, [0, 3], 0, false); render(); const e = document.getElementById('share'), r = e.getBoundingClientRect(), c = cv.getBoundingClientRect(); return { hidden: e.hidden, href: e.href, target: e.target, rel: e.rel, text: e.textContent.trim(), r: [r.left, r.top, r.right, r.bottom], c: [c.left, c.top, c.right, c.bottom], s: lay.s, vw: innerWidth, vh: innerHeight, url: shareUrl() }; })()`);
    check(!a.hidden && a.href === a.url && a.target === '_blank' && /noopener/.test(a.rel) && a.text === 'SHARE ON X', 'the SHARE ON X button is an anchor to the intent URL that opens a new tab');
    check(a.r[1] >= a.c[1] + 120 * a.s - 1 && a.r[3] <= a.c[3] && a.r[0] >= 0 && a.r[2] <= a.vw, 'the SHARE ON X button sits below the result line, inside the screen');
    await p.eval('__opens.length = 0'); await tap('KeyT');
    const o = await p.eval('({ opens: __opens, url: shareUrl() })');
    check(o.opens.length === 1 && o.opens[0][0] === o.url && o.opens[0][1] === '_blank' && o.opens[0][2] === 'noopener', 'T opens the intent URL in a new tab (noopener)');
    for (const ph of ['title', 'select', 'fight', 'pause']) { await p.eval(`game.phase = '${ph}'`); await tap('KeyT'); }
    check(await p.eval('__opens.length') === 1, 'T does nothing outside the end screen');
  });

  await group('rules', async () => {
    await fresh();
    const R = await p.eval(`(() => {
      const out = {}, tick = () => { game.timer = 1; game.clock = 59; step(1); };
      out.timers = [1, 2, 3].map(r => { __fight([0, 2], 1, r); return game.timer; });
      let [f, o] = __fight([0, 2]); f.hp = 49; o.hp = 46; tick();   // Tibo 49/100 = 49%, Dot 46/92 = 50%: the percentage decides
      out.pct = { phase: game.phase, wins: game.wins.slice(), banner: game.banner && game.banner.txt };
      __fight([0, 2], 1, 2); tick(); out.draw = { phase: game.phase, wins: game.wins.slice(), banner: game.banner && game.banner.txt };
      __fight([0, 2], 1, 3); game.wins = [1, 1]; tick(); let n = 0; while (game.phase === 'ko' && n++ < 400) step(1);
      out.next = { phase: game.phase, round: game.round, sudden: game.sudden, timer: game.timer, hp: game.f.map(q => q.hp), max: game.f.map(q => q.d.hp), banner: game.banner && game.banner.txt, tip: (fightTip() || {}).txt };
      out.meter = []; for (const [m0, m1] of [[10, 40], [40, 10]]) { [f, o] = __fight([0, 2], 1, 4); f.meter = m0; o.meter = m1; tick(); out.meter.push(game.wins.slice()); }
      return out; })()`);
    check(R.timers.join() === '99,99,99' && /99-second rounds/.test(readme), 'rounds 1 to 3 run 99 seconds (README: 99-second rounds)');
    check(R.pct.phase === 'ko' && R.pct.wins.join() === '0,1' && R.pct.banner === 'TIME', 'a time-out goes to the fighter with more health by percentage (49/100 loses to 46/92)');
    check(R.draw.wins.join() === '0,0' && R.draw.banner === 'DRAW', 'an exact tie on health in rounds 1 to 3 is a draw nobody wins');
    check(R.next.round === 4 && R.next.sudden && R.next.timer === 30 && R.next.hp.join() === R.next.max.map(h => Math.ceil(h * 0.25)).join() && R.next.banner === 'SUDDEN DEATH' && /30 seconds/.test(readme) && /quarter of their health/.test(readme),
      'with no winner after round 3, round 4 is sudden death: 30 seconds, a quarter of the health (README rules)');
    check(/SUDDEN DEATH/.test(R.next.tip || '') && /30 SECONDS/.test(R.next.tip) && /25%/.test(R.next.tip) && /SUPER METER/.test(R.next.tip), 'the sudden-death round explains its rules on screen');
    check(R.meter.join('|') === '0,1|1,0', 'a sudden-death tie on health goes to the fuller super meter');
  });

  await group('finisher window', async () => {
    await fresh();
    const F = await p.eval(`(() => {
      const out = { len: FINISH_LEN }, ko = (f, o) => { o.hp = 1; o.inv = 0; o.takeHit(f, 50, 5, 20, 'hit'); };
      let [f, o] = __fight([0, 2]); ko(f, o); out.first = game.phase;   // the first round win is a plain K.O.
      [f, o] = __fight([0, 2]); game.wins = [1, 0]; ko(f, o); out.p0 = game.phase; out.banner = game.banner && game.banner.txt; step(299); out.p299 = game.phase; step(1); out.p300 = game.phase;
      [f, o] = __fight([1, 3]); game.wins = [1, 0]; ko(f, o); step(20); o.takeHit(f, 5, 2, 10, 'punch'); out.afterHit = game.phase;
      [f, o] = __fight([2, 4]); game.wins = [1, 0]; ko(f, o); step(20); f.meter = 0; out.before = game.phase;
      return out; })()`);
    await p.key('KeyI', true); await p.eval('step(2)'); await p.key('KeyI', false);
    check(F.first === 'ko' && F.p0 === 'finish' && F.banner === 'FINISH IT!', 'the first round win is a plain K.O.; winning the second opens FINISH IT!');
    check(F.len === 300 && F.p299 === 'finish' && F.p300 === 'ko' && /FINISH IT! for 5 seconds/.test(readme), 'the FINISH IT! window lasts 5 seconds, then a plain K.O.');
    check(F.afterHit === 'ko', 'any hit on the stunned fighter ends the match with a normal K.O.');
    check(F.before === 'finish' && await p.eval('game.phase') === 'finisher', 'the super key performs the finisher with an empty meter');
  });

  await group('end screen keys', async () => {
    await fresh();
    const O = await p.eval(`(() => {
      const out = {}, K = __key, over = (mode = 1, sel = [1, 3], pick = 3) => { game.arenaPick = pick; __over(mode, sel, 0, false); };
      over(); K('KeyR'); out.r = [game.phase, game.sel.join(), game.arena, game.wins.join()];
      over(); K('KeyI'); out.i = game.phase; over(2); K('Numpad0'); out.p2super = game.phase;
      over(); K('Enter'); out.enter = [game.phase, game.ready.join()]; over(); K('Space'); out.space = game.phase; over(); K('KeyJ'); out.punch = game.phase; over(2); K('Numpad1'); out.p2punch = game.phase;
      over(); K('Escape'); out.esc = game.phase;
      game.arenaPick = -1; const seen = new Set(); for (let i = 0; i < 40; i++) { startMatch(); seen.add(game.arena); } out.random = seen.size;
      over(1, [1, 3], -1); K('KeyR'); out.randomRematch = game.arenaPick;
      return out; })()`);
    check(O.r.join() === 'vs,1,3,3,0,0' && O.i === 'vs', 'R and the P1 super key rematch with the same fighters and the same arena');
    check(O.p2super === 'over', "the P2 super key does not rematch (README: R or P1's super key)");
    check(O.randomRematch === -1 && O.random > 1, 'a rematch with the arena left on RANDOM rolls the arena again');
    check(O.enter.join() === 'select,false,false' && O.space === 'select' && O.punch === 'select' && O.p2punch === 'select' && O.esc === 'title', 'Enter, Space or a punch go back to select, Esc to the title');
  });

  await group('menu keys', async () => {
    await fresh();
    const r = await p.eval(`(() => {
      const out = {}, K = __key, ph = () => game.phase;
      out.t0 = [ph(), game.titleSel]; K('KeyS'); out.s = game.titleSel; K('KeyW'); out.w = game.titleSel; K('ArrowDown'); out.down = game.titleSel; K('ArrowUp'); out.up = game.titleSel;
      K('Space'); out.space = [ph(), game.mode]; K('Escape'); out.escFirst = ph();
      K('KeyJ'); out.punch = [ph(), game.mode]; K('KeyJ'); out.ready = game.ready[0]; K('Escape'); out.unready = [ph(), game.ready[0]]; K('Escape'); out.escTitle = ph();
      K('KeyS'); K('Enter'); out.p2mode = [ph(), game.mode]; K('Escape'); out.esc2p = ph();
      K('Enter'); game.arenaPick = -1; out.arena = []; for (let i = 0; i <= ARENAS.length; i++) { K('KeyE'); out.arena.push(game.arenaPick); } K('KeyQ'); out.q = game.arenaPick; K('KeyI'); out.superKey = game.arenaPick;
      game.sel = [0, 4]; game.ready = [false, false]; out.col = []; for (const [s, k] of [[0, 'KeyS'], [3, 'KeyS'], [1, 'KeyS'], [4, 'KeyS'], [2, 'KeyS'], [4, 'KeyW']]) { game.sel[0] = s; K(k); out.col.push(game.sel[0]); }
      K('Escape'); game.titleSel = 1; K('Enter'); out.tab = [ph(), game.mode]; game.sel = [0, 4]; game.ready = [false, false]; K('KeyD'); K('ArrowLeft'); out.nav2p = game.sel.join();
      K('KeyJ'); K('Numpad2'); out.p1stays = game.ready.join(); K('KeyK'); out.p1undo = game.ready.join(); K('Numpad1'); K('Numpad2'); out.p2undo = game.ready.join();
      __fight([0, 2]); K('KeyP'); out.p = ph(); K('KeyP'); out.p2 = ph(); K('Escape'); out.esc = ph(); K('Escape'); out.esc2 = ph(); K('KeyP'); K('Enter'); out.enter = ph(); K('KeyP'); K('KeyQ'); out.quit = ph();
      return out; })()`);
    check(r.t0.join() === 'title,0' && r.s === 1 && r.w === 0 && r.down === 1 && r.up === 0, 'title: W/S and the arrows choose the mode');
    check(r.space.join() === 'select,1' && r.escFirst === 'title' && r.punch.join() === 'select,1', 'title: Space or a punch starts, Esc on the first pick goes back to the title');
    check(r.ready === true && r.unready.join() === 'select,false' && r.escTitle === 'title', 'select: J confirms, Esc un-confirms and then goes to the title');
    check(r.p2mode.join() === 'select,2' && r.esc2p === 'title', 'select (2P): Esc goes back to the title');
    check(r.arena.join() === [...r.arena.slice(0, -1).keys(), -1].join() && r.arena.length > 9 && r.q === r.arena.length - 2 && r.superKey === -1, 'select: E, Q and the super key step through every arena and RANDOM');
    check(r.col.join() === '3,0,4,1,4,1', 'select: up and down keep the column');
    check(r.tab.join() === 'select,2' && r.nav2p === '1,3' && r.p1stays === 'true,false' && r.p1undo === 'false,false' && r.p2undo === 'false,false', 'select (2P): each player moves and confirms with their own keys, and the kick key undoes only that player');
    check(r.p === 'pause' && r.p2 === 'fight' && r.esc === 'pause' && r.esc2 === 'fight' && r.enter === 'fight' && r.quit === 'title', 'fight and pause: P or Esc pause, P, Esc or Enter resume, Q quits to the title');
  });

  await group('mute and blood', async () => {
    await fresh();
    const store = await p.eval(`(() => { try { localStorage.setItem('t', '1'); localStorage.removeItem('t'); return true; } catch (e) { return false; } })()`);
    const r = await p.eval(`(() => { const out = { m0: muted, g0: FX.gore }; game.phase = 'title'; __key('KeyM'); out.m1 = muted; out.ms = store(); __key('KeyB'); out.g1 = FX.gore; out.gs = store(); return out; function store() { try { const o = JSON.parse(localStorage.getItem('brawl.settings') || '{}'); return [o.muted === true ? '1' : '0', o.gore === true ? '1' : '0'].join(); } catch (e) { return ''; } } })()`);   // both live in the one SETTINGS store (settings.js)
    check(r.m1 === !r.m0 && r.g1 === !r.g0, 'M toggles the sound and B the blood');
    if (store) {
      check(r.gs === (r.m1 ? '1' : '0') + ',' + (r.g1 ? '1' : '0'), 'both choices are stored in the browser');
      await p.goto(URL_BASE); await p.wait(300);
      const back = await p.eval('[muted, FX.gore]');
      check(back[0] === r.m1 && back[1] === r.g1, 'a reload restores the sound and blood choices (README: remembered between visits)');
      await p.eval(`(() => { localStorage.removeItem('brawl.settings'); localStorage.removeItem('brawl.muted'); localStorage.removeItem('brawl.gore'); })()`);
    } else console.log('skip  browser storage is not available here: persistence of M and B not checked');
  });

  await group('gamepad', async () => {
    await fresh();
    const g = await p.eval(`(() => {
      const mk = () => ({ axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }), g1 = mk(), g2 = mk();
      Object.defineProperty(navigator, 'getGamepads', { value: () => [g1, g2], configurable: true });
      game.phase = 'sheet';   // the game ignores the keys, only pollPads() runs
      const read = (g, b, code) => { g.buttons[b].pressed = true; step(1); const on = !!keys[code]; g.buttons[b].pressed = false; step(1); return on && !keys[code]; };
      const out = { p1: [read(g1, 0, 'KeyJ'), read(g1, 1, 'KeyK'), read(g1, 2, 'KeyL'), read(g1, 3, 'KeyI'), read(g1, 5, 'KeyI'), read(g1, 14, 'KeyA'), read(g1, 15, 'KeyD'), read(g1, 12, 'KeyW'), read(g1, 13, 'KeyS')],
        p2: [read(g2, 0, 'Numpad1'), read(g2, 1, 'Numpad2'), read(g2, 2, 'Numpad3'), read(g2, 3, 'Numpad0')] };
      g1.axes[0] = 0.9; step(1); out.stick = !!keys.KeyD; g1.axes[0] = 0; step(1);
      for (const k in pressed) pressed[k] = false; game.phase = 'title'; game.titleSel = 0; g1.buttons[9].pressed = true; step(1); g1.buttons[9].pressed = false; step(1); out.startMenu = game.phase;   // Start is Enter on the menus
      g1.buttons[8].pressed = true; step(1); g1.buttons[8].pressed = false; step(1); out.back = game.phase;   // Back is Esc
      __fight([0, 2]); g1.buttons[9].pressed = true; step(1); g1.buttons[9].pressed = false; step(1); out.pause = game.phase; g1.buttons[9].pressed = true; step(1); g1.buttons[9].pressed = false; step(1); out.resume = game.phase;
      return out; })()`);
    check(g.p1.every(Boolean) && g.p2.every(Boolean) && g.stick, 'gamepads: pad 1 is P1, pad 2 is P2; d-pad or stick, A punch, B kick, X special, Y or RB super');
    check(g.startMenu === 'select' && g.back === 'title' && g.pause === 'pause' && g.resume === 'fight', 'gamepad Start is Enter on the menus and pauses or resumes a fight, Back is Esc: ' + JSON.stringify([g.startMenu, g.back, g.pause, g.resume]));
  });

  await group('touch pad on a laptop', async () => {
    await fresh();
    const r = await p.eval(`(() => {
      const pad = document.getElementById('pad'), out = { start: touch.on };
      dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true })); render(); out.mouse = touch.on;
      dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); render(); out.touch = touch.on; out.shown = !pad.hidden;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' })); render(); out.key = touch.on; out.hidden = pad.hidden;
      return out; })()`);
    check(!r.start && !r.mouse && r.touch && r.shown && !r.key && r.hidden, 'the on-screen pad appears on the first touch (never for a mouse) and a key press hides it again');
  });

  await group('text fit', async () => {
    await fresh();
    const bad = [];
    const draw = async (label, setup, want = '[]', has = []) => {
      const r = await p.eval(`(() => { ${setup}; const list = __draw(); return { list, want: ${want} }; })()`);
      for (const msg of layoutProblems(r.list)) bad.push(label + ': ' + msg);
      for (const w of r.want) if (!r.list.some(b => b.s.toUpperCase() === String(w).toUpperCase())) bad.push(label + ': "' + w + '" is not drawn');
      for (const t of has) if (!r.list.some(b => b.s.includes(t))) bad.push(label + ': nothing says "' + t + '"');
      verbose(label, layoutProblems(r.list));
      return r.list;
    };
    await draw('title 1P', "game.phase = 'title'; game.titleSel = 0", '[]', ['W/S + ENTER', 'UNOFFICIAL FAN PARODY', 'NOT AFFILIATED WITH OPENAI, META OR XAI']);
    await draw('title 2P', "game.phase = 'title'; game.titleSel = 1", '[]', ['P2 ARROWS']);
    for (let i = 0; i < IDS.length; i++) for (const mode of [1, 2]) {
      const j = (i + 2) % IDS.length;
      await draw(`select ${mode}P ${IDS[i]}/${IDS[j]}`, `game.mode = ${mode}; game.sel = [${i}, ${j}]; game.ready = [${i % 2 === 0}, false]; game.arenaPick = ${i * 2 - 1}; game.phase = 'select'`,
        `[...moveRows(ROSTER[${i}].id, 0, false), ...moveRows(ROSTER[${j}].id, 1, ${mode === 1})].map(r => r.name)`, mode === 2 ? ['NUM1', 'P1 WASD', 'P2 ARROWS'] : ['ARENA']);
    }
    for (let i = 0; i < IDS.length; i++) for (const mode of [1, 2]) {
      const j = (i + 3) % IDS.length;
      await draw(`pause ${mode}P ${IDS[i]}/${IDS[j]}`, `__fight([${i}, ${j}], ${mode}, 1, true); game.phase = 'pause'; if (typeof OPTIONS !== 'undefined') OPTIONS.open('moves')`, `[...moveRows(ROSTER[${i}].id, 0, false), ...moveRows(ROSTER[${j}].id, 1, ${mode === 1})].map(r => r.name)`,
        mode === 2 ? ['SUDDEN DEATH', 'P2  ARROWS', 'GAMEPAD'] : ['SUDDEN DEATH', 'GAMEPAD']);
    }
    await p.eval(`typeof OPTIONS !== 'undefined' && OPTIONS.close()`);
    for (let i = 0; i < IDS.length; i++) await draw('over ' + IDS[i], `__over(1, [${i}, ${(i + 1) % IDS.length}], 0, true)`, "['P1 TAKES IT 2-1 · ' + game.fin.name]", ['ENTER CHARACTER SELECT']);
    await draw('over, CPU wins', '__over(1, [3, 0], 1, true)', "['CPU TAKES IT 2-1 · ' + game.fin.name]");
    await draw('tip, round 1 (1P)', "__fight([0, 3], 1, 1, true); game.clock = 10", '[fightTip().txt]');
    await draw('tip, round 1 (2P)', "__fight([0, 3], 2, 1, false); game.clock = 10", '[fightTip().txt]');
    await draw('tip, sudden death', "__fight([2, 4], 1, 4, true); game.phase = 'intro'", '[fightTip().txt]');
    await draw('tip, finisher', "__fight([2, 4]); game.wins = [1, 0]; game.f[1].hp = 1; game.f[1].inv = 0; game.f[1].takeHit(game.f[0], 50, 5, 20, 'hit')", '[fightTip().txt]');
    check(!bad.length, 'menu, pause, end and tip text stays on the canvas and does not overlap, in 1P and 2P for every fighter' + more(bad));
  });

  await group('desktop window sizes', async () => {
    await fresh();
    const bad = [];
    try {
      for (const [w, h] of [[1000, 600], [640, 480], [800, 300], [1280, 720], [1920, 1080], [1024, 768]]) {
        await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await p.wait(80); await p.eval('fit()');
        const g = await p.eval(`(() => { const c = cv.getBoundingClientRect(), de = document.documentElement; return { vw: innerWidth, vh: innerHeight, c: [c.left, c.top, c.right, c.bottom], sw: de.scrollWidth, sh: de.scrollHeight }; })()`);
        if (g.vw !== w || g.vh !== h) bad.push(w + 'x' + h + ': the window did not resize');
        else if (g.c[0] < -1 || g.c[1] < -1 || g.c[2] > w + 1 || g.c[3] > h + 1 || Math.abs((g.c[2] - g.c[0]) / (g.c[3] - g.c[1]) - 16 / 9) > 0.02 || g.sw > w + 1 || g.sh > h + 1) bad.push(w + 'x' + h + ': the canvas does not fit (' + g.c.map(Math.round).join(',') + ')');
      }
    } finally { await p.send('Emulation.clearDeviceMetricsOverride'); await p.wait(60); }
    check(!bad.length, 'the canvas scales to the window on a desktop (no scrolling, 16:9) at every size tried' + more(bad));
  });
}

// ---------- phone (runs on the emulated 390x844 touch device): the game by touch, then the layout on many screen sizes ----------
const SCREENS = {
  portrait: [[390, 844], [360, 640], [320, 568], [412, 915], [375, 667], [820, 1180]],
  landscape: [[844, 390], [667, 375], [568, 320], [932, 430], [1024, 768], [1180, 820]],
};
const PHONE_PHASES = [   // [name, code that puts the game on that screen, how many menu buttons the touch layer shows there]
  ['title', "game.phase = 'title'; game.titleSel = 0", 3],
  ['select', "game.mode = 1; game.sel = [1, 3]; game.ready = [true, false]; game.arenaPick = 2; game.phase = 'select'; game.phaseT = 0", 4],
  ['versus', "__fight([1, 3], 1, 1, true); game.phase = 'vs'; game.phaseT = 60", 1],
  ['fight', "__fight([1, 3], 1, 1, true); game.clock = 20", 1],
  ['sudden death', "__fight([2, 4], 1, 4, true); game.clock = 20", 1],
  ['pause', "__fight([1, 3], 1, 1, true); game.phase = 'pause'", 3],
  ['end', "__over(1, [1, 3], 0, true)", 4],   // SELECT, REMATCH, TITLE and the SHARE ON X button
];
// both fighters back to a neutral spot, so that a touch test starts from a known position
const PARK = "(() => { const [f, o] = game.f; f.cpu = o.cpu = false; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0; for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; } f.x = 300; o.x = 700; f.face = 1; o.face = -1; step(1); })()";

export async function runPhoneTests(p) {
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) ok = false; };
  const group = groupOf(check);
  const fresh = async () => { await p.goto(URL_BASE); await p.wait(400); };
  // centre and size of a visible element in CSS pixels, optionally the one that carries this label
  const at = (sel, txt) => p.eval(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(n => ${txt === undefined ? 'true' : 'n.textContent === ' + JSON.stringify(txt)}); if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width, b.height]; })()`);
  const tapEl = async (sel, txt) => { const c = await at(sel, txt); if (!c) return false; await p.tapAt(c[0], c[1]); await p.wait(90); return true; };
  const pill = txt => tapEl('#pills .mb', txt);
  const onCanvas = async (x, y) => { const c = await p.eval(`[lay.x + ${x} * lay.s, lay.y + ${y} * lay.s]`); await p.tapAt(c[0], c[1]); await p.wait(90); };
  const cell = async i => { const c = await p.eval(`(() => { const c = selectCell(${i}); return [lay.x + (c.x + c.w / 2) * lay.s, lay.y + (c.y + c.h / 2) * lay.s]; })()`); await p.tapAt(c[0], c[1]); await p.wait(90); };
  const held = () => p.eval("['KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyJ', 'KeyK', 'KeyL', 'KeyI'].filter(k => keys[k]).join('+')");
  const lift = async () => { await p.touch('touchEnd', []); await p.wait(90); };
  const stepr = n => p.eval(`step(${n}); render()`);

  await group('menus by touch', async () => {
    await fresh();
    const i0 = await p.eval(`({ on: touch.on, stacked: lay.stacked, quiet: AC === null, phase: game.phase, padHidden: document.getElementById('pad').hidden, pills: [...document.querySelectorAll('#pills .mb')].map(e => e.textContent) })`);
    check(i0.on && i0.stacked && i0.quiet && i0.phase === 'title' && !i0.padHidden, 'a phone gets the on-screen controls and the portrait layout, and the audio waits for the first tap');
    check(i0.pills.slice(0, 2).join() === '1 PLAYER,2 PLAYERS' && /^SOUND O(N|FF)$/.test(i0.pills[2] || ''), 'title: 1 PLAYER, 2 PLAYERS and SOUND buttons under the game');
    await onCanvas(480, 476);   // the "2 PLAYERS" row of the title
    check((await p.eval('[game.phase, game.mode].join()')) === 'select,2' && await p.eval('AC !== null'), 'a tap on a title row picks that mode, and the first tap starts the audio');
    await pill('BACK');
    check((await p.eval('game.phase')) === 'title', 'select: BACK returns to the title');
    await pill('1 PLAYER');
    check((await p.eval('[game.phase, game.mode].join()')) === 'select,1', '1 PLAYER opens the character select');
    await cell(2); const a = await p.eval('({ sel: game.sel.slice(), ready: game.ready.slice() })');
    await cell(2); const b = await p.eval('game.ready.slice()');
    check(a.sel[0] === 2 && !a.ready[0] && b[0] === true, 'select: a tap moves the cursor to a fighter, a second tap confirms it');
    await pill('BACK'); const c = await p.eval('game.ready.join()');
    await cell(2);
    check(c === 'false,false' && (await p.eval('game.ready[0]')) === true, 'select: BACK takes the pick back, and the fighter can be confirmed again');
    await cell(3);
    check((await p.eval('game.sel.join()')) === '2,3', 'select: the CPU opponent is picked the same way');
    const ar = [];
    await onCanvas(480, 440); ar.push(await p.eval('game.arenaPick'));   // the arena picture
    await pill('ARENA >'); ar.push(await p.eval('game.arenaPick'));
    await pill('< ARENA'); ar.push(await p.eval('game.arenaPick'));
    await pill('< ARENA'); ar.push(await p.eval('game.arenaPick'));
    check(ar.join() === '0,1,0,-1', 'select: the arena picture and the ARENA buttons step through the arenas and back to RANDOM');
    await pill('OK');
    const v = await p.eval('({ phase: game.phase, mode: game.mode, sel: game.sel.join(), cpu: game.f.map(f => f.cpu).join() })');
    check(v.phase === 'vs' && v.mode === 1 && v.sel === '2,3' && v.cpu === 'false,true', 'select: OK starts the match, you against the CPU');
    await p.eval('hold(true)'); await stepr(40);
    check(await pill('SKIP'), 'the versus screen has a SKIP button');
    await stepr(1);
    check((await p.eval('game.phase')) === 'intro', 'SKIP jumps from the versus screen to the round');
    await p.eval("(() => { let n = 0; while (game.phase !== 'fight' && n++ < 400) step(1); render(); })()");
    check((await p.eval('game.phase')) === 'fight', 'the round starts');
    const ui = await p.eval(`(() => { const vis = e => !!e && !e.hidden && e.getClientRects().length > 0; return { dpad: vis(document.getElementById('dpad')), btns: [...document.querySelectorAll('#pad .tb')].filter(vis).map(e => e.textContent).join(), pills: [...document.querySelectorAll('#pills .mb')].map(e => e.textContent).join() }; })()`);
    check(ui.dpad && ui.btns === 'SP,SU,P,K' && ui.pills === 'PAUSE', 'in a fight: the d-pad, the SP SU P K buttons and a PAUSE button');
  });

  await group('touch controls', async () => {
    await p.eval(INIT);
    if ((await p.eval('game.phase')) !== 'fight') await p.eval('__fight([2, 3], 1, 1, false)');
    await stepr(1); await p.eval(PARK);
    const [dx, dy, dw] = await at('#dpad'), R = dw / 2;
    const bad = [];
    for (const [deg, want] of [[0, 'KeyD'], [45, 'KeyD+KeyS'], [90, 'KeyS'], [135, 'KeyA+KeyS'], [180, 'KeyA'], [225, 'KeyA+KeyW'], [270, 'KeyW'], [315, 'KeyD+KeyW']]) {
      const r = deg * Math.PI / 180;
      await p.touch('touchStart', [{ id: 1, x: dx + 0.7 * R * Math.cos(r), y: dy + 0.7 * R * Math.sin(r) }]); await p.wait(40);
      const h = await held(); if (h !== want) bad.push(deg + ' degrees gave ' + (h || 'nothing') + ', wanted ' + want);
      await lift(); const left = await held(); if (left) bad.push(deg + ' degrees stayed held: ' + left);
    }
    await p.touch('touchStart', [{ id: 1, x: dx + 0.1 * R, y: dy }]); await p.wait(40);
    const mid = await held(); if (mid) bad.push('the middle of the d-pad pressed ' + mid);
    await lift();
    check(!bad.length, 'the d-pad has eight directions, a dead centre, and lets go cleanly' + more(bad));
    await p.touch('touchStart', [{ id: 1, x: dx + 0.7 * R, y: dy }]); await p.wait(40);
    await p.touch('touchMove', [{ id: 1, x: dx - 0.7 * R, y: dy }]); await p.wait(40);
    const slid = await held(); await lift();
    check(slid === 'KeyA', 'sliding the thumb across the d-pad changes direction without lifting it');

    for (const [label, sx, key] of [['forward', 0.6, 'KeyD'], ['back', -0.6, 'KeyA']]) {
      await p.eval(PARK);
      await p.touch('touchStart', [{ id: 1, x: dx + sx * R, y: dy - 0.6 * R }]); await p.wait(30);
      const j = await p.eval(`(() => { const f = game.f[0], x0 = f.x, both = !!keys.${key} && !!keys.KeyW; let up = false; for (let i = 0; i < 30; i++) { step(1); if (!f.onGround) up = true; } return { both, up, dx: f.x - x0 }; })()`);
      await lift();
      check(j.both && j.up && (sx > 0 ? j.dx > 40 : j.dx < -40), 'a diagonal on the d-pad jumps ' + label + ' (' + Math.round(j.dx) + ' px)');
    }

    const dash = async x => {
      await p.eval(PARK);
      await p.touch('touchStart', [{ id: 1, x, y: dy }]); await p.wait(60); await p.eval('step(2)'); await lift(); await p.eval('step(2)');
      await p.touch('touchStart', [{ id: 1, x, y: dy }]); await p.wait(60); await p.eval('step(3)');
      const r = await p.eval('({ s: game.f[0].state, back: game.f[0].dashBack })'); await lift(); return r;
    };
    const d1 = await dash(dx + 0.7 * R), d2 = await dash(dx - 0.7 * R);
    check(d1.s === 'dash' && !d1.back, 'tapping forward twice on the d-pad dashes in (' + d1.s + ')');
    check(d2.s === 'dash' && d2.back, 'tapping back twice backdashes (' + d2.s + ')');

    const button = async lbl => at('#pad .tb', lbl);
    const [K, P, SP, SU] = [await button('K'), await button('P'), await button('SP'), await button('SU')];
    check([K, P, SP, SU].every(Boolean) && [K, P, SP, SU].every(b => Math.min(b[2], b[3]) >= 40), 'the four action buttons are on the screen and at least 40 px big');
    await p.eval(PARK); await p.eval('game.f[1].x = 350; step(1)');   // close enough to throw
    await p.touch('touchStart', [{ id: 1, x: dx, y: dy + 0.7 * R }]); await p.wait(60);
    await p.touch('touchStart', [{ id: 1, x: dx, y: dy + 0.7 * R }, { id: 2, x: K[0], y: K[1] }]); await p.wait(60);
    const sw0 = await held(); await p.eval('step(3)');
    const sw = await p.eval('({ s: game.f[0].state, atk: game.f[0].atk })'); await lift();
    check(sw0 === 'KeyS+KeyK' && sw.s === 'kick' && sw.atk === 'sweep', 'down on the d-pad + K sweeps (' + sw.s + '/' + sw.atk + ')');
    await p.eval(PARK); await p.eval('game.f[1].x = 350; step(1)');
    await p.touch('touchStart', [{ id: 1, x: dx + 0.7 * R, y: dy }]); await p.wait(60);
    await p.touch('touchStart', [{ id: 1, x: dx + 0.7 * R, y: dy }, { id: 2, x: P[0], y: P[1] }]); await p.wait(60);
    await p.eval('step(3)');
    const th = await p.eval('game.f.map(f => f.state).join()'); await lift();
    check(th === 'throw,grabbed', 'forward on the d-pad + P throws (' + th + ')');
    await p.eval(PARK); await p.tapAt(P[0], P[1]); await p.eval('step(2)');
    const pu = await p.eval('game.f[0].state'); await p.eval(PARK);
    check(pu === 'punch', 'the P button punches (' + pu + ')');
    await p.tapAt(K[0], K[1]); await p.eval('step(2)');
    const ki = await p.eval('game.f[0].state'); await p.eval(PARK);
    check(ki === 'kick', 'the K button kicks (' + ki + ')');
    await p.tapAt(SP[0], SP[1]); await p.eval('step(2)');
    const sp = await p.eval('game.f[0].state'); await p.eval(PARK);
    check(sp === 'special', 'the SP button fires the special (' + sp + ')');
    await p.eval('game.f[0].meter = 100'); await p.tapAt(SU[0], SU[1]); await p.eval('step(2)');
    const su = await p.eval('game.f[0].state'); await p.eval(PARK);
    check(su === 'super', 'the SU button fires the super when the meter is full (' + su + ')');
    check(!(await held()), 'every key is let go after the last finger leaves');

    await p.eval(PARK); check(await pill('PAUSE'), 'a PAUSE button is on the screen'); await stepr(1);
    const ps = await p.eval(`({ phase: game.phase, pills: [...document.querySelectorAll('#pills .mb')].map(e => e.textContent).join() })`);
    check(ps.phase === 'pause' && /^RESUME,SOUND O(N|FF),QUIT$/.test(ps.pills), 'PAUSE pauses; the pause screen offers RESUME, SOUND and QUIT (' + ps.pills + ')');
    const was = await p.eval('muted'); await pill(was ? 'SOUND OFF' : 'SOUND ON');
    check((await p.eval('muted')) === !was, 'the SOUND button switches the sound'); await pill(was ? 'SOUND ON' : 'SOUND OFF');
    await pill('RESUME'); await stepr(1);
    check((await p.eval('game.phase')) === 'fight', 'RESUME goes back to the fight');
    await pill('PAUSE'); await stepr(1); await pill('QUIT'); await stepr(1);
    check((await p.eval('game.phase')) === 'title', 'QUIT leaves to the title');
  });

  await group('share and the end screen by touch', async () => {
    await p.eval(INIT);
    await p.eval(`(() => { __over(1, [0, 3], 0, false); render(); window.__clicks = [];
      document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a'); __clicks.push(a ? { id: a.id, href: a.href, target: a.target } : { id: e.target.id || e.target.tagName }); e.preventDefault(); }, true); })()`);
    const sh = await at('#share');
    check(!!sh && sh[2] >= 40 && sh[3] >= 40, 'the end screen has a SHARE ON X button of at least 40 px');
    await p.tapAt(sh[0], sh[1]); await p.wait(150);
    const r = await p.eval('({ clicks: __clicks, url: shareUrl(), text: shareText() })');
    check(r.clicks.length === 1 && r.clicks[0].id === 'share' && r.clicks[0].href === r.url && r.clicks[0].target === '_blank', 'a tap on SHARE ON X follows the intent link in a new tab');
    check(new URL(r.url).searchParams.get('text') === r.text && /^I beat WANG with TIBO 2-1 in Agent Brawl\.$/.test(r.text), 'and that link posts only the match result (' + r.text + ')');
    const ends = [];
    for (const [lbl, want] of [['REMATCH', 'vs'], ['SELECT', 'select'], ['TITLE', 'title']]) {
      await p.eval("__over(1, [0, 3], 0, false); render()");
      if (!await pill(lbl)) { ends.push(lbl + ' is missing'); continue; }
      await stepr(1); const ph = await p.eval('game.phase'); if (ph !== want) ends.push(lbl + ' went to ' + ph);
    }
    check(!ends.length, 'end screen: REMATCH, SELECT and TITLE buttons do what the keys do' + more(ends));
    const pg = await p.eval(`(() => { const ev = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); document.body.dispatchEvent(ev); const cs = getComputedStyle(document.body);
      return { vp: document.querySelector('meta[name=viewport]').content, touchAction: cs.touchAction, moveBlocked: ev.defaultPrevented, overflow: getComputedStyle(document.documentElement).overflow + '/' + cs.overflow, position: cs.position }; })()`);
    check(/width=device-width/.test(pg.vp) && /user-scalable=no/.test(pg.vp) && /maximum-scale=1/.test(pg.vp), 'the page cannot be zoomed by the viewport meta');
    check(pg.touchAction === 'none' && pg.moveBlocked && pg.overflow === 'hidden/hidden' && pg.position === 'fixed', 'dragging or pinching never scrolls or zooms the page');
  });

  // The layout on many screen sizes. Portrait: game on top, menu buttons under it, controls at the bottom. Landscape: controls over the playfield,
  // menu buttons down the right edge. Nothing may leave the screen, overlap, be clipped, be smaller than 40 px or cover the game's text.
  const sweep = async (label, sizes) => {
    const bad = [];
    for (const [w, h] of sizes) {
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true }); await p.wait(120); await p.eval('fit()');
      const size = await p.eval('innerWidth + "x" + innerHeight');
      if (size !== w + 'x' + h) { bad.push(w + 'x' + h + ': the viewport is ' + size); continue; }
      for (const [name, setup, menus] of PHONE_PHASES) {
        await p.eval(setup);
        const texts = await p.eval('__draw()'), g = await p.eval('__geom()'), found = geomProblems(g, texts);
        const n = g.items.filter(i => i.type === 'menu').length;
        if (n !== menus) found.push(n + ' menu buttons instead of ' + menus);
        if (/fight|sudden/.test(name)) {
          if (g.items.filter(i => i.type === 'dpad').length !== 1 || g.items.filter(i => i.type === 'btn').length !== 4) found.push('the d-pad and four buttons are not all there');
          if (g.lay.stacked) for (const i of g.items) if ((i.type === 'dpad' || i.type === 'btn') && i.y0 < g.vh * 0.45) found.push(i.name + ' is not in the thumb zone');
        }
        verbose(w + 'x' + h + ' ' + name, found);
        for (const m of found) bad.push(w + 'x' + h + ' ' + name + ': ' + m);
      }
    }
    check(!bad.length, label + (bad.length ? ' (' + bad.length + ' problems)' + more(bad) : ''));
    return bad;
  };
  await group('layout, portrait', async () => {
    await p.eval(INIT); await p.eval(CAPTURE); await p.eval(GEOM);
    await sweep('portrait screens (' + SCREENS.portrait.map(s => s.join('x')).join(', ') + '): menus, versus, fight, pause and end screen fit, with every control on screen, reachable and clear of the game', SCREENS.portrait);
  });
  await group('layout, landscape', async () => {
    await sweep('landscape screens (' + SCREENS.landscape.map(s => s.join('x')).join(', ') + '): controls sit between the HUD bands and the menu buttons never cover the game text', SCREENS.landscape);
  });
  await group('rotating the phone', async () => {
    const seen = [];
    for (const [w, h] of [[844, 390], [390, 844], [844, 390]]) {   // the browser's own resize event must be enough: no fit() call here
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true }); await p.wait(250);
      await p.eval(PHONE_PHASES[3][1]);
      const texts = await p.eval('__draw()'), g = await p.eval('__geom()'), found = geomProblems(g, texts);
      seen.push((g.lay.stacked ? 'stacked' : 'overlay') + (found.length ? ' with problems: ' + found[0] : ''));
    }
    check(seen.join() === 'overlay,stacked,overlay', 'rotating the phone re-lays the game and the controls by itself' + (seen.join() === 'overlay,stacked,overlay' ? '' : ': ' + seen.join(' | ')));
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }); await p.wait(150);
  });

  check(!p.errors.length, 'no console errors on the phone' + (p.errors.length ? ': ' + p.errors.slice(0, 3).join(' | ') : ''));
  return ok;
}
