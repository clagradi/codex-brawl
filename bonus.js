// ===== AGENT BRAWL bonus minigames: BENCHMARK BREAK and BUG SQUASH =====
// Owner: x-bonus agent. Area: bonus minigames. User notes: docs/features/x-bonus.md. Loaded after touch.js (see dev.html).
// Hooks used: HOOKS 'update' (order -50: steps a running minigame and eats the keys it reads), 'drawTop' (draws it over the title), 'musicTheme' (a track while one runs).
// Also: MODES.register 'benchmark' (order 60) and 'squash' (order 61), SETTINGS.define 'bonus.scores' (top-5 lists; the old 'brawl.bonus' key is read once if it exists). No BUS events.
// The minigames are a self-contained overlay: game.phase stays 'title' (the engine resets a custom phase that has no fighters) and the overlay owns the keys while it runs.
// Global: BONUS { run(id, onDone, opts), open(id), close(), active(), state(), best(id), board(id), last, seed, STACKS }. Everything is tick based and seeded (BONUS.seed), so tests can drive it with step(n).
(function () {
  'use strict';
  const W = 960, H = 540, FLOOR = 430, FX = 480, SX = 650, SC = 5;   // screen, floor line, squash fighter x, stack centre x and pixel scale
  const IDS = ['benchmark', 'squash'];
  const TITLES = { benchmark: 'BENCHMARK BREAK', squash: 'BUG SQUASH' };
  const STACKS = [
    { id: 'crate', name: 'WOOD CRATE', line: 35, drain: 12, pts: 100, word: 'KRAK!' },
    { id: 'rack', name: 'SERVER RACK', line: 45, drain: 15, pts: 200, word: 'CLANG!' },
    { id: 'gpu', name: 'GPU TOWER', line: 55, drain: 19, pts: 300, word: 'KA-ZAP!' },
    { id: 'chip', name: 'QUANTUM CHIP', line: 65, drain: 24, pts: 500, word: 'ZZZT!' },
    { id: 'agi', name: 'AGI MONOLITH', line: 75, drain: 29, pts: 800, word: 'SOON!' },
  ];
  const GRADE_MULT = { S: 3, A: 2, B: 1.5, C: 1 }, GRADE_COL = { S: '#ffd76a', A: '#7cf0a0', B: '#7cc7ff', C: '#c9c3b8', '-': '#7d7668' };
  const LEVEL_TICKS = 720, SQUASH_TICKS = 3600, HP0 = 5, MAX_BUGS = 26;
  const B = window.BONUS = { seed: 1337, last: null, STACKS, TITLES };
  let S = null;   // the running session, null while the title shows

  // ---------- helpers ----------
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = () => S.rnd();
  const press = a => { const x = hit(0, a), y = hit(1, a); return x || y; };   // a fresh press on player 1 or player 2 keys or pads
  const down = a => held(0, a) || held(1, a);
  const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
  const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const rectFn = c => (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

  // ---------- scores: SETTINGS 'bonus.scores' = { benchmark: [{ s, f }], squash: [...] }, five rows each, best first ----------
  const clean = o => {
    const r = {};
    for (const id of IDS) {
      const a = o && Array.isArray(o[id]) ? o[id] : [];
      r[id] = a.filter(e => e && Number.isFinite(e.s)).map(e => ({ s: Math.max(0, Math.round(e.s)), f: ROSTER[e.f] ? e.f | 0 : 0 })).sort((x, y) => y.s - x.s).slice(0, 5);
    }
    return r;
  };
  SETTINGS.define('bonus.scores', { def: clean(), type: 'any', legacy: 'brawl.bonus', fromLegacy: raw => { try { return clean(JSON.parse(raw)); } catch (e) { return clean(); } } });
  const board = id => clean(SETTINGS.get('bonus.scores'))[id] || [];
  function record(id, score, who) {   // returns the new row's place (0 = best), or -1 when it did not make the top five
    if (!(score > 0)) return -1;
    const all = clean(SETTINGS.get('bonus.scores')), list = all[id].slice();
    let i = list.findIndex(e => score > e.s); if (i < 0) i = list.length;
    list.splice(i, 0, { s: Math.round(score), f: who }); all[id] = list.slice(0, 5);
    SETTINGS.set('bonus.scores', all);
    return i < 5 ? i : -1;
  }

  // ---------- art, all drawn in code ----------
  const cache = {};
  const ART = {   // each stack is 48 x 64 units, floor at the bottom row
    crate(R) {
      R(4, 24, 40, 40, '#6b4420'); R(6, 27, 36, 34, '#b9803f'); R(4, 24, 40, 3, '#d9a05a');
      for (let y = 33; y < 60; y += 9) R(6, y, 36, 1, '#8a5a2b');
      for (let i = 0; i < 32; i++) { const y = 27 + Math.round(i * 33 / 31); R(8 + i, y, 3, 2, '#6b4420'); R(37 - i, y, 3, 2, '#6b4420'); }
      R(4, 24, 4, 40, '#6b4420'); R(40, 24, 4, 40, '#6b4420'); R(4, 60, 40, 4, '#6b4420');
      for (const [x, y] of [[5, 25], [41, 25], [5, 61], [41, 61]]) R(x, y, 2, 2, '#2d1c0c');
    },
    rack(R) {
      R(9, 2, 30, 62, '#141824'); R(11, 4, 26, 58, '#2a3040');
      for (let i = 0; i < 6; i++) { const y = 6 + i * 9; R(12, y, 24, 7, '#3b4560'); R(12, y, 24, 1, '#5c6a96'); R(14, y + 3, 10, 2, '#1a2030'); R(28, y + 2, 2, 2, i % 2 ? '#ff4d4d' : '#4dff7a'); R(32, y + 2, 2, 2, i % 3 ? '#4dff7a' : '#ffd24d'); }
      R(9, 62, 30, 2, '#0c0f18');
    },
    gpu(R) {
      R(10, 2, 28, 62, '#0f121c'); R(12, 4, 24, 58, '#1c2130'); R(14, 6, 20, 36, '#0a0d16');
      for (const cy of [16, 30]) {
        for (let dy = -5; dy <= 5; dy++) { const w = Math.round(Math.sqrt(26 - dy * dy)); R(24 - w, cy + dy, w * 2, 1, '#222836'); }
        R(24, cy - 5, 1, 4, '#4ff0ff'); R(24, cy + 2, 1, 4, '#4ff0ff'); R(19, cy, 4, 1, '#4ff0ff'); R(26, cy, 4, 1, '#4ff0ff'); R(23, cy - 1, 3, 3, '#ff4fd8');
      }
      ['#ff4fd8', '#4ff0ff', '#7aff6a', '#ffe36a'].forEach((col, i) => R(14 + i * 5, 38, 5, 2, col));
      R(12, 44, 24, 16, '#141824'); for (let y = 46; y < 58; y += 3) R(14, y, 20, 1, '#2a3040'); R(12, 62, 24, 2, '#0c0f18');
    },
    chip(R) {
      R(8, 54, 32, 10, '#2c3350'); R(6, 62, 36, 2, '#1a2036'); R(22, 46, 4, 8, '#e0c060');
      R(10, 18, 28, 28, '#10131c'); R(12, 20, 24, 24, '#1d2a4a');
      for (let i = 0; i < 6; i++) { R(8, 21 + i * 4, 2, 2, '#e0c060'); R(38, 21 + i * 4, 2, 2, '#e0c060'); R(13 + i * 4, 16, 2, 2, '#e0c060'); R(13 + i * 4, 46, 2, 2, '#e0c060'); }
      R(18, 26, 12, 12, '#0a1630'); R(20, 28, 8, 8, '#4ff0ff'); R(22, 30, 4, 4, '#ffffff');
    },
    agi(R, c) {
      R(10, 0, 28, 64, '#05050c'); R(10, 0, 2, 64, '#7a5cff'); R(36, 0, 2, 64, '#3b2a99'); R(12, 0, 24, 2, '#c8b8ff');
      for (let y = 6; y < 62; y += 7) R(13, y, 22, 1, '#0d0d22');
      ptext(c, 'SOON', 24, 28, 1, '#cbb8ff', 'center', false);
    },
  };
  function stackImg(i) { const key = 'st' + i; if (!cache[key]) { const cv = mk(48, 64); ART[STACKS[i].id](rectFn(cv.getContext('2d')), cv.getContext('2d')); cache[key] = cv; } return cache[key]; }
  function tilesOf(i) {   // 8 x 8 chunks of a stack that are not empty: what flies apart when it breaks
    const key = 'tl' + i; if (cache[key]) return cache[key];
    const d = stackImg(i).getContext('2d').getImageData(0, 0, 48, 64).data, list = [];
    for (let ty = 0; ty < 64; ty += 8) for (let tx = 0; tx < 48; tx += 8) {
      let solid = false;
      for (let y = 0; y < 8 && !solid; y++) for (let x = 0; x < 8; x++) if (d[((ty + y) * 48 + tx + x) * 4 + 3] > 0) { solid = true; break; }
      if (solid) list.push([tx, ty]);
    }
    return (cache[key] = list);
  }
  const CRACKS = [[[24, 36], [19, 31], [21, 24], [15, 18]], [[24, 36], [30, 41], [28, 48], [34, 55]], [[24, 36], [31, 30], [29, 22], [36, 14]], [[24, 36], [17, 43], [19, 50], [12, 58]], [[19, 31], [10, 30], [6, 24]], [[30, 41], [39, 40], [42, 46]]];
  function backdrop(kind) {
    if (cache[kind]) return cache[kind];
    const cv = mk(W, H), c = cv.getContext('2d'), R = rectFn(c), q = rng(kind === 'squash' ? 77 : 33), bench = kind === 'benchmark';
    const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, bench ? '#080a18' : '#06120c'); g.addColorStop(1, bench ? '#1a2146' : '#10301f');
    c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
    if (bench) { for (let i = 0; i < 6; i++) { const x = 40 + i * 152; R(x, 120, 128, 150, '#0e1226'); R(x + 4, 124, 120, 142, '#131937'); for (let j = 0; j < 12; j++) R(x + 9, 132 + j * 11, 14 + (q() * 90 | 0), 4, j % 5 === 0 ? '#3b6bd0' : '#27407a'); } }
    else { c.strokeStyle = '#1e5a38'; c.lineWidth = 3; for (let i = 0; i < 30; i++) { const x = (q() * 48 | 0) * 20, y = (q() * 20 | 0) * 20; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (q() < 0.5 ? 80 : 0), y); c.lineTo(x + (q() < 0.5 ? 80 : 40), y + 60); c.stroke(); R(x - 3, y - 3, 7, 7, '#3fd47a'); } for (let i = 0; i < 4; i++) { const x = 90 + i * 230; R(x, 180, 110, 80, '#0a1a12'); for (let p = 0; p < 9; p++) { R(x + 6 + p * 11, 174, 5, 6, '#9a8a50'); R(x + 6 + p * 11, 260, 5, 6, '#9a8a50'); } } }
    c.fillStyle = bench ? '#141a38' : '#0c2417'; c.fillRect(0, FLOOR, W, H - FLOOR);
    c.strokeStyle = bench ? '#2a3a7a' : '#1e5a38'; c.lineWidth = 2;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(FX + i * 36, FLOOR); c.lineTo(FX + i * 110, H); c.stroke(); }
    for (let y = FLOOR + 6, d = 6; y < H; y += d, d *= 1.5) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    R(0, FLOOR - 2, W, 3, bench ? '#3b4fa8' : '#2a8a54');
    c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
    const v = c.createRadialGradient(FX, 260, 170, FX, 260, 640); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    return (cache[kind] = cv);
  }

  // ---------- particles and popups (stepped with the game, so the pause freezes them) ----------
  function spark(x, y, n, cols, spd, up) { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, v = (0.4 + rnd()) * spd; S.fx.push({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (up || 0), life: 22 + (rnd() * 20 | 0), t: 0, col: cols[i % cols.length], sz: 3 + (rnd() * 3 | 0) }); } }
  function puff(x, y, r) { S.fx.push({ k: 'puff', x, y, vx: (rnd() - 0.5) * 1.2, vy: -0.4, life: 34, t: 0, r }); }
  function popup(txt, x, y, col, size) { S.pop.push({ txt, x, y, col: col || '#fff', size: size || 24, t: 0 }); }
  function fxStep() {
    const s = S;
    for (const f of s.fx) { f.t++; f.x += f.vx; f.y += f.vy; if (f.k === 'dot') f.vy += 0.25; }
    s.fx = s.fx.filter(f => f.t < f.life);
    for (const p of s.pop) { p.t++; p.y -= 0.7; }
    s.pop = s.pop.filter(p => p.t < 55);
    if (s.shake > 0) s.shake--; if (s.flash > 0) s.flash--; if (s.shk > 0) s.shk--;
    if (s.anim) s.anim.t++;
  }

  // ---------- session control ----------
  function openSession(id, o) {
    o = o || {};
    if (!TITLES[id] || S || game.phase === 'fight' || game.phase === 'pause') return false;
    let who = o.fighter; if (typeof who === 'string') who = ROSTER.findIndex(r => r.id === who);
    if (!(who >= 0 && ROSTER[who])) who = (game.sel && ROSTER[game.sel[0]]) ? game.sel[0] : 0;
    S = { id, scr: o.direct ? 'ready' : 'lobby', who, cb: o.cb || null, tick: 0, t: 0, rd: 90, paused: false, rnd: rng(B.seed), fx: [], pop: [], shake: 0, flash: 0, shk: 0, anim: null, res: null,
      prev: o.viaPick ? { modeId: 'versus', mode: 1 } : { modeId: game.modeId, mode: game.mode } };
    if (o.direct) begin();
    clearPressed();
    return true;
  }
  function closeSession(res) {
    const s = S; if (!s) return;
    S = null; game.modeId = s.prev.modeId; game.mode = s.prev.mode; clearPressed();
    if (s.cb) { try { s.cb(res || null); } catch (e) { console.error(e); } }
  }
  function begin() {
    const s = S; s.scr = 'ready'; s.rd = 90; s.t = 0; s.score = 0; s.fx = []; s.pop = [];
    if (s.id === 'benchmark') { s.lv = 0; s.grades = []; s.miss = 0; s.mash = 0; benchLevel(); }
    else {
      s.bugs = []; s.decals = []; s.hp = HP0; s.inv = 0; s.combo = 0; s.ct = 0; s.maxCombo = 0; s.kills = 0; s.sp = 0; s.face = 1; s.nextSpawn = 30; s.wave = -1; s.banner = 0; s.ring = -1; s.mult = 1;
    }
  }
  function finish(reason) {
    const s = S; s.scr = 'result';
    const res = { id: s.id, score: Math.round(s.score), who: s.who, reason: reason || 'DONE', rank: -1, t: 0, finished: true };
    if (s.id === 'benchmark') { res.grades = s.grades.slice(); res.miss = s.miss; res.mash = s.mash; }
    else { res.kills = s.kills; res.maxCombo = s.maxCombo; res.hp = s.hp; }
    res.rank = record(s.id, res.score, s.who);
    s.res = res; B.last = res;
    beep(res.score > 0 ? 660 : 160, 0.3, 'triangle', 0.07, 0.8);
  }

  // ---------- BENCHMARK BREAK ----------
  function benchLevel() {
    const s = S; s.meter = 0; s.left = LEVEL_TICKS; s.grace = 40; s.last = ''; s.brk = null; s.lvT = 0; s.anim = null;
  }
  function benchStep() {
    const s = S, st = STACKS[s.lv];
    s.lvT++; s.t++;
    if (s.brk) return breakStep();
    const p = press('p'), k = press('k'), sp = press('s');
    for (const key of [p ? 'p' : '', k ? 'k' : '']) if (key) {
      const alt = s.last && s.last !== key;
      s.meter = Math.min(100, s.meter + (key === 'p' ? 5 : 6) * (alt ? 1.3 : 1)); s.last = key; s.mash++;
      s.anim = { n: key === 'p' ? 'punch' : 'kick', t: 0 }; s.shk = 6;
      spark(SX - 110, FLOOR - 120 - rnd() * 120, 4, ['#ffe36a', '#ffffff', '#ff9a3c'], 3.2, 1.5);
      beep(key === 'p' ? 300 : 220, 0.05, 'square', 0.04, 0.6);
    }
    if (sp) {
      s.anim = { n: 'special', t: 0 };
      if (s.meter >= st.line) startBreak();
      else { s.meter = Math.max(0, s.meter - 25); s.miss++; s.shake = 5; popup('TOO WEAK!', SX, 200, '#ff6b6b', 30); beep(120, 0.2, 'sawtooth', 0.05, 0.5); }
    }
    if (!s.brk) {
      if (s.grace > 0) s.grace--; else s.meter = Math.max(0, s.meter - st.drain / 60);
      if (--s.left <= 0) { s.grades.push('-'); s.brk = { t: 0, fail: true, tiles: [] }; popup('TIME UP!', SX, 220, '#ff6b6b', 34); beep(110, 0.4, 'sawtooth', 0.06, 0.4); }
    }
    fxStep();
  }
  function startBreak() {
    const s = S, st = STACKS[s.lv], f = (s.meter - st.line) / (100 - st.line), g = f >= 0.85 ? 'S' : f >= 0.55 ? 'A' : f >= 0.25 ? 'B' : 'C';
    const pts = Math.round(st.pts * GRADE_MULT[g]) + Math.floor(s.left / 60) * 10;
    s.score += pts; s.grades.push(g); s.brk = { t: 0, grade: g, pts, tiles: [], fail: false };
  }
  function breakStep() {
    const s = S, b = s.brk, st = STACKS[s.lv]; b.t++;
    if (!b.fail && b.t === 12) {   // the hit lands: the stack bursts into its own pixels
      const cy = FLOOR + 4 - 32 * SC;
      b.tiles = tilesOf(s.lv).map(([tx, ty]) => {
        const px = SX + (tx + 4 - 24) * SC, py = FLOOR + 4 - (64 - ty - 4) * SC, r = rnd();
        return { tx, ty, x: px, y: py, vx: (px - SX) * 0.05 * (0.7 + r) + (rnd() - 0.2) * 3, vy: (py - cy) * 0.05 - 3 - rnd() * 5, a: 0, va: (rnd() - 0.5) * 0.5 };
      });
      s.flash = 6; s.shake = 18;
      for (let i = 0; i < 4; i++) puff(SX + (rnd() - 0.5) * 160, FLOOR - 20 - rnd() * 90, 40 + rnd() * 30);
      spark(SX, FLOOR - 140, 26, ['#ffe36a', '#ffffff', '#ff9a3c', '#7cc7ff'], 7, 2);
      popup(st.word, SX, 190, '#ffd76a', 44); popup('+' + b.pts, SX, 250, GRADE_COL[b.grade], 28);
      thud(0.25, 0.2); beep(90, 0.4, 'sawtooth', 0.08, 0.3); beep(520, 0.15, 'square', 0.05, 1.6);
    }
    if (b.t > 12) for (const d of b.tiles) { d.vy += 0.55; d.x += d.vx; d.y += d.vy; d.a += d.va; if (d.y > FLOOR + 2 && d.vy > 0) { d.y = FLOOR + 2; d.vy *= -0.4; d.vx *= 0.7; d.va *= 0.6; } }
    fxStep();
    if (b.t >= (b.fail ? 70 : 125)) { if (s.lv >= STACKS.length - 1) finish('DONE'); else { s.lv++; benchLevel(); } }
  }

  // ---------- BUG SQUASH ----------
  const BUGS = {   // hp, speed, points, height of the body above the floor
    small: { hp: 1, spd: 1.5, pts: 10, u: 4 },
    fly: { hp: 1, spd: 2.0, pts: 25, u: 4 },
    tank: { hp: 3, spd: 0.8, pts: 50, u: 5 },
  };
  function spawn(side, kind) {
    const s = S, d = BUGS[kind], w = Math.max(0, s.wave);
    if (s.bugs.length >= MAX_BUGS) return;
    s.bugs.push({ kind, hp: d.hp, spd: d.spd + w * 0.1 + rnd() * 0.25, x: side < 0 ? -40 : W + 40, y: kind === 'fly' ? 290 + rnd() * 70 : FLOOR + 6, y0: 0, ph: (rnd() * 20) | 0, seed: rnd() * 6, hurt: 0, dead: false, face: side < 0 ? 1 : -1 });
    const b = s.bugs[s.bugs.length - 1]; b.y0 = b.y;
  }
  function pickKind(w) {
    const r = rnd() * 100, tbl = [[100, 0], [80, 20], [60, 30], [45, 30], [40, 30], [35, 30]][Math.min(5, w)];
    return r < tbl[0] ? 'small' : r < tbl[0] + tbl[1] ? 'fly' : 'tank';
  }
  function strike(b, dmg) {
    const s = S; b.hp -= dmg; b.hurt = 6; b.x -= (FX > b.x ? 1 : -1) * 10 * dmg;
    spark(b.x, b.y - 14, 5, ['#d6ffb0', '#ffffff'], 3.2, 1);
    if (b.hp > 0) { beep(180, 0.05, 'square', 0.05, 0.6); return; }
    b.dead = true; s.kills++; s.combo++; s.ct = 150; s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.mult = 1 + Math.min(7, Math.floor(s.combo / 5));
    const pts = BUGS[b.kind].pts * s.mult; s.score += pts;
    s.decals.push({ x: b.x, t: 0, col: b.kind === 'fly' ? '#ff9ab0' : b.kind === 'tank' ? '#c8d0e8' : '#7be35a' });
    spark(b.x, b.y - 10, 10, b.kind === 'fly' ? ['#ff6b8a', '#ffffff'] : ['#7be35a', '#d6ffb0', '#ffe36a'], 4, 2);
    popup('+' + pts + (s.mult > 1 ? ' X' + s.mult : ''), b.x, b.y - 44, s.mult > 2 ? '#ffd76a' : '#ffffff', 20 + s.mult);
    beep(380 + s.mult * 40, 0.07, 'square', 0.05, 1.5);
  }
  function squashStep() {
    const s = S, T = s.t++;
    const tl = press('l') || down('l'), tr = press('r') || down('r');   // a quick tap turns too, even when it is released before the next tick
    if (tl && !tr) s.face = -1; else if (tr && !tl) s.face = 1;
    const p = press('p'), k = press('k'), sp = press('s'), reach = (b, r) => { const d = (b.x - FX) * s.face; return d > -12 && d < r; };
    if (p) {   // the nearest bug in front, ground or air
      s.anim = { n: 'punch', t: 0 }; s.shk = 3;
      let best = null; for (const b of s.bugs) if (!b.dead && reach(b, 110) && (!best || Math.abs(b.x - FX) < Math.abs(best.x - FX))) best = b;
      if (best) strike(best, 1); else beep(150, 0.04, 'square', 0.03, 0.7);
    }
    if (k) {   // a sweep along the floor: every crawler in front, but nothing that flies
      s.anim = { n: 'kick', t: 0 }; s.shk = 3; let any = false;
      for (const b of s.bugs) if (!b.dead && b.kind !== 'fly' && reach(b, 160)) { strike(b, 2); any = true; }
      if (!any) beep(130, 0.05, 'square', 0.03, 0.7);
    }
    if (sp && s.sp <= 0) {   // a shockwave on both sides: everything close, in the air too
      s.anim = { n: 'special', t: 0 }; s.sp = 300; s.ring = 0; s.shake = 14; s.flash = 4;
      for (const b of s.bugs) if (!b.dead && Math.abs(b.x - FX) < 300) strike(b, 3);
      thud(0.2, 0.18); beep(100, 0.35, 'sawtooth', 0.07, 0.4);
    }
    if (s.sp > 0) s.sp--; if (s.ring >= 0 && ++s.ring > 24) s.ring = -1;
    // waves: ten seconds each, faster and nastier every time
    const w = Math.min(5, Math.floor(T / 600));
    if (w !== s.wave) { s.wave = w; s.banner = 90; if (T > 0) { spawn(-1, 'small'); spawn(1, 'small'); spawn(-1, w > 1 ? 'tank' : 'small'); spawn(1, w > 2 ? 'tank' : 'fly'); } }
    if (s.banner > 0) s.banner--;
    if (--s.nextSpawn <= 0) {
      spawn(rnd() < 0.5 ? -1 : 1, pickKind(w));
      if (w >= 5 && rnd() < 0.5) spawn(rnd() < 0.5 ? -1 : 1, pickKind(w));
      s.nextSpawn = Math.max(16, 66 - w * 9 + ((rnd() * 18) | 0));
    }
    // bugs walk in; one that reaches the fighter bites and dies
    if (s.inv > 0) s.inv--;
    for (const b of s.bugs) {
      if (b.dead) continue;
      const dir = FX > b.x ? 1 : -1; b.x += dir * b.spd; b.ph++; b.face = dir; if (b.hurt > 0) b.hurt--;
      if (b.kind === 'fly') b.y = b.y0 + Math.sin(b.ph / 9 + b.seed) * 22;
      if (Math.abs(b.x - FX) < 36 && s.inv <= 0) {
        b.dead = true; s.hp--; s.inv = 45; s.combo = 0; s.ct = 0; s.mult = 1; s.shake = 10; s.flash = 5; s.anim = { n: 'hit', t: 0 };
        spark(FX, FLOOR - 90, 8, ['#ff4d4d', '#ffb0b0'], 4, 2); popup('BITTEN!', FX, 118, '#ff6b6b', 26); beep(110, 0.25, 'sawtooth', 0.07, 0.5);
      }
    }
    s.bugs = s.bugs.filter(b => !b.dead);
    if (s.ct > 0 && --s.ct <= 0) { s.combo = 0; s.mult = 1; }
    for (const d of s.decals) d.t++;
    s.decals = s.decals.filter(d => d.t < 110);
    fxStep();
    if (s.hp <= 0) finish('CRASH'); else if (T + 1 >= SQUASH_TICKS) finish('TIME');
  }

  // ---------- session step: lobby, countdown, play, pause, result ----------
  function stepSession() {
    const s = S; s.tick++;
    if (s.scr === 'lobby') {
      const l = press('l'), r = press('r'); press('u'); press('d');
      if (l) { s.who = (s.who + ROSTER.length - 1) % ROSTER.length; beep(420, 0.04, 'square', 0.04, 1); }
      if (r) { s.who = (s.who + 1) % ROSTER.length; beep(420, 0.04, 'square', 0.04, 1); }
      if (tap('Enter')) { begin(); beep(660, 0.1, 'square', 0.06, 1.5); } else if (tap('Escape')) closeSession(null);
      return;
    }
    if (s.scr === 'result') {
      s.res.t++; press('p'); press('k'); press('s');
      if (s.res.t > 30) {
        if (tap('Escape')) closeSession(s.res);
        else if (tap('Enter')) { if (s.cb) closeSession(s.res); else begin(); }
      }
      return;
    }
    if (s.paused) { if (tap('KeyP') || tap('Escape') || tap('Enter')) s.paused = false; else if (tap('KeyQ')) closeSession(null); return; }
    if (tap('KeyP') || tap('Escape')) { s.paused = true; return; }
    if (s.scr === 'ready') {   // READY ... GO, keys are ignored
      press('p'); press('k'); press('s'); press('l'); press('r');
      if (--s.rd <= 0) s.scr = 'play';
      return;
    }
    if (s.id === 'benchmark') benchStep(); else squashStep();
  }
  HOOKS.add('update', () => { if (!S) return; stepSession(); clearPressed(); }, -50);
  HOOKS.add('musicTheme', w => (S ? (S.id === 'squash' ? 'forest' : 'gpupit') : undefined), 50);

  // ---------- drawing ----------
  const GOLD = '#ffd76a', DIM = '#c9c3b8';
  function panel(c, x, y, w, h) { c.fillStyle = 'rgba(8,10,24,0.78)'; c.fillRect(x, y, w, h); c.strokeStyle = '#4a5590'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  function drawBoard(c, x, y, w, id, mark) {
    panel(c, x, y, w, 210); ptext(c, 'TOP 5', x + w / 2, y + 14, 3, GOLD, 'center');
    const rows = board(id);
    for (let i = 0; i < 5; i++) {
      const e = rows[i], on = mark === i, yy = y + 62 + i * 29, col = on ? GOLD : e ? '#e8e2d4' : '#5d6080';
      uiText((i + 1) + '.', x + 22, yy, 22, col, 'left');
      uiText(e ? SHORT(ROSTER[e.f]) : '- - -', x + 56, yy, 22, col, 'left');
      uiText(e ? pad(e.s, 6) : '------', x + w - 20, yy, 22, col, 'right');
    }
  }
  function drawFighter(c, x, y, scale, face, anim, tick) {
    const id = ROSTER[S.who].id; let name = 'idle', fr = loopFrame('idle', tick);
    if (anim) { const dur = anim.n === 'special' ? 26 : anim.n === 'hit' ? 18 : 11; if (anim.t < dur) { name = anim.n; fr = timedFrame(anim.n, anim.t / dur); } }
    drawSprite(c, id, name, fr, x, y, face, scale);
  }
  function drawFx(c) {
    for (const f of S.fx) {
      if (f.k === 'dot') { c.globalAlpha = Math.max(0, 1 - f.t / f.life); c.fillStyle = f.col; c.fillRect(Math.round(f.x), Math.round(f.y), f.sz, f.sz); c.globalAlpha = 1; }
      else { const k = f.t / f.life; c.globalAlpha = 0.5 * (1 - k); c.fillStyle = '#d8d8e8'; c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + k), 0, 6.283); c.fill(); c.globalAlpha = 1; }
    }
    for (const p of S.pop) uiText(p.txt, p.x, p.y, p.size, p.col, 'center', Math.min(1, (55 - p.t) / 20));
  }
  function drawBench(c) {
    const s = S, st = STACKS[s.lv], t = s.tick, b = s.brk;
    c.drawImage(backdrop('benchmark'), 0, 0);
    const sp = c.createRadialGradient(SX, 120, 20, SX, 300, 330); sp.addColorStop(0, 'rgba(150,180,255,0.30)'); sp.addColorStop(1, 'rgba(150,180,255,0)'); c.fillStyle = sp; c.fillRect(300, 0, 700, FLOOR);
    c.save(); if (s.shake > 0) c.translate(Math.round(Math.sin(t * 2.7) * s.shake * 0.6), Math.round(Math.cos(t * 3.1) * s.shake * 0.5));
    if (!b || b.fail || b.t < 12) {
      const sh = b ? 0 : (s.meter / 100) * 3 + (s.shk % 2 ? 3 : 0), drop = s.lvT < 20 ? -Math.pow(1 - s.lvT / 20, 2) * 320 : 0, ox = Math.round(Math.sin(t * 1.9) * sh), oy = Math.round(drop), base = FLOOR + 4;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(SX, FLOOR + 10, 130, 16, 0, 0, 6.283); c.fill();
      c.imageSmoothingEnabled = false; c.drawImage(stackImg(s.lv), SX - 24 * SC + ox, base - 64 * SC + oy, 48 * SC, 64 * SC);
      const n = b ? 0 : Math.floor(s.meter / 100 * 6.5);
      c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 3; c.lineJoin = 'round';
      for (let i = 0; i < Math.min(6, n); i++) { c.beginPath(); CRACKS[i].forEach(([ux, uy], j) => { const X = SX + (ux - 24) * SC + ox, Y = base - (64 - uy) * SC + oy; if (j) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); }
      if (!b && s.meter >= st.line && s.lvT > 20) { c.globalAlpha = 0.18 + 0.12 * Math.sin(t / 3); c.fillStyle = '#fff'; c.fillRect(SX - 24 * SC + ox, base - 64 * SC + oy, 48 * SC, 64 * SC); c.globalAlpha = 1; }
    }
    if (b && b.t > 12) for (const d of b.tiles) {
      c.save(); c.globalAlpha = Math.max(0, Math.min(1, (125 - b.t) / 30)); c.translate(Math.round(d.x), Math.round(d.y)); c.rotate(d.a); c.imageSmoothingEnabled = false;
      c.drawImage(stackImg(s.lv), d.tx, d.ty, 8, 8, -4 * SC, -4 * SC, 8 * SC, 8 * SC); c.restore();
    }
    if (b && !b.fail && b.t > 10 && b.t < 36) { c.strokeStyle = '#fff'; c.globalAlpha = 1 - (b.t - 10) / 26; c.lineWidth = 6; c.beginPath(); c.arc(SX, FLOOR - 140, (b.t - 10) * 12, 0, 6.283); c.stroke(); c.globalAlpha = 1; }
    const win = b && !b.fail && b.t > 30;
    if (win) drawSprite(c, ROSTER[s.who].id, 'win', loopFrame('win', t), 290, FLOOR + 8, 1, 3); else drawFighter(c, 290, FLOOR + 8, 3, 1, s.anim, t);
    drawFx(c); c.restore();
    if (s.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + s.flash / 9 + ')'; c.fillRect(0, 0, W, H); }
    if (b && !b.fail && b.t > 40) { const k = Math.min(1, (b.t - 40) / 8), sz = 110 - 30 * k; drawTitleText(c, b.grade, 860, 300 + (1 - k) * -40, sz, { align: 'center', style: b.grade === 'S' || b.grade === 'A' ? 'gold' : 'steel', glow: true, alpha: k }); }
    // HUD: score, stack, time, grades, the power meter with its break line
    ptext(c, 'SCORE ' + pad(s.score, 6), 24, 14, 3, GOLD);
    uiText('LEVEL ' + (s.lv + 1) + ' OF ' + STACKS.length + ' · ' + st.name, W / 2, 28, 24, '#fff');
    const secs = Math.ceil(s.left / 60); ptext(c, 'TIME ' + pad(secs, 2), W - 24, 14, 3, secs <= 3 && !b ? '#ff6b6b' : '#fff', 'right');
    for (let i = 0; i < STACKS.length; i++) { const g = s.grades[i] || '', x = 24 + i * 34; c.fillStyle = 'rgba(8,10,24,0.8)'; c.fillRect(x, 44, 28, 24); c.strokeStyle = '#4a5590'; c.strokeRect(x + 0.5, 44.5, 27, 23); if (g) ptext(c, g, x + 14, 49, 2, GRADE_COL[g], 'center'); }
    const mx = 190, my = 74, mw = 640, mh = 26, lx = mx + mw * st.line / 100;
    c.fillStyle = '#0a0c1a'; c.fillRect(mx - 3, my - 3, mw + 6, mh + 6); c.fillStyle = '#1b2040'; c.fillRect(mx, my, mw, mh);
    const gr = c.createLinearGradient(mx, 0, mx + mw, 0); gr.addColorStop(0, '#3fb8ff'); gr.addColorStop(0.5, '#ffe36a'); gr.addColorStop(1, '#ff4d4d'); c.fillStyle = gr; c.fillRect(mx, my, Math.round(mw * s.meter / 100), mh);
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = mx + 8; x < mx + mw; x += 16) c.fillRect(x, my, 2, mh);
    const ok = s.meter >= st.line; c.fillStyle = ok ? '#fff' : '#ff6b6b'; c.fillRect(Math.round(lx) - 2, my - 8, 4, mh + 16);
    uiText('POWER', mx - 12, my + 13, 20, '#fff', 'right'); uiText('BREAK LINE', lx, my - 17, 15, ok ? '#fff' : '#ff9a9a');
    if (!b) uiText(ok ? (touch.on ? 'BREAK IT! TAP SP' : 'BREAK IT! PRESS L') : touch.on ? 'MASH P AND K · ALTERNATE FOR A BONUS' : 'MASH J AND K · ALTERNATE FOR A BONUS', 300, 122, 18, ok ? GOLD : DIM, 'center', ok ? 0.7 + 0.3 * Math.sin(t / 3) : 1);
    if (s.lvT < 40 && !b) uiText('LEVEL ' + (s.lv + 1) + ': ' + st.name, W / 2, 180, 34, GOLD, 'center', Math.min(1, (40 - s.lvT) / 15));
    uiText(touch.on ? 'P K MASH · SP BREAK · PAUSE BUTTON' : 'J K MASH · L BREAK · P PAUSE', W / 2, 522, 14, DIM);
  }
  function drawBug(c, b) {
    const d = BUGS[b.kind], u = d.u, fr = (b.ph >> 2) & 1, f = col => (b.hurt > 0 ? '#ffffff' : col);
    c.save(); c.translate(Math.round(b.x), Math.round(b.y)); c.scale(b.face, 1);
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); };
    if (b.kind === 'small') {
      R(-4, -5, 8, 4, f('#7be35a')); R(-3, -6, 6, 1, f('#b6f58e')); R(3, -5, 3, 3, f('#7be35a')); R(5, -5, 1, 1, '#101010'); R(5, -7, 1, 2, '#2f7a2a'); R(6, -8, 1, 1, '#2f7a2a'); R(-1, -4, 2, 2, '#ff6b6b');
      for (const x of [-3, 0, 3]) R(x + fr, -1, 1, 1, '#2f7a2a');
    } else if (b.kind === 'tank') {
      R(-7, -8, 14, 6, f('#aab2c8')); R(-6, -9, 12, 1, f('#d6dcee')); R(-2, -8, 1, 6, '#6b7088'); R(2, -8, 1, 6, '#6b7088'); R(6, -6, 3, 4, f('#7a8098')); R(8, -5, 1, 1, '#ff3030'); R(7, -8, 1, 2, '#555a70');
      for (const x of [-5, -2, 1, 4]) R(x + fr, -2, 1, 2, '#555a70');
    } else {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-12, FLOOR + 4 - b.y, 24, 4);
      R(-2, -3, 5, 3, f('#ff6b8a')); R(3, -3, 2, 2, f('#ff9ab0')); R(4, -3, 1, 1, '#101010'); R(-4, -2, 2, 1, '#b02a4a');
      if (fr) { R(-3, -6, 4, 3, 'rgba(223,246,255,0.85)'); R(-6, -5, 3, 1, 'rgba(159,216,255,0.8)'); } else { R(-3, -1, 4, 2, 'rgba(223,246,255,0.85)'); R(-6, 0, 3, 1, 'rgba(159,216,255,0.8)'); }
    }
    c.restore();
    if (b.kind === 'tank' && b.hp < d.hp) { for (let i = 0; i < d.hp; i++) { c.fillStyle = i < b.hp ? '#ff6b6b' : '#333a55'; c.fillRect(Math.round(b.x) - 14 + i * 10, Math.round(b.y) - 64, 8, 5); } }
  }
  function drawSquash(c) {
    const s = S, t = s.tick;
    c.drawImage(backdrop('squash'), 0, 0);
    c.save(); if (s.shake > 0) c.translate(Math.round(Math.sin(t * 2.9) * s.shake * 0.5), Math.round(Math.cos(t * 3.3) * s.shake * 0.4));
    for (const d of s.decals) { c.globalAlpha = Math.max(0, 1 - d.t / 110); c.fillStyle = d.col; c.beginPath(); c.ellipse(d.x, FLOOR + 8, 22, 6, 0, 0, 6.283); c.fill(); c.fillRect(d.x - 26, FLOOR + 6, 4, 3); c.fillRect(d.x + 22, FLOOR + 9, 4, 3); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(FX, FLOOR + 10, 60, 10, 0, 0, 6.283); c.fill();
    if (s.ring >= 0) { c.strokeStyle = '#ffd76a'; c.lineWidth = 6; c.globalAlpha = 1 - s.ring / 24; c.beginPath(); c.ellipse(FX, FLOOR - 40, s.ring * 13, s.ring * 5, 0, 0, 6.283); c.stroke(); c.globalAlpha = 1; }
    const hurtBlink = s.inv > 0 && (t >> 2) & 1;
    c.globalAlpha = hurtBlink ? 0.45 : 1; drawFighter(c, FX, FLOOR + 8, 3, s.face, s.scr === 'result' ? (s.hp > 0 ? { n: 'special', t: 99 } : { n: 'hit', t: 99 }) : s.anim, t); c.globalAlpha = 1;
    const order = s.bugs.slice().sort((a, b) => a.y - b.y); for (const b of order) drawBug(c, b);
    drawFx(c); c.restore();
    if (s.flash > 0 && s.inv > 0) { c.fillStyle = 'rgba(255,40,40,' + s.flash / 14 + ')'; c.fillRect(0, 0, W, H); }
    else if (s.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + s.flash / 12 + ')'; c.fillRect(0, 0, W, H); }
    const secs = Math.max(0, Math.ceil((SQUASH_TICKS - s.t) / 60));
    ptext(c, 'SCORE ' + pad(s.score, 6), 24, 14, 3, GOLD); ptext(c, 'TIME ' + pad(secs, 2), W / 2, 14, 3, secs <= 10 ? '#ff6b6b' : '#fff', 'center');
    if (s.combo > 1) { ptext(c, 'COMBO ' + s.combo, W - 24, 14, 3, '#fff', 'right'); uiText('X' + s.mult, W - 24, 58, 30 + s.mult * 2, s.mult > 2 ? GOLD : '#fff', 'right'); c.fillStyle = '#ff9a3c'; c.fillRect(W - 24 - Math.round(150 * s.ct / 150), 74, Math.round(150 * s.ct / 150), 5); }
    for (let i = 0; i < HP0; i++) ptext(c, '♥', 24 + i * 26, 46, 3, i < s.hp ? '#ff4d6d' : '#3a3f5c', 'left', false);
    const rdy = s.sp <= 0, bw = 200; c.fillStyle = 'rgba(8,10,24,0.8)'; c.fillRect(W / 2 - bw / 2, 48, bw, 16); c.fillStyle = rdy ? GOLD : '#4a5590'; c.fillRect(W / 2 - bw / 2 + 2, 50, Math.round((bw - 4) * (rdy ? 1 : 1 - s.sp / 300)), 12);
    uiText((touch.on ? 'SP' : 'L') + (rdy ? ' SPECIAL READY' : ' SPECIAL'), W / 2, 82, 15, rdy ? GOLD : DIM);
    if (s.banner > 0) uiText('WAVE ' + (s.wave + 1) + (s.wave === 5 ? ' · LAST STAND' : ''), W / 2, 150, 38, GOLD, 'center', Math.min(1, s.banner / 25));
    uiText(touch.on ? 'PAD TURNS · P PUNCH · K KICK (GROUND) · SP SPECIAL · PAUSE BUTTON' : 'A D TURN · J PUNCH · K KICK (GROUND) · L SPECIAL · P PAUSE', W / 2, 522, 14, DIM);
  }
  function drawLobby(c) {
    const s = S, bench = s.id === 'benchmark';
    c.drawImage(backdrop(s.id), 0, 0); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
    drawTitleText(c, TITLES[s.id], W / 2, 64, 46, { align: 'center', style: 'gold', glow: true });
    const lines = bench
      ? touch.on ? ['TAP P AND K TO CHARGE THE POWER METER. IT DRAINS FAST.', 'TAP SP ABOVE THE BREAK LINE TO SMASH THE STACK. HIGHER IS A BETTER GRADE.', 'FIVE STACKS, TWELVE SECONDS EACH. ALTERNATING P AND K CHARGES FASTER.']
        : ['MASH J AND K TO CHARGE THE POWER METER. IT DRAINS FAST.', 'PRESS L ABOVE THE BREAK LINE TO SMASH THE STACK. HIGHER IS A BETTER GRADE.', 'FIVE STACKS, TWELVE SECONDS EACH. ALTERNATING J AND K CHARGES FASTER.']
      : touch.on ? ['SIXTY SECONDS. BUGS CRAWL AND FLY IN FROM BOTH SIDES. THE PAD TURNS YOU.', 'P PUNCH: ONE BUG, ON THE GROUND OR IN THE AIR. K KICK: SWEEPS THE GROUND.', 'SP SPECIAL: BLASTS BOTH SIDES. KEEP SQUASHING FOR A BIGGER COMBO MULTIPLIER.']
        : ['SIXTY SECONDS. BUGS CRAWL AND FLY IN FROM BOTH SIDES. A AND D TURN YOU.', 'J PUNCH: ONE BUG, ON THE GROUND OR IN THE AIR. K KICK: SWEEPS THE GROUND.', 'L SPECIAL: BLASTS BOTH SIDES. KEEP SQUASHING FOR A BIGGER COMBO MULTIPLIER.'];
    lines.forEach((l, i) => uiText(l, W / 2, 124 + i * 26, 18, '#dcd6c8'));
    for (let i = 0; i < ROSTER.length; i++) {
      const x = 24 + i * 96, on = i === s.who; c.fillStyle = 'rgba(8,10,24,0.8)'; c.fillRect(x, 214, 88, 88); drawHeadIcon(c, ROSTER[i].id, x + 4, 218, 80);
      c.strokeStyle = on ? GOLD : '#4a5590'; c.lineWidth = on ? 4 : 2; c.strokeRect(x + 1, 215, 86, 86);
    }
    uiText(ROSTER[s.who].name, 24, 328, 26, GOLD, 'left'); uiText(ROSTER[s.who].tag, 24, 352, 15, DIM, 'left');
    drawFighter(c, 400, 505, 2, 1, null, s.tick);
    drawBoard(c, 530, 214, 400, s.id, -1);
    uiText(touch.on ? 'TAP A FIGHTER · TAP IT AGAIN OR START TO PLAY · BACK LEAVES' : 'A AND D CHOOSE · ENTER START · ESC TITLE', W / 2, 522, 16, DIM);
  }
  function drawResult(c) {
    const s = S, r = s.res; c.drawImage(backdrop(s.id), 0, 0);
    c.fillStyle = 'rgba(0,0,0,0.68)'; c.fillRect(0, 0, W, H);
    const title = s.id === 'benchmark' ? 'ALL STACKS DONE' : r.reason === 'CRASH' ? 'SYSTEM CRASH' : 'TIME UP';
    drawTitleText(c, title, W / 2, 62, 44, { align: 'center', style: 'gold', glow: true });
    uiText(TITLES[s.id] + ' · ' + SHORT(ROSTER[s.who]), W / 2, 104, 18, DIM);
    ptext(c, 'SCORE', 250, 150, 3, DIM, 'center'); ptext(c, pad(r.score, 6), 250, 186, 6, '#fff', 'center');
    if (r.rank === 0) uiText('NEW BEST!', 250, 262, 30, GOLD, 'center', 0.7 + 0.3 * Math.sin(s.tick / 4));
    else if (r.rank > 0) uiText('TOP 5 · PLACE ' + (r.rank + 1), 250, 262, 24, '#7cf0a0');
    if (s.id === 'benchmark') {
      r.grades.forEach((g, i) => { const x = 250 + (i - 2) * 56; c.fillStyle = 'rgba(8,10,24,0.85)'; c.fillRect(x - 24, 292, 48, 52); c.strokeStyle = '#4a5590'; c.strokeRect(x - 23.5, 292.5, 47, 51); ptext(c, g, x, 306, 4, GRADE_COL[g], 'center'); });
      uiText('WEAK HITS ' + r.miss + ' · MASHES ' + r.mash, 250, 372, 18, DIM);
    } else {
      uiText('BUGS SQUASHED ' + r.kills, 250, 310, 22, '#fff'); uiText('BEST COMBO ' + r.maxCombo, 250, 340, 22, '#fff'); uiText('HEARTS LEFT ' + r.hp, 250, 370, 22, '#fff');
    }
    drawBoard(c, 530, 130, 400, s.id, r.rank);
    uiText(touch.on ? (s.cb ? 'TAP CONTINUE' : 'TAP AGAIN OR TITLE') : s.cb ? 'ENTER CONTINUE' : 'ENTER PLAY AGAIN · ESC TITLE', W / 2, 460, 22, s.res.t > 30 ? GOLD : '#6d6a60');
  }
  function drawPause(c) {
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(0, 0, W, H);
    drawTitleText(c, 'PAUSED', W / 2, 190, 56, { align: 'center', style: 'gold', glow: true });
    uiText(touch.on ? 'TAP RESUME · OR QUIT TO TITLE' : 'P OR ENTER RESUME · Q QUIT TO TITLE', W / 2, 270, 22, '#fff');
    uiText(TITLES[S.id] + ' · A QUIT DOES NOT SAVE THE SCORE', W / 2, 304, 15, DIM);
  }
  HOOKS.add('drawTop', c => {
    if (!S) return;
    c.save();
    if (S.scr === 'lobby') drawLobby(c);
    else if (S.scr === 'result') drawResult(c);
    else {
      (S.id === 'benchmark' ? drawBench : drawSquash)(c);
      if (S.scr === 'ready') { const n = Math.ceil((S.rd - 18) / 24); uiText(n > 0 ? 'READY' : 'GO!', W / 2, 250, 64, GOLD); if (n > 0) uiText(String(n), W / 2, 320, 48, '#fff'); }   // 3, 2, 1, then GO
      if (S.paused) drawPause(c);
    }
    c.restore();
  }, -50);

  // touch: the lobby, pause and result buttons press the same keys as the keyboard; while a game runs the pad (d-pad, P K SP) shows next to a PAUSE button, and canvas taps (fighter icons in the lobby)
  // never reach the title menu under the session
  HOOKS.add('touchPills', () => !S ? [] : S.scr === 'lobby' ? [{ t: '< FIGHTER', a: 'l' }, { t: 'FIGHTER >', a: 'r' }, { t: 'START', k: 'Enter' }, { t: 'BACK', k: 'Escape' }]
    : S.scr === 'result' ? (S.cb ? [{ t: 'CONTINUE', k: 'Enter' }] : [{ t: 'AGAIN', k: 'Enter' }, { t: 'TITLE', k: 'Escape' }])
    : S.paused ? [{ t: 'RESUME', k: 'KeyP' }, { t: 'QUIT', k: 'KeyQ' }] : [{ pad: true }, { t: 'PAUSE', k: 'KeyP' }]);
  touch.screenTaps(() => S, (x, y) => {
    if (!S || S.scr !== 'lobby') return;
    const i = Math.floor((x - 24) / 96); if (i < 0 || i >= ROSTER.length || x - 24 - i * 96 > 88 || y < 214 || y > 302) return;
    if (S.who === i) { begin(); beep(660, 0.1, 'square', 0.06, 1.5); } else { S.who = i; beep(420, 0.04, 'square', 0.04, 1); }   // a second tap on the chosen fighter starts
  });

  // ---------- registry and public API ----------
  const registered = (id, order) => MODES.register({ id, label: TITLES[id], order, players: 1, onPick: () => { openSession(id, { viaPick: true }); return false; } });
  registered('benchmark', 60); registered('squash', 61);
  B.open = id => openSession(id, {});
  B.run = (id, onDone, opts) => openSession(id, Object.assign({}, opts, { direct: true, cb: typeof onDone === 'function' ? onDone : null }));   // direct start, no lobby; onDone gets the result (or null when quit)
  B.close = () => closeSession(null);
  B.active = () => !!S;
  B.best = id => (board(id)[0] || { s: 0 }).s;
  B.board = board;
  B.state = () => S && { id: S.id, scr: S.scr, paused: S.paused, who: S.who, tick: S.tick, t: S.t, score: Math.round(S.score || 0), lv: S.lv, meter: S.meter, line: S.lv !== undefined ? STACKS[S.lv].line : 0, left: S.left, grades: S.grades && S.grades.slice(),
    brk: !!S.brk, miss: S.miss, mash: S.mash, hp: S.hp, combo: S.combo, mult: S.mult, kills: S.kills, maxCombo: S.maxCombo, sp: S.sp, face: S.face, bugs: S.bugs && S.bugs.map(b => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), hp: b.hp })), wave: S.wave, res: S.res };
})();
