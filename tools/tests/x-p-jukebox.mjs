// Tests for p-jukebox.js: the SOUND TEST screen, the five fighter themes and the visualiser bars. Owner: the p-jukebox agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md.
// The screen is driven with real key events (one step() after each so the tick consumes it) and with synthetic pointer events on the canvas. Muted runs use the virtual clock, which makes the bars
// exact: every tick that crosses a 16th step is compared with what MUSIC.hits says starts on that step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function run(t) {
  try { await body(t); } finally { try { await t.eval('localStorage.clear(); 1'); } catch (e) { /* the page is gone: nothing to clean */ } }   // leave the stored settings as found for the test files that run after this one
}

async function body(t) {
  const { check, tap } = t, ev = t.eval;
  const until = async (js, ms = 1500) => { for (let i = 0; i <= ms; i += 50) { if (await ev(js)) return true; await t.wait(50); } return false; };
  const press = async code => { await tap(code); await ev('step(1); 1'); };   // a real key event, then one tick that consumes it
  const fresh = async hash => { await t.open(hash || ''); await ev('SETTINGS.reset(); hold(true); 1'); };
  const gesture = async () => { await tap('KeyH'); await ev('step(1); 1'); return until('!!AC && AC.state === "running"', 2000); };   // the first key press starts the audio context
  const click = (x, y) => ev(`(() => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + ${x} * r.width / W, clientY: r.top + ${y} * r.height / H, pointerType: 'mouse', button: 0 })); step(1); return 1; })()`);
  const S = () => ev('JUKEBOX.state()');
  const spy = "window.__ui = []; { const u = uiText; uiText = (s, ...a) => { __ui.push(String(s)); return u(s, ...a); }; const d = drawTitleText; drawTitleText = (c, s, ...a) => { __ui.push(String(s)); return d(c, s, ...a); }; }";
  const shown = async re => { await ev('__ui.length = 0; 1'); await t.wait(150); return ev('__ui.some(s => ' + re + '.test(s))'); };
  const dB = v => 20 * Math.log10(v);
  const openScreen = async () => { await ev("game.titleSel = titleItems().findIndex(i => i.id === 'jukebox'); step(1); 1"); await press('Enter'); return ev('JUKEBOX.isOpen()'); };

  // ---- registry: the entry, the settings, the five themes, the track list ----
  await fresh();
  check(await ev("window.STUB_JUKEBOX === 1 && typeof JUKEBOX === 'object' && typeof MUSIC.info === 'function' && typeof MUSIC.hits === 'function' && typeof MUSIC.clock === 'function'"), 'JUKEBOX and the read-only MUSIC.info / hits / clock accessors exist');
  const it = await ev("(() => { const l = titleItems(), i = l.findIndex(x => x.id === 'jukebox'), o = l.findIndex(x => x.id === 'options'); return { label: l[i] && l[i].label, order: l[i] && l[i].order, i, o }; })()");
  check(it.label === 'SOUND TEST' && it.order === 800 && it.i >= 0 && it.i < it.o, 'the title menu has SOUND TEST (order 800) in front of OPTIONS: ' + JSON.stringify(it));
  check(await ev("SETTINGS.get('jukebox.vs') === false && SETTINGS.get('jukebox.last') === ''"), 'the settings start off: fighter themes on VS false, no remembered track');
  check(await ev("ROSTER.length === 5 && JSON.stringify(JUKEBOX.fighters) === JSON.stringify(ROSTER.map(r => r.id)) && MUSIC.themes().filter(n => n.startsWith('fight_')).length === 5 && ROSTER.every(r => MUSIC.themes().includes('fight_' + r.id))"), 'exactly five fighter themes exist, one per fighter of the fixed roster');
  const tr = await ev('JUKEBOX.tracks()');
  const all = await ev('MUSIC.themes()');
  check(tr.length === all.length && new Set(tr.map(x => x.id)).size === all.length && all.every(n => tr.some(x => x.id === n)), 'the SOUND TEST lists every MUSIC theme exactly once (' + all.length + ')');
  const nArena = tr.filter(x => x.group === 'ARENA').length, nArenas = await ev('ARENAS.length'), line = (fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').split('\n').find(l => l.startsWith('SOUND TEST')) || ''), claim = /(\d+) stage tracks \((\w+) of the (\d+) arenas/.exec(line);
  check(claim && +claim[1] === nArena && +claim[3] === nArenas && claim[2] === ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][nArenas - nArena] && !/one per arena/.test(line), 'the README says how many arena tracks there are and how many arenas share one, not one per arena: ' + (claim ? claim[0] : line.slice(0, 120)) + ' against ' + nArena + ' tracks, ' + nArenas + ' arenas');
  const groups = tr.map(x => x.group), firstOf = g => groups.indexOf(g), lastOf = g => groups.lastIndexOf(g);
  check(groups.slice(0, 3).every(g => g === 'MENU') && lastOf('MENU') < firstOf('ARENA') && lastOf('ARENA') < firstOf('FIGHTER') && groups.filter(g => g === 'FIGHTER').length === 5, 'the list runs MENU, ARENA, FIGHTER: ' + [...new Set(groups)].join(' '));
  check(tr.every(x => /^[A-Z0-9 .,!?:;\-_/"()[\]+=><&@#%*]+$/.test(x.name) && /^[A-Z]+$/.test(x.group)), 'every track name is capitals and ASCII for the pixel font: ' + tr.slice(0, 4).map(x => x.name).join(' | ') + ' ...');
  check(tr.filter(x => x.group === 'FIGHTER').every(x => /^(TIBO|POTETO|DOT|WANG|MUSE) - [A-Z ]+$/.test(x.name)) && !tr.some(x => /POTATO/.test(x.name) && x.group === 'FIGHTER'), 'fighter tracks are named after the roster: ' + tr.filter(x => x.group === 'FIGHTER').map(x => x.name).join(' | '));

  // ---- the generated themes ----
  const gen = await ev(`(() => { const out = {}; for (const id of JUKEBOX.fighters) {
    const n = JUKEBOX.prefix + id, inf = MUSIC.info(n), th = JUKEBOX.make(id, JUKEBOX.style[id]), ls = [[], []]; let notes = 0, bass = 0, arp = 0, kick = 0, lo = 999, hi = 0;
    for (let r = 0; r < 2; r++) for (let s = 0; s < inf.len; s++) { const h = MUSIC.hits(n, s, r); if (h.l) { ls[r].push(h.l); if (r === 0) { notes++; lo = Math.min(lo, h.l); hi = Math.max(hi, h.l); } } if (r === 0) { if (h.b) bass++; if (h.a) arp++; if (h.k) kick++; } }
    const pat = th.l[3][0].replace(/ /g, ''), nn = th.sc.length, ok = [];
    for (let b = 0; b < 8; b++) { const bar = pat.slice(b * 16, b * 16 + 16), c = [...bar].find(x => x !== '.' && x !== '-'), d = /[A-Z]/.test(c) ? 64 - c.charCodeAt(0) : parseInt(c, 36), r0 = JUKEBOX.style[id].prog[b], md = x => ((x % nn) + nn) % nn; ok.push([0, 2, 4].some(o => md(r0 + o) === md(d))); }
    out[id] = { bpm: inf.bpm, len: inf.len, from: inf.from, voices: inf.voices, notes, bass, arp, kick, lo, hi, same: JSON.stringify(ls[0]) === JSON.stringify(ls[1]), seq: ls[0].join(','), chordTones: ok.every(Boolean), styleBpm: JUKEBOX.style[id].bpm,
      pat: [th.l, th.b, th.a].flatMap(v => v[3]).every(s => /^[0-9a-zA-Z.\\- ]+$/.test(s)), drums: Object.values(th.d).every(s => s.length === 16 && /^[xXgo.]+$/.test(s)) };
  } return out; })()`);
  const ids = Object.keys(gen);
  check(ids.length === 5 && ids.every(id => gen[id].len === 128 && gen[id].from === 0), 'every fighter theme is 8 bars (128 steps) and loops from the top');
  check(ids.every(id => gen[id].bpm === gen[id].styleBpm) && new Set(ids.map(id => gen[id].bpm)).size === 5, 'the five themes have five different tempos: ' + ids.map(id => id + ' ' + gen[id].bpm).join(', '));
  check(ids.every(id => Object.keys(gen[id].voices).join('') === 'lba'), 'each theme has a lead, a bass and an arpeggio voice');
  check(ids.every(id => gen[id].notes >= 20 && gen[id].bass >= 16 && gen[id].arp >= 8 && gen[id].kick >= 4), 'each theme has real material: ' + ids.map(id => id + ' lead ' + gen[id].notes + ' bass ' + gen[id].bass + ' arp ' + gen[id].arp).join(', '));
  check(ids.every(id => gen[id].lo >= 40 && gen[id].hi <= 100), 'every lead note sits in a singable range (MIDI 40..100): ' + ids.map(id => gen[id].lo + '-' + gen[id].hi).join(' '));
  check(new Set(ids.map(id => gen[id].seq)).size === 5 && ids.every(id => !gen[id].same), 'the five melodies differ, and the odd pass of each is another variant');
  check(ids.every(id => gen[id].chordTones), 'every bar of every lead opens on a tone of that bar\'s chord');
  check(ids.every(id => gen[id].pat && gen[id].drums), 'the generated patterns use only valid pattern characters and 16-step drum rows');
  check(await ev("(() => { const a = JSON.stringify(JUKEBOX.make('tibo', JUKEBOX.style.tibo)); return a === JSON.stringify(JUKEBOX.make('tibo', JUKEBOX.style.tibo)) && a !== JSON.stringify(JUKEBOX.make('muse', JUKEBOX.style.tibo)); })()"), 'the generator is seeded: the same fighter always gets the same song, another fighter another melody');

  // ---- the five themes render at the house level ----
  const rms = await ev(`(async () => { const out = []; for (const id of JUKEBOX.fighters) { const d = (await MUSIC.render(JUKEBOX.prefix + id)).getChannelData(0); let s = 0, pk = 0; for (const v of d) { s += v * v; pk = Math.max(pk, Math.abs(v)); } out.push([Math.sqrt(s / d.length), pk]); } return out; })()`);
  check(rms.every(([r]) => dB(r) > -18.5 && dB(r) < -15.5), 'audio: the five fighter themes render within -18.5..-15.5 dBFS RMS: ' + rms.map(([r], i) => ids[i] + ' ' + dB(r).toFixed(1)).join(', '));
  check(rms.every(([, pk]) => dB(pk) < -1), 'audio: no fighter theme clips: ' + rms.map(([, pk], i) => ids[i] + ' ' + dB(pk).toFixed(1)).join(', '));

  // ---- the accessors read the engine and change nothing ----
  const acc = await ev(`(() => { const before = [MUSIC.now, MUSIC.theme, MUSIC.themes().length], a = MUSIC.info('gpupit'), h0 = MUSIC.hits('gpupit', 0, 0), h1 = MUSIC.hits('gpupit', 1, 0), h4 = MUSIC.hits('gpupit', 4, 0), h64 = MUSIC.hits('gpupit', 64, 0), o = MUSIC.info('over'),
    ghost = MUSIC.hits('soft-nothing', 0, 0), x = MUSIC.hits('fight_dot', 14, 0), alt = [MUSIC.hits('gpupit', 0, 0).l, MUSIC.hits('gpupit', 0, 1).l];
    return { a, h0, h1, h4, h64, over: o, none: MUSIC.info('nope'), ghost, clock: MUSIC.clock(), kept: JSON.stringify(before) === JSON.stringify([MUSIC.now, MUSIC.theme, MUSIC.themes().length]), x, alt }; })()`);
  check(acc.a.bpm === 150 && acc.a.len === 64 && acc.a.from === 0 && acc.a.root === 57 && JSON.stringify(acc.a.voices) === '{"l":"sq","b":"saw","a":"pl"}', 'MUSIC.info reports the facts of a theme: ' + JSON.stringify(acc.a));
  check(acc.over.from === 32 && acc.over.bpm === 112 && acc.over.voices.a === undefined, 'MUSIC.info knows where a loop restarts and which voices a theme lacks: ' + JSON.stringify(acc.over));
  check(acc.h0.k === 1 && acc.h0.h === 1 && acc.h0.s === 0 && acc.h1.k === 0 && acc.h4.s === 1 && acc.h4.k === 1 && acc.h0.l > 0 && acc.h0.b > 0 && acc.h0.a > 0, 'MUSIC.hits tells what starts on a step: kick and hat on step 0, a snare with a kick on step 4, nothing on step 1');
  check(acc.h64.k === 1 && acc.h64.l === acc.h0.l && acc.alt[0] !== undefined && acc.alt[1] !== undefined, 'MUSIC.hits wraps the loop (step 64 is step 0) and answers for the odd pass too');
  check(acc.none === null && acc.ghost === null && acc.clock === null && acc.kept, 'unknown themes give null, no clock runs while nothing sounds, and the peeks change nothing');

  // ---- the screen: keys ----
  await fresh(); await ev(spy);
  check(await gesture(), 'the first key press starts the audio context');
  check(await openScreen(), 'ENTER on SOUND TEST opens the screen');
  const sw = await ev("game.titleSel");
  const o1 = await S();
  check(o1.open && o1.sel === 0 && o1.play === 'title' && (await ev('game.phase')) === 'title' && await until('MUSIC.now === "title"'), 'it opens on the first track with the title music sounding, still on the title phase');
  check(await shown('/SOUND TEST/') && await shown('/TITLE SCREEN/') && await shown('/NOW PLAYING/') && await shown('/BPM 132/'), 'the screen draws its heading, the list, NOW PLAYING and the facts of the playing track');
  await press('KeyS'); await press('ArrowDown');
  check((await S()).sel === 2 && (await ev('game.titleSel')) === sw && (await ev('game.phase')) === 'title', 'S and the down arrow move the cursor and the title menu below never sees the keys');
  await press('KeyW'); await press('KeyW'); await press('KeyW');
  const N = tr.length, wrapped = await S();
  check(wrapped.sel === N - 1 && wrapped.top === N - 14, 'the cursor wraps from the first track to the last and scrolls the list: sel ' + wrapped.sel + ' top ' + wrapped.top);
  await press('KeyS'); await press('KeyS'); await press('KeyS'); await press('KeyS');
  check((await S()).sel === 3 && (await S()).top === 0, 'and back around to the fourth track, the list scrolled to the top');
  const ga = tr[3].id;
  await press('Enter');
  check((await S()).play === ga && await until(`MUSIC.now === ${JSON.stringify(ga)}`) && (await ev('game.phase')) === 'title' && (await ev("SETTINGS.get('jukebox.last')")) === ga, 'ENTER plays the selected track (' + ga + ') and remembers it; the match does not start');
  check(await until('MUSIC.clock() && MUSIC.clock().name === ' + JSON.stringify(ga)) && await until('(step(1), JUKEBOX.state().src === "live")'), 'with sound running the visualiser follows the live music clock');
  const sync = await ev('(() => { step(1); const c = MUSIC.clock(), s = JUKEBOX.state(); return { d: Math.abs(c.step - s.step), r: c.rep === s.rep, st: s.step }; })()');
  check(sync.d < .2 && sync.r, 'the displayed step is the audio step (off by ' + sync.d.toFixed(3) + ' of a 16th)');
  let live = 0, over = 0;
  for (let i = 0; i < 30; i++) { const m = await ev('(() => { step(2); const b = JUKEBOX.state().bars; return [Math.max(...b), b.filter(v => v > .3).length]; })()'); live = Math.max(live, m[0]); over = Math.max(over, m[1]); await t.wait(40); }
  check(live > .8 && live <= 1 && over >= 4, 'the bars move with the live music: peak ' + live.toFixed(2) + ', up to ' + over + ' bars lit');
  await until('MUSIC.clock() && MUSIC.clock().step > 6', 3000);
  await press('Enter');
  check(await until('MUSIC.clock() && MUSIC.clock().step < 3 && MUSIC.now === ' + JSON.stringify(ga), 1500), 'ENTER on the playing track starts it again from the top');
  await press('Backspace');
  const st = await S();
  check(st.stopped && st.play === null && await until('MUSIC.now === null', 1000), 'the stop key silences the music');
  await ev('step(120); 1'); const dec = await S();
  check(dec.src === 'none' && dec.bars.every(v => v === 0) && dec.peak.every(v => v === 0), 'with nothing playing the bars fall to zero');
  check(await shown('/STOPPED/') && await shown('/PLAY/'), 'the screen says STOPPED and offers PLAY');
  await press('Enter');
  check(!(await S()).stopped && (await S()).play === ga && await until(`MUSIC.now === ${JSON.stringify(ga)}`), 'ENTER after a stop plays the selected track again');
  await press('Backspace'); await press('Escape');
  check(!(await ev('JUKEBOX.isOpen()')) && (await ev('game.titleSel')) === sw && (await ev('game.phase')) === 'title' && await until('MUSIC.now === "title"', 1500), 'ESC leaves after a stop: the title music comes back and the menu cursor is where it was');
  check(await openScreen() && (await S()).sel === 3, 'the screen opens again on the track last played');
  await press('KeyV');
  check(await ev("SETTINGS.get('jukebox.vs')") === true && await shown('/FIGHTER THEME ON THE VS|FIGHTER THEMES ON VS: ON/'), 'V switches the fighter themes on VS on, and the screen shows it');
  await press('KeyV');
  check(await ev("SETTINGS.get('jukebox.vs')") === false, 'V again switches it off');
  await press('KeyD');
  check((await S()).top > 0 && (await S()).sel >= (await S()).top && (await S()).sel < (await S()).top + 14, 'D pages down and keeps the cursor on screen: ' + JSON.stringify((({ top, sel }) => ({ top, sel }))(await S())));
  await press('KeyA');
  check((await S()).top === 0, 'A pages back up');
  await press('Escape');
  check(!(await ev('JUKEBOX.isOpen()')), 'ESC leaves the screen');

  // ---- fighter themes in the list: pick one and play it ----
  await ev("game.titleSel = titleItems().findIndex(i => i.id === 'jukebox'); step(1); 1"); await press('Enter');
  const fi = tr.findIndex(x => x.id === 'fight_wang');
  await ev(`(() => { const s = JUKEBOX.state(); for (let k = 0; k < 40 && JUKEBOX.state().sel !== ${fi}; k++) { pressed.KeyS = true; step(1); } return 1; })()`);
  await press('Enter');
  check((await S()).play === 'fight_wang' && await until('MUSIC.now === "fight_wang"'), 'a fighter theme plays from the list');
  check(await shown('/WANG - IRIDESCENT/') && await shown('/BPM 92/') && await shown('/FIGHTER THEME/'), 'the screen names the fighter theme and its tempo');
  await press('Escape');

  // ---- the virtual clock (muted): the bars come from the clock, step by step ----
  await press('KeyM');   // the mute key is its own listener: it works with the screen closed too
  check(await ev('muted') === true && await until('MUSIC.now === null', 1000), 'M mutes');
  await openScreen();
  const virt = await ev(`(() => { JUKEBOX.play('gpupit'); const out = []; let prev = -1, exps = new Set(); for (let i = 0; i < 480; i++) {
    const before = JUKEBOX.state().bars.slice(); step(1); const s = JUKEBOX.state(), cur = Math.floor(s.step) + 64 * s.rep, crossed = cur !== prev, h = MUSIC.hits('gpupit', Math.floor(s.step), s.rep);
    const e = h.l ? Math.max(0, Math.min(23, Math.round(6 + (h.l - 36) / 60 * 14))) : -1; if (crossed && e >= 0) exps.add(e);
    out.push({ src: s.src, crossed, kick: crossed && h.k > 0, bar1: s.bars[1], lead: crossed && e >= 0 ? s.bars[e] : null, rose: s.bars.some((v, k) => v > before[k] + 1e-9), cur }); prev = cur; }
    return { out, exps: exps.size }; })()`);
  const kicks = virt.out.filter(x => x.kick);
  check(virt.out.every(x => x.src === 'virtual') && (await ev('muted')), 'muted, the visualiser runs on the virtual clock');
  check(kicks.length >= 8 && kicks.every(x => x.bar1 >= .99), 'every kick of the theme lights the low bar on the tick that crosses it (' + kicks.length + ' kicks)');
  check(virt.out.every(x => x.crossed || !x.rose), 'a bar only rises on a tick that crosses a 16th step: between steps the bars only fall');
  check(virt.out.filter(x => x.lead !== null).length >= 15 && virt.out.filter(x => x.lead !== null).every(x => x.lead >= .95) && virt.exps >= 5, 'a lead note lights the bar of its pitch (' + virt.exps + ' different pitches seen)');
  const steps = virt.out.map(x => x.cur);
  check(steps.every((v, i) => i === 0 || v >= steps[i - 1]) && steps[steps.length - 1] >= 78 && steps[steps.length - 1] <= 81, 'the virtual clock runs at the tempo of the theme: 480 ticks at 150 BPM are ' + steps[steps.length - 1] + ' steps (expected 80)');
  const wrap = await ev(`(() => { JUKEBOX.play('over'); const inf = MUSIC.info('over'), out = []; for (let i = 0; i < 1000; i++) { step(1); const s = JUKEBOX.state(); out.push([s.rep, s.step]); } return { inf, out }; })()`);
  const w1 = wrap.out.findIndex(x => x[0] === 1);
  check(w1 > 0 && wrap.out[w1][1] >= wrap.inf.from && wrap.out[w1][1] < wrap.inf.from + .5 && wrap.out[w1 - 1][1] > wrap.inf.len - .5, 'a theme with a loop point wraps to it, not to the top: ' + wrap.inf.len + ' steps, back at step ' + (w1 > 0 ? wrap.out[w1][1].toFixed(2) : '?'));
  await press('Backspace');
  check((await S()).src === 'none' && (await S()).play === null, 'stopping in a muted run clears the clock');

  // ---- pointer: the list, the buttons, the wheel, no leaks to the title ----
  const keep = await ev('game.titleSel');
  const top0 = (await S()).top, row = tr[top0 + 4];   // the list may be scrolled: the fifth visible row
  await click(200, 94 + 4 * 28 + 14);
  const c1 = await S();
  check(c1.open && c1.play === row.id && c1.sel === top0 + 4 && (await ev('game.phase')) === 'title' && (await ev('game.titleSel')) === keep, 'a tap on a row plays it; the tap does not reach the title menu');
  await click(700, 300);
  check((await ev('JUKEBOX.isOpen()')) && (await ev('game.phase')) === 'title' && (await ev('game.titleSel')) === keep, 'a tap anywhere else on the screen does not confirm a title entry');
  await click(700, 464);
  check(await ev("SETTINGS.get('jukebox.vs')") === true && await shown('/FIGHTER THEMES ON VS: ON/'), 'the VS button switches the fighter themes on');
  await click(700, 464);
  check(await ev("SETTINGS.get('jukebox.vs')") === false, 'and off again');
  await click(500, 464);
  check((await S()).play === null && await shown('/PLAY/'), 'the STOP button stops');
  await click(500, 464);
  check((await S()).play === row.id, 'and the same button plays the selected track again');
  await ev("cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })); 1");
  check((await S()).sel === top0 + 5, 'the wheel moves the cursor');
  await click(400, 450);
  const pg = await S();
  check(pg.top === Math.min(14, N - 14) && pg.sel >= pg.top && pg.sel < pg.top + 14, 'the scroll bar pages the list: ' + JSON.stringify({ top: pg.top, sel: pg.sel }));
  await click(860, 464);
  check(!(await ev('JUKEBOX.isOpen()')) && (await ev('game.titleSel')) === keep && (await ev('game.phase')) === 'title', 'the BACK button leaves and the title cursor is restored');
  await ev("pressed = {}; 1".replace('pressed = {}', 'clearPressed()'));
  check(await openScreen(), 'the screen opens again');
  await ev("game.phase = 'select'; step(2); 1");
  check(!(await ev('JUKEBOX.isOpen()')), 'if something else takes the game over (another phase) the screen closes by itself');
  await ev("game.phase = 'title'; step(1); 1");

  // ---- the VS hook ----
  await fresh();
  const hook = await ev(`(() => { const g = id => ({ phase: 'vs', f: [{ d: { id } }, { d: { id: 'muse' } }] }), f = (w, gg) => HOOKS.filter('musicTheme', w, gg), off = f('vs', g('tibo'));
    SETTINGS.set('jukebox.vs', true);
    const on = JUKEBOX.fighters.map(id => f('vs', g(id))), other = f('gpupit', g('tibo')), unk = f('vs', g('zzz')), nof = f('vs', { phase: 'vs', f: [] }), none = f('vs', null);
    SETTINGS.set('jukebox.vs', false); return { off, on, other, unk, nof, none }; })()`);
  check(hook.off === 'vs', 'with the setting off the VS screen keeps the classic track');
  check(JSON.stringify(hook.on) === JSON.stringify(['fight_tibo', 'fight_poteto', 'fight_dot', 'fight_wang', 'fight_muse']), 'with it on the VS screen takes the theme of the first fighter: ' + hook.on.join(' '));
  check(hook.other === 'gpupit' && hook.unk === 'vs' && hook.nof === 'vs' && hook.none === 'vs', 'other themes and unknown fighters are left alone');
  await t.open('#demo=3,1&arena=2&stop'); await ev('SETTINGS.reset(); SETTINGS.set("jukebox.vs", true); 1');
  await tap('KeyH');
  check(await until('game.phase === "vs" && MUSIC.theme === "fight_wang" && MUSIC.now === "fight_wang"', 2000), 'a real match: the VS screen of Wang plays the Wang theme');
  await ev('SETTINGS.set("jukebox.vs", false); 1');
  check(await until('MUSIC.now === "vs"', 2000), 'switching the setting off puts the classic VS track back');
  await ev('SETTINGS.set("jukebox.vs", true); 1'); await t.stepUntil('fight');
  check(await until('MUSIC.now === ARENAS[game.arena].id', 2000) && await ev('MUSIC.err == null'), 'the fight itself plays the arena theme as before');
  await ev('SETTINGS.reset(); 1');
}
