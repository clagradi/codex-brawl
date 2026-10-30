// ===== AGENT BRAWL feature file: P-DAILY (SPRINT OF THE DAY, a daily challenge seeded from the local date). Loaded after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: the p-daily agent. Only that agent edits this file, tools/tests/x-p-daily.mjs and docs/features/p-daily.md.
// Area: one challenge per local calendar day, the same for everybody: a fighter, an opponent, an arena, one modifier and one goal ("win without jumping").
//       A briefing screen, a goal strip during the match, a result card on the end screen, a streak of cleared days and a share text. Pure local, no network.
//       Notes for players: docs/features/p-daily.md.
// Plug in with: MODES.register (SPRINT OF THE DAY on the title menu), SETTINGS.define ('daily.state', the streak and the last days), BUS (hit, block, knockdown, throw,
//   special, super, round:start, round:end, match:end), HOOKS 'update' (briefing screen and end-screen keys), 'damage' (the damage modifiers), 'fighterUpdate' (jumps, the locked
//   meter), 'drawHud' (goal strip), 'drawTop' (briefing, goal on the versus screen, result card).
// Engine data it touches: game.sel and game.arenaPick are set for the sprint and put back afterwards. SETTINGS.get answers the sprint's fixed rules (rounds, time, difficulty) while
//   a sprint runs (in memory only, nothing is stored). shareText is wrapped on the sprint's end screen. Nothing in game.js changed.
// Test hook: window.DAILY (pure functions, the catalogs, the state and the starters) used by tools/tests/x-p-daily.mjs.
'use strict';
(() => {
  const NF = ROSTER.length, DAY_MS = 86400000;
  const GOLD = '#ffd24a', DIM = '#8fa3c9', INK = '#e8f0ff', RED = '#ff8a7a', BLUE = '#7cc7ff', GRN = '#8cf0a0', PANEL = '#0b1226', EDGE = '#2f3f73';
  const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const pad2 = n => (n < 10 ? '0' : '') + n;

  // ---------------------------------------------------------------- dates, hash and generator (pure, no clock, no Math.random)
  const dateKey = d => { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };   // the LOCAL calendar day, 'YYYY-MM-DD'
  const KEYRE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function dayNum(key) { const m = typeof key === 'string' && KEYRE.exec(key); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : NaN; }   // whole days since 1970-01-01, immune to time zones and DST
  const keyOf = n => { const d = new Date(n * DAY_MS); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); };
  const validKey = k => typeof k === 'string' && KEYRE.test(k) && keyOf(dayNum(k)) === k;   // rejects 2026-02-31
  const prevKey = k => keyOf(dayNum(k) - 1);
  const dayLabel = k => { const n = dayNum(k), d = new Date(n * DAY_MS); return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }   // FNV-1a
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }   // mulberry32
  let override = null;   // tests only: pretend it is another day
  const todayKey = () => override || dateKey(new Date());

  // ---------------------------------------------------------------- catalogs: modifiers and goals
  // mul = [damage multiplier when the victim is you, when the victim is the CPU]; rules = the fixed settings for the sprint; clash = goals that make no sense with it
  const MODS = [
    { id: 'glass', name: 'GLASS CANNONS', text: 'ALL DAMAGE X1.6 FOR BOTH SIDES', mul: [1.6, 1.6], clash: ['taken'] },
    { id: 'fragile', name: 'FRAGILE FOE', text: 'THE CPU TAKES 50 PERCENT MORE DAMAGE', mul: [1, 1.5] },
    { id: 'bulky', name: 'IRON FOE', text: 'THE CPU TAKES 30 PERCENT LESS DAMAGE', mul: [1, 0.7], clash: ['speed'] },
    { id: 'nometer', name: 'NO METER', text: 'THE SUPER METER STAYS EMPTY', meterLock: true, clash: ['super'] },
    { id: 'fast', name: 'SPEED ROUNDS', text: 'ROUNDS LAST 45 SECONDS', rules: { time: 45 } },
    { id: 'one', name: 'ONE ROUND', text: 'A SINGLE ROUND DECIDES THE SPRINT', rules: { rounds: 1 }, clash: ['noloss', 'hits'] },
    { id: 'marathon', name: 'MARATHON', text: 'FIRST TO 3 ROUNDS WINS', rules: { rounds: 3 }, clash: ['speed'] },
    { id: 'hard', name: 'HARD CPU', text: 'THE CPU FIGHTS AT HARD LEVEL', rules: { difficulty: 'hard' }, clash: ['taken', 'noloss'] },
    { id: 'rookie', name: 'ROOKIE CPU', text: 'THE CPU FIGHTS AT EASY LEVEL', rules: { difficulty: 'easy' } },
  ];
  // stats = { jumps, blocks, throws, specials, supers, knocks, hits, maxCombo, taken, secs, lost }; every goal also needs the win
  const GOALS = [
    { id: 'nojump', text: () => 'WIN WITHOUT JUMPING', ok: s => s.jumps === 0, fail: s => s.jumps > 0, prog: s => 'JUMPS ' + s.jumps },
    { id: 'noblock', text: () => 'WIN WITHOUT BLOCKING', ok: s => s.blocks === 0, fail: s => s.blocks > 0, prog: s => 'BLOCKS ' + s.blocks },
    { id: 'taken', n: [45, 70, 100], text: n => 'WIN TAKING ' + n + ' DAMAGE OR LESS', ok: (s, n) => s.taken <= n, fail: (s, n) => s.taken > n, prog: (s, n) => 'DAMAGE ' + Math.round(s.taken) + '/' + n },
    { id: 'combo', n: [3, 4], text: n => 'LAND A ' + n + '-HIT COMBO AND WIN', ok: (s, n) => s.maxCombo >= n, fail: () => false, prog: (s, n) => 'BEST COMBO ' + s.maxCombo + '/' + n },
    { id: 'specials', n: [2, 3, 4], text: n => 'USE ' + n + ' SPECIAL MOVES AND WIN', ok: (s, n) => s.specials >= n, fail: () => false, prog: (s, n) => 'SPECIALS ' + s.specials + '/' + n },
    { id: 'super', text: () => 'WIN WITH A SUPER MOVE', ok: s => s.supers >= 1, fail: () => false, prog: s => 'SUPERS ' + s.supers + '/1' },
    { id: 'nospecial', text: () => 'WIN WITHOUT SPECIAL MOVES', ok: s => s.specials + s.supers === 0, fail: s => s.specials + s.supers > 0, prog: s => 'SPECIALS ' + (s.specials + s.supers) },
    { id: 'throws', n: [1, 2, 3], text: n => 'THROW THE CPU ' + n + (n === 1 ? ' TIME' : ' TIMES') + ' AND WIN', ok: (s, n) => s.throws >= n, fail: () => false, prog: (s, n) => 'THROWS ' + s.throws + '/' + n },
    { id: 'knocks', n: [2, 3, 4], text: n => 'KNOCK THE CPU DOWN ' + n + ' TIMES', ok: (s, n) => s.knocks >= n, fail: () => false, prog: (s, n) => 'KNOCKDOWNS ' + s.knocks + '/' + n },
    { id: 'noloss', text: () => 'WIN WITHOUT LOSING A ROUND', ok: s => s.lost === 0, fail: s => s.lost > 0, prog: s => 'ROUNDS LOST ' + s.lost },
    { id: 'speed', n: [50, 70, 90], text: n => 'WIN IN UNDER ' + n + ' SECONDS', ok: (s, n) => s.secs < n, fail: (s, n) => s.secs >= n, prog: (s, n) => 'TIME ' + Math.floor(s.secs) + '/' + n },
    { id: 'hits', n: [12, 18, 25], text: n => 'LAND ' + n + ' HITS AND WIN', ok: (s, n) => s.hits >= n, fail: () => false, prog: (s, n) => 'HITS ' + s.hits + '/' + n },
  ];
  const MODBY = {}, GOALBY = {};
  for (const m of MODS) MODBY[m.id] = m;
  for (const g of GOALS) GOALBY[g.id] = g;
  const goalText = p => GOALBY[p.goal].text(p.n);
  const goalMet = (id, n, stats) => !!GOALBY[id].ok(stats, n);
  const freshStats = () => ({ jumps: 0, blocks: 0, throws: 0, specials: 0, supers: 0, knocks: 0, hits: 0, maxCombo: 0, taken: 0, secs: 0, lost: 0 });
  const BASE_RULES = { rounds: 2, time: 99, difficulty: 'normal' };   // everybody fights under the same rules, whatever they set in the options

  // ---------------------------------------------------------------- the plan of a day: a pure function of the date key
  function planFor(key) {
    const r = rng(hashStr('AGENT-BRAWL-SPRINT-' + key)), pick = n => Math.min(n - 1, Math.floor(r() * n));
    const f = pick(NF); let o = pick(NF - 1); if (o >= f) o++;   // the opponent is never the same fighter
    const arena = pick(ARENAS.length), mod = MODS[pick(MODS.length)];
    const goals = GOALS.filter(g => !(mod.clash || []).includes(g.id)), goal = goals[pick(goals.length)];
    const n = goal.n ? goal.n[pick(goal.n.length)] : 0;
    return { key, day: dayNum(key), f, o, arena, mod: mod.id, goal: goal.id, n, rules: Object.assign({}, BASE_RULES, mod.rules || {}) };
  }

  // ---------------------------------------------------------------- the saved state and the streak (pure)
  // { v, last: last cleared day, streak: run of cleared days ending at `last`, best, cleared: days cleared, won: days won, played: days played, h: { day: { s: 0 lost / 1 won / 2 cleared, n: tries } } }
  function trim(o) { const ks = Object.keys(o.h).sort(); while (ks.length > 30) delete o.h[ks.shift()]; }
  function sanitize(s) {
    const o = { v: 1, last: '', streak: 0, best: 0, cleared: 0, won: 0, played: 0, h: {} };
    if (!s || typeof s !== 'object' || Array.isArray(s)) return o;
    const num = x => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(Math.floor(x), 99999) : 0);
    if (validKey(s.last)) o.last = s.last;
    o.streak = o.last ? num(s.streak) : 0; o.best = Math.max(num(s.best), o.streak); o.cleared = num(s.cleared); o.won = num(s.won); o.played = num(s.played);
    if (s.h && typeof s.h === 'object') for (const k of Object.keys(s.h)) {
      const e = s.h[k]; if (validKey(k) && e && typeof e === 'object' && (e.s === 0 || e.s === 1 || e.s === 2)) o.h[k] = { s: e.s, n: Math.max(1, num(e.n)) };
    }
    trim(o); return o;
  }
  function applyResult(st, key, status) {   // status: 0 lost, 1 won with the goal missed, 2 cleared. Returns a new state; the streak moves only on the first clear of a day
    const s = sanitize(st); if (!validKey(key) || !(status === 0 || status === 1 || status === 2)) return s;
    const prev = s.h[key]; s.h[key] = { s: Math.max(prev ? prev.s : 0, status), n: (prev ? prev.n : 0) + 1 };
    if (!prev) s.played++;
    if (status >= 1 && !(prev && prev.s >= 1)) s.won++;
    if (status === 2 && !(prev && prev.s === 2)) {
      s.cleared++;
      if (s.last !== key && (!s.last || dayNum(key) > dayNum(s.last))) { s.streak = s.last && dayNum(s.last) === dayNum(key) - 1 ? s.streak + 1 : 1; s.last = key; }
      s.best = Math.max(s.best, s.streak);
    }
    trim(s); return s;
  }
  function liveStreak(st, today) {   // the streak as shown on `today`: it breaks when yesterday was not cleared
    const s = sanitize(st); if (!s.last || !validKey(today)) return 0;
    return dayNum(s.last) >= dayNum(today) - 1 ? s.streak : 0;
  }
  SETTINGS.define('daily.state', { def: null, label: 'SPRINT OF THE DAY' });   // the streak and the last 30 days (a JSON object), stored with the other settings
  const getState = () => sanitize(SETTINGS.get('daily.state'));

  // ---------------------------------------------------------------- the run: state of the sprint being played
  const RUN = { on: false, plan: null, mod: null, stats: freshStats(), prev: { state: 'idle', ground: true }, rt: 99, result: null, keep: null, overT: 0 };
  const live = () => RUN.on && game.modeId === 'daily' && !RUN.result;
  const inRun = () => RUN.on && game.modeId === 'daily' && !!RUN.plan;

  function launch() {   // start (or restart) the match of the planned sprint
    const p = RUN.plan, keepArena = game.arenaPick;
    RUN.stats = freshStats(); RUN.prev = { state: 'idle', ground: true }; RUN.result = null; RUN.overT = 0; RUN.rt = p.rules.time;
    game.sel = [p.f, p.o]; game.arenaPick = p.arena; game.ready = [false, false];
    startMatch();
    game.arenaPick = keepArena;   // the arena was read by startMatch: the player's own pick is back before anything else looks at it
  }
  function startDaily(key) {
    const p = planFor(key && validKey(key) ? key : todayKey());
    if (!RUN.on) RUN.keep = { sel: game.sel.slice() };
    RUN.plan = p; RUN.mod = MODBY[p.mod]; RUN.on = true;
    MODES.pick('daily'); close(); launch();
  }
  function endRun() {   // the sprint is over or left: the player's own selection is back
    if (RUN.keep) game.sel = RUN.keep.sel;
    RUN.on = false; RUN.keep = null; RUN.result = null; RUN.overT = 0;
  }

  // ---- fixed rules: the sprint reads its own rounds, time and difficulty (the stored options are not touched)
  const baseGet = SETTINGS.get;
  SETTINGS.get = function (key) {
    if (RUN.on && RUN.plan && game.modeId === 'daily' && Object.prototype.hasOwnProperty.call(RUN.plan.rules, key)) return RUN.plan.rules[key];
    return baseGet.apply(SETTINGS, arguments);
  };
  // ---- damage modifiers
  HOOKS.add('damage', pl => {
    if (!inRun() || !pl || !pl.victim || !RUN.mod.mul) return;
    const k = RUN.mod.mul[pl.victim.side === 0 ? 0 : 1];
    if (k !== 1) { pl.dmg *= k; return pl; }
  });
  // ---- jumps (a jump starts from the ground) and the locked meter
  HOOKS.add('fighterUpdate', (a, b) => {
    if (!live() || !a) return;
    const p = RUN.prev; if (a.state === 'jump' && p.state !== 'jump' && p.ground) RUN.stats.jumps++;
    p.state = a.state; p.ground = !!a.onGround;
    if (RUN.mod.meterLock) { a.meter = 0; if (b) b.meter = 0; }
  });
  // ---- the other stats, from the engine events
  const side0 = f => !!f && f.side === 0;
  BUS.on('hit', e => { if (!live()) return; const s = RUN.stats; if (side0(e.src)) { s.hits++; if (e.combo > s.maxCombo) s.maxCombo = e.combo; } if (side0(e.victim)) s.taken += e.dmg; });
  BUS.on('block', e => { if (live() && side0(e.victim)) RUN.stats.blocks++; });
  BUS.on('knockdown', e => { if (live() && side0(e.src)) RUN.stats.knocks++; });
  BUS.on('throw', e => { if (live() && side0(e.src)) RUN.stats.throws++; });
  BUS.on('special', e => { if (live() && side0(e.fighter)) RUN.stats.specials++; });
  BUS.on('super', e => { if (live() && side0(e.fighter)) RUN.stats.supers++; });
  BUS.on('round:start', e => { if (live()) { RUN.rt = e.time; RUN.prev = { state: 'idle', ground: true }; } });
  BUS.on('round:end', e => { if (live()) { RUN.stats.secs += Math.max(0, RUN.rt - game.timer) + (game.timer > 0 ? (game.clock % 60) / 60 : 0); RUN.stats.lost = e.wins[1]; } });

  function finishMatch(info) {   // the match is decided: score it, keep the streak, store the state
    if (!live()) return;
    const p = RUN.plan, st = RUN.stats; st.lost = info.wins[1];
    const won = !!info.winner && info.winner.side === 0, met = won && goalMet(p.goal, p.n, st), status = won ? (met ? 2 : 1) : 0;
    const before = getState(), after = applyResult(before, p.key, status);
    SETTINGS.set('daily.state', after);
    RUN.result = {
      won, met, status, stats: Object.assign({}, st), key: p.key, tries: after.h[p.key].n, streak: liveStreak(after, p.key), best: after.best,
      firstClear: status === 2 && !(before.h[p.key] && before.h[p.key].s === 2), newBest: after.best > before.best, cleared: after.cleared,
    };
  }

  // ---------------------------------------------------------------- share text (only on the sprint's end screen)
  const baseShare = window.shareText;
  window.shareText = function () {
    if (!(RUN.on && RUN.result && game.modeId === 'daily' && RUN.plan)) return baseShare.apply(this, arguments);
    const p = RUN.plan, r = RUN.result;
    return 'Sprint of the day ' + p.key + ' in Agent Brawl: ' + (r.status === 2 ? 'cleared' : r.won ? 'won, but missed the goal' : 'lost') + ' as ' + SHORT(ROSTER[p.f]) + ' against ' + SHORT(ROSTER[p.o]) +
      ' (' + goalText(p).toLowerCase() + ', ' + RUN.mod.name.toLowerCase() + '). Streak: ' + r.streak + (r.streak === 1 ? ' day.' : ' days.');
  };

  // ---------------------------------------------------------------- screens: the briefing, one at a time above the title, keys consumed here
  const UI = { scr: null };
  const open = s => { s.t = 0; UI.scr = s; clearPressed(); return s; };
  const close = () => { UI.scr = null; };
  function nav() { // both players' keys, the pads and touch all end up as the same key codes
    const o = {};
    for (const a of ['u', 'd', 'l', 'r']) o[a] = hit(0, a) || hit(1, a);
    const p0 = hit(0, 'p'), p1 = hit(1, 'p'), k0 = hit(0, 'k'), k1 = hit(1, 'k'), en = tap('Enter'), sp = tap('Space'), es = tap('Escape');
    o.ok = en || sp || p0 || p1; o.back = es || k0 || k1;
    return o;
  }
  function backdrop(c, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a16'); g.addColorStop(1, '#141b36'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,150,255,0.07)'; const o = (t * 0.4) % 32;
    for (let x = -o; x < W; x += 32) c.fillRect(Math.round(x), 0, 1, H);
    for (let y = -o; y < H; y += 32) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  }
  function box(c, x, y, w, h, hot, fill) {
    c.fillStyle = fill || PANEL; c.fillRect(x, y, w, h);
    c.strokeStyle = hot ? GOLD : EDGE; c.lineWidth = hot ? 2 : 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function button(c, x, y, w, h, label, hot) { box(c, x, y, w, h, hot, hot ? '#1a2346' : PANEL); uiText(label, x + w / 2, y + h / 2 + 1, 20, hot ? GOLD : INK); }
  function icon(c, i, x, y, s, flip) { drawHeadIcon(c, ROSTER[i].id, x, y, s, flip); }
  function mark(c, x, y, ok) {   // a check or a cross, 20 px
    c.save(); c.lineWidth = 4; c.lineCap = 'round'; c.strokeStyle = ok ? GRN : '#ff5b4a'; c.beginPath();
    if (ok) { c.moveTo(x + 2, y + 10); c.lineTo(x + 8, y + 17); c.lineTo(x + 19, y + 3); } else { c.moveTo(x + 3, y + 3); c.lineTo(x + 17, y + 17); c.moveTo(x + 17, y + 3); c.lineTo(x + 3, y + 17); }
    c.stroke(); c.restore();
  }
  const fmtTime = s => Math.floor(s / 60) + ':' + pad2(Math.floor(s % 60));
  const statusName = e => e ? (e.s === 2 ? 'CLEARED' : e.s === 1 ? 'WON, GOAL MISSED' : 'LOST') + ' (' + e.n + (e.n === 1 ? ' TRY)' : ' TRIES)') : 'NOT PLAYED YET';

  function briefing() {
    const s = { id: 'daily', sel: 0, plan: planFor(todayKey()) };
    s.update = n => {
      const k = todayKey(); if (k !== s.plan.key) s.plan = planFor(k);   // midnight passed while the screen was open
      if (n.back) { close(); beep(300, 0.06); return; }
      if (n.l || n.r || n.u || n.d) { s.sel = 1 - s.sel; beep(420, 0.04); }
      if (n.ok) { beep(700, 0.06); if (s.sel === 0) startDaily(s.plan.key); else close(); }
    };
    s.draw = c => {
      const p = s.plan, mod = MODBY[p.mod], st = getState(), arena = ARENAS[p.arena % ARENAS.length], today = st.h[p.key], streak = liveStreak(st, p.key);
      backdrop(c, s.t);
      drawTitleText(c, 'SPRINT OF THE DAY', W / 2, 44, 38, { align: 'center', style: 'gold', glow: true });
      uiText(dayLabel(p.key) + ' - THE SAME CHALLENGE FOR EVERYBODY TODAY', W / 2, 80, 15, DIM);
      for (let k = 0; k < 2; k++) {   // the two fighters
        const x = k ? 490 : 60, i = k ? p.o : p.f, r = ROSTER[i];
        box(c, x, 98, 410, 104); icon(c, i, x + 12, 106, 88, k === 1);
        uiText(k ? 'OPPONENT (CPU)' : 'YOU', x + 116, 122, 15, k ? RED : BLUE, 'left'); uiText(SHORT(r), x + 116, 152, 32, INK, 'left'); uiText(r.tag, x + 116, 182, 15, DIM, 'left');
      }
      box(c, 60, 210, 410, 104);   // arena
      c.fillStyle = '#000'; c.fillRect(70, 220, 152, 87); drawArenaThumb(c, p.arena, 72, 222, 148, 83, s.t);
      uiText('ARENA', 236, 230, 15, GOLD, 'left'); uiText(arena.name, 236, 258, 21, INK, 'left'); uiText(arena.tagline, 236, 286, 13, DIM, 'left');
      box(c, 490, 210, 410, 104);   // modifier
      uiText('MODIFIER', 506, 230, 15, GOLD, 'left'); uiText(mod.name, 506, 262, 28, INK, 'left'); uiText(mod.text, 506, 292, 15, DIM, 'left');
      box(c, 60, 322, 840, 56, true);   // goal
      uiText('GOAL', 76, 338, 14, GOLD, 'left'); uiText(goalText(p), 76, 362, 25, INK, 'left');
      uiText('TODAY: ' + statusName(today), 884, 350, 16, today && today.s === 2 ? GRN : today ? BLUE : DIM, 'right');
      box(c, 60, 386, 840, 82);   // streak and the last seven days
      drawTitleText(c, String(streak), 120, 438, 46, { align: 'center', style: 'gold', glow: streak > 0 });
      uiText(streak === 1 ? 'DAY STREAK' : 'DAYS STREAK', 168, 424, 22, streak > 0 ? GOLD : DIM, 'left');
      uiText('BEST ' + st.best + '   CLEARED ' + st.cleared + '   PLAYED ' + st.played, 168, 452, 14, DIM, 'left');
      uiText('LAST 7 DAYS', 560, 398, 13, DIM, 'left');
      for (let d = 6; d >= 0; d--) {
        const k = keyOf(dayNum(p.key) - d), e = st.h[k], x = 560 + (6 - d) * 48, col = e ? (e.s === 2 ? GOLD : e.s === 1 ? BLUE : RED) : null;
        c.fillStyle = col || '#141b36'; c.fillRect(x, 408, 38, 24); c.strokeStyle = d === 0 ? '#fff' : EDGE; c.lineWidth = d === 0 ? 2 : 1; c.strokeRect(x + 0.5, 408.5, 37, 23);
        uiText(WD[new Date(dayNum(k) * DAY_MS).getUTCDay()], x + 19, 448, 12, d === 0 ? INK : DIM);
      }
      button(c, W / 2 - 230, 476, 220, 32, today && today.s === 2 ? 'PLAY AGAIN' : 'FIGHT', s.sel === 0); button(c, W / 2 + 10, 476, 220, 32, 'BACK', s.sel === 1);
      uiText('LEFT/RIGHT CHOOSE - ENTER GO - ESC BACK', W / 2, H - 16, 15, '#9fb4d8');
    };
    return s;
  }
  const openBriefing = () => open(briefing());
  const cvs = document.getElementById('c');
  if (cvs) cvs.addEventListener('pointerdown', e => {   // the engine turns every tap on the title into ENTER: a tap on BACK has to pick BACK first, anywhere else picks FIGHT
    const s = UI.scr; if (!s || s.id !== 'daily' || game.phase !== 'title' || e.button > 0) return;
    const r = cvs.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    s.sel = y >= 470 && x >= W / 2 + 10 && x <= W / 2 + 230 ? 1 : 0;
  });

  // ---------------------------------------------------------------- in-match strip, the goal on the versus screen, the result card
  function resultCard(c) {
    const p = RUN.plan, r = RUN.result, s = r.stats, x = 24, y = 128, w = 332;
    c.fillStyle = '#080a16'; c.fillRect(0, H - 34, W, 34);   // covers the engine's own hint line, which would say CHARACTER SELECT
    uiText(touch.on ? 'TAP SELECT FOR THE BRIEFING, REMATCH TO RETRY - SHARE ON X POSTS THE RESULT' : 'ENTER BRIEFING - R RETRY - T SHARE ON X - ESC TITLE', W / 2, H - 18, 16, '#ddd');
    box(c, x, y, w, 296, true, 'rgba(8,12,28,0.93)');
    drawTitleText(c, r.status === 2 ? 'SPRINT CLEARED' : r.won ? 'GOAL MISSED' : 'SPRINT LOST', x + w / 2, y + 28, 24, { align: 'center', style: r.status === 2 ? 'gold' : r.won ? 'steel' : 'blood', glow: r.status === 2 });
    uiText('GOAL', x + 14, y + 62, 13, GOLD, 'left'); uiText(goalText(p), x + 14, y + 84, 17, INK, 'left'); mark(c, x + w - 34, y + 66, r.met);
    uiText('MODIFIER: ' + RUN.mod.name, x + 14, y + 110, 14, DIM, 'left');
    const rows = [['TIME', fmtTime(s.secs)], ['HITS LANDED', s.hits], ['BEST COMBO', s.maxCombo], ['DAMAGE TAKEN', Math.round(s.taken)], ['JUMPS', s.jumps], ['BLOCKS', s.blocks]];
    rows.forEach((row, i) => { const yy = y + 138 + i * 21; uiText(row[0], x + 14, yy, 15, DIM, 'left'); uiText(String(row[1]), x + w - 14, yy, 15, INK, 'right'); });
    c.fillStyle = EDGE; c.fillRect(x + 14, y + 262 - 8, w - 28, 1);
    uiText('STREAK ' + r.streak + (r.streak === 1 ? ' DAY' : ' DAYS'), x + 14, y + 270, 22, r.streak > 0 ? GOLD : DIM, 'left');
    uiText(r.firstClear ? (r.newBest && r.streak > 1 ? 'NEW BEST STREAK' : 'TODAY IS IN THE BOOKS') : r.status === 2 ? 'ALREADY CLEARED - PRACTICE' : 'TRY #' + r.tries + ' - RETRY TO CLEAR IT', x + w - 14, y + 270, 12, r.firstClear ? GRN : DIM, 'right');
  }
  HOOKS.add('drawHud', c => {
    if (!inRun()) return;
    const p = RUN.plan, g = GOALBY[p.goal], bad = g.fail(RUN.stats, p.n);
    uiText('GOAL: ' + goalText(p) + '   ' + g.prog(RUN.stats, p.n), W / 2, 112, 16, bad ? RED : INK);   // under the clock and the round label, clear of the bars and the move tips
    uiText('SPRINT OF THE DAY - ' + RUN.mod.name, W / 2, 130, 13, GOLD);
  });
  HOOKS.add('drawTop', c => {
    if (UI.scr && game.phase === 'title') { UI.scr.draw(c); return; }
    if (!inRun()) return;
    if (game.phase === 'vs') { uiText('SPRINT OF THE DAY - ' + RUN.mod.name + ': ' + RUN.mod.text, W / 2, 496, 15, GOLD); uiText('GOAL: ' + goalText(RUN.plan), W / 2, 518, 18, INK); }
    else if (game.phase === 'over' && RUN.result) resultCard(c);
  });

  // ---------------------------------------------------------------- the flow: briefing keys, the end screen, leaving a sprint
  function overTick() {
    RUN.overT++;
    const ok = tap('Enter') || tap('Space') || hit(0, 'p') || hit(1, 'p'), again = tap('KeyR') || hit(0, 'x'), esc = tap('Escape');
    clearPressed();   // the engine's end-screen keys (select, rematch) are not for a sprint: they are read here instead
    if (RUN.overT < 40) return;   // a mashed punch from the fight must not skip the card
    if (again) launch();
    else if (ok) { endRun(); setPhase('title'); openBriefing(); beep(500, 0.08); }
    else if (esc) { endRun(); setPhase('title'); }
  }
  HOOKS.add('update', () => {
    if (RUN.on) {
      const ph = game.phase;
      if (game.modeId !== 'daily') { endRun(); return; }   // another feature took the game over
      if (ph === 'over' && RUN.result) { overTick(); return; }
      if (ph === 'title') { endRun(); openBriefing(); return; }   // quit from the pause menu: no result, back to the briefing
      if (ph === 'select' || ph === 'over' || ph === 'sheet') { endRun(); return; }
      return;
    }
    if (!UI.scr) return;
    if (game.phase !== 'title') { close(); return; }   // something else took the game over (a test, another feature): drop the screen
    UI.scr.t++; UI.scr.update(nav()); clearPressed();
  }, -50);

  // ---------------------------------------------------------------- registry and test hook
  MODES.register({ id: 'daily', label: 'SPRINT OF THE DAY', order: 28.5, players: 1, endCard: true, onPick() { openBriefing(); return false; }, onMatchEnd: finishMatch });
  window.DAILY = {
    dateKey, dayNum, keyOf, prevKey, validKey, dayLabel, hashStr, rng, planFor, goalText, goalMet, sanitize, applyResult, liveStreak, fmtTime,
    MODS, GOALS, BASE_RULES, state: getState, today: todayKey, setToday: k => { override = k || null; },
    screen: () => UI.scr ? UI.scr.id : null, sel: () => UI.scr ? UI.scr.sel : -1, open: openBriefing, start: startDaily, run: () => RUN, shareText: () => window.shareText(),
  };
})();
