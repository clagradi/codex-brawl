// ===== AGENT BRAWL feature file: SEASONAL EVENTS (premium). =====
// Owner: p-events agent (branch feat/p-events).
// Area: dressing for the calendar. Halloween (Oct 20 - Nov 2): pumpkins, bats, ghosts and spiders with a spooky purple tint. Winter holidays (Dec 15 - Jan 6): snow,
//       string lights, trees and a frosty tint. New Year (Dec 30 - Jan 2): fireworks in the sky and confetti on every KO. April 1: a silly announcer (captions, a
//       squeaky voice and a slide whistle). Everything is draw-only: no hit, timer, health or input is read for any other purpose than drawing, and none is changed.
// Setting: events.mode = auto (follow the local date) | off | halloween | winter | newyear | april. Forced modes ignore the date. Pause menu: E cycles the mode.
//          A session override for screenshots and tests: add events=<mode> to the URL hash (it is not saved).
// Hooks used: 'update' (clock, confetti), 'drawWorld' (confetti), 'drawTop' (April caption, title tag), 'pauseItems' (E = mode).
// BUS used: ko, match:start, round:start, phase, settings.
// Engine touch points that are not hooks (nothing in game.js is edited): drawArena and drawArenaFront (arenas.js) are wrapped to add a layer behind the fighters and one in
//   front of them; ANNOUNCER.say (hud.js) is wrapped for the April captions; speechSynthesis.speak is wrapped to change the words and pitch of the April voice.
// Public: window.EVENTS (active(), has(id), activeOn(month, day), setDate(month, day), setMode(mode), cycle(), silly(key, arg), burst(x, y, n), state()) for tests and other files.
'use strict';
(() => {
  window.STUB_P_EVENTS = 1;

  // ---------- calendar ----------
  const IDS = ['halloween', 'winter', 'newyear', 'april'];
  const MODE_LIST = ['auto', 'off'].concat(IDS);
  const DEF = {
    halloween: { from: [10, 20], to: [11, 2], tag: 'SPOOKY SEASON', short: 'HALLOWEEN' },
    winter: { from: [12, 15], to: [1, 6], tag: 'WINTER LIGHTS', short: 'WINTER' },
    newyear: { from: [12, 30], to: [1, 2], tag: 'HAPPY NEW YEAR', short: 'NEW YEAR' },
    april: { from: [4, 1], to: [4, 1], tag: 'APRIL FOOLS', short: 'APRIL 1' },
  };
  SETTINGS.define('events.mode', { def: 'auto', values: MODE_LIST, label: 'SEASONAL EVENTS' });

  let fake = null;                 // { m, d } while a test pins the date
  let hashMode = null;             // events=<mode> in the URL hash: this visit only
  try { const m = /[#&]events=([a-z]+)/.exec(location.hash || ''); if (m && MODE_LIST.includes(m[1])) hashMode = m[1]; } catch (e) { /* no location */ }
  const today = () => { if (fake) return fake; const n = new Date(); return { m: n.getMonth() + 1, d: n.getDate() }; };
  // a window may wrap over the new year (Dec 15 - Jan 6)
  function inWindow(id, m, d) {
    const w = DEF[id], a = w.from[0] * 100 + w.from[1], b = w.to[0] * 100 + w.to[1], v = m * 100 + d;
    return a <= b ? v >= a && v <= b : v >= a || v <= b;
  }
  const activeOn = (m, d) => IDS.filter(id => inWindow(id, m, d));
  function modeNow() { if (hashMode) return hashMode; let m; try { m = SETTINGS.get('events.mode'); } catch (e) { /* settings missing */ } return m || 'auto'; }
  let cache = null, cacheAt = 0;
  function active() {
    const n = Date.now();
    if (!cache || n - cacheAt > 1000) {
      const m = modeNow();
      if (m === 'off') cache = [];
      else if (m === 'auto') { const d = today(); cache = activeOn(d.m, d.d); } else cache = [m];
      cacheAt = n;
    }
    return cache;
  }
  const has = id => active().includes(id);
  const dirty = () => { cache = null; };
  BUS.on('settings', e => { if (e && e.key === 'events.mode') dirty(); });

  // ---------- small helpers ----------
  const S = { clock: 0, conf: [], rain: 0, cap: null, sillyN: 0, whistles: 0, lastSpeech: null, bursts: 0, calm: false };
  let seed = 90210, warned = false, pend = null;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };   // own generator: never touches Math.random, which the engine uses
  function hash(n) { n = Math.imul(n ^ 61, 0x9e3779b1) >>> 0; n = Math.imul(n ^ (n >>> 15), 0x85ebca6b) >>> 0; n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const guard = (name, fn) => { try { fn(); } catch (e) { if (!warned) { warned = true; console.error('p-events ' + name + ' threw: ' + (e && e.stack || e)); } } };
  const calm = () => { try { return SETTINGS.get('reduceFlash') === true; } catch (e) { return false; } };   // steady lights, softer bursts
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ZC = { x: 0, zoom: 1 };
  const px = Math.round;

  // ---------- sprites (built once, from code) ----------
  const spr = Object.create(null);
  function sprite(name, w, h, draw) {
    let s = spr[name]; if (s) return s;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return (spr[name] = { c, w, h });
  }
  function fromRows(name, map, pal) {
    return sprite(name, map[0].length, map.length, g => {
      for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) { const col = pal[map[y][x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    });
  }
  // one sprite pixel is two screen pixels, like the half-resolution arenas; k scales that again
  function blit(ctx, s, x, y, k) { ctx.drawImage(s.c, px(x), px(y), s.w * 2 * (k || 1), s.h * 2 * (k || 1)); }
  function glowSprite(rgb, r) {
    return sprite('glow' + rgb + r, r * 2, r * 2, g => {
      const gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',0.4)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    });
  }
  function glow(ctx, rgb, r, x, y, a) { const s = glowSprite(rgb, r); ctx.globalAlpha = a; ctx.drawImage(s.c, px(x - r), px(y - r)); }

  function pumpkinSprite() {
    return sprite('pumpkin', 20, 17, g => {
      const grid = []; for (let y = 0; y < 17; y++) grid.push(new Array(20).fill('.'));
      const span = [[5, 14], [3, 16], [2, 17], [1, 18], [0, 19], [0, 19], [0, 19], [0, 19], [0, 19], [0, 19], [0, 19], [1, 18], [2, 17], [3, 16], [5, 14]];
      span.forEach((s, i) => { for (let x = s[0]; x <= s[1]; x++) grid[2 + i][x] = 'o'; });
      for (let r = 4; r <= 15; r++) for (const c of [6, 13]) if (grid[r][c] === 'o') grid[r][c] = 'd';
      for (let r = 14; r <= 16; r++) for (let x = 0; x < 20; x++) if (grid[r][x] === 'o') grid[r][x] = 'd';
      for (const [x, y] of [[2, 6], [3, 6], [2, 7], [3, 7], [3, 8], [9, 3], [10, 3], [11, 3], [15, 6], [16, 7]]) if (grid[y][x] === 'o') grid[y][x] = 'l';
      grid[0][10] = grid[0][11] = 'g'; grid[1][9] = grid[1][10] = 'g'; grid[1][11] = 'G'; grid[0][12] = 'G';
      const lit = [[5, 7], [4, 8], [5, 8], [6, 8], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [14, 7], [13, 8], [14, 8], [15, 8], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9],
        [9, 10], [10, 10], [8, 11], [9, 11], [10, 11], [11, 11]];
      for (let x = 4; x <= 15; x++) lit.push([x, 12]); for (let x = 3; x <= 16; x++) lit.push([x, 13]); for (let x = 5; x <= 14; x++) lit.push([x, 14]);
      for (const [x, y] of lit) grid[y][x] = 'y';
      for (const [x, y] of [[7, 12], [8, 12], [11, 12], [12, 12], [9, 14], [10, 14]]) grid[y][x] = 'T';
      const out = grid.map(r => r.slice());
      for (let y = 0; y < 17; y++) for (let x = 0; x < 20; x++) if ('odl'.includes(grid[y][x]) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy] || [])[x + dx] === 'y')) out[y][x] = 'k';
      const pal = { o: '#e8741a', d: '#a8400a', l: '#ffa532', g: '#3f6b1f', G: '#6aa334', k: '#2a0e02', y: '#ffd23a', T: '#d9610f' };
      for (let y = 0; y < 17; y++) for (let x = 0; x < 20; x++) { const c = pal[out[y][x]]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } }
    });
  }
  const BAT = [
    ['X.............X', 'XX...........XX', 'XXX...X.X...XXX', 'XXXX..eXe..XXXX', '.XXXXXXXXXXXXX.', '..XXXXXXXXXXX..', '...XX.XXX.XX...', '....X..X..X....'],
    ['......X.X......', '......XXX......', '.XX..XeXeX..XX.', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', '.XX.XXXXXXX.XX.', '..X..X.X.X..X..', '...............']];
  const batSprite = (f, rim) => fromRows('bat' + f + (rim ? 'r' : ''), BAT[f], { X: rim ? '#6a4a9c' : '#14081d', e: rim ? '#6a4a9c' : '#ff3b3b' });
  const ghostSprite = () => fromRows('ghost', ['....wwwwww....', '..wwwwwwwwww..', '.wwwwwwwwwwww.', '.wwkkwwwwkkww.', '.wwkkwwwwkkww.', 'wwwwwwwwwwwwww', 'wwwwwwkkwwwwww', 'wwwwwwkkwwwwww',
    'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'ww.ww.ww.ww.ww'], { w: '#eae6ff', k: '#2a2150' });
  const ORN = [[10, 9], [14, 12], [8, 18], [16, 20], [12, 16], [6, 28], [18, 27], [11, 29], [15, 32]];   // tree ornaments: sprite coordinates
  function treeSprite() {
    return sprite('tree', 24, 38, g => {
      const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
      P(10, 34, 4, 4, '#4a2c12');
      for (let k = 0; k < 3; k++) {
        const y0 = 4 + k * 9, bw = 5 + k * 3;
        for (let r = 0; r <= 10; r++) {
          const half = Math.max(1, Math.round(1 + (bw - 1) * r / 10)), y = y0 + r;
          P(12 - half, y, half, 1, '#164a2b'); P(12, y, half, 1, r % 3 === 0 ? '#2c7a47' : '#23653a');
          if (r === 10) { P(12 - half, y, 2, 1, '#e8f2ff'); P(12 + half - 2, y, 2, 1, '#e8f2ff'); }
          if (r === 5 || r === 2) { P(12 - half + 1, y, 1, 1, '#dbe8f8'); P(12 + half - 3, y, 1, 1, '#dbe8f8'); }
        }
      }
      P(11, 0, 2, 4, '#ffd23a'); P(9, 1, 6, 2, '#ffd23a'); P(11, 1, 2, 2, '#fff2a0');
    });
  }
  function pileSprite() {
    return sprite('pile', 40, 10, g => {
      for (let r = 0; r < 10; r++) {
        const u = (r + 0.5) / 10, half = Math.round(20 * Math.sqrt(1 - (1 - u) * (1 - u)));
        g.fillStyle = r >= 8 ? '#9db6d4' : r >= 6 ? '#c4d7ee' : '#eef5ff'; g.fillRect(20 - half, r, half * 2, 1);
      }
    });
  }

  // ---------- painters, in world space (the camera is already applied by the engine) ----------
  function tint(ctx, col) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = col; ctx.fillRect(-500, -500, W + 1000, H + 1000); ctx.restore(); }
  function gradBand(ctx, key, y0, y1, stops) {
    const s = spr[key] || (spr[key] = (() => { const g = ctx.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) g.addColorStop(o, c); return { g }; })());
    ctx.fillStyle = s.g; ctx.fillRect(-500, y0, W + 1000, y1 - y0);
  }
  // parallax: 1 moves with the arena floor, 0 stays on the screen
  function layer(ctx, cam, par, fn) { ctx.save(); ctx.translate(px(cam.x * (1 - par)), 0); fn(); ctx.restore(); }

  function spooky(ctx, t, cam, props) {
    tint(ctx, 'rgb(176,140,222)');
    gradBand(ctx, 'mist', GROUND - 70, H, [[0, 'rgba(120,70,170,0)'], [0.55, 'rgba(120,70,170,0.2)'], [1, 'rgba(90,40,140,0.3)']]);
    layer(ctx, cam, 0.7, () => {   // ghosts drift slowly and see through
      const gs = ghostSprite(); ctx.globalAlpha = 0.42;
      for (let i = 0; i < 2; i++) blit(ctx, gs, 210 + i * 420 + Math.sin(t * 0.011 + i * 2) * 90, 150 + Math.sin(t * 0.021 + i * 3) * 20, 2);
      ctx.globalAlpha = 1;
    });
    layer(ctx, cam, 0.9, () => {   // spiders on silk
      for (const [x, ph] of [[150, 0], [830, 2.2]]) {
        const y = px(46 + 30 * (0.5 + 0.5 * Math.sin(t * 0.017 + ph)));
        ctx.fillStyle = 'rgba(225,225,240,0.55)'; ctx.fillRect(x, -20, 1, y + 20);
        ctx.fillStyle = '#130a1c'; ctx.fillRect(x - 4, y, 9, 8); ctx.fillRect(x - 3, y - 1, 7, 10);
        for (let l = 0; l < 4; l++) { const up = l < 2 ? -1 : 1, o = (l % 2) * 3; ctx.fillRect(x - 9 + o, y + 4 + up * 3, 5, 1); ctx.fillRect(x + 5 - o, y + 4 + up * 3, 5, 1); ctx.fillRect(x - 10 + o, y + 4 + up * 5, 1, 2); ctx.fillRect(x + 10 - o, y + 4 + up * 5, 1, 2); }
        ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - 2, y + 2, 1, 1); ctx.fillRect(x + 2, y + 2, 1, 1);
      }
    });
    layer(ctx, cam, 0.5, () => {   // bats cross the sky
      const span = W + 360;
      for (let i = 0; i < 6; i++) {
        const h1 = hash(i * 11 + 1), h2 = hash(i * 11 + 2), h3 = hash(i * 11 + 3), dir = i % 2 ? 1 : -1;
        const x = (((h1 * span + dir * t * (0.9 + h2 * 1.1)) % span) + span) % span - 180, y = 36 + h3 * 150 + Math.sin(t * 0.03 + i * 2) * 22;
        const f = ((t / (5 + (i % 3)) + i) | 0) & 1, k = 1.1 + h2 * 0.7;
        blit(ctx, batSprite(f, true), x, y - 2 * k, k); blit(ctx, batSprite(f, false), x, y, k);
      }
    });
    if (props) layer(ctx, cam, 1, () => pumpkins(ctx, t, [[130, 1.25, 14], [372, 0.9, 6], [650, 1.0, 8], [830, 1.5, 14]]));
  }
  function pumpkins(ctx, t, list) {
    const s = pumpkinSprite();
    list.forEach(([x, k, base], i) => {
      ctx.globalAlpha = 1; blit(ctx, s, x - s.w * k, GROUND + base - s.h * 2 * k, k);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, '255,140,30', 56, x, GROUND + base - s.h * k * 0.95, (0.5 + 0.12 * Math.sin(t * 0.13 + i * 2) + 0.08 * hash(((t / 5) | 0) + i * 31)) * (calm() ? 0.6 : 1));
      ctx.restore();
    });
  }
  function spookyFront(ctx, t, cam) {   // now and then a big bat flies across the top of the screen, behind the health bars
    const c = t % 840; if (c > 220) return;
    layer(ctx, cam, 0.2, () => {
      const dir = ((t / 840) | 0) % 2 ? -1 : 1, u = c / 220, x = dir > 0 ? -150 + u * (W + 300) : W + 150 - u * (W + 300), y = 40 + 30 * Math.sin(u * 6);
      const f = ((t / 5) | 0) & 1; blit(ctx, batSprite(f, true), x, y - 4, 3); blit(ctx, batSprite(f, false), x, y, 3);
    });
  }

  function flakes(ctx, t, n, sz, spd, a, seedBase) {
    ctx.fillStyle = '#fff'; ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const h1 = hash(seedBase + i * 3), h2 = hash(seedBase + i * 3 + 1), h3 = hash(seedBase + i * 3 + 2);
      const y = (h2 * 700 + t * spd * (0.6 + h3 * 0.8)) % 700 - 80, x = h1 * (W + 120) - 60 + Math.sin(t * 0.02 + h3 * 6.28) * 14;
      ctx.fillRect(px(x), px(y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  const BULB = [['255,74,74', '#ff4a4a'], ['255,210,58', '#ffd23a'], ['74,255,122', '#4aff7a'], ['90,180,255', '#5ab4ff']];
  function garland(ctx, t) {
    const steady = calm(), GY = 104;   // below the health bars
    for (let a = -1; a < 7; a++) {
      const x0 = a * 192, wire = [];
      for (let u = 0; u <= 192; u += 4) wire.push([x0 + u, GY + 28 * Math.sin(Math.PI * u / 192)]);
      ctx.fillStyle = 'rgba(20,40,28,0.9)'; for (const [x, y] of wire) ctx.fillRect(px(x), px(y), 4, 2);
      for (let b = 1; b < 7; b++) {
        const u = b * 192 / 7, x = x0 + u, y = GY + 28 * Math.sin(Math.PI * u / 192), i = a * 7 + b;
        const on = steady || ((i * 7 + (t >> 4)) % 5) !== 0, c = BULB[(i + (steady ? 0 : t >> 5)) & 3];
        ctx.globalAlpha = on ? 1 : 0.35; ctx.fillStyle = c[1]; ctx.fillRect(px(x) - 2, px(y) + 2, 4, 6); ctx.fillStyle = '#222'; ctx.fillRect(px(x) - 1, px(y), 2, 2);
        if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, c[0], 16, x, y + 6, 0.5); ctx.restore(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  function trees(ctx, t) {
    const s = treeSprite(), k = 2, steady = calm();
    for (const [x, seedI] of [[96, 0], [866, 5]]) {
      const left = x - s.w * k, top = GROUND + 4 - s.h * 2 * k;
      blit(ctx, s, left, top, k);
      ORN.forEach(([ox, oy], i) => {
        const c = BULB[(i + seedI + (steady ? 0 : t >> 5)) & 3], on = steady || ((i * 3 + seedI + (t >> 4)) % 4) !== 0;
        ctx.globalAlpha = on ? 1 : 0.4; ctx.fillStyle = c[1]; ctx.fillRect(px(left + ox * 2 * k), px(top + oy * 2 * k), px(3 * k), px(3 * k));
        if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, c[0], 12, left + ox * 2 * k + 2, top + oy * 2 * k + 2, 0.45); ctx.restore(); }
      });
      ctx.globalAlpha = 1;
    }
  }
  function winter(ctx, t, cam, props) {
    tint(ctx, 'rgb(188,208,242)');
    gradBand(ctx, 'frost', GROUND - 6, H, [[0, 'rgba(235,245,255,0)'], [0.3, 'rgba(235,245,255,0.16)'], [1, 'rgba(235,245,255,0.3)']]);
    layer(ctx, cam, 0.9, () => garland(ctx, t));
    if (props) layer(ctx, cam, 1, () => {
      trees(ctx, t);
      const p = pileSprite(); ctx.globalAlpha = 0.95;
      for (const [x, k] of [[250, 1.3], [470, 1.0], [700, 1.5], [60, 1.8], [915, 1.6]]) blit(ctx, p, x - p.w * k, GROUND + 14 - p.h * 2 * k, k);
      ctx.globalAlpha = 1;
    });
    layer(ctx, cam, 0.3, () => flakes(ctx, t, 90, 3, 0.5, 0.85, 101));
  }
  function winterFront(ctx, t, cam) { layer(ctx, cam, 0.15, () => flakes(ctx, t, 22, 4, 1.1, 0.9, 701)); }

  const FW = ['255,90,110', '255,210,58', '90,210,255', '120,255,140', '200,130,255', '255,255,255'];
  function fireworks(ctx, t, cam) {
    layer(ctx, cam, 0.25, () => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const soft = calm() ? 0.6 : 1;
      for (let s = 0; s < 4; s++) {
        const P = 150 + s * 37, tt = t + s * 61, b = Math.floor(tt / P), age = tt % P, life = 70;
        if (age >= life) continue;
        const h = k => hash(b * 7 + s * 131 + k), cx = 100 + h(1) * (W - 200), cy = 60 + h(2) * 150, rad = 80 + h(3) * 60, col = FW[(h(4) * FW.length) | 0], n = 28;
        const u = age / life, e = 1 - (1 - u) * (1 - u), a = Math.min(1, 1.6 * (1 - u)) * soft;
        ctx.fillStyle = 'rgb(' + col + ')'; ctx.globalAlpha = a;
        for (let k = 0; k < n; k++) {
          const ang = Math.PI * 2 * k / n + h(5) * 0.5, r = rad * e;
          ctx.fillRect(px(cx + Math.cos(ang) * r), px(cy + Math.sin(ang) * r + u * u * 26), 4, 4);
          if (u > 0.2) ctx.fillRect(px(cx + Math.cos(ang) * r * 0.78), px(cy + Math.sin(ang) * r * 0.78 + u * u * 20), 3, 3);
        }
        glow(ctx, col, 110, cx, cy, Math.max(0, 0.5 - u) * soft);
      }
      ctx.restore();
    });
  }

  // ---------- the wrapped arena painters ----------
  function back(ctx, t, cam) {
    const on = active(); if (!on.length) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    try {
      const props = game.phase !== 'title';   // the title menu sits over the floor: keep it clear of pumpkins, trees and snow piles
      if (on.includes('halloween')) spooky(ctx, t, cam, props);
      if (on.includes('winter')) winter(ctx, t, cam, props);
      if (on.includes('newyear')) fireworks(ctx, t, cam);
    } finally { ctx.restore(); }
  }
  function front(ctx, t, cam) {
    const on = active(); if (!on.length) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    try {
      if (on.includes('halloween')) spookyFront(ctx, t, cam);
      if (on.includes('winter')) winterFront(ctx, t, cam);
    } finally { ctx.restore(); }
  }
  function wrapArena() {
    const d0 = window.drawArena, f0 = window.drawArenaFront;
    if (typeof d0 === 'function' && !d0.__ev) {
      const w = function (ctx, i, t, cam) { d0.apply(this, arguments); guard('arena', () => back(ctx, t || 0, cam || ZC)); };
      w.__ev = 1; window.drawArena = w;
    }
    if (typeof f0 === 'function' && !f0.__ev) {
      const w = function (ctx, i, t, cam) { f0.apply(this, arguments); guard('arena front', () => front(ctx, t || 0, cam || ZC)); };
      w.__ev = 1; window.drawArenaFront = w;
    }
  }

  // ---------- confetti on a KO ----------
  const CONF = ['#ff4a6a', '#ffd23a', '#4ad8ff', '#7dff6a', '#c77dff', '#ffffff', '#ff9a2e'], MAXC = 300;
  function burst(x, y, n, up) {
    S.bursts++;
    for (let i = 0; i < n && S.conf.length < MAXC; i++) {
      const a = up === false ? Math.PI * (0.3 + 0.4 * rnd()) : -Math.PI * (0.1 + 0.8 * rnd()), sp = up === false ? 0.4 + rnd() * 1.2 : 4 + rnd() * 9;
      S.conf.push({ x: x + (rnd() - 0.5) * 24, y: y + (rnd() - 0.5) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ph: rnd() * 6.28, vph: 0.12 + rnd() * 0.2, col: CONF[(rnd() * CONF.length) | 0], life: 200 + ((rnd() * 140) | 0) });
    }
  }
  function stepConf() {
    const l = S.conf;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.vy += 0.2; p.vx *= 0.985; p.vy *= 0.985; if (p.vy > 2.1) p.vy = 2.1;
      p.x += p.vx + Math.sin(p.ph) * 0.45; p.y += p.vy; p.ph += p.vph; p.life--;
      if (p.life <= 0 || p.y > H + 20) l.splice(i, 1);
    }
  }
  function drawConf(ctx) {
    if (!S.conf.length) return;
    ctx.save();
    for (const p of S.conf) {
      const w = Math.max(1, px(7 * Math.abs(Math.cos(p.ph))));
      ctx.globalAlpha = p.life < 30 ? p.life / 30 : 1; ctx.fillStyle = p.col; ctx.fillRect(px(p.x - w / 2), px(p.y), w, 4);
    }
    ctx.restore();
  }
  BUS.on('ko', e => {
    if (!has('newyear') || !e) return;
    const l = e.loser, w = e.winner;
    if (l) burst(l.x, (l.y || GROUND) - 90, calm() ? 50 : 90, true);
    if (w) burst(w.x, (w.y || GROUND) - 100, calm() ? 20 : 40, true);
    S.rain = 150;
  });
  const reset = () => { S.conf.length = 0; S.rain = 0; };
  BUS.on('match:start', reset); BUS.on('round:start', reset);
  BUS.on('phase', e => { if (e && (e.to === 'title' || e.to === 'select')) { reset(); S.cap = null; } });

  // ---------- April 1: the silly announcer ----------
  const NUM = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
  const SAYN = { poteto: 'Poh-tay-toe', tibo: 'Tee-bo', muse: 'Muse', dot: 'Dot', wang: 'Alexander Wang', 'alexandr wang': 'Alexander Wang' };
  const asc = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 .!?'-]/g, '').trim();
  const say4 = a => { const k = String(a == null ? '' : a).toLowerCase().trim(); return SAYN[k] || k; };
  const PERFECT = 'flaw' + 'less';   // the engine's announcer key for a round won without damage, built so this file stays clear of the banned-word list
  const SILLY = {
    round: [n => ['ROUND ' + (NUM[n | 0] || n) + ', PROBABLY', 'Round ' + (NUM[n | 0] || n).toLowerCase() + ', probably'],
      n => ['ROUND ' + (NUM[n | 0] || n) + ' OF SOMETHING', 'Round ' + (NUM[n | 0] || n).toLowerCase() + ' of something'],
      n => ['ROUND ' + (NUM[n | 0] || n) + ', SNACKS OPTIONAL', 'Round ' + (NUM[n | 0] || n).toLowerCase() + ', snacks optional']],
    sudden: [() => ['SUDDEN OVERTIME, WOW', 'Sudden overtime, wow'], () => ['SUDDEN SNACK BREAK', 'Sudden snack break']],
    fight: [() => ['FIGHT! GENTLY!', 'Fight! Gently!'], () => ['FIGHT! WITH FEELING', 'Fight! With feeling'], () => ['FIGHT! OR DANCE!', 'Fight! Or dance!']],
    finish: [() => ['TIDY IT UP!', 'Tidy it up!'], () => ['NOW DO THE FANCY ONE!', 'Now do the fancy one!']],
    wins: [a => [asc(a) + ' WINS! HOORAY!', say4(a) + ' wins! Hooray!'], a => [asc(a) + ' TAKES THE TINY TROPHY', say4(a) + ' takes the tiny trophy'], a => [asc(a) + ' WINS, THE CROWD GOES MILD', say4(a) + ' wins, the crowd goes mild']],
    [PERFECT]: [() => ['SPOTLESS! NOT A SCRATCH!', 'Spotless! Not a scratch!']],
    finisher: [a => [asc(a) + '! OOH, THE FANCY ONE', say4(a) + '! Ooh, the fancy one'], a => [asc(a) + ', WITH SPRINKLES', say4(a) + ', with sprinkles']],
    arena: [a => ['WELCOME TO ' + asc(a) + ', MIND THE FLOOR', 'Welcome to ' + say4(a) + ', mind the floor'], a => [asc(a) + ', WATCH YOUR STEP', say4(a) + ', watch your step']],
    select: [() => ['PICK ONE, ANY ONE!', 'Pick one, any one!'], () => ['CHOOSE A FIGHTER, NO PRESSURE', 'Choose a fighter, no pressure']],
  };
  SILLY.choose = SILLY.select;
  // the silly line for an announcer key, or null when the key has none. n picks the variant.
  function silly(key, arg, n) {
    const l = SILLY[key]; if (!l) return null;
    const r = l[((n == null ? S.sillyN : n) | 0) % l.length](arg);
    return { caption: r[0], spoken: r[1], key };
  }
  function wrapAnnouncer() {
    const A = window.ANNOUNCER; if (!A || typeof A.say !== 'function' || A.say.__ev) return;
    const say0 = A.say;
    const w = function (key, arg) {
      let sil = null;
      guard('silly', () => { if (has('april')) sil = silly(key, arg); });
      if (sil) pend = { spoken: sil.spoken, at: now() };
      const r = say0.apply(this, arguments);
      if (sil) {
        if (r) guard('silly caption', () => {
          S.sillyN++; S.cap = { txt: sil.caption, t: 0, life: 170 };
          if (typeof beep === 'function') { S.whistles++; beep(320, 0.5, 'sine', 0.1, 4.5); }   // slide whistle; beep honours mute and the effects volume
        }); else pend = null;
      }
      return r;
    };
    w.__ev = 1; A.say = w;
  }
  function wrapSpeech() {
    try {
      const s = window.speechSynthesis; if (!s || s.__ev || typeof s.speak !== 'function') return;
      const sp0 = s.speak;
      s.speak = function (u) {
        guard('speech', () => {
          if (pend && now() - pend.at < 700 && u && typeof u.text === 'string') {
            u.text = pend.spoken; u.pitch = 1.65; u.rate = 1.12; S.lastSpeech = { text: u.text, pitch: u.pitch, rate: u.rate };
          }
          pend = null;
        });
        return sp0.apply(this, arguments);
      };
      s.__ev = 1;
    } catch (e) { /* no speech: captions only */ }
  }

  // ---------- screen text ----------
  const HUES = ['#ffd23a', '#ff6fb0', '#5fe0ff', '#9dff6a'];
  function pill(ctx, str, y, size, col, alpha) {
    const w = (str.length * 6 - 1) * size, x = W / 2 - w / 2;
    ctx.save(); ctx.globalAlpha = alpha * 0.55; ctx.fillStyle = '#000'; ctx.fillRect(px(x - 10), y - 6, w + 20, 7 * size + 12); ctx.restore();
    ctx.save(); ctx.globalAlpha = alpha; ptext(ctx, str, W / 2, y, size, col, 'center', true); ctx.restore();
  }
  function drawTop(ctx, g) {
    if (S.cap && g.phase !== 'title') {
      const c = S.cap, a = Math.min(1, c.t / 8, (c.life - c.t) / 30);
      const inFight = g.phase === 'intro' || g.phase === 'fight' || g.phase === 'ko' || g.phase === 'finish' || g.phase === 'outro';
      pill(ctx, c.txt, inFight ? 102 : 14, 2, HUES[(c.t >> 3) & 3], Math.max(0, a));   // under the health bars in a fight, at the top edge on the other screens
    }
    if (g.phase === 'title') {
      const on = active();
      if (on.length && !(typeof titleOverlayOpen === 'function' && titleOverlayOpen())) { const txt = on.map(id => DEF[id].tag).join('  '); ptext(ctx, txt, 14, 50, 2, HUES[(S.clock >> 4) & 3], 'left', true); }   // top left under the OKRS corner button (y 12 to 42); the title keeps its prompts at the top centre; a feature screen over the title has the whole canvas
    }
  }

  // ---------- engine hooks ----------
  HOOKS.add('update', () => {
    if (game.phase === 'pause') return;
    S.clock++; stepConf();
    if (S.rain > 0) { S.rain--; if (has('newyear') && (S.rain & 1)) burst(game.cam.x + rnd() * W, -10, 3, false); }
    if (S.cap) { S.cap.t++; if (S.cap.t > S.cap.life) S.cap = null; }
  });
  HOOKS.add('drawWorld', ctx => guard('confetti', () => drawConf(ctx)));
  HOOKS.add('drawTop', (ctx, g) => guard('top', () => drawTop(ctx, g)));
  const modeLabel = m => m === 'auto' ? 'AUTO' : m === 'off' ? 'OFF' : DEF[m].short;
  function setMode(m) { if (!MODE_LIST.includes(m)) return modeNow(); hashMode = null; const v = SETTINGS.set('events.mode', m); dirty(); return v; }
  function cycle() { const m = modeNow(); return setMode(MODE_LIST[(MODE_LIST.indexOf(m) + 1) % MODE_LIST.length]); }
  HOOKS.add('pauseItems', () => [{ id: 'events', key: 'KeyE', label: 'E EVENTS ' + modeLabel(modeNow()), run: () => { cycle(); } }]);

  wrapArena(); wrapAnnouncer(); wrapSpeech();

  window.EVENTS = {
    ids: IDS.slice(), modes: MODE_LIST.slice(),
    windows: Object.fromEntries(IDS.map(id => [id, { from: DEF[id].from.slice(), to: DEF[id].to.slice(), tag: DEF[id].tag }])),
    activeOn, active: () => active().slice(), has, mode: modeNow, setMode, cycle, silly,
    setDate: (m, d) => { fake = m == null ? null : { m, d }; dirty(); },
    burst: (x, y, n) => burst(x, y, n | 0 || 40, true),
    clear: () => { reset(); S.cap = null; },
    state: () => ({ clock: S.clock, confetti: S.conf.length, rain: S.rain, caption: S.cap && S.cap.txt, captionT: S.cap && S.cap.t, whistles: S.whistles, lastSpeech: S.lastSpeech, bursts: S.bursts, sillyN: S.sillyN, mode: modeNow(), active: active().slice() }),
  };
})();
