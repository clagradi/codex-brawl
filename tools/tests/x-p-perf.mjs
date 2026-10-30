// Tests for p-perf.js (frame-time overlay, adaptive quality, arena snapshot cache). Owner: the perf agent. Runs after core.mjs.
// Everything is driven with hold(true), step(n) and render(), so the checks are deterministic. Automation never adapts the quality by
// itself (its timings are not a player's device), so the adaptive controller is driven with PERF.feed(ms, frames).
// Hooks used by p-perf.js: drawTop. Setting: perf.quality. BUS: emits perf:level.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    window.PP = {};
    PP.seed = s => { Math.random = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; })(s); };
    PP.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    PP.sum = () => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let h = 0; for (let k = 0; k < d.length; k += 4) h = (h * 31 + d[k] + d[k + 1] * 3 + d[k + 2] * 7) >>> 0; return h; };
    PP.fresh = (i, j, cpu) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); PP.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = !!cpu; return [a, b];
    };
    PP.levels = []; BUS.on('perf:level', e => PP.levels.push(e && e.name));
  })()`);

  // ---- structure ----
  const s0 = await ev(`({ api: typeof PERF === 'object' && ['stats', 'bench', 'feed', 'reset', 'probe', 'level', 'cycleQuality'].every(k => typeof PERF[k] === 'function'),
    q: SETTINGS.get('perf.quality'), def: (SETTINGS.list().find(d => d.key === 'perf.quality') || {}).values, hook: HOOKS.has('drawTop'),
    level: PERF.level(), automated: PERF.stats().automated, budget: PERF.BUDGET, overlay: PERF.overlay })`);
  check(s0.api && s0.hook, 'PERF is loaded and draws its overlay through the drawTop hook');
  check(s0.q === 'auto' && JSON.stringify(s0.def) === '["auto","high","low"]', 'perf.quality defaults to auto (values auto, high, low)');
  check(s0.level === 0 && s0.budget === 12 && s0.overlay === false, 'quality starts at HIGH with a 12 ms budget and the overlay hidden');
  check(s0.automated === true, 'the headless run is seen as automation, so the quality never adapts by itself here');

  // ---- arena cache (forced on): the snapshot reproduces itself and the normal draw, on several arenas and camera views ----
  // The browser may move a few anti-aliased edge pixels when a paint goes through a second canvas, so the comparison with the normal
  // draw allows a handful of pixels; repeated cached frames must match each other exactly.
  const c1 = await ev(`(() => {
    PP.fresh(0, 1, true); step(200); game.shake = 0; PERF.reset();
    const out = { arenas: [], cams: [] }, cam = game.cam;
    const grab = () => ctx.getImageData(0, 0, cv.width, cv.height).data;
    const diff = (p, q) => { let n = 0; for (let k = 0; k < p.length; k += 4) if (p[k] !== q[k] || p[k + 1] !== q[k + 1] || p[k + 2] !== q[k + 2]) n++; return n; };
    const one = () => { PERF.cache = 'off'; render(); const a = grab(); PERF.cache = 'on'; const h0 = PERF.stats().cache.hits; render(); const b = PP.sum(), B = grab(); render(); const c = PP.sum(); render(); const d = PP.sum();
      return { self: b === c && c === d, px: diff(a, B), hits: PERF.stats().cache.hits - h0 }; };
    for (const k of [0, 3, 7, 11, 15, ARENAS.length - 1]) { game.arena = k; out.arenas.push(Object.assign({ k, probe: PERF.probe(k) }, one())); }
    game.arena = 0;
    for (const [z, x] of [[1.2, 80], [1.2, -80], [1.1, 30]]) { cam.zoom = z; cam.x = x; out.cams.push(Object.assign({ z, x }, one())); }
    cam.zoom = 1; cam.x = 0; PERF.cache = 'auto';
    return out;
  })()`);
  const worst = Math.max(...c1.arenas.concat(c1.cams).map(r => r.px));
  check(c1.arenas.every(r => r.probe), 'every probed arena paints the whole view opaquely, so it may be cached');
  check(c1.arenas.every(r => r.self && r.hits === 2), 'six arenas: one miss paints the snapshot, two hits repeat it pixel for pixel');
  check(c1.cams.every(r => r.self && r.hits === 2), 'the knockout camera (zoomed and panned) is cached the same way');
  check(worst <= 100, 'a cached frame differs from a normal draw by at most a few edge pixels (worst ' + worst + ' of 518400)');

  const c2 = await ev(`(() => {
    PERF.cache = 'on'; const k = game.arena, A = ARENAS[k], d0 = A.draw; let calls = 0;
    A.draw = function () { calls++; return d0.apply(this, arguments); };
    const out = {};
    try {
      render(); render(); render(); out.held = calls;
      step(1); game.shake = 0; render(); render(); out.tick = calls;   // a hit in this one tick would start a shake, and its random jitter changes the cache key between the two renders
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' })); render(); out.input = calls;
      SETTINGS.set('perf.quality', 'high'); render(); out.setting = calls;
      PERF.cache = 'off'; render(); render(); out.off = calls;
      PERF.cache = 'on'; render(); const rs = Math.random; Math.random = () => 0.9; game.shake = 6; const b0 = PERF.stats().cache.bypass; render(); out.shake = calls; out.bypass = PERF.stats().cache.bypass - b0; Math.random = rs; game.shake = 0;
      PERF.cache = 'auto'; render(); render(); out.auto = calls; out.autoOn = PERF.stats().cache.on;
    } finally { A.draw = d0; SETTINGS.set('perf.quality', 'auto'); }
    return out;
  })()`);
  check(c2.held === 1, 'three renders of one held tick paint the arena once and reuse it twice');
  check(c2.tick === 2 && c2.input === 3 && c2.setting === 4, 'a new tick, an input event and a settings change each repaint the arena');
  check(c2.off === 6, 'with the cache off every render paints the arena');
  check(c2.shake === 8 && c2.bypass === 1, 'a screen shake that shows the stage edge bypasses the cache and paints normally');
  check(c2.auto === 10 && c2.autoOn === false, 'in auto mode the cache stays idle while the game is held (it only helps displays faster than 60 Hz)');

  // ---- F3 overlay and Shift+F3 quality cycle ----
  await t.tap('F3');
  const o1 = await ev(`(() => { render(); return { on: PERF.overlay, sum: PP.sum() }; })()`);
  await t.tap('F3');
  const o2 = await ev(`(() => { render(); return { on: PERF.overlay, sum: PP.sum() }; })()`);
  check(o1.on === true && o2.on === false && o1.sum !== o2.sum, 'F3 shows the frame budget overlay and hides it again');
  const o3 = await ev(`(() => {
    const k = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'F3', shiftKey: true }));
    const out = []; for (let i = 0; i < 3; i++) { k(); out.push(SETTINGS.get('perf.quality') + ':' + PERF.level()); }
    return { out, overlay: PERF.overlay };
  })()`);
  check(o3.out.join(' ') === 'high:0 low:2 auto:0' && o3.overlay === false, 'Shift+F3 cycles the quality AUTO, HIGH, LOW and back to AUTO');

  // ---- adaptive quality ----
  const a1 = await ev(`(() => {
    PERF.reset(); PP.levels.length = 0; const W0 = PERF.WINDOW, out = {};
    out.d1 = PERF.feed(15, W0); out.d2 = PERF.feed(15, W0); out.d3 = PERF.feed(15, W0);
    out.u1 = PERF.feed(3, W0 * 2); out.u1b = PERF.feed(3, W0); out.u2 = PERF.feed(3, W0 * 3);
    out.mid = PERF.feed(9, W0 * 5);
    out.d4 = PERF.feed(14, W0); out.held = PERF.feed(2, W0 * 6);
    const st = PERF.stats(); out.downs = st.downs; out.ups = st.ups;
    SETTINGS.set('perf.quality', 'high'); out.forcedHigh = PERF.level(); SETTINGS.set('perf.quality', 'low'); out.forcedLow = PERF.level(); SETTINGS.set('perf.quality', 'auto');
    out.events = PP.levels.join(' ');
    PERF.reset(); return out;
  })()`);
  check(a1.d1 === 1 && a1.d2 === 2 && a1.d3 === 2, 'frames over 12 ms on average step the quality down to MEDIUM, then LOW, and no further');
  check(a1.u1 === 2 && a1.u1b === 1 && a1.u2 === 0, 'three windows in a row under 6 ms step it back up one level at a time');
  check(a1.mid === 0, 'frames between 6 and 12 ms leave the level where it is');
  check(a1.d4 === 1 && a1.held === 1 && a1.downs === 3 && a1.ups === 2, 'after three step-downs the level no longer climbs back (no see-saw on a borderline device)');
  check(a1.forcedHigh === 0 && a1.forcedLow === 2, 'perf.quality high and low override the adaptive level');
  check(a1.events === 'MEDIUM LOW MEDIUM HIGH MEDIUM', 'every adaptive level change is announced on the BUS as perf:level');

  // late frames (a display capped at 30 Hz, a slow GPU) count as frames over budget; repeated ticks on a fast display do not
  const a2 = await ev(`(() => {
    PERF.reset(); const W = PERF.WARMUP, N = PERF.WINDOW, out = {};
    out.late = PERF.feedFrame(33, 3, W + N);
    out.stay = PERF.feedFrame(33, 3, N * 5);
    PERF.reset(); out.fast = PERF.feedFrame(8, 3, W + N * 4);
    PERF.reset(); out.fastRepeat = PERF.feedFrame(8, 30, W + N * 4, false);
    PERF.reset(); out.lateRepeat = PERF.feedFrame(33, 30, W + N * 4, false);
    PERF.reset(); out.sixty = PERF.feedFrame(16.7, 3, W + N * 4);
    PERF.reset(); PERF.feedFrame(16.7, 3, W);
    for (let k = 0; k < N; k++) PERF.feedFrame(k % 30 ? 16.7 : 40, 3, 1);
    out.occasional = PERF.stats().windowAvg;
    out.level = PERF.level(); out.limit = PERF.LATE;
    SETTINGS.set('perf.quality', 'high'); PERF.reset(); out.forced = PERF.feedFrame(33, 3, W + N * 2); SETTINGS.set('perf.quality', 'auto');
    PERF.reset(); return out;
  })()`);
  check(a2.late === 1 && a2.stay === 2, 'sustained late frames (33 ms apart) step the quality down even when the main thread is idle, then down again');
  check(a2.fast === 0 && a2.sixty === 0, 'frames 8 ms (a fast display) or 16.7 ms apart with a light load never step it down');
  check(a2.fastRepeat === 0 && a2.lateRepeat === 0, 'frames that run no tick are never counted, whatever the gap and the work');
  check(a2.occasional < 6 && a2.level === 0 && a2.limit === 25, 'one late frame in thirty moves the window average by under 1 ms and leaves the level alone');
  check(a2.forced === 0, 'a forced quality ignores late frames');

  // ---- what the lower levels drop ----
  const l1 = await ev(`(() => {
    PP.fresh(0, 1, true); step(120); game.shake = 0; PERF.reset(); PERF.cache = 'off';
    const out = {};
    render(); out.high = PP.sum();
    PERF.feed(15, PERF.WINDOW); render(); out.medium = PP.sum();
    SETTINGS.set('perf.quality', 'low'); render(); out.low = PP.sum();
    const o = { flash: 0, red: 0, grade: 1 };
    out.lowOpts = PERF.postOpts(o); SETTINGS.set('perf.quality', 'high'); out.highSame = PERF.postOpts(o) === o && o.grade === 1 && !('vignette' in o);
    const burst = () => { FX.clear && FX.clear(); let max = 0; for (let i = 0; i < 40; i++) { FX.blood(400, 380, 1, 3); FX.sparks(500, 380, '#fff', 20); FX.dust(450, GROUND); max = Math.max(max, FX.count); } return max; };
    SETTINGS.set('perf.quality', 'high'); out.fxHigh = burst();
    SETTINGS.set('perf.quality', 'low'); out.fxLow = burst(); out.skipped = PERF.stats().fx.skipped;
    SETTINGS.set('perf.quality', 'auto'); PERF.reset(); PERF.cache = 'auto'; FX.clear && FX.clear();
    return out;
  })()`);
  check(l1.high !== l1.medium && l1.medium !== l1.low && l1.high !== l1.low, 'MEDIUM and LOW each draw a lighter picture than HIGH');
  check(l1.lowOpts && l1.lowOpts.grade === 0 && l1.lowOpts.vignette === 0 && l1.highSame, 'LOW turns off the colour grade and the vignette; HIGH hands drawPost its options untouched');
  check(l1.fxLow < l1.fxHigh && l1.fxLow <= 200 && l1.skipped > 0, 'LOW caps the particle count (' + l1.fxLow + ' against ' + l1.fxHigh + ' at HIGH)');

  // ---- gameplay is the same at every quality ----
  const g1 = await ev(`(() => {
    const play = (q, cache) => {
      SETTINGS.set('perf.quality', q); PERF.reset(); PERF.cache = cache; PP.seed(77); FX.seed && FX.seed(5);
      const [a, b] = PP.fresh(2, 3, true); const log = [];
      for (let i = 0; i < 1500; i++) { step(1); render(); if (i % 25 === 0) log.push([a.x | 0, a.y | 0, a.hp, b.x | 0, b.y | 0, b.hp, a.state, b.state, game.phase, game.round].join(',')); }
      return log.join(';');
    };
    const out = { high: play('high', 'off') };
    out.cached = play('high', 'on'); out.low = play('low', 'off'); out.hits = PERF.stats().cache.hits;
    SETTINGS.set('perf.quality', 'auto'); PERF.reset(); PERF.cache = 'auto';
    return { sameCached: out.high === out.cached, sameLow: out.high === out.low, len: out.high.length, moved: new Set(out.high.split(';')).size };
  })()`);
  check(g1.len > 0 && g1.moved > 20, 'the seeded CPU match plays out (' + g1.moved + ' distinct snapshots)');
  check(g1.sameCached, 'a seeded CPU match plays out identically with the arena cache on');
  check(g1.sameLow, 'a seeded CPU match plays out identically at LOW quality (fewer particles never change the fight)');

  // ---- clean up for the tests that follow ----
  await ev(`(() => { SETTINGS.reset('perf.quality'); PERF.reset(); PERF.cache = 'auto'; PERF.overlay = false; delete window.PP; })()`);
}
