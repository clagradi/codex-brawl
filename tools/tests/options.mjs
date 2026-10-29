// Tests for options.js (options screen, key rebinding, pause menu, fullscreen key) and the PWA files. Owner: the options agent. Runs after core.mjs;
// `t` is described in docs/ARCHITECTURE.md (How to add a test). Everything that steps the game holds the clock first, so no check depends on wall-clock time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWN = ['musicVol', 'sfxVol', 'voiceVol', 'rounds', 'time', 'infTime', 'difficulty', 'shake', 'reduceFlash', 'crt', 'announcer', 'trackToast', 'gore'];

export async function run(t) {
  const { check, stepUntil } = t, ev = t.eval;
  const tap = async c => { await t.p.tap(c); await ev('step(2)'); };   // the clock is held: the key edge is read by the two steps that follow
  const wipe = () => ev(`localStorage.removeItem('brawl.settings')`);
  const fresh = async () => { await t.open(); await wipe(); await t.open(); await ev('hold(true); step(3)'); };   // a page with the stored settings cleared and the clock held
  const startFight = async () => {
    await ev('game.sel = [0, 1]; game.mode = 1; startMatch();');
    const ph = await stepUntil('fight', 4000); await ev('step(20)'); return ph;
  };

  // ---- the options screen opens from the title and from the pause menu, by keys ----
  await fresh();
  const at = await ev(`titleItems().findIndex(i => i.id === 'options')`);
  check(at > 0 && await ev(`titleItems()[${at}].label`) === 'OPTIONS', 'the title menu lists an OPTIONS entry');
  for (let i = 0; i < at; i++) await tap('KeyS');
  await tap('Enter');
  check(await ev(`game.phase === 'title' && OPTIONS.screen === 'options'`), 'title: S then Enter on OPTIONS opens the options screen');
  const rows = await ev('OPTIONS.rows()');
  const need = ['MUSIC', 'EFFECTS', 'VOICE', 'ROUNDS', 'ROUND TIME', 'DIFFICULTY', 'SCREEN SHAKE', 'REDUCE FLASH', 'CRT FILTER', 'ANNOUNCER', 'TRACK TOAST', 'BLOOD', 'CONTROLS', 'RESET TO DEFAULTS', 'BACK'];
  check(need.every(r => rows.includes(r)), 'the options list has volumes, rounds, time, difficulty, shake, flash, CRT, announcer, toast, blood, controls and reset' + (need.every(r => rows.includes(r)) ? '' : ': ' + rows.join(', ')));
  check(await ev(`SETTINGS.list().find(x => x.key === 'difficulty').values.join()`) === 'easy,normal,hard,nightmare' && await ev(`Array.isArray(DIFFICULTY.nightmare) && DIFFICULTY.nightmare[0] > DIFFICULTY.hard[0]`), 'difficulty has four steps and nightmare is harder than hard');
  await tap('Escape');
  check(await ev(`OPTIONS.screen === null && game.phase === 'title'`), 'title: Esc leaves the options back to the title');

  check(await startFight() === 'fight', 'a match starts for the pause tests');
  await tap('KeyP');
  check(await ev(`game.phase === 'pause' && OPTIONS.screen === null`), 'P pauses and shows the pause menu');
  await tap('KeyO');
  check(await ev(`OPTIONS.screen === 'options'`), 'pause: the O key opens the options screen');
  await tap('Escape');
  check(await ev(`OPTIONS.screen === null && game.phase === 'pause'`), 'pause: Esc goes back to the pause menu, not to the fight');
  await tap('KeyS'); await tap('KeyS'); await tap('Enter');
  check(await ev(`OPTIONS.screen === 'options'`), 'pause: S S Enter on the OPTIONS row opens the options screen');
  await tap('Escape'); await tap('Escape');
  check(await ev(`game.phase === 'fight'`), 'pause: Esc on the pause menu resumes the fight');
  await tap('KeyP'); await tap('KeyS'); await tap('Enter');
  check(await ev(`OPTIONS.screen === 'moves'`), 'pause: the MOVES row still shows the move lists');
  await tap('Escape'); await tap('KeyS'); await tap('KeyS'); await tap('KeyS'); await tap('Enter');
  check(await ev(`OPTIONS.screen === 'quit' && OPTIONS.state.qsel === 1`), 'pause: QUIT TO TITLE asks first, with NO selected');
  await tap('Enter');
  check(await ev(`game.phase === 'pause' && OPTIONS.screen === null`), 'pause: answering NO keeps the match');
  await tap('Enter'); await tap('KeyA'); await tap('Enter');
  check(await ev(`game.phase === 'title'`), 'pause: QUIT, then YES, goes to the title');

  // ---- bars, toggles and RESET TO DEFAULTS write through SETTINGS ----
  await fresh();
  await ev(`OPTIONS.open('options')`);
  for (let i = 0; i < 3; i++) await tap('KeyS');   // MUSIC, EFFECTS, VOICE, ROUNDS
  await tap('KeyA');
  check(await ev(`OPTIONS.rows()[3] === 'ROUNDS' && SETTINGS.get('rounds') === 1`), 'ROUNDS: left from best of 3 gives best of 1');
  await tap('KeyD'); await tap('KeyD');
  check(await ev(`SETTINGS.get('rounds') === 3`), 'ROUNDS: right steps through best of 3 to best of 5');
  await tap('KeyS'); await tap('KeyD');
  check(await ev(`OPTIONS.rows()[4] === 'ROUND TIME' && SETTINGS.get('infTime') === true`), 'ROUND TIME: right from 99 seconds gives INFINITE');
  await tap('KeyD');
  check(await ev(`SETTINGS.get('infTime') === false && SETTINGS.get('time') === 30`), 'ROUND TIME: and on round to 30 seconds');
  await ev(`SETTINGS.set('musicVol', 0.3); SETTINGS.set('difficulty', 'nightmare'); SETTINGS.set('crt', true); SETTINGS.set('shake', 'off'); SETTINGS.set('binds', { p1: { p: ['KeyG'] } })`);
  const rd = await ev(`OPTIONS.rows().indexOf('RESET TO DEFAULTS')`);
  await ev(`OPTIONS.state.osel = ${rd}`);
  await tap('Enter');
  check(await ev(`SETTINGS.get('musicVol') === 0.3 && SETTINGS.get('crt') === true`), 'RESET TO DEFAULTS: the first press only asks');
  await tap('Enter');
  check(await ev(`SETTINGS.get('musicVol') === 1 && SETTINGS.get('rounds') === 2 && SETTINGS.get('time') === 99 && SETTINGS.get('infTime') === false && SETTINGS.get('difficulty') === 'normal' && SETTINGS.get('crt') === false && SETTINGS.get('shake') === 'full'`), 'RESET TO DEFAULTS: the second press restores the option values');
  check(await ev(`JSON.stringify(SETTINGS.get('binds')) === '{"p1":{"p":["KeyG"]}}'`), 'RESET TO DEFAULTS leaves the key bindings alone');
  await ev(`SETTINGS.set('binds', null)`);

  // ---- every effect switch draws without errors (the suite fails on any console error) ----
  await ev(`SETTINGS.set('shake', 'off'); SETTINGS.set('reduceFlash', true); SETTINGS.set('crt', true); SETTINGS.set('announcer', false); SETTINGS.set('trackToast', false); SETTINGS.set('infTime', true)`);
  check(await startFight() === 'fight', 'a match starts with every effect switch changed');
  await ev(`game.shake = 8; game.flash = 0.9; render(); step(30); render();`);
  check(await ev(`game.phase === 'fight'`), 'the fight draws and runs with shake off, flash reduced, CRT on, announcer off and no clock');
  await ev(`for (const k of ${JSON.stringify(OWN)}) SETTINGS.reset(k)`);

  // ---- music volume: set on the options screen, stored in brawl.settings, read by the audio ----
  await t.open();
  await t.tap('KeyW');   // the first key starts the audio; the cursor wraps round to the last entry, OPTIONS
  const until = async (expr, ms) => { for (let i = 0; i < ms / 50; i++) { if (await ev(expr)) return true; await t.wait(50); } return false; };
  const rms = ms => ev(`new Promise(res => { const m = MUSIC.master, an = AC.createAnalyser(), buf = new Float32Array(2048); an.fftSize = 2048; m.connect(an); let ss = 0, n = 0;
    const iv = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) { ss += v * v; n++; } }, 25); setTimeout(() => { clearInterval(iv); m.disconnect(an); res(Math.sqrt(ss / n)); }, ${ms}); })`);
  check(await until('MUSIC.now === "title"', 1500), 'the title music starts after the first key');
  const loud = await rms(1200);
  await t.tap('Enter');
  check(await ev(`OPTIONS.screen === 'options' && OPTIONS.state.osel === 0`), 'the OPTIONS entry opens with MUSIC selected');
  for (let i = 0; i < 10; i++) await t.tap('KeyA');
  check(await ev(`SETTINGS.get('musicVol') === 0`), 'ten steps left set the music volume to 0');
  check(await ev(`JSON.parse(localStorage.getItem('brawl.settings')).musicVol === 0`), 'the music volume is stored in brawl.settings');
  await t.wait(800);
  const quiet = await rms(1200);
  check(loud > 0.03 && quiet < 0.005, `the audio follows the music volume (RMS ${loud.toFixed(3)} at full, ${quiet.toFixed(4)} at 0)`);
  await t.tap('Escape');
  await t.open();
  check(await ev(`SETTINGS.get('musicVol') === 0`), 'the music volume survives a reload');
  await ev(`SETTINGS.reset('musicVol')`);

  // ---- rebinding through the CONTROLS screen, then a scripted fight ----
  await fresh();
  check(await startFight() === 'fight', 'a match starts for the rebinding test');
  await tap('KeyP');
  await tap('KeyS'); await tap('KeyS'); await tap('KeyS'); await tap('Enter');
  check(await ev(`OPTIONS.screen === 'controls'`), 'pause: the CONTROLS row opens the key screen');
  for (let i = 0; i < 4; i++) await tap('KeyS');   // LEFT RIGHT UP DOWN, then PUNCH; the P1 column is selected first
  await tap('Enter');
  check(await ev(`OPTIONS.capturing && OPTIONS.state.crow === 4 && OPTIONS.state.ccol === 0`), 'Enter on P1 PUNCH waits for a key');
  await tap('KeyK');
  check(await ev(`OPTIONS.capturing && OPTIONS.warning && /KICK/.test(OPTIONS.message) && SETTINGS.get('binds') === null && MAP[0].p[0] === 'KeyJ'`), 'a key that P1 already uses for KICK is refused with a visible warning');
  await tap('KeyP');
  check(await ev(`OPTIONS.capturing && OPTIONS.warning && game.phase === 'pause'`), 'a reserved key (pause) is refused as well and does not resume the fight');
  await tap('KeyG');
  check(await ev(`!OPTIONS.capturing && !OPTIONS.warning && MAP[0].p[0] === 'KeyG' && SETTINGS.get('binds').p1.p[0] === 'KeyG'`), 'a free key is taken: MAP and the stored binds follow');
  check(await ev(`LABEL[0].p === 'G'`), 'the on-screen label for P1 PUNCH follows the new key');
  await tap('Escape'); await tap('KeyP');
  check(await ev(`game.phase === 'fight'`), 'back out of the controls screen and resume');
  await ev(t.park + '; step(1)'); await tap('KeyG');
  check(await ev(`/^punch/.test(game.f[0].state)`), 'the new key punches in the fight');
  await ev(t.park + '; step(1)'); await tap('KeyJ');
  check(await ev(`!/^punch/.test(game.f[0].state)`), 'the old key no longer punches');
  await ev(`SETTINGS.set('binds', null)`);
  check(await ev(`MAP[0].p[0] === 'KeyJ' && LABEL[0].p === 'J'`), 'clearing the binds brings back the default key and label');
  check(await ev(`OPTIONS.reserved('KeyP') && OPTIONS.reserved('Escape') && !OPTIONS.reserved('KeyG')`), 'pause, back and the other engine keys are reserved, ordinary keys are not');

  // ---- rounds and round time reach the engine ----
  await t.open('#select'); await ev('hold(true)');
  await ev(`SETTINGS.set('rounds', 1); window.__re = 0; BUS.on('round:end', () => { window.__re++; }); game.sel = [0, 1]; game.mode = 1; startMatch(); game.f[0].cpu = game.f[1].cpu = true;`);
  check(await stepUntil('over', 30000) === 'over', 'best of 1: a CPU match reaches the end screen');
  check(await ev(`window.__re >= 1 && Math.max(game.wins[0], game.wins[1]) === 1 && (game.round === 1 || window.__re === game.round)`), 'best of 1: the match ends after the first decided round');
  await ev(`SETTINGS.reset('rounds')`);

  await t.open('#select'); await ev('hold(true)');
  await ev(`SETTINGS.set('time', 30); SETTINGS.set('infTime', false); window.__re = 0; BUS.on('round:end', () => { window.__re++; }); game.sel = [0, 1]; game.mode = 1; startMatch();`);
  await stepUntil('fight', 4000);
  await ev(t.park + '; step(1); step(2000)');
  check(await ev(`window.__re === 1`), 'control: with a 30 second clock and nobody fighting, the round ends on the clock');
  await t.open('#select'); await ev('hold(true)');
  await ev(`SETTINGS.set('time', 30); SETTINGS.set('infTime', true); window.__re = 0; BUS.on('round:end', () => { window.__re++; }); game.sel = [0, 1]; game.mode = 1; startMatch();`);
  await stepUntil('fight', 4000);
  await ev(t.park + '; step(1)');
  let alive = true;
  for (let i = 0; i < 7 && alive; i++) { await ev(t.park + '; step(1000)'); alive = await ev(`game.phase === 'fight' && window.__re === 0 && game.timer > 0`); }
  check(alive, 'infinite time: 7000 stepped ticks with nobody fighting never end the round');

  // ---- fullscreen: the F key never throws (headless Chrome refuses, the page must shrug) ----
  await fresh();
  await tap('KeyF');
  check(await ev(`game.phase === 'title' && typeof OPTIONS.fullscreen === 'function'`), 'F asks for fullscreen on the title without breaking the page');

  // ---- PWA files: manifest, icons and the tags that link them ----
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check(man.name === 'AGENT BRAWL' && man.display === 'standalone' && man.orientation === 'landscape' && /^#[0-9a-f]{6}$/i.test(man.theme_color) && /^#[0-9a-f]{6}$/i.test(man.background_color), 'manifest.webmanifest: name, standalone, landscape and theme colours');
  const png = f => { const b = fs.readFileSync(path.join(ROOT, f)); return b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const sizes = (man.icons || []).map(i => { const d = png(i.src); return d && i.sizes === d[0] + 'x' + d[1] ? i.sizes : null; });
  check(sizes.includes('192x192') && sizes.includes('512x512') && !sizes.includes(null), 'the manifest icons exist as PNG files of the sizes they declare (192 and 512)');
  check(JSON.stringify(png('icons/apple-touch-icon.png')) === '[180,180]', 'icons/apple-touch-icon.png is 180x180');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(/<link rel="manifest" href="manifest\.webmanifest">/.test(html) && /rel="apple-touch-icon"/.test(html) && /name="apple-mobile-web-app-capable" content="yes"/.test(html) && /name="theme-color"/.test(html), 'index.html links the manifest, the apple touch icon and the theme colour');
  check(fs.existsSync(path.join(ROOT, 'tools', 'make-icons.mjs')), 'tools/make-icons.mjs renders the icons from the game');

  // leave a clean slate for the test files that run after this one
  await t.open(); await wipe(); await t.open();
}
