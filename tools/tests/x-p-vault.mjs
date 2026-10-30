// Tests for p-vault.js: the EXTRAS screen (fighter gallery, arena gallery, colourways, lifetime stats). Owner: the p-vault agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// Everything is deterministic: the real-time loop is frozen with hold(true), keys are real key events followed by step(1), and the screen is compared as pixels
// (the canvas region is hashed after render()). Stats are driven by fabricated BUS events and by one real match started with startMatch().
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function run(t) {
  try { await body(t); } finally { try { await t.eval('window.VAULT && VAULT.reset(); localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }
}

async function body(t) {
  const { check, tap } = t, ev = t.eval, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const errors0 = t.p.errors.length;
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

  // ---- the files ----
  const src = read('p-vault.js'), dev = read('dev.html'), html = read('index.html'), arch = read('docs/ARCHITECTURE.md'), readme = read('README.md');
  check(/^\/\/ ===== AGENT BRAWL feature file: P-VAULT/.test(src) && /^'use strict';$/m.test(src) && /window\.STUB_VAULT = 1;/.test(src), 'p-vault.js has the feature-file header, strict mode and its marker');
  check(!/localStorage|sessionStorage|\bfetch\(|XMLHttpRequest|WebSocket|\beval\(|new Function|console\.|import\(|Math\.random/.test(src), 'p-vault.js touches no storage directly, makes no network request, no eval, no console output, no random numbers (SETTINGS is the only store)');
  check(same([...src.matchAll(/\bwindow\.([A-Za-z_]\w*)\s*=[^=]/g)].map(m => m[1]).sort(), ['STUB_VAULT', 'VAULT']), 'p-vault.js adds exactly two globals: STUB_VAULT and VAULT');
  check(dev.indexOf('<script src="p-vault.js"></script>') > dev.indexOf('<script src="vfx.js"></script>') && html.includes('window.STUB_VAULT'), 'dev.html loads p-vault.js after vfx.js and index.html carries it');
  check(fs.existsSync(path.join(ROOT, 'docs', 'features', 'p-vault.md')) && arch.includes('`p-vault.js`') && arch.includes('`vault.stats`') && /EXTRAS/.test(readme), 'the feature notes, the ARCHITECTURE rows and the README line are there');

  // ---- page helpers ----
  const HELPERS = `window.__vh = (x, y, w, h) => { render(); render(); const d = ctx.getImageData(x, y, w, h).data; let a = 0; for (let i = 0; i < d.length; i += 4) a = (Math.imul(a, 31) + d[i] + (d[i + 1] << 8) + (d[i + 2] << 16)) | 0; return a; };
    window.__ptr = (x, y, type) => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x * r.width / W, clientY: r.top + y * r.height / H, pointerType: type || 'mouse', bubbles: true, cancelable: true })); };
    1`;
  const VIEW = '60,130,520,340';   // the sprite viewer of the fighters tab (and nothing that animates by itself)
  const fresh = async (hash, keep) => {   // a clean page, frozen; 'keep' leaves the stored settings alone
    if (!keep) { try { await ev('window.VAULT && VAULT.reset(); SETTINGS.reset(); localStorage.clear(); 1'); } catch (e) { /* first load */ } }
    await t.open(hash || ''); await ev('hold(true); ' + HELPERS);
  };
  const press = async code => { await tap(code); await ev('step(1); 1'); };   // a real key event, then one tick that consumes it
  const openVault = async () => { await ev("game.titleSel = titleItems().findIndex(i => i.id === 'vault'); step(1); 1"); await press('Enter'); };
  const V = k => ev('VAULT.state.' + k);
  const hash = (rect = VIEW) => ev(`__vh(${rect})`);
  const rect = async id => ev("render(); VAULT.hits().find(h => h.id === '" + id + "') || null");
  const click = async id => { const h = await rect(id); if (!h) return false; await ev(`__ptr(${h.x + h.w / 2}, ${h.y + h.h / 2}); 1`); return true; };
  const distinct = a => new Set(a).size === a.length;

  await t.open(); await ev('localStorage.clear(); 1');
  await fresh('', true);

  // ---- registration ----
  const items = await ev("titleItems().map(i => i.id)");
  check(await ev("typeof VAULT === 'object' && window.STUB_VAULT === 1") && items.includes('vault') && await ev("titleItems().find(i => i.id === 'vault').label") === 'EXTRAS', 'the title menu offers EXTRAS: ' + items.join(' '));
  check(items.indexOf('vault') > items.indexOf('stats') && items.indexOf('vault') < items.indexOf('options'), 'EXTRAS sits between the game entries and OPTIONS');
  check(await ev("SETTINGS.list().some(d => d.key === 'vault.stats')") && (await ev('VAULT.stats().m + VAULT.stats().r + VAULT.stats().combo')) === 0, 'the setting vault.stats is defined and a new profile starts with an all-zero record');
  check(same(await ev('VAULT.TABS'), ['FIGHTERS', 'ARENAS', 'COLOURWAYS', 'STATS']) && !(await ev('VAULT.isOpen()')) && (await ev('VAULT.hits().length')) === 0, 'four tabs, closed at the start, nothing hit-testable while closed');

  // ---- opening, closing and the engine menu ----
  await openVault();
  const sel = await ev('game.titleSel');
  check((await ev('VAULT.isOpen()')) && (await ev('game.phase')) === 'title' && (await V('tab')) === 0, 'Enter on EXTRAS opens the vault on the fighters tab and the engine stays in the title phase');
  await press('ArrowDown'); await press('KeyS'); await press('ArrowUp'); await press('Space');
  check((await ev('game.titleSel')) === sel && (await ev('game.phase')) === 'title' && (await ev('VAULT.isOpen()')), 'while the vault is open the title menu does not see the keys (no selection change, no mode started)');
  await press('Escape');
  check(!(await ev('VAULT.isOpen()')) && (await ev('game.titleSel')) === sel && (await ev('game.phase')) === 'title', 'Esc closes the vault and the title menu is where it was');
  await press('ArrowDown');
  check((await ev('game.titleSel')) !== sel, 'with the vault closed the title menu moves again');
  await ev('game.titleSel = 3; 1'); await press('KeyV');
  check((await ev('VAULT.isOpen()')) && (await ev('game.phase')) === 'title' && (await ev('game.titleSel')) === 3, 'V on the title opens the vault whatever the menu selection (the menu can be too long to show the entry)');
  await press('Escape');
  check(!(await ev('VAULT.isOpen()')) && (await ev('game.titleSel')) === 3, 'and Esc leaves the selection where it was');
  await ev("game.titleSel = 2; VAULT.open(); step(1); 1");
  await press('Backspace');
  check(!(await ev('VAULT.isOpen()')) && (await ev('game.titleSel')) === 2, 'Backspace goes back too and the earlier title selection is restored');
  await ev('VAULT.open(); step(1); game.phase = "select"; step(1); 1');
  check(!(await ev('VAULT.isOpen()')), 'another phase taking over closes the vault');
  await ev('game.phase = "title"; 1');
  const st0 = await V('st');
  await ev('step(50); 1');
  check((await V('st')) === st0 && (await ev('render(); VAULT.hits().length')) === 0, 'a closed vault does no work: no clock, no hit rectangles');

  // ---- tabs ----
  await fresh(); await openVault();
  for (const [code, want] of [['KeyE', 1], ['KeyE', 2], ['KeyE', 3], ['KeyE', 0], ['KeyQ', 3], ['KeyQ', 2], ['Digit2', 1], ['Digit4', 3], ['Digit1', 0], ['PageDown', 1], ['PageUp', 0]]) {
    await press(code); const got = await V('tab');
    if (got !== want) check(false, code + ' goes to tab ' + want + ' (got ' + got + ')');
  }
  check((await V('tab')) === 0, 'Q and E, PageUp and PageDown and the digit keys switch tabs and wrap around');
  const tabHashes = [];
  for (let i = 0; i < 4; i++) { await ev(`VAULT.setTab(${i}); 1`); tabHashes.push(await hash('0,0,960,540')); }
  check(distinct(tabHashes), 'the four tabs draw four different screens');

  // ---- fighters tab ----
  await fresh(); await openVault();
  check((await V('fi')) === 0 && (await V('an')) === 0, 'the viewer starts on the fighter picked on the select screen (Tibo) and the idle animation');
  await press('ArrowRight'); await press('KeyD');
  check((await V('fi')) === 2, 'right arrow and D browse to the next fighters');
  await press('ArrowLeft'); await press('KeyA'); await press('ArrowLeft');
  check((await V('fi')) === 4, 'browsing left from the first fighter wraps to the last one (five fighters, no more)');
  check((await ev('ROSTER.length')) === 5, 'the roster is still five fighters');
  const anims = await ev('VAULT.anims()');
  check(anims.length === 11 && distinct(anims) && ['idle', 'walk', 'jump', 'punch', 'kick', 'special', 'super', 'block', 'hit', 'ko', 'win'].every(n => anims.some(a => String(a).toLowerCase() === n)), 'the animation picker lists the eleven animations: ' + anims.join(' '));
  for (let i = 0; i < 11; i++) await press('ArrowDown');
  check((await V('an')) === 0, 'the animation picker wraps after eleven steps');
  await press('ArrowUp');
  check((await V('an')) === 10, 'up from idle wraps to the last animation');
  const fh = await ev('[0, 1, 2, 3, 4].map(i => { VAULT.state.fi = i; VAULT.state.an = 0; VAULT.state.t0 = VAULT.state.st; return __vh(' + VIEW + '); })');
  check(distinct(fh), 'the viewer draws a different picture for each of the five fighters');
  const ah = await ev('VAULT.anims().map((n, i) => { VAULT.state.an = i; VAULT.state.t0 = VAULT.state.st; return __vh(' + VIEW + '); })');
  check(distinct(ah), 'the viewer draws a different frame for each of the eleven animations');
  await ev('VAULT.state.an = 1; VAULT.state.t0 = VAULT.state.st; 1');
  const w0 = await hash();
  await ev('step(14); 1');
  check((await hash()) !== w0, 'the animation plays over time (the walk cycle moves on)');
  await ev('VAULT.state.an = 0; VAULT.state.t0 = VAULT.state.st; 1');
  const f0 = await hash();
  await press('KeyF');
  check((await V('flip')) === 1 && (await hash()) !== f0, 'F flips the sprite');
  await press('KeyF');
  check((await V('flip')) === 0 && (await hash()) === f0, 'F again flips it back to the very same picture');

  // ---- colourways on the fighters tab ----
  const hasPal = await ev('!!(window.PALETTES && PALETTES.ready)');
  await fresh(); await openVault();
  const ways = await ev("VAULT.ways('tibo')");
  if (hasPal) {
    check(ways.length === 5 && ways[4].star && ways[4].locked && ways.slice(0, 4).every(w => !w.locked), 'Tibo has four open colourways and a locked star colourway: ' + ways.map(w => w.name).join(' '));
    const seen = [];
    for (let i = 0; i < 4; i++) { await press('Enter'); seen.push(await ev('VAULT.state.cws.tibo | 0')); }
    check(same(seen, [1, 2, 3, 0]), 'Enter cycles the colourway and skips the locked star one: ' + seen.join(','));
    const ch = await ev('[0, 1, 2, 3].map(i => { VAULT.state.cws.tibo = i; return __vh(' + VIEW + '); })');
    check(distinct(ch), 'each open colourway draws the sprite in different colours');
    await ev('VAULT.state.cws.tibo = 0; 1');
    check(await click('way:4') && (await ev('VAULT.state.cws.tibo | 0')) === 0, 'clicking the locked colourway chip does nothing');
    check(await click('way:2') && (await ev('VAULT.state.cws.tibo | 0')) === 2, 'clicking an open colourway chip selects it');
    await ev("SETTINGS.set('palettes.unlocked', { tibo: true }); VAULT.state.cws.tibo = 3; 1");
    check(!(await ev("VAULT.ways('tibo')[4].locked")), 'winning a match as Tibo (the palettes setting) opens the star colourway here');
    await press('Enter');
    check((await ev('VAULT.state.cws.tibo | 0')) === 4, 'Enter now reaches the star colourway');
    await press('Enter');
    check((await ev('VAULT.state.cws.tibo | 0')) === 0, 'and then wraps to the classic one');
  } else check(ways.length === 1 && ways[0].name === 'CLASSIC', 'without palettes.js the vault offers the classic colourway only');

  // ---- colourways tab ----
  await fresh(); await openVault(); await press('Digit3');
  check((await V('tab')) === 2 && (await V('cf')) === 0 && (await V('cc')) === 0, 'the colourways tab starts on the first fighter and the first card');
  await press('ArrowDown'); await press('ArrowDown');
  check((await V('cf')) === 2, 'up and down pick the fighter');
  await press('ArrowUp'); await press('ArrowUp'); await press('ArrowUp');
  check((await V('cf')) === 4, 'the fighter row wraps');
  const n = await ev("VAULT.ways(ROSTER[VAULT.state.cf].id).length");
  for (let i = 0; i < n; i++) await press('ArrowRight');
  check((await V('cc')) === 0, 'left and right walk the cards and wrap after the last one (' + n + ' colourways)');
  const cards = await ev('[0, 1, 2, 3, 4].map(i => { VAULT.state.cf = i; return __vh(0,110,960,420); })');
  check(distinct(cards), 'every fighter has its own colourway cards');
  check(await click('fighter:1') && (await V('cf')) === 1, 'clicking a fighter name picks that fighter');
  if (hasPal) check(await click('way:3') && (await V('cc')) === 3, 'clicking a colourway card moves the focus to it');

  // ---- arenas tab ----
  await fresh(); await openVault(); await press('Digit2');
  const na = await ev('ARENAS.length');
  check((await V('tab')) === 1 && (await V('ai')) === 0 && na >= 21, 'the arena gallery opens on the first of ' + na + ' arenas');
  await press('ArrowRight'); await press('KeyD'); await press('ArrowDown');
  check((await V('ai')) === 3, 'arrows and WASD browse the arenas');
  await ev('VAULT.state.ai = 0; 1'); await press('ArrowLeft');
  check((await V('ai')) === na - 1, 'browsing left from the first arena wraps to the last');
  const errs = await ev(`(() => { const bad = []; for (let i = 0; i < ARENAS.length; i++) { VAULT.state.ai = i; try { render(); } catch (e) { bad.push(i + ':' + e.message); } } return bad; })()`);
  check(!errs.length, 'every arena draws in the gallery without an exception' + (errs.length ? ': ' + errs.join(' ') : ''));
  const ar = await ev('ARENAS.map((a, i) => { VAULT.state.ai = i; return __vh(42,118,560,315); })');
  check(distinct(ar), 'every arena has its own thumbnail');
  await ev('VAULT.state.ai = 0; 1');
  check(await click('arena:7') && (await V('ai')) === 7, 'clicking a row of the arena list picks that arena');
  check(await click('arena:next') && (await V('ai')) === 8, 'clicking the big picture shows the next arena');

  // ---- mouse and touch ----
  await fresh(); await openVault();
  const hits0 = await ev('render(); VAULT.hits()');
  check(['back', 'tab:0', 'tab:1', 'tab:2', 'tab:3', 'fighter:-1', 'fighter:1', 'flip'].every(id => hits0.some(h => h.id === id)) && hits0.filter(h => h.id.startsWith('anim:')).length === 11, 'the fighters tab exposes BACK, four tabs, two arrows, FLIP and eleven animation rows');
  check(await click('tab:2') && (await V('tab')) === 2, 'a real pointer event on a tab changes the tab');
  check(await click('tab:0') && (await click('anim:5')) && (await V('an')) === 5, 'a click on an animation row plays that animation');
  check(await click('fighter:1') && (await V('fi')) === 1 && await click('fighter:-1') && await click('fighter:-1') && (await V('fi')) === 4, 'the side arrows browse the fighters with the pointer');
  await ev('__ptr(900, 300, "touch"); 1');
  check((await ev('VAULT.isOpen()')) && (await ev('game.phase')) === 'title', 'a touch on empty space neither closes the vault nor reaches the game');
  await click('back');
  check(!(await ev('VAULT.isOpen()')) && (await ev('game.phase')) === 'title', 'BACK closes the vault');

  // ---- lifetime stats from the BUS ----
  await fresh(); await openVault(); await press('Digit4');
  const blank = await hash('0,100,960,420');
  const S = await ev(`(() => {
    VAULT.reset(); game.modeId = 'versus'; const A = new Fighter(ROSTER[0], 0, false), B = new Fighter(ROSTER[2], 1, true), M = new Fighter(Object.assign({}, ROSTER[0], { oc: true }), 1, true);
    const ia = A.d.id, ib = B.d.id, out = { ia, ib, mirror: !!M.d.oc }, snap = k => { out[k] = JSON.parse(JSON.stringify(VAULT.stats())); };
    out.arenaId = ARENAS[3].id; snap('blank');
    BUS.emit('match:start', { modeId: 'versus', arena: 3 }); BUS.emit('match:start', { modeId: 'versus', arena: 3 }); snap('start');
    BUS.emit('hit', { src: A, victim: B, combo: 7 }); BUS.emit('hit', { src: A, victim: B, combo: 4 }); snap('combo');
    BUS.emit('hit', { src: B, victim: A, combo: 40 }); snap('cpuCombo');
    BUS.emit('ko', { winner: A, loser: B }); BUS.emit('ko', { winner: B, loser: A });
    BUS.emit('special', { fighter: A }); BUS.emit('special', { fighter: B }); BUS.emit('super', { fighter: A }); BUS.emit('super', { fighter: B });
    BUS.emit('finisher', { winner: A, loser: B }); BUS.emit('finisher', { winner: B, loser: A }); snap('counters');
    out.beforeFlush = JSON.parse(localStorage.getItem('brawl.settings') || '{}')['vault.stats'] || null;
    const stored = () => JSON.parse(localStorage.getItem('brawl.settings') || '{}')['vault.stats'] || null;
    BUS.emit('round:end', { round: 1 }); snap('round'); out.atRound = stored();
    BUS.emit('match:end', { winner: A, loser: B }); BUS.emit('match:end', { winner: B, loser: A }); BUS.emit('match:end', { winner: A, loser: M }); snap('matches');
    BUS.emit('phase', { from: 'fight', to: 'over' }); out.atOver = stored();
    BUS.emit('phase', { from: 'over', to: 'select' }); out.saved = stored();
    game.modeId = 'training'; BUS.emit('match:start', { modeId: 'training', arena: 5 }); BUS.emit('ko', { winner: A, loser: B }); BUS.emit('special', { fighter: A }); BUS.emit('super', { fighter: A });
    BUS.emit('finisher', { winner: A, loser: B }); BUS.emit('hit', { src: A, victim: B, combo: 99 }); snap('training'); game.modeId = 'versus';
    return out; })()`);
  const ia = S.ia, ib = S.ib;
  check(same(S.blank.f[ia], { w: 0, l: 0, c: 0 }) && S.blank.m === 0 && S.blank.combo === 0 && Object.keys(S.blank.f).length === 5, 'a new record is all zeros for the five fighters');
  check(S.start.ar[S.arenaId] === 2 && Object.keys(S.start.ar).length === 1, 'each match start counts one play for its arena');
  check(S.combo.combo === 7 && S.combo.comboBy === ia && S.combo.f[ia].c === 7, 'the longest combo of a human is kept with its fighter (a shorter one does not replace it)');
  check(S.cpuCombo.combo === 7 && S.cpuCombo.f[ib].c === 0, 'a computer-controlled fighter does not set the combo record');
  check(S.counters.ko === 1 && S.counters.sp === 1 && S.counters.su === 1 && S.counters.fi === 1, 'KOs, specials, supers and finishers count for human fighters only');
  check(!(S.beforeFlush && S.beforeFlush.combo) && S.round.r === 1 && !(S.atRound && S.atRound.r) && !(S.atOver && S.atOver.m), 'nothing is written per hit, per round or at the end of a match (a save fires a settings event, which the engine events test counts)');
  check(S.saved && S.saved.m === 3 && S.saved.r === 1 && S.saved.ko === 1 && S.saved.combo === 7, 'the record is saved when the game leaves the end screen');
  check(S.matches.m === 3 && S.mirror && same(S.matches.f[ia], { w: 2, l: 1, c: 7 }) && S.matches.f[ib].w === 1 && S.matches.f[ib].l === 1, 'a match end adds a win and a loss (the overclocked mirror boss is no roster fighter and gets no entry)');
  check(same(S.training, S.matches), 'training counts for nothing');
  await ev('VAULT.state.tab = 3; 1');
  const filled = await hash('0,100,960,420');
  check(filled !== blank, 'the STATS tab draws the new numbers');

  await ev(`(() => { const A = new Fighter(ROSTER[0], 0, false), B = new Fighter(ROSTER[2], 1, true); BUS.emit('hit', { src: A, victim: B, combo: 9 }); return 1; })()`);
  check((await ev("JSON.parse(localStorage.getItem('brawl.settings'))['vault.stats'].combo")) === 7, 'a hit alone does not touch the stored setting');
  await ev("BUS.emit('phase', { from: 'fight', to: 'pause' }); 1");
  check((await ev("JSON.parse(localStorage.getItem('brawl.settings'))['vault.stats'].combo")) === 9, 'pausing the game saves the pending record');
  await ev(`(() => { const A = new Fighter(ROSTER[0], 0, false), B = new Fighter(ROSTER[2], 1, true); BUS.emit('hit', { src: A, victim: B, combo: 11 }); dispatchEvent(new Event('pagehide')); return 1; })()`);
  check((await ev("JSON.parse(localStorage.getItem('brawl.settings'))['vault.stats'].combo")) === 11, 'closing or hiding the page saves the pending record too');

  // ---- saved between visits, outside writes, reset ----
  await ev('VAULT.flush(); 1');
  const before = await ev('JSON.parse(JSON.stringify(VAULT.stats()))');
  await fresh('', true);
  check(same(await ev('VAULT.stats()'), before) && before.m === 3, 'the record survives a reload');
  const hostile = await ev(`(() => { SETTINGS.set('vault.stats', { m: -4, r: 'x', ko: 1e20, sp: 2.9, combo: NaN, comboBy: 'nobody', junk: 1, f: { tibo: { w: 3, l: '2', c: 9 }, ghost: { w: 5 } }, ar: { 'bad id!': 4, ok_arena: 2, neg: -1 } }); return JSON.parse(JSON.stringify(VAULT.stats())); })()`);
  check(hostile.m === 0 && hostile.r === 0 && hostile.ko === 1e9 && hostile.sp === 2 && hostile.combo === 0 && hostile.comboBy === '' && !('junk' in hostile), 'a damaged or hostile stored record is cleaned: whole bounded numbers, no unknown keys');
  check(same(hostile.f.tibo, { w: 3, l: 0, c: 9 }) && !('ghost' in hostile.f) && Object.keys(hostile.f).length === 5 && same(hostile.ar, { ok_arena: 2 }), 'only the five roster fighters and well-formed arena ids survive');
  await ev(`SETTINGS.set('vault.stats', { m: 8, f: { dot: { w: 2 } } }); 1`);
  check((await ev('VAULT.stats().m')) === 8 && (await ev('VAULT.stats().f.dot.w')) === 2, 'a write from outside the vault replaces the live record');
  await ev(`SETTINGS.reset('vault.stats'); 1`);
  check((await ev('VAULT.stats().m')) === 0 && (await ev('VAULT.stats().f.dot.w')) === 0 && same(await ev("SETTINGS.get('vault.stats')"), {}), 'resetting the setting zeroes the live record');
  await ev('VAULT.flush(); 1');
  check(same(await ev("SETTINGS.get('vault.stats')"), {}), 'and nothing is written back after a reset');

  // ---- merged with the arcade record ----
  await fresh();
  if (await ev('!!(window.ARCADE && ARCADE.stats)')) {
    await ev(`(() => { VAULT.reset(); BUS.emit('match:end', { winner: new Fighter(ROSTER[0], 0, false), loser: new Fighter(ROSTER[2], 1, true) }); return 1; })()`);
    const v1 = await ev('VAULT.view()');
    check(v1.m === 1 && v1.f.tibo.w === 1 && v1.f.dot.l === 1, 'the stats view starts from our own record');
    const v2 = await ev(`(() => { const a = ARCADE.stats(); a.matches = 40; a.combo = 31; a.f.tibo = { w: 25, l: 4 }; a.f.wang = { w: 6, l: 2 }; return JSON.parse(JSON.stringify(VAULT.view())); })()`);
    check(v2.m === 40 && v2.combo === 31 && v2.f.tibo.w === 25 && v2.f.tibo.l === 4 && v2.f.wang.w === 6 && v2.f.dot.l === 1, 'where the arcade record is higher it wins (no double counting: the larger of the two, never the sum)');
    check(v2.arcade && v2.arcade.badgeMax >= 1 && v2.arcade.badges >= 0 && typeof v2.arcade.clears === 'number' && typeof v2.arcade.surv === 'number', 'the arcade badges, ladder clears and survival score are carried along');
    await openVault(); await press('Digit4');
    const h1 = await hash('0,100,960,420');
    await ev('ARCADE.stats().matches = 4000; 1');
    check((await hash('0,100,960,420')) !== h1, 'the STATS tab shows the arcade numbers');
    await ev('VAULT.reset(); 1');
  } else check(await ev('VAULT.view().arcade === null'), 'without arcade.js the stats view has no arcade block');

  // ---- a real match ----
  await fresh(); await openVault(); await ev('VAULT.close(); VAULT.reset(); window.__vs = 0; BUS.on(\'settings\', e => { if (e && e.key === \'vault.stats\') window.__vs++; }); 1');
  await ev('game.mode = 1; game.sel = [0, 1]; game.arenaPick = 4; startMatch(); game.f[0].cpu = true; game.f[1].cpu = true; 1');
  const aid = await ev('ARENAS[4].id');
  const end = await ev(`(() => { let n = 0; while (game.phase !== 'over' && n < 30000) { if (game.phase === 'fight' && game.f[1].hp > 2) game.f[1].hp = 2; step(1); n++; } return game.phase; })()`);
  check(end === 'over', 'a computer-vs-computer match ran to the end screen');
  const R = await ev("(() => { const s = VAULT.stats(), v = Object.values(s.f); return { m: s.m, r: s.r, w: v.reduce((a, x) => a + x.w, 0), l: v.reduce((a, x) => a + x.l, 0), ar: s.ar, ko: s.ko, sp: s.sp, saved: (JSON.parse(localStorage.getItem('brawl.settings') || '{}')['vault.stats'] || null) }; })()");
  check(R.m === 1 && R.w === 1 && R.l === 1 && R.r >= 2 && R.ar[aid] === 1 && Object.keys(R.ar).length === 1, 'the real match was counted: one match, one win, one loss, at least two rounds, one play of arena ' + aid);
  check((await ev('window.__vs')) === 0, 'saving during the match fired no settings event (the engine events test counts them)');
  check(R.ko === 0 && R.sp === 0, 'nothing a computer fighter did was counted as a human feat');
  check(!(R.saved && R.saved.m), 'nothing was saved while the end screen was still up');
  await press('Enter');
  check((await ev('game.phase')) === 'select', 'Enter on the end screen goes back to the selection');
  const saved = await ev("JSON.parse(localStorage.getItem('brawl.settings'))['vault.stats']");
  check(saved && saved.m === 1 && saved.f && Object.keys(saved.ar).length === 1 && (await ev('window.__vs')) === 1, 'leaving the end screen saved it, with a single settings event, without waiting for the page to close');

  // ---- the title demo is nobody's play; V waits while another title screen is open ----
  if (await ev('!!(window.WATCH && window.REPLAYS)')) {
    await fresh();
    const dm = await ev(`(() => {
      VAULT.reset(); const round = () => BUS.emit('round:end', { round: 1, reason: 'ko', winner: game.f[0], loser: game.f[1], wins: [1, 0] }), s = () => VAULT.stats();
      WATCH.demo(0, 2, 3); const kind = WATCH.state().kind; round(); const demo = { kind, ar: Object.keys(s().ar).length, r: s().r, m: s().m }; WATCH.leave();
      WATCH.match(0, 2, 3); round(); const match = { kind: WATCH.state().kind, ar: Object.keys(s().ar).length, r: s().r }; WATCH.leave();
      return { demo, match };
    })()`);
    check(dm.demo.kind === 'demo' && dm.demo.ar === 0 && dm.demo.r === 0 && dm.demo.m === 0, 'the attract demo adds no arena play and no round to the record: ' + JSON.stringify(dm.demo));
    check(dm.match.kind === 'match' && dm.match.ar === 1 && dm.match.r === 1, 'a WATCH match still counts its arena play and its rounds (the demo is the only exception): ' + JSON.stringify(dm.match));
    await fresh();
    await ev('WATCH.open(); step(1); 1');
    const w0 = await ev("WATCH.screen() === 'pick'");
    await press('KeyV');
    const wv = await ev('VAULT.isOpen()');
    await ev('WATCH.close(); step(1); 1');
    await press('KeyV');
    const wv2 = await ev('VAULT.isOpen()');
    await ev('VAULT.close(); step(1); 1');
    await ev('REPLAYS.open(); step(1); 1');
    const r0 = await ev('REPLAYS.screen().open');
    await press('KeyV');
    const rv = await ev('VAULT.isOpen()');
    await ev('REPLAYS.close(); 1');
    check(w0 && !wv && r0 && !rv, 'V does not open EXTRAS while the WATCH picker or the REPLAYS list is open');
    check(wv2 === true, 'V on the plain title still opens EXTRAS');
  }

  check(t.p.errors.length === errors0, 'no console errors from the vault' + (t.p.errors.length > errors0 ? ': ' + t.p.errors.slice(errors0, errors0 + 3).join(' | ') : ''));
}
