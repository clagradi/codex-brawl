// Core checks for the extension layer: BUS, HOOKS, SETTINGS, MODES, the engine events and hook points, the feature-file scaffolding and docs/ARCHITECTURE.md.
// Owner: scaffold. Feature checks go in their own tools/tests/<name>.mjs, never here. Run order: this file first, then the others alphabetically (tools/test-match.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EVENTS = ['phase', 'match:start', 'round:start', 'round:end', 'match:end', 'hit', 'block', 'knockdown', 'ko', 'throw', 'special', 'super', 'finisher', 'settings'];
export const HOOK_POINTS = ['input', 'update', 'fighterUpdate', 'damage', 'drawFighter', 'drawWorld', 'drawHud', 'drawTop', 'titleItems', 'pauseItems', 'musicTheme'];
const FEATURES = ['combat', 'arcade', 'training', 'arenas2', 'music2', 'options', 'touch'];
const LOAD_ORDER = ['bus.js', 'settings.js', 'modes.js', 'pixelfont.js', 'sprites.js', 'arenas.js', 'hud.js', 'music.js', 'moves.js', 'game.js', ...FEATURES.map(f => f + '.js')];

export async function run(t) {
  const { check, tap, stepUntil } = t, ev = t.eval;
  const clean = async (hash = '') => { await t.open(); await ev('localStorage.clear()'); await t.open(hash); };

  // ---- files and docs ----
  const dev = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8'), order = [...dev.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check(JSON.stringify(order.slice(0, LOAD_ORDER.length)) === JSON.stringify(LOAD_ORDER),'dev.html loads the scripts in the documented order: ' + order.join(' '));
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
  await clean();
  const keys = (await ev("SETTINGS.list().map(d => d.key)")).filter(k => !k.includes('.'));   // dotted keys belong to a feature file and are documented in docs/features/<name>.md
  for (const [kind, list] of [['BUS event', EVENTS], ['hook point', HOOK_POINTS], ['setting', keys], ['script', LOAD_ORDER]]) {
    const miss = list.filter(n => !doc.includes('`' + n + '`'));
    check(!miss.length, 'docs/ARCHITECTURE.md documents every ' + kind + (miss.length ? ' (missing: ' + miss.join(', ') + ')' : ''));
  }
  check(fs.existsSync(path.join(ROOT, 'docs', 'features', '.gitkeep')) && /^tools\/shots\/$/m.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), 'docs/features/ exists and tools/shots/ is git-ignored');
  check(FEATURES.every(f => fs.existsSync(path.join(ROOT, f + '.js')) && fs.existsSync(path.join(ROOT, 'tools', 'tests', f + '.mjs'))), 'every feature file has its test file');
  check(await ev("['COMBAT', 'ARCADE', 'TRAINING', 'ARENAS2', 'MUSIC2', 'OPTIONS', 'TOUCH'].every(n => window['STUB_' + n] === 1)"), 'all seven feature files load (marker globals)');
  check(await ev("ARENAS.length === 9 && typeof ARENAS.make === 'function' && ['R', 'grad', 'disc', 'fogDraw', 'motes', 'floorBase'].every(n => typeof ARENAS.kit[n] === 'function') && ARENAS.kit.AW === 480 && ARENAS.kit.AG === 234"), 'ARENAS.make and ARENAS.kit are there for arenas2.js; the shipped list has nine stages');
  check(await ev("typeof MUSIC.define === 'function' && typeof MUSIC.instrument === 'function' && MUSIC.themes().length >= 12"), 'MUSIC.define, MUSIC.instrument and MUSIC.themes are there for music2.js');

  // ---- BUS and HOOKS ----
  const b = await ev(`(() => {
    const out = {}, log = [], errs = [], old = console.error; console.error = m => errs.push(String(m));
    const off = BUS.on('t:a', x => log.push('a' + x)); BUS.once('t:a', x => log.push('once' + x)); BUS.emit('t:a', 1); BUS.emit('t:a', 2); off(); BUS.emit('t:a', 3); out.bus = log.join(',');
    let after = 0; BUS.on('t:boom', () => { throw new Error('boom'); }); BUS.on('t:boom', () => after++); BUS.emit('t:boom'); BUS.emit('t:boom'); out.boomLogs = errs.length; out.boomAfter = after;
    HOOKS.add('t:f', v => v + 'b', 5); HOOKS.add('t:f', v => v + 'a', 1); HOOKS.add('t:f', () => undefined); HOOKS.add('t:f', () => { throw new Error('bad'); });
    out.filter = HOOKS.filter('t:f', 'x') + ',' + HOOKS.filter('t:f', 'y'); out.hookLogs = errs.length - out.boomLogs;
    HOOKS.add('t:c', () => [1, 2]); HOOKS.add('t:c', () => 3); HOOKS.add('t:c', () => null); out.collect = HOOKS.collect('t:c').join(',');
    let runs = 0; const rm = HOOKS.add('t:r', (a, c) => { runs += a + c; }); HOOKS.run('t:r', 1, 2); rm(); HOOKS.run('t:r', 1, 2); out.run = runs; out.has = [HOOKS.has('t:r'), HOOKS.has('t:c')];
    out.untouched = HOOKS.filter('t:none', 7) === 7 && HOOKS.collect('t:none').length === 0;
    console.error = old; return out;
  })()`);
  check(b.bus === 'a1,once1,a2', 'BUS: on, once and the unsubscribe function: ' + b.bus);
  check(b.boomLogs === 1 && b.boomAfter === 2, 'BUS: a throwing handler is logged once and does not stop the others');
  check(b.filter === 'xab,yab' && b.hookLogs === 1, 'HOOKS.filter: handlers run by order, undefined keeps the value, a throw is logged once: ' + b.filter);
  check(b.collect === '1,2,3' && b.run === 3 && !b.has[0] && b.has[1] && b.untouched, 'HOOKS.collect flattens, HOOKS.run passes arguments, remove works, empty points are no-ops');

  // ---- SETTINGS ----
  const s = await ev(`(() => {
    const out = {}, evs = []; BUS.on('settings', e => evs.push(e.key + ':' + e.old + '>' + e.value));
    const core = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.includes('.')));   // feature keys (dotted) are checked by their own test files
    out.defaults = core(SETTINGS.all());
    out.clamp = [SETTINGS.set('rounds', 9), SETTINGS.set('rounds', 0), SETTINGS.set('time', 12), SETTINGS.set('musicVol', 0.123)];
    out.badEnum = SETTINGS.set('difficulty', 'nope'); out.enum = SETTINGS.set('difficulty', 'hard'); out.unknown = SETTINGS.get('no-such-key');
    out.stored = JSON.parse(localStorage.getItem('brawl.settings'));
    SETTINGS.set('rounds', 2); SETTINGS.set('rounds', 2); out.toggle = SETTINGS.toggle('gore'); out.fxGore = FX.gore; SETTINGS.set('gore', true); out.fxBack = FX.gore;
    SETTINGS.set('muted', true); out.muted = muted; setMuted(false); out.mutedBack = [muted, SETTINGS.get('muted')];
    out.events = evs; SETTINGS.reset(); out.after = core(SETTINGS.all()); return out;
  })()`);
  check(JSON.stringify(s.defaults) === JSON.stringify({ difficulty: 'normal', rounds: 2, time: 99, musicVol: 1, sfxVol: 1, voiceVol: 1, gore: true, muted: false, binds: null }), 'SETTINGS defaults match the shipped game: ' + JSON.stringify(s.defaults));
  check(JSON.stringify(s.clamp) === '[4,1,30,0.1]' && s.badEnum === 'normal' && s.enum === 'hard' && s.unknown === undefined, 'SETTINGS clamps numbers, steps them and rejects bad enum values: ' + JSON.stringify(s.clamp));
  check(s.stored && s.stored.rounds === 1 && s.stored.difficulty === 'hard', "SETTINGS persists to localStorage 'brawl.settings'");
  check(s.toggle === false && s.fxGore === false && s.fxBack === true && s.muted === true && s.mutedBack[0] === false && s.mutedBack[1] === false, "SETTINGS 'gore' and 'muted' stay in step with FX.gore and the muted flag");
  check(s.events.includes('rounds:2>4') && s.events.includes('difficulty:normal>hard') && !s.events.includes('rounds:2>2'), "BUS 'settings' fires { key, value, old } on a change only");
  check(JSON.stringify(s.after) === JSON.stringify(s.defaults), 'SETTINGS.reset() restores every default');
  await t.open(); await ev("SETTINGS.set('rounds', 3); SETTINGS.set('binds', { p1: { p: ['KeyG'] } })"); await t.open();
  check(await ev("SETTINGS.get('rounds') === 3 && JSON.stringify(MAP[0].p) === '[\"KeyG\"]' && MAP[0].k[0] === 'KeyK' && GAME_KEYS.has('KeyG')"), 'settings and key binds survive a reload; binds only replace the actions they name');
  check(await ev("(SETTINGS.set('binds', null), JSON.stringify(MAP[0].p) === '[\"KeyJ\"]' && JSON.stringify(ALT.p) === '[\"KeyZ\"]')"), 'clearing binds restores the default keys');
  await ev("localStorage.setItem('brawl.settings', '{not json')"); await t.open();
  check(await ev("SETTINGS.get('rounds') === 2 && game.phase === 'title'"), 'corrupt stored settings fall back to the defaults');
  await ev("localStorage.clear(); localStorage.setItem('brawl.gore', '0'); localStorage.setItem('brawl.muted', '1')"); await t.open();
  check(await ev("FX.gore === false && muted === true && SETTINGS.get('gore') === false && SETTINGS.get('muted') === true"), "the old 'brawl.gore' and 'brawl.muted' values carry over into SETTINGS");
  await ev("setGore(true); setMuted(false)");
  check(await ev("(() => { const o = JSON.parse(localStorage.getItem('brawl.settings')); return o.gore === true && o.muted === false; })()"), 'setGore and setMuted write through SETTINGS');

  // ---- MODES and the title menu ----
  await clean();
  const m0 = await ev("({ ids: MODES.list().map(m => m.id), labels: titleItems().map(i => i.label), slot: titleSlot(1, 2), five: [0, 1, 2, 3, 4].map(i => titleSlot(i, 5)), modeId: game.modeId, mode: game.mode })");
  check(JSON.stringify(m0.ids) === '["versus","versus2"]' && JSON.stringify(m0.labels) === '["1 PLAYER VS CPU","2 PLAYERS"]' && m0.modeId === 'versus' && m0.mode === 1, 'the title menu is built from MODES and starts as the shipped two entries');
  check(m0.slot.y === 476 && m0.slot.on === 28 && m0.slot.off === 22 && m0.five.every(q => q.x > 0 && q.x < 960 && q.y > 400 && q.y < 500), 'two title entries keep their classic place; five fit on screen');
  await tap('KeyS'); await tap('Enter'); await t.wait(50);
  check(await ev("game.phase === 'select' && game.mode === 2 && game.modeId === 'versus2'"), 'S + Enter on the title picks 2 PLAYERS');
  await t.open(); await tap('Enter'); await t.wait(50);
  check(await ev("game.phase === 'select' && game.mode === 1 && game.modeId === 'versus'"), 'Enter on the title picks 1 PLAYER VS CPU');
  await t.open();
  await ev(`window.__ran = 0; window.__picked = null; HOOKS.add('titleItems', () => [{ id: 'x1', label: 'ZED ITEM', order: 5, run: () => { window.__ran++; } }, { id: 'x2', label: 'LAST ONE', order: 200 }]);
    MODES.register({ id: 'tmode', label: 'TEST MODE', order: 15, players: 2, onPick: g => { window.__picked = g.modeId; return false; } }); render();`);
  check(await ev("JSON.stringify(titleItems().map(i => i.id)) === '[\"x1\",\"versus\",\"tmode\",\"versus2\",\"x2\"]'"), 'extra title items and registered modes sort by order');
  await tap('Enter'); await tap('KeyS'); await tap('KeyS'); await tap('Enter'); await t.wait(50);
  check(await ev("window.__ran === 1 && window.__picked === 'tmode' && game.mode === 2 && game.phase === 'title' && game.titleSel === 2"), 'a title item runs, a mode with onPick returning false stays on the title');
  await tap('KeyW'); await tap('KeyW'); await tap('KeyW'); await tap('KeyW'); await tap('KeyW'); await tap('KeyW'); await t.wait(30);
  check(await ev("game.titleSel === 1 && (render(), true)"), 'the title menu wraps around and draws five entries');

  // ---- engine events through a whole CPU match (one round to win keeps it short) ----
  await t.open('#select');
  await ev(`window.__log = []; for (const n of ${JSON.stringify(EVENTS)}) BUS.on(n, p => window.__log.push([n, p])); hold(true);
    SETTINGS.set('rounds', 1); game.sel = [0, 1]; game.mode = 1; startMatch(); game.f[0].cpu = game.f[1].cpu = true;`);
  check(await stepUntil('over', 30000) === 'over', 'a one-round CPU match reaches the end screen');
  const r = await ev(`(() => {
    const L = window.__log, names = L.map(x => x[0]), c = n => names.filter(x => x === n).length, first = n => names.indexOf(n), ph = L.filter(x => x[0] === 'phase').map(x => x[1]);
    const re = L.find(x => x[0] === 'round:end'), me = L.find(x => x[0] === 'match:end'), rs = L.find(x => x[0] === 'round:start'), ms = L.find(x => x[0] === 'match:start'), h = L.find(x => x[0] === 'hit');
    return { ms: c('match:start'), me: c('match:end'), rs: c('round:start'), re: c('round:end'), hit: c('hit'), set: c('settings'),
      order: first('match:start') < first('round:start') && first('round:start') < first('round:end') && first('round:end') < first('match:end'),
      chain: ph.length > 5 && ph[0].from === 'select' && ph[ph.length - 1].to === 'over' && ph.every((e, i) => i === 0 || ph[i - 1].to === e.from),
      shapes: !!ms && ms[1].modeId === 'versus' && ms[1].fighters.length === 2 && !!rs && rs[1].round === 1 && rs[1].time === 99 && rs[1].sudden === false
        && !!re && ['ko', 'time', 'draw'].includes(re[1].reason) && Array.isArray(re[1].wins) && !!me && me[1].winner.d && me[1].loser.d && me[1].wins[0] + me[1].wins[1] === 1
        && !!h && !!h[1].src && !!h[1].victim && h[1].dmg > 0 && typeof h[1].kind === 'string' };
  })()`);
  check(r.ms === 1 && r.me === 1 && r.rs >= 1 && r.re >= 1 && r.hit > 0 && r.set === 1 && r.order, 'match:start, round:start, round:end, match:end and hit fire in order: ' + JSON.stringify(r));
  check(r.chain, "BUS 'phase' reports every phase change as { from, to } with no gaps");
  check(r.shapes, 'event payloads carry the documented fields');

  // ---- hook points and the remaining events, driven directly in a fight ----
  await t.open('#demo=0,1&stop');
  const d = await ev(`(() => {
    const out = {}; let n = 0; while (game.phase !== 'fight' && n++ < 2000) step(1); out.phase = game.phase;
    const [a, b] = game.f, got = []; for (const k of ['special', 'super', 'throw', 'hit', 'knockdown', 'block']) BUS.on(k, () => got.push(k));
    a.cpu = b.cpu = false; a.set('idle'); b.set('idle'); a.x = 400; b.x = 470; a.face = 1; b.face = -1; b.inv = 0; a.cool = 0; a.back = b.back = false;
    const hp0 = b.hp, rmDmg = HOOKS.add('damage', pl => { pl.dmg = 0; }); b.takeHit(a, 10, 3, 14, 'punch'); out.zeroDamage = b.hp === hp0; rmDmg();
    b.set('idle'); b.inv = 0; b.takeHit(a, 5, 3, 14, 'kick', { knock: true }); out.knocked = b.state;
    b.set('idle'); b.inv = 0; b.set('block'); b.takeHit(a, 5, 3, 14, 'punch');
    const rmIn = HOOKS.add('input', (i, side, f) => { i.p = true; i.side = side; i.same = f === a; return i; }); const i0 = a.input(); out.input = [i0.p, i0.side, i0.same]; rmIn();
    let up = 0, fu = 0, df = 0, dw = 0, dh = 0, dt = 0, pauseRan = 0; HOOKS.add('update', g => { if (g === game) up++; }); HOOKS.add('fighterUpdate', (x, y) => { if (x === a && y === b) fu++; });
    HOOKS.add('drawFighter', (c, f) => { if (c === ctx && f.d) df++; }); HOOKS.add('drawWorld', (c, g) => { if (c === ctx && g === game) dw++; }); HOOKS.add('drawHud', () => dh++); HOOKS.add('drawTop', () => dt++);
    a.set('idle'); b.set('idle'); a.x = 300; b.x = 700; game.hitstop = 0; game.slow = 0; game.proj = []; step(3); render(); out.hooks = [up, fu, df, dw, dh, dt];
    HOOKS.add('pauseItems', () => ({ key: 'KeyH', label: 'H TEST', run: () => pauseRan++ })); game.phase = 'pause'; pressed.KeyH = true; step(1); render(); out.pauseRan = pauseRan; game.phase = 'fight';
    a.set('idle'); b.set('idle'); b.x = a.x + 50; a.x = 400; b.x = 450; a.startThrow(b); a.set('idle'); b.set('idle');
    a.startMove(MOVES[a.d.id].sp[0], 'special', b); a.set('idle'); a.startMove(MOVES[a.d.id].su, 'super', b);
    out.got = got.join(','); return out;
  })()`);
  check(d.phase === 'fight' && d.zeroDamage && d.knocked === 'down', "HOOKS 'damage' can change the numbers before they apply (zeroed here)");
  check(d.input[0] === true && d.input[1] === 0 && d.input[2] === true, "HOOKS 'input' receives the input object, the player index and the fighter");
  check(d.hooks[0] === 3 && d.hooks[1] === 3 && d.hooks[2] >= 2 && d.hooks[3] === 1 && d.hooks[4] === 1 && d.hooks[5] === 1, "HOOKS update, fighterUpdate, drawFighter, drawWorld, drawHud and drawTop are called: " + JSON.stringify(d.hooks));
  check(d.pauseRan === 1, "HOOKS 'pauseItems' keys run in the pause phase");
  for (const k of ['hit', 'knockdown', 'block', 'throw', 'special', 'super']) check(d.got.split(',').includes(k), "BUS '" + k + "' fires");

  // ---- the settings that change the match ----
  await t.open('#select');
  const dd = await ev(`(() => {
    const out = {}; SETTINGS.set('difficulty', 'hard'); SETTINGS.set('time', 45); game.sel = [0, 1]; game.mode = 1; startMatch(); out.hard = game.cpuLevel; startRound(); out.time = game.timer; nextRound(); out.ramp = game.cpuLevel;
    SETTINGS.set('difficulty', 'easy'); startMatch(); out.easy = game.cpuLevel; SETTINGS.reset(); startMatch(); out.normal = game.cpuLevel; startRound(); out.dflt = game.timer; game.sudden = true; startRound(); out.sudden = game.timer; game.sudden = false;
    SETTINGS.set('rounds', 3); out.rtw = [roundsToWin(), suddenRound()]; game.wins = [2, 0]; nextRound(); out.mid = game.phase; game.wins = [3, 0]; nextRound(); out.end = game.phase; SETTINGS.reset();
    return out;
  })()`);
  check(Math.abs(dd.hard - 0.7) < 1e-9 && Math.abs(dd.ramp - 0.95) < 1e-9 && Math.abs(dd.easy - 0.2) < 1e-9 && Math.abs(dd.normal - 0.45) < 1e-9, "SETTINGS 'difficulty' sets the CPU level and its ramp (normal is the shipped 0.45): " + JSON.stringify([dd.hard, dd.ramp, dd.easy, dd.normal]));
  check(dd.time === 45 && dd.dflt === 99 && dd.sudden === 30, "SETTINGS 'time' sets the round clock, sudden death stays 30");
  check(dd.rtw[0] === 3 && dd.rtw[1] === 6 && dd.mid === 'intro' && dd.end === 'outro', "SETTINGS 'rounds' sets the wins needed and the sudden death round");
  if (await ev("!!AC && AC.state === 'running'")) {
    const g = await ev(`(() => { const got = []; const mk = AC.createGain.bind(AC); AC.createGain = () => { const n = mk(); got.push(n); return n; };
      beep(440, 0.01, 'square', 0.06); const full = got[got.length - 1].gain.value; SETTINGS.set('sfxVol', 0.5); beep(440, 0.01, 'square', 0.06); const half = got[got.length - 1].gain.value; SETTINGS.reset(); AC.createGain = mk; return [full, half]; })()`);
    check(Math.abs(g[0] - 0.09) < 1e-6 && Math.abs(g[1] - 0.045) < 1e-6, "SETTINGS 'sfxVol' scales the effect gain (1 = the shipped level): " + JSON.stringify(g));
  } else check(true, "'sfxVol' gain check skipped: no running audio context in this browser");
  await ev('localStorage.clear()');
}
