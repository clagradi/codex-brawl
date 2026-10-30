// Tests for p-achievements.js (OKRS: 30 achievements, the unlock toast, the OKRS screen, persistence in SETTINGS). Owner: the p-achievements agent. Runs after core.mjs.
// Covers: the 30 definitions (unique, pixel-font safe), progress driven only by BUS events from human fighters (a CPU does not count, training mode does not count), thresholds and the
// okr:unlock event, the toast (queueing, timing, pixels), real matches played to the end screen (wins, streak, fighters, arenas, rounds won untouched / at low health / quickly / on the clock /
// in sudden death), saving and reloading, junk saves, the screen (title entry, corner button, G on the title and in pause, keys consumed, paging, pointer taps), no console errors.
// Everything is driven with hold(true) and step(n), so it is deterministic. Hooks used by the feature: update, drawTop, titleItems, pauseItems. SETTINGS key: okrs.
export async function run(t) {
  try { await body(t); } finally { try { await t.eval('localStorage.clear()'); } catch (e) { /* the page is gone */ } }   // never leave the one-round setting or OKRS progress behind for the next test file
}

async function body(t) {
  const { check, tap } = t, ev = t.eval;
  const errors0 = t.p.errors.length;

  // page helpers (the name Z is free: game.js owns W and H)
  const HELPERS = `(() => {
    hold(true);
    window.Z = {};
    Z.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    Z.start = (i, j, arena) => {   // a real one player match: fighter i for the human, j for the CPU
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 1; game.modeId = 'versus'; game.sel = [i, j]; game.arenaPick = arena; startMatch(); Z.until(() => game.phase === 'fight', 3000); step(1);
      const [a, b] = game.f; return [a, b];
    };
    Z.ko = (a, b) => {   // a hits b, who has one health left: the round ends by a KO
      for (const q of [a, b]) { q.set('idle'); q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = 0; q.hidden = false; }
      a.x = 300; b.x = 340; a.face = 1; b.face = -1; b.hp = 1; game.hitstop = 0; game.slow = 0;
      b.takeHit(a, 8, 3, 10, 'punch', {});
    };
    Z.over = () => Z.until(() => game.phase === 'over', 12000);
    Z.log = []; BUS.on('okr:unlock', e => Z.log.push(e));
    Z.ptr = (x, y) => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x * r.width / W, clientY: r.top + y * r.height / H, pointerType: 'mouse', bubbles: true, cancelable: true })); };
    Z.sum = () => { const d = ctx.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 53) s = (s * 31 + d[k]) | 0; return s; };
    Z.col = (x, y, w, h, c) => { const d = ctx.getImageData(x, y, w, h).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] === c[0] && d[k + 1] === c[1] && d[k + 2] === c[2]) n++; return n; };   // pixels of one exact colour
    Z.gold = (x, y, w, h) => Z.col(x, y, w, h, [255, 215, 106]);
    Z.canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
    return true;
  })()`;
  const open = async hash => { await t.open(hash); await ev(HELPERS); };
  const press = async code => { await tap(code); await ev('step(1)'); };   // the pressed flag waits for the next update: a tap plus one step is one press

  // ---- the definitions ----
  await t.open(); await ev('localStorage.clear()');
  await open('#demo=0,1&stop');
  const d0 = await ev(`(() => {
    const defs = OKRS.defs, ids = new Set(defs.map(d => d.id)), names = new Set(defs.map(d => d.name));
    const glyphOk = s => [...s].every(c => c === ' ' || !!GLYPHS[c]);
    return { loaded: window.STUB_P_ACHIEVEMENTS === 1, total: OKRS.total, n: defs.length, ids: ids.size, names: names.size,
      glyphs: defs.every(d => glyphOk(d.name) && glyphOk(d.desc)), caps: defs.every(d => d.name === d.name.toUpperCase() && d.desc === d.desc.toUpperCase()),
      goals: defs.every(d => Number.isInteger(d.goal) && d.goal >= 1), has: ['SHIP IT', 'ZERO DOWNTIME', 'ROLLBACK KING'].map(s => defs.some(d => d.name === s)),
      hooks: HOOKS.has('update') && HOOKS.has('drawTop') && HOOKS.has('titleItems') && HOOKS.has('pauseItems'),
      title: HOOKS.collect('titleItems').some(x => x.id === 'okrs' && x.label === 'OKRS'), pause: HOOKS.collect('pauseItems').some(x => x.id === 'okrs' && x.key === 'KeyG'),
      def: SETTINGS.get('okrs') === OKRS.state, count: OKRS.count, unl: OKRS.unlocked().length, pages: OKRS.pages, per: OKRS.perPage };
  })()`);
  check(d0.loaded && d0.hooks, 'p-achievements.js is loaded and uses the update, drawTop, titleItems and pauseItems hooks');
  check(d0.total === 30 && d0.n === 30 && d0.ids === 30 && d0.names === 30, 'there are 30 objectives, each with its own id and name');
  check(d0.has.every(Boolean), 'SHIP IT, ZERO DOWNTIME and ROLLBACK KING are among them');
  check(d0.glyphs && d0.caps && d0.goals, 'every name and text is capitals the pixel font can draw, and every goal is a whole number of at least 1');
  check(d0.title && d0.pause, 'the title menu has an OKRS entry and the pause screen a G OKRS key');
  check(d0.def === true && d0.count === 0 && d0.unl === 0 && d0.pages === 2 && d0.per === 15, 'a fresh browser has nothing reached, the live state stored once at load and two pages of 15 rows');

  // ---- two CPU fighters never count ----
  const cpu = await ev(`(() => { Z.until(() => game.phase === 'fight', 3000); step(900); return { cpu: game.f.every(f => f.cpu === true), n: JSON.stringify(OKRS.state.n), count: OKRS.count, dirty: OKRS.dirty }; })()`);
  check(cpu.cpu && cpu.n === '{}' && cpu.count === 0 && !cpu.dirty, 'a fight between two CPU fighters moves nothing');

  // ---- events from a human fighter move the counters, a CPU does not, training mode does not ----
  const ev1 = await ev(`(() => {
    const [a, b] = game.f; a.cpu = false; b.cpu = true; OKRS.reset(); const E = (n, o) => BUS.emit(n, o), N = k => OKRS.state.n[k] | 0, out = {};
    const mv = MOVES[a.d.id];
    E('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 3, hp: b.hp }); out.hit = [N('hits'), OKRS.state.best.combo];
    E('hit', { src: b, victim: a, dmg: 5, kind: 'punch', combo: 9, hp: a.hp }); out.cpuHit = [N('hits'), OKRS.state.best.combo];
    E('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 2, hp: b.hp }); out.lower = OKRS.state.best.combo;
    E('block', { src: b, victim: a, dmg: 2, kind: 'punch', hp: a.hp }); E('block', { src: a, victim: b, dmg: 2, kind: 'punch', hp: b.hp }); out.block = N('blocks');
    E('defense:perfect', { victim: a, src: b, kind: 'punch' }); E('defense:perfect', { victim: b, src: a, kind: 'punch' }); out.perfect = N('perfect');
    E('throw', { src: a, victim: b }); E('throw', { src: b, victim: a }); out.throws = N('throws');
    E('special', { fighter: a, foe: b, move: mv.sp[0] }); E('special', { fighter: b, foe: a, move: MOVES[b.d.id].sp[0] }); out.special = N('specials');
    E('ex', { fighter: a, foe: b, move: mv.sp[0] }); out.ex = N('ex');
    E('breaker', { fighter: a, foe: b, combo: 3 }); out.breaker = N('breakers');
    E('taunt', { fighter: a, foe: b }); E('taunt', { fighter: b, foe: a }); out.taunt = N('taunts');
    E('hazard', { id: 'x', name: 'X', user: a, foe: b }); E('hazard', { id: 'x', name: 'X', user: b, foe: a }); out.hazard = N('hazards');
    E('stagefinish', { id: 'x', name: 'X', winner: a, loser: b }); out.stage = N('stagefinish');
    E('finisher', { winner: b, loser: a, move: MOVES[b.d.id].fin }); out.finCpu = N('finishers');
    E('finisher', { winner: a, loser: b, move: mv.fin }); out.fin = N('finishers');
    out.noPayload = (() => { try { E('taunt', {}); E('super', {}); E('throw', {}); return true; } catch (e) { return false; } })();
    // super last: the engine's cut-in freezes the game for a while
    E('super', { fighter: a, foe: b, move: mv.su }); E('super', { fighter: b, foe: a, move: MOVES[b.d.id].su }); out.super = N('supers');
    // training mode does not count at all
    const mode = game.modeId; game.modeId = 'training'; const before = JSON.stringify(OKRS.state.n);
    E('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 3, hp: b.hp }); E('taunt', { fighter: a, foe: b }); out.training = JSON.stringify(OKRS.state.n) === before;
    game.modeId = mode; E('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 3, hp: b.hp }); out.after = N('hits');
    // an automated fuzz match (tools/fuzz.mjs marks it with __qa.cur) does not count either: replaying a seed must give the same events
    const snap = JSON.stringify(OKRS.state.n); window.__qa = { cur: { t: 0 } }; E('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 3, hp: b.hp }); E('taunt', { fighter: a, foe: b }); out.qa = JSON.stringify(OKRS.state.n) === snap; window.__qa = { cur: null };
    E('taunt', { fighter: a, foe: b }); out.qaOff = JSON.stringify(OKRS.state.n) !== snap; E('taunt', { fighter: a, foe: b }); delete window.__qa;
    out.unlocked = OKRS.unlocked();
    return out;
  })()`);
  check(ev1.hit[0] === 1 && ev1.hit[1] === 3, 'a hit by a human counts and records the combo');
  check(ev1.cpuHit[0] === 1 && ev1.cpuHit[1] === 3 && ev1.lower === 3, 'a hit by a CPU counts nothing, and a shorter combo does not lower the best');
  check(ev1.block === 1 && ev1.perfect === 1 && ev1.throws === 1 && ev1.special === 1, 'block and perfect defense count for the defender, throw and special for the attacker, and only for humans');
  check(ev1.ex === 1 && ev1.breaker === 1 && ev1.taunt === 1 && ev1.hazard === 1 && ev1.stage === 1 && ev1.fin === 1 && ev1.finCpu === 0 && ev1.super === 1, 'ex, breaker, taunt, hazard, stage finish, finisher and super count for the human only');
  check(ev1.noPayload, 'events with empty payloads (nobody to count for) do not throw');
  check(ev1.training && ev1.after === 3, 'training mode counts nothing, and counting resumes with the next mode');
  check(ev1.qa && ev1.qaOff, 'a fuzz match (__qa.cur set) counts nothing, and counting resumes when the fuzz run is over: ' + ev1.qa + ' ' + ev1.qaOff);
  check(['hello', 'glass', 'rc', 'postmortem'].every(id => ev1.unlocked.includes(id)), 'HELLO WORLD, BREAK GLASS, RELEASE CANDIDATE and POSTMORTEM unlocked from their single events: ' + ev1.unlocked.join(','));

  // ---- thresholds, okr:unlock once each, the toast ----
  const th = await ev(`(() => {
    const [a, b] = game.f, out = {}; OKRS.reset(); Z.log.length = 0; hold(true);
    OKRS.state.n.hits = 199; OKRS.state.n.taunts = 9;
    BUS.emit('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 1, hp: b.hp });
    out.log1 = Z.log.map(e => e.id).join(',');
    BUS.emit('taunt', { fighter: a, foe: b });
    out.log2 = Z.log.map(e => e.id).join(','); out.payload = Z.log.map(e => [e.count, e.total, typeof e.name, typeof e.desc].join('/')).join(' ');
    BUS.emit('hit', { src: a, victim: b, dmg: 5, kind: 'punch', combo: 1, hp: b.hp }); BUS.emit('taunt', { fighter: a, foe: b });
    out.log3 = Z.log.length; out.commit = OKRS.progress('commit'); out.mono = OKRS.progress('mono'); out.nothing = OKRS.progress('nope');
    out.queued0 = OKRS.queued; out.toast0 = OKRS.toast;
    step(1); out.t1 = OKRS.toast && [OKRS.toast.id, OKRS.toast.t]; out.queued1 = OKRS.queued;
    step(100); out.t101 = OKRS.toast && OKRS.toast.t; step(108); out.t209 = OKRS.toast && OKRS.toast.t;
    step(1); out.gap1 = OKRS.toast; step(1); out.second = OKRS.toast && [OKRS.toast.id, OKRS.toast.t]; out.queued2 = OKRS.queued;
    step(209); out.gap2 = OKRS.toast; step(1); out.third = OKRS.toast && [OKRS.toast.id, OKRS.toast.t]; out.queued3 = OKRS.queued;
    step(209); out.end = OKRS.toast; out.len = OKRS.toastLength; out.shown = [OKRS.state.got.hello, OKRS.state.got.commit, OKRS.state.got.ooo];
    return out;
  })()`);
  check(th.log1 === 'hello,commit', 'the 200th hit unlocks HELLO WORLD and COMMIT HISTORY as it happens: ' + th.log1);
  check(th.log2 === 'hello,commit,ooo' && th.log3 === 3, 'the tenth taunt unlocks OUT OF OFFICE, and further events unlock nothing twice');
  check(/^1\/30\/string\/string 2\/30\/string\/string 3\/30\/string\/string$/.test(th.payload) && th.shown.join() === '1,2,3', 'okr:unlock carries id, name, desc, count and total: ' + th.payload);
  check(th.commit.done && th.commit.val === 200 && th.commit.goal === 200 && th.mono.val === 201 && !th.mono.done && th.nothing === null, 'progress() gives the value (capped at the goal) and whether it is done, and null for an unknown id');
  check(th.queued0 === 3 && th.toast0 === null, 'unlocks queue their toasts and nothing shows until the next tick');
  check(th.t1 && th.t1.join() === 'hello,1' && th.queued1 === 2, 'the first toast starts on the next tick');
  check(th.t101 === 101 && th.t209 === 209 && th.gap1 === null && th.len === 210, 'a toast runs for 210 ticks');
  check(th.second && th.second.join() === 'commit,1' && th.queued2 === 1 && th.gap2 === null && th.third && th.third.join() === 'ooo,1' && th.queued3 === 0 && th.end === null, 'the queued toasts follow one after the other, then the queue is empty');

  // the toast is drawn: gold pixels in its panel region (and none without it)
  const px = await ev(`(() => {
    const [a, b] = game.f; OKRS.reset(); step(300); render(); const without = Z.gold(322, 112, 316, 60);
    OKRS.state.n.taunts = 9; BUS.emit('taunt', { fighter: a, foe: b }); step(20); render(); const withToast = Z.gold(322, 112, 316, 60), id = OKRS.toast && OKRS.toast.id;
    step(260); render(); const after = Z.gold(322, 112, 316, 60);
    return { without, withToast, id, after };
  })()`);
  check(px.id === 'ooo' && px.withToast > px.without + 60 && px.after <= px.without + 5, 'the toast panel is drawn while it runs and gone after: ' + px.without + ' / ' + px.withToast + ' / ' + px.after + ' gold pixels');

  // ---- real matches, played to the end screen ----
  await ev(`(() => { OKRS.reset(); Z.log.length = 0; SETTINGS.set('rounds', 1); window.__okrSet = 0; BUS.on('settings', e => { if (e.key === 'okrs') window.__okrSet++; }); return 1; })()`);
  const m1 = await ev(`(() => {
    const [a, b] = Z.start(0, 1, 0); const out = { cpu: [a.cpu, b.cpu], phase: game.phase }; a.hp = Math.round(a.d.hp * 0.05); Z.ko(a, b);
    out.hits = OKRS.state.n.hits | 0; Z.over(); out.phase2 = game.phase; out.dmgTaken = a.dmgTaken;
    const n = OKRS.state.n; out.n = { wins: n.wins | 0, losses: n.losses | 0, untouched: n.untouched | 0, comebacks: n.comebacks | 0, quick: n.quick | 0, clock: n.clock | 0, clean: n.clean | 0 };
    out.cur = OKRS.state.cur; out.best = OKRS.state.best.streak; out.fx = OKRS.state.fx.slice(); out.ar = OKRS.state.ar.slice(); out.md = OKRS.state.md.slice();
    out.unl = OKRS.unlocked(); out.dirty = OKRS.dirty; out.saved = JSON.parse(localStorage.getItem('brawl.settings')).okrs; out.id = a.d.id; out.arena = game.arena; out.setEvents = window.__okrSet;
    return out;
  })()`);
  check(m1.cpu[0] === false && m1.cpu[1] === true && m1.phase2 === 'over', 'a one player match reaches the end screen');
  check(m1.n.wins === 1 && m1.n.losses === 0 && m1.cur === 1 && m1.best === 1, 'a won match counts one win and starts a streak');
  check(m1.hits >= 1 && m1.unl.includes('ship') && m1.unl.includes('hello'), 'SHIP IT and HELLO WORLD unlock from a real match: ' + m1.unl.join(','));
  check(m1.n.quick === 1 && m1.unl.includes('hotfix'), 'a KO in the first seconds is a HOTFIX');
  check(m1.n.comebacks === 1 && m1.unl.includes('rollback'), 'a round won at 5% health is a ROLLBACK KING');
  check(m1.dmgTaken === 0 ? (m1.n.untouched === 1 && m1.unl.includes('zero')) : m1.n.untouched === 0, 'a round won without taking damage is ZERO DOWNTIME (damage taken: ' + m1.dmgTaken + ')');
  check(m1.n.clean === 1 && m1.fx.length === 1 && m1.fx[0] === m1.id && m1.ar.length === 1 && m1.ar[0] === m1.arena && m1.md.join() === 'versus', 'the fighter, arena and mode of the win are recorded, and a match without losing a round counts');
  check(!m1.dirty && m1.saved && m1.saved.n.wins === 1 && m1.saved.got.ship >= 1, 'the end of the match writes the progress to the saved settings at once');
  check(m1.setEvents === 0, 'saving the progress emits no settings event in the middle of a match (the live state is stored once at load): ' + m1.setEvents);
  // on the end screen the toast sits at the left, below the colourways note (y 150) and clear of the share button, not on top of the note
  const endToast = await ev(`(() => { for (let i = 0; i < 40; i++) render(); const t = OKRS.toast; return { phase: game.phase, id: t && t.id, high: Z.gold(322, 112, 316, 60), low: Z.gold(12, 178, 316, 60) }; })()`);
  check(endToast.phase === 'over' && endToast.id && endToast.low > 60 && endToast.high < 20, 'on the end screen the toast glides to the left side, below the unlock note: ' + JSON.stringify(endToast));

  const m2 = await ev(`(() => {   // a second win, other fighter, other arena: the streak and the sets grow
    const [a, b] = Z.start(1, 2, 1); Z.ko(a, b); Z.over(); const out = { phase: game.phase };
    out.wins = OKRS.state.n.wins | 0; out.cur = OKRS.state.cur; out.best = OKRS.state.best.streak; out.fx = OKRS.state.fx.length; out.ar = OKRS.state.ar.length; out.id = a.d.id;
    return out;
  })()`);
  check(m2.phase === 'over' && m2.wins === 2 && m2.cur === 2 && m2.best === 2 && m2.fx === 2 && m2.ar === 2, 'a second win with another fighter in another arena: two wins, a streak of 2, two fighters, two arenas');

  const m3 = await ev(`(() => {   // a lost match ends the streak
    const [a, b] = Z.start(0, 1, 2); Z.ko(b, a); Z.over(); const out = { phase: game.phase };
    out.wins = OKRS.state.n.wins | 0; out.losses = OKRS.state.n.losses | 0; out.cur = OKRS.state.cur; out.best = OKRS.state.best.streak;
    return out;
  })()`);
  check(m3.phase === 'over' && m3.wins === 2 && m3.losses === 1 && m3.cur === 0 && m3.best === 2, 'a lost match counts a loss, ends the streak and keeps the best streak');

  const m4 = await ev(`(() => {   // the clock runs out with the human ahead
    const [a, b] = Z.start(2, 3, 3); b.hp = Math.round(b.d.hp * 0.5); game.timer = 1; game.clock = 59; Z.over(); const out = { phase: game.phase };
    out.clock = OKRS.state.n.clock | 0; out.wins = OKRS.state.n.wins | 0; out.freeze = OKRS.unlocked().includes('freeze');
    return out;
  })()`);
  check(m4.phase === 'over' && m4.clock === 1 && m4.wins === 3 && m4.freeze, 'a round won on the clock unlocks CODE FREEZE');

  const m5 = await ev(`(() => {   // a sudden death round
    const [a, b] = Z.start(3, 4, 4); game.sudden = true; Z.ko(a, b); Z.over(); const out = { phase: game.phase };
    out.sudden = OKRS.state.n.sudden | 0; out.on = OKRS.unlocked().includes('oncall'); out.fx = OKRS.state.fx.length; out.md = OKRS.state.md.join();
    return out;
  })()`);
  check(m5.phase === 'over' && m5.sudden === 1 && m5.on, 'a round won in sudden death unlocks ON CALL');
  check(m5.fx === 4 && m5.md === 'versus', 'fighters won with are kept in a set (4 of 5 so far) and the mode once');

  // ---- two human players in one match: both count ----
  const two = await ev(`(() => {
    OKRS.reset(); const [a, b] = Z.start(0, 1, 0); b.cpu = false; Z.ko(b, a); Z.over(); const o = OKRS.state.n;
    return { phase: game.phase, wins: o.wins | 0, losses: o.losses | 0, hits: o.hits | 0, cur: OKRS.state.cur };
  })()`);
  check(two.phase === 'over' && two.wins === 1 && two.losses === 1 && two.hits >= 1 && two.cur === 0, 'in a two human match the winner and the loser both count (the loser ends with no streak)');

  // ---- saving: timed flush, reload, junk, reset ----
  const sv = await ev(`(() => {
    OKRS.reset(); const [a, b] = Z.start(0, 1, 0); const E = () => BUS.emit('hit', { src: a, victim: b, dmg: 1, kind: 'punch', combo: 1, hp: b.hp }); const raw = () => { const o = JSON.parse(localStorage.getItem('brawl.settings')); return o && o.okrs; };
    E(); const out = { first: OKRS.dirty, rawFirst: (raw() || {}).n && raw().n.hits };    // the first hit unlocks HELLO WORLD, which saves at once
    E(); out.dirty = OKRS.dirty; out.rawStale = raw().n.hits; step(100); out.dirty100 = OKRS.dirty; step(30); out.dirty130 = OKRS.dirty; out.rawNow = raw().n.hits; out.mem = OKRS.state.n.hits;
    return out;
  })()`);
  check(sv.first === false && sv.rawFirst === 1, 'an unlock saves at once');
  check(sv.dirty && sv.rawStale === 1 && sv.dirty100 && !sv.dirty130 && sv.rawNow === sv.mem && sv.mem === 2, 'a change without an unlock is saved after about two seconds (120 ticks)');

  const snap = await ev(`(() => { OKRS.flush(); return Z.canon({ n: OKRS.state.n, got: OKRS.unlocked(), best: OKRS.state.best, fx: OKRS.state.fx, md: OKRS.state.md }); })()`);
  await open('#demo=0,1&stop');   // a new page load keeps what was saved
  const re = await ev(`Z.canon({ n: OKRS.state.n, got: OKRS.unlocked(), best: OKRS.state.best, fx: OKRS.state.fx, md: OKRS.state.md })`);
  check(re === snap && JSON.parse(re).got.includes('hello'), 'the progress is still there after a reload');

  const junk = await ev(`(() => {
    const out = {}; const c = OKRS.clean;
    out.nullv = JSON.stringify(c(null)) === JSON.stringify(c(undefined)) && c('x').cur === 0 && c([1, 2]).fx.length === 0 && c(7).got && Object.keys(c(7).got).length === 0;
    const j = c({ got: { ship: 3, bogus: 2, hello: -1, cd: 'x' }, n: { hits: 1e20, wins: -4, hax: 5, blocks: 'many', losses: 2.9 }, best: { combo: NaN, streak: 4 }, cur: Infinity, fx: ['tibo', 'tibo', 'nobody', 5, 'wang'], ar: [0, 1, 1, -3, 'x', 2.5, 3], md: ['versus', 'BAD NAME!', 5, 'versus'] });
    out.got = Object.keys(j.got).join(); out.hits = j.n.hits; out.wins = j.n.wins; out.hax = 'hax' in j.n; out.blocks = j.n.blocks; out.losses = j.n.losses; out.combo = j.best.combo; out.streak = j.best.streak; out.cur = j.cur;
    out.fx = j.fx.join(); out.ar = j.ar.join(); out.md = j.md.join();
    SETTINGS.set('okrs', { got: { ship: 1 }, n: { wins: 1, hacked: 'x' }, fx: ['dot', 'qqq'] });   // a value put in from elsewhere is adopted, cleaned
    out.adopted = OKRS.count + '/' + OKRS.state.n.wins + '/' + OKRS.state.fx.join() + '/' + ('hacked' in OKRS.state.n);
    SETTINGS.reset('okrs'); out.afterReset = OKRS.count + '/' + JSON.stringify(OKRS.state.n) + '/' + (SETTINGS.get('okrs') === OKRS.state);
    OKRS.state.n.wins = 3; OKRS.reset(); out.reset = OKRS.count + '/' + JSON.stringify(OKRS.state.n) + '/' + OKRS.toast + '/' + OKRS.queued;
    return out;
  })()`);
  check(junk.nullv, 'junk saves (null, a string, an array, a number) become an empty state');
  check(junk.got === 'ship' && junk.hits === 1e9 && junk.wins === undefined && !junk.hax && junk.blocks === undefined && junk.losses === 2, 'unknown ids, negative, huge and non-numeric counters are cleaned: ' + junk.got + ' ' + junk.hits);
  check(junk.combo === 0 && junk.streak === 4 && junk.cur === 0 && junk.fx === 'tibo,wang' && junk.ar === '0,1,3' && junk.md === 'versus', 'the best values and the lists are cleaned (only roster fighters, whole arena numbers, safe mode ids)');
  check(junk.adopted === '1/1/dot/false', 'a value put in with SETTINGS.set is adopted and cleaned: ' + junk.adopted);
  check(junk.afterReset === '0/{}/true' && junk.reset === '0/{}/null/0', 'resetting the setting (or OKRS.reset) empties the progress and the toasts, and the new empty state is stored at once: ' + junk.afterReset);

  // ---- the screen, from the title ----
  await t.open(); await ev('localStorage.clear()'); await t.open(); await ev(HELPERS);
  await ev(`OKRS.state.n.hits = 40; OKRS.state.n.wins = 12; OKRS.state.got.hello = 1; 1`);
  const t0 = await ev(`({ phase: game.phase, screen: OKRS.screen, items: titleItems().map(x => x.id), sel: game.titleSel })`);
  check(t0.phase === 'title' && !t0.screen && t0.items.includes('okrs'), 'the title shows and lists the OKRS entry');
  await ev('render(); window.__titleSum = Z.sum(); 1');
  await press('KeyG');
  const s1 = await ev(`(() => { render(); return { screen: OKRS.screen, phase: game.phase, sel: OKRS.selected, sum: Z.sum() }; })()`);
  check(s1.screen && s1.phase === 'title' && s1.sum !== await ev('__titleSum') && s1.sel === 0, 'G on the title opens the OKRS screen');
  await press('KeyS'); await press('KeyS');
  let s = await ev(`({ sel: OKRS.selected, ts: game.titleSel, phase: game.phase })`);
  check(s.sel === 2 && s.ts === 0 && s.phase === 'title', 'S moves the selection in the screen and the title menu underneath does not move');
  await press('KeyW'); await press('KeyW'); await press('KeyW');
  s = await ev(`({ sel: OKRS.selected, page: OKRS.page })`);
  check(s.sel === 29 && s.page === 1, 'W wraps from the first row to the last one, on the second page');
  await press('KeyA');
  s = await ev(`({ sel: OKRS.selected, page: OKRS.page })`);
  check(s.page === 0 && s.sel === 14, 'A goes to the previous page and keeps the row of the page (' + s.sel + ')');
  await press('KeyD');
  s = await ev(`({ sel: OKRS.selected, page: OKRS.page })`);
  check(s.page === 1 && s.sel === 29, 'D goes to the next page');
  const shot = await ev(`(() => { render(); const a = Z.sum(); OKRS.state.n.specials = 30; render(); const b = Z.sum(); OKRS.state.n.specials = 0; return a !== b; })()`);
  check(shot, 'the screen is redrawn from the progress (a bar on this page moves when its counter does)');
  await press('Enter');
  s = await ev(`({ phase: game.phase, page: OKRS.page, screen: OKRS.screen })`);
  check(s.phase === 'title' && s.screen && s.page === 0, 'Enter in the screen turns the page and does not start a match');
  await press('Escape');
  s = await ev(`({ phase: game.phase, screen: OKRS.screen, ts: game.titleSel })`);
  check(!s.screen && s.phase === 'title' && s.ts === 0, 'Escape closes the screen and the title is as it was');
  await press('Enter');
  check(await ev('game.phase') === 'select', 'after closing, Enter starts the title entry as usual');
  await ev(`setPhase('title'); game.titleSel = 0; step(2); 1`);

  // the title entry itself
  await ev(`game.titleSel = titleItems().findIndex(x => x.id === 'okrs'); step(1); 1`);
  await press('Enter');
  s = await ev(`({ screen: OKRS.screen, phase: game.phase })`);
  check(s.screen && s.phase === 'title', 'the OKRS entry of the title menu opens the screen');
  await ev(`Z.ptr(60, 25); 1`); s = await ev(`OKRS.screen`);   // BACK is at 20,12 size 96x30
  check(s === false, 'a tap on BACK closes it');
  await ev(`game.titleSel = 0; step(1); 1`);

  // the corner button of the title and the pointer
  await ev(`render(); 1`);
  const cb = await ev(`Z.col(20, 12, 156, 30, [216, 210, 196])`);
  check(cb > 40, 'the title draws the G OKRS button in its top left corner (' + cb + ' text pixels)');
  await ev(`Z.ptr(60, 25); 1`);
  check(await ev('OKRS.screen') === true && await ev('game.phase') === 'title', 'a tap on the corner button opens the screen and does not start a match');
  await ev(`Z.ptr(100, 98 + 5 * 25 + 6); step(1); 1`);
  check(await ev('OKRS.selected') === 5, 'a tap on a row selects it');
  await ev(`Z.ptr(820, 72); 1`);
  check(await ev('OKRS.page') === 1, 'a tap on the page label turns the page');
  await ev(`Z.ptr(100, 98 + 2 * 25 + 6); 1`);
  check(await ev('OKRS.selected') === 15 + 2, 'a tap on a row of the second page selects that row');
  await ev(`Z.ptr(60, 25); 1`);
  check(await ev('OKRS.screen') === false, 'BACK closes the screen again');
  await ev(`Z.ptr(500, 300); step(1); 1`);
  check(await ev('OKRS.screen') === false && await ev('game.phase') === 'select', 'a tap elsewhere on the title is left to the title (it starts the highlighted entry)');

  // ---- the screen, from the pause menu ----
  await open('#demo=0,1&stop');
  const p0 = await ev(`(() => { Z.until(() => game.phase === 'fight', 3000); const [a, b] = game.f; a.cpu = false; b.cpu = true; step(5); return game.phase; })()`);
  check(p0 === 'fight', 'the pause test starts in a fight');
  await press('KeyP');
  check(await ev('game.phase') === 'pause', 'P pauses the fight');
  await press('KeyG');
  let q = await ev(`({ screen: OKRS.screen, phase: game.phase })`);
  check(q.screen && q.phase === 'pause', 'G on the pause screen opens the OKRS screen');
  await press('KeyP');
  q = await ev(`({ screen: OKRS.screen, phase: game.phase })`);
  check(!q.screen && q.phase === 'pause', 'P closes the screen and the game stays paused');
  await press('KeyG'); await press('Escape');
  q = await ev(`({ screen: OKRS.screen, phase: game.phase })`);
  check(!q.screen && q.phase === 'pause', 'Escape closes the screen and does not resume the fight');
  // a toast waits while the screen is open, then shows
  await press('KeyG');
  const w = await ev(`(() => {
    const [a, b] = game.f; OKRS.reset(); OKRS.state.n.taunts = 9; BUS.emit('taunt', { fighter: a, foe: b }); step(30);
    const out = { screen: OKRS.screen, toast: OKRS.toast, queued: OKRS.queued }; return out;
  })()`);
  check(w.screen && w.toast === null && w.queued === 1, 'a toast does not run while the screen is open');
  await press('Escape'); await ev('step(2)');
  const w2 = await ev(`({ toast: OKRS.toast && OKRS.toast.id, queued: OKRS.queued })`);
  check(w2.toast === 'ooo' && w2.queued === 0, 'it shows once the screen is closed');
  await press('KeyG');
  await ev(`game.phase = 'fight'; step(2); 1`);
  check(await ev('OKRS.screen') === false, 'the screen closes by itself if the game leaves the title or pause phase');

  // ---- no console errors, clean up ----
  check(t.p.errors.length === errors0, 'no console errors from OKRS' + (t.p.errors.length > errors0 ? ': ' + t.p.errors.slice(errors0).join(' | ').slice(0, 300) : ''));
  await ev('localStorage.clear()');
}
