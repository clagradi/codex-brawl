// Tests for p-watch.js: the attract demo, the WATCH entry and its picker, the commentary captions. Owner: the p-watch agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// Everything is driven with real key events (tap) or with step(); the long runs are stepped under a seeded random generator that is installed only while stepping, so one seed gives one match.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rot13 = s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
const NOPE = ['zbegny xbzong', 'sngnyvgl', 'svavfu uvz', 'synjyrff', 'trg bire urer', 'gbnfgl', 'fpbecvba', 'fho-mreb', 'envqra', 'unqbhxra', 'fubelhxra', 'fgerrg svtugre', 'grxxra', 'ononyvgl', 'oehgnyvgl'].map(rot13);

export async function run(t) {
  try { await body(t); } finally { try { await t.eval('localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }   // leave the stored settings as found for the tests after this one
}

async function body(t) {
  const { check, tap } = t, ev = t.eval, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const SEEDED = `window.__s = 1; window.reseed = n => { window.__s = n >>> 0; };
    window.pwstep = n => { const old = Math.random; Math.random = () => { let a = (window.__s = (window.__s + 0x6D2B79F5) >>> 0); a = Math.imul(a ^ a >>> 15, a | 1); a ^= a + Math.imul(a ^ a >>> 7, a | 61); return ((a ^ a >>> 14) >>> 0) / 4294967296; }; try { step(n); } finally { Math.random = old; } };
    window.pwto = (ph, max) => { let n = 0; while (game.phase !== ph && n < max) { pwstep(1); n++; } return n; };
    window.pwwatch = max => { let n = 0; while (WATCH.state().kind && n < max) { pwstep(1); n++; } return n; };
    window.pwc = { matchEnd: 0, roundEnd: 0, hit: 0, starts: [] };
    BUS.on('match:end', () => { pwc.matchEnd++; }); BUS.on('round:end', () => { pwc.roundEnd++; }); BUS.on('hit', () => { pwc.hit++; });
    BUS.on('match:start', () => { pwc.starts.push({ id: game.modeId, mode: game.mode, sel: game.sel.slice(), arena: game.arena, cpu: game.f.map(f => f.cpu), lvl: game.cpuLevel }); });
    window.pwclick = (x, y) => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x * r.width / W, clientY: r.top + y * r.height / H, bubbles: true, cancelable: true, pointerType: 'mouse' })); };
    1`;
  const fresh = async seed => { await t.open(); await ev('localStorage.clear(); 1'); await t.open(); await ev('hold(true); 1'); await ev(SEEDED); await ev(`reseed(${seed || 1}); 1`); };
  const press = async code => { await tap(code); await ev('step(1); 1'); };   // a real key event, then one tick that consumes it
  const title = async id => { await ev(`game.titleSel = titleItems().findIndex(i => i.id === '${id}'); step(1); 1`); await press('Enter'); };
  const st = () => ev('WATCH.state()');
  const idleLeft = async () => 1200 - (await ev('WATCH.state().idle'));   // ticks until the default 20 s attract delay fires
  await t.open(); await ev('localStorage.clear(); 1');

  // ---- registration ----
  await fresh();
  check(await ev("window.STUB_P_WATCH === 1 && typeof WATCH === 'object'"), 'p-watch.js is loaded');
  const items = await ev('titleItems().map(i => i.label)');
  check(items.includes('WATCH'), 'the title menu has a WATCH entry: ' + items.join(' | '));
  check(await ev("(() => { const m = MODES.get('watch'); return !!m && m.label === 'WATCH' && typeof m.onPick === 'function'; })()"), 'WATCH is registered with MODES');
  check(same(await ev("[SETTINGS.get('watch.attract'), SETTINGS.get('watch.idle'), SETTINGS.get('watch.captions'), SETTINGS.get('watch.level'), SETTINGS.get('watch.pick')]"), [true, 20, true, 'normal', {}]), 'the settings have their defaults (attract on, 20 s, captions on, normal)');
  check(await ev('ROSTER.length === 5 && ROSTER.every(r => r.handle === "")'), 'the roster is still the five fighters with empty handles');

  // ---- the rotation of the demo ----
  const picks = await ev('Array.from({ length: 21 }, (_, n) => WATCH.demoPick(n))');
  check(new Set(picks.slice(0, 10).map(p => [Math.min(p[0], p[1]), Math.max(p[0], p[1])].join())).size === 10, 'ten demos in a row show every pair of fighters once');
  check(new Set(picks.map(p => p[2])).size === 21 && picks.every(p => p[0] !== p[1] && p[0] >= 0 && p[1] < 5), 'twenty-one demos in a row visit every arena, and nobody fights himself');
  check(!same(picks[0], picks[1]) && !same(picks[1], picks[2]), 'consecutive demos differ');

  // ---- the picker: real keys ----
  await fresh();
  await title('watch');
  check((await ev('WATCH.screen()')) === 'pick' && (await ev('game.phase')) === 'title', 'WATCH opens its picker on the title, without the character select');
  const sel0 = await ev('game.titleSel');
  check(same(await ev('[WATCH.picker.a, WATCH.picker.b, WATCH.picker.arena]'), [0, 4, -1]), 'the picker starts with TIBO, MUSE and a random arena');
  await press('ArrowRight');
  check((await ev('WATCH.picker.a')) === 1, 'Right on the first row picks the next fighter for the left corner');
  await press('ArrowUp'); await press('ArrowDown');
  check((await ev('WATCH.row()')) === 0, 'Up wraps to START and Down wraps back to the first row');
  await press('ArrowDown'); await press('ArrowLeft');
  check((await ev('WATCH.picker.arena')) === 20, 'Left on RANDOM goes to the last arena');
  await press('ArrowRight'); await press('ArrowRight');
  check((await ev('WATCH.picker.arena')) === 0, 'Right twice gives RANDOM and then the first arena');
  await press('ArrowDown'); await press('ArrowLeft');
  check((await ev('WATCH.picker.b')) === 3, 'Left on the right corner picks the previous fighter');
  await press('ArrowDown'); await press('ArrowRight');
  check((await ev("SETTINGS.get('watch.level')")) === 'hard', 'the CPU level row steps normal to hard and stores it');
  await press('ArrowDown'); await press('ArrowRight');
  check((await ev("SETTINGS.get('watch.captions')")) === false, 'the CAPTIONS row switches the captions off');
  await press('ArrowRight');
  check((await ev("SETTINGS.get('watch.captions')")) === true, 'and on again');
  check((await ev('game.titleSel')) === sel0 && (await ev('game.phase')) === 'title', 'no key typed in the picker reaches the title menu under it');
  await press('Escape');
  check((await ev('WATCH.screen()')) === null && (await ev('game.modeId')) === 'versus' && (await ev('game.mode')) === 1 && (await ev('game.phase')) === 'title', 'Esc closes the picker and the mode is back to 1 PLAYER VS CPU');
  check((await ev('game.phase')) === 'title' && (await st()).kind === null, 'Esc starts nothing');

  // ---- the picker: a start by keys, a whole CPU match, the end screen ----
  await title('watch');
  await press('ArrowRight'); await press('ArrowDown'); await press('ArrowRight'); await press('ArrowDown'); await press('ArrowLeft');   // left corner 1, arena 0, right corner 3
  for (let i = 0; i < 4; i++) await press('ArrowDown');   // level, captions, demo, START
  check((await ev('WATCH.row()')) === 6, 'four Downs from the right corner reach START WATCHING');
  await press('Enter');
  check((await ev('game.phase')) === 'vs' && (await st()).kind === 'match', 'START WATCHING begins the match (phase vs, kind match)');
  const s0 = await ev('({ id: game.modeId, mode: game.mode, sel: game.sel.slice(), arena: game.arena, cpu: game.f.map(f => f.cpu), lvl: game.cpuLevel, pick: SETTINGS.get("watch.pick") })');
  check(s0.id === 'watch' && s0.mode === 2 && same(s0.sel, [1, 3]) && s0.arena === 0, 'the match is mode watch, fighters POTETO and WANG on arena 0: ' + JSON.stringify(s0));
  check(same(s0.cpu, [true, true]) && s0.lvl === 0.7, 'both fighters are the CPU, at the stored level (hard is 0.7)');
  check(same(s0.pick, { a: 1, b: 3, arena: 0 }), 'the picks are stored in watch.pick: ' + JSON.stringify(s0.pick));
  await ev('pwto("fight", 1200); pwstep(900); 1');
  check(await ev('game.phase === "fight" && pwc.hit > 0 && game.f.some(f => f.hp < f.d.hp)'), 'the CPU plays both sides (' + (await ev('pwc.hit')) + ' hits after 15 s)');
  await ev('pwto("over", 40000); 1');
  const over = await ev('({ ph: game.phase, wins: game.wins.slice(), me: pwc.matchEnd, kind: WATCH.state().kind, cap: WATCH.caption() })');
  check(over.ph === 'over' && Math.max(...over.wins) === 2 && over.me === 1 && over.kind === 'match', 'a whole watched match is played to the end, match:end once: ' + JSON.stringify(over));
  check(/WINS THE MATCH|TAKES THE MATCH/.test(over.cap), 'the last caption calls the match: ' + over.cap);
  await press('Enter');
  const again = await ev('({ ph: game.phase, wins: game.wins.slice(), sel: game.sel.slice(), id: game.modeId, arena: game.arena, cpu: game.f.map(f => f.cpu) })');
  check(again.ph === 'vs' && same(again.wins, [0, 0]) && same(again.sel, [1, 3]) && again.id === 'watch' && again.arena === 0 && same(again.cpu, [true, true]), 'Enter on the end screen watches the same match again: ' + JSON.stringify(again));
  await ev('pwto("over", 40000); 1'); await press('KeyR');
  check((await ev('game.phase')) === 'vs' && same(await ev('game.sel'), [1, 3]) && (await st()).kind === 'match', 'R does the same');
  await ev('pwto("over", 40000); 1'); await press('Escape');
  check((await ev('WATCH.screen()')) === 'pick' && (await ev('game.phase')) === 'title' && (await st()).kind === null && (await ev('game.modeId')) === 'versus', 'Esc on the end screen goes back to the picker and the session is over');
  check(same(await ev('[WATCH.picker.a, WATCH.picker.b, WATCH.picker.arena]'), [1, 3, 0]), 'the picker remembers the last picks');
  await press('ArrowUp'); await press('Enter');   // the picker opens on its first row: Up wraps to START
  check((await ev('game.phase')) === 'vs' && (await ev('game.modeId')) === 'watch' && (await st()).kind === 'match', 'and START from there begins another match');
  check(await ev('pwc.starts.every(s => s.id === "watch" && s.mode === 2 && s.cpu[0] && s.cpu[1])'), 'every watched match started with both fighters on the CPU');
  await ev('WATCH.leave(); 1');

  // ---- the picker: pointer ----
  await fresh();
  await title('watch');
  await ev('pwclick(250, 200); 1'); await ev('step(1); 1');
  check((await ev('WATCH.picker.a')) === 1 && (await ev('WATCH.screen()')) === 'pick' && (await ev('game.phase')) === 'title', 'a click on the right of the left panel picks the next fighter (the title does not take the click)');
  await ev('pwclick(60, 200); 1');
  check((await ev('WATCH.picker.a')) === 0, 'a click on the left of the panel goes back');
  await ev('pwclick(480, 355); 1');
  check((await ev("SETTINGS.get('watch.captions')")) === false, 'a click on CAPTIONS flips it');
  await ev('pwclick(480, 355); 1');
  await ev('pwclick(480, 415); 1'); await ev('step(1); 1');
  check((await ev('game.phase')) === 'vs' && (await st()).kind === 'match' && (await ev('WATCH.screen()')) === null, 'a click on START WATCHING begins the match');
  await ev('WATCH.leave(); 1');
  await title('watch'); await ev('pwclick(60, 28); 1');
  check((await ev('WATCH.screen()')) === null && (await ev('game.modeId')) === 'versus', 'a click on BACK closes the picker');

  // ---- the attract demo ----
  await fresh(4);
  const before = await ev('JSON.stringify([game.modeId, game.mode, game.sel, game.arenaPick, game.titleSel])');
  const arc0 = await ev('JSON.stringify(ARCADE.stats())');
  let left = await idleLeft();
  await ev(`pwstep(${left - 1}); 1`);
  check((await st()).kind === null && (await ev('game.phase')) === 'title', 'no demo one tick before the 20 s are up');
  await ev('pwstep(1); 1');
  const d1 = await ev('({ kind: WATCH.state().kind, ph: game.phase, id: game.modeId, mode: game.mode, cpu: game.f.map(f => f.cpu), lvl: game.cpuLevel, sel: game.sel.slice(), arena: game.arena })');
  check(d1.kind === 'demo' && d1.ph === 'vs' && d1.id === 'watch' && d1.mode === 2 && same(d1.cpu, [true, true]) && d1.lvl === 0.7, 'after 20 s on the title the demo starts, CPU against CPU: ' + JSON.stringify(d1));
  const n1 = await ev('pwwatch(6000)');
  const e1 = await ev('({ ph: game.phase, kind: WATCH.state().kind, me: pwc.matchEnd, re: pwc.roundEnd, idle: WATCH.state().idle, banner: game.banner, zoom: game.cam.zoom, now: JSON.stringify([game.modeId, game.mode, game.sel, game.arenaPick, game.titleSel]), arc: JSON.stringify(ARCADE.stats()), log: WATCH.log() })');
  check(n1 > 400 && n1 < 4400 && e1.ph === 'title' && e1.kind === null, 'the demo plays one round and goes back to the title by itself (' + n1 + ' ticks)');
  check(e1.me === 0 && e1.re <= 1, 'the demo never reaches match:end (match ends ' + e1.me + ', round ends ' + e1.re + ')');
  check(e1.now === before, 'the title is exactly as it was: mode, picks, arena, menu entry ' + e1.now);
  check(e1.arc === arc0, 'the demo does not touch the arcade stats');
  check(e1.banner === null && e1.zoom === 1 && e1.idle === 0, 'no banner or zoom is left behind and the idle count starts again');
  await ev(`pwstep(${(await idleLeft()) - 1}); 1`);
  check((await st()).kind === null, 'the next demo waits for another 20 s');
  await ev('pwstep(1); 1');
  const d2 = await ev('({ kind: WATCH.state().kind, sel: game.sel.slice(), arena: game.arena })');
  check(d2.kind === 'demo' && !(same(d2.sel, d1.sel) && d2.arena === d1.arena), 'and it shows another pair or another arena: ' + JSON.stringify([d1.sel, d1.arena, d2.sel, d2.arena]));

  // any input resets the idle count
  await fresh();
  await ev('pwstep(600); 1');
  check((await st()).idle >= 600, 'the idle count follows the ticks');
  await tap('F9'); await ev('step(1); 1');
  check((await st()).idle === 0, 'a key press resets it');
  await ev('pwstep(300); window.dispatchEvent(new PointerEvent("pointermove")); step(1); 1');
  check((await st()).idle === 0, 'a pointer move resets it');
  await ev('pwstep(300); window.dispatchEvent(new Event("touchstart")); step(1); 1');
  check((await st()).idle === 0, 'a touch resets it');
  await ev(`pwstep(${(await idleLeft()) - 1}); 1`);
  check((await st()).kind === null, 'so the demo had been pushed back');

  // the settings
  await fresh();
  await ev("SETTINGS.set('watch.attract', false); pwstep(1500); 1");
  check((await st()).kind === null && (await ev('game.phase')) === 'title', 'with the attract demo off nothing starts, even after 25 s');
  await ev("SETTINGS.set('watch.attract', true); SETTINGS.set('watch.idle', 5); 1");
  left = 300 - (await ev('WATCH.state().idle'));
  await ev(`pwstep(${left - 1}); 1`);
  check((await st()).kind === null, 'with the delay set to 5 s nothing starts at 4.98 s');
  await ev('pwstep(1); 1');
  check((await st()).kind === 'demo', 'and the demo starts at 5 s');

  // the overlays hold it back
  await fresh();
  await ev('WATCH.open(); pwstep(1500); 1');
  check((await st()).kind === null && (await st()).idle === 0 && (await ev('WATCH.screen()')) === 'pick', 'the picker blocks the demo');
  await ev('WATCH.close(); OPTIONS.open("options"); pwstep(1500); 1');
  check((await st()).kind === null && (await st()).idle === 0, 'the options screen blocks the demo');
  await ev('OPTIONS.close(); 1');
  await ev('window.__g = true; WATCH.guard(() => window.__g); pwstep(1500); 1');
  check((await st()).kind === null, 'a guard from another feature blocks the demo');
  await ev('window.__g = false; pwstep(1199); 1');
  check((await st()).kind === null, 'it counts again from zero when the guard lets go');
  await ev('pwstep(1); 1');
  check((await st()).kind === 'demo', 'and then the demo starts');

  // leaving a demo: key, pointer, lost focus
  await fresh();
  await ev('game.titleSel = 3; WATCH.demo(0, 4, 3); pwto("fight", 900); pwstep(200); 1');
  check((await ev('game.phase')) === 'fight' && (await st()).kind === 'demo', 'a demo is on screen');
  await tap('Enter'); await ev('step(1); 1');
  check((await ev('game.phase')) === 'title' && (await st()).kind === null && (await ev('game.titleSel')) === 3 && (await ev('game.modeId')) === 'versus', 'a key press ends the demo and is not also a menu key');
  await ev('WATCH.demo(1, 2, 5); pwto("fight", 900); pwstep(100); window.dispatchEvent(new PointerEvent("pointermove")); step(1); 1');
  check((await ev('game.phase')) === 'title' && (await st()).kind === null, 'a pointer move ends the demo');
  await ev('WATCH.demo(2, 3, 6); pwto("fight", 900); pwstep(100); window.dispatchEvent(new Event("blur")); step(2); 1');
  check((await ev('game.phase')) === 'title' && (await st()).kind === null && (await ev('game.modeId')) === 'versus', 'losing the window focus ends the demo (it does not sit paused)');
  await ev('WATCH.demo(3, 4, 7); pwto("ko", 4000); step(1); 1');
  check((await ev('game.phase')) === 'ko' && (await st()).kind === 'demo', 'the demo is still on in the KO phase');
  await ev('pwstep(95); 1');
  check((await ev('game.phase')) === 'title' && (await st()).kind === null && (await ev('pwc.matchEnd')) === 0, 'it leaves 90 ticks after the KO, before the next round could begin');

  // ---- level ----
  await fresh();
  await ev("window.pwlv = []; BUS.on('round:start', () => pwlv.push(game.cpuLevel)); 1");
  for (const [lvl, v] of [['easy', 0.2], ['normal', 0.45], ['hard', 0.7], ['nightmare', 0.95]]) {
    await ev(`pwlv.length = 0; WATCH.match(0, 1, 2, '${lvl}'); pwto('fight', 1000); 1`);
    check((await ev('game.cpuLevel')) === v && same(await ev('pwlv'), [v]), 'WATCH level ' + lvl + ' sets the CPU skill to ' + v);
    await ev('WATCH.leave(); 1');
  }
  await ev("pwlv.length = 0; WATCH.match(0, 1, 2, 'easy'); pwto('over', 40000); 1");
  const lv = await ev('pwlv');
  check(lv.length >= 2 && lv.every(v => v === 0.2), 'in a whole match at easy every round starts at the same skill (the engine raises it per round, the watch puts it back): ' + lv.join(','));
  await ev('WATCH.leave(); 1');

  // ---- captions ----
  await fresh(7);
  await ev('WATCH.demo(0, 4, 3); pwto("intro", 900); pwstep(20); 1');
  const c0 = await ev('({ cap: WATCH.caption(), log: WATCH.log(), arena: ARENAS[game.arena].name })');
  check(c0.log.length === 1 && c0.cap === c0.log[0] && /TIBO/.test(c0.cap) && /MUSE/.test(c0.cap) && c0.cap.includes(c0.arena), 'the intro caption names both fighters and the arena: ' + c0.cap);
  await ev('pwwatch(6000); 1');
  const c1 = await ev('WATCH.log()');
  check(c1.length >= 6 && new Set(c1).size >= 5, 'a round of commentary has plenty of different lines (' + c1.length + ')');
  check(c1.some(l => /ROUND TO|TAKES THE ROUND|OUT FOR THIS ROUND|PERFECT|SCRATCH|MARK ON|DRAW|TIME|BELL|CLOCK/.test(l)), 'and the end of the round is called: ' + c1[c1.length - 1]);
  check(c1.every(l => /^[A-Z0-9 .,!?:;\-'()\/]+$/.test(l)), 'every line is capitals and plain characters of the pixel font');

  // every template with every name, move and arena: font glyphs and width
  const audit = await ev(`(() => {
    const names = ROSTER.map(r => SHORT(r)), moves = [], arenas = ARENAS.map(a => a.name), bad = [];
    const grab = v => { if (Array.isArray(v)) v.forEach(grab); else if (v && typeof v === 'object' && typeof v.name === 'string') moves.push(v.name); };
    for (const r of ROSTER) { const m = MOVES[r.id]; for (const k in m) grab(m[k]); }
    const slots = { A: names, B: names, L: names, T: names, M: moves, R: arenas, N: ['3', '12', '16'], W: ['0', '2', '3'], V: ['0', '1', '2'] }, longest = {};
    for (const k in slots) longest[k] = slots[k].reduce((a, b) => b.length > a.length ? b : a, '');
    let n = 0, worst = 0;
    for (const key in WATCH.lines) for (const tpl of WATCH.lines[key]) {
      const used = [...new Set((tpl.match(/\\{(\\w)\\}/g) || []).map(s => s[1]))];
      const variants = used.length ? used.flatMap(k => slots[k].map(v => tpl.replace(/\\{(\\w)\\}/g, (m, s) => s === k ? v : longest[s]))) : [tpl];
      for (const s of variants) { n++; const w = ptextWidth(s, 2); worst = Math.max(worst, w); if (!/^[A-Z0-9 .,!?:;\\-'()\\/]+$/.test(s) || w > 900) bad.push(s); }
    }
    return { n, bad: bad.slice(0, 3), moves: moves.length, worst, pools: Object.keys(WATCH.lines).length };
  })()`);
  check(audit.bad.length === 0 && audit.n > 300 && audit.moves >= 20, 'all ' + audit.n + ' filled lines (' + audit.pools + ' pools, ' + audit.moves + ' move names) are glyph-safe and fit in 900 px at size 2 (widest ' + audit.worst + ')' + (audit.bad.length ? ': ' + audit.bad[0] : ''));

  // priority and dwell: events by hand, nobody is playing
  await fresh(3);
  await ev('WATCH.match(0, 1, 0, "normal"); pwto("fight", 1000); game.f.forEach(f => { f.cpu = false; }); WATCH.clear(); 1');
  await ev('BUS.emit("super", { fighter: game.f[0], foe: game.f[1], move: { name: "TESTMOVE" } }); 1');
  check((await ev('WATCH.caption()')).includes('TESTMOVE'), 'a super gets its caption with the move name');
  await ev('BUS.emit("knockdown", { src: game.f[0], victim: game.f[1] }); 1');
  check((await ev('WATCH.caption()')).includes('TESTMOVE'), 'a lesser line does not push a fresh super caption out');
  await ev('pwstep(61); BUS.emit("knockdown", { src: game.f[0], victim: game.f[1] }); 1');
  const k1 = await ev('WATCH.caption()');
  check(!k1.includes('TESTMOVE') && /TIBO|POTETO/.test(k1), 'after a second it can: ' + k1);
  await ev('BUS.emit("super", { fighter: game.f[1], foe: game.f[0], move: { name: "TESTMOVE" } }); BUS.emit("round:end", { round: 1, reason: "ko", winner: game.f[0], loser: game.f[1], wins: [1, 0] }); 1');
  const k2 = await ev('WATCH.caption()');
  check(!k2.includes('TESTMOVE') && /TIBO/.test(k2), 'the end of a round always gets through: ' + k2);
  await ev('pwstep(300); 1');
  check((await ev('WATCH.caption()')) === '', 'a caption goes away by itself');
  await ev('BUS.emit("match:end", { winner: game.f[0], loser: game.f[1], wins: [2, 1], rounds: 3, modeId: "watch" }); 1');
  check(/TIBO/.test(await ev('WATCH.caption()')) && /2-1/.test(await ev('WATCH.caption()')), 'the match end names the winner and the score: ' + (await ev('WATCH.caption()')));
  await ev('pwstep(61); BUS.emit("super", { fighter: null, foe: null, move: { name: "X" } }); BUS.emit("round:end", { round: 1, reason: "draw", winner: null, loser: null, wins: [0, 0] }); 1');
  check(/DRAW|LEVEL|NOBODY/.test(await ev('WATCH.caption()')), 'a drawn round is called and events with nobody in them are ignored: ' + (await ev('WATCH.caption()')));
  await ev('WATCH.leave(); 1');
  check((await ev('WATCH.caption()')) === '', 'no caption outlives the session');

  // captions off
  await fresh(8);
  await ev("SETTINGS.set('watch.captions', false); WATCH.demo(0, 4, 3); pwto('fight', 900); pwstep(500); BUS.emit('super', { fighter: game.f[0], foe: game.f[1], move: { name: 'TESTMOVE' } }); 1");
  check((await ev('WATCH.log().length')) === 0 && (await ev('WATCH.caption()')) === '', 'with the captions off no line is made');

  // ---- what is drawn: the banner blinks, the caption is a box ----
  await fresh(9);
  const px = await ev(`(() => {
    WATCH.demo(0, 4, 3); let n = 0; while (!(game.phase === 'fight' && WATCH.state().t % 64 === 10) && n < 1500) { pwstep(1); n++; }
    const k = cv.width / W, gold = () => { render(); const d = ctx.getImageData(380 * k, 494 * k, 200 * k, 22 * k).data; let c = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 130) c++; return c; };
    const on = gold(); while (WATCH.state().t % 64 !== 50) pwstep(1); const off = gold();
    WATCH.clear(); BUS.emit('super', { fighter: game.f[0], foe: game.f[1], move: { name: 'TESTMOVE' } }); pwstep(12);
    const grab = () => { render(); return ctx.getImageData(100 * k, 112 * k, 760 * k, 30 * k).data; };
    const a = grab(); WATCH.clear(); const b = grab(); let diff = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) diff++;
    return { on, off, diff, ph: game.phase };
  })()`);
  check(px.ph === 'fight' && px.on > 500 && px.off < 20, 'PRESS START blinks: ' + px.on + ' gold pixels on, ' + px.off + ' off');
  check(px.diff > 800, 'a caption draws a box under the HUD (' + px.diff + ' pixels differ from the same frame without it)');

  // ---- the same seed gives the same broadcast ----
  const runDemo = async seed => { await fresh(seed); return ev(`(() => { WATCH.seed(11); WATCH.demo(); const n = pwwatch(6000); return { n, log: WATCH.log(), hp: game.f.map(f => Math.round(f.hp)) }; })()`); };
  const A = await runDemo(21), B = await runDemo(21);
  check(A.log.length >= 5 && same(A, B), 'one seed gives one demo, line for line, twice (' + A.log.length + ' lines, ' + A.n + ' ticks)');

  // ---- nobody plays the demo or a WATCH match: OKRS count neither, the VAULT counts the finished WATCH match but not the demo ----
  if (await ev('!!(window.OKRS && window.VAULT)')) {
    await fresh(5);
    const dm = await ev(`(() => {
      OKRS.reset(); VAULT.reset(); const n0 = JSON.stringify(OKRS.state.n); pwc.roundEnd = 0; WATCH.demo(0, 2, 3);
      let n = 0; while (WATCH.state().kind && n++ < 6000) { if (game.phase === 'fight' && game.f[1].hp > 1) game.f[1].hp = 1; pwstep(1); }
      const s = VAULT.stats();
      return { rounds: pwc.roundEnd, same: JSON.stringify(OKRS.state.n) === n0, md: OKRS.state.md.join(), r: s.r, m: s.m, ar: Object.keys(s.ar).length };
    })()`);
    check(dm.rounds >= 1 && dm.r === 0 && dm.m === 0 && dm.ar === 0 && dm.same && dm.md === '', 'a whole attract demo (' + dm.rounds + ' round ended) adds nothing to the VAULT or to OKRS: ' + JSON.stringify(dm));
    await ev('WATCH.match(0, 2, 3, "normal"); pwto("over", 40000); 1');
    const wm = await ev(`(() => {
      const s = VAULT.stats(), v = Object.values(s.f);
      return { n: OKRS.state.n, md: OKRS.state.md.join(), m: s.m, w: v.reduce((a, x) => a + x.w, 0), l: v.reduce((a, x) => a + x.l, 0), ar: Object.keys(s.ar).length, ko: s.ko, sp: s.sp };
    })()`);
    check(wm.md === '' && !wm.n.wins && !wm.n.losses && !wm.n.matches, 'a WATCH match adds no mode, win, loss or match to OKRS: ' + JSON.stringify([wm.md, wm.n]));
    check(wm.m === 1 && wm.w === 1 && wm.l === 1 && wm.ar === 1 && wm.ko === 0 && wm.sp === 0, 'the VAULT counts the finished WATCH match as a match, a win, a loss and an arena play, and no human feat: ' + JSON.stringify(wm));
  }

  // ---- the source: nothing banned, plain characters ----
  const srcs = ['p-watch.js', 'docs/features/p-watch.md', 'tools/tests/x-p-watch.mjs'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const hit = srcs.flatMap(([f, s]) => NOPE.filter(w => new RegExp(w.replace(/[ -]/g, '[-_\\s]?'), 'i').test(s)).map(w => f + ': ' + w));
  check(hit.length === 0, 'no banned word in the p-watch files' + (hit.length ? ': ' + hit.join('; ') : ''));
  const wide = srcs.filter(([f, s]) => f.endsWith('.js') && /[^\x00-\x7f]/.test(s)).map(([f]) => f);
  check(wide.length === 0, 'p-watch.js is plain ASCII');
  check(!/\bfetch\(|XMLHttpRequest|import\s*\(|WebSocket/.test(srcs[0][1].replace(/\/\/.*$/gm, '')), 'p-watch.js makes no network request');
  check(t.p.errors.length === 0, 'no console errors so far' + (t.p.errors.length ? ': ' + t.p.errors[0] : ''));
}
