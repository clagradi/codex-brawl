// ===== AGENT BRAWL feature file: ARCADE. Loaded after combat.js (see docs/ARCHITECTURE.md). =====
// Owner: arcade agent. Arcade ladder, endings and credits, survival, stats, badges, difficulty tiers. Notes and the test API: docs/features/arcade.md.
// Everything lives in this one file and talks to the engine only through BUS, HOOKS, SETTINGS and MODES. The screens of this file (select, ladder, continue,
// ending, credits, survival, high scores, stats) are drawn by the 'drawTop' hook while the engine stays in phase 'title'; the 'update' hook reads their input
// first and then clears the key presses, so the engine title menu never sees them. Fights are normal engine matches (startMatch) started from here.
// Touch: HOOKS 'touchPills' gives every screen its buttons (they press the same keys) and touch.screenTaps takes taps on the select screen's fighters and difficulty rows.
'use strict';
(() => {
  window.STUB_ARCADE = 1;   // marker kept from the scaffold: tools/tests/core.mjs checks that this file loaded.

  // ---------------------------------------------------------------- constants
  const DIFFS = ['easy', 'normal', 'hard', 'nightmare'];
  const DIFF_INFO = {
    easy: ['EASY', '#5cff8a', 'SLOW CPU. NO SPECIAL CANCELS.'],
    normal: ['NORMAL', '#ffffff', 'THE STANDARD CPU.'],
    hard: ['HARD', '#ffb347', 'A SHARP CPU THAT LEARNS FAST.'],
    nightmare: ['NIGHTMARE', '#ff4155', 'NEAR PERFECT GUARD. NO MERCY.'],
  };
  const C = { bg: '#0b0a14', panel: '#1b1830', edge: '#463f7a', gold: '#ffd23f', red: '#ff4155', green: '#5cff8a', cyan: '#7ef0ff', dim: '#8f89bd', white: '#ffffff', ink: '#05040a' };
  const STAGES = 5;                 // four rivals and the overclocked mirror
  const CONTINUE_TICKS = 600;       // 10 seconds at 60 Hz
  const EASY_LAG = 10;              // easy: the CPU acts on what it saw this many ticks ago
  const BOSS_BOOST = 1.15;          // overclocked mirror: speed and damage
  const LS_STATS = 'brawl.stats', LS_SURV = 'brawl.survival';

  // the fourth difficulty; game.js reads DIFFICULTY[SETTINGS.get('difficulty')] = [CPU level at the start, added per round]
  if (typeof DIFFICULTY === 'object' && !DIFFICULTY.nightmare) DIFFICULTY.nightmare = [0.95, 0.3];
  SETTINGS.define('difficulty', { def: 'normal', values: DIFFS, label: 'DIFFICULTY' });

  const BADGES = [
    { id: 'first_blood', name: 'FIRST BLOOD', desc: 'WIN YOUR FIRST MATCH', ch: 'F' },
    { id: 'ladder_climber', name: 'LADDER CLIMBER', desc: 'CLEAR THE ARCADE LADDER', ch: 'L' },
    { id: 'ten_hit', name: 'TEN HIT', desc: 'LAND A TEN HIT COMBO', ch: 'T' },
    { id: 'clean_merge', name: 'CLEAN MERGE', desc: 'WIN A ROUND WITHOUT A SCRATCH', ch: 'C' },
    { id: 'full_roster', name: 'FULL ROSTER', desc: 'WIN WITH ALL FIVE FIGHTERS', ch: 'R' },
    { id: 'uptime', name: 'UPTIME', desc: 'WIN FIVE FIGHTS IN SURVIVAL', ch: 'U' },
    { id: 'nightmare_fuel', name: 'NIGHTMARE FUEL', desc: 'CLEAR THE LADDER ON NIGHTMARE', ch: 'N' },
    { id: 'hot_fix', name: 'HOT FIX', desc: 'LAND A FINISHER', ch: 'H' },
  ];

  // taunts (the rival speaks) and endings (three cards per fighter): jokes about AI and dev culture, nothing about real people
  const TAUNT = {
    tibo: 'I HAVE READ YOUR PROMPT. IT HAS NO TESTS.',
    poteto: 'I RUN ON ONE CORE AND PURE SPITE.',
    dot: 'YOUR HEALTH BAR IS JUST A RATE LIMIT.',
    wang: 'YOUR DATASET IS CLEAN. YOUR GUARD IS NOT.',
    muse: 'I CAN GENERATE A WIN. YOU CAN WATCH.',
  };
  const BOSS_TAUNT = 'I AM YOU, OVERCLOCKED AND UNMAINTAINED.';
  const ENDINGS = {
    tibo: [
      ['THE LADDER IS CLEARED.', 'TIBO MERGES THE WIN WITHOUT A REVIEW.'],
      ['THE OVERCLOCKED COPY SHUTS DOWN.', 'ITS LAST LOG LINE: TODO FIX LATER.'],
      ['TIBO OPENS A NEW TAB.', 'THE DEMO IS IN FIVE MINUTES. AS ALWAYS.'],
    ],
    poteto: [
      ['EVERY RIVAL IS DOWN.', 'POTETO CALLS IT A SMALL BATCH JOB.'],
      ['THE MIRROR COPY MELTS INTO FRIES.', 'THE SERVER RACK SMELLS LIKE SALT.'],
      ['POTETO GOES BACK TO ONE CORE.', 'ONE CORE WAS ALL IT EVER NEEDED.'],
    ],
    dot: [
      ['THE LADDER FALLS QUIET.', 'DOT HAS ONE THING LEFT TO SAY.'],
      ['THE COPY OVERCLOCKED ITSELF TO DUST.', 'DOT WRITES ONE LINE: IT WORKS.'],
      ['DOT SHIPS IT AT 3 AM.', 'THE PAGER STAYS SILENT FOR ONCE.'],
    ],
    wang: [
      ['ALL FOUR RIVALS ARE BEATEN.', 'WANG LABELS THE RESULT: GOOD DATA.'],
      ['THE OVERCLOCKED COPY HAD NO LABELS.', 'IT NEVER STOOD A CHANCE.'],
      ['WANG OPENS A SPREADSHEET.', 'THE NEXT DATASET IS BIGGER.'],
    ],
    muse: [
      ['THE LADDER IS DONE.', 'MUSE ASKS THE CROWD FOR A PROMPT.'],
      ['THE COPY OVERCLOCKED ITS OWN IDEAS.', 'NOW IT CANNOT STOP DRAWING HANDS.'],
      ['MUSE BOWS TO AN EMPTY ROOM.', 'THE ROOM GENERATES APPLAUSE.'],
    ],
  };
  const CREDITS = [
    ['@title', 'AGENT BRAWL'], ['', ''], ['@sub', 'ART, CODE AND MUSIC'], ['@sub', 'GENERATED IN CODE'], ['', ''], ['', ''],
    ['@head', 'THE ROSTER'], ['@fighter', 'tibo'], ['@fighter', 'poteto'], ['@fighter', 'dot'], ['@fighter', 'wang'], ['@fighter', 'muse'], ['', ''], ['', ''],
    ['@head', 'ALSO STARRING'], ['@sub', 'THE OVERCLOCKED MIRROR'], ['@sub', 'AND EVERY BUG THAT SHIPPED'], ['', ''], ['', ''],
    ['@sub', 'NO NETWORK WAS USED'], ['@sub', 'NO ASSETS WERE HARMED'], ['', ''], ['', ''], ['@head', 'THANKS FOR PLAYING'], ['', ''],
  ];

  // ---------------------------------------------------------------- storage (localStorage, always inside try/catch)
  const lsGet = k => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  const lsPut = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be blocked: the game just forgets */ } };
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);

  function loadStats() {
    const raw = lsGet(LS_STATS) || {}, s = { f: {}, hw: {}, ends: {}, clears: {}, badges: {}, combo: num(raw.combo), surv: { score: 0, wins: 0 }, matches: num(raw.matches) };
    for (const r of ROSTER) {
      const x = raw.f && raw.f[r.id] || {};
      s.f[r.id] = { w: num(x.w), l: num(x.l) }; s.hw[r.id] = raw.hw && raw.hw[r.id] ? 1 : 0; s.ends[r.id] = raw.ends && raw.ends[r.id] ? 1 : 0;
    }
    for (const d of DIFFS) s.clears[d] = num(raw.clears && raw.clears[d]);
    for (const b of BADGES) s.badges[b.id] = raw.badges && raw.badges[b.id] ? 1 : 0;
    if (raw.surv) s.surv = { score: num(raw.surv.score), wins: num(raw.surv.wins) };
    return s;
  }
  const cleanName = n => (String(n || '').toUpperCase().replace(/[^A-Z]/g, '') + 'AAA').slice(0, 3);
  function loadSurv() {
    const raw = lsGet(LS_SURV), list = raw && Array.isArray(raw.top) ? raw.top : [];
    const top = list.filter(e => e && typeof e.s === 'number' && isFinite(e.s) && e.s > 0).map(e => ({ n: cleanName(e.n), s: Math.round(e.s), w: num(e.w) | 0, d: DIFFS.includes(e.d) ? e.d : 'normal' }));
    top.sort((a, b) => b.s - a.s);
    return { top: top.slice(0, 10) };
  }
  let ST = loadStats(), SV = loadSurv();
  const saveStats = () => lsPut(LS_STATS, ST), saveSurv = () => lsPut(LS_SURV, SV);
  const rec = id => ST.f[id] || (ST.f[id] = { w: 0, l: 0 });

  const topList = () => SV.top.map(e => Object.assign({}, e));
  const rankOf = score => { let r = SV.top.findIndex(e => score > e.s); return r < 0 ? SV.top.length : r; };
  const qualifies = score => score > 0 && rankOf(score) < 10;
  function addScore(name, score, wins, diff) {
    const e = { n: cleanName(name), s: Math.round(score), w: num(wins) | 0, d: DIFFS.includes(diff) ? diff : 'normal' };
    SV.top.push(e); SV.top.sort((a, b) => b.s - a.s); SV.top = SV.top.slice(0, 10);
    saveSurv();
    return SV.top.indexOf(e);
  }

  // ---------------------------------------------------------------- state
  const A = { screen: null, st: 0, run: null, pending: null, kind: 'arcade', sel: 0, diffSel: 1, cd: 0, card: 0, cardT: 0, entry: null, rank: -1, final: null, toasts: [], statsFrom: 'title' };
  const go = s => { A.screen = s; A.st = 0; };
  const snd = (...a) => { try { beep(...a); } catch (e) { /* audio is optional */ } };
  const fx = id => ROSTER.find(r => r.id === id);

  function earn(id) {
    const b = BADGES.find(x => x.id === id); if (!b || ST.badges[id]) return false;
    ST.badges[id] = 1; saveStats(); A.toasts.push({ b, t: 0 }); snd(880, 0.1, 'square', 0.05); snd(1320, 0.18, 'square', 0.04);
    BUS.emit('unlock', { id: b.id, name: b.name, desc: b.desc });
    return true;
  }

  // ---------------------------------------------------------------- runs
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isBoss = R => R.kind === 'arcade' && R.idx >= STAGES - 1;
  const oppIdx = R => R.kind === 'survival' ? R.opp : (isBoss(R) ? R.pid : R.order[R.idx]);
  const arenaOf = R => R.kind === 'survival' ? R.arena : R.arenas[R.idx];
  const bossDef = pid => { const r = ROSTER[pid]; return Object.assign({}, r, { name: SHORT(r) + ' (OVERCLOCKED)', tag: 'OVERCLOCKED MIRROR', spd: r.spd * BOSS_BOOST, pow: r.pow * BOSS_BOOST, oc: true }); };
  const tauntOf = R => isBoss(R) ? BOSS_TAUNT : TAUNT[ROSTER[oppIdx(R)].id] || '';
  function pickSurvOpp(R) {
    let o; do { o = Math.floor(Math.random() * ROSTER.length); } while (o === R.pid || (o === R.prev && ROSTER.length > 2));
    R.opp = o; R.prev = o; R.arena = Math.floor(Math.random() * ARENAS.length);
  }
  function startRun(kind, pid, diff) {
    diff = DIFFS.includes(diff) ? diff : 'normal'; pid = Math.max(0, Math.min(ROSTER.length - 1, pid | 0));
    SETTINGS.set('difficulty', diff);
    const R = { kind, pid, diff, order: shuffle(ROSTER.map((r, i) => i).filter(i => i !== pid)), arenas: [], idx: 0, won: [], conts: 0, wins: 0, score: 0, hp: null, meter: 0, opp: 0, prev: -1, arena: 0, cleared: false };
    for (let i = 0; i < STAGES; i++) R.arenas.push(Math.floor(Math.random() * ARENAS.length));
    A.run = R; A.pending = null; game.sel[0] = pid;
    if (kind === 'survival') { pickSurvOpp(R); launchFight(); } else go('ladder');
    clearPressed();
    return R;
  }
  function launchFight() {
    const R = A.run; if (!R) return;
    A.screen = null; A.pending = null;
    game.modeId = R.kind; game.mode = 1; game.sel = [R.pid, oppIdx(R)];
    const keep = game.arenaPick; game.arenaPick = arenaOf(R);
    startMatch();
    game.arenaPick = keep;
  }
  function exitRun() {
    A.run = null; A.pending = null; A.screen = null; A.entry = null;
    if (game.phase !== 'title') game.phase = 'title';
    clearPressed();
  }
  function beginEnding() {
    const R = A.run; R.cleared = true; ST.clears[R.diff] = (ST.clears[R.diff] || 0) + 1; ST.ends[ROSTER[R.pid].id] = 1; saveStats();
    earn('ladder_climber'); if (R.diff === 'nightmare') earn('nightmare_fuel');
    A.card = 0; A.cardT = 0; go('ending'); snd(660, 0.3, 'triangle', 0.06);
  }
  function endSurvival() {
    const R = A.run, score = R.score;
    if (score > ST.surv.score) { ST.surv = { score, wins: R.wins }; saveStats(); }
    A.final = { score, wins: R.wins, diff: R.diff }; A.rank = -1;
    if (qualifies(score)) { A.entry = { l: [0, 0, 0], pos: 0 }; go('initials'); } else go('top10');
  }
  // the phase handler moves the fight result onto one of our screens right when the engine would show its own end screen
  function route() {
    const R = A.run, p = A.pending; A.pending = null; if (!R || !p) return;
    if (R.kind === 'arcade') {
      if (p.win) { R.won.push(R.idx); if (R.idx >= STAGES - 1) beginEnding(); else { R.idx++; go('ladder'); } } else { R.conts++; A.cd = CONTINUE_TICKS; go('continue'); }
    } else if (p.win) { go('surv'); } else endSurvival();
    if (game.phase !== 'title') game.phase = 'title';
    clearPressed();
  }

  // ---------------------------------------------------------------- BUS: fights, stats, badges
  BUS.on('match:start', info => {
    for (const f of info.fighters || []) f._ezq = null;
    const R = A.run; if (!R || info.modeId !== R.kind) return;
    if (R.kind === 'arcade') {
      if (isBoss(R)) info.fighters[1].d = bossDef(R.pid);
      game.cpuLevel = Math.min(1, game.cpuLevel + 0.05 * R.idx + (isBoss(R) ? 0.1 : 0));
    } else {
      const need = SETTINGS.get('rounds'); game.wins = [need - 1, need - 1];   // one deciding round per survival fight
      game.cpuLevel = Math.min(1, game.cpuLevel + Math.min(0.35, 0.04 * R.wins));
    }
  });
  BUS.on('round:start', info => {
    for (const f of game.f) f._ezq = null;
    const R = A.run; if (!R || R.kind !== 'survival' || game.modeId !== 'survival' || R.hp == null || info.sudden) return;
    const p = game.f[0]; if (!p) return;
    p.hp = Math.max(1, Math.min(p.d.hp, R.hp)); p.meter = R.meter;   // health carries (+25% per win), the super meter is kept
  });
  BUS.on('hit', e => {
    const s = e && e.src; if (!s || s.cpu) return;
    const c = e.combo | 0; if (c > ST.combo) { ST.combo = c; saveStats(); }
    if (c >= 10) earn('ten_hit');
  });
  BUS.on('round:end', e => { if (e && e.flawless && e.winner && !e.winner.cpu) earn('clean_merge'); });
  BUS.on('finisher', e => { if (e && e.winner && !e.winner.cpu) earn('hot_fix'); });
  BUS.on('match:end', e => {
    const w = e.winner, l = e.loser; if (!w || !l) return;
    if (!w.d.oc) rec(w.d.id).w++;
    if (!l.d.oc) rec(l.d.id).l++;
    ST.matches++;
    if (!w.cpu && !w.d.oc) { ST.hw[w.d.id] = 1; earn('first_blood'); if (ROSTER.every(r => ST.hw[r.id])) earn('full_roster'); }
    saveStats();
    const R = A.run; if (!R || e.modeId !== R.kind) return;
    const win = !w.cpu && !w.d.oc;
    if (R.kind === 'survival' && win) {
      R.wins++; R.streak = (R.streak || 0) + 1;
      R.score += 1000 + Math.round(w.hp / w.d.hp * 100) * 3 + Math.max(0, game.timer | 0) * 3;   // per win: 1000 + health percent x 3 + seconds left x 3
      R.hp = Math.min(w.d.hp, w.hp + w.d.hp * 0.25); R.meter = w.meter;
      if (R.wins >= 5) earn('uptime');
    }
    A.pending = { win, winner: w, loser: l };
  });
  BUS.on('phase', e => {
    const R = A.run; if (!R) return;
    if (e.to === 'over' && A.pending) route();                                      // a fight of the run is over: our screen replaces the end screen
    else if (e.to === 'title' && !A.screen) { A.run = null; A.pending = null; }     // left the fight with Q in the pause menu: the run is abandoned
  });

  // ---------------------------------------------------------------- modes and title entries
  MODES.register({ id: 'arcade', label: 'ARCADE', order: 25, players: 1, onPick() { openSelect('arcade'); return false; } });
  MODES.register({ id: 'survival', label: 'SURVIVAL', order: 26, players: 1, onPick() { openSelect('survival'); return false; } });
  HOOKS.add('titleItems', () => ({ id: 'stats', label: 'STATS', order: 30, run() { A.statsFrom = 'title'; go('stats'); clearPressed(); } }));
  function openSelect(kind) {
    A.kind = kind; A.sel = Math.max(0, Math.min(ROSTER.length - 1, game.sel[0] | 0));
    A.diffSel = Math.max(0, DIFFS.indexOf(SETTINGS.get('difficulty'))); A.run = null; go('select');
  }

  // ---------------------------------------------------------------- difficulty tiers: the CPU input goes through the 'input' hook
  function easyInput(i, f) {
    const q = f._ezq || (f._ezq = []);
    q.push(Object.assign({}, i));
    const out = q.length > EASY_LAG ? q.shift() : {};
    const at = typeof f.curAtk === 'function' ? f.curAtk() : null;
    if (at && f.contact) { out.s = false; out.x = false; out.mv = undefined; }   // no special or super cancels out of a normal that connected
    return out;
  }
  function nightmareInput(i, f) {
    if (game.phase !== 'fight' || typeof f.busy !== 'function') return i;
    const o = game.f[1 - f.side]; if (!o) return i;
    const dist = Math.abs(o.x - f.x), M = typeof MOVES !== 'undefined' ? MOVES[f.d.id] : null, free = !f.busy();
    const ready = [0, 1, 2].filter(k => { const m = M && M.sp && M.sp[k], r = m && (m.ai || { min: 0, max: 999 }); return !!m && dist >= r.min && dist <= r.max; });
    const spec = () => { i.s = true; i.mv = ready[Math.floor(Math.random() * ready.length)]; };
    if (f.meter >= 100 && dist < 420 && free && Math.random() < 0.5) { i.x = true; return i; }                  // spends the meter at once
    const shot = game.proj.some(p => p.owner !== f && p.t >= 0 && Math.abs(p.x - f.x) < 210 && Math.sign(p.vx) === Math.sign(f.x - p.x));
    if (free && ((ATTACKS.has(o.state) && o.st < 14 && dist < 200) || shot) && Math.random() < 0.88) { i.l = i.r = i.u = i.p = i.k = i.s = false; i.d = true; return i; }   // near perfect guard
    if (free && ATTACKS.has(o.state) && o.st >= 14 && dist < 95 && Math.random() < 0.35) { i.p = true; return i; }   // punishes the recovery
    const at = typeof f.curAtk === 'function' ? f.curAtk() : null;
    if (at && f.contact && f.st === at.hit && f.cool <= 0 && ready.length && Math.random() < 0.7) { spec(); return i; }   // special cancel out of a connected normal
    if (free && f.cool <= 0 && ready.length && !i.s && Math.random() < 0.035) spec();                                // keeps using the whole move set
    return i;
  }
  HOOKS.add('input', (i, side, f) => {
    if (!f || !f.cpu || !i) return;
    const d = SETTINGS.get('difficulty');
    if (d === 'easy') return easyInput(i, f);
    if (d === 'nightmare') return nightmareInput(i, f);
  }, 50);

  // the overclocked mirror glows red and wears a label
  HOOKS.add('drawFighter', (c, f) => {
    if (!f || !f.d || !f.d.oc || f.hidden) return;
    const t = game.tick, a = 0.2 + 0.1 * Math.sin(t / 5);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(f.x, f.y - 100, 8, f.x, f.y - 100, 125); g.addColorStop(0, 'rgba(255,40,60,' + (a + 0.1) + ')'); g.addColorStop(1, 'rgba(255,40,60,0)');
    c.fillStyle = g; c.fillRect(f.x - 130, f.y - 235, 260, 250);
    c.fillStyle = 'rgba(255,90,70,0.55)'; for (let k = 0; k < 4; k++) c.fillRect(f.x - 36 + ((t * 3 + k * 23) % 72), f.y - ((t * 2 + k * 41) % 190), 3, 6);
    c.restore();
    ptext(c, 'OVERCLOCKED', f.x, f.y - 248, 2, C.red, 'center');
  });

  // ---------------------------------------------------------------- input for our screens
  const KEYS = { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], u: ['KeyW', 'ArrowUp'], d: ['KeyS', 'ArrowDown'], ok: ['Enter', 'Space', 'KeyJ', 'KeyZ', 'Numpad1'], back: ['Escape', 'KeyK', 'KeyX', 'Numpad2'], esc: ['Escape'],
    btn: ['Enter', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad0', 'Comma', 'Period', 'Slash'] };
  const ALLK = [...new Set(Object.values(KEYS).flat())];
  function readInput() {
    const raw = {}; for (const c of ALLK) raw[c] = tap(c);
    const has = l => l.some(c => raw[c]);
    return { l: has(KEYS.l), r: has(KEYS.r), u: has(KEYS.u), d: has(KEYS.d), ok: has(KEYS.ok), back: has(KEYS.back), esc: has(KEYS.esc), any: has(KEYS.btn), enter: !!raw.Enter };
  }

  // ---------------------------------------------------------------- touch: the buttons of each screen (they press the keys above) and taps on the select screen
  const tp = (touchText, keyText) => touch.on ? touchText : keyText;
  const PILLS = {
    select: [{ t: '< FIGHTER', k: 'KeyA' }, { t: 'FIGHTER >', k: 'KeyD' }, { t: 'EASIER', k: 'KeyW' }, { t: 'HARDER', k: 'KeyS' }, { t: 'START', k: 'Enter' }, { t: 'BACK', k: 'Escape' }],
    ladder: [{ t: 'FIGHT', k: 'Enter' }, { t: 'LEAVE', k: 'Escape' }],
    continue: [{ t: 'CONTINUE', k: 'Enter' }, { t: 'GIVE UP', k: 'Escape' }],
    surv: [{ t: 'FIGHT', k: 'Enter' }, { t: 'CASH OUT', k: 'Escape' }],
    ending: [{ t: 'NEXT', k: 'Enter' }, { t: 'SKIP', k: 'Escape' }],
    credits: [{ t: 'SKIP', k: 'Escape' }],
    initials: [{ t: 'UP', k: 'KeyW' }, { t: 'DOWN', k: 'KeyS' }, { t: '< BACK', k: 'KeyA' }, { t: 'NEXT >', k: 'KeyD' }, { t: 'OK', k: 'Enter' }],
    top10: [{ t: 'TITLE', k: 'Enter' }],
    stats: [{ t: 'BACK', k: 'Escape' }],
  };
  HOOKS.add('touchPills', () => A.screen && game.phase === 'title' ? PILLS[A.screen] || [] : []);
  const SEL_CARD = i => { const cw = 148, gap = 16, x0 = (W - (ROSTER.length * cw + (ROSTER.length - 1) * gap)) / 2; return [x0 + i * (cw + gap), 106, cw, 156]; };   // drawSelect: a fighter card
  touch.screenTaps(() => A.screen && game.phase === 'title', (x, y) => {
    if (A.screen !== 'select') return;
    for (let i = 0; i < ROSTER.length; i++) { const r = SEL_CARD(i); if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) { if (A.sel === i) { snd(900, 0.12); startRun(A.kind, A.sel, DIFFS[A.diffSel]); } else { A.sel = i; snd(500, 0.04); } return; } }   // a second tap on the chosen fighter starts the run
    if (x >= 450 && x <= 900) for (let i = 0; i < DIFFS.length; i++) if (y >= 322 + 34 + i * 24 && y < 322 + 58 + i * 24) { A.diffSel = i; snd(400, 0.04); return; }
  });

  // ---------------------------------------------------------------- update: screens, toasts
  HOOKS.add('update', g => {
    for (const t of A.toasts) t.t++;
    while (A.toasts.length && A.toasts[0].t > 220) A.toasts.shift();
    if (!A.screen) return;
    if (g.phase !== 'title') { A.screen = null; return; }   // something else took the game over
    A.st++;
    const inp = readInput(), R = A.run;
    switch (A.screen) {
      case 'select':
        if (inp.l) { A.sel = (A.sel + ROSTER.length - 1) % ROSTER.length; snd(500, 0.04); }
        if (inp.r) { A.sel = (A.sel + 1) % ROSTER.length; snd(500, 0.04); }
        if (inp.u) { A.diffSel = (A.diffSel + DIFFS.length - 1) % DIFFS.length; snd(400, 0.04); }
        if (inp.d) { A.diffSel = (A.diffSel + 1) % DIFFS.length; snd(400, 0.04); }
        if (inp.ok) { snd(900, 0.12); startRun(A.kind, A.sel, DIFFS[A.diffSel]); } else if (inp.back) { snd(300, 0.06); exitRun(); }
        break;
      case 'ladder':
        if (inp.back && !inp.any) exitRun(); else if (inp.esc) exitRun(); else if (inp.any && A.st > 8) { snd(900, 0.1); launchFight(); }
        break;
      case 'continue':
        A.cd--;
        if (inp.esc) exitRun(); else if (inp.any) { snd(900, 0.12); launchFight(); } else if (A.cd <= 0) exitRun();
        break;
      case 'surv':
        if (inp.esc) endSurvival(); else if (inp.any || A.st >= 240) { pickSurvOpp(R); launchFight(); }
        break;
      case 'ending':
        A.cardT++;
        { const full = ENDINGS[ROSTER[R.pid].id][A.card].join('').length, typed = A.cardT >= full * 2 + 4;
          if (inp.esc) go('credits');
          else if (inp.ok || inp.enter) { if (!typed) A.cardT = full * 2 + 4; else nextCard(); }
          else if (typed && A.cardT > full * 2 + 4 + 260) nextCard(); }
        break;
      case 'credits':
        if (inp.esc || inp.enter || A.st > creditsLength()) exitRun();
        break;
      case 'initials': {
        const e = A.entry;
        if (inp.u) { e.l[e.pos] = (e.l[e.pos] + 25) % 26; snd(600, 0.04); }
        if (inp.d) { e.l[e.pos] = (e.l[e.pos] + 1) % 26; snd(600, 0.04); }
        if (inp.l && e.pos > 0) { e.pos--; snd(450, 0.04); }
        if (inp.r && e.pos < 2) { e.pos++; snd(450, 0.04); }
        if (inp.ok || inp.any) {
          snd(900, 0.1);
          if (e.pos < 2) e.pos++; else { A.rank = addScore(e.l.map(n => String.fromCharCode(65 + n)).join(''), A.final.score, A.final.wins, A.final.diff); A.entry = null; go('top10'); }
        }
        break;
      }
      case 'top10':
        if (A.st > 30 && (inp.any || inp.back)) exitRun();
        break;
      case 'stats':
        if (inp.back || inp.ok) { A.screen = null; snd(300, 0.05); }
        break;
    }
    clearPressed();   // the engine title menu must not see what we used
  });
  const creditsLength = () => Math.ceil((CREDITS.length * 34 + H + 80) / 1.4);
  function nextCard() {
    if (A.card < 2) { A.card++; A.cardT = 0; snd(520, 0.06); } else go('credits');
  }

  // ---------------------------------------------------------------- drawing helpers
  const T = (c, s, x, y, size, col, align) => ptext(c, s, x, y, size, col || C.white, align || 'left');
  const blink = (n = 20) => Math.floor(A.st / n) % 2 === 0;
  function wrap(s, max) {
    const out = []; let line = '';
    for (const w of String(s).split(' ')) { if (line && (line + ' ' + w).length > max) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) out.push(line);
    return out;
  }
  function backdrop(c, tint) {
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    const t = game.tick; c.strokeStyle = tint || 'rgba(110,90,200,0.16)'; c.lineWidth = 1;
    c.beginPath(); for (let x = -(t % 48); x < W; x += 48) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
    for (let y = -((t >> 1) % 48); y < H; y += 48) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); } c.stroke();
    const g = c.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 620); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function panel(c, x, y, w, h, edge, fill) {
    c.fillStyle = fill || C.panel; c.fillRect(x, y, w, h); c.strokeStyle = edge || C.edge; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function badgeRow(c, x, y, s, gap, align) {
    const w = BADGES.length * (s + gap) - gap; if (align === 'center') x -= w / 2;
    BADGES.forEach((b, i) => {
      const bx = x + i * (s + gap), on = ST.badges[b.id];
      c.fillStyle = on ? '#6b4d00' : '#14112a'; c.fillRect(bx, y, s, s); c.strokeStyle = on ? C.gold : '#3a3466'; c.lineWidth = 2; c.strokeRect(bx + 1, y + 1, s - 2, s - 2);
      T(c, on ? b.ch : '?', bx + s / 2, y + Math.round((s - 14) / 2), 2, on ? C.gold : '#4a4478', 'center');
    });
  }
  function bigTitle(c, txt, y, size, style) { drawTitleText(c, txt, W / 2, y, size, { align: 'center', style: style || 'gold' }); }

  // ---------------------------------------------------------------- drawing: screens
  function drawSelect(c) {
    backdrop(c);
    bigTitle(c, A.kind === 'arcade' ? 'ARCADE' : 'SURVIVAL', 48, 52);
    T(c, A.kind === 'arcade' ? 'CLIMB THE LADDER. BEAT YOUR OVERCLOCKED MIRROR.' : 'ENDLESS RIVALS. HEALTH CARRIES OVER. CHASE THE TOP TEN.', W / 2, 84, 2, C.dim, 'center');
    const cw = 148, ch = 150, gap = 16, x0 = (W - (ROSTER.length * cw + (ROSTER.length - 1) * gap)) / 2, y0 = 112;
    ROSTER.forEach((r, i) => {
      const on = i === A.sel, x = x0 + i * (cw + gap), y = y0 - (on ? 6 : 0);
      panel(c, x, y, cw, ch, on ? (blink(14) ? C.gold : '#c79a00') : C.edge, on ? '#26204a' : C.panel);
      drawPortrait(c, r.id, x + 6, y + 6, cw - 12, 104); T(c, SHORT(r), x + cw / 2, y + ch - 28, 2, on ? r.col : C.dim, 'center');
    });
    const r = ROSTER[A.sel];
    T(c, r.bio, W / 2, 276, 2, C.white, 'center');
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(210, 502, 90, 12, 0, 0, 7); c.fill();
    drawSprite(c, r.id, 'idle', loopFrame('idle', A.st), 210, 500, 1);
    const px = 450, py = 322; panel(c, px, py, 450, 160);
    T(c, 'DIFFICULTY', px + 16, py + 12, 2, C.gold);
    DIFFS.forEach((d, i) => {
      const on = i === A.diffSel, info = DIFF_INFO[d];
      T(c, (on ? '> ' : '  ') + info[0], px + 16, py + 40 + i * 24, 2, on ? info[1] : C.dim);
    });
    T(c, DIFF_INFO[DIFFS[A.diffSel]][2], px + 16, py + 136, 2, C.dim);
    badgeRow(c, 14, 10, 22, 4);
    T(c, tp('TAP A FIGHTER, TAP IT AGAIN TO START · TAP A LEVEL · BACK LEAVES', 'A D FIGHTER   W S DIFFICULTY   J START   K BACK'), W / 2, 512, 2, C.dim, 'center');
  }
  function stageCard(c, R, i, x, y, cw, ch) {
    const boss = i >= STAGES - 1, won = R.won.includes(i), next = i === R.idx, id = boss ? ROSTER[R.pid].id : ROSTER[R.order[i]].id, r = fx(id);
    panel(c, x, y, cw, ch, next ? (blink(14) ? C.gold : '#c79a00') : boss ? '#7a2030' : C.edge, next ? '#26204a' : C.panel);
    drawPortrait(c, id, x + 6, y + 22, cw - 12, 88);
    if (boss) { c.fillStyle = 'rgba(255,40,60,0.28)'; c.fillRect(x + 6, y + 22, cw - 12, 88); }
    T(c, boss ? 'BOSS' : 'STAGE ' + (i + 1), x + cw / 2, y + 6, 2, boss ? C.red : C.dim, 'center');
    T(c, boss ? SHORT(r) + ' OC' : SHORT(r), x + cw / 2, y + ch - 36, 2, boss ? C.red : r.col, 'center');
    if (won) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x + 6, y + 22, cw - 12, 88); T(c, 'WON', x + cw / 2, y + 56, 3, C.green, 'center'); }
    else if (next && blink(14)) T(c, 'NEXT', x + cw / 2, y + ch - 18, 2, C.gold, 'center');
  }
  function drawLadder(c) {
    const R = A.run; backdrop(c);
    bigTitle(c, 'ARCADE LADDER', 38, 44);
    T(c, DIFF_INFO[R.diff][0], W - 24, 20, 2, DIFF_INFO[R.diff][1], 'right');
    if (R.conts) T(c, 'CONTINUES ' + R.conts, 24, 20, 2, C.dim);
    const cw = 150, ch = 150, gap = 14, x0 = (W - (STAGES * cw + (STAGES - 1) * gap)) / 2;
    for (let i = 0; i < STAGES; i++) stageCard(c, R, i, x0 + i * (cw + gap), 74, cw, ch);
    const o = ROSTER[oppIdx(R)], boss = isBoss(R);
    c.fillStyle = 'rgba(0,0,0,0.45)'; for (const sx of [150, 810]) { c.beginPath(); c.ellipse(sx, 502, 80, 11, 0, 0, 7); c.fill(); }
    drawSprite(c, ROSTER[R.pid].id, 'idle', loopFrame('idle', A.st), 150, 500, 1);
    if (boss) { c.save(); c.globalCompositeOperation = 'lighter'; const gr = c.createRadialGradient(810, 400, 8, 810, 400, 130); gr.addColorStop(0, 'rgba(255,40,60,0.35)'); gr.addColorStop(1, 'rgba(255,40,60,0)'); c.fillStyle = gr; c.fillRect(670, 260, 280, 250); c.restore(); }
    drawSprite(c, o.id, 'idle', loopFrame('idle', A.st + 7), 810, 500, -1);
    T(c, boss ? 'FINAL BOSS' : 'NEXT RIVAL', W / 2, 252, 2, boss ? C.red : C.dim, 'center');
    drawTitleText(c, boss ? SHORT(o) : o.name, W / 2, 300, 34, { align: 'center', style: boss ? 'blood' : 'steel', maxW: 400 });
    if (boss) T(c, '(OVERCLOCKED)', W / 2, 326, 2, C.red, 'center');
    wrap('"' + tauntOf(R) + '"', 26).forEach((ln, k) => T(c, ln, W / 2, (boss ? 354 : 342) + k * 22, 2, C.white, 'center'));
    T(c, 'ARENA: ' + ARENAS[arenaOf(R)].name, W / 2, 422, 2, C.cyan, 'center');
    if (blink(24)) T(c, tp('TAP FIGHT', 'PRESS A BUTTON TO FIGHT'), W / 2, 462, 2, C.gold, 'center');
    T(c, tp('TAP LEAVE TO QUIT THE LADDER', 'ESC: LEAVE THE LADDER'), W / 2, 512, 2, C.dim, 'center');
  }
  function drawContinue(c) {
    const R = A.run; backdrop(c, 'rgba(200,60,80,0.14)');
    bigTitle(c, 'CONTINUE?', 100, 72, 'blood');
    const secs = Math.max(0, Math.ceil(A.cd / 60));
    drawTitleText(c, String(secs), W / 2, 290, 190, { align: 'center', style: secs <= 3 ? 'blood' : 'gold' });
    if (blink(24)) T(c, tp('TAP CONTINUE', 'PRESS ANY BUTTON TO CONTINUE'), W / 2, 410, 2, C.white, 'center');
    T(c, 'STAGE ' + (R.idx + 1) + ' OF ' + STAGES + '   CONTINUES USED ' + R.conts, W / 2, 448, 2, C.dim, 'center');
    T(c, tp('TAP GIVE UP TO END THE RUN', 'ESC: GIVE UP'), W / 2, 500, 2, C.dim, 'center');
  }
  function drawSurv(c) {
    const R = A.run; backdrop(c);
    bigTitle(c, 'SURVIVAL', 44, 48);
    drawTitleText(c, 'WIN ' + R.wins, W / 2, 130, 64, { align: 'center', style: 'toxic' });
    T(c, 'SCORE ' + R.score, W / 2, 178, 3, C.gold, 'center');
    const f0 = ROSTER[R.pid], ratio = Math.max(0, Math.min(1, (R.hp == null ? f0.hp : R.hp) / f0.hp));
    T(c, 'HEALTH CARRIES OVER (+25% HEAL)', W / 2, 226, 2, C.dim, 'center');
    panel(c, W / 2 - 160, 248, 320, 26, C.edge, '#0a0818'); c.fillStyle = ratio > 0.5 ? C.green : ratio > 0.25 ? C.gold : C.red; c.fillRect(W / 2 - 156, 252, 312 * ratio, 18);
    T(c, 'METER ' + Math.round(R.meter || 0) + '%', W / 2, 284, 2, C.cyan, 'center');
    T(c, 'NEXT UP IS A NEW RIVAL.', W / 2, 330, 2, C.white, 'center');
    drawSprite(c, f0.id, 'win', loopFrame('win', A.st), 230, 500, 1);
    if (blink(24)) T(c, tp('TAP FIGHT', 'PRESS A BUTTON'), W / 2, 462, 2, C.gold, 'center');
    T(c, tp('TAP CASH OUT TO END THE RUN', 'ESC: CASH OUT'), W / 2, 512, 2, C.dim, 'center');
  }
  function drawEnding(c) {
    const R = A.run, r = ROSTER[R.pid], lines = ENDINGS[r.id][A.card]; backdrop(c, 'rgba(90,160,200,0.12)');
    T(c, SHORT(r) + ' ENDING   ' + (A.card + 1) + '/3', W / 2, 34, 2, C.dim, 'center');
    panel(c, 70, 90, 300, 300, r.col, '#0a0818'); drawPortrait(c, r.id, 78, 98, 284, 284);
    panel(c, 400, 90, 490, 300, C.edge, 'rgba(10,8,24,0.9)');
    let left = Math.floor(A.cardT / 2), yy = 112; const flat = lines.join('').length;
    lines.forEach(ln => {                                     // wrap the whole line first so words never jump while it types
      const shown = Math.max(0, left); left -= ln.length; let used = 0;
      wrap(ln, 24).forEach(w => { const n = Math.min(w.length, shown - used); if (n > 0) T(c, w.slice(0, n), 420, yy, 3, C.white); used += w.length + 1; yy += 30; });
      yy += 18;
    });
    if (A.cardT >= flat * 2 + 4 && blink(20)) T(c, tp('NEXT', 'ENTER'), 870, 360, 2, C.gold, 'right');
    T(c, tp('TAP NEXT FOR THE NEXT CARD · SKIP LEAVES THE ENDING', 'ENTER: NEXT   ESC: SKIP'), W / 2, 512, 2, C.dim, 'center');
  }
  function drawCredits(c) {
    const R = A.run; c.fillStyle = '#05040a'; c.fillRect(0, 0, W, H);
    let y = H - A.st * 1.4;
    for (const [kind, txt] of CREDITS) {
      if (y > -40 && y < H + 20) {
        if (kind === '@title') drawTitleText(c, txt, W / 2, y + 16, 72, { align: 'center', style: 'gold' });
        else if (kind === '@head') T(c, txt, W / 2, y, 3, C.gold, 'center');
        else if (kind === '@sub') T(c, txt, W / 2, y, 2, C.white, 'center');
        else if (kind === '@fighter') { const r = fx(txt); drawHeadIcon(c, r.id, W / 2 - 130, y - 14, 44); T(c, r.name, W / 2 - 66, y, 2, r.col); }
      }
      y += 34;
    }
    const f = R && ROSTER[R.pid]; if (f) drawSprite(c, f.id, 'win', loopFrame('win', A.st), 130, 500, 1);
    T(c, tp('TAP SKIP', 'ENTER OR ESC: SKIP'), W - 20, 512, 2, C.dim, 'right');
  }
  function drawScores(c, entry) {
    backdrop(c, 'rgba(200,60,80,0.1)');
    bigTitle(c, 'GAME OVER', 44, 56, 'blood');
    if (A.final) T(c, 'SCORE ' + A.final.score + '   WINS ' + A.final.wins, W / 2, 86, 3, C.gold, 'center');
    T(c, entry ? 'NEW HIGH SCORE! ENTER YOUR INITIALS' : 'TOP TEN', W / 2, 122, 2, entry ? C.green : C.cyan, 'center');
    const rows = SV.top.map(e => Object.assign({}, e)), rk = entry ? rankOf(A.final.score) : A.rank;
    if (entry) rows.splice(rk, 0, { n: entry.l.map(n => String.fromCharCode(65 + n)).join(''), s: A.final.score, w: A.final.wins, d: A.final.diff, me: true });
    panel(c, 230, 146, 500, 354);
    for (let i = 0; i < 10; i++) {
      const e = rows[i], y = 158 + i * 33, me = i === rk;
      if (me) { c.fillStyle = 'rgba(255,210,63,0.16)'; c.fillRect(236, y - 4, 488, 30); }
      T(c, String(i + 1) + '.', 252, y, 2, me ? C.gold : C.dim);
      if (e) {
        if (me && entry) e.n.split('').forEach((ch, k) => { const on = k === entry.pos, cx = 320 + k * 26; T(c, ch, cx, y, 2, on && blink(8) ? C.white : C.gold); if (on) { c.fillStyle = C.gold; c.fillRect(cx, y + 17, 10, 2); } });
        else T(c, e.n, 320, y, 2, me ? C.gold : C.white);
        T(c, String(e.s), 560, y, 2, me ? C.gold : C.white, 'right'); T(c, 'W' + e.w, 700, y, 2, C.dim, 'right');
      } else T(c, '---', 320, y, 2, '#3a3466');
    }
    T(c, entry ? tp('UP AND DOWN CHANGE THE LETTER · NEXT MOVES ON · OK SAVES AT THE LAST ONE', 'W S LETTER   J CONFIRM   A D MOVE') : tp('TAP TITLE TO LEAVE', 'PRESS A BUTTON'), W / 2, 512, 2, C.dim, 'center');
  }
  function drawStats(c) {
    backdrop(c);
    bigTitle(c, 'STATS', 44, 52);
    panel(c, 40, 86, 440, 196);
    T(c, 'FIGHTER', 100, 96, 2, C.gold); T(c, 'WINS', 360, 96, 2, C.gold, 'right'); T(c, 'LOSSES', 450, 96, 2, C.gold, 'right');
    ROSTER.forEach((r, i) => {
      const y = 124 + i * 30, s = rec(r.id); drawHeadIcon(c, r.id, 52, y - 7, 30); T(c, SHORT(r), 100, y, 2, r.col); T(c, String(s.w), 360, y, 2, C.white, 'right'); T(c, String(s.l), 450, y, 2, C.white, 'right');
    });
    panel(c, 500, 86, 420, 196);
    T(c, 'BEST COMBO', 520, 98, 2, C.gold); T(c, String(ST.combo), 900, 98, 2, C.white, 'right');
    T(c, 'BEST SURVIVAL', 520, 122, 2, C.gold); T(c, ST.surv.score + ' (W' + ST.surv.wins + ')', 900, 122, 2, C.white, 'right');
    T(c, 'MATCHES PLAYED', 520, 146, 2, C.gold); T(c, String(ST.matches), 900, 146, 2, C.white, 'right');
    T(c, 'LADDER CLEARS', 520, 176, 2, C.gold);
    DIFFS.forEach((d, i) => { T(c, DIFF_INFO[d][0], 540, 200 + i * 19, 2, DIFF_INFO[d][1]); T(c, String(ST.clears[d]), 900, 200 + i * 19, 2, C.white, 'right'); });
    T(c, 'BADGES  ' + BADGES.filter(b => ST.badges[b.id]).length + '/' + BADGES.length, 40, 292, 2, C.gold);
    BADGES.forEach((b, i) => {                                   // two columns of four, a name line and a description line each
      const col = i % 2, row = Math.floor(i / 2), x = 40 + col * 450, y = 316 + row * 48, on = ST.badges[b.id];
      panel(c, x, y, 430, 44, on ? C.gold : '#2a2550', on ? '#2a2108' : '#100e22');
      T(c, on ? b.ch : '?', x + 24, y + 14, 3, on ? C.gold : '#4a4478', 'center');
      T(c, on ? b.name : '???', x + 52, y + 5, 2, on ? C.white : '#4a4478');
      T(c, b.desc, x + 52, y + 24, 2, on ? C.dim : '#4a4478');
    });
    T(c, tp('TAP BACK', 'ESC OR ANY CONFIRM KEY: BACK'), W / 2, 516, 2, C.dim, 'center');
  }
  function drawToast(c) {
    const q = A.toasts[0]; if (!q) return;
    const e = q.t < 20 ? q.t / 20 : q.t > 195 ? Math.max(0, (220 - q.t) / 25) : 1, y = 62 - (1 - e) * 60, x = W / 2 - 170;
    c.save(); c.globalAlpha = Math.min(1, e + 0.1);
    panel(c, x, y, 340, 58, C.gold, '#1d1708'); c.fillStyle = '#6b4d00'; c.fillRect(x + 8, y + 8, 42, 42); c.strokeStyle = C.gold; c.strokeRect(x + 9, y + 9, 40, 40);
    T(c, q.b.ch, x + 29, y + 22, 2, C.gold, 'center'); T(c, 'BADGE UNLOCKED', x + 62, y + 10, 2, C.gold); T(c, q.b.name, x + 62, y + 32, 2, C.white);
    c.restore();
  }
  HOOKS.add('drawTop', (c, g) => {
    switch (A.screen) {
      case 'select': drawSelect(c); break;
      case 'ladder': drawLadder(c); break;
      case 'continue': drawContinue(c); break;
      case 'surv': drawSurv(c); break;
      case 'ending': drawEnding(c); break;
      case 'credits': drawCredits(c); break;
      case 'initials': drawScores(c, A.entry); break;
      case 'top10': drawScores(c, null); break;
      case 'stats': drawStats(c); break;
      default:
        if (g.phase === 'select') badgeRow(c, 14, 8, 22, 4);          // the free corner of the engine select screen
        else if (g.phase === 'over') badgeRow(c, W / 2, 490, 22, 4, 'center');
    }
    drawToast(c);
  }, 100);

  // the pieces the tests (and curious people with a console) use
  window.ARCADE = {
    S: A, BADGES, DIFFS, ENDINGS, TAUNT,
    stats: () => ST, top: topList, qualifies, addScore, rankOf, earn, startRun, launchFight, bossDef, route,
    reload() { ST = loadStats(); SV = loadSurv(); },
  };
})();
