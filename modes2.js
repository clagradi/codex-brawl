// ===== AGENT BRAWL feature file: MODES2 (more ways to play locally). Loaded after touch.js (see docs/ARCHITECTURE.md). =====
// Owner: the modes2 agent. Only that agent edits this file, tools/tests/x-modes2.mjs and docs/features/x-modes2.md.
// Area: TEAM BATTLE (three fighters a side, elimination, the winner stays with its health plus 20 %), TOURNAMENT (4 or 8 entrants, bracket, champion)
//       and KING OF THE HILL (2 to 8 named local players, winner stays, queue and win streak). Notes for players: docs/features/x-modes2.md.
// Plug in with: MODES.register (team, tournament, koth), HOOKS 'update' (the setup and bracket screens, the flow between matches), HOOKS 'drawTop' (those screens),
//   HOOKS 'drawHud' (team icons, names, streaks) and the MODES callbacks for BUS 'match:start' / 'round:end' / 'round:start'.
// Engine data it touches: game.toWin (HUD medal slots) while a team battle runs; SETTINGS.get('rounds') answers 3 during a team battle (in memory only, nothing is stored).
// Test hook: window.MODES2 (screen name, state, starters) used by tools/tests/x-modes2.mjs.
'use strict';
(() => {
  const NF = ROSTER.length, SIZE = 3, CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const GOLD = '#ffd24a', DIM = '#8fa3c9', INK = '#e8f0ff', RED = '#ff8a7a', BLUE = '#7cc7ff', GRN = '#8cf0a0', PANEL = '#0b1226', EDGE = '#2f3f73';
  const mod = (n, m) => ((n % m) + m) % m;
  const sh = i => SHORT(ROSTER[i]);

  // ---------------------------------------------------------------- screens: one at a time, drawn above the title, keys consumed here
  const UI = { scr: null };
  const open = s => { s.t = 0; UI.scr = s; clearPressed(); return s; };
  const close = () => { UI.scr = null; };
  function nav() { // menus accept both players' keys, the pads and touch (they all end up as the same key codes)
    const o = {};
    for (const a of ['u', 'd', 'l', 'r']) { const x = hit(0, a), y = hit(1, a); o[a] = x || y; }
    const p0 = hit(0, 'p'), p1 = hit(1, 'p'), k0 = hit(0, 'k'), k1 = hit(1, 'k'), en = tap('Enter'), sp = tap('Space'), es = tap('Escape');
    o.ok = en || sp || p0 || p1; o.back = es || k0 || k1;
    return o;
  }

  // ---------------------------------------------------------------- drawing helpers (dark arcade palette, caps text)
  function backdrop(c, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a16'); g.addColorStop(1, '#141b36'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,150,255,0.07)'; const o = (t * 0.4) % 32;
    for (let x = -o; x < W; x += 32) c.fillRect(Math.round(x), 0, 1, H);
    for (let y = -o; y < H; y += 32) c.fillRect(0, Math.round(y), W, 1);
    c.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  }
  function head(c, title, sub) { drawTitleText(c, title, W / 2, 44, 38, { align: 'center', style: 'gold', glow: true }); if (sub) uiText(sub, W / 2, 80, 15, DIM); }
  const foot = (c, hint) => uiText(hint, W / 2, H - 16, 15, '#9fb4d8');
  function box(c, x, y, w, h, hot, fill) {
    c.fillStyle = fill || PANEL; c.fillRect(x, y, w, h);
    c.strokeStyle = hot ? GOLD : EDGE; c.lineWidth = hot ? 2 : 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function hotFill(c, x, y, w, h, t) {
    c.fillStyle = 'rgba(255,210,74,' + (0.08 + 0.05 * Math.sin(t / 7)) + ')'; c.fillRect(x, y, w, h);
    c.strokeStyle = GOLD; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function icon(c, i, x, y, s, flip, dim) { c.save(); if (dim) c.globalAlpha = 0.35; drawHeadIcon(c, ROSTER[i].id, x, y, s, flip); c.restore(); }
  function cross(c, x, y, s) { c.strokeStyle = '#ff3b30'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 3, y + 3); c.lineTo(x + s - 3, y + s - 3); c.moveTo(x + s - 3, y + 3); c.lineTo(x + 3, y + s - 3); c.stroke(); }
  function button(c, x, y, w, h, label, hot) { box(c, x, y, w, h, hot, hot ? '#1a2346' : PANEL); uiText(label, x + w / 2, y + h / 2 + 1, 20, hot ? GOLD : INK); }

  // ---------------------------------------------------------------- entrants and the shared rows editor (tournament and king of the hill)
  const mkEnt = (slot, human) => ({ slot, human, tag: human ? ('P' + (slot + 1)).padEnd(3) : '   ', f: slot % NF, wins: 0, streak: 0, best: 0 });
  const nm = e => (e.human && e.tag.trim()) || (e.human ? 'P' + (e.slot + 1) : 'CPU ' + (e.slot + 1));

  function rowsScreen(cfg) {
    const m = cfg.model, s = { id: cfg.id, row: 1, fi: 0 };
    const fieldsOf = e => cfg.allowCpu ? (e.human ? ['f', 'type', 'c0', 'c1', 'c2'] : ['f', 'type']) : ['f', 'c0', 'c1', 'c2'];
    const entAt = () => s.row >= 1 && s.row <= m.n ? m.ents[s.row - 1] : null;
    const clampFi = () => { const e = entAt(); s.fi = e ? Math.min(s.fi, fieldsOf(e).length - 1) : 0; };
    function edit(e, fld, dx) {
      if (fld === 'f') e.f = mod(e.f + dx, NF);
      else if (fld === 'type') { e.human = !e.human; if (e.human && !e.tag.trim()) e.tag = ('P' + (e.slot + 1)).padEnd(3); }
      else { const ch = e.tag.padEnd(3).split(''), k = +fld[1]; ch[k] = CHARS[mod(CHARS.indexOf(ch[k]) + dx, CHARS.length)]; e.tag = ch.join(''); }
    }
    function resize(dx) {
      const z = cfg.sizes; let n = m.n;
      n = z ? z[mod(z.indexOf(n) + dx, z.length)] : Math.min(cfg.max, Math.max(cfg.min, n + dx));
      while (m.ents.length < n) m.ents.push(mkEnt(m.ents.length, !cfg.allowCpu));
      m.n = n; s.row = Math.min(s.row, m.n + 1);
    }
    s.update = n => {
      if (n.back) return cfg.back();
      const rows = m.n + 2;
      if (n.u) { s.row = mod(s.row - 1, rows); clampFi(); beep(420, 0.04); }
      if (n.d) { s.row = mod(s.row + 1, rows); clampFi(); beep(420, 0.04); }
      const e = entAt(), fl = e && fieldsOf(e), dx = (n.r ? 1 : 0) - (n.l ? 1 : 0);
      if (dx) { beep(560, 0.04); if (s.row === 0) resize(dx); else if (e) edit(e, fl[s.fi], dx); clampFi(); }
      if (n.ok) {
        beep(700, 0.06);
        if (s.row === 0) { s.row = 1; s.fi = 0; } else if (e) { if (s.fi + 1 < fl.length) s.fi++; else { s.fi = 0; s.row++; } } else cfg.start();
      }
    };
    s.draw = c => {
      backdrop(c, s.t); head(c, cfg.title, cfg.sub);
      box(c, 90, 104, 780, 30, s.row === 0);
      uiText(cfg.label, 112, 120, 18, DIM, 'left'); uiText('< ' + m.n + ' >', 330, 120, 22, s.row === 0 ? GOLD : INK);
      for (let i = 0; i < m.n; i++) {
        const e = m.ents[i], y = 146 + i * 34, on = s.row === i + 1, fl = fieldsOf(e), cell = k => on && fl[s.fi] === k;
        box(c, 90, y, 780, 30, on);
        uiText(String(i + 1), 112, y + 16, 18, DIM);
        if (cell('type')) hotFill(c, 150, y + 3, 110, 24, s.t);
        uiText(cfg.allowCpu ? (e.human ? 'HUMAN' : 'CPU') : 'PLAYER', 205, y + 16, 18, e.human ? GRN : RED);
        if (e.human) for (let k = 0; k < 3; k++) {
          const x = 290 + k * 30;
          if (cell('c' + k)) hotFill(c, x, y + 3, 26, 24, s.t); else { c.strokeStyle = '#3b4c80'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 3.5, 25, 23); }
          uiText(e.tag[k] || ' ', x + 13, y + 16, 20, INK);
        } else uiText('CPU ' + (i + 1), 290, y + 16, 18, DIM, 'left');
        if (cell('f')) hotFill(c, 420, y + 2, 320, 26, s.t);
        icon(c, e.f, 426, y + 3, 24, false); uiText(ROSTER[e.f].name, 462, y + 16, 18, INK, 'left'); uiText(ROSTER[e.f].tag, 730, y + 16, 12, DIM, 'right');
      }
      button(c, 330, 146 + m.n * 34 + 8, 300, 34, cfg.startLabel, s.row === m.n + 1);
      foot(c, cfg.hint);
    };
    return s;
  }
  const ROWS_HINT = 'UP/DOWN ROW · LEFT/RIGHT CHANGE · ENTER NEXT FIELD · ESC BACK';

  // ---------------------------------------------------------------- TEAM BATTLE
  const TEAM = { live: false, setToWin: false, sides: null, pend: null, cfg: { two: false, teams: [[0, 1, 2], [4, 3, 2]] } };
  const teamOn = () => TEAM.live && game.modeId === 'team' && game.phase !== 'title' && game.phase !== 'select';
  const rawGet = SETTINGS.get;
  SETTINGS.get = function (key) { return key === 'rounds' && teamOn() ? SIZE : rawGet.call(SETTINGS, key); };   // roundsToWin() reads this: three bouts won = the whole team is down

  function teamScreen() {
    const s = { id: 'team', cur: 1 }, cf = TEAM.cfg;
    const pick = (side, k, dx) => { const t = cf.teams[side]; let v = t[k]; for (let i = 0; i < NF; i++) { v = mod(v + dx, NF); if (!t.some((x, j) => j !== k && x === v)) break; } t[k] = v; };
    s.update = n => {
      if (n.back) { close(); return; }
      if (n.u || n.d) { // rows: mode, P1 team, P2 team, start; the column is kept
        const row = s.cur === 0 ? 0 : s.cur >= 7 ? 3 : 1 + ((s.cur - 1) / SIZE | 0), col = s.cur >= 1 && s.cur <= 6 ? (s.cur - 1) % SIZE : 0;
        const nr = mod(row + (n.d ? 1 : -1), 4); s.cur = nr === 0 ? 0 : nr === 3 ? 7 : 1 + (nr - 1) * SIZE + col; beep(420, 0.04);
      }
      const dx = (n.r ? 1 : 0) - (n.l ? 1 : 0);
      if (dx) { beep(560, 0.04); if (s.cur === 0) cf.two = !cf.two; else if (s.cur <= 6) pick((s.cur - 1) / SIZE | 0, (s.cur - 1) % SIZE, dx); }
      if (n.ok) { beep(700, 0.06); if (s.cur === 7) startTeam(); else s.cur++; }
    };
    s.draw = c => {
      backdrop(c, s.t); head(c, 'TEAM BATTLE', 'THREE FIGHTERS A SIDE · THE WINNER STAYS WITH 20% HEALTH BACK');
      box(c, 90, 104, 780, 30, s.cur === 0);
      uiText('MODE', 112, 120, 18, DIM, 'left'); uiText('< ' + (cf.two ? '2 PLAYERS' : '1 PLAYER VS CPU') + ' >', 480, 120, 22, s.cur === 0 ? GOLD : INK);
      for (let side = 0; side < 2; side++) {
        const y = 150 + side * 126;
        uiText(side ? (cf.two ? 'P2 TEAM' : 'CPU TEAM') : 'P1 TEAM', 90, y + 10, 20, side ? RED : BLUE, 'left');
        for (let k = 0; k < SIZE; k++) {
          const x = 90 + k * 264, id = cf.teams[side][k], hot = s.cur === 1 + side * SIZE + k;
          box(c, x, y + 26, 252, 84, hot, hot ? '#1a2346' : PANEL); if (hot) hotFill(c, x + 2, y + 28, 248, 80, s.t);
          icon(c, id, x + 10, y + 36, 62, side === 1);
          uiText(['FIRST', 'SECOND', 'THIRD'][k], x + 84, y + 44, 12, GOLD, 'left'); uiText(ROSTER[id].name, x + 84, y + 66, 22, INK, 'left'); uiText(ROSTER[id].tag, x + 84, y + 90, 12, DIM, 'left');
        }
      }
      button(c, 330, 412, 300, 38, 'START BATTLE', s.cur === 7);
      uiText('LOSE ALL THREE AND YOUR SIDE IS OUT', W / 2, 474, 14, DIM);
      foot(c, 'UP/DOWN ROW · LEFT/RIGHT CHANGE · ENTER NEXT · ESC BACK');
    };
    return s;
  }
  const openTeam = () => open(teamScreen());
  function startTeam() {
    const cf = TEAM.cfg; TEAM.live = true; TEAM.sides = [0, 1].map(i => ({ ids: cf.teams[i].slice(), idx: 0, out: [false, false, false] })); TEAM.pend = null;
    game.modeId = 'team'; game.mode = cf.two ? 2 : 1; game.sel = [cf.teams[0][0], cf.teams[1][0]]; game.ready = [false, false];
    close(); startMatch();
  }
  function teamMatchStart() {   // also a rematch (R on the end screen) or a start from elsewhere: always begin with each side's first fighter
    if (!TEAM.sides) { const a = game.sel[0], b = game.sel[1], more = x => [x, ...[0, 1, 2, 3, 4].filter(i => i !== x).slice(0, SIZE - 1)]; TEAM.cfg.teams = [more(a), more(b)]; TEAM.sides = [0, 1].map(i => ({ ids: TEAM.cfg.teams[i].slice(), idx: 0, out: [false, false, false] })); }
    TEAM.live = true; TEAM.pend = null;
    TEAM.sides.forEach((s, i) => { s.idx = 0; s.out = [false, false, false]; const f = game.f[i]; if (f.d !== ROSTER[s.ids[0]]) { f.d = ROSTER[s.ids[0]]; f.reset(); } });
    game.sel = [TEAM.sides[0].ids[0], TEAM.sides[1].ids[0]]; game.toWin = SIZE; TEAM.setToWin = true;
  }
  function teamRoundEnd(info) {   // the loser's slot is marked now; who comes in and how much health the winner keeps is applied when the next bout starts
    if (!TEAM.live || !TEAM.sides) return;
    if (info.reason === 'draw' || !info.winner) { TEAM.pend = { draw: true, hp: game.f.map(f => f.hp) }; return; }
    const sd = TEAM.sides[info.loser.side]; sd.out[sd.idx] = true;
    TEAM.pend = { win: info.winner.side, hp: info.winner.hp };
  }
  function teamRoundStart() {
    const p = TEAM.pend; TEAM.pend = null; if (!p || !TEAM.sides) return;
    if (p.draw) game.f.forEach((f, i) => { f.hp = Math.max(1, Math.min(f.d.hp, p.hp[i])); });   // nobody went down: both stay as they were
    else {
      const L = 1 - p.win, s = TEAM.sides[L], lf = game.f[L], wf = game.f[p.win];
      s.idx = Math.min(SIZE - 1, s.idx + 1); lf.d = ROSTER[s.ids[s.idx]]; lf.reset();
      wf.hp = Math.min(wf.d.hp, Math.round(p.hp + wf.d.hp * 0.2));
    }
    if (game.sudden) game.f.forEach(f => { f.hp = Math.ceil(f.d.hp * 0.25); });   // sudden death keeps its own rule
    game.sel = [TEAM.sides[0].ids[TEAM.sides[0].idx], TEAM.sides[1].ids[TEAM.sides[1].idx]];
    if (typeof hudReset === 'function') hudReset();
  }
  function teamStrip(c, side, x, y, s, gap, flip) {   // a side's three fighters: the one in the ring is gold, the beaten ones are greyed and crossed
    const sd = TEAM.sides[side];
    for (let k = 0; k < SIZE; k++) {
      const xx = flip ? x - k * (s + gap) : x + k * (s + gap), cur = k === sd.idx && !sd.out[k];
      c.fillStyle = 'rgba(5,7,12,0.78)'; c.fillRect(xx - 1, y - 1, s + 2, s + 2);
      icon(c, sd.ids[k], xx, y, s, side === 1, sd.out[k]);
      c.strokeStyle = cur ? GOLD : sd.out[k] ? '#5a2a2a' : '#4b5567'; c.lineWidth = cur ? 2 : 1; c.strokeRect(xx - 0.5, y - 0.5, s + 1, s + 1);
      if (sd.out[k]) cross(c, xx, y, s);
    }
  }

  // ---------------------------------------------------------------- TOURNAMENT
  const TOUR = { on: false, n: 4, ents: [], rounds: [], seed: 1, cur: null, model: { n: 4, ents: [mkEnt(0, true), mkEnt(1, false), mkEnt(2, false), mkEnt(3, false)] } };
  const roundName = r => { const k = TOUR.rounds.length - r; return k === 1 ? 'FINAL' : k === 2 ? 'SEMI-FINAL' : 'QUARTER-FINAL'; };
  function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rating = d => (d.hp / 100) * d.pow * (1 + 0.15 * (d.spd - 3.3));
  function buildBracket(n) {
    const R = []; for (let r = 0, cnt = n / 2; cnt >= 1; r++, cnt /= 2) R.push(Array.from({ length: cnt }, (_, i) => ({ r, i, a: null, b: null, w: null, score: null, sim: false })));
    R[0].forEach((m, i) => { m.a = 2 * i; m.b = 2 * i + 1; }); return R;
  }
  function advance(m, w) { m.w = w; const nx = TOUR.rounds[m.r + 1]; if (nx) { const t = nx[m.i >> 1]; if (m.i % 2) t.b = w; else t.a = w; } }
  function nextMatch() { for (const R of TOUR.rounds) for (const m of R) if (m.a != null && m.b != null && m.w == null) return m; return null; }
  const bothCpu = m => !TOUR.ents[m.a].human && !TOUR.ents[m.b].human;
  function simulate(m) {   // a skipped CPU match: best of the same rounds, decided by a seeded draw weighted by the fighters' stats, so one seed always gives one bracket
    const A = ROSTER[TOUR.ents[m.a].f], B = ROSTER[TOUR.ents[m.b].f], rnd = rng32(TOUR.seed * 977 + m.r * 131 + m.i * 17 + 1);
    const p = Math.min(0.8, Math.max(0.2, 0.5 + (rating(A) - rating(B)) * 3)), need = roundsToWin(), sc = [0, 0];
    while (sc[0] < need && sc[1] < need) sc[rnd() < p ? 0 : 1]++;
    m.score = sc; m.sim = true; advance(m, sc[0] > sc[1] ? m.a : m.b);
  }
  function startTour(cfg) {
    cfg = cfg || {}; const M = TOUR.model, src = cfg.ents || M.ents.slice(0, M.n);
    TOUR.ents = src.map((e, i) => Object.assign(mkEnt(i, !!e.human), { tag: e.tag != null ? e.tag : mkEnt(i, !!e.human).tag, f: e.f != null ? mod(e.f, NF) : i % NF }));
    TOUR.n = TOUR.ents.length; TOUR.rounds = buildBracket(TOUR.n); TOUR.seed = cfg.seed != null ? cfg.seed >>> 0 : Math.floor(Math.random() * 1e9); TOUR.cur = null; TOUR.on = true;
    bracketOrChampion();
  }
  function playMatch(m) {
    const A = TOUR.ents[m.a], B = TOUR.ents[m.b]; let L = A, R = B; if (!A.human && B.human) { L = B; R = A; }   // a lone human always plays the left side
    TOUR.cur = { m, left: L.slot, right: R.slot, watch: bothCpu(m) };
    close(); game.modeId = 'tournament'; game.mode = L.human && R.human ? 2 : 1; game.sel = [L.f, R.f]; game.ready = [false, false];
    startMatch(); if (TOUR.cur.watch) game.f.forEach(f => { f.cpu = true; });
  }
  function endTourMatch() {
    const c = TOUR.cur; TOUR.cur = null; if (!c) return;
    const need = roundsToWin(), w0 = game.wins[0] >= need ? 0 : game.wins[1] >= need ? 1 : (game.wins[0] >= game.wins[1] ? 0 : 1), m = c.m;
    m.score = m.a === c.left ? [game.wins[0], game.wins[1]] : [game.wins[1], game.wins[0]]; m.sim = false; advance(m, w0 ? c.right : c.left);
    setPhase('title'); bracketOrChampion();
  }
  const bracketOrChampion = () => nextMatch() ? open(bracketScreen()) : open(championScreen());
  function bracketScreen() {
    const s = { id: 'bracket', sel: 0, quit: 0 };
    const items = () => { const m = nextMatch(); return !m ? [] : bothCpu(m) ? ['WATCH MATCH', 'SKIP MATCH', 'SKIP ALL CPU MATCHES'] : [m.a != null && TOUR.ents[m.a].human && TOUR.ents[m.b].human ? 'PLAY MATCH (2 PLAYERS)' : 'PLAY MATCH']; };
    s.update = n => {
      if (s.quit > 0) s.quit--;
      const it = items(), m = nextMatch(); s.sel = Math.min(s.sel, it.length - 1);
      if (n.back) { if (s.quit > 0) { TOUR.on = false; close(); } else s.quit = 150; return; }
      if (n.l || n.u) { s.sel = mod(s.sel - 1, it.length); beep(420, 0.04); }
      if (n.r || n.d) { s.sel = mod(s.sel + 1, it.length); beep(420, 0.04); }
      if (n.ok && m) {
        beep(700, 0.06);
        if (it[s.sel] === 'SKIP MATCH') { simulate(m); bracketOrChampion(); }
        else if (it[s.sel] === 'SKIP ALL CPU MATCHES') { for (let x = nextMatch(); x && bothCpu(x); x = nextMatch()) simulate(x); bracketOrChampion(); }
        else playMatch(m);
      }
    };
    s.draw = c => {
      const m = nextMatch(), R = TOUR.rounds, cols = R.length + 1, gw = cols > 3 ? 200 : 236, gap = (W - 64 - cols * gw) / (cols - 1), lh = TOUR.n > 4 ? 28 : 44, top = 96, span = 338;
      backdrop(c, s.t); head(c, 'TOURNAMENT', m ? 'NEXT: ' + roundName(m.r) + ' · ' + nm(TOUR.ents[m.a]) + ' VS ' + nm(TOUR.ents[m.b]) : '');
      const cy = R.map((row, r) => row.map((_, i) => r === 0 ? top + span / row.length * (i + 0.5) : 0));
      for (let r = 1; r < R.length; r++) for (let i = 0; i < R[r].length; i++) cy[r][i] = (cy[r - 1][2 * i] + cy[r - 1][2 * i + 1]) / 2;
      const gx = r => 32 + r * (gw + gap);
      c.fillStyle = '#3b4c80';
      for (let r = 0; r < R.length; r++) {   // links from each match to the one it feeds (or to the champion box)
        const xr = gx(r) + gw, xn = gx(r + 1);
        for (let i = 0; i < R[r].length; i++) { const y1 = cy[r][i], y2 = r + 1 < R.length ? cy[r + 1][i >> 1] : cy[r][i], xm = xr + gap / 2; c.fillRect(xr, y1 - 1, xm - xr, 2); c.fillRect(xm - 1, Math.min(y1, y2), 2, Math.abs(y2 - y1) + 2); c.fillRect(xm, y2 - 1, xn - xm, 2); }
      }
      const line = (x, y, w, h, slot, mm, side) => {
        const e = slot == null ? null : TOUR.ents[slot], won = mm.w != null && mm.w === slot, lost = mm.w != null && slot != null && mm.w !== slot;
        c.fillStyle = won ? '#1d2a12' : '#0b1226'; c.fillRect(x, y, w, h);
        if (!e) { uiText('TBD', x + 12, y + h / 2 + 1, 14, '#56648c', 'left'); return; }
        icon(c, e.f, x + 3, y + 2, h - 4, false, lost);
        uiText(nm(e), x + h + 4, y + h * 0.36, h > 40 ? 22 : 15, lost ? '#6c7896' : won ? GOLD : INK, 'left');
        uiText(sh(e.f), x + h + 4, y + h * 0.78, h > 40 ? 13 : 11, lost ? '#56648c' : DIM, 'left');
        if (mm.score) uiText(String(mm.score[side]), x + w - 12, y + h / 2 + 1, 18, won ? GOLD : '#6c7896');
      };
      for (let r = 0; r < R.length; r++) for (let i = 0; i < R[r].length; i++) {
        const mm = R[r][i], x = gx(r), y = cy[r][i] - lh, isNext = mm === m;
        box(c, x - 1, y - 1, gw + 2, lh * 2 + 2, isNext && s.t % 40 < 28);
        line(x, y, gw, lh, mm.a, mm, 0); c.fillStyle = '#2f3f73'; c.fillRect(x, y + lh - 1, gw, 2); line(x, y + lh, gw, lh, mm.b, mm, 1);
        if (mm.sim) uiText('SIM', x + gw - 8, y - 8, 11, DIM, 'right');
      }
      const fin = R[R.length - 1][0], cx = gx(R.length), ch = fin.w == null ? null : TOUR.ents[fin.w];   // the champion box
      box(c, cx, cy[R.length - 1][0] - 40, gw, 80, false); uiText('CHAMPION', cx + gw / 2, cy[R.length - 1][0] - 28, 14, GOLD);
      if (ch) { icon(c, ch.f, cx + gw / 2 - 20, cy[R.length - 1][0] - 18, 40, false); uiText(nm(ch), cx + gw / 2, cy[R.length - 1][0] + 32, 16, INK); } else uiText('?', cx + gw / 2, cy[R.length - 1][0] + 4, 34, '#56648c');
      const it = items(); it.forEach((label, k) => button(c, W / 2 - it.length * 110 + k * 220 + (it.length === 1 ? -20 : 0), H - 70, it.length === 1 ? 240 : 210, 32, label, k === s.sel));
      if (s.quit > 0) uiText('PRESS ESC AGAIN TO QUIT THE TOURNAMENT', W / 2, H - 92, 15, RED);
      foot(c, it.length > 1 ? 'LEFT/RIGHT CHOOSE · ENTER GO · ESC QUIT (TWICE)' : 'ENTER PLAY THE MATCH · ESC QUIT (TWICE)');
    };
    return s;
  }
  function championScreen() {
    const s = { id: 'champion' }, fin = TOUR.rounds[TOUR.rounds.length - 1][0], e = TOUR.ents[fin.w], o = TOUR.ents[fin.w === fin.a ? fin.b : fin.a];
    s.update = n => { if (n.ok || n.back) { TOUR.on = false; close(); beep(500, 0.08); } };
    s.draw = c => {
      backdrop(c, s.t);
      for (let i = 0; i < 44; i++) { c.fillStyle = [GOLD, BLUE, RED, GRN][i % 4]; c.fillRect((i * 97 + 31) % W, (s.t * (1 + i % 3) + i * 53) % H, 6, 6); }
      drawTitleText(c, 'CHAMPION', W / 2, 70, 58, { align: 'center', style: 'gold', glow: true });
      uiText(nm(e) + ' · ' + ROSTER[e.f].name, W / 2, 124, 26, INK);
      drawSprite(c, ROSTER[e.f].id, 'win', loopFrame('win', s.t), W / 2, 432, 1, 2.6);
      uiText('FINAL: ' + nm(e) + ' BEAT ' + nm(o) + ' ' + Math.max(...fin.score) + '-' + Math.min(...fin.score), W / 2, 462, 17, DIM);
      foot(c, 'ENTER TITLE');
    };
    return s;
  }
  const tourSetup = () => open(rowsScreen({ id: 'tourSetup', title: 'TOURNAMENT', sub: 'HUMANS PLAY THEIR MATCHES · CPU MATCHES CAN BE WATCHED OR SKIPPED', label: 'ENTRANTS', model: TOUR.model, sizes: [4, 8], allowCpu: true, startLabel: 'START TOURNAMENT', hint: ROWS_HINT, start: () => startTour(), back: close }));

  // ---------------------------------------------------------------- KING OF THE HILL
  const KH = { on: false, ents: [], queue: [], at: [0, 1], king: -1, cur: null, last: null, model: { n: 3, ents: [mkEnt(0, true), mkEnt(1, true), mkEnt(2, true)] } };
  function startKoth(cfg) {
    cfg = cfg || {}; const M = KH.model, src = cfg.ents || M.ents.slice(0, M.n);
    KH.ents = src.map((e, i) => Object.assign(mkEnt(i, true), { tag: e.tag != null ? e.tag : mkEnt(i, true).tag, f: e.f != null ? mod(e.f, NF) : i % NF }));
    KH.at = [0, 1]; KH.queue = KH.ents.slice(2).map(e => e.slot); KH.king = -1; KH.cur = null; KH.last = null; KH.on = true; open(kothNext());
  }
  function playKoth() {
    const E = KH.ents; KH.cur = { left: KH.at[0], right: KH.at[1] };
    close(); game.modeId = 'koth'; game.mode = 2; game.sel = [E[KH.at[0]].f, E[KH.at[1]].f]; game.ready = [false, false]; startMatch();
  }
  function endKothMatch() {
    const c = KH.cur; KH.cur = null; if (!c) return;
    const need = roundsToWin(), sw = game.wins[0] >= need ? 0 : game.wins[1] >= need ? 1 : (game.wins[0] >= game.wins[1] ? 0 : 1), E = KH.ents, ws = KH.at[sw], ls = KH.at[1 - sw];
    E[ws].wins++; E[ws].streak++; E[ws].best = Math.max(E[ws].best, E[ws].streak); E[ls].streak = 0;
    KH.last = { w: ws, l: ls, score: [game.wins[sw], game.wins[1 - sw]] }; KH.king = ws;
    KH.queue.push(ls); KH.at[1 - sw] = KH.queue.shift();   // winner stays on its side, the loser queues up, the next in line takes the free side
    setPhase('title'); open(kothNext());
  }
  function kothNext() {
    const s = { id: 'kothNext', sel: 0 };
    const chal = () => KH.at[KH.king >= 0 && KH.at[0] === KH.king ? 1 : KH.king >= 0 && KH.at[1] === KH.king ? 0 : 1];
    s.update = n => {
      if (n.u || n.d) { s.sel = 1 - s.sel; beep(420, 0.04); }
      const dx = (n.r ? 1 : 0) - (n.l ? 1 : 0), e = KH.ents[chal()];
      if (dx) { e.f = mod(e.f + dx, NF); beep(560, 0.04); }
      if (n.back) { s.sel = 1; }
      if (n.ok) { beep(700, 0.06); if (s.sel === 0) playKoth(); else open(kothEnd()); }
    };
    s.draw = c => {
      const E = KH.ents, L = KH.last;
      backdrop(c, s.t); head(c, 'KING OF THE HILL', L ? nm(E[L.w]) + ' BEAT ' + nm(E[L.l]) + ' ' + L.score[0] + '-' + L.score[1] + ' · THE WINNER STAYS' : 'FIRST FIGHT · THE WINNER STAYS');
      for (let k = 0; k < 2; k++) {
        const e = E[KH.at[k]], x = k ? 500 : 100, king = KH.king === e.slot;
        box(c, x, 100, 360, 138, king); icon(c, e.f, x + 12, 112, 92, k === 1);
        uiText(king ? 'KING' : KH.king >= 0 ? 'CHALLENGER' : 'P' + (k + 1) + ' SIDE', x + 120, 122, 15, king ? GOLD : BLUE, 'left');
        uiText(nm(e), x + 120, 152, 32, INK, 'left'); uiText(ROSTER[e.f].name, x + 120, 182, 18, DIM, 'left');
        uiText('WINS ' + e.wins + ' · STREAK ' + e.streak, x + 120, 210, 15, king ? GOLD : DIM, 'left');
      }
      drawTitleText(c, 'VS', W / 2, 168, 34, { align: 'center', style: 'blood', glow: true });
      uiText('NEXT IN LINE: ' + (KH.queue.length ? KH.queue.map(q => nm(E[q])).join(' · ') : '-'), W / 2, 262, 16, INK);
      const rows = E.slice().sort((a, b) => b.wins - a.wins || b.best - a.best || a.slot - b.slot);
      uiText('STANDINGS', 140, 290, 15, GOLD, 'left'); uiText('WINS', 560, 290, 15, DIM, 'right'); uiText('BEST STREAK', 700, 290, 15, DIM, 'right');
      rows.forEach((e, i) => { const y = 312 + i * 20; uiText(String(i + 1) + '  ' + nm(e), 140, y, 15, INK, 'left'); uiText(sh(e.f), 330, y, 13, DIM, 'left'); uiText(String(e.wins), 560, y, 15, INK, 'right'); uiText(String(e.best), 700, y, 15, INK, 'right'); });
      button(c, W / 2 - 230, H - 66, 220, 32, 'FIGHT', s.sel === 0); button(c, W / 2 + 10, H - 66, 220, 32, 'END SESSION', s.sel === 1);
      foot(c, 'LEFT/RIGHT CHANGE THE CHALLENGER\'S FIGHTER · UP/DOWN CHOOSE · ENTER GO');
    };
    return s;
  }
  function kothEnd() {
    const s = { id: 'kothEnd' };
    s.update = n => { if (n.ok || n.back) { KH.on = false; close(); beep(500, 0.08); } };
    s.draw = c => {
      const rows = KH.ents.slice().sort((a, b) => b.wins - a.wins || b.best - a.best || a.slot - b.slot);
      backdrop(c, s.t); head(c, 'FINAL STANDINGS', 'KING OF THE HILL');
      rows.forEach((e, i) => { const y = 130 + i * 40; box(c, 200, y, 560, 34, i === 0); icon(c, e.f, 208, y + 3, 28, false); uiText((i + 1) + '  ' + nm(e), 250, y + 18, 20, i === 0 ? GOLD : INK, 'left'); uiText(sh(e.f), 430, y + 18, 14, DIM, 'left'); uiText(e.wins + ' WINS', 640, y + 18, 17, INK, 'right'); uiText('BEST ' + e.best, 745, y + 18, 15, DIM, 'right'); });
      foot(c, 'ENTER TITLE');
    };
    return s;
  }
  const kothSetup = () => open(rowsScreen({ id: 'kothSetup', title: 'KING OF THE HILL', sub: 'TWO TO EIGHT PLAYERS SHARE THE CONTROLS · THE WINNER STAYS ON', label: 'PLAYERS', model: KH.model, min: 2, max: 8, allowCpu: false, startLabel: 'START', hint: ROWS_HINT, start: () => startKoth(), back: close }));

  // ---------------------------------------------------------------- in-match overlays and the flow between matches
  HOOKS.add('drawHud', c => {
    if (teamOn() && TEAM.sides) { teamStrip(c, 0, 76, 70, 24, 4, false); teamStrip(c, 1, W - 76 - 24, 70, 24, 4, true); }
    const tour = TOUR.cur && game.modeId === 'tournament', koth = KH.cur && game.modeId === 'koth';
    if (!tour && !koth) return;
    const E = tour ? TOUR.ents : KH.ents, pair = tour ? [TOUR.cur.left, TOUR.cur.right] : [KH.cur.left, KH.cur.right];
    pair.forEach((slot, i) => { const e = E[slot]; uiText(nm(e) + (koth && e.streak ? ' · STREAK ' + e.streak : '') + (koth && KH.king === slot ? ' · KING' : ''), i ? W - 76 : 76, 80, 15, GOLD, i ? 'right' : 'left'); });
    if (tour) uiText(roundName(TOUR.cur.m.r), W / 2, 104, 14, GOLD);
    else uiText('KING OF THE HILL · NEXT: ' + (KH.queue.length ? KH.queue.map(q => nm(KH.ents[q])).join(' · ') : '-'), W / 2, H - 14, 14, GOLD);
  });
  HOOKS.add('drawTop', c => {
    if (UI.scr && game.phase === 'title') UI.scr.draw(c);
    else if (teamOn() && TEAM.sides && game.phase === 'over') {   // team end screen: how each side fared, and what Enter does here
      const win = game.wins[0] >= SIZE ? 0 : 1;
      c.fillStyle = 'rgba(8,10,22,0.94)'; c.fillRect(0, H - 34, W, 34);   // covers the engine's own hint line, which would say CHARACTER SELECT
      uiText(touch.on ? 'TAP: NEW TEAMS · SU: REMATCH' : 'ENTER NEW TEAMS · R REMATCH · T SHARE ON X · ESC TITLE', W / 2, H - 18, 16, '#ddd');
      uiText((game.mode === 2 ? 'P1 TEAM' : 'YOUR TEAM') + (win === 0 ? ' · WINNER' : ''), 96, 150, 16, win === 0 ? GOLD : BLUE, 'left');
      uiText((game.mode === 2 ? 'P2 TEAM' : 'CPU TEAM') + (win === 1 ? ' · WINNER' : ''), W - 96, 150, 16, win === 1 ? GOLD : RED, 'right');
      teamStrip(c, 0, 96, 166, 40, 4, false); teamStrip(c, 1, W - 96 - 40, 166, 40, 4, true);
    }
  });
  HOOKS.add('update', () => {
    if (!UI.scr) {
      if (game.phase === 'over' && TOUR.cur) return endTourMatch();
      if (game.phase === 'over' && KH.cur) return endKothMatch();
      if (game.phase === 'title' && TOUR.cur) { TOUR.cur = null; return bracketOrChampion(); }   // quit from the pause menu: that match is still to play
      if (game.phase === 'title' && KH.cur) { KH.cur = null; return open(kothNext()); }
      if (game.phase === 'over' && teamOn()) { const a = tap('Enter'), b = tap('Space'), c = hit(0, 'p'), d = hit(1, 'p'); if (a || b || c || d) { clearPressed(); setPhase('title'); openTeam(); } }
      if (TEAM.setToWin && !teamOn() && game.phase === 'title') { game.toWin = 0; TEAM.setToWin = false; }
      return;
    }
    if (game.phase !== 'title') { close(); return; }   // something else took the game over (a test, another feature): drop the screen
    UI.scr.t++; UI.scr.update(nav()); clearPressed();
  }, -50);

  // ---------------------------------------------------------------- registry and test hook
  MODES.register({ id: 'team', label: 'TEAM BATTLE', order: 30, players: 1, onPick() { openTeam(); return false; }, onMatchStart: teamMatchStart, onRoundEnd: teamRoundEnd, onRoundStart: teamRoundStart });
  MODES.register({ id: 'tournament', label: 'TOURNAMENT', order: 40, players: 1, onPick() { tourSetup(); return false; } });
  MODES.register({ id: 'koth', label: 'KING OF THE HILL', order: 50, players: 2, onPick() { kothSetup(); return false; } });
  window.MODES2 = {
    screen: () => UI.scr ? UI.scr.id : null,
    team: { cfg: TEAM.cfg, state: () => TEAM.sides, open: openTeam, start: startTeam },
    tournament: { state: () => TOUR, open: tourSetup, start: startTour, next: nextMatch },
    koth: { state: () => KH, open: kothSetup, start: startKoth },
  };
})();
