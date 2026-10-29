// Tests for p-a11y.js (colour filters, high-contrast HUD, larger text, reduced motion, screen-reader announcements, simple specials, the ACCESSIBILITY
// screen). Owner: the a11y agent. Runs after core.mjs. Everything is driven with hold(true) and step(n); render() runs the draw hooks when a check needs them.
// Every a11y.* setting is reset at the end, so the files after this one start from the defaults.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    for (const k of A11Y.keys) SETTINGS.reset(k);
    window.AY = {};
    AY.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    AY.down = c => dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    AY.up = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    AY.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    AY.fresh = (i, j, wins) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); AY.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; if (wins) game.wins = wins.slice(); step(1); return [a, b];
    };
    AY.place = dx => {
      const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; q.bufP = q.bufK = q.bufS = 0; }
      f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o];
    };
    AY.log = () => A11Y.state().log.join(' | ');
    AY.seen = { shake: 0, flash: 0, slow: 0 };   // what the engine's update works with after every update hook has run
    HOOKS.add('update', g => { for (const k in AY.seen) AY.seen[k] = Math.max(AY.seen[k], g[k] || 0); }, 999);
    AY.title = () => { dispatchEvent(new Event('blur')); game.hitstop = game.slow = 0; game.phase = 'title'; game.titleSel = 0; step(2); };
  })()`);

  // ---- structure ----
  const s0 = await ev(`(() => {
    const live = document.getElementById('a11y-live'), svg = document.getElementById('a11y-filters');
    return { stub: window.STUB_A11Y === 1, api: typeof A11Y === 'object' && ['open', 'close', 'matrix', 'mix', 'applyFilter', 'state'].every(k => typeof A11Y[k] === 'function'),
      keys: A11Y.keys.join(','), defs: A11Y.keys.map(k => SETTINGS.get(k)), labels: A11Y.keys.map(k => (SETTINGS.list().find(r => r.key === k) || {}).label || ''),
      role: live && live.getAttribute('role'), aria: live && live.getAttribute('aria-live'), atomic: live && live.getAttribute('aria-atomic'), liveW: live && live.getBoundingClientRect().width,
      filters: svg ? [...svg.querySelectorAll('filter')].map(f => f.id).join(',') : '', canFilter: A11Y.canFilter,
      title: titleItems().some(i => i.id === 'a11y' && i.label === 'ACCESSIBILITY'), lastTitle: titleItems().slice(-1)[0].label, pause: HOOKS.collect('pauseItems').some(i => i.id === 'a11y' && i.key === 'KeyY'),
      rows: A11Y.rows().join(',') };
  })()`);
  check(s0.stub && s0.api, 'A11Y is loaded (STUB_A11Y marker, open/close/matrix/mix/applyFilter/state)');
  check(s0.keys === 'a11y.cb,a11y.contrast,a11y.bigText,a11y.motion,a11y.live,a11y.simpleSp' && JSON.stringify(s0.defs) === '["off",false,false,false,true,false]',
    'the six a11y settings exist with their defaults (filter off, contrast, big text, motion and simple specials off, screen reader on): ' + JSON.stringify(s0.defs));
  check(s0.labels.every(l => /^[A-Z ]+$/.test(l)), 'every a11y setting has a capitals label for the options screens: ' + s0.labels.join(', '));
  check(s0.role === 'status' && s0.aria === 'polite' && s0.atomic === 'true' && s0.liveW <= 1, 'the screen-reader live region is role=status, aria-live=polite, atomic and visually hidden');
  check(s0.filters === 'a11y-cb-protan,a11y-cb-deutan,a11y-cb-tritan' && s0.canFilter, 'the three colour filters are SVG feColorMatrix filters and canvas filters are available');
  check(s0.title && s0.pause && s0.rows.endsWith(',BACK'), 'ACCESSIBILITY is a title entry and a pause item on Y; the screen ends with BACK');
  check(s0.lastTitle === 'OPTIONS', 'OPTIONS stays the last title entry (ACCESSIBILITY sits just before it): ' + s0.lastTitle);

  // ---- colour filters: the matrix keeps greys, separates the confused pair, and the canvas output matches it ----
  const cb = await ev(`(() => {
    const out = {}, near = (a, b, d) => a.every((v, i) => Math.abs(v - b[i]) <= d);
    out.grey = ['protan', 'deutan', 'tritan'].every(m => near(A11Y.mix(m, [128, 128, 128]), [128, 128, 128], 3) && near(A11Y.mix(m, [255, 255, 255]), [255, 255, 255], 4));
    out.off = JSON.stringify(A11Y.mix('off', [200, 30, 40]));
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const red = [200, 40, 40], green = [90, 140, 40];
    out.redShift = ['protan', 'deutan'].map(m => d(A11Y.mix(m, red), red));
    out.blueShift = d(A11Y.mix('tritan', [60, 60, 220]), [60, 60, 220]);
    // the canvas: four colours through applyFilter, read back, against the matrix
    const c = document.createElement('canvas'); c.width = 8; c.height = 2; const x = c.getContext('2d', { willReadFrequently: true });
    const cols = [[220, 30, 30], [40, 180, 60], [40, 60, 220], [120, 120, 120]];
    let worst = 0;
    for (const m of ['protan', 'deutan', 'tritan']) {
      cols.forEach((q, i) => { x.fillStyle = 'rgb(' + q.join(',') + ')'; x.fillRect(i * 2, 0, 2, 2); });
      A11Y.applyFilter(x, m);
      cols.forEach((q, i) => { const px = x.getImageData(i * 2, 0, 1, 1).data, want = A11Y.mix(m, q); worst = Math.max(worst, ...want.map((v, k) => Math.abs(v - px[k]))); });
    }
    out.worst = worst;
    // the real frame: drawTop applies the filter after everything else, every frame
    for (const k of A11Y.keys) SETTINGS.reset(k);
    render(); const before = ctx.getImageData(0, 0, 960, 540).data, f0 = A11Y.state().filtered;
    SETTINGS.set('a11y.cb', 'deutan'); render(); const after = ctx.getImageData(0, 0, 960, 540).data, f1 = A11Y.state().filtered;
    let diff = 0, n = 0, ok = 0; for (let k = 0; k < before.length; k += 4 * 211) { n++; if (before[k] !== after[k] || before[k + 1] !== after[k + 1] || before[k + 2] !== after[k + 2]) diff++; }
    // the same frame, filtered by hand, is the frame drawTop produced
    SETTINGS.set('a11y.cb', 'off'); render(); const raw = ctx.getImageData(0, 0, 960, 540).data;
    for (let k = 0; k < raw.length; k += 4 * 211) { const want = A11Y.mix('deutan', [raw[k], raw[k + 1], raw[k + 2]]); if (want.every((v, j) => Math.abs(v - after[k + j]) <= 3)) ok++; }
    out.frame = { counted: f1 - f0, diff, n, ok };
    SETTINGS.set('a11y.cb', 'protan'); out.protanFrame = (render(), A11Y.state().filtered - f1);
    SETTINGS.reset('a11y.cb'); const f2 = A11Y.state().filtered; render(); out.offFrame = A11Y.state().filtered - f2;
    return out;
  })()`);
  check(cb.grey, 'colour filters keep greys and white unchanged (they only move the colour a viewer cannot separate)');
  check(cb.off === '[200,30,40]', 'filter off passes colours through');
  check(cb.redShift.every(v => v > 25) && cb.blueShift > 25, 'protan and deutan move reds, tritan moves blues, so the confused pairs separate: ' + JSON.stringify(cb.redShift.concat(cb.blueShift).map(v => Math.round(v))));
  check(cb.worst <= 3, 'the canvas filter output matches the daltonisation matrix (max channel error ' + cb.worst + ')');
  check(cb.frame.counted === 1 && cb.frame.diff > cb.frame.n * 0.02 && cb.frame.ok >= cb.frame.n * 0.97 && cb.protanFrame === 1 && cb.offFrame === 0,
    'with a filter on, the whole rendered frame goes through it once (and not at all when off): ' + JSON.stringify(cb.frame));

  // ---- larger text ----
  const big = await ev(`(() => {
    const ink = (fn) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 380, 960, 120); fn(); ctx.restore(); const d = ctx.getImageData(0, 380, 960, 120).data; let x0 = 960, x1 = -1;
      for (let y = 0; y < 120; y++) for (let x = 0; x < 960; x++) if (d[(y * 960 + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; } return x1 - x0 + 1; };
    const out = {};
    SETTINGS.set('a11y.bigText', false);
    out.ui0 = ink(() => uiText('HOLD BACK TO BLOCK', 480, 440, 18, '#fff', 'center')); out.p0 = ptext(ctx, 'HELLO', 100, 400, 2, '#fff'); out.p3 = ptext(ctx, 'HELLO', 100, 400, 3, '#fff');
    SETTINGS.set('a11y.bigText', true);
    out.ui1 = ink(() => uiText('HOLD BACK TO BLOCK', 480, 440, 18, '#fff', 'center')); out.p1 = ptext(ctx, 'HELLO', 100, 400, 2, '#fff'); out.p4 = ptext(ctx, 'HELLO', 100, 400, 3, '#fff');
    out.p5 = ptext(ctx, 'HELLO', 100, 400, 5, '#fff');
    const long = 'X'.repeat(70); out.edge0 = ptext(ctx, long, 20, 400, 2, '#fff');   // 838 px at size 2; size 3 would leave the screen
    out.bigUi = ink(() => uiText('BIG TITLE', 480, 440, 40, '#fff', 'center'));
    SETTINGS.set('a11y.bigText', false); out.bigUi0 = ink(() => uiText('BIG TITLE', 480, 440, 40, '#fff', 'center'));
    return out;
  })()`);
  check(big.ui1 / big.ui0 > 1.15 && big.ui1 / big.ui0 < 1.35, 'LARGER TEXT draws small UI text about a quarter wider: ' + big.ui0 + ' to ' + big.ui1 + ' px');
  check(big.p0 === 58 && big.p1 === 87 && big.p3 === 87 && big.p4 === 116 && big.p5 === 145, 'LARGER TEXT steps pixel-font sizes 2 and 3 up by one and leaves bigger text alone');
  check(big.edge0 === 838 && big.bigUi === big.bigUi0, 'text that would leave the screen keeps its size, and large headings are untouched');

  // ---- high-contrast HUD ----
  const hc = await ev(`(() => {
    const [a, b] = AY.fresh(0, 1); AY.place(260); step(60); a.hp = a.d.hp * 0.5; b.hp = b.d.hp; a.meter = 100; b.meter = 40;
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)].join(',');
    SETTINGS.set('a11y.contrast', true); render();
    const out = { p1full: px(80, 30), p1empty: px(410, 30), p2full: px(W - 80, 30), frame: px(73, 13), timerBox: px(W / 2 - 30, 60) };
    SETTINGS.set('a11y.contrast', false); render(); out.offP1 = px(80, 30);
    return out;
  })()`);
  check(hc.p1full === '255,230,0' && hc.p1empty === '0,0,0' && hc.p2full === '0,200,255' && hc.frame === '255,255,255' && hc.timerBox === '0,0,0',
    'HIGH CONTRAST HUD draws solid yellow and cyan bars on black inside white frames, and a black timer box: ' + JSON.stringify(hc));
  check(hc.offP1 !== hc.p1full, 'with it off the normal HUD is back');

  // ---- reduced motion: no shake, flash or slow motion; the vfx KO slow motion runs at full speed ----
  const ko = (on) => ev(`(() => {
    SETTINGS.set('a11y.motion', ${on});
    const [a, b] = AY.fresh(0, 1); AY.place(120); a.meter = 0; step(1); const cut0 = A11Y.state().slowCut;
    b.hp = 1; b.inv = 0; b.takeHit(a, 6, 7, 15, 'punch');
    AY.seen = { shake: 0, flash: 0, slow: 0 }; let freeze = 0;
    while (game.hitstop > 0 && freeze < 40) { step(1); freeze++; }
    const st0 = b.st; for (let k = 0; k < 40; k++) step(1);
    const mx = AY.seen;
    game.flash = 8; render(); const post = A11Y.state().postFlash;
    return { phase: game.phase, freeze, advanced: b.st - st0, mx, post, cut: A11Y.state().slowCut - cut0, alias: SETTINGS.get('reducedFlash') === true };
  })()`);
  const m1 = await ko(true), m0 = await ko(false);
  check(m1.mx.shake === 0 && m1.mx.flash === 0 && m1.mx.slow === 0 && m1.post === 0, 'REDUCED MOTION: no shake, no flash and no slow motion through a KO, and the frame is drawn with no flash: ' + JSON.stringify(m1.mx));
  check(m1.freeze >= 10 && m1.advanced >= 34 && m1.cut > 0, 'REDUCED MOTION: after the short KO hit-stop the KO plays at full speed (' + m1.advanced + ' ticks in 40, ' + m1.cut + ' slow ticks removed)');
  check(m0.advanced < 20 && m0.mx.shake > 0 && m0.post > 0 && m1.alias && !m0.alias, 'with it off the KO is slow and shakes as before (' + m0.advanced + ' ticks in 40), and vfx reads reducedFlash only while it is on');

  // ---- screen reader announcements ----
  const sr = await ev(`(() => {
    const out = {}; SETTINGS.set('a11y.motion', false);
    AY.title(); const n0 = A11Y.state().log.length;
    AY.T('KeyS'); step(2); out.titleMenu = A11Y.state().log.slice(n0).join(' | ');
    const [a, b] = AY.fresh(0, 1, [1, 0]); out.start = AY.log();
    AY.place(120); b.hp = 1; b.inv = 0; b.takeHit(a, 6, 7, 15, 'punch'); AY.until(() => game.phase === 'over' || game.phase === 'finish', 3000);
    if (game.phase === 'finish') { step(2); b.inv = 0; b.takeHit(a, 6, 7, 15, 'punch'); }
    AY.until(() => game.phase === 'over', 4000); step(2);
    out.end = AY.log(); out.text = A11Y.text(); out.phase = game.phase;
    out.names = [a.d.name, b.d.name];
    SETTINGS.set('a11y.live', false); const said = A11Y.state().said; A11Y.announce('should stay silent'); out.mute = A11Y.state().said === said && A11Y.text() === '';
    SETTINGS.reset('a11y.live'); A11Y.announce('Hello'); out.again = A11Y.text(); A11Y.announce('Hello'); out.again2 = A11Y.text();
    return out;
  })()`);
  const nm = s => s.charAt(0) + s.slice(1).toLowerCase();
  check(/, 2 of \d+\./.test(sr.titleMenu), 'moving in the title menu announces the entry and its position: ' + sr.titleMenu);
  check(sr.start.includes(nm(sr.names[0]) + ' versus ' + nm(sr.names[1])) && /Round \d\./.test(sr.start) && sr.start.includes('Fight!'), 'a match start announces the matchup, the round and the fight');
  check(sr.phase === 'over' && sr.end.includes(nm(sr.names[0]) + ' wins round') && sr.end.includes(nm(sr.names[0]) + ' wins the match, 2 rounds to 0') && sr.end.includes('Match over.'),
    'a KO announces the round winner, the match winner with the score, and the end-screen keys: ' + sr.end.slice(-240));
  check(sr.mute && sr.again === 'Hello' && sr.again2 === 'Hello ', 'SCREEN READER off silences the region; a repeated message still changes the region so it is read again');

  // ---- simple specials ----
  const sp = await ev(`(() => {
    const out = {}, M = id => MOVES[id].sp;
    const tryIt = (simple, setup) => { SETTINGS.set('a11y.simpleSp', simple); const [a, b] = AY.fresh(0, 1); AY.place(260); step(20); setup(a); const r = a.mv ? a.mv.name : a.state; AY.up('KeyA'); AY.up('KeyD'); AY.up('KeyS'); step(40); return r; };
    const backL = a => { AY.down('KeyA'); step(1); AY.T('KeyL'); step(1); };
    const lateDown = a => { AY.down('KeyS'); step(2); AY.up('KeyS'); step(2); AY.T('KeyL'); step(1); };
    const fwdL = a => { AY.down('KeyD'); step(1); AY.T('KeyL'); step(1); };
    const id = () => game.f[0].d.id;
    out.backOff = tryIt(false, backL); out.backOn = tryIt(true, backL); out.lateOff = tryIt(false, lateDown); out.lateOn = tryIt(true, lateDown); out.fwdOn = tryIt(true, fwdL);
    out.want = M(id()).map(m => m.name);
    SETTINGS.set('a11y.simpleSp', true); const rows = moveRows(id(), 0, false), rowsCpu = moveRows(id(), 1, true);
    out.row = (rows.find(r => r.name === out.want[1]) || {}).input; out.rowCpu = (rowsCpu.find(r => r.name === out.want[1]) || {}).input;
    SETTINGS.set('a11y.simpleSp', false); out.rowOff = (moveRows(id(), 0, false).find(r => r.name === out.want[1]) || {}).input;
    return out;
  })()`);
  check(sp.backOff === sp.want[0] && sp.backOn === sp.want[1] && sp.fwdOn === sp.want[1], 'SIMPLE SPECIALS: L with either LEFT or RIGHT gives the second special, facing does not matter: ' + JSON.stringify([sp.backOff, sp.backOn, sp.fwdOn]));
  check(sp.lateOff === sp.want[0] && sp.lateOn === sp.want[2], 'SIMPLE SPECIALS: a DOWN released just before L still gives the third special: ' + JSON.stringify([sp.lateOff, sp.lateOn]));
  check(/^LEFT \/ RIGHT \+ /.test(sp.row || '') && /^FWD \+ /.test(sp.rowCpu || '') && /^FWD \+ /.test(sp.rowOff || ''), 'the move list shows LEFT / RIGHT for that special while the option is on: ' + sp.row);

  // ---- the ACCESSIBILITY screen: keys on the title and in pause, touch, and it leaves the menus untouched ----
  const ui = await ev(`(() => {
    const out = {}; for (const k of A11Y.keys) SETTINGS.reset(k);
    AY.title(); AY.T('KeyY'); step(1); out.openTitle = A11Y.state().open && game.phase === 'title'; render(); out.drawn = true;
    const sel0 = game.titleSel; AY.T('KeyS'); step(1); out.sel = A11Y.state().sel; out.titleKept = game.titleSel === sel0;
    AY.T('Enter'); step(1); out.contrast = SETTINGS.get('a11y.contrast'); out.stillTitle = game.phase === 'title';
    AY.T('KeyW'); step(1); AY.T('KeyD'); step(1); out.cb1 = SETTINGS.get('a11y.cb'); AY.T('KeyA'); step(1); AY.T('KeyA'); step(1); out.cb2 = SETTINGS.get('a11y.cb');
    out.said = A11Y.text();
    AY.T('Escape'); step(1); out.closed = !A11Y.state().open && game.phase === 'title';
    // the title entry runs it too
    const it = titleItems().find(i => i.id === 'a11y'); it.run(game); out.entry = A11Y.state().open; A11Y.close(); step(1);
    // pause: Y opens it over the pause menu, P comes back to the pause menu (not to the fight)
    AY.fresh(0, 1); AY.T('KeyP'); step(1); out.paused = game.phase === 'pause';
    AY.T('KeyY'); step(1); out.openPause = A11Y.state().open && game.phase === 'pause';
    AY.T('KeyP'); step(1); out.backPause = !A11Y.state().open && game.phase === 'pause';
    // touch: a tap on a row changes it, a tap outside the panel closes the screen
    AY.T('KeyY'); step(1); render();
    const layer = document.getElementById('a11y-layer'), at = (x, y) => { const r = cv.getBoundingClientRect(); return { clientX: r.left + x * r.width / 960, clientY: r.top + y * r.height / 540, bubbles: true, cancelable: true, pointerId: 1 }; };
    out.layer = !!layer && layer.style.display === 'block';
    layer.dispatchEvent(new PointerEvent('pointerdown', at(480, 156 + 3 * 40))); step(1); out.tapMotion = SETTINGS.get('a11y.motion'); out.tapSel = A11Y.state().sel;
    layer.dispatchEvent(new PointerEvent('pointerdown', at(40, 20))); step(1); out.tapClosed = !A11Y.state().open && layer.style.display === 'none' && game.phase === 'pause';
    AY.T('KeyP'); step(2); out.resumed = game.phase === 'fight';
    // leaving the title or pause closes it
    AY.title(); A11Y.open(); game.phase = 'select'; step(1); out.autoClose = !A11Y.state().open;
    return out;
  })()`);
  check(ui.openTitle && ui.drawn && ui.sel === 1 && ui.titleKept, 'Y on the title opens the ACCESSIBILITY screen; its keys do not move the title menu underneath');
  check(ui.contrast === true && ui.stillTitle && ui.cb1 === 'protan' && ui.cb2 === 'tritan', 'ENTER toggles a row and LEFT / RIGHT step the colour filter through its values: ' + JSON.stringify([ui.contrast, ui.cb1, ui.cb2]));
  check(/^Color filter: Tritan\. 1 of 7\./.test(ui.said), 'every change is read out: ' + ui.said);
  check(ui.closed && ui.entry, 'ESC closes it back to the title, and the ACCESSIBILITY title entry opens it');
  check(ui.paused && ui.openPause && ui.backPause && ui.resumed, 'Y in the pause menu opens it, P returns to the pause menu, and P again resumes the fight: ' + JSON.stringify(ui));
  check(ui.layer && ui.tapMotion === true && ui.tapSel === 3 && ui.tapClosed, 'tapping a row selects and changes it, tapping outside the panel closes the screen: ' + JSON.stringify([ui.layer, ui.tapMotion, ui.tapSel, ui.tapClosed]));
  check(ui.autoClose, 'the screen closes by itself when the game leaves the title and pause screens');

  // ---- a whole CPU match with every option on, drawn every few ticks ----
  const all = await ev(`(() => {
    for (const k of A11Y.keys) SETTINGS.reset(k);
    SETTINGS.set('a11y.cb', 'tritan'); SETTINGS.set('a11y.contrast', true); SETTINGS.set('a11y.bigText', true); SETTINGS.set('a11y.motion', true); SETTINGS.set('a11y.simpleSp', true);
    game.mode = 1; game.sel = [3, 4]; game.arenaPick = 1; startMatch(); let n = 0, draws = 0; AY.seen = { shake: 0, flash: 0, slow: 0 };
    while (game.phase !== 'over' && n < 30000) { step(1); n++; if (n % 50 === 0) { render(); draws++; } }
    render(); const out = { phase: game.phase, n, draws, seen: AY.seen, said: A11Y.state().said };
    for (const k of A11Y.keys) SETTINGS.reset(k);
    out.reset = JSON.stringify(A11Y.keys.map(k => SETTINGS.get(k)));
    return out;
  })()`);
  check(all.phase === 'over' && all.n < 30000 && all.seen.shake === 0 && all.seen.flash === 0 && all.seen.slow === 0 && all.said > 5, 'a full CPU match with every accessibility option on reaches the end screen with no shake, flash or slow motion: ' + JSON.stringify(all));
  check(all.reset === '["off",false,false,false,true,false]', 'the a11y settings are back to their defaults for the next test files');
}
