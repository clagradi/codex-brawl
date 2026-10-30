// ===== AGENT BRAWL feature file: P-REVIEW (AI code review of your match). =====
// Owner: review agent (branch feat/p-review).
// Area: after a 1P match against the CPU (mode 'versus'), a parody pull-request review slides over the end screen: 3 to 5 comments about how
//       the human played (blocked too little, spammed one special, never threw...) and a verdict, APPROVED or CHANGES REQUESTED.
// Data: only BUS events (match:start, round:start, round:end, match:end, hit, block, knockdown, throw, special, super, finisher, phase).
//       The text is a pure function of those counts (REVIEW.build), so the same match always gets the same review. No randomness, no clock.
// Hooks used: 'update' (order -40: the review's own clock, and Enter / Space / punch close it before the end screen sees them),
//             'drawTop' (order 150: the review panel, and a small verdict badge on the end screen once it is closed).
// Settings: review.on (default true). Off: nothing is shown and the end screen behaves exactly as before.
// Keys while the review is open: Enter, Space or punch skip the animation, then close it. R / Esc / T keep their end-screen meaning.
//   On the end screen after closing: the special key (L, or C in 1P) opens the review again.
// Public: window.REVIEW (build, stats, state, open, close, wrap, modes) for tests and other features. Nothing in game.js is edited.
'use strict';
(() => {
  window.STUB_REVIEW = 1;   // marker: the feature file loaded

  SETTINGS.define('review.on', { def: true, label: 'MATCH CODE REVIEW' });

  const MODES_OK = new Set(['versus']);   // modes whose end screen is the engine's own: the review lives on top of it
  const COLS = 62;                        // characters per comment line at pixel size 2 (12 px each) inside the panel
  const SLIDE = 16, T0 = 24, STEP = 14, GRACE = 12;   // ticks: panel slide-in, first comment, gap between comments, presses ignored at first
  const PX = 72, PY = 22, PW = 816, PH = 496, X0 = PX + 24, BH = 58;
  const TAG = { BLOCKING: '#f85149', SUGGESTION: '#58a6ff', QUESTION: '#d2a8ff', NIT: '#8b949e', PRAISE: '#3fb950' };
  const RANK = { BLOCKING: 0, SUGGESTION: 1, QUESTION: 2, NIT: 3, PRAISE: 4 };
  const OK_COL = '#3fb950', BAD_COL = '#f85149', DIM = '#8b949e', INK = '#e6edf3';

  // ---------------------------------------------------------------- counting, from BUS events only
  const blank = () => ({ hits: 0, dmg: 0, punch: 0, kick: 0, combo: 0, taken: 0, dmgTaken: 0, blocks: 0, chip: 0, blocked: 0,
    sp: {}, spN: 0, su: 0, throws: 0, thrown: 0, kd: 0, kdTaken: 0, fin: '', won: 0, lost: 0, perfect: [], roundHit: 0 });
  const S = { sides: [blank(), blank()], pauses: 0, timeouts: [], first: null, live: false };
  const side = f => f && (f.side === 0 || f.side === 1) ? S.sides[f.side] : null;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const clean = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 .,!?:;\-_/'"()[\]+=<>&@#%*]/g, '').trim();

  BUS.on('match:start', () => { S.sides = [blank(), blank()]; S.pauses = 0; S.timeouts = []; S.first = null; S.live = true; R.pending = null; });
  BUS.on('round:start', () => { S.sides[0].roundHit = 0; S.sides[1].roundHit = 0; });
  BUS.on('hit', e => {
    const a = side(e.src), v = side(e.victim), d = num(e.dmg);
    if (a) { a.hits++; a.dmg += d; if (e.kind === 'punch') a.punch++; else if (e.kind === 'kick') a.kick++; if (num(e.combo) > a.combo) a.combo = num(e.combo); }
    if (v) { v.taken++; v.dmgTaken += d; v.roundHit++; }
  });
  BUS.on('block', e => { const a = side(e.src), v = side(e.victim); if (v) { v.blocks++; v.chip += num(e.dmg); } if (a) a.blocked++; });
  BUS.on('knockdown', e => { const a = side(e.src), v = side(e.victim); if (a) a.kd++; if (v) v.kdTaken++; });
  BUS.on('throw', e => { const a = side(e.src), v = side(e.victim); if (a) a.throws++; if (v) v.thrown++; });
  BUS.on('special', e => { const a = side(e.fighter); if (!a) return; const n = clean(e.move && e.move.name) || 'SPECIAL'; a.sp[n] = (a.sp[n] || 0) + 1; a.spN++; });
  BUS.on('super', e => { const a = side(e.fighter); if (a) a.su++; });
  BUS.on('finisher', e => { const a = side(e.winner); if (a) a.fin = clean(e.move && e.move.name) || 'FINISHER'; });
  BUS.on('round:end', e => {
    if (e.reason === 'time') S.timeouts.push(e.round);
    const w = side(e.winner), l = side(e.loser);
    if (w) { w.won++; if (w.roundHit === 0) w.perfect.push(e.round); }
    if (l) l.lost++;
    if (e.round === 1 && S.first === null) S.first = e.winner && (e.winner.side === 0 || e.winner.side === 1) ? e.winner.side : -1;
  });

  // ---------------------------------------------------------------- the review: a pure function of the counts
  const pct = (a, b) => (b > 0 ? Math.round(a * 100 / b) : 0);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const topSpecial = H => { let best = '', n = 0; for (const k of Object.keys(H.sp).sort()) if (H.sp[k] > n) { best = k; n = H.sp[k]; } return [best, n]; };
  // Rules in priority order inside each tag. when(H, F, M) decides, text(H, F, M, v) writes it (v picks a wording from the counts).
  const RULES = [
    { id: 'lost', tag: 'BLOCKING', file: 'MATCH.JS', when: (H, F, M) => !M.won,
      text: (H, F, M, v) => [`CI IS RED: ${M.foe} WON ${M.l}-${M.w}. PLEASE DO NOT MERGE A LOSING BRANCH.`,
        `${M.l}-${M.w} TO ${M.foe}. THE TESTS DID NOT PASS, THEY JUST STOPPED RUNNING.`][v % 2] },
    { id: 'idle', tag: 'BLOCKING', file: 'MAIN.JS', when: H => H.hits <= 2,
      text: H => `ONLY ${plural(H.hits, 'HIT', 'HITS')} LANDED ALL MATCH. THIS PR IS MOSTLY WHITESPACE.` },
    { id: 'noblock', tag: 'BLOCKING', file: 'GUARD.JS', when: H => H.blocks === 0 && H.taken >= 4,
      text: H => `ZERO BLOCKS, ${H.taken} HITS TAKEN. EVERY REQUEST WENT TO PROD UNVALIDATED. HOLD BACK TO GUARD.` },
    { id: 'spam', tag: 'BLOCKING', file: 'SPECIALS.JS', when: H => H.spN >= 4 && topSpecial(H)[1] >= H.spN * 0.6,
      text: H => { const [m, n] = topSpecial(H); return `${m} X${n} OUT OF ${H.spN} SPECIALS. THAT IS COPY-PASTE, NOT A STRATEGY. EXTRACT A HELPER.`; } },
    { id: 'lowblock', tag: 'SUGGESTION', file: 'GUARD.JS', when: H => H.blocks > 0 && H.taken >= 8 && H.blocks < (H.blocks + H.taken) * 0.25,
      text: H => `BLOCKED ${H.blocks} OF ${H.blocks + H.taken} INCOMING HITS (${pct(H.blocks, H.blocks + H.taken)}%). WRAP YOUR FACE IN A TRY/CATCH.` },
    { id: 'nospecial', tag: 'SUGGESTION', file: 'SPECIALS.JS', when: H => H.spN === 0 && H.su === 0,
      text: H => `NO SPECIALS, NO SUPERS. THE WHOLE MOVE API IS RIGHT THERE AND YOU ONLY CALLED ${H.kick > H.punch ? 'KICK' : 'PUNCH'}().` },
    { id: 'fullmeter', tag: 'SUGGESTION', file: 'METER.JS', when: (H, F, M) => H.su === 0 && M.meter >= 100,
      text: () => 'ENDED WITH A FULL SUPER METER. UNUSED CAPACITY IS STILL BILLED.' },
    { id: 'thrown', tag: 'SUGGESTION', file: 'GRAB.JS', when: H => H.thrown >= 3,
      text: H => `THROWN ${H.thrown} TIMES. STOP STANDING SO CLOSE TO UNTRUSTED CODE.` },
    { id: 'floor', tag: 'SUGGESTION', file: 'RETRY.JS', when: H => H.kdTaken >= 3,
      text: H => `KNOCKED DOWN ${H.kdTaken} TIMES. PLEASE ADD A RETRY WITH EXPONENTIAL BACKOFF.` },
    { id: 'timeout', tag: 'QUESTION', file: 'CLOCK.JS', when: (H, F, M) => M.timeouts.length > 0,
      text: (H, F, M) => `ROUND ${M.timeouts[0]} TIMED OUT. IS THAT A PERFORMANCE REGRESSION OR A STRATEGY?` },
    { id: 'pause', tag: 'QUESTION', file: 'FOCUS.JS', when: (H, F, M) => M.pauses >= 2,
      text: (H, F, M) => `PAUSED ${M.pauses} TIMES. WAS THIS FIGHT BLOCKED ON A STANDUP?` },
    { id: 'nothrow', tag: 'NIT', file: 'GRAB.JS', when: H => H.throws === 0,
      text: (H, F, M, v) => ['NO THROWS ALL MATCH. FORWARD + PUNCH UP CLOSE IS NOT DEPRECATED.',
        'ZERO THROWS. THE GRAB() ENDPOINT HAS NO CALLERS, CONSIDER USING OR REMOVING IT.'][v % 2] },
    { id: 'mash', tag: 'NIT', file: 'INPUT.JS', when: H => H.hits >= 8 && Math.max(H.punch, H.kick) >= H.hits * 0.8,
      text: H => H.punch >= H.kick ? `${pct(H.punch, H.hits)}% OF YOUR HITS WERE PUNCHES. KICK() IS DOCUMENTED, PLEASE READ THE DOCS.`
        : `${pct(H.kick, H.hits)}% OF YOUR HITS WERE KICKS. PUNCH() FEELS LEFT OUT OF THE CODEBASE.` },
    { id: 'onehit', tag: 'NIT', file: 'COMBO.JS', when: H => H.hits >= 6 && H.combo <= 1,
      text: H => `${H.hits} HITS, NONE OF THEM CHAINED. TRY BATCHING YOUR CALLS.` },
    { id: 'nosuper', tag: 'NIT', file: 'METER.JS', when: (H, F, M) => H.su === 0 && H.spN > 0 && M.meter < 100,
      text: () => 'NO SUPERS THIS MATCH. THE METER IS NOT JUST A PROGRESS BAR.' },
    { id: 'perfect', tag: 'PRAISE', file: 'UPTIME.JS', when: H => H.perfect.length > 0,
      text: H => `ROUND ${H.perfect[0]}: ZERO HITS TAKEN. THAT IS A 100% UPTIME SLA.` },
    { id: 'combo', tag: 'PRAISE', file: 'COMBO.JS', when: H => H.combo >= 4,
      text: H => `${H.combo}-HIT COMBO. CLEAN PIPELINE, NO FLAKY STEPS.` },
    { id: 'comeback', tag: 'PRAISE', file: 'HOTFIX.JS', when: (H, F, M) => M.won && M.first === 1,
      text: () => 'LOST ROUND 1, THEN SHIPPED A HOTFIX. CLASSIC.' },
    { id: 'goodblock', tag: 'PRAISE', file: 'GUARD.JS', when: H => H.blocks >= 5 && H.blocks >= (H.blocks + H.taken) * 0.4,
      text: H => `${H.blocks} HITS BLOCKED (${pct(H.blocks, H.blocks + H.taken)}%). SOLID INPUT VALIDATION.` },
    { id: 'variety', tag: 'PRAISE', file: 'SPECIALS.JS', when: H => Object.keys(H.sp).length >= 3,
      text: H => `${Object.keys(H.sp).length} DIFFERENT SPECIALS USED. NICE TEST COVERAGE.` },
    { id: 'grabs', tag: 'PRAISE', file: 'GRAB.JS', when: H => H.throws >= 3,
      text: H => `${H.throws} THROWS LANDED. GREAT USE OF THE GRAB() ENDPOINT.` },
    { id: 'finisher', tag: 'PRAISE', file: 'DEPLOY.JS', when: H => !!H.fin,
      text: H => `${H.fin} ON THE WAY OUT. DEPLOYED ON A FRIDAY AND NOTHING BROKE.` },
  ];
  const FILLERS = [
    { id: 'style', tag: 'NIT', file: 'STYLE.JS', text: (H, F, M) => `TRAILING WHITESPACE AFTER ROUND ${M.rounds}. OTHERWISE FINE.` },
    { id: 'retest', tag: 'QUESTION', file: 'TESTS.JS', text: () => 'CAN WE GET A REMATCH AS A REGRESSION TEST?' },
    { id: 'changelog', tag: 'NIT', file: 'CHANGELOG.MD', text: () => 'MISSING CHANGELOG ENTRY. ADD ONE LINE SAYING WHAT YOU HIT.' },
  ];

  function wrap(s, cols = COLS) {
    const out = []; let line = '';
    for (let w of String(s).split(' ')) {
      if (!w) continue;
      while (w.length > cols) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, cols)); w = w.slice(cols); }
      if (!line) line = w; else if (line.length + 1 + w.length <= cols) line += ' ' + w; else { out.push(line); line = w; }
    }
    if (line) out.push(line);
    return out;
  }

  // stats: { me, foe, won, w, l, rounds, meter, pauses, timeouts, first (0 me, 1 foe, -1 draw), H, F } -> the review, always 3 to 5 comments
  function build(st) {
    const H = Object.assign(blank(), st.H), F = Object.assign(blank(), st.F);
    const M = { me: clean(st.me) || 'P1', foe: clean(st.foe) || 'CPU', won: !!st.won, w: num(st.w) | 0, l: num(st.l) | 0, rounds: Math.max(1, num(st.rounds) | 0),
      meter: num(st.meter), pauses: num(st.pauses) | 0, timeouts: Array.isArray(st.timeouts) ? st.timeouts : [], first: st.first };
    const dealt = Math.round(H.dmg), taken = Math.round(H.dmgTaken);
    const v = (H.hits * 7 + H.taken * 3 + M.rounds) >>> 0;   // wording choice: a function of the counts, never random
    const hits = RULES.filter(r => r.when(H, F, M)).sort((a, b) => RANK[a.tag] - RANK[b.tag]);
    const issues = hits.filter(r => r.tag !== 'PRAISE'), praise = hits.filter(r => r.tag === 'PRAISE');
    const pick = issues.slice(0, 3); if (praise.length) pick.push(praise[0]);
    for (const r of issues.slice(3).concat(praise.slice(1))) if (pick.length < 5) pick.push(r);
    for (const r of FILLERS) if (pick.length < 3) pick.push(r);
    pick.sort((a, b) => RANK[a.tag] - RANK[b.tag] || hits.indexOf(a) - hits.indexOf(b));
    const comments = pick.map((r, i) => {
      const text = clean(r.text(H, F, M, v + i)), line = 1 + ((v * (i + 3) + i * 37) % 240);
      return { id: r.id, tag: r.tag, file: r.file + ':L' + line, text, lines: wrap(text) };
    });
    const blockers = comments.filter(c => c.tag === 'BLOCKING').length, praised = comments.filter(c => c.tag === 'PRAISE').length;
    const approved = M.won && blockers === 0;
    const summary = approved ? (praised >= 2 ? 'LGTM! SHIP IT.' : 'LGTM WITH NITS. SHIP IT.')
      : M.won ? `WORKS ON MY MACHINE. FIX ${plural(blockers, 'BLOCKING ISSUE', 'BLOCKING ISSUES')} FIRST.`
      : `${plural(blockers, 'BLOCKING ISSUE', 'BLOCKING ISSUES')}. PLEASE REBASE AND TRY AGAIN.`;
    return {
      pr: 100 + ((dealt * 13 + taken * 7 + M.rounds * 31 + H.hits) % 900),
      title: (M.won ? 'FEAT: BEAT ' : 'WIP: LOST TO ') + M.foe + ' ' + M.w + '-' + M.l,
      meta: `${M.me} WANTS TO MERGE ${plural(M.rounds, 'ROUND', 'ROUNDS')} INTO MAIN. REVIEWER: LINT-BOT`,
      plus: '+' + dealt, minus: '-' + taken, comments, approved, verdict: approved ? 'APPROVED' : 'CHANGES REQUESTED', summary,
    };
  }

  // ---------------------------------------------------------------- when it shows: a real 1P match against the CPU, then the end screen
  const R = { pending: null, data: null, open: false, t: 0, end: 0 };
  const copy = o => JSON.parse(JSON.stringify(o));
  function statsFor(h, info) {
    const hf = game.f[h] || (info.winner && info.winner.side === h ? info.winner : info.loser), ff = game.f[1 - h] || (hf === info.winner ? info.loser : info.winner);
    const nm = f => f && f.d ? clean(typeof SHORT === 'function' ? SHORT(f.d) : f.d.name) : '';
    const wins = Array.isArray(info.wins) ? info.wins : game.wins;
    return { me: nm(hf), foe: nm(ff), won: info.winner === hf, w: num(wins[h]), l: num(wins[1 - h]), rounds: num(info.rounds) || game.round,
      meter: Math.round(num(hf && hf.meter)), pauses: S.pauses, timeouts: S.timeouts.slice(), first: S.first === null || S.first < 0 ? -1 : (S.first === h ? 0 : 1),
      H: copy(S.sides[h]), F: copy(S.sides[1 - h]) };
  }
  BUS.on('match:end', info => {
    S.live = false; R.pending = null;
    if (SETTINGS.get('review.on') === false || game.mode !== 1 || !MODES_OK.has(info.modeId)) return;
    const humans = [info.winner, info.loser].filter(f => f && !f.cpu && (f.side === 0 || f.side === 1));
    if (humans.length !== 1) return;   // CPU against CPU (demo) or two humans: nobody to review
    R.pending = build(statsFor(humans[0].side, info));
  });
  // the engine's SHARE ON X link sits over the middle of the canvas on the end screen: hidden (not removed) while the review covers it; T still shares
  const share = v => { const el = document.getElementById('share'); if (el && el.style.visibility !== v) el.style.visibility = v; };
  function open(data, skipAnim) {
    R.data = data; R.open = true; R.end = T0 + data.comments.length * STEP + 18; R.t = skipAnim ? R.end : 0; share('hidden');
  }
  function close() { R.open = false; share(''); }
  BUS.on('phase', e => {
    if (e.to === 'pause' && S.live) S.pauses++;
    if (e.to === 'over') { if (R.pending) { open(R.pending); R.pending = null; } }
    else if (e.from === 'over') { close(); R.data = null; }
    if (e.to === 'title' || e.to === 'select') R.pending = null;   // left the match before its end screen: nothing to show later
  });

  HOOKS.add('update', g => {
    if (!R.data || g.phase !== 'over') return;
    if (!R.open) { if (hit(0, 's')) { open(R.data, true); beep(700, 0.05, 'square', 0.04); } return; }
    if (R.t < R.end) {
      R.t++;
      if (R.t >= T0 && R.t < T0 + R.data.comments.length * STEP && (R.t - T0) % STEP === 0) beep(1180, 0.04, 'square', 0.03, 0.9);
      if (R.t === R.end - 12) { if (R.data.approved) { beep(660, 0.12, 'square', 0.05, 1); beep(990, 0.2, 'square', 0.04, 1); } else { thud(0.18, 0.14); beep(150, 0.3, 'sawtooth', 0.05); } }
    }
    const a = tap('Enter'), b = tap('Space'), c = hit(0, 'p'), d = hit(1, 'p');   // all read, so every one of them is consumed this tick
    if (!(a || b || c || d) || R.t <= GRACE) return;
    if (R.t < R.end) R.t = R.end; else { close(); beep(500, 0.05, 'square', 0.04); }
  }, -40);

  // ---------------------------------------------------------------- drawing (pixel font, prebuilt strings; nothing allocated per frame once settled)
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function drawPanel(c, D, t) {
    const k = ease(t / SLIDE), y0 = PY + Math.round((1 - k) * 60);
    c.save(); c.globalAlpha = 0.84 * k; rect(c, 0, 0, W, H, '#03050c'); c.globalAlpha = k;
    rect(c, PX - 2, y0 - 2, PW + 4, PH + 4, '#30363d'); rect(c, PX, y0, PW, PH, '#0d1117'); rect(c, PX, y0, PW, 70, '#161b22'); rect(c, PX, y0 + 70, PW, 2, '#30363d');
    ptext(c, 'PULL REQUEST #' + D.pr, X0, y0 + 12, 2, DIM);
    const mw = ptextWidth(D.minus, 2); ptext(c, D.minus, PX + PW - 24, y0 + 12, 2, BAD_COL, 'right'); ptext(c, D.plus, PX + PW - 36 - mw, y0 + 12, 2, OK_COL, 'right');
    ptext(c, D.title, X0, y0 + 36, 3, '#f0f6fc');
    ptext(c, D.meta, X0, y0 + 82, 2, DIM);
    D.comments.forEach((m, i) => {
      const at = T0 + i * STEP; if (t < at) return;
      const a = ease((t - at) / 6), y = y0 + 112 + i * BH + Math.round((1 - a) * 8), col = TAG[m.tag];
      c.globalAlpha = k * a;
      rect(c, X0 - 12, y - 4, 3, 52, col);
      const tw = ptextWidth(m.tag, 2); rect(c, X0, y - 3, tw + 12, 20, col); ptext(c, m.tag, X0 + 6, y + 1, 2, '#0d1117', 'left', false);
      ptext(c, m.file, X0 + tw + 24, y + 1, 2, DIM);
      for (let j = 0; j < m.lines.length && j < 2; j++) ptext(c, m.lines[j], X0, y + 22 + j * 16, 2, INK);
    });
    c.globalAlpha = k;
    const ts = R.end - 12;
    if (t >= ts) {
      const a = ease((t - ts) / 8), s = 1 + 1.4 * (1 - a), col = D.approved ? OK_COL : BAD_COL, tw = ptextWidth(D.verdict, 4);
      rect(c, PX + 24, y0 + 401, PW - 48, 2, '#30363d');
      c.save(); c.globalAlpha = k * a; c.translate(PX + PW / 2, y0 + 426); c.scale(s, s);
      c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(-tw / 2 - 16, -21, tw + 32, 42); ptext(c, D.verdict, 0, -14, 4, col, 'center');
      c.restore(); c.globalAlpha = k * a;
      ptext(c, D.summary, PX + PW / 2, y0 + 455, 2, INK, 'center');
    }
    c.globalAlpha = k;
    const hint = touch.on ? 'TAP SELECT TO CLOSE THE REVIEW' : t < R.end ? 'ENTER SKIP' : 'ENTER CLOSE REVIEW    R REMATCH    ESC TITLE';
    ptext(c, hint, PX + PW / 2, y0 + PH - 20, 2, DIM, 'center');
    c.restore();
  }
  function drawBadge(c, D) {
    const s = D.verdict + (touch.on ? '' : '  L: REVIEW'), w = ptextWidth(s, 2), col = D.approved ? OK_COL : BAD_COL;
    c.save(); c.globalAlpha = 0.9; rect(c, 12, 10, w + 20, 24, '#0d1117'); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(13, 11, w + 18, 22);
    ptext(c, s, 22, 15, 2, col); c.restore();
  }
  HOOKS.add('drawTop', (c, g) => {
    if (!R.data || g.phase !== 'over') return;
    if (R.open) { if (R.t > 0) drawPanel(c, R.data, R.t); } else drawBadge(c, R.data);
  }, 150);   // after the other features' end-screen layers (arcade badges are 100): the open review is modal

  window.REVIEW = {
    build, wrap, modes: MODES_OK, COLS,
    stats: () => copy({ sides: S.sides, pauses: S.pauses, timeouts: S.timeouts, first: S.first }),
    state: () => ({ open: R.open, t: R.t, end: R.end, pending: R.pending, data: R.data }),
    open: (data, skipAnim) => { if (data || R.data) open(data || R.data, skipAnim); }, close,
    timing: { SLIDE, T0, STEP, GRACE },
  };
})();
