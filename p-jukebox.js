'use strict';
// ===== AGENT BRAWL premium feature: JUKEBOX. The SOUND TEST screen, five fighter themes and the visualiser bars. Loaded last (see docs/ARCHITECTURE.md). =====
// Owner: p-jukebox (docs/features/p-jukebox.md). Plugs in through HOOKS 'titleItems' (the SOUND TEST entry), 'update' (keys, the clock), 'drawTop' (the screen) and 'musicTheme' (the track you picked,
// and the fighter theme on the VS screen), SETTINGS 'jukebox.vs' / 'jukebox.last', and MUSIC.define (the five themes). The only engine edit is the read-only block MUSIC.info / MUSIC.hits / MUSIC.clock at
// the end of music.js: they schedule and change nothing; the bars are read from them.
//   - SOUND TEST: every MUSIC theme by name (menu tracks, one per arena, the fighter themes, anything another feature defines). W/S pick, ENTER plays, the special key stops, V toggles the VS themes, ESC leaves.
//   - Fighter themes: generated here from a small style sheet per fighter (scale, tempo, chord loop, rhythm templates, a seeded melody walk), 8 bars each, defined as 'fight_<id>'. They play on the VS
//     screen only when SETTINGS 'jukebox.vs' is on (off by default: the match test expects the classic 'vs' track there).
//   - Visualiser: 24 bars fed by the music clock. With sound running the clock is MUSIC.clock() (the audio position); muted or before the sound starts, a virtual clock of the same tempo runs per tick.
// window.JUKEBOX is the small API the tests use.
(() => {
  if (!window.MUSIC || !MUSIC.define || !MUSIC.clock) return;   // no music engine: nothing to browse
  window.STUB_JUKEBOX = 1;   // marker: this file loaded

  SETTINGS.define('jukebox.vs', { def: false, label: 'FIGHTER THEMES ON VS' });   // true: the VS screen plays the theme of the first fighter instead of the classic 'vs' track
  SETTINGS.define('jukebox.last', { def: '', label: 'LAST SOUND TEST TRACK' });    // the theme the cursor starts on next time

  const GOLD = '#ffd76a', STEEL = '#d8d2c4', DIM = '#8a8374', GREEN = '#7ee08a', RED = '#ff6b5c', EDGE = '#c9a24a';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const blip = (f, d) => { try { beep(f, d || 0.04, 'square', 0.05); } catch (e) { /* audio is optional */ } };
  const PREFIX = 'fight_', ROWS = 14, NB = 24;

  // ---------- fighter themes: a style sheet per fighter, the notes are generated ----------
  const DOR = [0, 2, 3, 5, 7, 9, 10], MIX = [0, 2, 4, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11], WHL = [0, 2, 4, 6, 8, 10], PEN = [0, 2, 4, 7, 9];
  // per fighter: title, tempo, tonic (MIDI), scale, chord roots as scale degrees (one per bar, 8 bars), lead [instrument, octave offset in semitones, volume, [lowest, highest degree]], lead rhythm
  // templates (x note, - hold, . rest; one per bar, cycled), bass [instrument, offset, volume, template], arp [instrument, offset, volume, kind], drum kit, trim (level correction measured with MUSIC.render)
  const STYLE = {
    tibo: { title: 'SHIP IT', bpm: 148, root: 52, sc: DOR, prog: [0, 3, 0, 6, 0, 3, 4, 6], fill: 1,   // fast and direct: a square lead sprinting over a driving saw bass
      lead: ['sq', 12, .3, [-1, 9]], rhythm: ['x..xx.x.x..xx.x-', 'xx.xx.xx.xx.x---', 'x.x.xx.xx.x.xx.x', 'x--xx-xxx-x-x---'],
      bass: ['saw', -12, .42, 'drive'], arp: ['pl', 12, .17, 'ud'], drums: 'drive', trim: .74 },
    poteto: { title: 'SWEET HEAT', bpm: 112, root: 50, sc: MIX, prog: [0, 3, 0, 4, 0, 3, 4, 0], sw: .55, dv: .8,   // bouncy and warm: shuffled twang plucks over a boom-chuck bass
      lead: ['tw', 12, .34, [0, 9]], rhythm: ['x.x.x.x.x...x.x.', 'x...x.x.x.x.x...', 'x.x.xxx.x.x.x.x.', 'x.x.x.x.x.x.....'],
      bass: ['saw', -12, .4, 'boom'], arp: ['spl', 0, .2, 'strum'], drums: 'shuffle', trim: 1.12 },
    dot: { title: 'ROUND TRIP', bpm: 164, root: 55, sc: LYD, prog: [0, 1, 4, 5, 0, 1, 5, 4], dv: .5,   // soft, round and quick: a triangle lead, sparkling bells, light ghost-note drums
      lead: ['tri', 12, .4, [0, 9]], rhythm: ['x--x--x-x-x-----', 'x-x-x--x--x-x---', 'x--x--x-x--x--x-', 'x-x-xxx-x-------'],
      bass: ['tri', -12, .55, 'hop'], arp: ['bell', 12, .15, 'sparkle'], drums: 'soft', trim: .68 },
    wang: { title: 'IRIDESCENT', bpm: 92, root: 50, sc: WHL, prog: [0, 2, 4, 2, 0, 3, 4, 1], tm: [5.4, .12], dv: .5,   // calm and shimmering: whole-tone bells, a ghostly pad on triads, slow tremolo
      lead: ['bell', 12, .32, [0, 8]], rhythm: ['x---------x-----', 'x-----x---x---x-', 'x---------x---x-', 'x-------x-------'],
      bass: ['tri', -12, .5, 'pad'], arp: ['gh', 0, .26, 'pad'], drums: 'calm', trim: .64 },
    muse: { title: 'UNDO SWARM', bpm: 172, root: 53, sc: PEN, prog: [0, 3, 4, 2, 0, 3, 1, 4], fill: 1, undo: 1, dv: .8,   // fluffy and quick: 16th pings that run up and back down (undo), a swirling swarm of plucks
      lead: ['pl', 12, .22, [0, 6]], rhythm: ['xxxxxxxx.xxx.x..', 'x.xxx.xxxx.xx.x.', 'xxx.xxx.xxx.xxx.', 'x.x.x.x.xxxx.---'],
      bass: ['sq', -12, .36, 'pump'], arp: ['spl', 12, .16, 'swirl'], drums: 'swarm', trim: .76 },
  };
  const BASS = { drive: '1.11.11.1.11.1.5', boom: '1.5.1.5.1.5.1.5.', hop: '1...1.5.1...1.5.', pad: '1-------5-------', pump: '1.8.1.8.1.8.1.8.' };   // 1 root, 5 fifth, 8 octave
  const KITS = {
    drive: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' }, shuffle: { k: 'x.......x...x...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    soft: { k: 'x.......x.......', t: '..............x.', h: '..g...g...g...g.' }, calm: { k: 'x...............', t: '..........x.....', h: '....g.......g...' },
    swarm: { k: 'x...x...x...x...', s: '....x.......x...', h: 'XgxgXgxgXgxgXgxg' },
  };
  const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = a => () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // mulberry32: the same fighter always gets the same song
  const dch = d => d >= 0 ? d.toString(36) : String.fromCharCode(64 - d);   // scale degree -> pattern character (0-9a-z up, A-Z down)
  function make(id, S) {
    const n = S.sc.length, tones = r => [r, r + 2, r + 4, r + n], at = (b, k) => S.prog[(b + k) % S.prog.length];
    const near = (arr, v) => arr.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best);
    const [lo, hi] = S.lead[3], ct = r => [0, 2, 4].flatMap(o => [r + o - n, r + o, r + o + n]).filter(x => x >= lo && x <= hi);   // the chord tones of degree r (root, third, fifth in every octave) inside the lead range
    const lead = v => {   // v = 0 for even passes, 1 for odd passes: another seed and another rhythm order over the same chords
      const g = rng(hash(id + v)); let cur = ct(S.prog[0])[0], dir = 1;
      return S.prog.map((r, b) => {
        const tm = S.rhythm[(b + 2 * v) % S.rhythm.length], xs = [...tm].flatMap((c, i) => c === 'x' ? [i] : []);
        dir = S.undo ? (b % 2 ? -1 : 1) : (g() < .5 ? 1 : -1);
        return [...tm].map((c, i) => {
          if (c !== 'x') return c;
          let d;
          if (i === xs[0]) { const o = ct(r); d = o[Math.floor(g() * o.length)]; }       // a bar opens on a chord tone
          else if (i === xs[xs.length - 1]) d = near(ct(at(b, 1)), cur);                // and ends next to a tone of the following chord
          else { const u = g(); d = u < .6 ? cur + dir : u < .78 ? cur + 2 * dir : u < .9 ? near(ct(r), cur) : cur; }   // mostly a step, sometimes a skip, a chord tone or a repeat
          const e = clamp(d, lo, hi); if (e !== d) dir = -dir;
          cur = e; return dch(e);
        }).join('');
      }).join(' ');
    };
    const bass = S.prog.map(r => [...BASS[S.bass[3]]].map(c => c === '.' || c === '-' ? c : dch(r + (c === '8' ? n : c === '5' ? 4 : 0))).join('')).join(' ');
    const ga = rng(hash(id + 'a')), kind = S.arp[3];
    const arp = S.prog.map(r => {
      const ch = tones(r); let cur = 0;
      return Array.from({ length: 16 }, (_, i) => {
        if (kind === 'ud') return dch(ch[[0, 1, 2, 3, 2, 1][i % 6]]);
        if (kind === 'strum') return i === 4 || i === 12 ? dch(r) : '.';
        if (kind === 'pad') return i === 0 ? dch(r) : '-';
        if (kind === 'sparkle') return i === 0 || (i % 2 === 0 && ga() < .5) ? dch(ch[Math.floor(ga() * 4)]) : '.';
        cur = clamp(cur + (ga() < .5 ? 1 : -1), 0, 3); return dch(ch[cur]);   // swirl: a 16th walk through the chord tones
      }).join('');
    }).join(' ');
    return {
      bpm: S.bpm, root: S.root, sc: S.sc, fill: S.fill, sw: S.sw, tm: S.tm, dv: S.dv,
      l: [S.lead[0], S.lead[1], S.lead[2], [lead(0), lead(1)]], b: [S.bass[0], S.bass[1], S.bass[2], [bass]], a: [S.arp[0], S.arp[1], S.arp[2], [arp], kind === 'strum' || kind === 'pad' ? 1 : 0],
      d: Object.assign({}, KITS[S.drums]),
    };
  }
  const fighterIds = [];
  for (const r of ROSTER) if (STYLE[r.id]) { MUSIC.define(PREFIX + r.id, make(r.id, STYLE[r.id]), { trim: STYLE[r.id].trim }); fighterIds.push(r.id); }

  // ---------- the track list ----------
  const MENU_NAMES = { title: 'TITLE SCREEN', vs: 'VERSUS SCREEN', over: 'MATCH OVER' };
  const INS_NAMES = { sq: 'SQUARE', sq2: 'DUAL SQUARE', saw: 'SAW', saw2: 'DUAL SAW', tri: 'TRIANGLE', pl: 'PLUCK', spl: 'SAW PLUCK', tw: 'TWANG', org: 'ORGAN', bell: 'BELL', gh: 'GHOST' };
  let cache = null;
  function tracks() {   // { id, group, name, col, fighter? } in the order MENU, ARENA (arena order), FIGHTER (roster order), EXTRA (whatever else was MUSIC.define'd)
    const all = MUSIC.themes();
    if (cache && cache.n === all.length && cache.a === ARENAS.length) return cache.list;
    const list = [], seen = new Set(), add = (id, group, name, col, fighter) => { if (!all.includes(id) || seen.has(id)) return; seen.add(id); list.push({ id, group, name, col, fighter }); };
    for (const id of ['title', 'vs', 'over']) add(id, 'MENU', MENU_NAMES[id], GOLD);
    for (const a of ARENAS) add(a.id, 'ARENA', a.name, a.accent || GOLD);
    for (const id of fighterIds) { const r = ROSTER.find(x => x.id === id); add(PREFIX + id, 'FIGHTER', SHORT(r) + ' - ' + STYLE[id].title, r.col, id); }
    for (const id of all) add(id, 'EXTRA', id.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() || 'EXTRA', GOLD);
    cache = { n: all.length, a: ARENAS.length, list };
    return list;
  }
  const themeFor = fid => fighterIds.includes(fid) && MUSIC.themes().includes(PREFIX + fid) ? PREFIX + fid : null;

  // ---------- state ----------
  const ui = { open: false, sel: 0, top: 0, play: null, stopped: false, t: 0, saveSel: 0, v: null, lin: null, src: 'none', step: 0, rep: 0, bars: new Array(NB).fill(0), peak: new Array(NB).fill(0), msg: '', msgT: -1e9 };
  const note = m => { ui.msg = m; ui.msgT = ui.t; };
  const ensureVisible = () => { const N = tracks().length; ui.sel = clamp(ui.sel, 0, N - 1); if (ui.sel < ui.top) ui.top = ui.sel; if (ui.sel >= ui.top + ROWS) ui.top = ui.sel - ROWS + 1; ui.top = clamp(ui.top, 0, Math.max(0, N - ROWS)); };
  function openIt() {
    if (ui.open || game.phase !== 'title') return false;
    const list = tracks(), i = list.findIndex(t => t.id === SETTINGS.get('jukebox.last'));
    ui.open = true; ui.t = 0; ui.sel = i >= 0 ? i : 0; ui.top = 0; ui.saveSel = game.titleSel; ui.stopped = false; ui.msg = ''; ui.msgT = -1e9;
    ui.play = list.some(t => t.id === 'title') ? 'title' : null; ui.v = null; ui.lin = null; ui.bars.fill(0); ui.peak.fill(0);   // the title track is what is sounding when the screen opens
    ensureVisible(); clearPressed(); blip(700, .08);
    return true;
  }
  function close(quiet) {
    if (!ui.open) return;
    ui.open = false; ui.play = null; ui.v = null; ui.lin = null;
    if (ui.stopped) { MUSIC.resume(); ui.stopped = false; }
    game.titleSel = clamp(ui.saveSel, 0, Math.max(0, titleItems().length - 1));
    if (!quiet) { clearPressed(); blip(330); }
  }
  function play(id) {   // start a track from its top (a track that is playing restarts)
    if (!tracks().some(t => t.id === id)) return false;
    if (ui.stopped) { MUSIC.resume(); ui.stopped = false; }
    if (ui.play === id) { MUSIC.stop(); MUSIC.resume(); }   // the engine begins the theme afresh at its next poll
    ui.play = id; ui.v = { name: id, step: 0, rep: 0 }; ui.lin = null;
    try { SETTINGS.set('jukebox.last', id); } catch (e) { /* storage is optional */ }
    blip(880, .05); return true;
  }
  function stop() { if (!ui.open) return; ui.play = null; ui.v = null; ui.lin = null; MUSIC.stop(); ui.stopped = true; blip(300, .05); }
  function toggleVs() { const on = SETTINGS.toggle('jukebox.vs'); note(on ? 'THE VS SCREEN PLAYS THE FIGHTER THEME' : 'THE VS SCREEN PLAYS THE CLASSIC TRACK'); blip(on ? 880 : 440, .05); return on; }
  function move(d, wrap) { const N = tracks().length; ui.sel = wrap ? (ui.sel + d + N) % N : clamp(ui.sel + d, 0, N - 1); ensureVisible(); blip(400); }
  const pageBy = d => { const N = tracks().length; ui.top = clamp(ui.top + d * ROWS, 0, Math.max(0, N - ROWS)); ui.sel = clamp(ui.sel, ui.top, Math.min(N - 1, ui.top + ROWS - 1)); blip(400); };

  // ---------- the music clock and the bars ----------
  const lin = (inf, rep, st) => rep < 1 ? st : inf.len + (rep - 1) * (inf.len - inf.from) + (st - inf.from);   // steps since the start, counting loop passes
  const unlin = (inf, l) => { if (l < inf.len) return [0, l]; const per = inf.len - inf.from, k = Math.floor((l - inf.len) / per); return [k + 1, inf.from + (l - inf.len) - k * per]; };
  const BINS = {   // which bars a drum hit lights (bar index, strength)
    k: [[0, .9], [1, 1], [2, .85], [3, .45]], t: [[3, .4], [4, .8], [5, .9], [6, .5]],
    s: [[7, .5], [8, .8], [9, .95], [10, .9], [11, .7], [12, .45]], h: [[16, .35], [17, .5], [18, .6], [19, .65], [20, .6], [21, .5], [22, .4], [23, .3]],
  };
  const bump = (i, v) => { if (i >= 0 && i < NB && v > ui.bars[i]) ui.bars[i] = Math.min(1, v); };
  const bin = (m, lo, span, a, b) => clamp(Math.round(a + (m - lo) / span * (b - a)), 0, NB - 1);
  function feed(name, rep, st) {   // one 16th step of the theme starts: kick low, snare in the middle, hats high, notes by pitch
    const h = MUSIC.hits(name, st, rep); if (!h) return;
    for (const k of ['k', 't', 's', 'h']) if (h[k]) for (const [i, v] of BINS[k]) bump(i, v * Math.min(1, .2 + h[k] * .8));
    if (h.b) bump(bin(h.b, 28, 24, 0, 5), .8);
    if (h.l) { const b = bin(h.l, 36, 60, 6, 20); bump(b, .95); bump(b - 1, .55); bump(b + 1, .55); }
    if (h.a) { const b = bin(h.a, 36, 60, 8, 22); bump(b, .6); bump(b - 1, .3); bump(b + 1, .3); }
  }
  function clockTick() {
    for (let i = 0; i < NB; i++) { ui.bars[i] *= .88; if (ui.bars[i] < .01) ui.bars[i] = 0; ui.peak[i] = Math.max(ui.peak[i] - .014, ui.bars[i]); }
    const nm = ui.play, inf = nm && MUSIC.info(nm); ui.src = 'none';
    if (!inf) return;
    const live = MUSIC.clock();
    if (live && live.name === nm) { ui.v = { name: nm, step: live.step, rep: live.rep }; ui.src = 'live'; }   // the audio position
    else {   // muted, not started yet or stopped by the browser: the same tempo, one game tick at a time
      if (!ui.v || ui.v.name !== nm) ui.v = { name: nm, step: 0, rep: 0 };
      ui.v.step += inf.bpm / 15 / 60; if (ui.v.step >= inf.len) { ui.v.step = inf.from + (ui.v.step - inf.len); ui.v.rep++; }
      ui.src = 'virtual';
    }
    ui.step = ui.v.step; ui.rep = ui.v.rep;
    const cur = Math.floor(lin(inf, ui.rep, ui.step));
    if (!ui.lin || ui.lin.name !== nm || cur < ui.lin.v || cur - ui.lin.v > 8) ui.lin = { name: nm, v: cur - 1 };   // first sight, a restart or a long gap: only the step that is sounding now
    for (let l = ui.lin.v + 1; l <= cur; l++) { const [r, s] = unlin(inf, l); feed(nm, r, s); }
    ui.lin.v = cur;
  }

  // ---------- keys and pointer ----------
  const any = (...codes) => { let r = false; for (const c of codes) if (tap(c)) r = true; return r; };
  const both = a => { const x = hit(0, a), y = hit(1, a); return x || y; };
  const playSel = () => { const t = tracks()[ui.sel]; if (t) play(t.id); };
  function onUpdate(g) {
    if (!ui.open) return;
    if (g.phase !== 'title') { close(true); return; }   // something else took the game over (a test, another feature): drop the screen
    ui.t++;
    const up = any('KeyW', 'ArrowUp') | both('u'), dn = any('KeyS', 'ArrowDown') | both('d'), lf = any('KeyA', 'ArrowLeft') | both('l'), rt = any('KeyD', 'ArrowRight') | both('r');
    const ok = any('Enter', 'NumpadEnter', 'Space') | both('p'), back = any('Escape') | both('k'), st = any('Backspace') | both('s'), vs = any('KeyV') | both('x');
    clearPressed();   // the title menu below must not see any key
    if (up) move(-1, true); else if (dn) move(1, true);
    if (lf) pageBy(-1); if (rt) pageBy(1);
    if (ok) playSel();
    if (st) { if (ui.play) stop(); else playSel(); }
    if (vs) toggleVs();
    if (back) { close(); return; }
    clockTick();
  }
  HOOKS.add('update', onUpdate, -40);
  const buttons = () => [
    { id: 'stop', x: 448, y: 452, w: 130, h: 24, label: ui.play ? 'STOP' : 'PLAY', act: () => { if (ui.play) stop(); else playSel(); } },
    { id: 'vs', x: 590, y: 452, w: 214, h: 24, label: 'FIGHTER THEMES ON VS: ' + (SETTINGS.get('jukebox.vs') ? 'ON' : 'OFF'), act: toggleVs },
    { id: 'back', x: 816, y: 452, w: 88, h: 24, label: 'BACK', act: () => close() },
  ];
  function pointer(x, y) {
    const list = tracks();
    if (x >= 40 && x < 388 && y >= 94 && y < 94 + ROWS * 28) { const i = ui.top + Math.floor((y - 94) / 28); if (i < list.length) { ui.sel = i; ensureVisible(); play(list[i].id); } return; }
    if (x >= 388 && x <= 412 && y >= 94 && y < 490) { pageBy(y < 292 ? -1 : 1); return; }   // the scroll bar: top half pages up, bottom half pages down
    for (const b of buttons()) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
  }
  addEventListener('pointerdown', e => {   // taken in the capture phase, after options.js, so the engine's tap-to-confirm never sees a tap on this screen
    if (!ui.open || e.target !== cv || game.phase !== 'title' || e.button > 0) return;
    e.preventDefault(); e.stopImmediatePropagation(); if (e.pointerType !== 'mouse') touch.on = true;
    const r = cv.getBoundingClientRect(); pointer((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
  }, true);
  addEventListener('wheel', e => { if (!ui.open) return; e.preventDefault(); move(e.deltaY > 0 ? 1 : -1, false); }, { passive: false, capture: true });

  // ---------- the title entry and the music hook ----------
  HOOKS.add('titleItems', () => [{ id: 'jukebox', label: 'SOUND TEST', order: 800, run: () => { openIt(); } }]);
  HOOKS.add('musicTheme', (w, g) => {
    if (ui.open && g && g.phase === 'title') return ui.play || undefined;   // the track picked on the SOUND TEST (stopped: the engine is switched off)
    if (w === 'vs' && g && g.f && g.f[0] && SETTINGS.get('jukebox.vs')) { const th = themeFor(g.f[0].d && g.f[0].d.id); if (th) return th; }   // the VS screen (and the round-1 intro) plays the first fighter's theme
    return undefined;
  });

  // ---------- drawing ----------
  function backdrop(c) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a16'); g.addColorStop(1, '#141b36'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,150,255,0.07)'; const o = (ui.t * 0.4) % 32;
    for (let x = -o; x < W; x += 32) c.fillRect(Math.round(x), 0, 1, H);
    for (let y = -o; y < H; y += 32) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  }
  function panel(c, x, y, w, h) { c.fillStyle = 'rgba(8,6,12,0.9)'; c.fillRect(x, y, w, h); c.strokeStyle = EDGE; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  const pad2 = n => (n < 10 ? '0' : '') + n, mmss = s => Math.floor(s / 60) + ':' + pad2(Math.floor(s % 60));
  const noteName = m => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((m % 12) + 12) % 12];
  function bars(c, x0, base, col) {   // 24 bars of up to 20 blocks; the white tick is the peak that falls slowly
    for (let i = 0; i < NB; i++) {
      const n = Math.round(ui.bars[i] * 20), pk = Math.round(ui.peak[i] * 20), x = x0 + i * 19;
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x, base - 2, 16, 2);
      for (let s = 0; s < n; s++) { c.globalAlpha = s > 14 ? 1 : .55 + s * .03; c.fillStyle = s > 16 ? '#fff6d6' : col; c.fillRect(x, base - 8 - s * 6, 16, 5); }
      c.globalAlpha = 1; if (pk > n) { c.fillStyle = '#fff'; c.fillRect(x, base - 8 - (pk - 1) * 6, 16, 2); }
    }
  }
  function draw(c) {
    const list = tracks(), N = list.length, pl = list.find(t => t.id === ui.play) || null, inf = pl && MUSIC.info(pl.id), acc = pl ? pl.col : DIM, isMuted = typeof muted !== 'undefined' && muted;
    backdrop(c);
    drawTitleText(c, 'SOUND TEST', W / 2, 38, 38, { align: 'center', style: 'gold', glow: true });
    uiText(N + ' TRACKS' + (isMuted ? ' - MUTED, PRESS M FOR SOUND' : ''), W / 2, 72, 14, isMuted ? RED : DIM);
    // the track list
    panel(c, 36, 92, 376, 398);
    for (let r = 0; r < ROWS; r++) {
      const i = ui.top + r; if (i >= N) break;
      const t = list[i], y = 108 + r * 28, hot = i === ui.sel, on = t.id === ui.play;
      if (hot) { c.fillStyle = 'rgba(255,215,106,0.18)'; c.fillRect(44, y - 13, 340, 26); c.strokeStyle = GOLD; c.lineWidth = 1; c.strokeRect(44.5, y - 12.5, 339, 25); }
      uiText(pad2(i + 1), 54, y, 14, DIM, 'left');
      uiText(t.name, 86, y, 17, on ? GREEN : hot ? GOLD : STEEL, 'left');
      if (on) { for (let k = 0; k < 3; k++) { const hh = 4 + Math.round(ui.bars[[1, 9, 18][k]] * 14); c.fillStyle = GREEN; c.fillRect(348 + k * 9, y + 8 - hh, 6, hh); } }
      else uiText(t.group, 376, y, 11, DIM, 'right');
    }
    if (N > ROWS) {   // scroll bar
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(394, 98, 8, 384);
      const th = Math.max(24, 384 * ROWS / N); c.fillStyle = EDGE; c.fillRect(394, 98 + (384 - th) * ui.top / (N - ROWS), 8, th);
    }
    // now playing
    panel(c, 428, 92, 496, 398);
    uiText(pl ? 'NOW PLAYING' : 'STOPPED', 448, 110, 13, pl ? GREEN : RED, 'left');
    if (pl) {
      drawTitleText(c, pl.name, 448, 140, 26, { align: 'left', style: 'gold', glow: .5, maxW: pl.fighter ? 340 : 456 });
      uiText(pl.group + ' THEME', 448, 168, 15, acc, 'left');
      if (pl.fighter) drawSprite(c, pl.fighter, 'idle', loopFrame('idle', ui.t), 862, 246, 1, 1.2);
      if (inf) {
        const sd = 15 / inf.bpm, vs = Object.keys(inf.voices).map(k => ({ l: 'LEAD', b: 'BASS', a: 'ARP' }[k] + ' ' + (INS_NAMES[inf.voices[k]] || String(inf.voices[k]).toUpperCase())));
        uiText('BPM ' + inf.bpm + ' - KEY OF ' + noteName(inf.root) + ' - ' + Math.round(inf.len / 16) + ' BARS - ' + mmss(inf.len * sd) + ' LOOP', 448, 196, 16, STEEL, 'left');
        uiText(vs.join(' - '), 448, 218, 14, DIM, 'left');
        bars(c, 448, 402, acc);
        const cs = Math.floor(ui.step) % 16;   // the 16 steps of the bar that is sounding
        for (let i = 0; i < 16; i++) { c.fillStyle = i === cs ? '#fff6d6' : i % 4 === 0 ? 'rgba(255,215,106,0.35)' : 'rgba(255,255,255,0.12)'; c.fillRect(448 + i * 28.5, 412, 25, 10); }
        uiText('BAR ' + (Math.floor(ui.step / 16) + 1) + ' OF ' + Math.round(inf.len / 16) + ' - PASS ' + (ui.rep + 1), 448, 438, 14, STEEL, 'left');
        uiText(mmss(ui.step * sd) + ' / ' + mmss(inf.len * sd), 904, 438, 14, STEEL, 'right');
      }
    } else { uiText('PRESS ENTER OR TAP A TRACK', 448, 150, 16, DIM, 'left'); bars(c, 448, 402, DIM); }
    for (const b of buttons()) {
      const hot = b.id === 'vs' && SETTINGS.get('jukebox.vs');
      c.fillStyle = hot ? 'rgba(126,224,138,0.18)' : 'rgba(255,255,255,0.07)'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = hot ? GREEN : EDGE; c.lineWidth = 1; c.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
      uiText(b.label, b.x + b.w / 2, b.y + b.h / 2, 14, hot ? GREEN : STEEL);
    }
    const live = ui.t - ui.msgT < 150 && ui.msg, L = LABEL[0];
    c.fillStyle = 'rgba(5,3,4,0.95)'; c.fillRect(0, 502, W, H - 502);
    uiText(live ? ui.msg : touch.on ? 'TAP A TRACK TO PLAY - THE BUTTONS STOP, SWITCH THE VS THEMES OR GO BACK' : 'W/S SELECT - A/D PAGE - ENTER PLAY - ' + L.s + ' STOP - V VS THEMES - ' + L.k + ' OR ESC BACK', W / 2, 520, live ? 16 : 14, live ? GREEN : '#c9c3b8');
  }
  HOOKS.add('drawTop', c => { if (ui.open && game.phase === 'title') draw(c); });

  window.JUKEBOX = {
    open: openIt, close, isOpen: () => ui.open, play, stop, toggleVs, themeFor, prefix: PREFIX, fighters: fighterIds.slice(), make, style: STYLE,
    tracks: () => tracks().map(t => Object.assign({}, t)),
    state: () => ({ open: ui.open, sel: ui.sel, top: ui.top, play: ui.play, stopped: ui.stopped, src: ui.src, step: ui.step, rep: ui.rep, bars: ui.bars.slice(), peak: ui.peak.slice(), vs: SETTINGS.get('jukebox.vs') }),
    draw: c => draw(c || ctx),
  };
})();
