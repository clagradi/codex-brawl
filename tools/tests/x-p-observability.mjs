// Tests for p-observability.js (the OBSERVABILITY post-match dashboard). Owner: the observability agent. Runs after core.mjs.
// Everything is driven with hold(true) and step(n). The recorded numbers are compared with an independent listener on the same BUS events, so they hold whatever
// damage scaling combat.js applies; the drawing is checked on real canvas pixels.
// Hooks used by p-observability.js: update, fighterUpdate, drawTop. Settings: observability.enabled, observability.auto, observability.fleet.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true); SETTINGS.reset('observability.fleet');   // the page keeps its localStorage between the earlier tests and this one
    window.V = { log: { hit: [], block: [], special: 0, sup: 0 } };
    BUS.on('hit', e => V.log.hit.push({ s: e.src.side, v: e.victim.side, d: e.dmg, c: e.combo, t: OBS.state().t }));
    BUS.on('block', e => V.log.block.push({ v: e.victim.side, d: e.dmg }));
    BUS.on('special', () => V.log.special++); BUS.on('super', () => V.log.sup++);
    V.reset = () => { V.log.hit = []; V.log.block = []; V.log.special = 0; V.log.sup = 0; };
    V.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    V.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    V.fresh = (i, j) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.modeId = 'versus'; game.sel = [i, j]; game.arenaPick = 0; startMatch(); V.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; step(1); V.reset(); return [a, b];
    };
    V.place = dx => {
      const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; }
      f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o];
    };
    // a scripted match: P1 hits P2 six times, a second apart, then the knockout; nobody else deals damage. Plays on to the end screen.
    V.play = () => {
      SETTINGS.set('rounds', 1); const [a, b] = V.fresh(0, 1);
      for (let i = 0; i < 6; i++) { V.place(100); b.hp = b.d.hp; b.takeHit(a, 8 + i, 3, 10, 'hit', {}); step(100); }
      V.place(100); b.hp = 1; b.takeHit(a, 30, 3, 10, 'hit', { knock: true });
      const n = V.until(() => game.phase === 'over', 8000); step(2); return { n, phase: game.phase };
    };
    V.sum = () => { const d = ctx.getImageData(0, 0, 960, 540).data; let s = 0; for (let k = 0; k < d.length; k += 97) s = (s * 31 + d[k]) | 0; return s; };
    V.px = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3);
    V.canvasPoint = (x, y) => { const r = document.getElementById('c').getBoundingClientRect(); return { clientX: r.left + x * r.width / 960, clientY: r.top + y * r.height / 540 }; };
    V.pointer = (x, y) => document.getElementById('c').dispatchEvent(new PointerEvent('pointerdown', Object.assign({ bubbles: true, button: 0, pointerType: 'mouse' }, V.canvasPoint(x, y))));
  })()`);

  // ---- structure, settings, hooks ----
  const s0 = await ev(`({ marker: window.STUB_OBSERVABILITY === 1, api: typeof OBS === 'object' && ['state', 'kpis', 'series', 'open', 'close', 'tap', 'button', 'incidents'].every(k => typeof OBS[k] === 'function'),
    hooks: ['update', 'fighterUpdate', 'drawTop'].every(h => HOOKS.has(h)),
    set: [SETTINGS.get('observability.enabled'), SETTINGS.get('observability.auto'), JSON.stringify(SETTINGS.get('observability.fleet'))], key: OBS.KEY })`);
  check(s0.marker && s0.api && s0.hooks, 'OBSERVABILITY is loaded: OBS API and the update, fighterUpdate and drawTop hooks');
  check(s0.set[0] === true && s0.set[1] === false && s0.set[2] === '{"m":0,"d":0,"h":0}' && s0.key === 'KeyO', 'settings default to enabled, not automatic, empty fleet totals; the key is O: ' + JSON.stringify(s0.set));

  // ---- recording from BUS events: damage, hits, combo, blocks, specials, throws ----
  const r = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = { start: OBS.state() }; V.place(100);
    for (let i = 0; i < 3; i++) { step(20); b.inv = 0; b.hp = b.d.hp; b.takeHit(a, 6 + i, 3, 30, 'hit', {}); }          // a chain on a reeling victim
    step(60); V.place(100); b.takeHit(a, 9, 3, 10, 'kick', {}); step(40); V.place(100); a.takeHit(b, 5, 3, 10, 'punch', {}); step(30);   // and one each way
    V.place(100); b.set('block'); b.takeHit(a, 10, 3, 10, 'punch', {}); step(20); V.place(100); b.set('block'); b.takeHit(a, 10, 3, 10, 'punch', {});   // two blocked hits
    BUS.emit('special', { fighter: a, foe: b, move: {} }); BUS.emit('special', { fighter: a, foe: b, move: {} }); BUS.emit('throw', { src: b, victim: a });
    V.place(300); b.meter = 0; a.meter = 100; step(1); V.T('KeyI'); step(3);   // a real super: the engine emits the BUS event, the recorder counts it
    out.st = OBS.state(); out.log = V.log; return out;
  })()`);
  const L = r.log, st = r.st;
  const expDmg = [0, 1].map(s => +L.hit.filter(x => x.s === s).reduce((n, x) => n + x.d, 0).toFixed(6)), expHits = [0, 1].map(s => L.hit.filter(x => x.s === s).length);
  const expCombo = [0, 1].map(s => Math.max(0, ...L.hit.filter(x => x.s === s).map(x => x.c)));
  check(r.start.rec === true && r.start.dmg.join() === '0,0' && r.start.ids.join() === 'tibo,poteto' && r.start.names.join() === 'TIBO,POTETO', 'a match start resets the recorder and names the two fighters: ' + JSON.stringify([r.start.rec, r.start.ids]));
  check(expHits[0] >= 4 && expHits[1] >= 1 && st.hits.join() === expHits.join() && Math.abs(st.dmg[0] - expDmg[0]) < 1e-6 && Math.abs(st.dmg[1] - expDmg[1]) < 1e-6, 'damage dealt and hits match the BUS hit events: ' + JSON.stringify([st.dmg, expDmg, st.hits, expHits]));
  check(Math.abs(st.taken[0] - expDmg[1]) < 1e-6 && Math.abs(st.taken[1] - expDmg[0]) < 1e-6, 'damage taken is the other side\'s damage dealt');
  check(expCombo[0] >= 2 && st.combo.join() === expCombo.join(), 'max combo is the highest combo count seen in a hit event: ' + JSON.stringify([st.combo, expCombo]));
  check(L.block.length === 2 && st.blocks.join() === '0,2' && Math.abs(st.chip[1] - L.block.reduce((n, x) => n + x.d, 0)) < 1e-6 && st.hits.join() === expHits.join(), 'blocks are counted for the defender, with the chip damage, and are not counted as hits: ' + JSON.stringify([st.blocks, L.block.length]));
  check(st.spec.join() === '2,0' && L.sup === 1 && st.sup.join() === '1,0' && st.throws.join() === '0,1', 'specials, supers and throws are counted per fighter from their BUS events: ' + JSON.stringify([st.spec, st.sup, st.throws]));
  const k = await ev(`OBS.kpis().map(k => [k.id, k.v[0], k.v[1]])`);
  check(k.map(x => x[0]).join() === 'acc,blk,spc,cmb,upt' && k[1][1] === 0 && k[1][2] === 2 && k[2][1] === 3 && k[2][2] === 0 && k[3][1] === expCombo[0], 'the scorecard has accuracy, blocks, specials, max combo and uptime, with the recorded values: ' + JSON.stringify(k));

  // ---- hit accuracy: attacks thrown versus attacks that connected ----
  const ac = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = {}; V.place(700); const s0 = OBS.state();
    V.T('KeyJ'); step(45); const s1 = OBS.state(); out.whiffThrown = s1.thrown[0] - s0.thrown[0]; out.whiffConn = s1.conn[0] - s0.conn[0]; out.whiffAcc = OBS.kpis()[0].v[0];
    V.place(60); const s2 = OBS.state(); V.T('KeyJ'); let n = 0; while (OBS.state().conn[0] === s2.conn[0] && n++ < 60) step(1); step(30); const s3 = OBS.state();
    out.hitThrown = s3.thrown[0] - s2.thrown[0]; out.hitConn = s3.conn[0] - s2.conn[0]; out.hitN = n; out.acc = OBS.kpis()[0].v[0]; out.exp = 100 * s3.conn[0] / s3.thrown[0];
    out.idleAcc = V.fresh(0, 1) && OBS.kpis()[0].v[0]; return out;
  })()`);
  check(ac.whiffThrown === 1 && ac.whiffConn === 0 && ac.whiffAcc === 0, 'a punch thrown at nobody counts as one attack and no connection (0% accuracy): ' + JSON.stringify([ac.whiffThrown, ac.whiffConn, ac.whiffAcc]));
  check(ac.hitThrown === 1 && ac.hitConn === 1 && ac.hitN < 60 && Math.abs(ac.acc - ac.exp) < 1e-9 && ac.acc === 50, 'a punch that lands counts as one attack and one connection; accuracy is connections over attacks (50%): ' + JSON.stringify([ac.hitThrown, ac.hitConn, ac.acc]));
  check(ac.idleAcc === null, 'with no attacks recorded the accuracy is unknown, not 0%');

  // ---- uptime: ticks in control over fight ticks ----
  const up = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = {}; V.place(300); const s0 = OBS.state(); step(30); const s1 = OBS.state();
    out.idle = [s1.ticks - s0.ticks, s1.up[0] - s0.up[0], s1.up[1] - s0.up[1]];
    V.place(100); b.takeHit(a, 4, 3, 90, 'hit', {}); const s2 = OBS.state(); step(14); const s3 = OBS.state();
    out.hurt = [s3.ticks - s2.ticks, s3.up[0] - s2.up[0], s3.up[1] - s2.up[1], b.state];
    const u = OBS.kpis()[4].v; out.upt = u; out.pct = [100 * s3.up[0] / s3.ticks, 100 * s3.up[1] / s3.ticks]; return out;
  })()`);
  check(up.idle[0] === 30 && up.idle[1] === 30 && up.idle[2] === 30, 'two idle fighters are up for every fight tick: ' + JSON.stringify(up.idle));
  check(up.hurt[0] > 0 && up.hurt[1] === up.hurt[0] && up.hurt[2] === 0 && /^(hurt|hit)$/.test(up.hurt[3]), 'a fighter in hitstun is down: no uptime while the other keeps accruing it: ' + JSON.stringify(up.hurt));
  check(Math.abs(up.upt[0] - up.pct[0]) < 1e-9 && Math.abs(up.upt[1] - up.pct[1]) < 1e-9 && up.upt[0] > up.upt[1], 'the UPTIME % KPI is up ticks over ticks: ' + JSON.stringify(up.upt));
  const pa = await ev(`(() => { game.phase = 'pause'; const n0 = OBS.state().ticks; step(10); const p = OBS.state().ticks - n0; game.phase = 'fight'; return p; })()`);
  check(pa === 0, 'nothing is recorded while the game is paused');

  // ---- the damage-over-time series ----
  const pl = await ev(`V.play()`);
  check(pl.phase === 'over' && pl.n < 8000, 'a scripted match reaches the end screen: ' + JSON.stringify(pl));
  const se = await ev(`(() => {
    const s = OBS.state(), evs = V.log.hit.slice(), out = { T: s.t / 60, s0: OBS.series(0), s1: OBS.series(1), dmg: s.dmg, taken: s.taken };
    const cum = (side, t) => evs.filter(x => x.s === side && x.t <= t).reduce((n, x) => n + x.d, 0);
    out.err0 = 0; out.err1 = 0; out.mono = true;
    for (let side = 0; side < 2; side++) out.s0.pts[side].forEach((p, i, arr) => { out.err0 = Math.max(out.err0, Math.abs(p[1] - cum(side, p[0] * 60))); if (i && p[1] < arr[i - 1][1] - 1e-9) out.mono = false; });
    for (let side = 0; side < 2; side++) out.s1.pts[side].forEach(p => { out.err1 = Math.max(out.err1, Math.abs(p[1] - (cum(side, p[0] * 60) - cum(side, Math.max(0, p[0] - OBS.WINDOW) * 60)))); });
    const a0 = OBS.series(0); out.again = OBS.series(0) === a0; out.nev = evs.length; out.evs = s.events; return out;
  })()`);
  check(se.nev === 7 && se.evs === 7, 'the scripted match recorded its seven hits as chart events: ' + JSON.stringify([se.nev, se.evs]));
  check(se.s0.pts[0][0][0] === 0 && se.s0.pts[0][0][1] === 0 && Math.abs(se.s0.T - se.T) < 1e-9 && Math.abs(se.s0.pts[0][se.s0.pts[0].length - 1][0] - se.T) < 1e-9, 'the series starts at 0:00 and ends at the last fight tick: ' + se.T);
  check(se.err0 < 1e-6 && se.mono, 'cumulative damage at every point equals the sum of the recorded hits so far, and never decreases: ' + se.err0);
  check(Math.abs(se.s0.pts[0][se.s0.pts[0].length - 1][1] - se.dmg[0]) < 1e-6 && se.s0.pts[1].every(p => p[1] === 0) && se.dmg[1] === 0, 'the last point of each line equals the total damage dealt (P2 stays at zero)');
  check(se.err1 < 1e-6 && se.s1.max < se.s0.max && se.s1.max > 0, 'the per-5-seconds view is the damage of the last five seconds and peaks lower than the running total: ' + JSON.stringify([se.err1, se.s1.max, se.s0.max]));
  check(se.again, 'the same series is served from a cache while nothing changed');

  // ---- the end of the match: summary, winner, fleet totals ----
  const en = await ev(`(() => {
    const s = OBS.state(), fl = OBS.fleet(), stored = SETTINGS.get('observability.fleet').m;
    return { ended: s.ended, rec: s.rec, winner: s.winner, gw: game.winner.side, wins: s.wins, gwins: game.wins.slice(), rounds: s.rounds.length, r1: s.rounds[0], hpEnd: s.hpEnd, fleet: fl, stored, dmg: s.dmg, taken: s.taken, hits: s.hits,
      status: OBS.status()[0], inc: OBS.incidents().map(i => i.tag + ' ' + i.txt), kpis: OBS.kpis().map(k => k.v) };
  })()`);
  check(en.ended && !en.rec && en.winner === 0 && en.winner === en.gw && en.wins.join() === en.gwins.join() && en.rounds >= 1, 'match:end closes the recording with the winner and the round wins: ' + JSON.stringify([en.winner, en.wins, en.rounds]));
  check(en.r1.t0 === 0 && en.r1.t1 > 0 && en.r1.reason === 'ko' && en.r1.win === 0, 'the round list keeps start, end, reason and winner: ' + JSON.stringify(en.r1));
  check(en.fleet.m === 1 && en.fleet.h === 7 && en.fleet.d === Math.round(en.dmg[0] + en.dmg[1]), 'the fleet totals gained this match (1 match, 7 hits, its damage): ' + JSON.stringify(en.fleet));
  check(en.stored === 0, 'the store is not written inside the match (no extra settings event at match:end): ' + en.stored);
  check(en.status === 'PARTIAL OUTAGE' || en.status === 'DEGRADED PERFORMANCE' || en.status === 'ALL SYSTEMS NOMINAL', 'the status chip is one of the three parody states: ' + en.status);
  check(en.inc.length >= 3 && en.inc.length <= 5 && en.inc.every(x => /^[\x20-\x7e]+$/.test(x) && x === x.toUpperCase()) && en.inc.some(x => /^SEV-2 BIGGEST HIT/.test(x)) && en.inc.some(x => /WINS 1-0/.test(x)), 'the incident log has three to five capital ASCII lines, including the biggest hit and the result: ' + JSON.stringify(en.inc));

  // ---- the O button and the report on the end screen ----
  const op = await ev(`(() => {
    const out = {}; render(); const b = OBS.button(); out.btn = V.px(b.x + 1, b.y + b.h / 2); out.hash0 = V.sum();
    out.shareBefore = document.getElementById('share').style.visibility; out.open0 = OBS.isOpen();
    V.T('KeyO'); step(1); out.open1 = OBS.isOpen(); out.shareHidden = document.getElementById('share').style.visibility; render(); out.hash1 = V.sum();
    step(10); render(); out.back = V.px(5, 5); out.panel = V.px(28, 200); out.phase = game.phase;
    return out;
  })()`);
  check(op.open0 === false && op.btn[1] >= 140 && op.btn[0] <= 100, 'the end screen shows the green OBSERVABILITY button before the report is opened: ' + JSON.stringify(op.btn));
  check(op.open1 === true && op.hash1 !== op.hash0 && op.phase === 'over', 'pressing O on the end screen opens the report');
  check(op.shareHidden === 'hidden' && op.shareBefore === '', 'the engine SHARE ON X anchor is hidden while the report is open (inline visibility)');
  check(V_near(op.back, [7, 10, 21], 14) && V_near(op.panel, [16, 22, 43], 3), 'the report paints its dark backdrop and the chart panel: ' + JSON.stringify([op.back, op.panel]));

  const dr = await ev(`(() => {
    const out = {}; OBS.close(); OBS.open(); step(1); render(); const lay = OBS.layout(), ch = lay.chart, ser = OBS.series(0);
    const x0 = ch.x + 54, x1 = ch.x + ch.w - 20, y0 = ch.y + 60, y1 = ch.y + ch.h - 32, dom = Math.max(10, ser.T), ymax = OBS.niceMax(ser.max);
    const hx = x0 + (x1 - x0) * ser.T / dom, hy = y1 - (y1 - y0) * ser.pts[0][ser.pts[0].length - 1][1] / ymax;
    out.early = V.px(hx + 3, hy + 1);   // right half of the head marker: the value label sits to its left
     out.col = ROSTER[0].col;
    step(OBS.REVEAL + 4); render(); out.late = V.px(hx + 3, hy + 1); out.state = OBS.state();
    out.col0 = V.px(0, 0); out.lay = lay; return out;
  })()`);
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  check(!V_near(dr.early, rgb(dr.col), 12) && V_near(dr.late, rgb(dr.col), 6), 'the chart line is drawn on the canvas: its head sits at the last point only after the reveal animation (' + JSON.stringify([dr.early, dr.late, dr.col]) + ')');
  check(dr.lay.R <= 936 && dr.lay.chart.x + dr.lay.chart.w < dr.lay.kpi.x && dr.lay.kpi.x + dr.lay.kpi.w <= dr.lay.R && dr.lay.back.x + dr.lay.back.w <= 960, 'the layout keeps chart, scorecard and BACK on the canvas without overlap: ' + JSON.stringify(dr.lay.back));

  // every string drawn on the report is capital ASCII, in both chart views
  const tx = await ev(`(() => {
    const calls = [], orig = window.ptext; window.ptext = (c, s, ...r) => { calls.push(String(s)); return orig(c, s, ...r); };
    try { render(); V.T('ArrowRight'); step(1); render(); V.T('ArrowRight'); step(1); render(); } finally { window.ptext = orig; }
    return { calls: [...new Set(calls)], view: OBS.state().view };
  })()`);
  const bad = tx.calls.filter(s => !/^[\x20-\x7e]*$/.test(s) || s !== s.toUpperCase());
  check(tx.calls.length > 40 && bad.length === 0, 'every string on the report is capital ASCII for the pixel font (' + tx.calls.length + ' strings' + (bad.length ? ', bad: ' + bad.slice(0, 3).join(' | ') : '') + ')');
  check(tx.calls.some(s => s === 'OBSERVABILITY_' || s === 'OBSERVABILITY') && ['HIT ACCURACY', 'BLOCKS', 'SPECIALS USED', 'MAX COMBO', 'UPTIME %'].every(l => tx.calls.includes(l)) && tx.calls.includes('DAMAGE OVER TIME'), 'the report shows the title, the damage chart and the five KPI labels');

  // ---- views and keys while it is open ----
  const vw = await ev(`(() => {
    const out = {}; out.view0 = OBS.state().view; V.T('ArrowLeft'); step(1); out.view1 = OBS.state().view; V.T('KeyD'); step(1); out.view2 = OBS.state().view;
    out.rtReset = OBS.state().rt; V.T('Enter'); step(1); out.afterEnter = [OBS.isOpen(), game.phase, document.getElementById('share').style.visibility];
    OBS.open(); step(1); V.T('Escape'); step(1); out.afterEsc = [OBS.isOpen(), game.phase];
    OBS.open(); step(1); V.T('KeyO'); step(1); out.afterO = [OBS.isOpen(), game.phase];
    out.reopen = OBS.open() && OBS.state().view === 0; OBS.close(); return out;
  })()`);
  check(vw.view1 !== vw.view0 && vw.view2 !== vw.view1 && vw.rtReset <= 2, 'left, right, A and D flip the chart view and replay the reveal: ' + JSON.stringify([vw.view0, vw.view1, vw.view2, vw.rtReset]));
  check(vw.afterEnter[0] === false && vw.afterEnter[1] === 'over' && vw.afterEnter[2] === '', 'Enter closes the report instead of leaving the end screen, and the share button comes back: ' + JSON.stringify(vw.afterEnter));
  check(vw.afterEsc[0] === false && vw.afterEsc[1] === 'over' && vw.afterO[0] === false && vw.afterO[1] === 'over' && vw.reopen, 'Esc and O close the report and keep the end screen; a new opening starts on the total-damage view: ' + JSON.stringify([vw.afterEsc, vw.afterO]));

  // ---- taps: real pointer events on the canvas ----
  const tp = await ev(`(() => {
    const out = {}, b = OBS.button(); OBS.close(); step(1);
    V.pointer(b.x - 40, b.y + 5); out.missed = OBS.isOpen();
    V.pointer(b.x + b.w / 2, b.y + b.h / 2); out.opened = OBS.isOpen(); step(2);
    const lay = OBS.layout(); V.pointer(lay.chart.x + 100, lay.chart.y + 120); out.view = OBS.state().view;
    V.pointer(lay.kpi.x + 40, lay.kpi.y + 100); out.still = OBS.isOpen();
    V.pointer(lay.back.x + lay.back.w / 2, lay.back.y + lay.back.h / 2); out.closed = !OBS.isOpen(); out.share = document.getElementById('share').style.visibility;
    out.api = [OBS.tap(b.x + 5, b.y + 5), OBS.isOpen(), OBS.tap(lay.back.x + 5, lay.back.y + 5), OBS.isOpen(), OBS.tap(2, 2)];
    return out;
  })()`);
  check(tp.missed === false && tp.opened === true && tp.view === 1 && tp.still === true && tp.closed === true && tp.share === '', 'a tap on the button opens, a tap on the chart switches the view, the scorecard is inert and BACK closes: ' + JSON.stringify(tp));
  check(tp.api.join() === 'true,true,true,false,false', 'OBS.tap(x, y) opens, closes and ignores taps the same way: ' + tp.api.join());

  // ---- only on the end screen, and R still rematches ----
  const fl = await ev(`(() => {
    const out = {}; OBS.open(); step(1); out.openedOver = OBS.isOpen(); V.T('KeyR');
    out.until = V.until(() => game.phase === 'fight', 1200); out.closedByRematch = !OBS.isOpen(); out.share = document.getElementById('share').style.visibility;
    const s = OBS.state(); out.fresh = [s.ended, s.rec, s.dmg.join(), s.t, s.rounds.length]; out.stored1 = SETTINGS.get('observability.fleet').m; out.fl1 = OBS.fleet().m;
    V.T('KeyO'); step(2); out.fightO = OBS.isOpen(); out.openFn = OBS.open(); return out;
  })()`);
  check(fl.openedOver && fl.closedByRematch && fl.share === '' && fl.until < 1200, 'R rematches straight from the open report and the share button is restored: ' + JSON.stringify([fl.closedByRematch, fl.share]));
  check(fl.fresh[0] === false && fl.fresh[1] === true && fl.fresh[2] === '0,0' && fl.fresh[4] === 1, 'a rematch starts a fresh recording: ' + JSON.stringify(fl.fresh));
  check(fl.fightO === false && fl.openFn === false, 'O does nothing during a fight');
  check(fl.stored1 === 1 && fl.fl1 === 1, 'leaving the end screen stores the fleet totals in the setting: ' + JSON.stringify([fl.stored1, fl.fl1]));

  // ---- automatic opening, and switching the feature off ----
  const au = await ev(`(() => { SETTINGS.set('observability.auto', true); const p = V.play(); step(2); const out = { phase: p.phase, open: OBS.isOpen(), share: document.getElementById('share').style.visibility, fleet: OBS.fleet().m }; OBS.close(); SETTINGS.set('observability.auto', false); return out; })()`);
  check(au.phase === 'over' && au.open === true && au.share === 'hidden' && au.fleet === 2, 'with observability.auto the report opens by itself when the end screen appears: ' + JSON.stringify(au));
  const off = await ev(`(() => {
    SETTINGS.set('observability.enabled', false); const p = V.play(), out = { phase: p.phase, rec: OBS.state().rec, ended: OBS.state().ended, fleet: OBS.fleet().m };
    render(); const b = OBS.button(); out.btn = V.px(b.x + 1, b.y + b.h / 2); V.T('KeyO'); step(2); out.open = OBS.isOpen(); out.api = OBS.open(); out.en = OBS.enabled();
    SETTINGS.set('observability.enabled', true); SETTINGS.set('rounds', 2); return out;
  })()`);
  check(off.phase === 'over' && !off.rec && !off.ended && off.fleet === 2 && !off.open && off.api === false && off.en === false, 'observability.enabled = false records nothing, keeps the fleet totals and ignores O: ' + JSON.stringify(off));
  check(!(off.btn[1] >= 140 && off.btn[0] <= 100), 'with the feature off the end screen has no OBSERVABILITY button: ' + JSON.stringify(off.btn));
  const on = await ev(`OBS.enabled()`);
  check(on === true, 'turning the setting back on re-enables the feature');
  const ph = await ev(`(() => { V.play(); const before = SETTINGS.get('observability.fleet').m, pending = OBS.fleet().m; dispatchEvent(new Event('pagehide')); return { before, pending, after: SETTINGS.get('observability.fleet').m, total: OBS.fleet().m }; })()`);
  check(ph.before === 2 && ph.pending === 3 && ph.after === 3 && ph.total === 3, 'hiding the page stores the matches that are still pending: ' + JSON.stringify(ph));
}

function V_near(p, q, e) { return p.every((v, k) => Math.abs(v - q[k]) <= e); }
