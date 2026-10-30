// ===== AGENT BRAWL feature file: REPLAYS (premium). Loaded after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: the p-replays agent. Only that agent edits this file, tools/tests/x-p-replays.mjs and docs/features/p-replays.md.
// Area: input-based match replays. Every VERSUS match (1P vs CPU, 2 players, and the CPU vs CPU demo) is recorded as the keys both players held and
//       pressed on each tick, plus one random seed; the last 5 are kept in SETTINGS 'replays.list'. The REPLAYS title entry lists them and plays one
//       back by running the real simulation again from the same start (same fighters, arena, settings, seed) with the recorded keys fed in, so the
//       replay is the match itself, not a video. Playback has pause, 1X / 2X speed and single-frame steps, and checks itself: a checksum of both
//       fighters every 30 ticks and the final winner and health must match the recording, or the replay is marked DESYNC.
// How the randomness is pinned: while a recorded match runs, Math.random is a hash of (seed, tick of the match, call number in that tick), so the
//       CPU brain, combat rolls and every other in-tick draw repeat exactly, and draws made between ticks (render shake, music) cannot shift them.
//       It is installed only over the browser's own Math.random (a test that seeded Math.random itself is left alone and that match is not recorded),
//       and removed as soon as the match ends.
// Plug in with: BUS 'phase' (a match starts at the switch to 'vs', inside startMatch), 'match:start' (who, where), 'match:end' (result, save or verify);
//       HOOKS 'update' (order -1e9, first: tick counter, recording, feeding the keys back, the list screen keys), 'titleItems' (REPLAYS),
//       'drawTop' (list screen and the playback bar); SETTINGS 'replays.list' and 'replays.restore' (the viewer's settings while a replay runs,
//       put back on the next load if the page closes mid-replay). Engine globals read: keys, pressed, tap, clearPressed, pollPads, startMatch,
//       setPhase, running, hold, step, TICK, ROSTER, ARENAS, NOISE / thud (warms the impact noise buffer before a match so its one-time fill never
//       lands inside a recorded tick). No engine file is edited.
// Public: window.REPLAYS (see the bottom of this file and docs/features/p-replays.md).
'use strict';
(() => {
  window.STUB_P_REPLAYS = 1;   // marker: this file loaded

  const KEEP = 5, CK_EVERY = 30, TAIL = 90, LATE = 600, MAX_TICKS = 216000, MAX_CHARS = 400000;
  const REC_MODES = ['versus', 'versus2'];
  // settings that only change how the match looks or sounds: the viewer keeps their own while watching
  const VIEWER_ONLY = ['musicVol', 'sfxVol', 'voiceVol', 'muted', 'gore', 'shake', 'reduceFlash', 'crt', 'announcer', 'trackToast'];
  const NATIVE = Math.random;
  const GOLD = '#f5c542', STEEL = '#9aa3b5', DIM = '#6b7184', GREEN = '#5ad16a', RED = '#ff5a4f', INK = '#0b0a12';

  SETTINGS.define('replays.list', { def: [], label: 'REPLAYS' });           // newest first, at most 5 entries (format in docs/features/p-replays.md)
  SETTINGS.define('replays.restore', { def: null, label: 'REPLAY RESTORE' }); // the viewer's settings while a replay runs; null when none is running

  // ---------- the pinned random generator ----------
  const R = { on: false, seed: 0, rt: 0, ctr: 0 };
  const fmix = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  function seeded() {
    if (!R.on) return NATIVE();
    const h = fmix(Math.imul(R.seed ^ Math.imul(R.rt + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(++R.ctr, 0xc2b2ae35));
    return h / 4294967296;
  }
  const canPin = () => Math.random === NATIVE || Math.random === seeded;
  function pin(seed) { R.seed = seed >>> 0; R.rt = 0; R.ctr = 0; R.on = true; Math.random = seeded; try { FX.seed((seed ^ 0x5f3759df) >>> 0); } catch (e) { /* FX is optional */ } }
  function unpin() { R.on = false; if (Math.random === seeded) Math.random = NATIVE; }
  function warm() {   // the engine fills its impact noise buffer on the first hit it plays; do it now, outside the recorded ticks
    try { if (typeof NOISE !== 'undefined' && NOISE === null && typeof thud === 'function') thud(0.01, 0.00001); } catch (e) { /* audio is optional */ }
  }

  // ---------- helpers ----------
  const entries = () => { const l = SETTINGS.get('replays.list'); return Array.isArray(l) ? l : []; };
  const valid = e => !!(e && e.v === 1 && Array.isArray(e.ids) && e.ids.length === 2 && typeof e.seed === 'number' && typeof e.len === 'number' && e.res && Array.isArray(e.res.hp));
  const fighterIdx = id => ROSTER.findIndex(r => r.id === id);
  const arenaIdx = e => { const i = ARENAS.findIndex(a => a && a.id === e.arenaId); return i >= 0 ? i : e.arena >= 0 && e.arena < ARENAS.length ? e.arena : 0; };
  const playable = e => valid(e) && fighterIdx(e.ids[0]) >= 0 && fighterIdx(e.ids[1]) >= 0;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ascii = s => String(s).toUpperCase().replace(/[^\x20-\x7e]/g, '');
  const anyTap = l => { let r = false; for (let i = 0; i < l.length; i++) if (tap(l[i])) r = true; return r; };
  const offAll = () => { for (const c in keys) keys[c] = false; for (const c in pressed) pressed[c] = false; };
  const snd = (f, d) => { try { beep(f, d); } catch (e) { /* audio is optional */ } };
  function checksum(g) {
    let h = R.seed | 0; const f = g.f;
    const mix = v => { h = fmix((h ^ (Math.round(v * 100) | 0)) + 0x632be5ab | 0) | 0; };
    for (let i = 0; i < 2; i++) { const x = f[i]; if (!x) continue; mix(x.hp); mix(x.x); mix(x.y); mix(x.meter || 0); }
    mix(g.round || 0); if (g.phase !== 'vs') mix(g.timer || 0);   // during the VS screen the timer still holds the last match's value
    return ((h >>> 0) % 46656).toString(36).padStart(3, '0');
  }
  function sameSet(obj, prev, idx) {   // true when the truthy codes of obj are exactly the code numbers in prev (no allocation)
    let n = 0;
    for (const c in obj) if (obj[c]) { n++; const i = idx[c]; if (i === undefined || prev.indexOf(i) < 0) return false; }
    return n === prev.length;
  }
  function settingsSnapshot() {   // what the simulation reads: every plain setting except the look-and-sound ones, plus the key bindings
    const o = {};
    for (const d of SETTINGS.list()) {
      const k = d.key; if (k.startsWith('replays.') || VIEWER_ONLY.includes(k)) continue;
      if (d.type === 'bool' || d.type === 'num' || d.type === 'enum' || k === 'binds') o[k] = JSON.parse(JSON.stringify(SETTINGS.get(k) === undefined ? null : SETTINGS.get(k)));
    }
    return o;
  }
  function viewerSettings() { const a = SETTINGS.all(), o = {}; for (const k in a) if (!k.startsWith('replays.')) o[k] = a[k] === undefined ? null : a[k]; return JSON.parse(JSON.stringify(o)); }
  function putBack(saved) { for (const k in saved) { if (k === 'muted' || k.startsWith('replays.')) continue; if (!same(SETTINGS.get(k), saved[k])) SETTINGS.set(k, saved[k]); } }

  // ---------- sessions: one recording or one playback at a time ----------
  let S = null, PEND = null, VIEW = null, BUSY = false, raf = 0, lastT = 0, boot = true;

  function startRecording() {
    warm(); pin((NATIVE() * 4294967296) >>> 0);
    S = { play: false, rt: 0, tk: game.tick, set: settingsSnapshot(), codes: [], idx: {}, prevH: [], prevP: [], ev: [], size: 0, lastRt: 0, pz: [], pzOn: false, ck: '', cpu: null, meta: null };
  }
  function abort() { if (S && !S.play) { S = null; unpin(); } }
  function codeNo(c) { let i = S.idx[c]; if (i === undefined) { i = S.idx[c] = S.codes.length; S.codes.push(c); } return i; }
  function recTick(g) {
    if (Math.random !== seeded || S.rt > MAX_TICKS || S.size > MAX_CHARS) { abort(); return; }   // something else took Math.random over, or the match ran away
    if (S.rt === 1) S.cpu = [g.f[0] && g.f[0].cpu ? 1 : 0, g.f[1] && g.f[1].cpu ? 1 : 0];
    const pz = g.phase === 'pause'; if (pz !== S.pzOn) { S.pz.push(S.rt); S.pzOn = pz; }
    if (S.rt % CK_EVERY === 0) S.ck += checksum(g);
    if (sameSet(keys, S.prevH, S.idx) && sameSet(pressed, S.prevP, S.idx)) return;
    const h = [], p = [];
    for (const c in keys) if (keys[c]) h.push(codeNo(c));
    for (const c in pressed) if (pressed[c]) p.push(codeNo(c));
    const s = (S.rt - S.lastRt).toString(36) + ':' + h.map(i => i.toString(36)).join('.') + '|' + p.map(i => i.toString(36)).join('.');
    S.ev.push(s); S.size += s.length + 1; S.lastRt = S.rt; S.prevH = h; S.prevP = p;
  }
  function save(info) {
    const g = game, m = S.meta || {}, w = info && info.winner ? info.winner.side : -1;
    const e = {
      v: 1, at: Date.now(), modeId: m.modeId || g.modeId, mode: m.mode || g.mode, ids: [g.f[0].d.id, g.f[1].d.id], sel: m.sel || g.sel.slice(),
      arena: m.arena, arenaId: m.arenaId, cpu: S.cpu || [g.f[0].cpu ? 1 : 0, g.f[1].cpu ? 1 : 0], seed: R.seed, tk: S.tk, set: S.set,
      codes: S.codes, ev: S.ev.join(';'), pz: S.pz, ck: S.ck, len: S.rt,
      res: { w, hp: [g.f[0].hp, g.f[1].hp], wins: info && Array.isArray(info.wins) ? info.wins.slice() : g.wins.slice(), rounds: info && info.rounds || 0 },
    };
    S = null; unpin();
    SETTINGS.set('replays.list', [e].concat(entries()).slice(0, KEEP));
  }

  function decode(e) {
    const evs = e.ev ? e.ev.split(';') : [], n = evs.length, T = new Int32Array(n), H = new Array(n), P = new Array(n), codes = e.codes || [];
    let t = 0;
    const list = s => s ? s.split('.').map(x => codes[parseInt(x, 36)]).filter(c => typeof c === 'string') : [];
    for (let i = 0; i < n; i++) { const a = evs[i].indexOf(':'), b = evs[i].indexOf('|'); t += parseInt(evs[i].slice(0, a), 36) || 0; T[i] = t; H[i] = list(evs[i].slice(a + 1, b)); P[i] = list(evs[i].slice(b + 1)); }
    return { T, H, P };
  }
  function persistCheck(e, ok) {
    const l = entries(), i = l.findIndex(x => x && x.at === e.at && x.seed === e.seed); if (i < 0 || l[i].chk === (ok ? 1 : 0)) return;
    const c = l.slice(); c[i] = Object.assign({}, l[i], { chk: ok ? 1 : 0 }); SETTINGS.set('replays.list', c);
  }
  function playTick(g) {
    const P = S, e = P.e;
    VIEW && VIEW.n++;
    if (P.rt <= P.len) {
      if (P.rt % CK_EVERY === 0) { const j = (P.rt / CK_EVERY - 1) * 3; if (P.bad < 0 && e.ck && e.ck.slice(j, j + 3) !== checksum(g)) P.bad = P.rt; }
      while (P.pi < P.pz.length && P.pz[P.pi] <= P.rt) { P.pzOn = !P.pzOn; P.pi++; }
      if (P.pzOn && g.phase === 'fight') g.phase = 'pause';
      else if (!P.pzOn && g.phase === 'pause') { g.phase = 'fight'; P.paused = true; }   // the window lost focus: the match goes on, the viewer is paused
      while (P.ei < P.D.T.length && P.D.T[P.ei] <= P.rt) { P.curH = P.D.H[P.ei]; P.curP = P.D.P[P.ei]; P.ei++; }
      offAll();
      const H = P.curH, Q = P.curP;
      for (let i = 0; i < H.length; i++) keys[H[i]] = true;
      for (let i = 0; i < Q.length; i++) pressed[Q[i]] = true;
    } else {
      offAll();
      if (P.endAt < 0 && P.rt > P.len + LATE) { if (P.bad < 0) P.bad = P.len; P.verified = false; P.done = true; P.paused = true; persistCheck(e, false); }
    }
    if (P.endAt >= 0 && P.rt >= P.endAt + TAIL) { P.done = true; P.paused = true; }
  }
  function verify(info) {
    const P = S, r = P.e.res, w = info && info.winner ? info.winner.side : -1, hp = [game.f[0].hp, game.f[1].hp];
    P.endAt = P.rt; P.got = { w, hp, wins: info && Array.isArray(info.wins) ? info.wins.slice() : game.wins.slice() };
    const ok = w === r.w && hp[0] === r.hp[0] && hp[1] === r.hp[1] && P.rt === P.len && P.bad < 0;
    if (!ok && P.bad < 0) P.bad = P.rt;
    P.verified = ok; persistCheck(P.e, ok);
  }

  function play(i) {
    const e = entries()[i]; if (!playable(e)) return false;
    if (PEND) return false;
    BUSY = true;
    try {
      if (S && !S.play) abort();
      if (S && S.play) { S = null; unpin(); }
      if (!VIEW) {
        let held = false; try { held = !running; } catch (x) { held = false; }
        VIEW = { sel: game.sel.slice(), modeId: game.modeId, mode: game.mode, arenaPick: game.arenaPick, held, tick: game.tick, n: 0, set: viewerSettings() };
        SETTINGS.set('replays.restore', VIEW.set);
      }
      for (const k in e.set || {}) if (!same(SETTINGS.get(k), e.set[k])) SETTINGS.set(k, e.set[k]);
      offAll();
      if (game.phase === 'vs') game.phase = 'title';   // the switch to 'vs' must fire again
      game.sel = [fighterIdx(e.ids[0]), fighterIdx(e.ids[1])];
      game.modeId = e.modeId; game.mode = e.mode === 2 ? 2 : 1; game.arenaPick = arenaIdx(e);
      game.tick = typeof e.tk === 'number' ? e.tk : game.tick;
      PEND = { e, i };
      startMatch();
      PEND = null;
      game.arenaPick = VIEW.arenaPick;
      if (!S || !S.play) { exit(false); return false; }
      game.f[0].cpu = !!(e.cpu && e.cpu[0]); game.f[1].cpu = !!(e.cpu && e.cpu[1]);
      UI.open = false;
      if (!VIEW.held) { S.raf = true; try { hold(true); } catch (x) { /* ignore */ } lastT = 0; if (!raf) raf = requestAnimationFrame(loop); }
      return true;
    } finally { BUSY = false; }
  }
  function startPlayback(p) {
    warm(); pin(p.e.seed);
    S = { play: true, e: p.e, i: p.i, D: decode(p.e), rt: 0, len: p.e.len, ei: 0, curH: [], curP: [], pz: Array.isArray(p.e.pz) ? p.e.pz : [], pi: 0, pzOn: false,
      bad: -1, endAt: -1, verified: null, got: null, done: false, paused: false, speed: 1, acc: 0, stepReq: false, raf: false };
  }
  function exit(toList = true) {
    const V = VIEW, idx = S && S.play ? S.i : 0;
    BUSY = true;
    try {
      if (S) { S = null; unpin(); }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      offAll();
      if (V) {
        putBack(V.set); SETTINGS.set('replays.restore', null);
        game.sel = V.sel; game.modeId = V.modeId; game.mode = V.mode; game.arenaPick = V.arenaPick;
        game.tick = Math.max(game.tick, V.tick + V.n);
        VIEW = null;
        setPhase('title');
        if (toList) { UI.open = true; UI.sel = Math.min(idx, Math.max(0, entries().length - 1)); UI.arm = -1; }
        try { hold(V.held); } catch (x) { /* ignore */ }
      }
    } finally { BUSY = false; }
    return true;
  }
  function restart() { if (!S || !S.play) return false; return play(S.i); }

  // ---------- the playback clock: real time in the page, step() in the tests ----------
  const CTL = { pause: ['Space', 'Enter', 'KeyP', 'KeyJ', 'Numpad1'], speed: ['KeyK', 'Digit2', 'Numpad2'], step: ['Period', 'ArrowRight', 'KeyL', 'Numpad3'], restart: ['KeyR'], exit: ['Escape', 'Backspace'] };
  function controls() {
    if (!S || !S.play) return;
    try { pollPads(); } catch (e) { /* no pads */ }
    const ex = anyTap(CTL.exit), rs = anyTap(CTL.restart), sp = anyTap(CTL.speed), pa = anyTap(CTL.pause), st = anyTap(CTL.step);
    if (ex || (S.done && pa)) { snd(300, 0.06); S.req = 'exit'; return; }
    if (rs) { snd(700, 0.08); S.req = 'restart'; return; }
    if (S.done) return;
    if (sp) { S.speed = S.speed === 1 ? 2 : 1; snd(600, 0.05); }
    if (pa) { S.paused = !S.paused; S.acc = 0; snd(500, 0.05); }
    if (st) { S.paused = true; S.stepReq = true; }
  }
  function advance(ms) {
    if (!S || !S.play) return 0;
    controls();
    if (S.req === 'exit') { exit(true); return 0; }
    if (S.req === 'restart') { restart(); return 0; }
    let n = 0;
    if (S.stepReq) { S.stepReq = false; if (!S.done) { step(1); n++; } return n; }
    if (S.paused || S.done) return 0;
    S.acc += Math.max(0, +ms || 0) * S.speed;
    while (S && S.play && !S.done && S.acc >= TICK && n < 8) { step(1); S.acc -= TICK; n++; }
    if (S && S.acc >= TICK) S.acc = 0;
    return n;
  }
  function loop(now) {
    raf = 0;
    if (!S || !S.play || !S.raf) return;
    const dt = lastT ? Math.min(100, now - lastT) : TICK; lastT = now;
    advance(dt);
    if (S && S.play && S.raf && !raf) raf = requestAnimationFrame(loop);
  }

  // ---------- BUS ----------
  BUS.on('phase', e => {
    if (e.to === 'vs') {
      if (PEND) { if (S && !S.play) abort(); startPlayback(PEND); return; }
      if (S && !S.play) abort();
      if (S && S.play) return;
      if (REC_MODES.includes(game.modeId) && canPin()) startRecording();
      return;
    }
    if (e.to === 'title' || e.to === 'select') {
      if (S && !S.play) abort();                                              // left before the end: not kept
      else if (S && S.play && !BUSY) Promise.resolve().then(() => { if (S && S.play) exit(true); });   // the replay was quit from inside
    }
  });
  BUS.on('match:start', info => {
    if (!S || S.play || S.meta) return;
    const a = info && typeof info.arena === 'number' ? info.arena : game.arena;
    S.meta = { modeId: info && info.modeId || game.modeId, mode: info && info.mode || game.mode, sel: [info ? info.p1 : game.sel[0], info ? info.p2 : game.sel[1]], arena: a, arenaId: ARENAS[a] && ARENAS[a].id };
  });
  BUS.on('match:end', info => {
    if (!S) return;
    if (S.play) { if (S.endAt < 0) verify(info); return; }
    if (S.rt > 0) save(info); else abort();
  });
  // A replayed match is not a new match: while a replay plays, its 'match:end' goes only to the replay check,
  // so the STATS counters, the colourway unlocks and the mode callbacks do not count the same match twice.
  // Every other event (hits, KOs, rounds) still reaches the effects and sounds.
  const emitAll = BUS.emit;
  BUS.emit = function (name, payload) {
    if (name === 'match:end' && S && S.play) { if (S.endAt < 0) verify(payload); return; }
    return emitAll(name, payload);
  };

  // ---------- HOOKS ----------
  const UI = { open: false, sel: 0, arm: -1, armT: 0 };
  function bootTick() {
    boot = false;
    const r = SETTINGS.get('replays.restore');
    if (r && typeof r === 'object' && !Array.isArray(r)) putBack(r);
    if (r !== null) SETTINGS.set('replays.restore', null);
  }
  function listTick(g) {
    if (g.phase !== 'title') { UI.open = false; return; }
    const L = entries(), n = L.length;
    const up = anyTap(['KeyW', 'ArrowUp']), dn = anyTap(['KeyS', 'ArrowDown']), ok = anyTap(['Enter', 'Space', 'KeyJ', 'Numpad1']);
    const del = anyTap(['Delete', 'KeyX']), back = anyTap(['Escape', 'Backspace', 'KeyK', 'Numpad2']);
    clearPressed();   // the title menu underneath sees nothing while this screen is open
    if (back) { UI.open = false; UI.arm = -1; snd(300, 0.06); return; }
    if (!n) return;
    if (UI.sel >= n) UI.sel = n - 1;
    if (up || dn) { UI.sel = (UI.sel + (up ? n - 1 : 1)) % n; UI.arm = -1; snd(400, 0.04); }
    if (del) {
      if (UI.arm === UI.sel && g.tick - UI.armT < 180) { erase(UI.sel); UI.arm = -1; snd(200, 0.12); }
      else { UI.arm = UI.sel; UI.armT = g.tick; snd(300, 0.05); }
    }
    if (ok) {
      if (playable(L[UI.sel])) { const i = UI.sel; snd(900, 0.12); Promise.resolve().then(() => play(i)); }
      else snd(150, 0.15);
    }
  }
  HOOKS.add('update', g => {
    if (boot) bootTick();
    if (S) { S.rt++; R.rt = S.rt; R.ctr = 0; if (S.play) playTick(g); else recTick(g); }
    if (UI.open) listTick(g);
  }, -1e9);
  const ITEM = { id: 'replays', label: 'REPLAYS', order: 70, run() { UI.open = true; UI.sel = 0; UI.arm = -1; snd(700, 0.08); } };
  HOOKS.add('titleItems', () => ITEM);
  HOOKS.add('drawTop', (c, g) => {
    if (S && S.play) drawPlay(c, g);
    else if (UI.open && g.phase === 'title') drawList(c, g);
  }, 40);

  function erase(i) { const l = entries(); if (i < 0 || i >= l.length) return false; const c = l.slice(); c.splice(i, 1); SETTINGS.set('replays.list', c); return true; }

  // ---------- drawing ----------
  const nameOf = id => { const i = fighterIdx(id); return ascii(i >= 0 ? ROSTER[i].name : id); };
  const arenaName = e => { const a = ARENAS[arenaIdx(e)]; return ascii(a && a.name ? a.name : 'ARENA'); };
  const clock = len => { const s = Math.round(len / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const modeName = e => e.cpu && e.cpu[0] && e.cpu[1] ? 'CPU VS CPU' : e.modeId === 'versus2' ? '2 PLAYERS' : '1P VS CPU';
  function result(e, r) {
    r = r || e.res; const w = r.w === 0 || r.w === 1 ? r.w : -1, wins = Array.isArray(r.wins) ? r.wins : [0, 0];
    return w < 0 ? 'DRAW' : nameOf(e.ids[w]) + ' WINS ' + (wins[w] | 0) + '-' + (wins[1 - w] | 0);
  }
  function box(c, x, y, w, h, fill, line) { c.fillStyle = fill; c.fillRect(x, y, w, h); if (line) { c.strokeStyle = line; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); } }
  function drawList(c, g) {
    c.save();
    c.globalAlpha = 0.96; box(c, 0, 0, W, H, INK); c.globalAlpha = 1;
    ptext(c, 'REPLAYS', W / 2, 18, 5, GOLD, 'center');
    ptext(c, 'YOUR LAST ' + KEEP + ' VERSUS MATCHES, PLAYED AGAIN FROM THEIR INPUTS', W / 2, 66, 2, STEEL, 'center');
    const L = entries();
    if (!L.length) {
      ptext(c, 'NO REPLAYS YET', W / 2, 210, 4, '#fff', 'center');
      ptext(c, 'FINISH A VERSUS MATCH TO RECORD IT', W / 2, 262, 2, STEEL, 'center');
    }
    for (let i = 0; i < L.length && i < KEEP; i++) {
      const e = L[i], y = 92 + i * 76, on = i === UI.sel;
      box(c, 70, y, W - 140, 68, on ? '#1d1a2c' : '#13111d', on ? GOLD : '#2a2740');
      if (!valid(e)) { ptext(c, 'DAMAGED REPLAY', 96, y + 26, 2, RED); continue; }
      box(c, 82, y + 6, 56, 56, '#000'); box(c, 142, y + 6, 56, 56, '#000');
      try { drawPortrait(c, e.ids[0], 82, y + 6, 56, 56, false); drawPortrait(c, e.ids[1], 142, y + 6, 56, 56, true); } catch (x) { /* portraits are optional */ }
      ptext(c, nameOf(e.ids[0]) + ' VS ' + nameOf(e.ids[1]), 214, y + 10, 3, on ? '#fff' : '#d8d4e6');
      ptext(c, result(e) + '   ' + arenaName(e) + '   ' + clock(e.len), 214, y + 42, 2, on ? GOLD : DIM);
      const tag = e.chk === 1 ? ['VERIFIED', GREEN] : e.chk === 0 ? ['DESYNC', RED] : i === 0 ? ['NEW', GOLD] : null;
      if (tag) ptext(c, tag[0], W - 86, y + 12, 2, tag[1], 'right');
      ptext(c, modeName(e), W - 86, y + 42, 2, DIM, 'right');
      if (UI.arm === i && g.tick - UI.armT < 180) ptext(c, 'PRESS DEL AGAIN TO ERASE', W - 86, y + 26, 2, RED, 'right');
    }
    ptext(c, (L.length ? 'W/S PICK   ENTER WATCH   DEL ERASE   ' : '') + 'ESC BACK', W / 2, 486, 2, STEEL, 'center');
    ptext(c, 'SPACE PAUSE   K 2X SPEED   . ONE FRAME   R RESTART', W / 2, 512, 2, DIM, 'center');
    c.restore();
  }
  function drawPlay(c, g) {
    // a small pill under the round counter (clear of the health and super bars), the keys while paused or for the first seconds
    const P = S, pw = 280, px = (W - pw) / 2, y = 118;
    c.save();
    c.globalAlpha = 0.8; box(c, px, y, pw, 24, '#000', '#2a2740'); c.globalAlpha = 1;
    if ((g.tick >> 4) & 1 || P.paused) { c.fillStyle = RED; c.fillRect(px + 10, y + 8, 8, 8); }
    ptext(c, 'REPLAY ' + P.speed + 'X', px + 26, y + 5, 2, '#fff');
    const bx = px + 140, bw = 126, u = Math.max(0, Math.min(1, P.rt / Math.max(1, P.len)));
    box(c, bx, y + 9, bw, 7, '#2a2740'); box(c, bx, y + 9, Math.round(bw * u), 7, GOLD);
    const hint = 'SPACE PAUSE   K 2X   . STEP   R RESTART   ESC EXIT';
    if (P.paused && !P.done) {
      ptext(c, 'PAUSED', W / 2, 196, 4, '#fff', 'center');
      c.globalAlpha = 0.8; box(c, (W - 560) / 2, 232, 560, 24, '#000'); c.globalAlpha = 1;
      ptext(c, hint, W / 2, 237, 2, STEEL, 'center');
    } else if (!P.done && P.rt < 240) {
      c.globalAlpha = 0.8; box(c, (W - 560) / 2, y + 28, 560, 24, '#000'); c.globalAlpha = 1;
      ptext(c, hint, W / 2, y + 33, 2, STEEL, 'center');
    }
    if (P.done) {
      const ok = P.verified === true, bxw = 560, bxh = 168, x0 = (W - bxw) / 2, y0 = 160;
      c.globalAlpha = 0.92; box(c, x0, y0, bxw, bxh, INK, ok ? GREEN : RED); c.globalAlpha = 1;
      ptext(c, ok ? 'REPLAY VERIFIED' : 'REPLAY DESYNC', W / 2, y0 + 18, 4, ok ? GREEN : RED, 'center');
      const got = P.got || { w: -1, hp: [game.f[0].hp, game.f[1].hp], wins: game.wins };
      ptext(c, result(P.e, got), W / 2, y0 + 64, 3, '#fff', 'center');
      ptext(c, 'HP ' + Math.round(got.hp[0]) + ' - ' + Math.round(got.hp[1]) + (ok ? '   SAME AS THE MATCH' : '   MATCH HAD ' + Math.round(P.e.res.hp[0]) + ' - ' + Math.round(P.e.res.hp[1])), W / 2, y0 + 98, 2, STEEL, 'center');
      ptext(c, ok ? 'ENTER LIST   R WATCH AGAIN' : 'FIRST DIFFERENCE AT FRAME ' + Math.max(0, P.bad) + '   ENTER LIST', W / 2, y0 + 130, 2, DIM, 'center');
    }
    c.restore();
  }

  // ---------- public API ----------
  window.REPLAYS = {
    KEEP, MODES: REC_MODES.slice(),
    list: () => entries().map((e, i) => valid(e) ? { i, ids: e.ids.slice(), mode: modeName(e), winner: e.res.w, hp: e.res.hp.slice(), wins: (e.res.wins || []).slice(), len: e.len, arena: arenaName(e), chk: e.chk === undefined ? null : e.chk } : { i, damaged: true }),
    play: i => play(i | 0),
    exit: () => (S && S.play ? exit(true) : false),
    restart,
    advance,
    pause(on) { if (!S || !S.play) return false; S.paused = on === undefined ? !S.paused : !!on; S.acc = 0; return S.paused; },
    speed(x) { if (!S || !S.play) return 0; S.speed = x === 2 ? 2 : 1; return S.speed; },
    stepFrame() { if (!S || !S.play || S.done) return false; S.paused = true; step(1); return true; },
    erase,
    clear() { SETTINGS.set('replays.list', []); },
    open() { UI.open = game.phase === 'title'; UI.sel = 0; UI.arm = -1; return UI.open; },
    close() { UI.open = false; },
    screen: () => ({ open: UI.open, sel: UI.sel, armed: UI.arm }),
    state: () => S ? (S.play
      ? { active: true, rec: false, rt: S.rt, len: S.len, paused: S.paused, speed: S.speed, done: S.done, verified: S.verified, bad: S.bad, got: S.got, index: S.i }
      : { active: false, rec: true, rt: S.rt, events: S.ev.length, seed: R.seed })
      : { active: false, rec: false },
    pinned: () => R.on && Math.random === seeded,
  };
})();
