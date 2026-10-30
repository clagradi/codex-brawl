// ===== AGENT BRAWL feature file: PERF (premium performance pack). =====
// Owner: perf agent (branch feat/p-perf).
// Area: a frame-time budget overlay (F3), adaptive quality for slow devices (fewer particles and lighter post-processing when the
//       average frame costs more than 12 ms, or the display delivers frames late: a gap over 25 ms counts as a frame over budget), and an offscreen snapshot cache for the arena on frames that repeat a simulation tick
//       (a display refreshing faster than the 60 Hz simulation draws every tick two or more times), used below HIGH only.
// Hooks used: 'drawTop' (order 1000: the overlay, over everything else).
// BUS used: 'settings' (a change of any option invalidates the arena cache; perf.quality restarts the sampling), 'match:start' and
//           'round:start' (sampling warm-up). Emits 'perf:level' { level, name } when the adaptive level changes.
// Settings: perf.quality ('auto' | 'high' | 'low').
// Engine touch points that are not hooks (nothing in game.js is edited): window.frame, window.update and window.render are wrapped to
//   time them; window.drawArena is wrapped for the cache; window.drawPost is wrapped so the lower levels drop the colour grade (and, at
//   LOW, the vignette); FX.blood, FX.sparks, FX.dust and FX.ring are wrapped so the lower levels cap the particle count. ARENAS2.react
//   (when present) invalidates the cache.
// At HIGH nothing changes: every wrapper passes straight through (the same arguments, the same draw calls, no cache), so the pixels and
// the gameplay are those of the game without this file. PERF.cache = 'on' forces the cache at any level (tests and the bench).
// Public: window.PERF (see the end of the file) for tests, tools and other feature files.
'use strict';
(() => {
  const BUDGET = 12;                 // ms of main-thread work per frame before the adaptive quality steps down
  const RECOVER = BUDGET / 2;        // a lower level steps back up only when frames cost under half the budget...
  const GOOD_WINDOWS = 3;            // ...for three windows in a row
  const MAX_DOWNS = 3;               // after three step-downs the level stays where it is (no see-saw on a borderline device)
  const WINDOW = 180;                // frames per averaging window (3 s at 60 Hz)
  const CLAMP = 1000 / 30;           // one slow frame (a tab switch, a garbage collection) counts as 33 ms at most
  const LATE = 1.5 * 1000 / 60;      // a gap between frames over 25 ms (a 30 Hz-capped display, a slow GPU) counts as a frame over budget
  const WARMUP = 45;                 // frames ignored after a match or round starts (stage build, first draw of new sprites)
  const HIST = 120;                  // frames in the overlay graph
  const NAMES = ['HIGH', 'MEDIUM', 'LOW'];
  const FX_CAP = [Infinity, 300, 140];   // live particles + splats allowed before a new burst is skipped
  const SPARK_CAP = [Infinity, 12, 6];   // sparks per burst
  const BLOOD_CAP = [Infinity, 2.2, 1.4]; // blood burst power
  // The arena probe draws the real game views (zoom 1 centred, and the zoom 1.2 knockout camera at both pan extremes, which keeps the
  // view inside the stage) over black and over white; an arena is cached only when every probe pixel is the same on both.
  const PROBE_CAM = 80, PROBE_VIEWS = [[1, 0], [1.1, -40], [1.1, 40], [1.2, -PROBE_CAM], [1.2, PROBE_CAM]];
  const now = () => performance.now();
  const r2 = v => Math.round(v * 100) / 100;

  SETTINGS.define('perf.quality', { def: 'auto', values: ['auto', 'high', 'low'], label: 'QUALITY' });
  const quality = () => { try { return SETTINGS.get('perf.quality') || 'auto'; } catch (e) { return 'auto'; } };
  // Automation (webdriver, headless Chrome) never adapts by itself: its timings are not a player's device, and screenshot tests must stay
  // put. PERF.feed drives the controller there.
  const AUTOMATED = !!(navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent || ''));

  const S = {
    overlay: /(^#|[#&])perf(\b|$)/.test(location.hash || ''),
    force: null,                     // a level forced by PERF.bench (null: follow the setting)
    auto: 0, downs: 0, ups: 0, good: 0, warm: WARMUP, win: [], lastAvg: 0,
    hist: new Float32Array(HIST), hi: 0, frames: 0, last: 0, gap: 0, work: 0, upd: 0, draw: 0,
    text: null, textAt: -99,
  };
  function level() {
    if (S.force != null) return S.force;
    const q = quality(); return q === 'high' ? 0 : q === 'low' ? 2 : S.auto;
  }
  function setAuto(lv) {
    lv = Math.max(0, Math.min(2, lv)); if (lv === S.auto) return;
    S.auto = lv; S.win.length = 0; S.good = 0; S.warm = WARMUP; S.text = null;
    BUS.emit('perf:level', { level: lv, name: NAMES[lv] });
  }
  // One frame's cost into the controller: the average of a full window decides.
  function sample(ms) {
    S.win.push(Math.min(CLAMP, Math.max(0, +ms || 0)));
    if (S.win.length < WINDOW) return;
    let sum = 0; for (const v of S.win) sum += v;
    const avg = sum / S.win.length; S.win.length = 0; S.lastAvg = avg;
    if (avg > BUDGET) { S.good = 0; if (S.auto < 2) { S.downs++; setAuto(S.auto + 1); } }
    else if (avg < RECOVER && S.auto > 0 && S.downs < MAX_DOWNS) { if (++S.good >= GOOD_WINDOWS) { S.ups++; setAuto(S.auto - 1); } }
    else S.good = 0;
  }
  BUS.on('settings', e => { if (e && e.key === 'perf.quality') { S.win.length = 0; S.good = 0; S.warm = WARMUP; S.text = null; } });
  for (const ev of ['match:start', 'round:start']) BUS.on(ev, () => { S.win.length = 0; S.warm = WARMUP; });

  // ---------------------------------------------------------------- timing: frame, update, render
  let ticks = 0, updMs = 0, drawMs = 0, inRender = false, arenaCalls = 0, gen = 0;
  const zring = new Uint8Array(120); let zi = 0, zn = 0, zsum = 0;   // which of the last 120 live frames ran no tick
  const live = () => running && !document.hidden;

  const update0 = window.update;
  window.update = function () { gen++; ticks++; const a = now(); try { return update0.apply(this, arguments); } finally { updMs += now() - a; } };
  const render0 = window.render;
  window.render = function () {
    const a = now(); inRender = true; arenaCalls = 0;
    try { return render0.apply(this, arguments); } finally { inRender = false; drawMs += now() - a; }
  };
  const frame0 = window.frame;
  window.frame = function (ts) {
    const a = now(); ticks = 0; updMs = 0; drawMs = 0;
    try { return frame0.apply(this, arguments); } finally { afterFrame(ts, now() - a); }
  };
  function afterFrame(ts, work) {
    const gap = S.last ? ts - S.last : 0; S.last = ts;
    S.hist[S.hi] = work; S.hi = (S.hi + 1) % HIST; S.frames++; S.work = work; S.upd = updMs; S.draw = drawMs;
    if (gap > 0 && gap < 250) S.gap = S.gap ? S.gap * 0.9 + gap * 0.1 : gap;
    if (!live()) { zn = zsum = zi = 0; zring.fill(0); S.win.length = 0; S.warm = Math.max(S.warm, 10); return; }
    zsum -= zring[zi]; zring[zi] = ticks ? 0 : 1; zsum += zring[zi]; zi = (zi + 1) % zring.length; if (zn < zring.length) zn++;
    if (gap <= 0 || gap > 100) { S.win.length = 0; S.warm = Math.max(S.warm, 10); return; }   // the loop was away: start the window again
    countFrame(gap, work, ticks, !AUTOMATED);
  }
  // The end of afterFrame, also driven by PERF.feedFrame. A late frame costs at least a frame over budget whatever the main thread spent
  // (the time went to the display), so a device that cannot hold 60 Hz steps down and, its late frames still counting, stays down.
  function countFrame(gap, work, hadTick, adapt) {
    if (!hadTick) return;          // a repeat of the last tick on a fast display: not a full frame of work, however short the gap
    if (S.warm > 0) { S.warm--; return; }
    if (adapt && quality() === 'auto' && S.force == null) sample(gap > LATE ? Math.max(work, BUDGET + 1) : work);
  }

  // ---------------------------------------------------------------- low quality: post-processing and particles
  const post0 = window.drawPost;
  function postOpts(opts) {   // HIGH hands drawPost the very same options object; MEDIUM drops the colour grade, LOW the vignette too
    const lv = level(); if (!lv) return opts;
    opts = Object.assign({}, opts); opts.grade = 0; if (lv > 1) opts.vignette = 0; return opts;
  }
  window.drawPost = function (c, t, opts) { return post0.call(this, c, t, postOpts(opts)); };
  const fxStats = { skipped: 0 };
  if (typeof FX === 'object' && FX) {
    const room = () => FX.count < FX_CAP[level()];
    const wrap = (name, cap) => {
      const f0 = FX[name]; if (typeof f0 !== 'function') return;
      FX[name] = function () {
        const lv = level(); if (!lv) return f0.apply(this, arguments);
        if (!room()) { fxStats.skipped++; return; }
        const a = Array.prototype.slice.call(arguments); if (cap) cap(a, lv); return f0.apply(this, a);
      };
    };
    wrap('sparks', (a, lv) => { if (a[3] != null) a[3] = Math.min(+a[3] || 0, SPARK_CAP[lv]); });
    wrap('blood', (a, lv) => { if (a[3] != null) a[3] = Math.min(+a[3] || 0, BLOOD_CAP[lv]); });
    wrap('dust'); wrap('ring');
  }

  // ---------------------------------------------------------------- arena snapshot cache
  // On a frame that runs no simulation tick, the arena is painted with exactly the same inputs as on the frame before. If the paint
  // covers the whole view with opaque pixels (proved once per arena by painting it over black and over white), the arena is painted
  // once into an offscreen canvas and copied onto the game canvas for every frame with the same inputs.
  // The cache is not pixel-exact, so AUTO uses it only below HIGH. Measured in headless Chrome: painting into a second canvas moves a few
  // anti-aliased edge pixels, and reading the game canvas back in mid-frame (the only other way to capture the arena) makes the
  // browser flush, which moves a few edge pixels of what is drawn after it. Either way it is under 20 pixels of a 518 400 pixel frame.
  const C = { mode: 'auto', key: '', snap: null, sctx: null, hits: 0, misses: 0, bypass: 0, probes: {}, probing: false };
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'wheel', 'resize', 'blur', 'focus', 'visibilitychange'])
    addEventListener(ev, () => { gen++; }, { capture: true, passive: true });
  BUS.on('settings', () => { gen++; });
  if (window.ARENAS2 && typeof ARENAS2.react === 'function') { const r0 = ARENAS2.react; ARENAS2.react = function () { gen++; return r0.apply(this, arguments); }; }

  function cacheWanted() {
    if (C.mode === 'off') return false;
    if (C.mode === 'on') return true;
    // auto: only below HIGH, and only while frames without a tick are common (a display refreshing at 90 Hz or faster)
    return level() > 0 && live() && zn >= 60 && zsum / zn > 0.2;
  }
  const arenaIndex = i => { const n = ARENAS.length; i = Math.floor(+i) || 0; return ((i % n) + n) % n; };
  function probeArena(idx, t) {
    const cw = cv.width, ch = cv.height, AY = GROUND - 60, out = [];
    const mk = () => { const k = document.createElement('canvas'); k.width = cw; k.height = ch; return k.getContext('2d', { willReadFrequently: true }); };
    const pa = mk(), pb = mk();
    let ok = true;
    try {
      for (const [z, x] of PROBE_VIEWS) {
        for (const [g, col] of [[pa, '#000'], [pb, '#fff']]) {
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = col; g.fillRect(0, 0, cw, ch);
          g.setTransform(cw / W, 0, 0, ch / H, 0, 0); g.translate(W / 2, AY); g.scale(z, z); g.translate(-(W / 2 + x), -AY);
          drawArena0(g, idx, t, { x, zoom: z });
        }
        const da = new Uint32Array(pa.getImageData(0, 0, cw, ch).data.buffer), db = new Uint32Array(pb.getImageData(0, 0, cw, ch).data.buffer);
        for (let k = 0; k < da.length; k++) if (da[k] !== db[k]) { ok = false; break; }
        out.push(x); if (!ok) break;
      }
    } catch (e) { ok = false; }
    C.probes[idx] = ok;
    return ok;
  }
  function scheduleProbe(idx) {
    if (C.probing || idx in C.probes) return; C.probing = true;
    setTimeout(() => { C.probing = false; if (!(idx in C.probes)) { try { probeArena(idx, game.tick); } catch (e) { C.probes[idx] = false; } } }, 0);
  }
  // The view, in the arena's own paint coordinates, stays inside the stage rectangle [0, W] x [0, H] that every arena paints in
  // full (a shake that shows the stage edge, or a camera wider than the stage, draws the arena normally instead of from the cache).
  function viewInside(m, cx, cw, ch) {
    const x0 = -m.e / m.a, x1 = (cw - m.e) / m.a, y0 = -m.f / m.d, y1 = (ch - m.f) / m.d, e = 1e-6;
    return Math.abs(cx) <= PROBE_CAM + e && x0 >= -e && x1 <= W + e && y0 >= -e && y1 <= H + e;
  }
  const drawArena0 = window.drawArena;
  window.drawArena = function (c, i, t, cam) {
    // only the fight view (drawWorld passes the live game.cam); menu backdrops pass their own pan and are drawn normally
    if (!inRender || arenaCalls++ || c !== ctx || !cam || cam !== game.cam || !cacheWanted()) return drawArena0.apply(this, arguments);
    const idx = arenaIndex(i), m = c.getTransform(), cw = c.canvas.width, ch = c.canvas.height, cx = (cam && +cam.x) || 0;
    const plain = !m.b && !m.c && m.a > 0 && m.d > 0 && c.globalAlpha === 1 && c.globalCompositeOperation === 'source-over'
      && (!c.filter || c.filter === 'none') && !c.shadowBlur && !c.shadowOffsetX && !c.shadowOffsetY;
    if (!plain || !viewInside(m, cx, cw, ch)) { C.bypass++; C.key = ''; return drawArena0.apply(this, arguments); }
    if (!(idx in C.probes)) {
      if (C.mode === 'on') probeArena(idx, t); else { scheduleProbe(idx); C.bypass++; return drawArena0.apply(this, arguments); }
    }
    if (!C.probes[idx]) { C.bypass++; return drawArena0.apply(this, arguments); }
    let key = gen + '|' + idx + '|' + t + '|' + game.phase + '|' + m.a + ',' + m.d + ',' + m.e + ',' + m.f + '|' + cw + 'x' + ch;
    if (cam) for (const k in cam) key += '|' + k + '=' + cam[k];
    // A miss paints the arena into the offscreen snapshot (never reading the game canvas back in the middle of a frame, which makes
    // the browser flush and can shift a few anti-aliased pixels of what is drawn after it), then both a miss and a hit copy the
    // snapshot onto the game canvas, so every cached frame sends the game canvas the same drawing commands.
    if (key !== C.key || !C.snap) {
      if (!C.snap || C.snap.width !== cw || C.snap.height !== ch) { C.snap = document.createElement('canvas'); C.snap.width = cw; C.snap.height = ch; C.sctx = C.snap.getContext('2d'); }
      const s = C.sctx; s.setTransform(1, 0, 0, 1, 0, 0); s.globalAlpha = 1; s.globalCompositeOperation = 'source-over'; s.filter = 'none';
      s.fillStyle = '#000'; s.fillRect(0, 0, cw, ch); s.setTransform(m); s.imageSmoothingEnabled = c.imageSmoothingEnabled;
      C.key = '';
      try { drawArena0.call(this, s, i, t, cam); } catch (e) { s.setTransform(1, 0, 0, 1, 0, 0); return drawArena0.apply(this, arguments); }
      s.setTransform(1, 0, 0, 1, 0, 0); C.key = key; C.misses++;
    } else C.hits++;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = false;
    c.drawImage(C.snap, 0, 0); c.restore();
  };

  // ---------------------------------------------------------------- overlay (F3) and quality cycling (Shift+F3)
  const CYCLE = ['auto', 'high', 'low'];
  function cycleQuality() { const q = quality(), n = CYCLE[(CYCLE.indexOf(q) + 1) % CYCLE.length]; SETTINGS.set('perf.quality', n); return n; }
  addEventListener('keydown', e => {
    if (e.code !== 'F3' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); if (e.repeat) return;
    if (e.shiftKey) cycleQuality(); else { S.overlay = !S.overlay; S.text = null; }
  });
  function stats() {
    let sum = 0, worst = 0, n = 0, over = 0;
    for (let k = 0; k < HIST; k++) { const v = S.hist[k]; if (!v) continue; sum += v; n++; if (v > worst) worst = v; if (v > BUDGET) over++; }
    return {
      avg: n ? r2(sum / n) : 0, worst: r2(worst), last: r2(S.work), update: r2(S.upd), draw: r2(S.draw), over: n ? Math.round(over * 100 / n) : 0,
      fps: S.gap ? Math.round(1000 / S.gap) : 0, frames: S.frames, quality: quality(), level: level(), name: NAMES[level()], auto: S.auto,
      downs: S.downs, ups: S.ups, windowAvg: r2(S.lastAvg), automated: AUTOMATED,
      cache: { mode: C.mode, on: cacheWanted(), hits: C.hits, misses: C.misses, bypass: C.bypass, probes: Object.assign({}, C.probes) },
      fx: { skipped: fxStats.skipped },
    };
  }
  const fix = v => (v < 10 ? v.toFixed(2) : v.toFixed(1));
  function overlayText() {
    const s = stats(), hit = s.cache.hits + s.cache.misses;
    return [
      ['FRAME BUDGET 12 MS', '#ffd76a'],
      ['AVG ' + fix(s.avg) + ' WORST ' + fix(s.worst), s.avg > BUDGET ? '#ff6b5c' : '#ffffff'],
      ['UPD ' + fix(s.update) + ' DRAW ' + fix(s.draw), '#ffffff'],
      ['FPS ' + s.fps + ' OVER ' + s.over + '%', s.over > 10 ? '#ff6b5c' : '#ffffff'],
      ['QUALITY ' + (s.quality === 'auto' ? 'AUTO ' : '') + s.name, s.level ? '#ffb02e' : '#7ee08a'],
      ['CACHE ' + (s.cache.on ? (hit ? Math.round(s.cache.hits * 100 / hit) : 0) + '% HIT' : 'IDLE'), '#9fd3ff'],
    ];
  }
  function drawOverlay(c) {
    const X = 8, Y = 96, GW = HIST * 2, GH = 48, PW = GW + 16, LH = 18;
    if (!S.text || S.frames - S.textAt >= 15 || S.frames < S.textAt) { S.text = overlayText(); S.textAt = S.frames; }
    const PH = 8 + GH + 8 + S.text.length * LH + 4;
    c.save(); c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = false;
    c.fillStyle = 'rgba(6,8,16,0.8)'; c.fillRect(X, Y, PW, PH); c.fillStyle = '#c9a24a'; c.fillRect(X, Y, PW, 1); c.fillRect(X, Y + PH - 1, PW, 1);
    const gx = X + 8, gy = Y + 8, sc = GH / CLAMP;
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(gx, gy, GW, GH);
    for (let k = 0; k < HIST; k++) {
      const v = S.hist[(S.hi + k) % HIST]; if (!v) continue;
      const bh = Math.max(1, Math.min(GH, Math.round(v * sc)));
      c.fillStyle = v > 1000 / 60 ? '#ff4d4d' : v > BUDGET ? '#ffb02e' : '#4dd17a'; c.fillRect(gx + k * 2, gy + GH - bh, 2, bh);
    }
    c.fillStyle = '#ffb02e'; c.fillRect(gx, gy + GH - Math.round(BUDGET * sc), GW, 1);
    c.fillStyle = '#ff4d4d'; c.fillRect(gx, gy + GH - Math.round(1000 / 60 * sc), GW, 1);
    let y = gy + GH + 8; for (const [txt, col] of S.text) { ptext(c, txt, gx, y, 2, col); y += LH; }
    c.restore();
  }
  HOOKS.add('drawTop', c => { if (S.overlay) drawOverlay(c); }, 1000);

  // ---------------------------------------------------------------- bench: the numbers in docs/features/p-perf.md
  // Call with the loop held (hold(true)) on a fight. Each figure is the mean of n draws, each followed by a 1-pixel read so the canvas
  // has really rasterised (without it Chrome only records the draw calls).
  function bench(n) {
    n = n || 40;
    const saved = { force: S.force, mode: C.mode, overlay: S.overlay }, flush = () => ctx.getImageData(0, 0, 1, 1);
    const time = fn => { fn(); flush(); const a = now(); for (let k = 0; k < n; k++) { fn(); flush(); } return r2((now() - a) / n); };
    const out = {};
    try {
      S.overlay = false;
      S.force = 0; C.mode = 'off';
      out.renderHigh = time(() => render());
      out.post = time(() => drawPost(ctx, game.tick, { flash: 0, red: 0 }));
      out.arena = time(() => drawArena0(ctx, game.arena, game.tick, game.cam));
      C.mode = 'on'; C.key = ''; const h0 = C.hits;
      out.renderCached = time(() => render()); out.cacheHits = C.hits - h0; out.cacheUsable = !!C.probes[arenaIndex(game.arena)];
      C.mode = 'off';
      S.force = 1; out.renderMedium = time(() => render()); out.postMedium = time(() => drawPost(ctx, game.tick, { flash: 0, red: 0 }));
      S.force = 2; out.renderLow = time(() => render()); out.postLow = time(() => drawPost(ctx, game.tick, { flash: 0, red: 0 }));
      const burst = () => { FX.clear(); for (let k = 0; k < 24; k++) { FX.blood(300 + k * 12, 380, k & 1 ? 1 : -1, 3); FX.sparks(320 + k * 12, 360, '#fff', 20); FX.dust(400, GROUND); } };
      S.force = 0; burst(); out.fxHigh = FX.count; out.fxDrawHigh = time(() => { FX.draw(ctx, 'floor'); FX.draw(ctx, 'air'); });
      S.force = 2; burst(); out.fxLow = FX.count; out.fxDrawLow = time(() => { FX.draw(ctx, 'floor'); FX.draw(ctx, 'air'); });
      FX.clear();
    } finally { S.force = saved.force; C.mode = saved.mode; S.overlay = saved.overlay; C.key = ''; }
    return out;
  }

  window.PERF = {
    BUDGET, WINDOW, WARMUP, LATE, NAMES,
    get overlay() { return S.overlay; }, set overlay(v) { S.overlay = !!v; S.text = null; },
    get cache() { return C.mode; }, set cache(v) { C.mode = v === 'on' || v === 'off' ? v : 'auto'; C.key = ''; },
    level, quality, stats, cycleQuality, bench,
    feed(ms, n) { n = Math.max(1, n | 0 || 1); for (let k = 0; k < n; k++) sample(ms); return S.auto; },   // drive the adaptive controller (tests)
    feedFrame(gap, work, n, hadTick) { n = Math.max(1, n | 0 || 1); for (let k = 0; k < n; k++) countFrame(gap, work, hadTick !== false, true); return S.auto; },   // the frame path of the controller, with a gap (tests)
    reset() { S.auto = 0; S.downs = S.ups = S.good = 0; S.win.length = 0; S.warm = WARMUP; S.force = null; C.key = ''; C.hits = C.misses = C.bypass = 0; fxStats.skipped = 0; S.text = null; },
    postOpts,
    probe: (i, t) => { const idx = arenaIndex(i); delete C.probes[idx]; return probeArena(idx, t == null ? game.tick : t); },
  };
  window.STUB_PERF = 1;
})();
