// ===== AGENT BRAWL feature file: RANKED (PERFORMANCE REVIEW, a local rating against the CPU). Loaded after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: the p-ranked agent. Only that agent edits this file, tools/tests/x-p-ranked.mjs and docs/features/p-ranked.md.
// Area: a title mode, RANKED, in which every match against the CPU moves an Elo-like rating (start 1000). The rating maps to six ranks,
//       INTERN > JUNIOR > SENIOR > STAFF > PRINCIPAL > DISTINGUISHED, and to the CPU level the next match is played at (the level follows the rating).
//       The end screen gets a rank card (rating change, rank, progress to the next rank, record, trend). Leaving a live ranked match counts as a loss.
// Plug in with: MODES.register (ranked), BUS 'match:start' / 'round:start' / 'match:end' / 'phase', SETTINGS ('ranked.rating', 'ranked.record'),
//   HOOKS 'update' (the card animation and its sounds) and HOOKS 'drawTop' (the card on the end screen, the badge on the select and VS screens, the pause warning, the forfeit note).
// Engine data it touches: game.cpuLevel (set at match:start and again at every round:start, so the engine's per-round ramp does not apply in a ranked match) and
//   SETTINGS.get('difficulty'), which answers the tier of the rating-derived CPU level while a ranked match is on screen (in memory only: the stored setting is never written).
// Emits BUS 'ranked:result' { won, forfeit, before, after, delta, ... } once per rated match. Test hook: window.RANKED (maths, schedule, state, reset) used by tools/tests/x-p-ranked.mjs.
'use strict';
(() => {
  const START = 1000, CAP = 5000, OPP_MIN = 450, OPP_MAX = 1870, HIST = 12;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RANKS = [
    { id: 'INTERN', min: 0, col: '#9aa6bd', style: 'steel' },
    { id: 'JUNIOR', min: 1100, col: '#6fd68c', style: 'toxic' },
    { id: 'SENIOR', min: 1250, col: '#4dc3ff', style: 'ice' },
    { id: 'STAFF', min: 1400, col: '#b48cff', style: 'ice' },
    { id: 'PRINCIPAL', min: 1550, col: '#ff9f43', style: 'gold' },
    { id: 'DISTINGUISHED', min: 1700, col: '#ffd24a', style: 'gold' },
  ];
  const INK = '#e8f0ff', DIM = '#8fa3c9', UP = '#7dff9a', DOWN = '#ff7a6a', GOLD = '#ffd24a';
  const FONT = 'px Impact, Haettenschweiler, "Arial Narrow", sans-serif';

  // ---------------------------------------------------------------- the maths (pure functions)
  const rankIndex = r => { let i = 0; for (let k = 0; k < RANKS.length; k++) if (r >= RANKS[k].min) i = k; return i; };
  const rankOf = r => RANKS[rankIndex(r)];
  const expected = (r, o) => 1 / (1 + Math.pow(10, (o - r) / 400));                    // the Elo expectation of the player (rating r) against an opponent rated o
  const kFactor = games => (games < 10 ? 40 : 24);                                      // the first ten matches move the rating faster
  const levelFor = opp => +clamp(0.45 + (opp - 1000) * 0.0006, 0.12, 0.97).toFixed(3); // CPU level 0..1 for an opponent rating: 1000 is the NORMAL start (0.45)
  function tierOf(level) {                                                              // the engine's DIFFICULTY name that is closest to a level
    const t = level < 0.325 ? 'easy' : level < 0.575 ? 'normal' : level < 0.825 ? 'hard' : 'nightmare';
    return t === 'nightmare' && !(typeof DIFFICULTY === 'object' && DIFFICULTY.nightmare) ? 'hard' : t;
  }
  // one match result: pw / cw = rounds won by the player / by the CPU, need = rounds to win. A wider win pays up to 25 % more, a loss that took rounds costs up to 25 % less.
  function calc(rating, opp, games, won, pw, cw, need) {
    need = Math.max(1, need | 0);
    const E = expected(rating, opp), K = kFactor(games);
    const mult = won ? 1 + 0.25 * clamp((pw - cw) / need, 0, 1) : 1 - 0.25 * clamp(pw / need, 0, 1);
    let d = Math.round(K * ((won ? 1 : 0) - E) * mult);
    d = won ? Math.max(1, d) : Math.min(-1, d);
    const next = clamp(rating + d, 0, CAP);
    return { delta: next - rating, next, expected: E, k: K, mult };
  }
  const OFFS = [0, 100, 0, -100, 0];                                                    // the opponent of match n is rated the player's rating plus this: PEER, STRETCH GOAL, PEER, WARM-UP, PEER
  function schedule(games, rating) {
    const off = OFFS[((games | 0) % 5 + 5) % 5], opp = clamp(rating + off, OPP_MIN, OPP_MAX), level = levelFor(opp);
    return { opp, off, label: off > 0 ? 'STRETCH GOAL' : off < 0 ? 'WARM-UP' : 'PEER', level, tier: tierOf(level) };
  }
  function band(r) {                                                                    // where a rating sits inside its rank (INTERN's bar starts at 900)
    const i = rankIndex(r), lo = i === 0 ? 900 : RANKS[i].min, hi = i < RANKS.length - 1 ? RANKS[i + 1].min : null;
    return { i, lo, hi, p: hi ? clamp((r - lo) / (hi - lo), 0, 1) : 1 };
  }

  // ---------------------------------------------------------------- stored state: SETTINGS 'ranked.rating' (number) and 'ranked.record' (counters, sanitised on every read)
  const int = (v, lo, hi) => { v = Math.round(+v); return Number.isFinite(v) ? clamp(v, lo, hi) : lo; };
  function cleanRec(o) {
    o = o && typeof o === 'object' ? o : {};
    const games = int(o.games, 0, 1e6), wins = Math.min(int(o.wins, 0, 1e6), games), losses = Math.min(int(o.losses, 0, 1e6), games - wins);
    const hist = (Array.isArray(o.hist) ? o.hist : []).filter(v => typeof v === 'number' && isFinite(v)).map(v => int(v, 0, CAP)).slice(-HIST);
    return { games, wins, losses, streak: int(o.streak, 0, 1e6), best: int(o.best, 0, 1e6), peak: int(o.peak, 0, CAP), forfeits: int(o.forfeits, 0, 1e6), hist };
  }
  SETTINGS.define('ranked.rating', { def: START, min: 0, max: CAP, step: 1, label: 'RANKED RATING' });
  SETTINGS.define('ranked.record', { def: cleanRec(), type: 'any', label: 'RANKED RECORD' });
  const rating = () => SETTINGS.get('ranked.rating');
  const record = () => cleanRec(SETTINGS.get('ranked.record'));

  // ---------------------------------------------------------------- the match in progress and the last result
  let M = { live: false, started: false, sched: null };   // live: a ranked match is on (from match:start to match:end); started: its first round has begun
  let last = null;                                         // the result of the last rated match (drawn on the end screen)
  let toast = null;                                        // a note on the title after a forfeit
  const ui = { t: 0 };

  function settle(won, wins, forfeit) {                    // write one result: rating, record, the card data
    const before = rating(), rec = record(), s = M.sched || schedule(rec.games, before), need = roundsToWin();
    const pw = forfeit ? 0 : wins[0], cw = forfeit ? need : wins[1];
    const c = calc(before, s.opp, rec.games, won, pw, cw, need);
    const rb = rankIndex(before), ra = rankIndex(c.next);
    rec.games++; if (won) { rec.wins++; rec.streak++; rec.best = Math.max(rec.best, rec.streak); } else { rec.losses++; rec.streak = 0; }
    if (forfeit) rec.forfeits++;
    rec.peak = Math.max(rec.peak, c.next); rec.hist.push(c.next); rec.hist = rec.hist.slice(-HIST);
    SETTINGS.set('ranked.rating', c.next); SETTINGS.set('ranked.record', rec);
    last = { won, forfeit: !!forfeit, before, after: c.next, delta: c.delta, expected: c.expected, k: c.k, mult: c.mult, wins: [pw, cw], opp: s.opp, label: s.label, level: s.level, tier: s.tier,
      rankBefore: rb, rankAfter: ra, promoted: ra > rb, demoted: ra < rb, record: rec };
    ui.t = 0; M.live = false; M.started = false;
    BUS.emit('ranked:result', last);
    return last;
  }
  function abandon() {                                     // the match was left (or replaced) before it ended
    if (!M.live) return;
    if (M.started) {
      const r = settle(false, [0, 0], true);
      toast = { t: 0, delta: r.delta, after: r.after, rank: r.rankAfter };
    } else M.live = false;
  }

  BUS.on('match:start', info => {
    if (M.live) abandon();
    if (game.modeId !== 'ranked' || info.mode !== 1) return;
    const s = schedule(record().games, rating());
    M = { live: true, started: false, sched: s };
    game.cpuLevel = s.level; last = null; toast = null;
  });
  BUS.on('round:start', () => { if (M.live) { M.started = true; game.cpuLevel = M.sched.level; } });   // no per-round ramp: the level is the rating's
  BUS.on('match:end', info => { if (M.live) settle(info.winner.side === 0, info.wins, false); });
  BUS.on('phase', e => { if (M.live && (e.to === 'title' || e.to === 'select')) abandon(); });

  // while a ranked match is on screen the engine's difficulty reads (arcade quirks, the nightmare ramp) answer the tier of the CPU level; the stored setting is untouched
  const realGet = SETTINGS.get;
  SETTINGS.get = function (key) {
    if (key === 'difficulty' && M.live && M.sched && game.phase !== 'pause') return M.sched.tier;
    return realGet.apply(SETTINGS, arguments);
  };

  MODES.register({ id: 'ranked', label: 'RANKED', order: 27, players: 1 });

  // ---------------------------------------------------------------- what the next match is worth (for the select and VS screens)
  function preview() {
    const r = rating(), rec = record(), s = schedule(rec.games, r), need = roundsToWin();
    return Object.assign({ rating: r, rank: rankIndex(r), win: calc(r, s.opp, rec.games, true, 0, 0, need).delta, lose: calc(r, s.opp, rec.games, false, 0, 0, need).delta }, s);
  }

  // ---------------------------------------------------------------- drawing helpers
  const fit = (txt, size, maxW) => {
    ctx.save(); ctx.font = size + FONT; const w = ctx.measureText(txt).width; ctx.restore();
    return w > maxW ? Math.max(8, Math.floor(size * maxW / w)) : size;
  };
  const dark = (col, k) => '#' + col.slice(1).replace(/../g, h => Math.round(parseInt(h, 16) * k).toString(16).padStart(2, '0'));
  const sgn = n => (n > 0 ? '+' : '') + n;
  const ease = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  function panel(c, x, y, w, h, col, alpha) {
    c.fillStyle = 'rgba(8,12,26,' + (alpha == null ? 0.9 : alpha) + ')'; c.fillRect(x, y, w, h);
    c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  }
  function emblem(c, x, y, u, idx, t) {                    // the rank badge: a shield, 1 to 3 chevrons and up to 3 stars, all rectangles
    const R = RANKS[idx], R_ = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x + a * u), Math.round(y + b * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u))); };
    const rowW = r => (r < 8 ? 14 : Math.max(2, 14 - (r - 7) * 2));
    for (let r = 0; r < 15; r++) { const w = rowW(r); R_((16 - w) / 2 - 0.5, r + 0.5, w + 1, 1, '#05070d'); }
    const mid = dark(R.col, 0.78), low = dark(R.col, 0.55);
    for (let r = 0; r < 14; r++) { const w = rowW(r) - 1; R_((16 - w) / 2, r + 1, w, 1, r < 5 ? R.col : r < 10 ? mid : low); }
    R_(3.5, 1.5, 9, 0.6, 'rgba(255,255,255,0.55)');
    const chev = Math.min(3, idx + 1), stars = Math.max(0, idx - 2);
    for (let k = 0; k < chev; k++) {
      const by = 6 + k * 2.4 - (chev - 1) * 0.6 + (stars ? 1 : 0);
      for (let j = 0; j < 5; j++) { R_(8 - 5 + j, by + j * 0.6, 1.1, 1.4, '#0b1020'); R_(8 + 4 - j, by + j * 0.6, 1.1, 1.4, '#0b1020'); R_(8 - 5 + j, by + j * 0.6 - 0.4, 1.1, 1.2, '#f4f8ff'); R_(8 + 4 - j, by + j * 0.6 - 0.4, 1.1, 1.2, '#f4f8ff'); }
    }
    for (let k = 0; k < stars; k++) {
      const sx = 8 - (stars * 2.2) / 2 + k * 2.2 + 0.1, sy = 2.4, tw = 0.5 + 0.5 * Math.sin(t / 6 + k * 2);
      R_(sx + 0.5, sy, 0.7, 2, '#fff6b8'); R_(sx - 0.1, sy + 0.65, 1.9, 0.7, '#fff6b8'); if (idx === 5) R_(sx + 0.5, sy, 0.7, 0.7, 'rgba(255,255,255,' + tw + ')');
    }
  }
  function spark(c, x, y, w, h, pts, col) {
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x, y, w, h);
    if (pts.length < 2) return;
    let lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts); if (hi - lo < 40) { const m = (hi + lo) / 2; lo = m - 20; hi = m + 20; }
    const X = i => x + 3 + (w - 6) * i / (pts.length - 1), Y = v => y + h - 3 - (h - 6) * (v - lo) / (hi - lo);
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); pts.forEach((v, i) => c[i ? 'lineTo' : 'moveTo'](X(i), Y(v))); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(Math.round(X(pts.length - 1)) - 2, Math.round(Y(pts[pts.length - 1])) - 2, 4, 4);
  }
  function verdict(L) {
    if (L.forfeit) return ['NO SHOW', 'blood'];
    if (L.promoted) return ['PROMOTION APPROVED', 'gold'];
    if (L.demoted) return ['PERFORMANCE PLAN', 'blood'];
    if (L.won) return L.wins[1] === 0 ? ['EXCEEDS EXPECTATIONS', 'gold'] : ['MEETS EXPECTATIONS', 'toxic'];
    return L.wins[0] > 0 ? ['NEEDS IMPROVEMENT', 'steel'] : ['BELOW EXPECTATIONS', 'blood'];
  }

  // ---------------------------------------------------------------- the rank card on the end screen (left side, clear of the winner, the SHARE button and the hint)
  function drawCard(c) {
    const L = last, t = ui.t, X = 18, Y = 132, CW = 346, CH = 292, k = ease(t / 50);
    const shown = Math.round(L.before + (L.after - L.before) * k), idx = rankIndex(shown), R = RANKS[idx], b = band(shown);
    c.save(); c.globalAlpha = ease(t / 14); c.translate(0, Math.round((1 - ease(t / 14)) * 12));
    panel(c, X, Y, CW, CH, R.col);
    if (L.promoted && t > 40 && t < 100) { c.fillStyle = 'rgba(255,230,120,' + (0.18 * (1 - (t - 40) / 60)) + ')'; c.fillRect(X, Y, CW, CH); }
    drawTitleText(c, 'PERFORMANCE REVIEW', X + CW / 2, Y + 22, 22, { align: 'center', style: 'steel', maxW: CW - 24 });
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(X + 14, Y + 40, CW - 28, 1);
    emblem(c, X + 16, Y + 52, 4.5, idx, t);
    uiText('RANK', X + 100, Y + 62, 13, DIM, 'left');
    drawTitleText(c, R.id, X + 100, Y + 86, 24, { align: 'left', style: R.style, maxW: CW - 116 });
    uiText('RATING', X + 100, Y + 112, 13, DIM, 'left');
    uiText(String(shown), X + 150, Y + 114, 34, INK, 'left');
    if (t > 18) {
      const pop = ease((t - 18) / 12), col = L.delta >= 0 ? UP : DOWN;
      uiText(sgn(L.delta), X + CW - 18, Y + 114, Math.round(26 + 10 * (1 - pop)), col, 'right', pop);
    }
    // progress to the next rank
    const nx = b.hi == null ? null : RANKS[b.i + 1];
    uiText(R.id, X + 16, Y + 146, 12, DIM, 'left'); uiText(nx ? nx.id + '  ' + nx.min : 'TOP OF THE LADDER', X + CW - 16, Y + 146, 12, nx ? nx.col : GOLD, 'right');
    c.fillStyle = '#05070d'; c.fillRect(X + 16, Y + 156, CW - 32, 12);
    c.fillStyle = R.col; c.fillRect(X + 18, Y + 158, Math.round((CW - 36) * b.p), 8);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(X + 18, Y + 158, Math.round((CW - 36) * b.p), 2);
    // the verdict
    const v = verdict(L);
    drawTitleText(c, v[0], X + CW / 2, Y + 192, 20, { align: 'center', style: v[1], glow: L.promoted ? 1 : 0.5, maxW: CW - 24 });
    uiText('VS CPU LEVEL ' + Math.round(L.level * 100) + ' - ' + L.label + (L.forfeit ? ' - MATCH LEFT' : ' - ROUNDS ' + L.wins[0] + '-' + L.wins[1]), X + CW / 2, Y + 214, 14, '#c9d6f0');
    // record boxes
    const rec = L.record, boxes = [['RECORD', rec.wins + '-' + rec.losses], ['STREAK', String(rec.streak)], ['PEAK', String(rec.peak)]], bw = Math.floor((CW - 32 - 12) / 3);
    boxes.forEach((bx, i) => {
      const x = X + 16 + i * (bw + 6);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, Y + 228, bw, 36); uiText(bx[0], x + bw / 2, Y + 236, 11, DIM); uiText(bx[1], x + bw / 2, Y + 253, 20, INK);
    });
    const pts = rec.hist.slice(); if (rec.games <= pts.length) pts.unshift(START);
    spark(c, X + 16, Y + 270, 120, 16, pts, R.col);
    const nxt = schedule(rec.games, L.after);
    uiText('NEXT CPU LEVEL ' + Math.round(nxt.level * 100) + ' - ' + nxt.label, X + 144, Y + 279, 12, '#c9d6f0', 'left');
    c.restore();
  }

  // ---------------------------------------------------------------- badges on the other screens
  function pill(c, txt, x, y, size, col, maxW) {
    size = fit(txt, size, maxW - 16); c.save(); c.font = size + FONT; const w = Math.min(maxW, c.measureText(txt).width + 16); c.restore();
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(Math.round(x - w / 2), y - 10, Math.round(w), 20);
    c.strokeStyle = col; c.lineWidth = 1; c.strokeRect(Math.round(x - w / 2) + 0.5, y - 9.5, Math.round(w) - 1, 19);
    uiText(txt, x, y + 1, size, col);
  }
  function drawBadge(c, where) {
    const p = preview(), R = RANKS[p.rank];
    const lv = 'CPU LEVEL ' + Math.round(p.level * 100) + ' ' + p.label, st = 'WIN ' + sgn(p.win) + ' LOSE ' + sgn(p.lose);
    if (where === 'select') pill(c, R.id + ' ' + p.rating + ' - ' + st, W / 2, 67, 14, R.col, 312);
    else pill(c, 'RANKED  -  ' + R.id + ' ' + p.rating + '  -  ' + lv + '  -  ' + st, W / 2, 506, 15, R.col, 720);
  }
  function drawTitleNote(c) {
    const items = typeof titleItems === 'function' ? titleItems() : [], sel = items[game.titleSel];
    if (toast && toast.t < 360) {
      const a = clamp((360 - toast.t) / 40, 0, 1), R = RANKS[toast.rank];
      c.save(); c.globalAlpha = a; panel(c, W / 2 - 190, 187, 380, 50, DOWN);
      uiText('RANKED MATCH LEFT - COUNTED AS A LOSS', W / 2, 203, 15, INK);
      uiText(sgn(toast.delta) + '  RATING ' + toast.after + '  ' + R.id, W / 2, 223, 20, DOWN);
      c.restore();
    } else if (sel && sel.id === 'ranked') {
      const r = rating(), R = rankOf(r), rec = record();
      pill(c, R.id + ' ' + r + (rec.games ? '  -  ' + rec.wins + '-' + rec.losses : '  -  NO MATCHES YET'), 160, 18, 14, R.col, 300);
    }
  }
  function drawPauseWarn(c) {
    if (!(M.live && M.started)) return;
    const need = roundsToWin(), d = calc(rating(), M.sched.opp, record().games, false, 0, need, need).delta;
    uiText('RANKED MATCH  -  QUITTING COUNTS AS A LOSS (' + sgn(d) + ')', W / 2, 108, 16, DOWN);
  }

  // ---------------------------------------------------------------- hooks
  HOOKS.add('update', () => {
    if (toast) { toast.t++; if (toast.t > 420) toast = null; }
    if (!last || game.phase !== 'over' || game.modeId !== 'ranked') return;
    ui.t++;
    if (ui.t === 22) {                                      // the result sound, once per end screen
      if (last.promoted) { beep(523, 0.12, 'square', 0.06, 1); setTimeout(() => beep(659, 0.12, 'square', 0.06, 1), 110); setTimeout(() => beep(784, 0.3, 'square', 0.07, 1), 220); }
      else if (last.demoted) { beep(330, 0.2, 'sawtooth', 0.06, 0.6); setTimeout(() => beep(220, 0.4, 'sawtooth', 0.07, 0.5), 160); }
      else if (last.won) beep(880, 0.18, 'square', 0.05, 0.8); else beep(180, 0.3, 'sawtooth', 0.05, 0.6);
    }
  });
  HOOKS.add('drawTop', (c) => {
    const ph = game.phase;
    if (ph === 'over') { if (last && game.modeId === 'ranked') drawCard(c); }
    else if (ph === 'select') { if (game.modeId === 'ranked') drawBadge(c, 'select'); drawTitleNoteIf(c); }
    else if (ph === 'vs') { if (M.live) drawBadge(c, 'vs'); }
    else if (ph === 'pause') drawPauseWarn(c);
    else if (ph === 'title') drawTitleNote(c);
  });
  const drawTitleNoteIf = c => { if (toast) drawTitleNote(c); };

  // ---------------------------------------------------------------- test hook
  window.RANKED = {
    START, CAP, RANKS, OFFS, expected, kFactor, levelFor, tierOf, rankIndex, rankOf, calc, schedule, band, preview, cleanRec,
    rating, record, last: () => last, toast: () => toast, live: () => M.live && M.started, level: () => (M.sched ? M.sched.level : null),
    state: () => ({ rating: rating(), rank: rankOf(rating()).id, record: record(), live: M.live, started: M.started, sched: M.sched, last }),
    reset() { SETTINGS.reset('ranked.rating'); SETTINGS.reset('ranked.record'); last = null; toast = null; M = { live: false, started: false, sched: null }; ui.t = 0; },
  };
})();
