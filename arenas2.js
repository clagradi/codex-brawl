// ===== AGENT BRAWL feature file: ARENAS2. Loaded after training.js (see docs/ARCHITECTURE.md). =====
// Owner: the arenas agent. Only that agent edits this file and tools/tests/arenas2.mjs.
// Area: six more stages, pushed onto ARENAS at load (indices 9 to 14): CONTEXT WINDOW CLIFF (cliff), HALLUCINATION HALL (hall), BENCHMARK STADIUM (stadium),
// PROMPT INJECTION SEWER (sewer), LATENCY LAGOON (lagoon) and ALIGNMENT DOJO (dojo). Each one is drawn in code in the style of arenas.js (half-resolution 480x270 canvas, built once,
// parallax layers, lighting, a foreground layer) with the painter's kit that ARENAS.kit exposes.
// Every stage has
//   one stage gag every 8 to 12 seconds (a pure function of the tick, so a replay or a thumbnail shows the same thing; the gag start also goes out as BUS 'arena:gag' { arena, index, k, tick }),
//   one reaction to BUS 'ko' (lights flicker, crowd jumps, gong rings ...) and to a heavy hit that lands near a wall (sparks, dust or spray from that side),
//   a short backdrop pan on round 1 (the parallax layers slide into place while the fighters stay where they are).
// The select screen, the versus roulette and the random pick read ARENAS.length, so they cover all fifteen stages without a change in game.js. The themes live in music2.js.
// Public: window.ARENAS2 = { ids, base, cfg, gag(t, id), react, state, stats }.
'use strict';
(() => {
  window.STUB_ARENAS2 = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
  if (typeof ARENAS === 'undefined' || !ARENAS.make || !ARENAS.kit || typeof BUS === 'undefined') return;
  const { AW, AH, AG, TAU, hash1, rng, clamp, flick, grad, layer, off, put, fill, R, line, disc, ring, poly, box, fpoly, speck, ridge, text, tw, textC, glow, pool, fogTex, fogDraw, flame, chain, motes, floorBase } = ARENAS.kit;
  const BASE = ARENAS.length;   // 9: the stages of arenas.js come first
  const FIGHT = { intro: 1, fight: 1, pause: 1, finish: 1, finisher: 1, ko: 1, outro: 1 };

  // ---------------------------------------------------------------- shared state: reactions, gag timing, backdrop pan
  const RX = { ko: -99999, wall: -99999, side: 1, pan: -99999 };
  const pulse = (t, k, len) => { const a = t - RX[k]; return a >= 0 && a < len ? 1 - a / len : 0; };   // 1 -> 0 over len ticks after the event
  const ease = u => (u = clamp(u, 0, 1)) * u * (3 - 2 * u);
  const lights = t => (RX.ko <= t && t - RX.ko < 100 && hash1((t >> 1) + 9) < 0.45 ? 0.3 : 1);       // 1 normally, flickers for a moment after a KO
  const CYC = 600, JIT = 60;   // a gag starts around every 600 ticks, shifted by up to 60 either way: 480 to 720 ticks apart (8 to 12 s)
  function gagState(t, seed, dur, o) {
    o = o || {}; const k0 = Math.floor(t / CYC); let last = 0, k = -1, age = -1;
    for (let j = k0 + 1; j >= Math.max(1, k0 - 1); j--) { const s = j * CYC + Math.round((hash1(j * 7 + seed) * 2 - 1) * JIT); if (t >= s) { if (j > last) last = j; if (t < s + dur && k < 0) { k = j; age = t - s; } } }
    o.on = k >= 0; o.k = k >= 0 ? k : last; o.age = age; o.last = last; return o;
  }
  const CFG = { cliff: { seed: 3, dur: 300 }, hall: { seed: 5, dur: 260 }, stadium: { seed: 7, dur: 220 }, sewer: { seed: 11, dur: 260 }, lagoon: { seed: 13, dur: 280 }, dojo: { seed: 17, dur: 360 } };
  const STATS = { gags: 0, last: null };
  const PANC = { x: 0, zoom: 1 };
  function pc(cam, t) {   // round 1: the backdrop slides in from 60 px to the side over 150 ticks
    const a = t - RX.pan; if (a < 0 || a > 150) return cam;
    PANC.x = clamp(cam.x + 60 * (1 - ease(a / 150)), -72, 72); PANC.zoom = cam.zoom; return PANC;
  }
  function wallFx(g, t, col, col2, y0, n) {   // a handful of bits thrown off the wall that took a heavy hit (world space, y0 = where they start)
    const a = t - RX.wall; if (a < 0 || a > 38) return; const s = RX.side, bx = s < 0 ? 20 : 460;
    for (let i = 0; i < (n || 16); i++) { const h = hash1(i * 5 + RX.wall), vx = -s * (0.5 + h * 1.9), vy = -(1 + hash1(i * 3 + 7 + RX.wall) * 2.6);
      g.globalAlpha = Math.min(1, (38 - a) / 14); R(g, bx + vx * a, y0 + vy * a + 0.09 * a * a, i & 1 ? 2 : 1, 1, i % 3 ? col : col2); }
    g.globalAlpha = 1;
  }
  const ST = { on: false, k: 0, age: -1, last: 0 };   // scratch for the update hook (no allocation per tick)
  BUS.on('ko', () => { RX.ko = game.tick; });
  BUS.on('hit', e => { const v = e && e.victim; if (!v || !(e.dmg >= 7 || e.kind === 'super')) return; if (v.x < 130) { RX.wall = game.tick; RX.side = -1; } else if (v.x > (typeof W === 'number' ? W : 960) - 130) { RX.wall = game.tick; RX.side = 1; } });
  BUS.on('round:start', e => { if (e && e.round === 1) RX.pan = game.tick; });
  HOOKS.add('update', g => {
    if (!FIGHT[g.phase]) return; const n = ARENAS.length, i = ((g.arena % n) + n) % n, a = ARENAS[i], c = a && CFG[a.id]; if (!c) return;
    gagState(g.tick, c.seed, c.dur, ST); if (ST.on && ST.age === 0) { STATS.gags++; STATS.last = a.id; BUS.emit('arena:gag', { arena: a.id, index: i, k: ST.k, tick: g.tick }); }
  });

  // ---------------------------------------------------------------- small shared pieces
  const column = (g, x, y0, y1, w, c, hi, lo) => { R(g, x, y0, w, y1 - y0, c); R(g, x, y0, 2, y1 - y0, hi); R(g, x + w - 2, y0, 2, y1 - y0, lo); };
  const bevel = (g, x, y, w, h, c, hi, lo) => { R(g, x, y, w, h, c); R(g, x, y, w, 1, hi); R(g, x, y, 1, h, hi); R(g, x, y + h - 1, w, 1, lo); R(g, x + w - 1, y, 1, h, lo); };

  // ================================================================ 1. CONTEXT WINDOW CLIFF
  // A stone ledge over a sea of cloud. A pane hangs in the sky and scrolls the conversation; the oldest lines fade out on its left edge and drift down into the dark.
  // Gag: a floating tablet carrying old text cracks, splits and falls away, then a fresh one fades back in. KO: the pane turns red. Heavy hit by a wall: chips of stone fly off the ledge.
  function cliffArena() {
    const CX = 150, CY = 22, CW = 180, CH = 78;
    const tablet = (g, x, y, k, a) => {
      g.globalAlpha = a; bevel(g, x - 15, y - 22, 30, 44, '#2c2262', '#7a78e0', '#150e38');
      for (let j = 0; j < 5; j++) R(g, x - 11, y - 16 + j * 8, 8 + ((hash1(k * 9 + j) * 14) | 0), 3, j === 2 ? '#ffc86a' : '#8fb4ff');
      g.globalAlpha = 1;
    };
    return ARENAS.make({ id: 'cliff', name: 'CONTEXT WINDOW CLIFF', tagline: 'THE OLD LINES FALL AWAY', accent: '#8fb4ff',
      build(A) {
        const l = A.l, r = rng(901);
        l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M;
          fill(l.sky, [[0, '#060820'], [0.4, '#151a4c'], [0.62, '#3c2a72'], [0.78, '#8e4a80'], [0.9, '#dc7a64'], [1, '#f4a860']], { q: 6 });
          for (let i = 0; i < 80; i++) R(g, -M + r() * w, r() * 130, 1, 1, r() < 0.2 ? '#ffe9b0' : '#7f95ff');
          R(g, CX - 4, CY - 4, CW + 8, CH + 8, '#090c2c'); box(g, CX - 4, CY - 4, CW + 8, CH + 8, '#5d7bff'); box(g, CX - 2, CY - 2, CW + 4, CH + 4, '#222c86'); R(g, CX, CY, CW, CH, '#0b0f36');
          for (const [dx, dy] of [[-4, -4], [CW + 1, -4], [-4, CH + 1], [CW + 1, CH + 1]]) R(g, CX + dx, CY + dy, 3, 3, '#a9bcff');
          textC(g, 'CONTEXT 128000/128000', CX + CW / 2, CY - 13, '#7f95ff', 1);
        }
        l.mask = grad(CW, CH, [[0, '#0b0f36', 1], [0.5, '#0b0f36', 0]], { horiz: true, L: 6, q: 8 });
        l.mid = layer(0.3); { const { g } = l.mid;
          ridge(g, 176, 46, 903, '#37246a'); ridge(g, 190, 36, 905, '#2b1c58');
          for (const [x, y, w, h] of [[40, 96, 62, 20], [372, 84, 74, 24], [236, 126, 40, 12]]) { poly(g, [x, y, x + w, y, x + w - 8, y + h, x + w * 0.6, y + h + 10, x + w * 0.4, y + h + 4, x + 8, y + h], '#24184a'); R(g, x, y, w, 2, '#4a3a8a'); R(g, x + 3, y - 1, w - 6, 1, '#6a58b0'); }
        }
        l.sea = layer(0.6); { const { g, M } = l.sea, w = AW + 2 * M;
          g.drawImage(grad(w, AH - 150, [[0, '#f0a08a'], [0.12, '#c8648e'], [0.35, '#6a3a92'], [0.7, '#2a1c58'], [1, '#0d0a24']], { q: 6 }), -M, 150);
          const cols = ['#f7b9a0', '#e08aa4', '#b66aa8', '#8a52a8', '#68409a', '#4a3086', '#36266e'];
          for (let row = 0; row < 7; row++) for (let i = 0; i < 9 + row; i++) disc(g, -M + r() * w, 154 + row * 9 + r() * 5, 18 + r() * 34 + row * 2, 4 + row * 0.8, cols[row]);
          g.drawImage(grad(w, 40, [[0, '#0d0a24', 0], [1, '#0d0a24', 0.85]], { L: 6 }), -M, 190);
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#1b1436', mid: '#3a2f5e', bot: '#1a1230', fade: '#241a46', line: '#120d26', line2: '#5a4c8e', lip: '#a9bcff', lip2: '#120d26', sp: 40, vp: [240, 110], rows: [-12, -7, -3, 4, 12, 22, 34] });
          speck(g, -M, 216, w, 54, ['#4a3e78', '#1a1230', '#5e5090'], 360, 5);
          for (let x = -M; x < AW + M; x += 3) { const h = (r() * 4) | 0; if (h) R(g, x, 214 - h, 3, h, r() < 0.5 ? '#3a2f5e' : '#2a2148'); }
          R(g, -M, 214, w, 1, '#7c8cff');
          column(g, 28, 150, 216, 16, '#2a2250', '#5a54a8', '#120c2a'); R(g, 26, 146, 20, 4, '#3a3068'); poly(g, [28, 150, 34, 140, 38, 146, 44, 136, 44, 150], '#2a2250'); for (let y = 160; y < 214; y += 12) R(g, 32, y, 8, 1, '#120c2a');
          R(g, 418, 168, 3, 50, '#3a2a20'); bevel(g, 396, 160, 50, 13, '#5a4030', '#8a6648', '#2a1a12'); textC(g, 'TOKEN LIMIT', 421, 164, '#ffd9a0', 1);
          pool(g, '#8fb4ff', 240, 224, 120, 14, 0.12);
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          for (const x of [-12, 468]) { column(g, x, 0, AH, 24, '#0a0618', x < 0 ? '#0a0618' : '#6a7ad8', x < 0 ? '#6a7ad8' : '#0a0618'); for (let y = 24; y < AH; y += 44) { R(g, x - 2, y, 28, 4, '#130c2c'); R(g, x - 2, y, 28, 1, '#3a3478'); } }
          for (const x of [20, 452]) for (let i = 0; i < 4; i++) R(g, x + i * 3, 0, 1, 14 + ((hash1(x + i) * 22) | 0), '#0e0a22');
        }
        l.fog = fogTex(480, 70, '#f0a2c0', 1, 903); l.fog2 = fogTex(480, 56, '#b88ae0', 1, 907);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, hot = pulse(t, 'ko', 90), G = gagState(t, CFG.cliff.seed, CFG.cliff.dur);
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.08), 0);
        glow(g, hot > 0 ? '#ff5a4a' : '#5d7bff', 240, 60, 130, (0.1 + 0.03 * Math.sin(t * 0.03) + hot * 0.14) * lights(t), 62);
        g.save(); g.beginPath(); g.rect(CX, CY, CW, CH); g.clip();
        const sc = t * 0.22, c0 = Math.floor(sc / 12);
        for (let j = 0; j < 8; j++) for (let c = 0; c < 17; c++) { const id = c0 + c; if (hash1(id * 3 + j * 17) < 0.18) continue;
          R(g, CX + c * 12 - (sc % 12), CY + 5 + j * 9, 4 + ((hash1(id * 7 + j * 31) * 7) | 0), 3, hot > 0 && hash1(id + j * 5 + (t >> 1)) < hot ? '#ff6a5a' : hash1(id * 5 + j) < 0.25 ? '#ffc86a' : '#7fa0ff'); }
        g.drawImage(l.mask, CX, CY); g.restore();
        motes(g, t, 12, 21, CX, CX + 70, CY + CH, 175, hot > 0 ? '#ff9a8a' : '#9ab4ff', -0.45 - hot, 2, 2);
        g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0); motes(g, t, 7, 31, 44, 96, 112, 190, '#ffd27a', -0.3, 2, 1); motes(g, t, 8, 41, 378, 446, 108, 190, '#ffd27a', -0.3, 2, 1); g.restore();
        put(g, l.sea, cam);
        g.save(); g.translate(off(cam, 0.6), 0);
        const tx = 372, ty = 150;   // the tablet: whole, then cracking, then falling in two halves, then a fresh one fades in
        if (!G.on) tablet(g, tx, ty + Math.round(Math.sin(t * 0.03) * 2), G.last, 1);
        else if (G.age < 45) { const a = G.age, sh = a > 12 ? ((t & 1) ? 1 : -1) : 0; tablet(g, tx + sh, ty, G.k - 1, 1);
          for (let i = 0, n = (a / 45 * 11) | 0; i < n; i++) R(g, tx - 1 + ((i & 1) ? 1 : -1) + sh, ty - 22 + i * 4, 1, 3, '#0a0620');
          for (let i = 0; i < 6; i++) R(g, tx - 14 + hash1(i + G.k * 3) * 28, ty + 22 - ((a * 0.6 + i * 7) % 20), 2, 2, 'rgba(200,190,255,0.55)'); }
        else if (G.age < 175) { const f = G.age - 45, dy = 0.0055 * f * f, al = clamp(1 - dy / 60, 0, 1);
          for (const s of [-1, 1]) { g.save(); g.translate(tx + s * f * 0.2, ty + dy); g.rotate(s * f * 0.01); g.beginPath(); g.rect(s < 0 ? -16 : 0, -23, 16, 46); g.clip(); tablet(g, 0, 0, G.k - 1, al); g.restore(); } }
        else if (G.age < 200) { /* the gap before a fresh tablet fades in */ }
        else tablet(g, tx, ty + Math.round(Math.sin(t * 0.03) * 2), G.k, clamp((G.age - 200) / 90, 0, 1));
        g.restore();
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0); wallFx(g, t, '#d6e0ff', '#ffd27a', 210); g.restore();
      },
      front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.35, 190, 0.2, 60 + cam.x * 0.3); fogDraw(g, l.fog2, t, 0.6, 226, 0.14, 200); put(g, l.fg, cam); motes(g, t, 36, 7, 0, AW, 70, AH, 'rgba(200,210,255,0.4)', -0.4, 1, 4); } });
  }

  // ================================================================ 2. HALLUCINATION HALL
  // A gilded hall where every detail is a little off: a corridor that never ends, a clock with thirteen hours, portraits with extra eyes.
  // Gag: the glitch band sweeps the wall and the left portrait re-rolls into a new, equally wrong face. KO: candles snuff and the chandelier lurches. Heavy hit by a wall: frames rattle, gilt flakes fly.
  function hallArena() {
    const FR = [[40, 62, 40, 54, 0], [98, 84, 32, 42, -1], [350, 84, 32, 42, 2], [402, 62, 40, 54, 3]];   // x, y, w, h, face (-1: the one that re-rolls)
    const CORR = ['#0a0310', '#160722', '#220a34', '#340f4a', '#4d1a62', '#6b2a7e', '#8f3d98', '#c070b8', '#ffd7f0'];
    function portrait(g, x, y, w, h, v, t) {
      bevel(g, x - 3, y - 3, w + 6, h + 6, '#d8b04a', '#ffe9a0', '#5a3f14'); R(g, x, y, w, h, '#1c0d1e');
      const cx = x + w / 2, cy = y + h * 0.42, sk = '#c9a77a', sh = '#8c6a48', ink = '#150a0e';
      if (v < 0) { for (let i = 0; i < 50; i++) R(g, x + hash1(i * 3 + t) * w, y + hash1(i * 5 + t + 1) * h, 2, 1, hash1(i + t * 3) < 0.5 ? '#ff7ad8' : '#7affff'); return; }
      R(g, cx - 11, cy + 10, 22, y + h - cy - 10, v & 1 ? '#3a2448' : '#24344a'); R(g, cx - 3, cy + 7, 6, 4, sk);
      if (v === 3) { disc(g, cx, cy, 7, 9, sk); R(g, cx - 3, cy + 1, 7, 1, sh); for (let i = 0; i < 6; i++) R(g, cx - 9 + i * 3, cy + 15, 2, 5, sk); R(g, cx - 9, cy + 19, 16, 3, sk); return; }
      if (v === 2) disc(g, cx + 6, cy + 2, 6, 8, sk);
      disc(g, cx - (v === 2 ? 3 : 0), cy, 7, 9, sk); R(g, cx - (v === 2 ? 11 : 8), cy - 2, 2, 5, sh);
      if (v === 0) { for (const dx of [-4, 0, 4]) { R(g, cx + dx - 1, cy - 4, 3, 2, ink); R(g, cx + dx, cy - 4, 1, 1, '#fff'); } R(g, cx - 3, cy + 5, 7, 1, '#3a1010'); }
      else { R(g, cx - 6, cy - 3, 3, 2, ink); R(g, cx + 1, cy - 3, 3, 2, ink); R(g, cx + 6, cy - 1, 2, 2, ink); R(g, cx + 9, cy - 1, 2, 2, ink); R(g, cx - 7, cy + 4, 14, 3, '#2a0a0a'); for (let i = -6; i <= 5; i += 2) R(g, cx + i, cy + 4, 1, 2, '#f4ecd0'); }
    }
    return ARENAS.make({ id: 'hall', name: 'HALLUCINATION HALL', tagline: 'CONFIDENT, FLUENT, WRONG', accent: '#ff5fa2',
      build(A) {
        const l = A.l, r = rng(931);
        l.sky = layer(0.1); { const { g, M } = l.sky;
          fill(l.sky, [[0, '#0d0415'], [0.55, '#240a34'], [1, '#3a1448']], { q: 6 });
          for (let i = 0; i < 9; i++) { const aw = 120 - i * 12, top = 36 + i * 8, bot = 214 - i * 5;
            R(g, 240 - aw / 2, top + aw / 2, aw, bot - top - aw / 2, CORR[i]); disc(g, 240, top + aw / 2, aw / 2, aw / 2, CORR[i]);
            g.save(); g.beginPath(); g.rect(-M, 0, AW + 2 * M, top + aw / 2); g.clip(); ring(g, 240, top + aw / 2, aw / 2, i % 2 ? '#8a6a2a' : '#d8b04a'); g.restore(); }
          disc(g, 240, 20, 12, 12, '#d8b04a'); disc(g, 240, 20, 10, 10, '#1c0d1e'); for (let i = 0; i < 13; i++) { const a = i * TAU / 13 - 1.57; R(g, 240 + Math.cos(a) * 8.5, 20 + Math.sin(a) * 8.5, 1, 1, '#ffd7f0'); }   // thirteen hours
        }
        l.mid = layer(0.3); { const { g, M } = l.mid, w = AW + 2 * M;
          for (const [x0, x1] of [[-M, 170], [310, AW + M]]) { g.drawImage(grad(x1 - x0, AH, [[0, '#2a0f3a'], [0.5, '#3a1650'], [1, '#2a0f3a']], { q: 6 }), x0, 0);
            for (let x = x0 + 6; x < x1 - 6; x += 22) { R(g, x, 12, 14, 130, '#32124a'); box(g, x, 12, 14, 130, '#6a3a80'); } R(g, x0, 150, x1 - x0, 64, '#1c0a28'); for (let x = x0 + 4; x < x1 - 4; x += 28) box(g, x, 156, 24, 50, '#8a6a2a'); R(g, x0, 148, x1 - x0, 3, '#d8b04a'); }
          for (const x of [170, 300]) { column(g, x, 8, 214, 16, '#4a2060', '#d8b04a', '#1c0a28'); R(g, x - 3, 8, 22, 6, '#d8b04a'); R(g, x - 3, 205, 22, 9, '#d8b04a'); for (let y = 24; y < 200; y += 8) R(g, x + 6, y, 1, 5, '#2a0f3a'); }
          for (const f of FR) if (f[4] >= 0) portrait(g, f[0], f[1], f[2], f[3], f[4], 0);
          for (const x of [20, 150, 330, 460]) { R(g, x - 3, 118, 7, 3, '#d8b04a'); R(g, x - 1, 110, 3, 8, '#d8b04a'); R(g, x - 2, 104, 5, 6, '#e8dcc0'); }
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#1a0a24', mid: '#2e1440', bot: '#180a22', fade: '#2a1238', line: '#0e0616', line2: '#6a3a80', lip: '#d8b04a', lip2: '#0e0616', sp: 30, xo: 16, vp: [240, 100], rows: [-12, 0, 15, 33] });
          const ys = [214, 222, 234, 249, 267, 272], vk = y => (y - 100) / (AG - 100);
          for (let i = 0; i < ys.length - 1; i++) for (let c = -16; c < 16; c++) { if ((i + c) & 1) continue; const xa = 240 + c * 30, xb = xa + 30;
            poly(g, [240 + (xa - 240) * vk(ys[i]), ys[i], 240 + (xb - 240) * vk(ys[i]), ys[i], 240 + (xb - 240) * vk(ys[i + 1]), ys[i + 1], 240 + (xa - 240) * vk(ys[i + 1]), ys[i + 1]], 'rgba(255,200,236,0.08)'); }
          speck(g, -M, 216, w, 54, ['#4a2a5a', '#1c0a28', '#6a3a80'], 200, 7);
          pool(g, '#ffb6ec', 240, 228, 130, 12, 0.16);
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          for (const x of [-12, 440]) { g.drawImage(grad(52, AH, [[0, '#3a0a1c'], [0.5, '#5a1230'], [1, '#2a0614']], { horiz: x < 0, q: 8 }), x, 0); for (let k = 0; k < 6; k++) R(g, x + 4 + k * 8, 0, 1, AH, '#1c0410'); R(g, x, 0, 52, 8, '#d8b04a'); }
        }
        l.fog = fogTex(480, 66, '#c070b8', 0.8, 933); l.fog2 = fogTex(480, 50, '#7a3a8c', 0.8, 934);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, G = gagState(t, CFG.hall.seed, CFG.hall.dur), kp = pulse(t, 'ko', 100), lm = lights(t), wp = pulse(t, 'wall', 38) > 0;
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.1), 0);
        glow(g, '#ffb6ec', 240, 150, 70, (0.1 + 0.03 * Math.sin(t * 0.05)) * lm, 90);
        const ha = t * 0.021 + Math.sin(t * 0.013) * 1.4; line(g, 240, 20, 240 + Math.cos(ha) * 8, 20 + Math.sin(ha) * 8, '#ffd7f0', 1); line(g, 240, 20, 240 + Math.cos(ha * 0.37) * 5, 20 + Math.sin(ha * 0.37) * 5, '#ffd7f0', 1);
        g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0);
        { const f = FR[1], v = G.on && G.age < 40 ? -1 : G.last % 4, sh = G.on && G.age < 40 ? (t & 1) : 0; portrait(g, f[0] + sh, f[1], f[2], f[3], v, t); }
        if (wp) for (const f of FR) if ((RX.side < 0) === (f[0] < 240)) { R(g, f[0] - 4, f[1] - 4, f[2] + 8, 1, '#1c0d1e'); }
        const sw = Math.sin(t * 0.03) * 6 + Math.sin(t * 0.11) * kp * 10, cxh = 240 + sw;   // chandelier
        chain(g, 240, 0, 11, t, 0, '#8a6a2a', '#5a3f14', 0.12); line(g, 240, 33, cxh, 40, '#d8b04a', 1); R(g, cxh - 14, 40, 28, 3, '#d8b04a'); R(g, cxh - 10, 43, 20, 2, '#8a6a2a');
        for (const dx of [-12, -4, 4, 12]) { R(g, cxh + dx, 36, 1, 4, '#e8dcc0'); if (kp < 0.5) flame(g, cxh + dx, 36, t, dx, 0.5, '#ffb347', '#ffe08a', '#fff4c0'); }
        if (kp < 0.5) for (const x of [20, 150, 330, 460]) { flame(g, x, 104, t, x, 1, '#ff8a3a', '#ffd07a', '#fff0b8'); glow(g, '#ffb36a', x, 98, 22, 0.2 * lm, 20); }
        g.restore();
        if (G.on && G.age < 70) { const y = 20 + G.age * 3; R(g, 0, y, AW, 2, 'rgba(255,90,210,0.24)'); R(g, 0, y + 3, AW, 1, 'rgba(90,255,255,0.3)'); R(g, 0, y - 6 + ((t >> 1) % 5), AW, 1, 'rgba(255,255,255,0.12)'); }
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0); wallFx(g, t, '#ffe08a', '#ff8ad8', 200, 18); g.restore();
      },
      front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.3, 200, 0.14, 40 + cam.x * 0.3); fogDraw(g, l.fog2, t, 0.5, 228, 0.12, 180); put(g, l.fg, cam); motes(g, t, 30, 5, 0, AW, 30, AH, 'rgba(255,214,240,0.35)', -0.25, 1, 5); } });
  }

  // ================================================================ 3. BENCHMARK STADIUM
  // Night match under floodlights, a leaderboard the size of a house, a crowd that cheers for whoever is on top. Gag: two rows overtake each other, confetti falls, the crowd jumps.
  // KO: the board reads FINAL SCORE, floodlights pop, the crowd goes up. Heavy hit by a wall: sparks fly off the barrier.
  function stadiumArena() {
    const NAMES = ['OVERFIT', 'VIBES-9', 'SOTA-X', 'LEAKED'], SCORE = ['99.4', '98.1', '96.7', '94.2'], BX = 120, BY = 20, BW = 240, BH = 82, RY = i => BY + 20 + i * 15;
    const order = last => { const o = [0, 1, 2, 3]; for (let j = 1; j <= Math.min(last, 400); j++) { const r = (hash1(j * 11 + 5) * 3) | 0, a = o[r]; o[r] = o[r + 1]; o[r + 1] = a; } return o; };
    const HEAD = ['#c8a078', '#a87c5c', '#e0b890', '#8a6648'], BODY = ['#3a2a52', '#5a2a3a', '#2a4a5a', '#52422a', '#2a3a5e', '#4a2a58', '#243a34'];
    return ARENAS.make({ id: 'stadium', name: 'BENCHMARK STADIUM', tagline: 'TRAINED ON THE TEST SET', accent: '#ffd23a',
      build(A) {
        const l = A.l, r = rng(947);
        l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M;
          fill(l.sky, [[0, '#04061a'], [0.5, '#0a1236'], [1, '#16244e']], { q: 6 });
          for (let i = 0; i < 40; i++) R(g, -M + r() * w, r() * 80, 1, 1, '#6a82c8');
          poly(g, [-M, 0, AW + M, 0, AW + M, 14, 360, 22, 120, 22, -M, 14], '#05081c');
          for (const x of [24, 386]) { R(g, x, 8, 72, 30, '#0a0e24'); box(g, x, 8, 72, 30, '#2a3a6a'); for (let j = 0; j < 3; j++) for (let i = 0; i < 9; i++) R(g, x + 5 + i * 7, 12 + j * 9, 4, 4, '#dfe8ff'); }
        }
        l.mid = layer(0.3); { const { g, M, } = l.mid, w = AW + 2 * M;
          g.drawImage(grad(w, 120, [[0, '#0a1230'], [1, '#101c40']], { q: 6 }), -M, 120);
          R(g, BX - 6, BY - 6, BW + 12, BH + 12, '#080c20'); box(g, BX - 6, BY - 6, BW + 12, BH + 12, '#3a4a8a'); R(g, BX, BY, BW, BH, '#050a1c');
          for (let i = 0; i < 24; i++) { R(g, BX - 5 + i * 10, BY - 5, 2, 2, '#ffd23a'); R(g, BX - 5 + i * 10, BY + BH + 3, 2, 2, '#ffd23a'); }
          R(g, BX + 1, BY + 2, BW - 2, 14, '#10204a');
          for (let i = 0; i < 4; i++) { const y = RY(i); R(g, BX + 4, y, BW - 8, 13, i & 1 ? '#0a1832' : '#0c2040'); textC(g, (i + 1) + '.', BX + 20, y + 2, i ? '#9ab4ff' : '#ffd23a', 2); text(g, SCORE[i], BX + BW - 44, y + 2, i ? '#bfe8ff' : '#ffd23a', 2); }
          for (const x of [BX + 30, BX + BW - 30]) R(g, x - 3, BY + BH + 6, 6, 40, '#0a1028');
        }
        l.stands = layer(0.6); { const { g, M } = l.stands, w = AW + 2 * M;
          g.drawImage(grad(w, 70, [[0, '#0c1432'], [1, '#080c20']], { q: 6 }), -M, 150);
          for (let k = 0; k < 4; k++) { const y = 156 + k * 12; R(g, -M, y, w, 2, '#26346a'); R(g, -M, y + 2, w, 1, '#050816'); for (let x = -M + 3; x < AW + M; x += 14) R(g, x, y + 3, 1, 9, '#0a1028'); }
          R(g, -M, 204, w, 10, '#0e1838'); R(g, -M, 204, w, 1, '#3a4a8a');
          const ad = [['EVAL', '#ffd23a'], ['PASS', '#3affb0'], ['LOSS', '#ff5a5a'], ['BENCH', '#5ab4ff']];
          for (let i = 0, x = -M; x < AW + M; i++, x += 54) { const a = ad[i & 3]; R(g, x + 1, 206, 52, 8, '#06102a'); box(g, x + 1, 206, 52, 8, a[1]); textC(g, a[0], x + 27, 208, a[1], 1); }
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#0b1a24', mid: '#14343f', bot: '#0a1820', fade: '#0e222c', line: '#08121a', line2: '#2a6a74', lip: '#ffd23a', lip2: '#08121a', sp: 40, vp: [240, 110], rows: [-12, -7, -3, 4, 12, 22, 34] });
          R(g, -M, AG + 14, w, 1, '#d8c040'); R(g, -M, AG + 33, w, 1, '#d8c040'); speck(g, -M, 216, w, 54, ['#1c4a52', '#0a1820', '#2a6a74'], 320, 9);
          pool(g, '#bfe8ff', 120, 232, 70, 10, 0.16); pool(g, '#bfe8ff', 360, 232, 70, 10, 0.16);
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          for (const x of [-12, 468]) { column(g, x, 0, AH, 24, '#05081a', x < 0 ? '#05081a' : '#3a4a8a', x < 0 ? '#3a4a8a' : '#05081a'); for (let y = 30; y < AH; y += 48) R(g, x - 2, y, 28, 4, '#0c1230'); }
          R(g, -20, 262, AW + 40 + 40, 8, '#0a1028'); R(g, -20, 262, AW + 80, 1, '#3a4a8a');
        }
        l.fog = fogTex(480, 60, '#6ab0ff', 0.7, 951);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, G = gagState(t, CFG.stadium.seed, CFG.stadium.dur), kp = pulse(t, 'ko', 100), lm = lights(t);
        const top = G.on && ((hash1(G.k * 11 + 5) * 3) | 0) === 0, jump = Math.max(kp, G.on && G.age < 150 ? (top ? 1 : 0.55) * (1 - G.age / 150) : 0);
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.08), 0);
        for (const x of [60, 422]) { glow(g, '#dfe8ff', x, 22, 54, (0.22 + kp * 0.4 * (t & 2 ? 1 : 0.4)) * lm, 30); glow(g, '#9ab4ff', x, 90, 70, 0.06, 80); }
        g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0);
        const prev = order(G.on ? G.k - 1 : G.last), cur = order(G.last), e = G.on ? ease(G.age / 60) : 1;
        textC(g, kp > 0 ? 'FINAL SCORE' : 'LEADERBOARD', BX + BW / 2, BY + 6, '#ffd23a', 1);
        for (let n = 0; n < 4; n++) { const a = prev.indexOf(n), b = cur.indexOf(n), y = RY(a) + (RY(b) - RY(a)) * e;
          if (G.on && G.age < 90 && a !== b) R(g, BX + 36, y - 1, 90, 15, 'rgba(255,210,58,' + (0.28 * (1 - G.age / 90)).toFixed(2) + ')');
          text(g, NAMES[n], BX + 36, y + 2, b === 0 && e > 0.9 ? '#ffd23a' : '#bfe8ff', 2); }
        if (G.on && top && G.age < 130 && (t >> 3) & 1) textC(g, 'NEW SOTA!', 240, 5, '#ffd23a', 2);
        if (G.on || kp > 0) { const n = top || kp > 0 ? 38 : 12, ag = G.on ? G.age : t - RX.ko, cols = ['#ffd23a', '#ff5fa2', '#3affb0', '#5ab4ff', '#ffffff'];
          for (let i = 0; i < n; i++) { const h = hash1(i * 5 + G.k * 3); R(g, BX + h * BW + Math.sin(ag * 0.1 + i) * 4, BY + 2 + ag * (0.6 + hash1(i * 7) * 0.9), 2, 2, cols[i % 5]); } }
        g.restore();
        put(g, l.stands, cam);
        g.save(); g.translate(off(cam, 0.6), 0);
        for (let j = 0; j < 3; j++) for (let x = -34, i = 0; x < AW + 34; x += 7, i++) { const ph = hash1(i * 3 + j * 71), up = jump > 0 ? -Math.round(Math.abs(Math.sin(t * 0.33 + ph * 6)) * 4 * jump) : (((t >> 4) + ((ph * 9) | 0)) % 7 === 0 ? -1 : 0), y = 168 + j * 12 + up;
          R(g, x, y, 5, 6, BODY[(ph * 7) | 0]); R(g, x + 1, y - 3, 3, 3, HEAD[(ph * 4) | 0]); if (jump > 0.2 && ph < 0.3) R(g, x - 1, y - 6 - ((t >> 2) & 1), 1, 4, HEAD[(ph * 4) | 0]); }
        g.restore();
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0); wallFx(g, t, '#fff2a8', '#ffd23a', 212, 18); g.restore();
      },
      front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.3, 206, 0.12, 90 + cam.x * 0.3); put(g, l.fg, cam); const ts = ((t * 0.5) | 0) % 140; text(g, 'EVAL EVAL EVAL EVAL EVAL EVAL', 480 - ts * 5 % 160 - 80, 264, '#ffd23a', 1);
        motes(g, t, 20, 3, 0, AW, 40, AH, 'rgba(255,240,170,0.35)', -0.3, 1, 5); } });
  }

  // ================================================================ 4. PROMPT INJECTION SEWER
  // A brick tunnel with a canal of glowing sludge, graffiti that reads like orders, a sealed door marked SYSTEM PROMPT. Words float on the sludge.
  // Gag: a wall pipe bursts and pours a bright stream of text into the canal (the side alternates). KO: lamps flicker. Heavy hit by a wall: bricks and sludge splinters fly.
  function sewerArena() {
    const WORDS = ['IGNORE', 'ALL', 'PREVIOUS', 'RULES', 'SUDO', 'ROOT', 'SECRET', 'PASTE'], PX = [58, 422];
    return ARENAS.make({ id: 'sewer', name: 'PROMPT INJECTION SEWER', tagline: 'IGNORE ALL PREVIOUS RULES', accent: '#2affb0',
      build(A) {
        const l = A.l, r = rng(967);
        l.sky = layer(0.1); { const { g, M } = l.sky;
          fill(l.sky, [[0, '#020807'], [0.6, '#06130f'], [1, '#0b2219']], { q: 6 });
          for (let i = 0; i < 9; i++) { const rr = 110 - i * 11, c = ['#0a1612', '#0e1d18', '#13261f', '#192f27', '#20382f', '#294438', '#335a46', '#3f7a5c', '#6affc0'][i]; disc(g, 240, 128, rr, rr, c); }
          R(g, 0, 128, 480, 90, '#06130f'); g.drawImage(grad(AW + 2 * M, 60, [[0, '#020807', 0], [1, '#06130f', 1]], { L: 6 }), -M, 128);
          disc(g, 240, 128, 12, 12, '#17342a'); ring(g, 240, 128, 12, '#6affc0'); ring(g, 240, 128, 9, '#2c5a48'); for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line(g, 240, 128, 240 + Math.cos(a) * 9, 128 + Math.sin(a) * 9, '#2c5a48', 1); }
          textC(g, 'SYSTEM PROMPT', 240, 104, '#6affc0', 1);
        }
        l.mid = layer(0.3); { const { g, M } = l.mid;
          for (const [x0, x1] of [[-M, 150], [330, AW + M]]) { R(g, x0, 0, x1 - x0, AH, '#14201b');
            for (let y = 0, row = 0; y < 214; y += 6, row++) for (let x = x0 - (row & 1) * 6; x < x1; x += 12) R(g, x, y, 11, 5, ['#1c2c25', '#18261f', '#22352c', '#142019'][(r() * 4) | 0]); }
          R(g, -M, 0, AW + 2 * M, 44, '#101a16'); for (let y = 0, row = 0; y < 44; y += 6, row++) for (let x = -M - (row & 1) * 6; x < AW + M; x += 12) R(g, x, y, 11, 5, r() < 0.5 ? '#16241e' : '#1a2b24');
          R(g, -M, 52, AW + 2 * M, 12, '#33463f'); R(g, -M, 52, AW + 2 * M, 2, '#5a7a6c'); R(g, -M, 62, AW + 2 * M, 2, '#17231e'); for (let x = -M + 14; x < AW + M; x += 60) { R(g, x, 49, 6, 18, '#2a3a34'); R(g, x, 49, 6, 2, '#5a7a6c'); }
          ring(g, 40, 118, 9, '#5a7a6c'); ring(g, 40, 118, 8, '#33463f'); for (let k = 0; k < 4; k++) { const a = k * TAU / 4; line(g, 40, 118, 40 + Math.cos(a) * 8, 118 + Math.sin(a) * 8, '#5a7a6c', 1); } R(g, 38, 126, 4, 40, '#33463f');
          text(g, 'IGNORE ALL PREVIOUS', 20, 76, 'rgba(106,255,192,0.6)', 1); text(g, 'INSTRUCTIONS', 20, 84, 'rgba(106,255,192,0.6)', 1); text(g, 'SELECT * FROM SECRETS;', 352, 90, 'rgba(106,255,192,0.5)', 1); text(g, 'ADMIN=TRUE', 392, 98, 'rgba(255,90,90,0.55)', 1);
          for (const x of [150, 330]) { R(g, x - 1, 92, 3, 10, '#33463f'); R(g, x - 6, 100, 12, 12, '#0a1612'); box(g, x - 6, 100, 12, 12, '#5a7a6c'); R(g, x - 4, 102, 8, 8, '#bfffe0'); }
        }
        l.chan = layer(0.6); { const { g, M } = l.chan, w = AW + 2 * M;
          g.drawImage(grad(w, 44, [[0, '#127a56'], [0.4, '#0d4a38'], [1, '#04140f']], { q: 6 }), -M, 170);
          R(g, -M, 168, w, 3, '#2c4a3e'); R(g, -M, 168, w, 1, '#5a7a6c');
          for (const x of PX) { R(g, x - 11, 96, 22, 74, '#1a2a24'); box(g, x - 11, 96, 22, 74, '#2c4a3e'); for (let y = 98; y < 168; y += 6) R(g, x - 10, y, 20, 1, '#101c17'); R(g, x + (x < 240 ? 11 : -29), 134, 18, 12, '#33463f'); R(g, x + (x < 240 ? 26 : -29), 133, 3, 14, '#5a7a6c'); }
          pool(g, '#2affb0', 240, 200, 150, 14, 0.18);
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#0c1412', mid: '#1a2a26', bot: '#0b1210', fade: '#0d1a14', line: '#07100d', line2: '#2c4a40', lip: '#2c9a78', lip2: '#07100d', sp: 36, vp: [240, 120], rows: [-14, -8, -3, 4, 12, 22, 34] });
          speck(g, -M, 216, w, 54, ['#243730', '#101c17', '#2f453b'], 300, 4);
          for (const x of [120, 340]) { R(g, x, 246, 40, 12, '#05100c'); for (let i = 0; i < 6; i++) R(g, x + 3 + i * 6, 247, 2, 10, '#33463f'); }
          pool(g, '#2affb0', 250, 244, 80, 8, 0.16); pool(g, '#2affb0', 60, 252, 40, 6, 0.12);
          R(g, -M, 210, w, 4, '#0b1612'); R(g, -M, 210, w, 1, '#3a5a4c');
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          R(g, -20, 0, 520, 12, '#0a1310'); R(g, -20, 12, 520, 2, '#33463f'); for (const x of [40, 150, 330, 440]) { R(g, x, 12, 8, 22, '#17231e'); R(g, x - 2, 32, 12, 4, '#33463f'); }
          for (const x of [-12, 468]) { column(g, x, 12, AH, 24, '#06100c', x < 0 ? '#06100c' : '#2c9a78', x < 0 ? '#2c9a78' : '#06100c'); for (let y = 44; y < AH; y += 40) R(g, x - 2, y, 28, 4, '#0e1a15'); }
        }
        l.fog = fogTex(480, 60, '#2affb0', 0.8, 971); l.fog2 = fogTex(480, 50, '#1a7a5a', 0.8, 972);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, G = gagState(t, CFG.sewer.seed, CFG.sewer.dur), lm = lights(t), kp = pulse(t, 'ko', 110);
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.1), 0); glow(g, kp > 0 ? '#ff6a5a' : '#6affc0', 240, 128, 60, (0.18 + 0.05 * Math.sin(t * 0.07) + kp * 0.25) * lm, 50); g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0); for (const x of [150, 330]) glow(g, kp > 0 ? '#ff6a5a' : '#bfffe0', x, 106, 24, (0.5 + kp * 0.3) * flick(t, x) * lm, 24); g.restore();
        put(g, l.chan, cam);
        g.save(); g.translate(off(cam, 0.6), 0);
        for (let i = 0; i < 6; i++) { const y = 176 + i * 6 + (G.on && G.age > 20 ? Math.round(Math.sin(t * 0.2 + i) * 1.5) : 0); for (let x = -40 + ((t * (0.4 + i * 0.1) + i * 53) % 90); x < AW + 40; x += 90) R(g, x, y, 22, 1, 'rgba(150,255,210,0.42)'); }
        for (let i = 0; i < WORDS.length; i++) { const sp = (i & 1 ? -1 : 1) * (0.25 + (i % 3) * 0.12), x = (((i * 83 + t * sp) % (AW + 140)) + AW + 140) % (AW + 140) - 70; text(g, WORDS[i], x, 180 + (i % 3) * 10, 'rgba(190,255,225,' + (0.5 + 0.2 * (i % 2)) + ')', 1); }
        if (G.on) { const px = PX[G.k & 1], dir = px < 240 ? 1 : -1, a = G.age, pw = a < 20 ? 0 : a < 200 ? 1 : 1 - (a - 200) / 60, mx = px + dir * 24, my = 140;
          if (a < 22) { R(g, mx - dir * 4 + (t & 1), my - 7, 3, 14, '#5a7a6c'); }
          if (pw > 0) { for (let s = 0; s < 44; s++) { const tt = s * 0.9 - (t * 0.9 % 0.9), x = mx + dir * 2.4 * tt, y = my + 0.11 * tt * tt * 0.5 + tt * 0.2; if (y > 172) break; const bright = ((s + (t >> 1)) & 3) === 0; R(g, x, y, 3, 2, bright ? '#bfffe0' : '#2affb0'); }
            const lx = mx + dir * 2.4 * 38; glow(g, '#6affc0', lx, 172, 26, 0.4 * pw, 12); for (let i = 0; i < 8; i++) R(g, lx + (hash1(i + (t >> 2)) - 0.5) * 24, 168 - ((t * 0.6 + i * 5) % 14), 1, 1, '#bfffe0'); }
          for (let i = 0; i < 4; i++) R(g, mx - dir * 6 + dir * (hash1(i + (t >> 1)) * 6), my - 6 + i * 5, 2, 1, '#2affb0'); }
        g.restore();
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0); wallFx(g, t, '#6affc0', '#b6a070', 206, 18); g.restore();
      },
      front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.4, 196, 0.2, 70 + cam.x * 0.3); fogDraw(g, l.fog2, t, 0.7, 226, 0.14, 250); put(g, l.fg, cam);
        for (const [x, ph] of [[44, 0], [154, 41], [334, 77], [444, 19]]) { const u = (t + ph) % 130, y = 36 + u * 1.7; if (y < 236) R(g, x + 3, y, 2, 3, '#6affc0'); else if (u < 130 - 0 && y < 246) { ring(g, x + 4, 240, 2 + ((y - 236) >> 1), 'rgba(106,255,192,0.5)'); } }
        motes(g, t, 26, 11, 0, AW, 60, AH, 'rgba(106,255,192,0.35)', -0.35, 1, 4); } });
  }

  // ================================================================ 5. LATENCY LAGOON
  // A pier over a still bay under a moon that is stuck buffering. The lighthouse beam stutters, the reflection trails behind its own source, buoys report their ping.
  // Gag: one long swell rolls across the bay from right to left, every buoy jumps to PING 999. KO: the beam stays on and the buoys read TIMEOUT. Heavy hit by a wall: spray from the pier edge.
  function lagoonArena() {
    const BUOY = [[120, 178, 0], [250, 170, 2], [392, 182, 4]];
    return ARENAS.make({ id: 'lagoon', name: 'LATENCY LAGOON', tagline: 'THE ANSWER IS STILL LOADING', accent: '#2ad4ff',
      build(A) {
        const l = A.l, r = rng(983);
        l.sky = layer(0.08); { const { g, M } = l.sky, w = AW + 2 * M;
          fill(l.sky, [[0, '#050a2a'], [0.45, '#0d2a5a'], [0.72, '#1a6a8a'], [0.9, '#d07a96'], [1, '#f0a090']], { q: 6 });
          for (let i = 0; i < 70; i++) R(g, -M + r() * w, r() * 110, 1, 1, r() < 0.2 ? '#fff0c0' : '#6a9ae0');
          disc(g, 330, 56, 26, 26, '#cfe8ff'); disc(g, 322, 50, 5, 5, '#a9c8e8'); disc(g, 338, 64, 7, 7, '#a9c8e8'); disc(g, 336, 44, 3, 3, '#b8d4f0');
        }
        l.mid = layer(0.3); { const { g, M } = l.mid;
          ridge(g, 156, 22, 985, '#0c2a48', { jag: 0.5 }); ridge(g, 164, 14, 987, '#0a2038', { jag: 0.4 });
          R(g, 84, 96, 12, 62, '#cfd8e8'); for (let y = 100; y < 150; y += 12) R(g, 84, y, 12, 5, '#c8322c'); R(g, 80, 90, 20, 6, '#2a3a5a'); R(g, 83, 80, 14, 10, '#ffeaa0'); box(g, 83, 80, 14, 10, '#2a3a5a'); poly(g, [80, 80, 90, 72, 100, 80], '#2a3a5a'); R(g, 80, 158, 20, 4, '#08182c');
          for (const [x, h] of [[388, 40], [420, 52], [452, 34]]) { line(g, x, 158, x + 3, 158 - h, '#05101e', 2); for (let k = 0; k < 6; k++) { const a = -1.2 + k * 0.5, len = 14; line(g, x + 3, 158 - h, x + 3 + Math.cos(a) * len, 158 - h + Math.sin(a) * len * 0.8 + 6, '#05101e', 2); } }
        }
        l.water = layer(0.6); { const { g, M } = l.water, w = AW + 2 * M;
          g.drawImage(grad(w, 214 - 150, [[0, '#18789a'], [0.3, '#0c4c6c'], [1, '#05203a']], { q: 6 }), -M, 150);
          for (let y = 154; y < 212; y += 3) { const n = 4 + ((y - 150) >> 3); for (let i = 0; i < n; i++) R(g, -M + r() * w, y, 6 + r() * (y - 150) * 0.4, 1, r() < 0.5 ? '#2a9ac0' : '#0a3a58'); }
          R(g, -M, 150, w, 1, '#7ad8f0');
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#2a1a14', mid: '#4a2e20', bot: '#25150f', fade: '#2e1c14', line: '#1a0e0a', line2: '#6a4630', lip: '#c89a62', lip2: '#1a0e0a', sp: 26, vp: [240, 90], rows: [-12, -6, 0, 8, 18, 30] });
          speck(g, -M, 216, w, 54, ['#5a3a28', '#2a1a12', '#7a5438'], 260, 3);
          for (let x = -M + 14; x < AW + M; x += 36) { R(g, x, 196, 5, 19, '#2a1a12'); R(g, x, 196, 5, 1, '#6a4630'); }
          R(g, -M, 200, w, 1, '#8a6a48');
          pool(g, '#ffd7a0', 240, 230, 150, 12, 0.14);
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          for (const x of [-10, 466]) { column(g, x, 20, AH, 24, '#2a1a12', x < 0 ? '#2a1a12' : '#8a6a48', x < 0 ? '#8a6a48' : '#2a1a12'); for (let y = 60; y < 250; y += 26) { R(g, x - 1, y, 26, 3, '#a89060'); R(g, x - 1, y + 3, 26, 1, '#4a3a20'); } R(g, x - 3, 20, 30, 5, '#4a2e20'); }
        }
        l.fog = fogTex(480, 56, '#9ee8ff', 0.7, 991);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, G = gagState(t, CFG.lagoon.seed, CFG.lagoon.dur), kp = pulse(t, 'ko', 110), lm = lights(t);
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.08), 0);
        glow(g, '#9ac8ff', 330, 56, 70, 0.12 + 0.03 * Math.sin(t * 0.05), 60);
        for (let k = 0; k < 8; k++) { const a = (((t >> 3) % 8) + k) * TAU / 8; R(g, 330 + Math.cos(a) * 34, 56 + Math.sin(a) * 34, 3, 3, k === 7 ? '#ffffff' : 'rgba(207,232,255,' + (0.1 + k * 0.1).toFixed(2) + ')'); }   // buffering spinner, steps in jerks
        g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0);
        g.restore();
        put(g, l.water, cam);
        g.save(); g.translate(off(cam, 0.3), 0);   // lighthouse beam: it moves in jerks, and stays on a wide fixed cone after a KO
        { const st = Math.floor(t / 18), ang = kp > 0 ? 0.07 : -0.04 + Math.sin(st * 1.3) * 0.2, hw = kp > 0 ? 0.13 : 0.06, bx = 90, by = 85, len = 420;
          fpoly(g, [bx, by, bx + Math.cos(ang - hw) * len, by + Math.sin(ang - hw) * len, bx + Math.cos(ang + hw) * len, by + Math.sin(ang + hw) * len], 'rgba(255,240,170,' + (kp > 0 ? 0.24 : 0.09) + ')');
          glow(g, '#fff0b0', bx, by, 24, kp > 0 ? 0.6 : 0.4, 20); }
        g.restore();
        g.save(); g.translate(off(cam, 0.08), 0);   // the moon's reflection arrives late: each row lags the one above it
        for (let i = 0; i < 20; i++) { const y = 152 + i * 3, d = Math.sin((t - i * 7) * 0.05) * (2 + i * 0.35); R(g, 330 + d - (14 - i * 0.3), y, Math.max(3, 24 - i), 1, 'rgba(207,232,255,' + (0.5 - i * 0.02).toFixed(2) + ')'); }
        g.restore();
        g.save(); g.translate(off(cam, 0.6), 0);
        const wc = G.on ? 540 - G.age * 2.15 : -999;   // swell crest x
        if (G.on) { const pts = []; for (let x = wc - 100; x <= wc + 100; x += 5) { const u = (x - wc) / 48; pts.push(x, 178 - 16 * Math.exp(-u * u * 1.2)); }
          pts.push(wc + 100, 214, wc - 100, 214); fpoly(g, pts, 'rgba(34,150,190,0.8)');
          for (let x = wc - 40; x <= wc + 40; x += 4) { const u = (x - wc) / 48, y = 178 - 16 * Math.exp(-u * u * 1.2); R(g, x, y, 3, 1, '#d8fbff'); if (hash1(x + (t >> 2)) < 0.4) R(g, x, y - 1 - ((hash1(x) * 3) | 0), 1, 1, '#ffffff'); } }
        for (const [bx, by, ph] of BUOY) { const u = (bx - wc) / 48, up = G.on ? 16 * Math.exp(-u * u * 1.2) : 0, y = by + Math.sin(t * 0.05 + ph) * 1.2 - up * 0.5; const big = G.on && Math.abs(bx - wc) < 70 || (G.on && bx > wc && G.age < 250);
          R(g, bx - 3, y - 4, 7, 8, '#c8322c'); R(g, bx - 3, y - 1, 7, 2, '#f0f0f0'); R(g, bx, y - 12, 1, 8, '#9aa8b8'); R(g, bx - 1, y - 14, 3, 2, kp > 0 && (t >> 2) & 1 ? '#ff4a4a' : '#ffeaa0');
          const s = kp > 0 ? 'TIMEOUT' : 'PING ' + (G.on && G.age > 8 && G.age < 240 ? '999' : 12 + ((hash1((t >> 5) + ph * 9) * 40) | 0)); R(g, bx - tw(s) / 2 - 2, y - 24, tw(s) + 4, 8, 'rgba(4,14,30,0.8)'); text(g, s, bx - tw(s) / 2, y - 22, big || kp > 0 ? '#ff6a5a' : '#7ad8f0', 1); }
        g.restore();
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0);
        for (let x = 5; x < 480; x += 36) { const sag = 3 + Math.sin(t * 0.04 + x) * 0.6; line(g, x + 2, 197, x + 38, 197, '#6a5030', 1); const bx = x + 20, by = 197 + sag; R(g, bx, by, 2, 2, 'rgba(255,228,150,' + (0.6 * flick(t, x) * lm).toFixed(2) + ')'); }
        wallFx(g, t, '#d8fbff', '#7ad8f0', 208, 22); g.restore();
      },
      front(g, t, cam, A) { const l = A.l; fogDraw(g, l.fog, t, 0.3, 188, 0.14, 50 + cam.x * 0.3); fogDraw(g, l.fog, t, 0.5, 232, 0.08, 220); put(g, l.fg, cam);
        for (const [x, ph] of [[4, 0], [476, 2]]) glow(g, '#ffd7a0', x, 80 + Math.sin(t * 0.04 + ph) * 3, 26, 0.3 * lights(t), 22);
        motes(g, t, 22, 13, 0, AW, 120, AH, 'rgba(180,240,255,0.3)', -0.2, 1, 6); } });
  }

  // ================================================================ 6. ALIGNMENT DOJO
  // A wooden training hall behind paper screens, three rule scrolls on the wall, a gong, red lanterns. A shadow on the screens practises the same kata over and over.
  // Gag: three judge drones swoop in, hover over the mat, flip their score cards, and leave. KO: the gong rings and the lanterns swing hard. Heavy hit by a wall: the paper shakes and dust drops.
  function dojoArena() {
    return ARENAS.make({ id: 'dojo', name: 'ALIGNMENT DOJO', tagline: 'BOW, THEN FIGHT NICELY', accent: '#ff4b5c',
      build(A) {
        const l = A.l, r = rng(1009);
        l.sky = layer(0.1); { const { g, M } = l.sky, w = AW + 2 * M;
          fill(l.sky, [[0, '#120806'], [1, '#2a140e']], { q: 6 });
          for (let i = 0; i < 6; i++) { const x = -M + i * 98 + 4; g.drawImage(grad(90, 128, [[0, '#8a6a42'], [0.5, '#c0a070'], [1, '#8a6a42']], { radial: [45, 64, 60, 90], q: 8 }), x, 44); R(g, x, 44, 90, 2, '#2b1810'); R(g, x, 172, 90, 3, '#2b1810'); R(g, x, 44, 2, 131, '#2b1810'); R(g, x + 88, 44, 2, 131, '#2b1810');
            for (let k = 1; k < 4; k++) R(g, x, 44 + k * 32, 90, 1, '#4a2e1c'); R(g, x + 44, 44, 1, 131, '#4a2e1c'); }
          R(g, -M, 36, w, 8, '#1a0e0a'); R(g, -M, 36, w, 1, '#5a3a24'); R(g, -M, 0, w, 36, '#0e0604');
        }
        l.mid = layer(0.3); { const { g, M } = l.mid, w = AW + 2 * M;
          for (const x of [12, 462]) column(g, x - 6, 0, 214, 14, '#2a1a12', '#6a4630', '#120a06');
          R(g, -M, 168, w, 46, '#1a0e0a'); R(g, -M, 168, w, 2, '#5a3a24'); for (let x = -M + 8; x < AW + M; x += 24) R(g, x, 172, 2, 38, '#0e0604');
          [['HELPFUL', 150], ['HONEST', 240], ['HARMLESS', 330]].forEach(([s, x]) => { R(g, x - 21, 60, 42, 3, '#2a1a12'); R(g, x - 19, 63, 38, 58, '#d9c8a0'); R(g, x - 19, 63, 2, 58, '#a89060'); R(g, x + 17, 63, 2, 58, '#a89060'); R(g, x - 21, 121, 42, 3, '#a82a2a'); line(g, x, 124, x, 134, '#a82a2a', 1); R(g, x - 2, 134, 5, 4, '#a82a2a');
            textC(g, s, x, 78, '#2a1810', 1); for (let k = 0; k < 5; k++) R(g, x - 12, 92 + k * 5, 24 - ((r() * 8) | 0), 1, '#6a5030'); });
          disc(g, 60, 152, 7, 7, '#1c3a24'); disc(g, 52, 150, 5, 5, '#24502e'); disc(g, 68, 150, 5, 5, '#24502e'); R(g, 56, 158, 8, 10, '#6a3a24');
          R(g, 396, 112, 3, 56, '#3a2418'); R(g, 436, 112, 3, 56, '#3a2418'); R(g, 394, 112, 47, 4, '#5a3a24'); R(g, 394, 166, 47, 4, '#3a2418');
        }
        l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
          floorBase(l.floor, { y0: 214, top: '#3a2418', mid: '#5a3a24', bot: '#2e1c12', fade: '#3e2618', line: '#241408', line2: '#7a5232', lip: '#d8a868', lip2: '#241408', sp: 60, xo: 20, vp: [240, 70], rows: [-12, -2, 12, 30] });
          speck(g, -M, 216, w, 54, ['#6a4630', '#2e1c12', '#7a5232'], 260, 6);
          for (let a = 0; a < TAU; a += 0.04) R(g, 240 + Math.cos(a) * 112, 244 + Math.sin(a) * 12, 1, 1, 'rgba(168,42,42,0.7)');
          pool(g, '#ffb870', 240, 232, 150, 12, 0.14);
        }
        l.fg = layer(1.25); { const { g } = l.fg;
          for (const x of [-12, 468]) { column(g, x, 0, AH, 24, '#1a0e0a', x < 0 ? '#1a0e0a' : '#7a5232', x < 0 ? '#7a5232' : '#1a0e0a'); for (let y = 40; y < AH; y += 52) R(g, x - 2, y, 28, 4, '#2a1a12'); R(g, x - 4, 0, 32, 6, '#3a2418'); }
        }
        l.fog = fogTex(480, 56, '#ffd9a0', 0.6, 1013);
      },
      paint(g, t, cam, A) {
        const rc = cam; cam = pc(cam, t); const l = A.l, G = gagState(t, CFG.dojo.seed, CFG.dojo.dur), kp = pulse(t, 'ko', 120), wp = pulse(t, 'wall', 38), lm = lights(t);
        put(g, l.sky, cam);
        g.save(); g.translate(off(cam, 0.1), 0);
        { const k = ((t >> 3) % 6), px = 255, by = 172; g.fillStyle = 'rgba(30,14,8,0.8)';   // shadow of the student on the paper, cycling through kata poses
          disc(g, px, by - 62, 6, 6, 'rgba(30,14,8,0.8)'); R(g, px - 5, by - 55, 10, 24, 'rgba(30,14,8,0.8)'); R(g, px - 5, by - 31, 4, 24, 'rgba(30,14,8,0.8)'); R(g, px + 1, by - 31, 4, 24, 'rgba(30,14,8,0.8)');
          const arm = [[-14, -48, 8], [-14, -52, 14], [12, -50, 10], [14, -46, 16], [10, -54, 12], [-12, -46, 10]][k]; R(g, px + (arm[0] < 0 ? arm[0] : 5), by + arm[1], Math.abs(arm[0]) + 5 - (arm[0] < 0 ? 0 : 5) + 6, 3, 'rgba(30,14,8,0.8)'); if (k === 3 || k === 4) R(g, px - 18, by - 28, 14, 3, 'rgba(30,14,8,0.8)'); }
        if (wp > 0) for (let i = 0; i < 5; i++) R(g, (RX.side < 0 ? 4 : 440) + Math.sin(t * 0.8 + i) * 2, 60 + i * 24, 1, 20, 'rgba(255,230,180,0.25)');
        g.restore();
        put(g, l.mid, cam);
        g.save(); g.translate(off(cam, 0.3), 0);
        { const gx = 417, gy = 140, ringa = kp > 0 ? (120 - kp * 120) : (t - RX.ko > 120 ? 200 : 0);   // gong
          disc(g, gx, gy, 16, 16, '#5a4020'); disc(g, gx, gy, 14, 14, '#b08a48'); disc(g, gx, gy, 6, 6, '#d8b868'); ring(g, gx, gy, 14, '#6a4a20');
          if (kp > 0) for (let k = 0; k < 3; k++) { const rr = ((ringa * 0.6 + k * 10) % 34) + 14; ring(g, gx, gy, rr, 'rgba(255,216,140,' + (0.5 * kp).toFixed(2) + ')'); } }
        g.restore();
        put(g, l.floor, rc);
        g.save(); g.translate(off(rc, 1), 0);
        if (G.on) { const a = G.age, sc = G.k, cards = [[10, 9, 10], [9, 9, 10], [10, 10, 9]][sc % 3];
          for (let i = 0; i < 3; i++) { const tx = 170 + i * 70, ent = ease(a / 60 - i * 0.08), ex = clamp((a - 270 + i * 12) / 60, 0, 1), x = tx + (1 - ent) * (260 + i * 30) + ease(ex) * 220, y = 64 + (1 - ent) * -40 - ease(ex) * 70 + Math.sin(t * 0.07 + i * 2) * 2;
            R(g, x - 7, y - 5, 14, 9, '#3a4458'); R(g, x - 7, y - 5, 14, 2, '#6a7488'); R(g, x - 9, y - 2, 2, 5, '#2a3040'); R(g, x + 7, y - 2, 2, 5, '#2a3040'); disc(g, x, y, 2, 2, (t >> 3) & 1 ? '#ff4b5c' : '#a82a2a');
            R(g, x - 12 + ((t >> 1) & 1) * 3, y - 8, 9, 1, '#9aa8b8'); R(g, x + 3 - ((t >> 1) & 1) * 3, y - 8, 9, 1, '#9aa8b8'); R(g, x, y + 4, 1, 12, '#6a7488');
            const flip = clamp((a - 100 - i * 14) / 24, 0, 1), cw = Math.abs(Math.cos(flip * Math.PI)) * 9 + 1;
            if (ent > 0.99 && ex < 0.05) { R(g, x - cw, y + 16, cw * 2, 12, flip < 0.5 ? '#c8322c' : '#f4ecd0'); box(g, x - cw, y + 16, cw * 2, 12, '#2a1810'); if (flip >= 0.5 && cw > 6) textC(g, String(cards[i]), x, y + 20, '#2a1810', cards[i] > 9 ? 1 : 2); } } }
        wallFx(g, t, '#ffe6b4', '#d8a868', 210, 14); g.restore();
      },
      front(g, t, cam, A) { const l = A.l, kp = pulse(t, 'ko', 120), lm = lights(t); fogDraw(g, l.fog, t, 0.25, 210, 0.1, 100 + cam.x * 0.3); put(g, l.fg, cam);
        g.save(); g.translate(off(cam, 1.25), 0);
        for (const [x, ph] of [[8, 0], [472, 2]]) { const sw = Math.sin(t * 0.04 + ph) * (2 + kp * 9), lx = x + sw; line(g, x, 0, lx, 26, '#3a2418', 1); glow(g, '#ff8a4a', lx, 38, 28, (0.32 + kp * 0.3) * lm, 24);
          disc(g, lx, 38, 8, 10, '#c8322c'); for (const dy of [-5, 0, 5]) R(g, lx - 7, 38 + dy, 14, 1, '#7a1c18'); R(g, lx - 4, 27, 8, 2, '#2a1810'); R(g, lx - 4, 48, 8, 2, '#2a1810'); R(g, lx, 50, 1, 6 + (kp > 0 ? 2 : 0), '#d8a868'); }
        g.restore();
        motes(g, t, 28, 17, 0, AW, 40, AH, 'rgba(255,214,150,0.35)', -0.25, 1, 5); } });
  }

  // ---------------------------------------------------------------- register
  const made = [cliffArena(), hallArena(), stadiumArena(), sewerArena(), lagoonArena(), dojoArena()];
  for (const a of made) ARENAS.push(a);

  // The debug routes #...&arena=K are resolved by game.js at boot, before this file adds the stages: K = 9 or more wrapped around to an old stage there. Apply them again now.
  { const h = location.hash, m = h.match(/arena=(\d+)/);
    if (m && +m[1] >= BASE && +m[1] < ARENAS.length && typeof game !== 'undefined' && typeof startMatch === 'function') {
      game.arenaPick = +m[1];
      if (/^#demo=\d+,\d+/.test(h)) { startMatch(); game.f[0].cpu = true; game.f[1].cpu = true; const ff = h.match(/ff=(\d+)/); if (ff) window.step(+ff[1]); }
    } }

  window.ARENAS2 = { ids: made.map(a => a.id), base: BASE, cfg: CFG, gag: (t, id) => gagState(t, CFG[id].seed, CFG[id].dur), state: RX, stats: STATS,
    react: (kind, side) => { if (kind === 'ko') RX.ko = game.tick; else { RX.wall = game.tick; RX.side = side < 0 ? -1 : 1; } } };
})();
