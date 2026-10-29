// ===== AGENT BRAWL feature file: ARENAS3. Loaded after touch.js (see docs/ARCHITECTURE.md). =====
// Owner: the arenas3 agent (x-arenas3). Only that agent edits this file, tools/tests/x-arenas3.mjs and docs/features/x-arenas3.md.
// Area: six more stages, each with its own procedural chiptune theme: TECH-DEBT SWAMP, CACHE MISS CANYON, OPEN-PLAN OFFICE, CLOUD BILLING VOLCANO, NIGHTLY BUILD EXPRESS, KEYNOTE STAGE.
// Hooks used: ARENAS.make + ARENAS.push (stages, thumbnails come with ARENAS.make), MUSIC.define(id, theme, { trim, arena: true }) (one theme per stage, mapped by arena id),
//   BUS 'match:start', 'round:start', 'hit', 'block', 'ko' (one background reaction per stage: swamp lurch, canyon echo, office cheer, billing eruption, train arc, keynote flashes).
// Global: ARENAS3 = { ids, rx (the reaction clock), themes }. Everything is painted in the half-resolution 480x270 space of arenas.js (ARENAS.kit), no images, no audio files.
'use strict';
(() => {
  window.STUB_ARENAS3 = 1;   // marker: tools/tests/core.mjs style check that this file loaded
  const K = ARENAS.kit, { AW, AH, AG, TAU, hash1, rng, mix, rgba, clamp, cv, grad, layer, off, put, fill, R, line, disc, ring, poly, box, fpoly, speck, text, tw, textC, glow, pool, fogTex, fogDraw, motes, floorBase, lightning, bolt, flame, ridge } = K;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, PI = Math.PI;
  const at = (g, cam, f, fn) => { g.save(); g.translate(off(cam, f), 0); fn(); g.restore(); };   // run fn inside the parallax frame of a layer with factor f

  // ---------- background reactions: BUS events stamp a clock, the painters read it ----------
  // ticks are game.tick, which only grows, so an old stamp simply means "long ago"; match:start clears them.
  const RX = { hit: -1e6, big: -1e6, ko: -1e6, block: -1e6, x: 0.5, side: 0, mag: 0, cost: 0, t0: 0, hits: 0 };
  const pulse = (t, k, len) => { const a = t - RX[k]; return a >= 0 && a < len ? 1 - a / len : 0; };   // 1 right after the event, 0 after len ticks
  const tick = () => (typeof game !== 'undefined' && game ? game.tick : 0);
  BUS.on('match:start', () => { RX.hit = RX.big = RX.ko = RX.block = -1e6; RX.cost = RX.hits = 0; RX.t0 = tick(); });
  BUS.on('round:start', () => { RX.ko = -1e6; });   // the "match is over" gags must not linger into the next round
  BUS.on('hit', e => {
    const t = tick(); RX.hit = t; RX.x = clamp(e.victim.x / 960, 0, 1); RX.side = e.victim.side; RX.cost += Math.round(e.dmg * 911); RX.hits++;
    if (e.dmg >= 11 || e.kind === 'super' || e.combo >= 4) { RX.big = t; RX.mag = clamp(e.dmg / 20, 0.5, 1.4); }
  });
  BUS.on('block', e => { RX.block = tick(); RX.x = clamp(e.victim.x / 960, 0, 1); });
  BUS.on('ko', e => { RX.ko = tick(); RX.x = clamp(e.loser.x / 960, 0, 1); });
  const live = () => { const g = typeof game !== 'undefined' ? game : null; return g && g.f && g.f.length === 2 && g.f[0] && ['intro', 'fight', 'pause', 'finish', 'finisher', 'ko', 'outro'].includes(g.phase) ? g : null; };

  const ids = [], themes = {};
  const add = (def, theme, trim) => { ARENAS.push(ARENAS.make(def)); ids.push(def.id); themes[def.id] = theme; MUSIC.define(def.id, theme, { trim, arena: true }); };

  // scales the six themes share (music.js keeps its own private ones)
  const MIN = [0, 2, 3, 5, 7, 8, 10], MAJ = [0, 2, 4, 5, 7, 9, 11], BLU = [0, 3, 5, 6, 7, 10], PHD = [0, 1, 4, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], HMIN = [0, 2, 3, 5, 7, 8, 11];

  // ======================================================================================
  // 1. TECH-DEBT SWAMP - legacy mainframes sinking into a bog, fireflies that are all TODO comments
  // ======================================================================================
  const TAGS = ['TODO', 'FIXME', 'HACK', 'TMP', 'WHY', 'XXX'];
  function slab(w, h, tilt, seed, label, tone) {   // one beige legacy cabinet drawn once into its own sprite; the bottom 24 px are the part below the waterline
    const tx = Math.round(tilt * h), x0 = 4 + (tx < 0 ? -tx : 0), { c, g } = cv(w + abs(tx) + 8, h + 24), r = rng(seed), [col, hi, lo] = tone, leds = [];
    const sh = y => tx * (h - y) / h;   // lean at height y
    poly(g, [x0, h + 24, x0 + w, h + 24, x0 + w + tx, 0, x0 + tx, 0], col);
    poly(g, [x0 + w - 3, h + 24, x0 + w, h + 24, x0 + w + tx, 0, x0 + w + tx - 3, 0], lo); line(g, x0 + tx, 0, x0 + w + tx, 0, hi); line(g, x0, h + 24, x0 + tx, 0, hi);
    for (let y = h - 6; y > 8; y -= 12 + (r() * 8 | 0)) { R(g, x0 + sh(y) + 2, y, w - 6, 1, lo); R(g, x0 + sh(y) + 2, y + 1, w - 6, 1, hi); }
    const vy = 10 + (r() * 12 | 0); for (let i = 0; i < 6; i++) R(g, x0 + sh(vy + i * 3) + 5, vy + i * 3, w - 14, 1, lo);          // louvre vents
    const ry = h * 0.45 | 0; for (const k of [0.3, 0.7]) { const cx = x0 + sh(ry) + w * k | 0; disc(g, cx, ry, 6, 6, lo); ring(g, cx, ry, 6, hi); disc(g, cx, ry, 2, 2, hi); line(g, cx - 5, ry, cx + 5, ry, hi); line(g, cx, ry - 5, cx, ry + 5, hi); }   // tape reels
    R(g, x0 + sh(h * 0.72) + 4, h * 0.72, w - 12, 9, lo); textC(g, label, x0 + sh(h * 0.72) + w / 2, h * 0.72 + 2, mix(col, '#d8e8c0', 0.55), 1);
    for (let i = 0; i < 4; i++) { const y = h * 0.86 - i * 5, lx = x0 + sh(y) + 5 + i * 3; leds.push([lx, y]); R(g, lx, y, 2, 1, lo); }
    for (let i = 0; i < 14; i++) { const x = x0 + 4 + r() * (w - 8), y = r() * h; R(g, x, y, 1, 4 + r() * 12, r() < 0.5 ? '#6a4a22' : '#4a3a1a'); }   // rust streaks
    for (let i = 0; i < 26; i++) R(g, x0 + r() * w, h - 4 + r() * 14, 1 + (r() * 2 | 0), 2, r() < 0.5 ? '#3a6a22' : '#27481a');                // moss at the waterline
    return { c, leds, w: c.width, h: c.height };
  }
  const swamp = {
    id: 'techdebt', name: 'TECH-DEBT SWAMP', tagline: 'THE LEGACY IS STILL SINKING', accent: '#a6d63c',
    build(A) {
      const l = A.l, beige = ['#7d7a63', '#a9a589', '#4f4d3d'], grey = ['#5f6b5f', '#8a9886', '#3a443b'];
      l.sky = layer(0.06); { const { g, M } = l.sky, w = AW + 2 * M, r = rng(31);
        fill(l.sky, [[0, '#04080a'], [0.45, '#0a1a17'], [0.74, '#18321f'], [1, '#2a421c']], { q: 6 });
        for (let i = 0; i < 80; i++) R(g, -M + r() * w, r() * 120, 1, 1, r() < 0.5 ? '#3a5a4a' : '#6a8a68');
        pool(g, '#a6d63c', 372, 54, 80, 64, 0.2); disc(g, 372, 54, 21, 21, '#c9d8b0'); disc(g, 366, 49, 4, 3, '#a9bd94'); disc(g, 379, 60, 5, 4, '#a9bd94'); disc(g, 378, 46, 2, 2, '#a9bd94');
        for (let i = 0; i < 6; i++) { g.globalAlpha = 0.55; R(g, -M + r() * w, 70 + i * 14 + r() * 8, 60 + r() * 120, 3, '#0f2420'); g.globalAlpha = 1; } }
      l.far = layer(0.18); { const { g, M } = l.far, r = rng(7);
        for (const [x, w, h] of [[-10, 22, 44], [34, 14, 60], [92, 18, 38], [150, 12, 52], [308, 16, 50], [356, 24, 40], [416, 14, 62], [462, 20, 46]]) {
          R(g, x, 180 - h, w, h + 6, '#0a1713'); R(g, x, 180 - h, w, 1, '#1a3a30'); R(g, x + w - 2, 180 - h, 2, h + 6, '#06100d');
          for (let y = 180 - h + 5; y < 176; y += 7) R(g, x + 2, y, w - 5, 1, '#0e211b'); R(g, x + 2 + (r() * (w - 6) | 0), 178 - h, 1, 2, '#7a1a14'); }
        for (const x of [60, 196, 276, 404]) { line(g, x, 184, x + 2, 126, '#040a08', 2); line(g, x + 1, 150, x - 11, 134, '#040a08'); line(g, x + 2, 140, x + 12, 122, '#040a08'); line(g, x - 3, 160, x - 12, 154, '#040a08'); }
        g.drawImage(grad(AW + 2 * M, 56, [[0, '#18331f', 0], [1, '#1b3a22', 0.95]], { L: 6 }), -M, 134); }
      l.slabs = [[44, 58, 100, -0.05, 'V1.0', beige, 5, 'LEGACY'], [128, 36, 66, 0.07, 'DO NOT TOUCH', grey, 9, 'DO NOT TOUCH'], [214, 52, 126, -0.03, 'COBOL', beige, 12, 'COBOL'], [312, 40, 78, 0.06, 'WIP', grey, 21, 'WIP'], [398, 56, 106, -0.07, 'V2 FINAL FINAL', beige, 33, 'FINAL2'], [470, 30, 60, 0.05, 'TMP', grey, 41, 'TMP']]
        .map(([x, w, h, tl, lab, tone, seed], i) => ({ x, y: 184 - h, s: slab(w, h, tl, seed, lab.length > 8 ? lab.slice(0, 6) : lab, tone), i }));
      l.lake = layer(0.6); { const { g, M } = l.lake, w = AW + 2 * M, r = rng(15);
        g.drawImage(grad(w, AH - 180, [[0, '#2f4f2a'], [0.12, '#1a3520'], [0.5, '#0b1c14'], [1, '#040a07']], { q: 6 }), -M, 180); R(g, -M, 180, w, 1, '#6a9250');
        for (let y = 183; y < 214; y += 3) { const n = 5 + ((y - 180) >> 2); for (let i = 0; i < n; i++) R(g, -M + r() * w, y + (r() * 2 | 0), 3 + (y - 180) * 0.2 * (0.5 + r()), 1, r() < 0.5 ? '#235030' : '#071410'); }
        for (let i = 0; i < 110; i++) R(g, -M + r() * w, 184 + r() * 32, 2 + (r() * 3 | 0), 1, r() < 0.6 ? '#4a7a2a' : '#789a3a');
        for (const x of [-8, 22, 108, 190, 296, 398, 452]) for (let k = 0; k < 6; k++) { const hx = x + k * 2 - 6, hh = 14 + (r() * 14 | 0); line(g, hx, 216, hx + (r() * 4 - 2), 216 - hh, '#0d2a12'); if (k % 3 === 0) R(g, hx - 1, 216 - hh - 3, 2, 4, '#3a2410'); } }
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M, r = rng(77);
        floorBase(l.floor, { y0: 214, top: '#21170d', mid: '#33261a', bot: '#150f09', fade: '#10170f', line: '#0b0805', line2: '#46341e', lip: '#8a9a3c', lip2: '#0a0805', sp: 34, vp: [240, 120], rows: [-14, -8, -3, 4, 12, 22, 34] });
        speck(g, -M, 216, w, 54, ['#4a3622', '#150d07', '#5a4528'], 340, 6);
        for (let i = 0; i < 70; i++) { const x = -M + r() * w, y = 216 + r() * 50; R(g, x, y, 2 + (r() * 5 | 0), 1 + (r() * 2 | 0), r() < 0.6 ? '#2f5a22' : '#4a7a2c'); }   // moss on the boards
        for (const [x, y] of [[88, 246], [330, 252]]) { R(g, x, y, 22, 8, '#02060a'); R(g, x, y, 22, 1, '#26401f'); pool(g, '#7dd62a', x + 11, y + 3, 24, 8, 0.35); }   // rotten hole, bog glow
        R(g, -M, 207, w, 2, '#0a0705'); R(g, -M, 220, w, 1, '#0a0705'); for (let x = -M + 10; x < AW + M; x += 54) { R(g, x, 202, 3, 32, '#120c07'); R(g, x - 1, 200, 5, 2, '#4a3a22'); }
        R(g, -M, 262, w, 8, '#080604'); }
      l.fg = layer(1.25); { const { g, M } = l.fg, r = rng(5);
        for (const x0 of [-24, 438]) for (let k = 0; k < 9; k++) { const x = x0 + k * 5 + (r() * 4 | 0), hh = 40 + r() * 70; line(g, x, AH, x + (r() * 8 - 4), AH - hh, k % 3 ? '#08180c' : '#102a14', 2); if (k % 4 === 0) R(g, x - 1, AH - hh - 5, 3, 7, '#2a1a0c'); }
        R(g, -M, 0, 30, 18, '#050c08'); R(g, 456, 0, 40, 14, '#050c08'); }
      l.mist = fogTex(480, 70, '#9be86a', 1, 24); l.mist2 = fogTex(480, 56, '#6ab04a', 1, 25);
    },
    paint(g, t, cam, A) {
      const l = A.l, big = pulse(t, 'big', 46), lurch = sin((1 - big) * PI) * big;
      put(g, l.sky, cam);
      at(g, cam, 0.06, () => glow(g, '#bfe86a', 372, 54, 44, 0.1 + 0.04 * sin(t * 0.03), 40));
      put(g, l.far, cam);
      at(g, cam, 0.18, () => { for (let k = 0; k < 8; k++) if (((t >> 4) + k * 3) % 9 < 2) R(g, [-10, 34, 92, 150, 308, 356, 416, 462][k] + 4, 130 + (k * 7) % 20, 1, 1, '#ff3b30'); });
      at(g, cam, 0.35, () => {
        for (const S of l.slabs) {
          const cyc = (t + S.i * 97) % 380, gulp = cyc < 22 ? sin(cyc / 22 * PI) : 0, dy = 0.7 * sin(t * 0.011 + S.i * 1.9) + 2.4 * gulp + 4 * lurch * (0.6 + 0.4 * ((S.i * 7) % 3 / 2));
          g.drawImage(S.s.c, Math.round(S.x - 4), Math.round(S.y + dy));
          S.s.leds.forEach(([lx, ly], j) => { if (((t >> 3) + S.i * 5 + j * 3) % 8 < 3) { R(g, S.x - 4 + lx, S.y + dy + ly, 2, 1, j & 1 ? '#ffb02a' : '#7dff5a'); } });
        }
      });
      put(g, l.lake, cam);
      at(g, cam, 0.35, () => {   // bubbles from the sinking slabs and LED reflections in the water
        for (const S of l.slabs) {
          for (let b = 0; b < 3; b++) { const u = ((t * 0.5 + S.i * 31 + b * 23) % 60) / 60, x = S.x + S.s.w * (0.2 + 0.25 * b) + sin(u * 9 + b) * 2, y = 186 - u * 9; if (u < 0.85) ring(g, x, y, 1 + (u * 2 | 0), 'rgba(180,240,140,0.5)'); else R(g, x - 2, y - 1, 1, 1, '#d8ffb0'); }
          S.s.leds.forEach(([lx], j) => { if (((t >> 3) + S.i * 5 + j * 3) % 8 < 3) R(g, S.x - 4 + lx, 188 + j * 2, 1, 2, 'rgba(160,255,100,0.35)'); });
        }
      });
      at(g, cam, 0.6, () => {   // a rubber duck in the bog, ripples, TODO fireflies
        const dx = 300 + sin(t * 0.007) * 26, dy = 196 + sin(t * 0.05) * 0.8;
        R(g, dx, dy, 8, 4, '#f2c236'); R(g, dx + 5, dy - 3, 4, 4, '#f2c236'); R(g, dx + 9, dy - 1, 2, 1, '#ff8a2a'); R(g, dx + 7, dy - 2, 1, 1, '#111'); R(g, dx - 2, dy + 4, 12, 1, 'rgba(200,255,160,0.3)');
        for (let k = 0; k < 5; k++) { const u = ((t * 0.4 + k * 41) % 90) / 90; ring(g, 120 + k * 70, 200 + (k & 1) * 6, 2 + (u * 7 | 0), 'rgba(150,230,120,' + (0.35 * (1 - u)).toFixed(2) + ')'); }
        const hx = RX.x * 480 - 0;
        for (let k = 0; k < 34; k++) {
          const hx0 = hash1(k * 11 + 3), hy0 = hash1(k * 17 + 8), ph = hash1(k * 5 + 1) * TAU, tag = k % 6 === 0;
          let x = 20 + hx0 * 440 + sin(t * 0.013 + ph) * 14, y = 90 + hy0 * 100 + cos(t * 0.017 + ph * 2) * 8;
          x += (x - hx) * 0.9 * lurch; y -= 18 * lurch;
          const on = 0.55 + 0.45 * sin(t * 0.05 + ph * 3) + lurch * 0.6;
          if (on < 0.3 && !tag) continue;
          glow(g, '#d6ff3a', x, y, tag ? 8 : 5, clamp(on, 0, 1) * 0.5); R(g, x, y, tag ? 2 : 1, tag ? 2 : 1, '#f4ff9a');
          if (tag && on > 0.6) { const s = TAGS[(k / 6 | 0) % TAGS.length]; textC(g, s, x, y - 9, k % 12 ? '#e8ff8a' : '#ffd24a', 1); }
        }
      });
      put(g, l.floor, cam);
      at(g, cam, 1, () => { glow(g, '#7dd62a', 98, 250, 26, 0.3 + 0.1 * sin(t * 0.06), 8); glow(g, '#7dd62a', 340, 256, 26, 0.3 + 0.1 * sin(t * 0.05 + 2), 8); });
    },
    front(g, t, cam, A) {
      const l = A.l;
      fogDraw(g, l.mist, t, 0.2, 190, 0.2, cam.x * 0.4); fogDraw(g, l.mist2, t, -0.12, 214, 0.15, 150 + cam.x * 0.2);
      put(g, l.fg, cam);
      at(g, cam, 1.25, () => {   // hanging cable vines swaying over the corners
        for (const [x0, n] of [[-6, 4], [24, 3], [440, 4], [468, 3]]) for (let k = 0; k < n; k++) { let px = x0 + k * 5, py = 0; for (let s = 1; s <= 16; s++) { const nx = x0 + k * 5 + sin(t * 0.02 + k + s * 0.25) * s * 0.7, ny = s * (5 + k); line(g, px, py, nx, ny, k & 1 ? '#0a1c0e' : '#14301a'); px = nx; py = ny; } R(g, px - 1, py, 3, 2, '#2a3a1a'); }
      });
      motes(g, t, 30, 3, 0, AW, 30, AH, 'rgba(190,255,120,0.5)', 0.25, 1, 6);
    },
  };
  // swamp blues: shuffled E blues scale, wobbling lead, walking bass, brushed backbeat
  add(swamp, { bpm: 84, root: 52, sc: BLU, sw: 0.62, tm: [4.2, 0.22], dv: 0.7,
    l: ['gh', 12, 0.4, ['0...2-.3-...2.0. 4---3-2-0-...... 0..2..3.4-3-2-0. 5-----4-3-2---..', '0...2-.3-...2.0. 4-5-4-3-2-0-.... 7---5-4-3-2-0-.. 4---3---2-----0.']],
    b: ['tri', -12, 0.58, ['0.0.2.3.4.3.2.0. 3.3.5.6.7.6.5.3. 0.0.2.3.4.3.2.0. 4.4.3.3.2.2.1.1.']],
    a: ['pl', 0, 0.2, ['....0...2...0... ....3...5...3... ....0...2...0... ....4...2...0...']],
    d: { k: 'x.....x.x.....x.', s: '....x..g....x..g', h: 'x.x.x.x.x.x.x.x.', t: '..............g.' } }, 0.64);

  // ======================================================================================
  // 2. CACHE MISS CANYON - an echoing red canyon, boulders stamped MISS, a cracked-mud floor laid out as a grid of empty cache cells
  // ======================================================================================
  const shiftPat = (p, n) => { const s = p.replace(/[ |]/g, ''), o = ('.'.repeat(n) + s).slice(0, s.length); return o.replace(/(.{16})/g, '$1 ').trim(); };   // the same melody n sixteenths later = the echo
  function cliff(L, side, seed, wBase, cols, hi, lo) {   // strata cliff wall, painted scanline by scanline so the layers need no clipping
    const { g, M } = L, r = rng(seed);
    for (let y = 0; y < AH; y++) {
      const e = wBase + 26 * sin(y * 0.047 + seed) + 13 * sin(y * 0.131 + seed * 2) + ((hash1((y >> 2) + seed * 9) * 9) | 0) + (y > 196 ? (y - 196) * 0.9 : 0);
      const band = (y + 6 * sin(y * 0.09 + seed)) / 8 | 0, col = cols[(band + (hash1(band + seed) * 3 | 0)) % cols.length], x0 = side < 0 ? -M : AW - e, w = side < 0 ? e + M : e + M;
      R(g, x0, y, w, 1, col);
      const ex = side < 0 ? e - 1 : AW - e; R(g, ex, y, 2, 1, hi); R(g, side < 0 ? e - 5 : AW - e + 2, y, 3, 1, lo);
      if (r() < 0.25) R(g, side < 0 ? -M + r() * (e + M) : AW - e + r() * (e + M), y, 1 + (r() * 3 | 0), 1, r() < 0.5 ? lo : hi);
    }
  }
  function boulder(r, seed, lit) {   // a round rock with a rubber stamp on it, lit from the side that faces the low sun
    const d = r * 2 + 8, { c, g } = cv(d, d), cx = d >> 1, cy = d >> 1, rg = rng(seed);
    disc(g, cx, cy, r, r, '#3a1a1c'); disc(g, cx + lit * 2, cy - 1, r - 2, r - 2, '#7a3a2c'); disc(g, cx + lit * 4, cy - 3, r - 6, r - 6, '#a85a38');
    for (let i = 0; i < 3; i++) { let x = cx - r / 2 + rg() * r, y = cy - r / 2 + rg() * r; for (let s = 0; s < 4; s++) { const nx = x + (rg() - 0.5) * 6, ny = y + 2 + rg() * 3; line(g, x, y, nx, ny, '#2a1015'); x = nx; y = ny; } }
    const bw = 20, bh = 9; R(g, cx - bw / 2, cy - bh / 2, bw, bh, 'rgba(40,12,16,0.5)'); box(g, cx - bw / 2, cy - bh / 2, bw, bh, '#f0d9a8'); textC(g, 'MISS', cx, cy - 2, '#f0d9a8', 1);
    return c;
  }
  const canyon = {
    id: 'cachemiss', name: 'CACHE MISS CANYON', tagline: 'EVERY ECHO IS A MISS', accent: '#ef7b45',
    build(A) {
      const l = A.l;
      l.sky = layer(0.05); { const { g, M } = l.sky, r = rng(3), w = AW + 2 * M;
        fill(l.sky, [[0, '#1d1030'], [0.3, '#4e1f40'], [0.55, '#a5404a'], [0.72, '#ea8148'], [0.85, '#f7c36a'], [1, '#f7c36a']], { q: 6 });
        for (let i = 0; i < 40; i++) R(g, -M + r() * w, r() * 70, 1, 1, '#f0d9c8');
        pool(g, '#ffb45a', 240, 168, 170, 62, 0.55); disc(g, 240, 168, 26, 26, '#ffe6a0'); disc(g, 240, 168, 21, 21, '#fff4cc');
        for (let i = 0; i < 7; i++) { g.globalAlpha = 0.55; R(g, -M + r() * w, 70 + i * 13, 50 + r() * 110, 2, i % 2 ? '#c55a50' : '#7a2a48'); g.globalAlpha = 1; } }
      l.mesa = layer(0.14); { const { g, M } = l.mesa;
        for (const [x, w, h, c] of [[16, 70, 38, '#5a2a44'], [120, 44, 52, '#4d2540'], [200, 96, 30, '#6b3048'], [330, 58, 46, '#4d2540'], [408, 80, 36, '#5a2a44']]) {
          poly(g, [x - 6, 196, x + 2, 196 - h, x + w - 2, 196 - h, x + w + 6, 196], c); R(g, x + 2, 196 - h, w - 4, 1, '#8a4a58');
          for (let y = 196 - h + 7; y < 194; y += 7) R(g, x - 3 + (y - 196 + h) * 0.12, y, w + 6 - (y - 196 + h) * 0.24, 1, '#3a1a34'); }
        g.drawImage(grad(AW + 2 * M, 28, [[0, '#d97848', 0], [1, '#d97848', 0.85]], { L: 6 }), -M, 168); }
      l.cliff2 = layer(0.32); cliff(l.cliff2, -1, 4, 48, ['#4a1c2a', '#5a2430', '#43182a'], '#a0503a', '#2a0e1c'); cliff(l.cliff2, 1, 5, 52, ['#4a1c2a', '#5a2430', '#43182a'], '#a0503a', '#2a0e1c');
      l.cliff = layer(0.55); cliff(l.cliff, -1, 11, 64, ['#8a3a2c', '#a84a32', '#6e2e28', '#c0643c', '#7a3228'], '#f2a45a', '#3a1418'); cliff(l.cliff, 1, 17, 66, ['#8a3a2c', '#a84a32', '#6e2e28', '#c0643c', '#7a3228'], '#f2a45a', '#3a1418');
      { const { g } = l.cliff;   // ledges with boulders, and a sign pointing at the next town
        l.bould = [[58, 150, 11, 1, 3], [440, 168, 13, -1, 4], [24, 206, 15, 1, 5], [474, 214, 14, -1, 6]].map(([x, y, rr, lit, s]) => ({ x, y, rr, c: boulder(rr, s, lit) }));
        for (const [x, y, w] of [[40, 160, 40], [418, 178, 44]]) { R(g, x, y, w, 2, '#f2a45a'); R(g, x, y + 2, w, 2, '#3a1418'); } }
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M, r = rng(21);
        floorBase(l.floor, { y0: 212, top: '#6d3a2a', mid: '#8a4a32', bot: '#4a2420', fade: '#b0603a', line: '#2e1410', line2: '#a35c3a', lip: '#f0a458', lip2: '#1c0a08', sp: 36, vp: [240, 112], rows: [-16, -9, -3, 4, 12, 22, 34] });
        speck(g, -M, 214, w, 56, ['#a35c3a', '#2e1410', '#c9763f'], 300, 8);
        for (let i = 0; i < 22; i++) { let x = -M + r() * w, y = 216 + r() * 46; for (let s = 0; s < 5; s++) { const nx = x + (r() - 0.5) * 12, ny = y + (r() - 0.3) * 6; line(g, x, y, nx, ny, '#2e1410'); x = nx; y = ny; } }   // cracks
        for (const [x, y] of [[44, 222], [212, 218], [388, 222]]) { box(g, x, y, 24, 7, '#7a3a28'); textC(g, 'MISS', x + 12, y + 1, '#8a4630', 1); } }
      l.sign = (() => { const { c, g } = cv(54, 46); R(g, 25, 8, 3, 38, '#4a2a1c'); R(g, 4, 6, 46, 11, '#8a5a34'); box(g, 4, 6, 46, 11, '#3a2014'); textC(g, '404 MILES', 27, 9, '#f6dfb0', 1); R(g, 8, 20, 40, 11, '#8a5a34'); box(g, 8, 20, 40, 11, '#3a2014'); textC(g, 'NEXT TOWN', 28, 23, '#f6dfb0', 1); return c; })();
      l.fg = layer(1.3); { const { g, M } = l.fg;
        poly(g, [-M, 0, 150, 0, 120, 10, 80, 18, 40, 34, 10, 52, -M, 70], '#12060c'); poly(g, [AW + M, 0, 330, 0, 366, 8, 410, 20, 440, 36, 470, 44, AW + M, 60], '#12060c');
        R(g, 118, 8, 2, 1, '#6a2a2a'); R(g, 76, 17, 2, 1, '#6a2a2a');
        for (const [x, s] of [[14, 1], [458, 0.8]]) { const h = 62 * s; R(g, x, AH - h, 5, h, '#0a1a12'); R(g, x - 6, AH - h * 0.7, 3, h * 0.3, '#0a1a12'); R(g, x - 6, AH - h * 0.7 + h * 0.3 - 2, 9, 3, '#0a1a12'); R(g, x + 7, AH - h * 0.5, 3, h * 0.25, '#0a1a12'); R(g, x + 5, AH - h * 0.5 + h * 0.25 - 2, 5, 3, '#0a1a12'); R(g, x + 1, AH - h, 1, h, '#1a3a24'); } }
      l.dust = fogTex(480, 60, '#f0a458', 1, 9, 20);
    },
    paint(g, t, cam, A) {
      const l = A.l, cyc = t % 260, bg = t - RX.big, big = bg >= 0 && bg < 90 ? bg : -1, bx = RX.x * AW;
      put(g, l.sky, cam);
      at(g, cam, 0.05, () => glow(g, '#ffd08a', 240, 160, 150, 0.16 + 0.03 * sin(t * 0.02), 52));
      put(g, l.mesa, cam);
      at(g, cam, 0.14, () => { for (let k = 0; k < 3; k++) { const x = 240 + cos(t * 0.0035 + k * 2.1) * (110 + 34 * k), y = 62 + k * 15 + sin(t * 0.006 + k) * 8, w = sin(t * 0.13 + k * 1.7) * 3.2;
        line(g, x - 7, y - w, x, y, '#14060e'); line(g, x, y, x + 7, y - w, '#14060e'); R(g, x - 1, y, 2, 2, '#14060e'); R(g, x + 1, y + 1, 2, 1, '#e8a43a'); } });
      put(g, l.cliff2, cam);
      at(g, cam, 0.14, () => {   // the echo: rings spread from the canyon mouth and the word MISS comes back fainter every time
        for (let k = 0; k < 3; k++) { const u = (cyc - k * 30) / 130; if (u > 0 && u < 1) ring(g, 240, 150, 8 + u * 190, rgba('#ffe0a8', 0.42 * (1 - u))); }
        for (let i = 0; i < 4; i++) { const a = clamp(1 - abs(cyc - 14 - i * 32) / 34, 0, 1) * (1 - i * 0.22); if (a > 0.05) { const s = i ? 1 : 2, str = i === 3 ? 'MIS' : 'MISS', xx = 240 + (i & 1 ? -1 : 1) * i * 44, yy = 74 - i * 7 + sin(t * 0.2 + i) * 0.6; textC(g, str, xx, yy, rgba('#ffe9b8', a), s); } }
        if (big >= 0) { for (let k = 0; k < 2; k++) { const u = (big - k * 10) / 60; if (u > 0 && u < 1) ring(g, bx, 150, 6 + u * 120, rgba('#fff0c0', 0.6 * (1 - u))); } if (big < 56) textC(g, big < 36 ? 'MISS!' : 'MISS', bx, 96 - big * 0.2, rgba('#fff0c0', 1 - big / 56), 2); } });
      put(g, l.cliff, cam);
      at(g, cam, 0.55, () => {
        for (const b of l.bould) { g.drawImage(b.c, Math.round(b.x - b.c.width / 2), Math.round(b.y - b.c.height / 2 + (big >= 0 ? sin(big * 0.9) * 1.4 * (1 - big / 90) : 0))); }
        g.drawImage(l.sign, 326, 168);
        glow(g, '#ffb45a', AW / 2 + 26 - 60, 160, 60, 0.08, 90); glow(g, '#ffb45a', AW + 20 - 60 + 140, 160, 60, 0.08, 90);
        for (let k = 0; k < 8; k++) { const u = ((t * 0.6 + k * 53) % 150) / 150, side = k & 1, x = side ? 410 + hash1(k * 5) * 60 : 10 + hash1(k * 5) * 60, y0 = 150 + hash1(k) * 30; if (u < 0.9) R(g, x, y0 + u * u * 70, 1, 2, '#d8a070'); }   // a pebble now and then
        if (big >= 0) for (let k = 0; k < 10; k++) { const x = (k & 1 ? 400 : 20) + hash1(k * 7 + 1) * 60, yy = -10 + big * big * 0.06 + hash1(k * 3) * 30; if (yy < 214) { R(g, x, yy, 2 + (k & 1), 2 + (k & 1), '#7a3a2c'); R(g, x, yy - 4, 1, 3, 'rgba(210,150,100,0.4)'); } else if (big < 80) glow(g, '#d8a070', x, 214, 8, 0.4 * (1 - big / 90), 4); }
      });
      put(g, l.floor, cam);
      at(g, cam, 1, () => { glow(g, '#ffc070', 240, 226, 120, 0.1, 14); if (big >= 0 && big < 40) glow(g, '#ffd7a0', bx, 232, 40, 0.3 * (1 - big / 40), 8); });
    },
    front(g, t, cam, A) {
      const l = A.l;
      fogDraw(g, l.dust, t, 0.35, 196, 0.16, cam.x * 0.5); put(g, l.fg, cam);
      motes(g, t, 28, 4, 0, AW, 20, AH, 'rgba(255,190,120,0.45)', 0.35, 1, 8);
      const rv = t - RX.big; if (rv >= 0 && rv < 50) { g.globalAlpha = 0.18 * (1 - rv / 50); g.fillStyle = '#ffd7a0'; g.fillRect(0, 0, AW, 60); g.globalAlpha = 1; }
    },
  };
  // canyon western: spaghetti-western E phrygian dominant, twanging lead and the same lead again, three sixteenths late and quieter: the echo
  const cLead = '4...3.2.1...0... 1.2.3.2.1.0..... 4...4.5.6...5.4. 3...2.1.0.......', cLead2 = '4...3.2.1...0... 1.2.3.4.5.6.7... 4...4.5.6...5.4. 5.4.3.2.1.0.....';
  add(canyon, { bpm: 104, root: 52, sc: PHD, sw: 0.5, dv: 0.8,
    l: ['tw', 12, 0.36, [cLead, cLead2]],
    a: ['tw', 12, 0.14, [shiftPat(cLead, 3), shiftPat(cLead2, 3)]],
    b: ['saw', -12, 0.34, ['0...0...0...0... 0...0...0...0... 3...3...3...3... 4...4...0...0...']],
    d: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: '..x...x...x...x.', t: '..............g.' } }, 1.45);

  // ======================================================================================
  // 3. OPEN-PLAN OFFICE - skyline wall, cubicles with glowing monitors, standing desks, a foosball table; the coworkers react to big hits
  // ======================================================================================
  const WORKERS = [[34, '#e0b48a', '#2a1a12', '#c25a5a'], [96, '#8a5a3a', '#0e0a0a', '#4a8ac2'], [158, '#f2d2b0', '#d8a23a', '#5ac28a'], [222, '#c28a5a', '#3a2a1a', '#a25ac2'], [284, '#e8c09a', '#8a3a1a', '#c2a25a'], [346, '#7a4a2a', '#14100e', '#5ac2c2'], [408, '#f0cca8', '#5a5a6a', '#c25a8a'], [462, '#a8724a', '#2a1a12', '#8ac25a']];
  const FOOS = [[0, 0], [1, 1]];
  const office = {
    id: 'openplan', name: 'OPEN-PLAN OFFICE', tagline: 'NO WALLS. NO MERCY.', accent: '#5ed0d8',
    build(A) {
      const l = A.l;
      l.wall = layer(0.08); { const { g, M } = l.wall, w = AW + 2 * M, r = rng(61);
        fill(l.wall, [[0, '#0b1020'], [0.2, '#14213a'], [0.55, '#1c2c46'], [1, '#202c3a']], { q: 6 });
        const sk = grad(w, 120, [[0, '#0a0e22'], [0.6, '#1c2a52'], [1, '#3a3a6a']], { q: 6 }); g.drawImage(sk, -M, 20);
        for (let i = 0; i < 40; i++) R(g, -M + r() * w, 22 + r() * 40, 1, 1, '#9aa8d8'); disc(g, 390, 52, 9, 9, '#e6ecff'); disc(g, 387, 49, 8, 8, '#0a0e22'); disc(g, 391, 51, 7, 7, '#dfe6ff');
        for (let x = -M; x < AW + M; x += 14 + (r() * 12 | 0)) { const bw = 12 + (r() * 14 | 0), bh = 22 + (r() * 54 | 0); R(g, x, 140 - bh, bw, bh, '#0c1226'); for (let yy = 140 - bh + 3; yy < 138; yy += 4) for (let xx = x + 2; xx < x + bw - 2; xx += 3) if (r() < 0.35) R(g, xx, yy, 1, 2, r() < 0.7 ? '#e8c860' : '#7ac8e8'); }
        R(g, -M, 140, w, 66, '#1a2638'); R(g, -M, 140, w, 1, '#3a4a64'); R(g, -M, 204, w, 3, '#0e1626');
        for (let x = -M + 20; x < AW + M; x += 120) { R(g, x, 18, 3, 124, '#0e1626'); R(g, x + 1, 18, 1, 124, '#2a3a54'); } R(g, -M, 18, w, 3, '#0e1626'); R(g, -M, 138, w, 3, '#0e1626');
        R(g, -M, 0, w, 18, '#0d1422'); R(g, -M, 17, w, 1, '#3a4a64'); }
      l.panels = layer(0.12); { const { g, M } = l.panels; for (let x = -M + 10; x < AW + M; x += 70) { R(g, x, 4, 56, 7, '#cfe6f0'); R(g, x + 1, 5, 54, 5, '#f4fbff'); R(g, x, 11, 56, 1, '#4a6a7a'); } }
      l.desks = layer(0.42); { const { g, M } = l.desks, r = rng(8);
        for (const [x] of WORKERS) { const sx = x - 24;   // a cubicle: partition, desk top, monitor with code, mug, keyboard
          R(g, sx, 160, 54, 46, '#3a4c5c'); R(g, sx, 160, 54, 2, '#6a8294'); R(g, sx, 204, 54, 2, '#1c2834'); R(g, sx + 52, 162, 2, 44, '#2a3a48'); for (let y = 170; y < 200; y += 6) R(g, sx + 1, y, 52, 1, '#34465a');
          R(g, sx + 12, 168, 30, 20, '#0a1018'); box(g, sx + 12, 168, 30, 20, '#7a8a9a'); R(g, sx + 13, 169, 28, 18, '#0d2a2e');
          for (let i = 0; i < 6; i++) { const lw = 4 + (r() * 14 | 0); R(g, sx + 15 + (i % 3) * 3, 171 + i * 2.6, lw, 1, i % 3 === 1 ? '#7adf9a' : i % 3 === 2 ? '#e8c860' : '#6ac8e8'); }
          R(g, sx + 25, 188, 5, 4, '#2a3440'); R(g, sx + 18, 192, 20, 2, '#28323c'); R(g, sx + 4, 188, 4, 5, '#e8e8e0'); R(g, sx + 8, 189, 1, 3, '#e8e8e0'); R(g, sx + 4, 187, 4, 1, '#6a4a2a'); }
        R(g, -M, 205, AW + 2 * M, 1, '#0a1420'); }
      l.board = (() => { const { c, g } = cv(86, 58); R(g, 0, 0, 86, 58, '#6a7a88'); R(g, 2, 2, 82, 54, '#eef2f0'); textC(g, 'SPRINT 42', 43, 5, '#c0392b', 1);
        for (const [x, n] of [[5, 'TODO'], [32, 'DOING'], [60, 'DONE']]) { text(g, n, x, 14, '#2a3a4a', 1); R(g, x - 1, 21, 22, 1, '#9aa8b0'); }
        const cols = ['#f2d24a', '#f29a4a', '#7ac8f2', '#9ae27a', '#f27aa8']; for (let i = 0; i < 9; i++) R(g, 5 + ((i % 3) * 27) + (i % 2) * 2, 24 + (i / 3 | 0) * 9, 7, 7, cols[i % 5]);
        R(g, 6, 50, 72, 1, '#2a3a4a'); line(g, 8, 44, 76, 51, '#c0392b'); text(g, 'BURNDOWN', 5, 47, '#7a8a94', 1); return c; })();
      l.pod = (() => { const { c, g } = cv(44, 62); R(g, 0, 0, 44, 62, '#1a2634'); box(g, 0, 0, 44, 62, '#7a96aa'); R(g, 3, 3, 38, 44, '#16384a'); R(g, 3, 3, 38, 2, '#4ac8d8'); textC(g, 'FOCUS ROOM', 22, 50, '#e8f4f8', 1); textC(g, '(BOOKED)', 22, 56, '#e85a4a', 1); R(g, 17, 18, 10, 12, '#2a5a6a'); disc(g, 22, 15, 4, 4, '#c8a888'); return c; })();
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M, r = rng(37);
        floorBase(l.floor, { y0: 206, top: '#2a3744', mid: '#3a4c5c', bot: '#1c2630', fade: '#243240', line: '#141c26', line2: '#4a5e70', lip: '#7aa0b8', lip2: '#0c1218', sp: 30, vp: [240, 100], rows: [-20, -12, -5, 2, 10, 20, 32] });
        speck(g, -M, 208, w, 62, ['#46586a', '#202c38', '#52687a'], 280, 4);
        R(g, 160, 226, 70, 18, 'rgba(180,70,70,0.22)'); R(g, 164, 230, 62, 10, 'rgba(0,0,0,0.12)'); }
      l.fg = layer(1.28); { const { g, M } = l.fg;
        R(g, 14, 240, 28, 30, '#8a4a2a'); R(g, 12, 238, 32, 4, '#a85a32'); R(g, 14, 252, 28, 1, '#6a3a1c');
        for (let i = 0; i < 9; i++) { const a = -1.5 + i * 0.4, len = 24 + (i % 3) * 8; fpoly(g, [28, 238, 28 + sin(a) * len - 3, 238 - cos(a) * len, 28 + sin(a) * len + 3, 238 - cos(a) * len + 2], i % 2 ? '#1f6a3a' : '#2b8a4a'); }
        for (let x = 330; x < 470; x += 22) { line(g, x, 0, x, 10, '#1a2634'); R(g, x - 10, 10, 20, 4, '#cfe6f0'); } }
      l.light = fogTex(480, 40, '#cfe6f0', 0.5, 12, 24);
    },
    paint(g, t, cam, A) {
      const l = A.l, ko = t - RX.ko, koUp = ko >= 0 && ko < 400 ? clamp(ko / 24, 0, 1) : 0, bigA = pulse(t, 'big', 80), hitA = pulse(t, 'hit', 26), cx = RX.x * AW;
      put(g, l.wall, cam); put(g, l.panels, cam);
      at(g, cam, 0.12, () => { for (const k of [2, 5]) if (((t >> 3) + k * 7) % 41 < 3) { g.globalAlpha = 0.6; R(g, 10 + k * 70, 4, 56, 7, '#1a2634'); g.globalAlpha = 1; } });   // one flickering tube
      at(g, cam, 0.08, () => { g.drawImage(l.board, 198, 54); g.drawImage(l.pod, 30, 74); glow(g, '#e8f4f8', 240, 70, 80, 0.06, 40);
        if ((t >> 5) & 1) R(g, 60, 76, 3, 3, '#ff4a3a'); else R(g, 60, 76, 3, 3, '#6a1a14');
        const sx = 380; R(g, sx, 80, 22, 40, '#cfd6da'); R(g, sx, 80, 22, 4, '#9aa6ac'); R(g, sx + 4, 90, 14, 10, '#1a2228'); R(g, sx + 6, 104, 10, 12, '#2a3238'); R(g, sx + 8, 100, 6, 4, ((t >> 4) & 3) ? '#4a8a5a' : '#d84a3a');   // the coffee machine
        for (let k = 0; k < 3; k++) { const u = ((t * 0.8 + k * 21) % 60) / 60; R(g, sx + 10 + sin(u * 6 + k) * 2, 76 - u * 16, 1, 2, rgba('#e8f0f4', 0.5 * (1 - u))); } });
      // coworkers sit behind the cubicle walls: heads bob while typing, pop up cheering on a big hit and all stand when somebody is knocked out
      at(g, cam, 0.42, () => {
        WORKERS.forEach(([x, skin, hair, shirt], i) => {
          const near = abs(x - cx) < 70 ? hitA * 0.45 : 0, up = clamp(Math.max(bigA * (0.55 + 0.45 * hash1(i * 5 + RX.big | 0)), near, koUp), 0, 1), bob = ((t >> 3) + i * 3) % 7 < 2 ? 1 : 0;
          const hy = 151 - up * 17 + bob - (i % 3 === 1 ? 2 : 0);
          if (up > 0.15) { R(g, x - 9, hy + 10, 18, 22, shirt); R(g, x - 10, hy + 14 - up * 6, 3, 8, shirt); R(g, x + 8, hy + 14 - up * 6, 3, 8, shirt); R(g, x - 10, hy + 10 - up * 6, 3, 3, skin); R(g, x + 8, hy + 10 - up * 6, 3, 3, skin); }
          disc(g, x, hy + 5, 6, 6, skin); R(g, x - 6, hy - 1, 12, 4, hair); R(g, x - 7, hy + 2, 2, 5, hair);
          if (up > 0.15) { R(g, x - 3, hy + 5, 1, 2, '#1a1a1a'); R(g, x + 2, hy + 5, 1, 2, '#1a1a1a'); R(g, x - 2, hy + 9, 4, 1, up > 0.6 ? '#7a1a1a' : '#6a3a2a'); }
          if (up > 0.5) { const s = koUp > 0.5 ? 'GG' : (i + (RX.big | 0)) % 3 === 0 ? 'OOF' : (i % 2 ? '?!' : '!'), bw = tw(s, 1) + 4; R(g, x + 4, hy - 13, bw, 9, '#f4f4ec'); R(g, x + 4, hy - 4, 2, 2, '#f4f4ec'); text(g, s, x + 6, hy - 11, '#1a1a1a', 1); }
        });
      });
      put(g, l.desks, cam);
      at(g, cam, 0.42, () => {   // monitor glow, a blinking cursor on one of them, and the standing desks that nobody uses properly
        for (let i = 0; i < WORKERS.length; i++) { const x = WORKERS[i][0] - 24; glow(g, '#6ae8d0', x + 27, 178, 20, 0.06 + 0.02 * sin(t * 0.05 + i), 14); if (((t >> 4) + i) & 1) R(g, x + 30, 184, 3, 1, '#e8f4f8'); }
        for (const [i, ph] of [[1, 0], [4, 2.1]]) { const x = WORKERS[i][0], d = (sin(t * 0.012 + ph) * 0.5 + 0.5), y = 196 - d * 14; R(g, x - 14, y, 28, 3, '#b8a888'); R(g, x - 12, y + 3, 2, 207 - y - 3, '#2a3440'); R(g, x + 10, y + 3, 2, 207 - y - 3, '#2a3440'); R(g, x - 9, y - 15, 18, 14, '#0a1018'); box(g, x - 9, y - 15, 18, 14, '#7a8a9a'); R(g, x - 8, y - 14, 16, 12, '#10343a'); for (let k = 0; k < 4; k++) R(g, x - 6, y - 12 + k * 2.6, 6 + k * 2, 1, k & 1 ? '#7adf9a' : '#6ac8e8'); }
      });
      at(g, cam, 0.7, () => {   // the foosball table: rods slide, the ball jitters between the little players
        const fx = 120, fy = 198; R(g, fx - 2, fy + 5, 2, 15, '#2a1a12'); R(g, fx + 44, fy + 5, 2, 15, '#2a1a12'); R(g, fx - 4, fy, 54, 7, '#6a3a1c'); R(g, fx - 2, fy - 3, 50, 4, '#2e7a3a'); R(g, fx - 2, fy - 4, 50, 1, '#4aa85a');
        for (let k = 0; k < 4; k++) { const rx = fx + 6 + k * 11, sl = Math.round(sin(t * 0.07 + k * 1.9) * 3); R(g, rx, fy - 10, 1, 9, '#aab4bc'); R(g, rx - 1, fy - 12 + (sl & 1), 3, 4, k & 1 ? '#e84a4a' : '#4a7ae8'); R(g, rx, fy - 17 - sl, 1, 6, '#aab4bc'); R(g, rx - 1, fy - 19 - sl, 3, 3, '#3a2a1a'); }
        const bx = fx + 22 + sin(t * 0.11) * 18, by = fy - 2; R(g, bx, by, 2, 2, '#f4f4ec'); });
      put(g, l.floor, cam);
      at(g, cam, 1, () => {   // robot vacuum on its rounds, and a faint reflection of the light panels on the carpet
        const u = ((t * 0.55) % 760) / 760, vx = -20 + u * 520, vy = 252 + sin(u * 20) * 1.5; disc(g, vx, vy, 8, 3, '#1a222a'); disc(g, vx, vy - 1, 7, 2, '#3a4652'); R(g, vx - 1, vy - 2, 3, 1, ((t >> 3) & 1) ? '#5ae88a' : '#1a5a2a'); R(g, vx + 7, vy, 2, 1, '#8a6a3a'); });
    },
    front(g, t, cam, A) {
      put(g, A.l.fg, cam); fogDraw(g, A.l.light, t, 0.1, 6, 0.1, cam.x * 0.1);
    },
  };
  // office bossa muzak: D dorian, rim-click clave, soft e-piano stabs on a Dm-G-C-F vamp, a mellow triangle melody, brushed hats
  add(office, { bpm: 132, root: 50, sc: DOR, sw: 0.1, tm: [5.1, 0.12], dv: 0.5,
    l: ['tri', 12, 0.34, ['4...2.4.7...5.4. 5...3.5.7...5.3. 6...4.6.9...7.6. 5...4.2.0...2...', '4...2.4.7...9.7. 5...3.5.7.9.7.5. 6...4.6.9.7.6.4. 3...2.3.4.......']],
    a: ['bell', 0, 0.28, ['0..0..0...0..0.. 3..3..3...3..3.. 6..6..6...6..6.. 2..2..2...2..2..'], 1],
    b: ['tri', -12, 0.5, ['0.....4...0...4. 3.....7...3...7. 6.....3...6...3. 2.....6...2...6.']],
    d: { k: 'x..x..x...x..x..', s: 'g..g..g...g.g...', h: 'x.x.x.x.x.x.x.x.' } }, 0.76);

  // ======================================================================================
  // 4. CLOUD BILLING VOLCANO - lava that comes as invoices, a pylon with a cost counter that only goes up
  // ======================================================================================
  const DOLLAR = ['00100', '01111', '10100', '01110', '00101', '11110', '00100'];   // the pixel font has no currency sign
  const dollar = (g, x, y, c) => { g.fillStyle = c; for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (DOLLAR[j][i] === '1') g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1); };
  const LINES = ['COMPUTE 1024.50', 'STORAGE 88.20', 'EGRESS 9999.99', 'IDLE VM 420.00', 'LOGS 13.37', 'SUPPORT TIER 5', 'TOTAL DUE', 'TAX 21.00', 'OVERAGE 77.70', 'GPU HOURS 4096.00'];
  const grp = n => String(Math.floor(n) % 1e8).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const billing = {
    id: 'billing', name: 'CLOUD BILLING VOLCANO', tagline: 'THE COST KEEPS RISING', accent: '#e8344a',
    build(A) {
      const l = A.l;
      l.sky = layer(0.05); { const { g, M } = l.sky, r = rng(41), w = AW + 2 * M;
        fill(l.sky, [[0, '#0c050c'], [0.28, '#2a0a1e'], [0.58, '#6a1626'], [0.8, '#b8362a'], [1, '#e8642a']], { q: 6 });
        for (let i = 0; i < 30; i++) { const x = -M + r() * w, y = 6 + r() * 70, rr = 14 + r() * 26; disc(g, x, y, rr, rr * 0.5, '#170711'); disc(g, x - 2, y - 2, rr * 0.8, rr * 0.36, '#2a0e1c'); disc(g, x, y + rr * 0.28, rr * 0.7, rr * 0.16, '#5a1a2a'); } }
      l.vol = layer(0.16); { const { g } = l.vol, r = rng(5), Lp = [], Rp = []; l.riv = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; Lp.push([30 + u * 178, 198 - 102 * u * u + (r() - 0.5) * 4]); Rp.push([450 - u * 178, 198 - 102 * u * u + (r() - 0.5) * 4]); }
        const p = []; for (const [x, y] of Lp) p.push(x, y); p.push(214, 102, 226, 99, 254, 99, 266, 102); for (let i = Rp.length - 1; i >= 0; i--) p.push(Rp[i][0], Rp[i][1]);
        poly(g, p, '#1c0b16'); poly(g, [240, 99, 266, 102, ...Rp.flatMap(q => q).reverse().reduce((a, v, i, s) => (i % 2 ? a : a.concat(s[i + 1], v)), []), 240, 198], '#12060e');
        for (let i = 1; i < Lp.length; i++) line(g, Lp[i - 1][0], Lp[i - 1][1], Lp[i][0], Lp[i][1], '#7a2a30');
        R(g, 213, 98, 54, 2, '#ff8a2a'); R(g, 218, 97, 44, 1, '#ffd05a');
        for (const [sx, sy, dir] of [[226, 101, -0.55], [248, 101, 0.5], [238, 102, 0.05], [220, 100, -1.1]]) { let x = sx, y = sy; const pts = [[x, y]]; for (let k = 0; k < 16; k++) { x += dir * 3 + (r() - 0.5) * 3; y += 4.5 + r() * 2; pts.push([x, y]); } l.riv.push(pts);
          for (let k = 1; k < pts.length; k++) { line(g, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], '#c0381a', 2); line(g, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], '#ffb040'); } } }
      l.lava = layer(0.5); { const { g, M } = l.lava, w = AW + 2 * M, r = rng(19);
        g.drawImage(grad(w, 30, [[0, '#ffd05a'], [0.3, '#ff8a2a'], [1, '#b8281a']], { q: 6 }), -M, 186); R(g, -M, 185, w, 1, '#3a0e14');
        for (let i = 0; i < 70; i++) R(g, -M + r() * w, 188 + r() * 26, 2 + (r() * 6 | 0), 1, r() < 0.5 ? '#7a1a14' : '#ffe08a'); }
      l.pylon = (() => { const { c, g } = cv(66, 78); poly(g, [8, 78, 14, 20, 52, 20, 58, 78], '#0d060d'); poly(g, [14, 20, 20, 6, 46, 6, 52, 20], '#1c0b16'); R(g, 14, 20, 38, 1, '#ff7a2a'); R(g, 8, 77, 50, 1, '#ff7a2a'); R(g, 10, 26, 46, 30, '#06030a'); box(g, 10, 26, 46, 30, '#ff7a2a'); R(g, 28, 56, 10, 22, '#1c0b16'); return c; })();
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M, r = rng(53);
        floorBase(l.floor, { y0: 212, top: '#241228', mid: '#321a36', bot: '#14091a', fade: '#3a1426', line: '#a8341a', line2: '#1a0a1e', lip: '#ff9a3a', lip2: '#0c0510', sp: 34, vp: [240, 112], rows: [-14, -8, -2, 5, 13, 23, 35] });
        speck(g, -M, 214, w, 56, ['#3e2444', '#10060e', '#4a2a50'], 260, 3);
        for (let i = 0; i < 20; i++) { let x = -M + r() * w, y = 216 + r() * 44; for (let s = 0; s < 6; s++) { const nx = x + (r() - 0.5) * 14, ny = y + (r() - 0.35) * 6; line(g, x, y, nx, ny, '#7a2a14'); R(g, nx, ny, 1, 1, '#ff7a2a'); x = nx; y = ny; } } }
      l.fg = layer(1.3); { const { g } = l.fg;
        poly(g, [-30, AH, -30, 214, 4, 240, 18, 224, 30, 250, 52, AH], '#06030a'); poly(g, [AW + 30, AH, AW + 30, 222, 470, 244, 452, 230, 440, 256, 418, AH], '#06030a');
        line(g, 4, 240, 18, 224, '#c0381a'); line(g, 18, 224, 30, 250, '#7a2a14'); line(g, 470, 244, 452, 230, '#c0381a'); line(g, 452, 230, 440, 256, '#7a2a14'); }
      l.haze = fogTex(480, 56, '#ff6a2a', 1, 33, 20);
    },
    paint(g, t, cam, A) {
      const l = A.l, bg = t - RX.big, big = bg >= 0 && bg < 70 ? bg : -1, bx = clamp(RX.x * AW, 40, AW - 40), kod = t - RX.ko, ko = kod >= 0 && kod < 600, L = lightning(t, 330, 70);
      put(g, l.sky, cam);
      if (L.v > 0.02) { g.globalAlpha = L.v * 0.3; g.fillStyle = '#ffb48a'; g.fillRect(0, 0, AW, 150); g.globalAlpha = 1; at(g, cam, 0.05, () => bolt(g, 60 + hash1(L.c * 3) * 360, 10, 120 + hash1(L.c * 7) * 240, 150, L.c * 13 + 1, rgba('#ffe9c0', L.v), rgba('#ff9a5a', L.v * 0.5))); }
      put(g, l.vol, cam);
      at(g, cam, 0.16, () => {   // the plume rises out of the crater and cools to ash; lava glints crawl down the flanks
        for (let k = 0; k < 13; k++) { const u = ((t * 0.28 + k * 15) % 195) / 195, x = 240 + sin(k * 2 + u * 3) * (6 + u * 46), y = 96 - u * 82, r2 = 4 + u * 15; disc(g, x, y, r2, r2 * 0.8, mix('#ff8a2a', '#2a1624', clamp(u * 1.6, 0, 1))); }
        glow(g, '#ff7a2a', 240, 98, 70, 0.28 + 0.06 * sin(t * 0.07), 34);
        l.riv.forEach((pts, k) => { const u = ((t * 0.012 + k * 0.27) % 1) * (pts.length - 1), a = pts[u | 0], b = pts[Math.min(pts.length - 1, (u | 0) + 1)]; R(g, a[0] + (b[0] - a[0]) * (u % 1), a[1] + (b[1] - a[1]) * (u % 1), 2, 2, '#fff0b0'); });
      });
      put(g, l.lava, cam);
      at(g, cam, 0.5, () => {   // invoice lava: lines of charges crawl across the lava, burning invoices float up from it
        for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) { const idx = (k * 3 + r * 5) % LINES.length, s = LINES[idx], x = ((k * 128 - t * (0.18 + r * 0.05)) % 900 + 900) % 900 - 130; if (x > -90 && x < AW + 70) text(g, s, x, 190 + r * 5, r === 2 ? '#8a1a14' : '#d0481a', 1); }
        for (let k = 0; k < 4; k++) { const u = ((t * 0.3 + k * 31) % 130) / 130, x = 40 + k * 120 + sin(u * 7 + k) * 12, y = 200 - u * 70; if (u > 0.95) continue; g.globalAlpha = 1 - u * u; R(g, x, y, 9, 12, '#f6ecd0'); for (let j = 0; j < 4; j++) R(g, x + 1, y + 3 + j * 2, 6 - (j & 1) * 2, 1, '#a89a78'); R(g, x, y, 9, 2, '#2a1a14'); for (let j = 0; j < 4; j++) R(g, x + j * 2.4, y - 1 - ((t + k + j * 3) >> 2 & 1), 2, 2, j & 1 ? '#ffd05a' : '#ff5a1a'); g.globalAlpha = 1; }
        const rise = ko ? Math.min(6, kod * 0.2) : 0; if (rise) glow(g, '#ff7a2a', 240, 200 - rise, 200, 0.22, 20);
        if (big >= 0) { const u = big / 70, hh = 130 * sin(Math.min(1, u * 1.35) * PI * 0.62); for (let k = 0; k < 44; k++) { const kk = k / 43, px = bx + sin(k * 1.7 + big * 0.2) * (3 + kk * 14 * (1 + u)) + (k & 1 ? 1 : -1) * kk * u * 12, py = 212 - kk * hh + kk * kk * u * 34, s = 4 - kk * 3; if (py < 212) { R(g, px, py, s + 1, s + 1, mix('#fff0b0', '#ff3a1a', kk)); } } glow(g, '#ffb040', bx, 200, 46, 0.5 * (1 - u), 40); }
      });
      at(g, cam, 0.5, () => {   // the pylon: an ACCRUED display whose number never goes down
        const px = 396, py = 106, dt = t - RX.t0 > 0 && t - RX.t0 < 1e6 ? t - RX.t0 : t % 6000, v = 4200 + dt * 9 + dt * dt * 0.012 + RX.cost, fl = big >= 0 && big < 40 ? ((big >> 2) & 1 ? '#ffffff' : '#ff3a3a') : '#ffd05a';
        g.drawImage(l.pylon, px, py); glow(g, '#ff7a2a', px + 33, py + 41, 38, 0.2 + 0.05 * sin(t * 0.1), 26);
        textC(g, ko ? 'OVERDUE' : 'ACCRUED', px + 33, py + 29, ko ? '#ff3a3a' : '#ff9a3a', 1); const s = grp(v); dollar(g, px + 33 - (tw(s, 1) + 6) / 2, py + 37, fl); text(g, s, px + 33 - (tw(s, 1) + 6) / 2 + 6, py + 39, fl, 1);
        R(g, px + 12, py + 50, 42 * clamp((dt * 0.0016) % 1, 0, 1), 2, '#c0381a');
      });
      put(g, l.floor, cam);
      at(g, cam, 1, () => { glow(g, '#ff6a2a', 240, 214, 200, 0.14 + 0.03 * sin(t * 0.05), 10); if (big >= 0 && big < 30) glow(g, '#ffb040', bx, 232, 44, 0.3 * (1 - big / 30), 8); });
    },
    front(g, t, cam, A) {
      const l = A.l; fogDraw(g, l.haze, t, 0.3, 176, 0.14, cam.x * 0.5); put(g, l.fg, cam);
      motes(g, t, 36, 5, 0, AW, 20, AH, 'rgba(255,150,60,0.8)', 0.7, 1, 6); motes(g, t, 14, 9, 0, AW, 60, AH, 'rgba(255,230,140,0.9)', 1.1, 1, 4);
    },
  };
  // volcano metal: E harmonic minor at 172 bpm, galloping low saw, double-kick, shrieking square lead
  add(billing, { bpm: 172, root: 40, sc: HMIN, fill: 1, dv: 1.0,
    l: ['sq2', 24, 0.28, ['0.0.0.3.0.5.4.3. 0.0.0.3.0.6.5.4. 5.5.5.7.5.9.8.7. 4.4.4.6.4.7.6.5.', '0.0.0.3.0.5.4.3. 0.0.0.3.0.6.5.4. 5.5.5.7.5.9.8.7. 7.9.b.d.e.d.b.9.']],
    a: ['saw2', 12, 0.2, ['0--------------- 0--------------- 5--------------- 4---------------'], 1],
    b: ['saw', 0, 0.4, ['0.00.00.0.00.00. 0.00.00.0.00.00. 5.55.55.5.55.55. 4.44.44.4.44.44.']],
    d: { k: 'xx.xx.xxxx.xx.xx', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', t: '..............g.' } }, 0.82);

  // ======================================================================================
  // 5. NIGHTLY BUILD EXPRESS - the roof of a night train: everything but the roof rushes past, tunnels flash by, wires arc on big hits
  // ======================================================================================
  const SIGNS = ['BUILD OK', 'TESTS FLAKY', 'DEPLOY AHEAD', 'MERGE LANE', 'LGTM STATION', 'RETRY 3 OF 3', 'CI JUNCTION', 'HOTFIX 4 KM'];
  function strip(w, h, fn) { const { c, g } = cv(w, h); fn(g, w, h); return c; }
  function scroll(g, tile, x0, y, pad) { const w = tile.width; let x = -((x0 % w) + w) % w - (pad || 0); for (; x < AW + (pad || 0) + 4; x += w) g.drawImage(tile, Math.round(x), y); }
  const train = {
    id: 'nightlytrain', name: 'NIGHTLY BUILD EXPRESS', tagline: 'DEPLOYING AT 3 A.M.', accent: '#4fa3ff',
    build(A) {
      const l = A.l, W = 640;
      l.sky = layer(0.03); { const { g, M } = l.sky, r = rng(71), w = AW + 2 * M;
        fill(l.sky, [[0, '#03061a'], [0.45, '#0c1840'], [0.8, '#26306a'], [1, '#4a4a86']], { q: 6 });
        for (let i = 0; i < 90; i++) R(g, -M + r() * w, r() * 130, 1, 1, r() < 0.3 ? '#ffffff' : '#7a86c0');
        pool(g, '#9ab4ff', 96, 52, 56, 56, 0.25); disc(g, 96, 52, 16, 16, '#eef2ff'); disc(g, 91, 48, 3, 3, '#c8d0ee'); disc(g, 102, 57, 4, 3, '#c8d0ee'); }
      l.hills = strip(W, 90, (g, w, h) => { poly(g, [0, h, ...Array.from({ length: 33 }, (_, i) => [i * 20, 52 - 18 * sin(i * 20 / w * TAU * 2 + 1) - 9 * sin(i * 20 / w * TAU * 5)]).flat(), w, h], '#12183a'); R(g, 0, 70, w, 20, '#0e1330'); });
      l.city = strip(W, 80, (g, w, h) => { const r = rng(3); for (let x = 0; x < w; x += 8 + (r() * 12 | 0)) { const bw = 10 + (r() * 14 | 0), bh = 16 + (r() * 52 | 0); for (const dx of [0, -w]) { R(g, x + dx, h - bh, bw, bh, '#0a1028'); for (let y = h - bh + 3; y < h - 3; y += 4) for (let xx = x + dx + 2; xx < x + dx + bw - 2; xx += 3) if (r() < 0.3) R(g, xx, y, 1, 2, r() < 0.7 ? '#f0d070' : '#70c8f0'); } } });
      l.cars = strip(72, 26, (g, w, h) => { R(g, 0, 2, 70, 22, '#2a3350'); R(g, 0, 2, 70, 2, '#5a6a98'); R(g, 0, 22, 70, 2, '#12182a'); R(g, 70, 8, 2, 12, '#12182a'); for (let i = 0; i < 4; i++) { R(g, 5 + i * 16, 8, 11, 8, '#ffd86a'); R(g, 5 + i * 16, 8, 11, 1, '#fff2b0'); } });
      l.poles = strip(480, 96, (g, w, h) => { for (const x of [60, 230, 380]) { R(g, x, 6, 3, 90, '#080c1e'); R(g, x - 10, 10, 23, 2, '#080c1e'); R(g, x - 8, 6, 2, 5, '#080c1e'); R(g, x + 9, 6, 2, 5, '#080c1e'); } for (let x = 20; x < w; x += 80) { disc(g, x, 80, 9, 12, '#06091a'); R(g, x - 1, 88, 3, 8, '#06091a'); } });
      l.signs = strip(960, 60, (g, w, h) => { SIGNS.slice(0, 4).forEach((s, i) => { const x = 40 + i * 240, bw = tw(s, 1) + 10; R(g, x + bw / 2 - 1, 16, 3, 44, '#0a0e22'); R(g, x, 4, bw, 14, '#16234c'); box(g, x, 4, bw, 14, '#4a7ae0'); textC(g, s, x + bw / 2, 9, '#e8f0ff', 1); }); });
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M, r = rng(23);
        floorBase(l.floor, { y0: 206, top: '#2c3646', mid: '#3e4a5e', bot: '#1a2230', fade: '#222c3c', line: '#10161f', line2: '#566a86', lip: '#8ab4e8', lip2: '#0a0e16', sp: 30, vp: [240, 100], rows: [-20, -12, -5, 2, 10, 20, 32] });
        speck(g, -M, 208, w, 62, ['#4a5a74', '#1a2230', '#5a6e8a'], 240, 3);
        for (let x = -M + 6; x < AW + M; x += 11) { R(g, x, 209, 1, 60, 'rgba(8,12,20,0.35)'); R(g, x + 1, 209, 1, 60, 'rgba(120,150,190,0.12)'); }   // the corrugated roof
        for (const x of [70, 330]) { R(g, x, 224, 38, 14, '#222c3c'); box(g, x, 224, 38, 14, '#5a6e8a'); for (let k = 0; k < 5; k++) R(g, x + 4 + k * 7, 227, 4, 8, '#10161f'); }
        R(g, -M, 200, w, 2, '#8ab4e8'); R(g, -M, 203, w, 1, '#10161f'); for (let x = -M + 12; x < AW + M; x += 40) { R(g, x, 198, 2, 12, '#6a82a6'); } }
      l.fg = layer(1.25); { const { g } = l.fg; R(g, -30, 0, 70, 6, '#04060e'); R(g, 420, 0, 90, 6, '#04060e'); }
    },
    paint(g, t, cam, A) {
      const l = A.l, tp = t % 1100, tun = tp > 760 && tp < 900 ? tp - 760 : -1, dark = tun < 0 ? 0 : tun < 14 ? tun / 14 : tun > 126 ? (140 - tun) / 14 : 1, bg = t - RX.big, big = bg >= 0 && bg < 40 ? bg : -1, bx = clamp(RX.x * AW, 30, AW - 30);
      put(g, l.sky, cam);
      at(g, cam, 0.1, () => scroll(g, l.hills, t * 0.18, 96, 40));
      at(g, cam, 0.2, () => scroll(g, l.city, t * 0.5, 98, 40));
      const ps = ((t * 7) % 400) - 40;
      if (tp > 130 && tp < 270) { const u = (tp - 130) / 140, x0 = 520 - u * 1100; g.save(); g.translate(off(cam, 0.35), 0); for (let k = 0; k < 14; k++) { const x = x0 + k * 72; if (x > -80 && x < AW + 80) g.drawImage(l.cars, Math.round(x), 172); } g.restore();   // a train going the other way, windows strobing
        at(g, cam, 0.35, () => { for (let k = 0; k < 14; k++) { const x = x0 + k * 72; if (x > -80 && x < AW + 80) glow(g, '#ffd86a', x + 35, 186, 36, 0.16, 8); } }); }
      at(g, cam, 0.5, () => { scroll(g, l.signs, t * 4.5, 140, 40); });
      at(g, cam, 0.6, () => { scroll(g, l.poles, t * 6.5, 110, 40); });
      g.fillStyle = '#04060e'; g.fillRect(0, 22, AW, 1); for (let x = 3; x < AW; x += 40) R(g, x, 22, 1, 7, '#04060e'); g.fillRect(0, 29, AW, 1);   // the overhead wire
      put(g, l.floor, cam);
      at(g, cam, 1, () => { glow(g, '#6a9ae8', 240, 212, 180, 0.1, 10);
        if (big >= 0) { glow(g, '#bfe0ff', bx, 150, 60, 0.25 * (1 - big / 40), 90); bolt(g, bx, 24, bx + (hash1(RX.big | 0) - 0.5) * 30, 206, (RX.big | 0) + 3, '#e8f4ff', 'rgba(90,160,255,0.6)'); for (let k = 0; k < 10; k++) { const u = big / 40, sx = bx + (hash1(k * 5 + 1) - 0.5) * 70 * u, sy = 206 - sin(u * 3) * (10 + hash1(k) * 30) + u * u * 30; R(g, sx, sy, 1, 1, '#ffe08a'); } } });
      if (dark > 0) {   // tunnel: black walls, lamps whipping past
        g.globalAlpha = dark * 0.9; g.fillStyle = '#04050c'; g.fillRect(0, 0, AW, 206); g.globalAlpha = 1;
        for (let k = 0; k < 9; k++) { const x = (((k * 62 - tun * 14) % 560) + 560) % 560 - 40; g.globalAlpha = dark; R(g, x, 26, 22, 3, '#fff6c0'); glow(g, '#ffe8a0', x + 11, 28, 36, 0.35, 12); R(g, x - 4, 120, 2, 80, '#1a2236'); g.globalAlpha = 1; }
      }
    },
    front(g, t, cam, A) {
      const tp = t % 1100, tun = tp > 760 && tp < 900 ? tp - 760 : -1, dark = tun < 0 ? 0 : tun < 14 ? tun / 14 : tun > 126 ? (140 - tun) / 14 : 1;
      put(g, A.l.fg, cam);
      const px = 520 - ((t * 11 + 300) % 760); if (px > -14 && px < AW + 10) { R(g, px, 0, 8, AH, '#04060e'); R(g, px - 18, 18, 44, 3, '#04060e'); R(g, px + 1, 0, 1, AH, '#1a2236'); }   // a pole whips by in front of the camera
      g.fillStyle = 'rgba(190,215,255,0.35)'; for (let k = 0; k < 14; k++) { const y = 30 + hash1(k * 3) * 200, x = ((hash1(k) * 700 - t * (9 + hash1(k * 7) * 6)) % 700 + 700) % 700 - 100; g.fillRect(Math.round(x), Math.round(y), 10 + (k & 3) * 6, 1); }
      if (dark > 0) { g.globalAlpha = dark * 0.22 * (0.7 + 0.3 * sin(tun * 1.6)); g.fillStyle = '#000'; g.fillRect(0, 0, AW, AH); g.globalAlpha = 1; for (let k = 0; k < 4; k++) { const x = (((k * 120 - tun * 14) % 560) + 560) % 560 - 40; g.globalAlpha = dark * 0.12; g.fillStyle = '#fff6c0'; g.fillRect(x, 0, 24, AH); g.globalAlpha = 1; } }
      const bg = t - RX.big; if (bg >= 0 && bg < 4) { g.globalAlpha = 0.25; g.fillStyle = '#cfe6ff'; g.fillRect(0, 0, AW, AH); g.globalAlpha = 1; }
    },
  };
  // train-rhythm techno: A dorian, four on the floor, chugging 16th hats, off-beat saw bass, bright plucked arpeggio
  add(train, { bpm: 134, root: 45, sc: DOR, fill: 1, dv: 0.9,
    l: ['sq', 12, 0.26, ['.....7.....7.5.. .....7.....9.7.. .....9.....9.7.. .....7.5.4.2....', '.....7.....7.5.. .....7.....9.7.. .....9.....b.9.. ....7.9.b.9.7.5.']],
    a: ['pl', 12, 0.24, ['0.2.4.2.0.2.4.2. 0.2.4.2.0.2.4.2. 3.5.7.5.3.5.7.5. 4.6.8.6.4.6.8.6.']],
    b: ['saw', 0, 0.4, ['..0...0...0...0. ..0...0...0...0. ..3...3...3...3. ..4...4...4...4.']],
    d: { k: 'x...x...x...x...', s: '....X.......X...', h: 'x.o.x.o.x.o.x.o.', t: '..............g.' } }, 0.95);

  // ======================================================================================
  // 6. KEYNOTE STAGE - a giant screen mirrors the fight, spotlights sweep the haze, the audience films everything
  // ======================================================================================
  const SCR = { x: 120, y: 52, w: 240, h: 88 };
  const LAMPS = [30, 108, 186, 294, 372, 450], BEAMC = ['#ff4fa3', '#4fd8ff', '#ffd05a', '#a98cff', '#ff4fa3', '#4fd8ff'];
  const SLIDES = ['ZERO BUGS (SOON)', 'WORKS ON MY STAGE', 'NO SLIDES ONLY VIBES', 'DEMO GODS PLEASE', 'THE BUG IS A FEATURE', 'SHIP IT LIVE', 'TRUST THE MODEL', '10X FASTER (TRUST ME)'];
  const TICKER = 'LIVE DEMO +++ NOTHING CAN GO WRONG +++ THE AGENTS ARE NOT FIGHTING THIS IS A FEATURE +++ PLEASE HOLD YOUR QUESTIONS +++ ';
  function mini(g, f, sx, sy, sw) {   // a fighter as a handful of rectangles, for the screen
    const gr = typeof GROUND === 'number' ? GROUND : 468, d = f.face >= 0 ? 1 : -1, col = f.d && f.d.col ? f.d.col : '#ffffff', st = f.state;
    const gx = Math.round(sx + 16 + clamp(f.x / 960, 0, 1) * (sw - 32)), fy = Math.round(sy - clamp((gr - f.y) * 0.1, 0, 32));
    R(g, gx - 5, sy + 1, 10, 1, 'rgba(0,0,0,0.55)');
    R(g, gx - 3, fy - 6, 2, 6, '#141428'); R(g, gx + 1, fy - 6, 2, 6, '#141428');
    if (st === 'kick') R(g, d > 0 ? gx + 2 : gx - 10, fy - 6, 8, 2, '#141428');
    R(g, gx - 4, fy - 14, 8, 8, col); R(g, gx - 4, fy - 8, 8, 1, 'rgba(0,0,0,0.3)');
    R(g, gx - 3, fy - 21, 6, 6, '#f2c8a0'); R(g, gx - 3, fy - 22, 6, 2, '#241616'); R(g, d > 0 ? gx + 1 : gx - 2, fy - 19, 1, 2, '#000');
    if (st === 'punch' || st === 'special' || st === 'super') R(g, d > 0 ? gx + 4 : gx - 11, fy - 13, 7, 2, col);
    if (st === 'block') R(g, d > 0 ? gx + 5 : gx - 6, fy - 16, 2, 11, '#9ad0ff');
    if (st === 'super') glow(g, col, gx, fy - 12, 16, 0.5, 14);
  }
  function screen(g, t, G, big, ko, kod) {   // the giant LED screen: a live mirror of the fight, or a slide deck running itself
    const { x, y, w, h } = SCR, cx = x + w / 2;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (G) {
      R(g, x, y, w, h, '#0a1030'); R(g, x, y + 56, w, h - 56, '#141c48'); R(g, x, y + 56, w, 1, '#4a6ad0');
      for (let k = 0; k < 8; k++) R(g, x + k * 34 + 6, y + 57, 1, h - 57, 'rgba(90,120,220,0.35)');
      for (const f of G.f) if (f && f.d) mini(g, f, x, y + 72, w);
      G.f.forEach((f, i) => {
        if (!f || !f.d) return;
        const hp = clamp(f.hp / f.d.hp, 0, 1), bw = 84, b0 = i ? x + w - 6 - bw : x + 6, nm = String(f.d.name).toUpperCase();
        R(g, b0, y + 6, bw, 5, '#10143a'); R(g, i ? b0 + bw - bw * hp : b0, y + 6, bw * hp, 5, hp > 0.3 ? '#f6c544' : '#ff4a4a'); box(g, b0 - 1, y + 5, bw + 2, 7, '#4a6ad0');
        text(g, nm, i ? x + w - 6 - tw(nm, 1) : x + 6, y + 14, f.d.col, 1);
      });
      R(g, cx - 17, y + 5, 34, 9, '#c0143c'); if ((t >> 5) & 1) R(g, cx - 14, y + 8, 3, 3, '#ffffff'); text(g, 'LIVE', cx - 8, y + 7, '#ffffff', 1);
    } else {
      const n = (t / 170) | 0, ph = t % 170, a = clamp(ph / 12, 0, 1) * clamp((170 - ph) / 12, 0, 1), hue = ['#ff4fa3', '#4fd8ff', '#ffd05a', '#a98cff'][n & 3], s = SLIDES[n % SLIDES.length];
      R(g, x, y, w, h, '#100826'); R(g, x, y, w, 3, hue); R(g, x, y + h - 12, w, 3, hue);
      g.globalAlpha = a; textC(g, s, cx + 1, y + 29, '#000000', 2); textC(g, s, cx, y + 28, hue, 2); R(g, cx - 40, y + 42, 80, 1, hue); textC(g, 'SLIDE ' + (n % SLIDES.length + 1) + ' OF 1', cx, y + 47, '#c8b8ff', 1); g.globalAlpha = 1;
      const pr = Math.min(0.99, (t % 600) / 360); R(g, x + 20, y + 62, w - 40, 5, '#1c1240'); R(g, x + 20, y + 62, (w - 40) * pr, 5, '#4fd8ff');
      text(g, 'DEMO LOADING', x + 20, y + 70, '#c8b8ff', 1); const pc = Math.round(pr * 100) + '%'; if (pr < 0.99 || (t >> 4) & 1) text(g, pc, x + w - 20 - tw(pc, 1), y + 70, '#c8b8ff', 1);
    }
    if (big >= 0 && big < 30 && G) {   // a big hit glitches the feed
      for (let k = 0; k < 4; k++) { g.globalAlpha = 0.55; R(g, x + (hash1(k + RX.big) - 0.5) * 24, y + ((hash1(k * 7 + RX.big) * 76) | 0), w, 2, k & 1 ? '#ff4fa3' : '#4fd8ff'); }
      g.globalAlpha = 1; if ((big >> 2) & 1) textC(g, 'OOPS', cx, y + 30, '#ff4a4a', 3); if (big < 3) { g.globalAlpha = 0.5; R(g, x, y, w, h, '#ffffff'); g.globalAlpha = 1; }
    }
    if (ko) {
      g.globalAlpha = 0.9 * Math.min(1, kod / 14); R(g, x, y, w, h, '#06240f'); g.globalAlpha = 1;
      if (kod > 10) { textC(g, 'SHIPPED', cx, y + 22, '#7cff9a', 4); line(g, cx - 12, y + 52, cx - 5, y + 59, '#7cff9a', 2); line(g, cx - 5, y + 59, cx + 12, y + 44, '#7cff9a', 2); textC(g, 'ALL TESTS PASS (NOBODY CHECKED)', cx, y + 64, '#c8ffd8', 1); }
    }
    R(g, x, y + h - 9, w, 9, '#12062a'); R(g, x, y + h - 9, w, 1, '#c0143c');
    g.save(); g.beginPath(); g.rect(x, y + h - 8, w, 8); g.clip(); text(g, TICKER, x + w - ((t * 0.7) % (tw(TICKER, 1) + w)), y + h - 6, '#ffd05a', 1); g.restore();
    g.fillStyle = 'rgba(0,0,0,0.16)'; for (let yy = y; yy < y + h; yy += 2) g.fillRect(x, yy, w, 1);
    g.restore();
  }
  const keynote = {
    id: 'keynote', name: 'KEYNOTE STAGE', tagline: 'LIVE DEMO, WHAT COULD GO WRONG', accent: '#ff4fa3',
    build(A) {
      const l = A.l;
      l.back = layer(0.04); { const { g, M } = l.back, r = rng(61), w = AW + 2 * M;
        fill(l.back, [[0, '#05030c'], [0.5, '#12072a'], [0.78, '#24103c'], [1, '#341650']], { q: 6 });
        for (let x = -M; x < AW + M; x += 12) R(g, x, 0, 1, 210, 'rgba(255,255,255,0.03)');
        for (let i = 0; i < 40; i++) R(g, -M + r() * w, 20 + r() * 150, 1, 1, 'rgba(255,200,255,0.25)'); }
      l.truss = layer(0.08); { const { g, M } = l.truss, w = AW + 2 * M;
        R(g, -M, 8, w, 3, '#1a1626'); R(g, -M, 17, w, 3, '#1a1626'); R(g, -M, 8, w, 1, '#6a5a8a'); R(g, -M, 19, w, 1, '#050309');
        for (let x = -M; x < AW + M; x += 14) { line(g, x, 11, x + 7, 17, '#2a2238'); line(g, x + 7, 17, x + 14, 11, '#2a2238'); }
        for (const lx of LAMPS) { R(g, lx - 1, 20, 2, 5, '#0a0710'); R(g, lx - 5, 25, 10, 7, '#1a1626'); R(g, lx - 5, 25, 10, 1, '#6a5a8a'); R(g, lx - 3, 31, 6, 2, '#fff2d0'); } }
      l.bezel = strip(SCR.w + 12, SCR.h + 12, (g, w, h) => { R(g, 0, 0, w, h, '#0a0612'); box(g, 0, 0, w, h, '#5a4a7a'); box(g, 2, 2, w - 4, h - 4, '#1a1030'); R(g, 3, 3, w - 6, 1, '#ff4fa3'); R(g, 3, h - 4, w - 6, 1, '#4fd8ff'); R(g, 6, 6, w - 12, h - 12, '#000000'); });
      l.podium = strip(34, 48, (g, w, h) => {
        poly(g, [4, 48, 6, 18, 28, 18, 30, 48], '#1a1030'); R(g, 6, 18, 22, 3, '#3a2a5a'); R(g, 6, 18, 22, 1, '#8a6ac0'); R(g, 9, 26, 16, 18, '#0c0618'); text(g, 'DEMO', 17 - tw('DEMO', 1) / 2, 32, '#ff4fa3', 1);
        poly(g, [8, 18, 10, 8, 24, 8, 26, 18], '#2a2238'); R(g, 11, 9, 12, 8, '#0a1a2a'); line(g, 28, 16, 31, 4, '#8a8aa0'); R(g, 30, 2, 4, 3, '#222233'); });
      l.floor = layer(1); { const { g, M } = l.floor, w = AW + 2 * M;
        floorBase(l.floor, { y0: 206, top: '#1c1030', mid: '#2a1646', bot: '#0c0618', fade: '#1c1030', line: '#0a0414', line2: '#6a3a9a', lip: '#ff4fa3', lip2: '#08030f', sp: 36, vp: [240, 108], rows: [-18, -10, -3, 4, 12, 22, 34] });
        speck(g, -M, 208, w, 62, ['#3a2060', '#0c0618', '#4a2a7a'], 160, 3);
        for (const [x, y, c] of [[84, 242, '#ff4fa3'], [330, 248, '#4fd8ff'], [212, 228, '#ffd05a'], [420, 234, '#ff4fa3']]) { line(g, x - 3, y - 2, x + 3, y + 2, c); line(g, x - 3, y + 2, x + 3, y - 2, c); }   // gaffer-tape spike marks
        R(g, -M, 266, w, 4, '#08030f'); R(g, -M, 265, w, 1, '#ff4fa3'); }
      l.ph = []; l.fg = layer(1.25); { const { g, M } = l.fg, r = rng(88), w = AW + 2 * M;
        R(g, -M, 262, w, 12, '#05020a');
        for (let x = -M + 2; x < AW + M; x += 10 + (r() * 7 | 0)) { const hy = 252 + (r() * 5 | 0), s = 4 + (r() * 2 | 0);
          disc(g, x, hy, s, s, '#05020a'); R(g, x - s - 3, hy + s - 1, 2 * s + 6, 24, '#05020a');
          if (r() < 0.45) { const sd = r() < 0.5 ? -1 : 1, hx = x + sd * (s + 5), hy2 = hy - 12 - (r() * 6 | 0); line(g, x + sd * (s + 1), hy + s, hx, hy2 + 4, '#05020a', 2); R(g, hx - 1, hy2, 3, 5, '#0c0c1c'); R(g, hx, hy2 + 1, 1, 3, '#2a4a6a'); l.ph.push([hx, hy2 + 2]); } } }
      l.haze = fogTex(480, 70, '#d8a8ff', 1, 17, 22);
    },
    paint(g, t, cam, A) {
      const l = A.l, G = live(), bg = t - RX.big, big = bg >= 0 && bg < 60 ? bg : -1, kod = t - RX.ko, ko = kod >= 0 && kod < 700, bx = clamp(RX.x * AW, 30, AW - 30);
      put(g, l.back, cam);
      at(g, cam, 0.12, () => {   // equalizer curtains on both side walls; they jump on big hits
        for (let i = 0; i < 9; i++) for (let s = 0; s < 2; s++) {
          const x = s ? 468 - i * 11 : 5 + i * 11, hgt = 20 + 26 * (0.5 + 0.5 * sin(t * 0.11 + i * 0.8 + s * 1.9)) + (big >= 0 ? 30 * (1 - big / 60) * (0.5 + 0.5 * sin(i + s)) : 0) + (ko ? 14 * (0.5 + 0.5 * sin(t * 0.3 + i)) : 0), c = mix(s ? '#4fd8ff' : '#ff4fa3', s ? '#a98cff' : '#ffd05a', i / 8);
          R(g, x, 206 - hgt, 7, hgt, rgba(c, 0.5)); R(g, x, 206 - hgt, 7, 1, c);
        }
      });
      put(g, l.truss, cam);
      at(g, cam, 0.3, () => {   // the giant screen, hung from two cables
        line(g, 126, 20, 126, 46, '#2a2238'); line(g, 354, 20, 354, 46, '#2a2238');
        g.drawImage(l.bezel, SCR.x - 6, SCR.y - 6); screen(g, t, G, big, ko, kod);
        glow(g, '#6a8aff', SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 190, 0.1 + 0.02 * sin(t * 0.2), 80);
      });
      const pools = [];
      at(g, cam, 0.08, () => {   // truss lamps: beams sweep the haze, snap to a big hit and go wild on a KO
        LAMPS.forEach((lx, i) => {
          let a = sin(t * (0.013 + i * 0.0027) + i * 1.9) * 0.5 + (i < 3 ? 0.16 : -0.16);
          if (ko) a = sin(t * (0.06 + i * 0.01) + i) * 0.8;
          if (big >= 0 && big < 40) a += (Math.atan2(bx - lx, 190) - a) * (1 - big / 40);
          const len = 240 / cos(a), ex = lx + sin(a) * len, w = 16 + (i & 1) * 6, c = BEAMC[(i + (ko ? t >> 4 : 0)) % BEAMC.length];
          g.globalCompositeOperation = 'lighter'; fpoly(g, [lx - 2, 30, lx + 2, 30, ex + w, 270, ex - w, 270], rgba(c, 0.085)); fpoly(g, [lx - 1, 30, lx + 1, 30, ex + w * 0.4, 270, ex - w * 0.4, 270], rgba(c, 0.07)); g.globalCompositeOperation = 'source-over';
          pools.push([lx + sin(a) * 196 / cos(a), c]);
        });
      });
      put(g, l.floor, cam);
      at(g, cam, 1, () => {
        for (let x = -20; x < 500; x += 8) { const k = (((x >> 3) - (t >> 2)) % 6 + 6) % 6; R(g, x, 266, 6, 2, k < 2 ? '#ff4fa3' : k < 4 ? '#4fd8ff' : '#2a1040'); }   // chasing LED edge
        glow(g, '#6a8aff', 240, 214, 130, 0.08, 14);
        for (const [px, c] of pools) glow(g, c, px, 226, 30, 0.22, 8);
        g.drawImage(l.podium, 22, 186); glow(g, '#4fd8ff', 39, 199, 18, 0.28 + 0.05 * sin(t * 0.3), 10);   // the presenter's laptop
        for (let k = 0; k < 3; k++) R(g, 34, 196 + k * 2, 3 + (((t >> 3) + k * 3) % 6), 1, '#7cffe0'); if ((t >> 4) & 1) R(g, 44, 202, 2, 2, '#ffffff');
        if (big >= 0 && big < 30) glow(g, '#ffffff', bx, 232, 40, 0.28 * (1 - big / 30), 8);
      });
    },
    front(g, t, cam, A) {
      const l = A.l, bg = t - RX.big, big = bg >= 0 && bg < 60 ? bg : -1, kod = t - RX.ko, ko = kod >= 0 && kod < 700, bx = clamp(RX.x * AW, 30, AW - 30);
      fogDraw(g, l.haze, t, 0.2, 150, 0.09, cam.x * 0.4); put(g, l.fg, cam);
      at(g, cam, 1.25, () => {   // phone flashes in the crowd; a big hit sets off a wave from the hit, a KO sets off everyone
        l.ph.forEach(([px, py], i) => {
          const P = 80 + ((hash1(i * 3.1) * 170) | 0), f0 = (t + ((hash1(i * 7.7) * P) | 0)) % P; let on = f0 < 2;
          if (big >= 0 && hash1(i * 1.3) > 0.45) { const d = abs(px - bx) * 0.12; if (big >= d && big < d + 4) on = true; }
          if (ko && kod < 260 && ((kod + i * 5) % 37) < 2) on = true;
          if (on) { R(g, px - 2, py - 2, 5, 5, '#ffffff'); glow(g, '#ffffff', px, py, 22, 0.55, 18); }
        });
      });
      if (ko && kod < 380) for (let k = 0; k < 70; k++) {   // confetti
        const sp = 0.5 + hash1(k * 5.3) * 0.9, x = hash1(k * 1.7) * AW + sin(kod * 0.05 + k) * 14, y = -10 + kod * sp - (k % 5) * 12, c = ['#ff4fa3', '#4fd8ff', '#ffd05a', '#7cff9a', '#ffffff'][k % 5];
        if (y > 0 && y < AH) R(g, x, y, ((kod + k) >> 3) & 1 ? 3 : 1, 2, c);
      }
      if (big >= 0 && big < 3) { g.globalAlpha = 0.18; g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AH); g.globalAlpha = 1; }
    },
  };
  // keynote anthem: B flat major, 120 bpm, I-V-vi-IV, organ pads, pumping saw bass, a heroic square lead, stomp and clap
  add(keynote, { bpm: 120, root: 46, sc: MAJ, fill: 1, dv: 1.0,
    l: ['sq2', 12, 0.3, ['4---4-5-7---5-4. 6---6-7-8---7-6. 7---7-8-9---8-7. 5-4-3-4-5-------', '4---4-5-7---5-4. 6---6-7-8---7-6. 7---7-8-9---8-7. 5-7-9-b-c-------']],
    a: ['org', 12, 0.2, ['0--------------- 4--------------- 5--------------- 3---------------'], 1],
    b: ['saw2', 0, 0.38, ['0.0.0.0.0.0.0.0. 4.4.4.4.4.4.4.4. 5.5.5.5.5.5.5.5. 3.3.3.3.3.3.3.3.']],
    d: { k: 'x...x...x...x...', s: '....X.......X...', h: '..x...x...x...x.', t: '..............g.' } }, 0.75);

  // game.js reads #demo=..&arena=K before any extension file has registered its stages, so K wraps around the 9 built-ins there; apply it again now that every stage exists
  { const m = /arena=(\d+)/.exec(location.hash), g = typeof game !== 'undefined' ? game : null;
    if (m && g && +m[1] >= 9 && +m[1] < ARENAS.length) { g.arenaPick = +m[1]; if (/#demo=/.test(location.hash)) g.arena = +m[1]; } }
  window.ARENAS3 = { ids, rx: RX, themes };
})();
