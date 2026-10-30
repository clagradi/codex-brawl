// ===== AGENT BRAWL feature file: OBSERVABILITY (post-match dashboard). =====
// Owner: observability agent (branch feat/p-observability).
// Area: a parody "observability platform" for the end of a match. A line chart of damage over time drawn on the canvas, a KPI scorecard
//       (hit accuracy, blocks, specials used, max combo, uptime %), an incident log and fleet totals. Reached from the end screen with O or a tap.
// Hooks used: 'update' (fight clock, keys while the report is open), 'fighterUpdate' (attacks thrown, uptime), 'drawTop' (the O button and the report).
// BUS used: match:start, round:start, round:end, match:end, hit, block, special, super, throw, phase, settings. Everything on the screen comes from these events.
// Settings: observability.enabled (the whole feature), observability.auto (open the report when the end screen appears), observability.fleet (lifetime totals).
// Engine touch points that are not hooks (nothing in game.js is edited): a pointerdown listener on the canvas (taps on the O button, the chart and BACK),
//   and the SHARE ON X anchor gets an inline visibility:hidden while the report is open (it floats over the middle of the canvas); it is restored on close.
// Public: window.OBS (state(), kpis(), series(view), open(), close(), isOpen(), tap(x, y), button(), constants) for tests and other feature files.
'use strict';
(() => {
  window.STUB_OBSERVABILITY = 1;   // marker: tools/tests/core.mjs style check that this file loaded

  SETTINGS.define('observability.enabled', { def: true, label: 'MATCH REPORT' });
  SETTINGS.define('observability.auto', { def: false, label: 'OPEN REPORT AT END' });
  SETTINGS.define('observability.fleet', { def: { m: 0, d: 0, h: 0 }, label: 'FLEET TOTALS' });

  // Fleet totals: what the store holds plus the matches of this visit that are not stored yet. They are stored when the end screen is left (rematch, menu) or the page is hidden.
  let PEND = { m: 0, d: 0, h: 0 };
  function fleet() { const f = SETTINGS.get('observability.fleet') || {}; return { m: (f.m | 0) + PEND.m, d: Math.round((+f.d || 0) + PEND.d), h: (f.h | 0) + PEND.h }; }
  function flushFleet() { if (!PEND.m) return; const f = fleet(); PEND = { m: 0, d: 0, h: 0 }; SETTINGS.set('observability.fleet', f); }
  try { addEventListener('pagehide', flushFleet); document.addEventListener('visibilitychange', () => { if (document.hidden) flushFleet(); }); } catch (e) { /* no window events */ }

  const OPEN_KEY = 'KeyO', MAX_EV = 4000, WINDOW = 5, REVEAL = 64;
  const DOWN = { hurt: 1, hit: 1, down: 1, dizzy: 1, grabbed: 1, ko: 1 };   // fighter states in which nobody is in control: they do not count as uptime
  const VIEWS = ['TOTAL DAMAGE', 'DAMAGE PER 5S'];
  const C = { panel: '#10162b', edge: '#2b3a6b', bar: '#1a2347', grid: '#1f2a4d', axis: '#4b5a8f', cream: '#e8e0cc', dim: '#8d97b8', lav: '#9fb2ff',
    green: '#5dffa0', amber: '#ffd23f', red: '#ff5d6c', cyan: '#7ef0ff', ink: '#101830' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const pad2 = n => (n < 10 ? '0' : '') + n;
  const fmtTime = sec => Math.floor(sec / 60) + ':' + pad2(Math.floor(sec % 60));
  const sideOf = f => (f && (f.side === 0 || f.side === 1)) ? f.side : -1;
  const T = (c, s, x, y, z, col, al) => ptext(c, s, x, y, z, col || C.cream, al || 'left');
  const clip = (s, z, maxW) => { s = String(s); if (ptextWidth(s, z) <= maxW) return s; while (s.length > 3 && ptextWidth(s + '..', z) > maxW) s = s.slice(0, -1); return s + '..'; };
  const touchOn = () => { try { return !!touch.on; } catch (e) { return false; } };
  const sfx = f => { try { beep(f, 0.05, 'square', 0.04); } catch (e) { /* audio is optional */ } };

  // ---------- recorded data (one match at a time) ----------
  function blank() {
    return {
      rec: false, ended: false, ver: 0, t: 0, ticks: 0, up: [0, 0],
      ids: ['', ''], names: ['P1', 'P2'], tags: ['P1', 'P2'], cols: ['#7cc7ff', '#ffb35c'], arena: '', mode: '',
      dmg: [0, 0], taken: [0, 0], hits: [0, 0], thrown: [0, 0], conn: [0, 0], blocks: [0, 0], chip: [0, 0], spec: [0, 0], sup: [0, 0], throws: [0, 0], combo: [0, 0],
      big: null, chain: null, first: null, lastHit: 0, quiet: 0, quietAt: 0,
      ev: [], rounds: [], wins: [0, 0], winner: -1, hpEnd: [1, 1],
      serial: [0, 0], lastConn: [-1, -1], pstate: ['', ''], pst: [0, 0],
    };
  }
  let S = blank();
  const U = { open: false, openT: 0, rt: 0, view: 0, lay: null, layT: -999 };   // what the screen is doing
  let ON = SETTINGS.get('observability.enabled') !== false;
  BUS.on('settings', e => { if (e.key === 'observability.enabled') { ON = e.value !== false; if (!ON) { S.rec = false; close(); } } });

  BUS.on('match:start', p => {
    close(); S = blank(); SC.key = '';
    if (!ON) return;
    S.rec = true;
    const f = (p && p.fighters) || game.f || [];
    for (let s = 0; s < 2; s++) {
      const d = f[s] && f[s].d; if (!d) continue;
      S.ids[s] = d.id; S.names[s] = SHORT(d); S.cols[s] = d.col; S.tags[s] = f[s].cpu ? 'CPU' : 'P' + (s + 1);
    }
    if (S.cols[0] === S.cols[1]) S.cols[1] = '#ff9a4d';   // a mirror match still gets two readable colours
    try { const ar = ARENAS[(p.arena | 0) % ARENAS.length]; S.arena = ar ? ar.name : ''; } catch (e) { S.arena = ''; }
    try { const m = MODES.get(p.modeId); S.mode = m ? m.label : ''; } catch (e) { S.mode = ''; }
  });
  BUS.on('round:start', p => { if (S.rec) S.rounds.push({ n: p.round, t0: S.t, t1: -1, reason: '', win: -1, sudden: !!p.sudden }); });
  BUS.on('round:end', p => {
    if (!S.rec) return;
    const r = S.rounds[S.rounds.length - 1]; if (!r || r.t1 >= 0) return;
    r.t1 = S.t; r.reason = p.reason || ''; r.win = sideOf(p.winner);
  });
  BUS.on('hit', p => {
    if (!S.rec) return;
    const s = sideOf(p.src), v = sideOf(p.victim), d = +p.dmg || 0;
    if (v >= 0) S.taken[v] += d;
    const gap = S.t - S.lastHit; if (gap > S.quiet) { S.quiet = gap; S.quietAt = S.lastHit; } S.lastHit = S.t;
    if (s < 0) return;   // damage from the arena itself: it counts as taken, but nobody dealt it
    S.dmg[s] += d; S.hits[s]++;
    if (S.lastConn[s] !== S.serial[s]) { S.lastConn[s] = S.serial[s]; S.conn[s]++; }   // one connected attack, however many hits it lands
    const cb = p.combo | 0; if (cb > S.combo[s]) S.combo[s] = cb;
    if (cb >= 2 && (!S.chain || cb > S.chain.n)) S.chain = { n: cb, s, t: S.t };
    if (!S.big || d > S.big.d) S.big = { d, s, t: S.t, kind: p.kind || '' };
    if (!S.first) S.first = { s, t: S.t, d };
    if (S.ev.length < MAX_EV) { S.ev.push({ t: S.t, s, d }); S.ver++; }
  });
  BUS.on('block', p => { if (!S.rec) return; const v = sideOf(p.victim); if (v >= 0) { S.blocks[v]++; S.chip[v] += +p.dmg || 0; } });
  BUS.on('special', p => { if (S.rec) { const s = sideOf(p.fighter); if (s >= 0) S.spec[s]++; } });
  BUS.on('super', p => { if (S.rec) { const s = sideOf(p.fighter); if (s >= 0) S.sup[s]++; } });
  BUS.on('throw', p => { if (S.rec) { const s = sideOf(p.src); if (s >= 0) { S.throws[s]++; S.thrown[s]++; S.serial[s]++; } } });
  BUS.on('match:end', p => {
    if (!S.rec || S.ended) return;
    S.ended = true; S.rec = false;
    const r = S.rounds[S.rounds.length - 1]; if (r && r.t1 < 0) r.t1 = S.t;
    S.wins = (p.wins || [0, 0]).slice(0, 2); S.winner = sideOf(p.winner);
    const f = game.f || []; for (let s = 0; s < 2; s++) if (f[s] && f[s].d && f[s].d.hp) S.hpEnd[s] = clamp(f[s].hp / f[s].d.hp, 0, 1);
    if (S.hits[0] + S.hits[1] > 0) { const tail = S.t - S.lastHit; if (tail > S.quiet) { S.quiet = tail; S.quietAt = S.lastHit; } }
    PEND.m++; PEND.d += S.dmg[0] + S.dmg[1]; PEND.h += S.hits[0] + S.hits[1];   // stored later (flushFleet): a settings write inside the match would be one more 'settings' event in the middle of the fight
  });
  BUS.on('phase', e => {
    if (e.from === 'over') flushFleet();
    if (e.to === 'over') { if (ON && S.ended && SETTINGS.get('observability.auto') === true) open(); }
    else if (U.open) close();
  });

  // attacks thrown (a new attack state, or the same state restarted by a chain) and uptime, on the ticks where the fight advances
  function sample(f) {
    const s = sideOf(f); if (s < 0) return;
    if (!DOWN[f.state]) S.up[s]++;
    if (ATTACKS.has(f.state) && (f.state !== S.pstate[s] || f.st < S.pst[s])) { S.thrown[s]++; S.serial[s]++; }
    S.pstate[s] = f.state; S.pst[s] = f.st;
  }
  HOOKS.add('fighterUpdate', (a, b) => {
    if (!S.rec || game.phase !== 'fight') return;
    S.ticks++; sample(a); sample(b);
  });

  // ---------- derived numbers ----------
  const acc = s => { const th = S.thrown[s], cn = S.conn[s]; if (!th && !cn) return null; return th ? Math.min(100, 100 * cn / th) : 100; };
  const upt = s => S.ticks ? 100 * S.up[s] / S.ticks : null;
  function kpis() {
    return [
      { id: 'acc', label: 'HIT ACCURACY', cap: 'LANDED OF THROWN', v: [acc(0), acc(1)], pct: true, dec: 0 },
      { id: 'blk', label: 'BLOCKS', cap: 'HITS DEFLECTED', v: S.blocks.slice(), dec: 0 },
      { id: 'spc', label: 'SPECIALS USED', cap: 'SPECIAL+SUPER', v: [S.spec[0] + S.sup[0], S.spec[1] + S.sup[1]], dec: 0 },
      { id: 'cmb', label: 'MAX COMBO', cap: 'HITS IN A ROW', v: S.combo.slice(), dec: 0 },
      { id: 'upt', label: 'UPTIME %', cap: 'SLA 99.9%', v: [upt(0), upt(1)], pct: true, dec: 1 },
    ];
  }
  let SC = { key: '', v: null };
  function series(view) {   // { T, pts: [[[sec, value], ...] per side], max }; view 0 = cumulative damage dealt, 1 = damage dealt in the last 5 seconds
    view = view ? 1 : 0;
    const key = view + '|' + S.ver + '|' + S.t; if (SC.key === key) return SC.v;
    const Ts = S.t / 60, n = Math.floor(Ts), ts = [[], []], cs = [[], []];
    for (const e of S.ev) { const a = cs[e.s]; ts[e.s].push(e.t); a.push((a.length ? a[a.length - 1] : 0) + e.d); }
    const cumAt = (s, t) => { const a = ts[s]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m + 1; else hi = m; } return lo ? cs[s][lo - 1] : 0; };
    const times = []; for (let i = 0; i <= n; i++) times.push(i); if (Ts - n > 0.02) times.push(Ts);
    const pts = [[], []]; let max = 0;
    for (let s = 0; s < 2; s++) for (const sec of times) {
      const v = view === 0 ? cumAt(s, sec * 60) : cumAt(s, sec * 60) - cumAt(s, Math.max(0, sec - WINDOW) * 60);
      pts[s].push([sec, v]); if (v > max) max = v;
    }
    SC = { key, v: { T: Ts, pts, max } }; return SC.v;
  }
  function incidents() {
    const out = [], n = S.names, secs = t => Math.round(t / 60);
    if (S.first) out.push({ t: S.first.t, tag: 'INFO', col: C.cyan, txt: 'FIRST HIT: ' + n[S.first.s] + ' OPENS THE SCORING' });
    if (S.big) out.push({ t: S.big.t, tag: 'SEV-2', col: C.amber, txt: 'BIGGEST HIT: ' + Math.round(S.big.d) + ' DAMAGE BY ' + n[S.big.s] + (/^(super|special|throw)$/.test(S.big.kind) ? ' (' + S.big.kind.toUpperCase() + ')' : '') });
    if (S.chain) out.push({ t: S.chain.t, tag: 'SEV-1', col: C.red, txt: 'LONGEST COMBO: ' + S.chain.n + ' HITS BY ' + n[S.chain.s] });
    if (S.quiet >= 180) out.push({ t: S.quietAt, tag: 'OK', col: C.green, txt: 'QUIET STRETCH: ' + secs(S.quiet) + 'S WITHOUT A HIT. NOBODY WAS PAGED' });
    if (!S.first) out.push({ t: 0, tag: 'OK', col: C.green, txt: 'NO HITS RECORDED. ZERO INCIDENTS. SUSPICIOUSLY QUIET' });
    if (S.ended && S.winner >= 0) out.push({ t: S.t, tag: 'DONE', col: C.green, txt: n[S.winner] + ' WINS ' + S.wins[S.winner] + '-' + S.wins[1 - S.winner] + ' IN ' + S.rounds.length + (S.rounds.length === 1 ? ' ROUND' : ' ROUNDS') + '. POSTMORTEM: NONE' });
    return out.sort((a, b) => a.t - b.t).slice(0, 5);
  }
  function status() {
    if (!S.ended || S.winner < 0) return ['NO MATCH DATA', C.dim];
    const hp = S.hpEnd[S.winner];
    return hp >= 0.6 ? ['ALL SYSTEMS NOMINAL', C.green] : hp >= 0.25 ? ['DEGRADED PERFORMANCE', C.amber] : ['PARTIAL OUTAGE', C.red];
  }
  const colOf = s => S.cols[s] || '#fff';

  // ---------- opening, closing, input ----------
  const BTN = { x: 24, y: 206, w: 276, h: 50 };   // the O button on the end screen (left side: the engine's SHARE ON X floats in the middle, the touch buttons stack on the right)
  const shareAnchor = () => document.getElementById('share');
  function hideShare(on) { try { const a = shareAnchor(); if (a) a.style.visibility = on ? 'hidden' : ''; } catch (e) { /* no DOM */ } }
  function open() {
    if (!ON || U.open || game.phase !== 'over') return false;
    U.open = true; U.openT = 0; U.rt = 0; U.view = 0; U.lay = null; hideShare(true); sfx(660); return true;
  }
  function close() {
    if (!U.open) return false;
    U.open = false; U.lay = null; hideShare(false); sfx(440); return true;
  }
  function nextView() { U.view = (U.view + 1) % VIEWS.length; U.rt = 0; sfx(560); }
  const inside = (r, x, y, sc) => {   // sc: css pixels per canvas pixel; a target is made at least 40 css pixels each way, so a small phone screen can still hit it
    const px = sc ? Math.max(0, 40 - r.w * sc) / 2 / sc : 0, py = sc ? Math.max(0, 40 - r.h * sc) / 2 / sc : 0;
    return x >= r.x - px && x <= r.x + r.w + px && y >= r.y - py && y <= r.y + r.h + py;
  };
  function onTap(x, y, sc) {
    if (!ON || game.phase !== 'over') return false;
    if (!U.open) return inside(BTN, x, y, sc) ? open() : false;
    const L = lay();
    if (inside(L.back, x, y, sc)) return close();
    if (inside(L.chart, x, y)) { nextView(); return true; }
    return false;
  }
  try {
    const cv = document.getElementById('c');
    if (cv) cv.addEventListener('pointerdown', e => {
      if (e.button > 0 || !ON || game.phase !== 'over') return;
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      onTap((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height, r.width / W);
    });
  } catch (e) { /* no canvas: keyboard only */ }

  HOOKS.add('update', g => {
    if (S.rec && g.phase === 'fight') S.t++;
    if (!ON) return;
    if (g.phase !== 'over') { if (U.open) close(); return; }
    if (U.open) {
      U.openT++; U.rt++;
      if (tap(OPEN_KEY) || tap('Escape') || tap('Enter') || tap('Space') || hit(0, 'p') || hit(1, 'p')) close();
      else if (tap('ArrowLeft') || tap('ArrowRight') || tap('KeyA') || tap('KeyD') || tap('Tab')) nextView();
      for (const k in pressed) if (k !== 'KeyR' && pressed[k]) pressed[k] = false;   // the report owns the keys, except the rematch key
    } else if (tap(OPEN_KEY)) open();
  }, -50);

  // ---------- drawing ----------
  let BG = null;
  function backdrop() {   // dark panel with scanlines and a faint grid, painted once
    if (BG) return BG;
    BG = document.createElement('canvas'); BG.width = W; BG.height = H; const g = BG.getContext('2d');
    g.fillStyle = '#070a15'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(90,120,210,0.06)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.fillStyle = 'rgba(90,120,210,0.05)'; for (let x = 0; x < W; x += 48) g.fillRect(x, 0, 1, H);
    return BG;
  }
  function rightEdge() {   // keep clear of the touch buttons when they float over the right side of the canvas
    let R = W - 24;
    try {
      const cv = document.getElementById('c'), pl = document.getElementById('pills');
      if (cv && pl) {
        const a = cv.getBoundingClientRect(), b = pl.getBoundingClientRect();
        if (a.width > 0 && b.width > 0 && b.left > a.left + a.width * 0.5 && b.left < a.right && b.top < a.bottom && b.bottom > a.top) R = Math.min(R, Math.floor((b.left - a.left) * W / a.width) - 10);
      }
    } catch (e) { /* default width */ }
    return Math.max(R, 660);
  }
  function lay() {
    if (U.lay && game.tick >= U.layT && game.tick - U.layT < 30) return U.lay;
    const L = 24, R = rightEdge(), cw = R - L, chw = Math.round(cw * 0.56), kx = L + chw + 12;
    U.layT = game.tick;
    return (U.lay = { L, R, chart: { x: L, y: 84, w: chw, h: 266 }, kpi: { x: kx, y: 84, w: R - kx, h: 266 }, log: { x: L, y: 362, w: cw, h: 122 }, back: { x: R - 124, y: 494, w: 124, h: 34 } });
  }
  function panel(c, r, title) {
    c.fillStyle = C.panel; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = C.edge; c.fillRect(r.x, r.y, r.w, 2); c.fillRect(r.x, r.y + r.h - 2, r.w, 2); c.fillRect(r.x, r.y, 2, r.h); c.fillRect(r.x + r.w - 2, r.y, 2, r.h);
    c.fillStyle = C.bar; c.fillRect(r.x + 2, r.y + 2, r.w - 4, 22);
    T(c, title, r.x + 10, r.y + 6, 2, C.lav);
  }
  function marker(c, x, y, s) {   // circle for P1, square for P2: the two lines never rely on colour alone
    c.fillStyle = colOf(s);
    if (s === 0) { c.beginPath(); c.arc(x, y, 5, 0, 6.2832); c.fill(); } else c.fillRect(x - 5, y - 5, 10, 10);
  }
  function niceMax(v) {
    if (v <= 10) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 4, 5, 8, 10]) if (k * mag >= v) return k * mag;
    return 10 * mag;
  }
  function trace(c, pts, lim, X, Y, s) {   // the line up to time `lim`, with the head interpolated; returns the head position
    const col = colOf(s); let hx = X(0), hy = Y(0);
    const path = () => {
      c.beginPath(); let started = false;
      for (let i = 0; i < pts.length; i++) {
        const t = pts[i][0], v = pts[i][1];
        if (t <= lim) { hx = X(t); hy = Y(v); if (started) c.lineTo(hx, hy); else c.moveTo(hx, hy); started = true; }
        else { if (i > 0) { const t0 = pts[i - 1][0], v0 = pts[i - 1][1], k = (lim - t0) / (t - t0); hx = X(lim); hy = Y(v0 + (v - v0) * k); c.lineTo(hx, hy); } break; }
      }
    };
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    path(); c.strokeStyle = col; c.globalAlpha *= 0.25; c.lineWidth = 7; c.stroke(); c.globalAlpha /= 0.25;
    path(); c.strokeStyle = col; c.lineWidth = 3; c.stroke();
    return [hx, hy];
  }
  function drawChart(c, r) {
    const ser = series(U.view), rev = ease(U.rt / REVEAL), done = U.rt >= REVEAL;
    panel(c, r, 'DAMAGE OVER TIME');
    T(c, VIEWS[U.view], r.x + r.w - 10, r.y + 6, 2, C.amber, 'right');
    for (let s = 0; s < 2; s++) {   // legend with the end value of each line
      const lx = r.x + 14 + s * Math.round(r.w / 2), v = ser.pts[s].length ? ser.pts[s][ser.pts[s].length - 1][1] : 0;
      let shown = U.view === 0 ? v : Math.max(0, ...ser.pts[s].map(p => p[1]));
      marker(c, lx, r.y + 38, s);
      T(c, clip(S.names[s], 2, r.w / 2 - 100) + ' ' + Math.round(shown) + (U.view ? ' PEAK' : ''), lx + 12, r.y + 31, 2, colOf(s));
    }
    const x0 = r.x + 54, x1 = r.x + r.w - 20, y0 = r.y + 60, y1 = r.y + r.h - 32, dom = Math.max(10, ser.T), ymax = niceMax(ser.max);
    const X = t => x0 + (x1 - x0) * t / dom, Y = v => y1 - (y1 - y0) * v / ymax;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    S.rounds.forEach((rd, i) => {   // alternate round bands with a label
      const a = X(rd.t0 / 60), b = X((rd.t1 < 0 ? S.t : rd.t1) / 60);
      if (i % 2) { c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(a, y0, Math.max(0, b - a), y1 - y0); }
      if (b - a > 34) T(c, rd.sudden ? 'SD' : 'R' + rd.n, a + 4, y0 + 3, 2, C.dim);
    });
    c.fillStyle = C.grid;
    for (let i = 0; i <= 4; i++) { const y = Math.round(Y(ymax * i / 4)); c.fillRect(x0, y, x1 - x0, 1); if (i % 2 === 0) T(c, String(Math.round(ymax * i / 4)), x0 - 6, y - 6, 2, C.dim, 'right'); }
    const steps = [5, 10, 15, 20, 30, 60, 120, 300], step = steps.find(q => dom / q <= 7) || 600;
    for (let t = 0; t <= dom + 0.001; t += step) { const x = Math.round(X(t)); c.fillStyle = C.grid; c.fillRect(x, y0, 1, y1 - y0); T(c, fmtTime(t), x, y1 + 10, 2, C.dim, 'center'); }
    c.fillStyle = C.axis; c.fillRect(x0 - 1, y0, 2, y1 - y0 + 1); c.fillRect(x0 - 1, y1, x1 - x0 + 2, 2);
    for (const rd of S.rounds) if (rd.t1 >= 0 && rd.win >= 0) { c.fillStyle = colOf(rd.win); c.fillRect(Math.round(X(rd.t1 / 60)) - 2, y1 - 7, 4, 7); }   // who took each round
    if (!S.ev.length) T(c, 'NO DAMAGE RECORDED', (x0 + x1) / 2, (y0 + y1) / 2 - 7, 2, C.dim, 'center');
    const lim = ser.T * rev;
    const heads = [0, 1].map(s => trace(c, ser.pts[s], lim, X, Y, s));
    for (let s = 0; s < 2; s++) {
      marker(c, heads[s][0], heads[s][1], s);
      if (done && S.ev.length) {
        const v = ser.pts[s][ser.pts[s].length - 1][1]; let ly = heads[s][1] - 16;
        if (s === 1 && Math.abs(heads[0][1] - heads[1][1]) < 16) ly = heads[1][1] + 8;
        T(c, String(Math.round(U.view ? v : v)), clamp(heads[s][0], x0 + 20, x1), clamp(ly, y0, y1 - 8), 2, colOf(s), 'right');
      }
    }
  }
  function drawKpis(c, r) {
    panel(c, r, 'KPI SCORECARD');
    const q = Math.floor(ease((U.openT - 14) / 44) * 24) / 24;   // numbers count up in 24 steps
    for (let s = 0; s < 2; s++) {
      const label = clip(s ? S.names[1] + ' ' + S.tags[1] : S.tags[0] + ' ' + S.names[0], 2, r.w / 2 - 34);
      marker(c, s ? r.x + r.w - 16 : r.x + 16, r.y + 38, s);
      T(c, label, s ? r.x + r.w - 28 : r.x + 28, r.y + 31, 2, colOf(s), s ? 'right' : 'left');
    }
    const rows = kpis(), top = r.y + 52, rh = Math.floor((r.h - 58) / rows.length), valW = ptextWidth('100.0%', 3), mid = r.x + r.w / 2, barMax = Math.max(30, (r.w - 24 - 2 * valW) / 2);
    rows.forEach((k, i) => {
      const y = top + i * rh, a = k.v[0], b = k.v[1], scale = k.pct ? 100 : Math.max(1, a || 0, b || 0);
      c.fillStyle = C.grid; c.fillRect(r.x + 8, y - 3, r.w - 16, 1);
      T(c, k.label, r.x + 10, y + 1, 2, C.cream);
      if (ptextWidth(k.cap, 2) <= r.w - 34 - ptextWidth(k.label, 2)) T(c, k.cap, r.x + r.w - 10, y + 1, 2, C.dim, 'right');   // only when it fits: the narrow touch layout drops it
      for (let s = 0; s < 2; s++) {
        const v = k.v[s], other = k.v[1 - s], lead = v != null && (other == null || v > other), shown = v == null ? null : v * q;
        const txt = shown == null ? '--' : (k.dec ? shown.toFixed(k.dec) : String(Math.round(shown))) + (k.pct ? '%' : '');
        T(c, txt, s ? r.x + r.w - 10 : r.x + 10, y + 18, 3, lead ? colOf(s) : C.cream, s ? 'right' : 'left');
        const len = v == null ? 0 : Math.round(barMax * clamp(shown / scale, 0, 1)), bx = s ? mid + 4 : mid - 4 - len;
        c.fillStyle = C.bar; c.fillRect(s ? mid + 4 : mid - 4 - barMax, y + 24, barMax, 10);
        c.globalAlpha *= lead ? 1 : 0.5; c.fillStyle = colOf(s); c.fillRect(bx, y + 24, len, 10); c.globalAlpha /= lead ? 1 : 0.5;
      }
    });
  }
  function drawLog(c, r) {
    panel(c, r, 'INCIDENT LOG');
    const list = incidents(), shown = Math.min(list.length, Math.floor((U.openT - 10) / 5));
    for (let i = 0; i < shown; i++) {
      const it = list[i], y = r.y + 32 + i * 18;
      T(c, 'T+' + fmtTime(it.t / 60), r.x + 12, y, 2, C.dim);
      T(c, it.tag, r.x + 96, y, 2, it.col);
      T(c, clip(it.txt, 2, r.w - 180), r.x + 170, y, 2, C.cream);
    }
  }
  function drawReport(c) {
    const L = lay(), st = status();
    c.save(); c.globalAlpha = Math.min(1, U.openT / 6); c.imageSmoothingEnabled = false;
    c.drawImage(backdrop(), 0, 0);
    T(c, 'OBSERVABILITY' + (((game.tick >> 5) & 1) ? '_' : ''), L.L, 14, 4, C.green);
    const chipW = ptextWidth(st[0], 2) + 24;
    c.fillStyle = C.panel; c.fillRect(L.R - chipW, 14, chipW, 28); c.fillStyle = st[1]; c.fillRect(L.R - chipW, 14, chipW, 2); c.fillRect(L.R - chipW, 40, chipW, 2); c.fillRect(L.R - chipW, 14, 2, 28); c.fillRect(L.R - 2, 14, 2, 28);
    T(c, st[0], L.R - chipW / 2, 21, 2, st[1], 'center');
    const sub = S.names[0] === 'P1' && !S.ended ? 'NO MATCH RECORDED YET' : S.tags[0] + ' ' + S.names[0] + ' VS ' + S.names[1] + ' ' + S.tags[1] + (S.arena ? ' - ' + S.arena : '') + ' - ' + fmtTime(S.t / 60) + ' OF FIGHTING';
    T(c, clip(sub, 2, L.R - L.L), L.L, 54, 2, C.cream);
    drawChart(c, L.chart); drawKpis(c, L.kpi); drawLog(c, L.log);
    const fl = fleet();
    T(c, clip('FLEET: ' + (fl.m | 0) + (fl.m === 1 ? ' MATCH - ' : ' MATCHES - ') + (fl.d | 0) + ' DAMAGE LOGGED - 0 BYTES SENT', 2, L.R - L.L - 140), L.L, 492, 2, C.dim);
    T(c, clip(touchOn() ? 'TAP THE CHART FOR ANOTHER VIEW' : 'LEFT/RIGHT CHART VIEW - O OR ESC BACK - R REMATCH - T SHARE ON X', 2, L.R - L.L - 140), L.L, 512, 2, C.lav);
    const b = L.back; c.fillStyle = C.panel; c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = C.green; c.fillRect(b.x, b.y, b.w, 2); c.fillRect(b.x, b.y + b.h - 2, b.w, 2); c.fillRect(b.x, b.y, 2, b.h); c.fillRect(b.x + b.w - 2, b.y, 2, b.h);
    T(c, touchOn() ? 'BACK' : 'BACK (O)', b.x + b.w / 2, b.y + 10, 2, C.green, 'center');
    c.restore();
  }
  function drawButton(c, g) {
    const r = BTN, glow = (Math.sin(g.tick / 14) + 1) / 2;
    c.save();
    c.fillStyle = 'rgba(8,11,22,0.9)'; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = glow > 0.5 ? C.green : '#2f8f62'; c.fillRect(r.x, r.y, r.w, 2); c.fillRect(r.x, r.y + r.h - 2, r.w, 2); c.fillRect(r.x, r.y, 2, r.h); c.fillRect(r.x + r.w - 2, r.y, 2, r.h);
    c.fillStyle = C.cream; c.fillRect(r.x + 8, r.y + 10, 28, 28); c.fillStyle = '#b9b19a'; c.fillRect(r.x + 8, r.y + 34, 28, 4);
    ptext(c, 'O', r.x + 22, r.y + 14, 3, C.ink, 'center', false);
    T(c, 'OBSERVABILITY', r.x + 46, r.y + 7, 2, C.green);
    T(c, touchOn() ? 'TAP FOR REPORT' : 'PRESS O FOR REPORT', r.x + 46, r.y + 29, 2, C.dim);
    c.restore();
  }
  HOOKS.add('drawTop', (c, g) => {
    if (!ON || g.phase !== 'over') return;
    if (U.open) drawReport(c); else drawButton(c, g);
  }, 900);

  // ---------- public ----------
  window.OBS = {
    VIEWS, KEY: OPEN_KEY, WINDOW, REVEAL, fleet, flushFleet,
    state() {
      return {
        rec: S.rec, ended: S.ended, t: S.t, ticks: S.ticks, ver: S.ver, ids: S.ids.slice(), names: S.names.slice(), tags: S.tags.slice(), cols: S.cols.slice(), arena: S.arena, mode: S.mode,
        dmg: S.dmg.slice(), taken: S.taken.slice(), hits: S.hits.slice(), thrown: S.thrown.slice(), conn: S.conn.slice(), blocks: S.blocks.slice(), chip: S.chip.slice(),
        spec: S.spec.slice(), sup: S.sup.slice(), throws: S.throws.slice(), combo: S.combo.slice(), up: S.up.slice(), quiet: S.quiet, events: S.ev.length,
        rounds: S.rounds.map(r => Object.assign({}, r)), wins: S.wins.slice(), winner: S.winner, hpEnd: S.hpEnd.slice(),
        open: U.open, openT: U.openT, rt: U.rt, view: U.view,
      };
    },
    kpis, series, incidents, status, open, close, nextView, tap: onTap, isOpen: () => U.open, button: () => Object.assign({}, BTN), layout: () => Object.assign({}, lay()),
    enabled: () => ON, fmtTime, niceMax,
  };
})();
