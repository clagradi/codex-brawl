// ===== AGENT BRAWL feature file: CPU2. Smarter CPU opponents. Loaded after touch.js (see docs/ARCHITECTURE.md). =====
// Owner: the x-cpu2 agent. Only that agent edits this file, tools/tests/x-cpu2.mjs and docs/features/x-cpu2.md.
// Area: the CPU fighter's brain. A personality per fighter (aggression, spacing, favourite specials, jump-in / block / throw / taunt rates),
//   adaptation to the habits of the foe within a match (jump-ins, blocking, lows, throws, special spam, whiffs), and a skill curve (reaction delay,
//   mistake rate, tech, anti-air, punish) driven by SETTINGS 'difficulty', which gains a fourth value, NIGHTMARE.
// Hooks used: input (replaces the input of a CPU fighter in the fight phase, never a human's; other hooks still see the result), fighterUpdate (watches both fighters),
//   drawHud (CPU vs CPU: both personalities), drawTop (the CPU level on the VS screen in 1P). BUS: match:start, round:start, hit, throw, special, super.
// Shared: DIFFICULTY (game.js) gets a 'nightmare' entry and the SETTINGS 'difficulty' enum gets the value 'nightmare'; nothing else is touched. Public API: window.CPU2 (see the bottom).
'use strict';
(() => {
  window.STUB_CPU2 = 1;   // marker: tools/tests/core.mjs checks the feature files load. Keep the line.

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = () => Math.random();   // tests seed Math.random, so every roll goes through it

  // ======================================================================
  // Difficulty: one skill number (game.cpuLevel, 0..1) drives everything. Anchors: easy .2, normal .45, hard .7, nightmare .95.
  // ======================================================================
  const ANCH = [0.2, 0.45, 0.7, 0.95], NAMES = ['easy', 'normal', 'hard', 'nightmare'];
  const LEVEL_COL = { easy: '#7be38a', normal: '#7cc7ff', hard: '#ffb02e', nightmare: '#ff3a58' };
  // columns: easy, normal, hard, nightmare
  const TABLE = {
    react:   [18, 10, 6, 3],               // ticks late the CPU sees the foe (an attack starts, the guard goes up this much later)
    miss:    [0.30, 0.17, 0.08, 0.02],     // chance a threat or an opening goes unnoticed, and the share of decisions that are blunders
    think:   [22, 15, 10, 6],              // ticks between neutral decisions
    aa:      [0.14, 0.38, 0.62, 0.88],     // chance to answer a jump-in with a ground normal
    block:   [0.16, 0.46, 0.74, 0.95],     // chance to guard a threat it saw
    punish:  [0.07, 0.25, 0.52, 0.90],     // chance to punish a recovery it saw
    tech:    [0.05, 0.22, 0.50, 0.85],     // chance to tech a throw
    counter: [0.00, 0.05, 0.15, 0.35],     // chance to poke or back dash out of a slow attack instead of guarding it
    chain:   [0.38, 0.60, 0.80, 0.94],     // chance to follow a landed hit with the next chain step, a special or the super
    adapt:   [0.00, 0.35, 0.70, 1.00],     // how much a read habit changes the CPU's choices
    aggr:    [0.90, 1.00, 1.10, 1.25],     // multiplies the personality's aggression
  };
  const pcache = {};
  function params(skill) {
    const key = Math.round(skill * 100); if (pcache[key]) return pcache[key];
    const s = clamp(skill, ANCH[0], ANCH[3]), k = s <= ANCH[1] ? 0 : s <= ANCH[2] ? 1 : 2, u = (s - ANCH[k]) / (ANCH[k + 1] - ANCH[k]), K = { skill: s };
    for (const n in TABLE) K[n] = TABLE[n][k] + (TABLE[n][k + 1] - TABLE[n][k]) * u;
    K.D = Math.round(K.react);
    return pcache[key] = K;
  }
  function levelName(skill) { let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(skill - ANCH[k]) < Math.abs(skill - ANCH[b])) b = k; return NAMES[b]; }
  function skillOf(f) {
    const o = api.levels[f.side];
    if (typeof o === 'number') return clamp(o, 0, 1);
    if (typeof o === 'string' && NAMES.includes(o.toLowerCase())) return ANCH[NAMES.indexOf(o.toLowerCase())];
    return typeof game.cpuLevel === 'number' ? game.cpuLevel : 0.45;
  }
  // NIGHTMARE: the engine reads DIFFICULTY[setting] = [start level, ramp per round]; the options screen lists SETTINGS.list()
  try { if (typeof DIFFICULTY === 'object' && !DIFFICULTY.nightmare) DIFFICULTY.nightmare = [0.95, 0.05]; } catch (e) { /* frozen: no nightmare */ }
  try {
    const d = SETTINGS.list().find(x => x.key === 'difficulty');
    if (d && Array.isArray(d.values) && !d.values.includes('nightmare')) SETTINGS.define('difficulty', Object.assign({}, d, { values: d.values.concat('nightmare') }));
  } catch (e) { /* settings missing: the three stock levels */ }

  // ======================================================================
  // Personalities. aggr 0..1 how often it starts something, range = the spacing band it wants (px), fav = weight of special 0 (L), 1 (FWD+L), 2 (DOWN+L),
  // jump / block / throw / taunt 0..1 rates, dash how willing it is to dash in, poke = weights [punch, kick, low, sweep].
  // ======================================================================
  const PROFILES = {
    tibo:   { tag: 'SHIPPER',  aggr: 0.60, range: [110, 230], fav: [1.0, 1.4, 0.5], jump: 0.14, block: 0.30, throw: 0.20, taunt: 0.04, dash: 0.45, poke: [0.50, 0.30, 0.08, 0.12], lines: ['SHIPPED IT', 'LGTM'] },
    poteto: { tag: 'ZONER',    aggr: 0.45, range: [250, 420], fav: [2.6, 0.7, 0.6], jump: 0.08, block: 0.25, throw: 0.08, taunt: 0.06, dash: 0.12, poke: [0.35, 0.40, 0.05, 0.20], lines: ['HOT TAKE', 'DEPLOYED ON A FRIDAY'] },
    dot:    { tag: 'RUSHDOWN', aggr: 0.86, range: [40, 120],  fav: [0.5, 1.7, 1.0], jump: 0.30, block: 0.15, throw: 0.35, taunt: 0.02, dash: 0.80, poke: [0.55, 0.25, 0.10, 0.10], lines: ['...', 'DOT DOT DOT'] },
    wang:   { tag: 'PUNISHER', aggr: 0.36, range: [170, 300], fav: [1.2, 0.8, 1.2], jump: 0.06, block: 0.72, throw: 0.15, taunt: 0.06, dash: 0.18, poke: [0.40, 0.30, 0.10, 0.20], lines: ['LOW LOSS', 'CONVERGED'] },
    muse:   { tag: 'GRAPPLER', aggr: 0.56, range: [50, 140],  fav: [0.7, 1.5, 1.2], jump: 0.10, block: 0.40, throw: 0.66, taunt: 0.04, dash: 0.50, poke: [0.50, 0.30, 0.10, 0.10], lines: ['TASK COMPLETE', 'ANYTHING ELSE?'] },
  };
  const DEFAULT_PROFILE = { tag: 'BALANCED', aggr: 0.5, range: [100, 240], fav: [1, 1, 1], jump: 0.12, block: 0.4, throw: 0.2, taunt: 0.03, dash: 0.4, poke: [0.5, 0.3, 0.1, 0.1], lines: ['LGTM'] };
  const profileOf = f => PROFILES[f.d && f.d.id] || DEFAULT_PROFILE;

  // ======================================================================
  // Watching the foe: a short history of snapshots (for the reaction delay) and habit counters (for the adaptation).
  // ======================================================================
  const HIST = [[], []];
  const freshHab = () => ({ jump: 0, air: 0, low: 0, throw: 0, spec: 0, shot: 0, sup: 0, blockT: 0, whiff: 0, atk: 0 });
  let HAB = [freshHab(), freshHab()];   // HAB[side]: what that fighter has done this match (decays with a ~10 s half life)
  let LEARN = [{ jumpHits: 0 }, { jumpHits: 0 }];   // what happened to the CPU itself (its jump-ins that got hit)
  let decayT = 0, fightTicks = 0, lastAtkTick = 0;

  function snap(f) {
    const A = f.curAtk ? f.curAtk() : null, mv = f.mv;
    return { st: f.state, t: f.st, t0: f.t - f.st, atk: f.atk, x: f.x, y: f.y, vx: f.vx, vy: f.vy, air: f.y < GROUND, face: f.face, contact: f.contact, mv,
      hit: A ? A.hit : mv ? Math.max(1, mv.hit || 1) : 0, len: A ? A.len : mv ? (mv.len || 30) : 0 };
  }
  const obs = (side, d) => { const h = HIST[side]; return d > 0 && h.length ? h[Math.max(0, h.length - 1 - d)] : null; };
  const ageOf = (side, d) => Math.max(0, Math.min(d, HIST[side].length - 1));   // how many ticks old obs(side, d) really is

  function tickObs(f, o) {
    const s = f.side, h = HIST[s], prev = h[h.length - 1], cur = snap(f), H = HAB[s];
    if (prev && prev.t0 !== cur.t0) {   // a new state or a new attack began
      if (cur.st === 'jump' && Math.abs(o.x - f.x) > 90) H.jump++;
      else if (cur.st === 'punch' || cur.st === 'kick') { H.atk++; lastAtkTick = fightTicks; if (cur.atk === 'low' || cur.atk === 'sweep') H.low++; if (cur.air) H.air++; }
      else if (cur.st === 'special' || cur.st === 'super') lastAtkTick = fightTicks;
      if ((prev.st === 'punch' || prev.st === 'kick' || prev.st === 'special') && !prev.contact && prev.t >= prev.hit && (cur.st === 'idle' || cur.st === 'walk' || cur.st === 'block' || cur.st === 'jump')) H.whiff++;   // an attack ran out without touching anything
    }
    if (f.state === 'block' && Math.abs(o.x - f.x) < 260) H.blockT += 1 / 60;
    h.push(cur); if (h.length > 48) h.shift();
  }
  HOOKS.add('fighterUpdate', (a, b) => {
    if (game.phase !== 'fight') return;
    fightTicks++; tickObs(a, b); tickObs(b, a);
    if (++decayT >= 60) { decayT = 0; for (const hb of HAB) for (const k in hb) hb[k] *= 0.93; }
  });
  BUS.on('throw', e => { if (e && e.src && HAB[e.src.side]) HAB[e.src.side].throw++; });
  BUS.on('special', e => { if (e && e.fighter && HAB[e.fighter.side]) { const H = HAB[e.fighter.side]; H.spec++; if (e.move && e.move.ai && e.move.ai.min >= 140) H.shot++; } });
  BUS.on('super', e => { if (e && e.fighter && HAB[e.fighter.side]) HAB[e.fighter.side].sup++; });
  BUS.on('hit', e => { if (e && e.victim && e.victim.cpu && !e.victim.onGround && LEARN[e.victim.side]) LEARN[e.victim.side].jumpHits++; });
  BUS.on('match:start', () => { HAB = [freshHab(), freshHab()]; LEARN = [{ jumpHits: 0 }, { jumpHits: 0 }]; HIST[0].length = HIST[1].length = 0; decayT = fightTicks = lastAtkTick = 0; });
  BUS.on('round:start', () => { HIST[0].length = HIST[1].length = 0; fightTicks = lastAtkTick = 0; if (game.f) for (const f of game.f) f.cpu2 = null; });

  // how strongly the habits of fighter `side` have been noticed, 0..1 each
  function reads(side) {
    const h = HAB[side] || freshHab();
    return { jump: clamp((h.jump - 1.2) / 4, 0, 1), air: clamp((h.air - 1) / 4, 0, 1), low: clamp((h.low - 1) / 4, 0, 1), throw: clamp(h.throw / 2.5, 0, 1),
      spam: clamp((h.spec - 2) / 4, 0, 1), shot: clamp((h.shot - 2) / 4, 0, 1), block: clamp((h.blockT - 1.5) / 4, 0, 1), whiff: clamp((h.whiff - 1) / 4, 0, 1) };
  }
  const NOTE = { jump: 'ANTI-AIR', block: 'THROWS', low: 'LOW GUARD', throw: 'TECHS', spam: 'CLOSES IN', whiff: 'PUNISHES' };
  function note(F, S, key) {   // a short popup the first time the CPU has a habit of the foe figured out
    if (S.noted[key] || !game.popups) return; S.noted[key] = 1;
    if (F.t - (S.lastNote || -999) < 200) return; S.lastNote = F.t;
    game.popups.push({ x: F.x, y: F.y - 250, t: 70, txt: 'READ ' + NOTE[key] });
  }

  // ======================================================================
  // The brain
  // ======================================================================
  const FIGHT_STATES = new Set(['punch', 'kick', 'special', 'super']);
  const freshState = () => ({ act: null, think: 4, rx: { key: null }, noted: {}, lastNote: -999, taunt: 0, aaEp: -1, aaRoll: false, obAir: false, techKey: null, techDo: false, techAt: 3, cKey: null, cPlan: null, pKey: null, label: '', gu: 0 });

  const A_wait = d => ({ n: 'wait', d, n1: 0, go() {} });
  const A_walk = (dir, to, d) => ({ n: 'walk', d, n1: d, go(i, g) { i[dir === 'toward' ? g.toward : g.away] = true; }, stop: g => dir === 'toward' ? g.dist <= to : (g.dist >= to || g.wall) });
  const A_guard = (d, until) => ({ n: 'guard', d, n1: d, go(i) { i.d = true; }, until });
  const A_key = (n, keys, d) => ({ n, d, n1: 1, go(i, g) { for (const k in keys) i[k] = keys[k]; if (keys.fwd) { delete i.fwd; i[g.toward] = true; } if (keys.back) { delete i.back; i[g.away] = true; } } });
  const A_throw = () => ({ n: 'throw', d: 10, n1: 3, go(i, g) { i[g.toward] = true; i.p = true; }, stop: (g, F) => F.state === 'throw' });
  const A_dash = dir => ({ n: 'dash', d: 14, n1: 1, go(i, g) { i.dash = (dir === 'toward' ? g.sgn : -g.sgn); } });
  const A_jumpin = pref => ({ n: 'jumpin', d: 70, n1: 70, fired: false, go(i, g, t, F, O, a) {
    i[g.toward] = true;
    if (F.onGround) { if (t <= 2) i.u = true; return; }
    if (!a.fired && g.dist < 108 && O.y >= F.y - 40) { a.fired = true; i[pref] = true; }
  }, stop: (g, F, t) => t > 6 && F.onGround });

  function brain(F) {
    const O = game.f[1 - F.side], S = F.cpu2 || (F.cpu2 = freshState()), i = {};
    const K = params(skillOf(F)), P = profileOf(F), H = reads(O.side), ad = K.adapt, D = K.D;
    const dx = O.x - F.x, dist = Math.abs(dx);
    const g = { dx, dist, sgn: dx > 0 ? 1 : -1, toward: dx > 0 ? 'r' : 'l', away: dx > 0 ? 'l' : 'r', wall: F.x < 80 || F.x > W - 80 };
    S.K = K; S.H = H;
    for (const k in NOTE) if (H[k] > 0.6 && ad > 0.3) note(F, S, k);

    // ---- grabbed: tech the throw (the engine's window is the first 6 ticks of the grab) ----
    if (F.state === 'grabbed') {
      const key = F.t - F.st;
      if (S.techKey !== key) { S.techKey = key; S.techDo = rnd() < clamp(K.tech + 0.4 * ad * H.throw, 0, 0.97); S.techAt = Math.min(5, 1 + Math.round(D / 4)); }
      if (S.techDo && F.st >= S.techAt && F.st <= 5) i.p = true;
      return i;
    }
    if (F.busy()) { chains(F, O, S, K, P, H, g, i); return i; }
    if (S.taunt > 0) { S.taunt--; S.label = 'TAUNT'; return i; }

    // ---- reactions: what the CPU saw D ticks ago (the foe's live position is used for spacing) ----
    const ob = D > 0 ? (obs(O.side, D) || snap(O)) : snap(O), age = D > 0 ? ageOf(O.side, D) : 0;
    if (reactions(F, O, S, K, P, H, g, ob, age, i)) return i;

    // ---- the running macro, else a new decision ----
    if (S.act && runAct(F, O, S, g, i)) return i;
    S.act = null;
    if (--S.think <= 0) decide(F, O, S, K, P, H, g, i);
    if (S.act) runAct(F, O, S, g, i);
    return i;
  }

  function runAct(F, O, S, g, i) {
    const a = S.act; if (!a) return false;
    a.t = (a.t || 0) + 1;
    if (a.t > a.d || (a.stop && a.stop(g, F, a.t)) || (a.until && a.t > 3 && a.until(F, O, g))) { S.act = null; return false; }
    if (a.t <= a.n1) a.go(i, g, a.t, F, O, a);
    return true;
  }
  const setAct = (S, a, label) => { S.act = a; S.label = label || S.label; return true; };

  // an attack the foe has started or a shot on its way
  function threat(F, ob) {
    if (!ob) return null;
    const od = Math.abs(ob.x - F.x);
    if (ob.st === 'punch' || ob.st === 'kick') {
      const A = ATK[ob.atk]; if (!A || (A.air && !ob.air)) return null;
      const reach = A.box[1] + 52;
      if (od > reach || ob.t > A.hit + 2) return null;
      return { A, reach, left: A.hit - ob.t };
    }
    if (ob.st === 'special' || ob.st === 'super') {
      const mv = ob.mv; if (!mv) return null;
      const reach = ob.st === 'super' ? 420 : Math.min((mv.ai && mv.ai.max) || 300, 340) + 30;
      if (od > reach || ob.t > Math.max(mv.len || 30, 20)) return null;
      return { A: null, reach, left: (mv.hit || 12) - ob.t, mv };
    }
    return null;
  }

  function reactions(F, O, S, K, P, H, g, ob, age, i) {
    const ad = K.adapt, D = K.D;
    // -- anti-air: the foe is in the air and about to land on us --
    if (ob.air && !S.obAir) { S.aaEp = F.t; S.aaRoll = rnd() < clamp(K.aa + 0.5 * ad * H.jump, 0, 0.97) && rnd() >= K.miss; S.aaSp = rnd() < 0.3 * K.skill; }
    S.obAir = ob.air;
    const th = threat(F, ob);
    if (ob.air && S.aaRoll && F.onGround && !th) {
      const M = MOVES[F.d.id], sp2 = M.sp[2], pd6 = Math.abs(ob.x + ob.vx * (6 + age) - F.x), pd9 = Math.abs(ob.x + ob.vx * (9 + age) - F.x);
      if (S.aaSp && sp2 && sp2.ai && sp2.ai.min <= 60 && F.cool <= 0 && g.dist >= sp2.ai.min && g.dist <= sp2.ai.max) { S.aaRoll = false; S.act = null; i.s = true; i.mv = 2; S.label = 'ANTI-AIR'; return true; }
      if (pd6 <= 80) { S.aaRoll = false; S.act = null; i.p = true; S.label = 'ANTI-AIR'; return true; }
      if (pd9 <= 100) { S.aaRoll = false; S.act = null; i.k = true; S.label = 'ANTI-AIR'; return true; }
    }
    // -- an attack coming: guard it, poke out of it, or dash out --
    if (th) {
      const key = ob.t0;
      if (S.rx.key !== key) {
        const already = F.state === 'block', seen = rnd() >= K.miss * (already ? 0.3 : 1);
        let choice = null;
        if (seen) {
          const A = th.A, rl = th.left - age;   // ticks until it really lands
          const lowA = A && (th.A === ATK.low || th.A === ATK.sweep);
          const wG = clamp(K.block * (0.65 + 0.7 * P.block) + (already ? 0.3 : 0) + 0.25 * ad * (lowA ? H.low : th.mv ? H.spam : 0), 0, 0.98);
          const wC = A && rl >= 7 && g.dist <= 92 && !A.air ? K.counter * (0.5 + P.aggr) : 0;
          const wD = A && rl >= 1 && rl <= 5 && F.dashCool <= 0 && !g.wall && g.dist < A.box[1] + 40 ? K.counter * 0.7 : 0;
          const r = rnd();
          choice = r < wC ? 'counter' : r < wC + wD ? 'dodge' : r < wC + wD + wG ? 'guard' : null;
        }
        S.rx = { key, seen, choice, until: F.t + Math.max(6, th.left + 6) };
        if (choice === 'guard') S.label = 'GUARD';
      }
      const c = S.rx.choice;
      if (c === 'counter' && !S.rx.done) { S.rx.done = true; i.p = true; S.label = 'COUNTER'; return true; }
      if (c === 'dodge' && !S.rx.done) { S.rx.done = true; i.dash = -g.sgn; S.label = 'DODGE'; return true; }
      if (c === 'guard') { i.d = true; return true; }
    } else if (S.rx.choice === 'guard' && F.t <= S.rx.until) { i.d = true; return true; }
    // -- a shot on its way --
    const pr = game.proj.find(p => p.owner !== F && p.t >= 0 && Math.sign(p.vx) === Math.sign(F.x - p.x) && Math.abs(p.x - F.x) < 300 - Math.min(160, D * Math.abs(p.vx) * 0.6) && Math.abs(p.x - F.x) > 36);
    if (pr) {
      if (S.px !== pr) {
        S.px = pr; const seen = rnd() >= K.miss, r = rnd();
        S.pc = !seen ? null : r < clamp(K.block * (0.7 + 0.5 * P.block), 0, 0.97) ? 'guard' : g.dist > 200 && r < 0.97 && rnd() < P.jump * 1.5 + 0.5 * ad * H.shot ? 'jump' : null;
      }
      if (S.pc === 'guard') { S.label = 'GUARD'; i.d = true; return true; }
      if (S.pc === 'jump' && !S.act) { S.pc = null; setAct(S, A_jumpin('k'), 'JUMP-IN'); return false; }
    }
    // -- the foe is recovering from an attack: punish --
    if ((ob.st === 'punch' || ob.st === 'kick' || ob.st === 'special') && ob.t > ob.hit && ob.t < ob.len && !th && !ob.air) {
      if (S.pKey !== ob.t0) {
        S.pKey = ob.t0;
        const rem = ob.len - ob.t - age, seen = rnd() >= K.miss, p = clamp(K.punish * (1 + 0.6 * ad * H.whiff + 0.4 * ad * (ob.atk === 'sweep' ? H.low : 0)), 0, 0.97);
        if (seen && rnd() < p) {
          if (g.dist <= 66 && THROWABLE.includes(O.state) && rnd() < 0.5 + 0.3 * P.throw) { setAct(S, A_throw(), 'PUNISH'); }
          else if (rem >= 8 && g.dist <= 90) { setAct(S, A_key('punish', { p: true }, 8), 'PUNISH'); }
          else if (rem >= 11 && g.dist <= 104) { setAct(S, A_key('punish', { k: true }, 10), 'PUNISH'); }
          else if (rem >= 16 && g.dist <= 300 && F.dashCool <= 0) { setAct(S, A_dash('toward'), 'PUNISH'); S.think = Math.max(S.think, 2); }
          if (S.act) { runAct(F, O, S, g, i); return true; }
        }
      }
    }
    return false;
  }

  // after a normal connects (or is blocked): follow it up
  function chains(F, O, S, K, P, H, g, i) {
    const A = F.curAtk(); if (!A || !F.cancelOpen) return;
    const key = F.t - F.st;
    if (S.cKey !== key) {
      S.cKey = key; S.cPlan = null;
      const M = MOVES[F.d.id], r = rnd();
      if (rnd() >= K.miss * 0.5) {
        const ok = [0, 1, 2].filter(k => { const m = M.sp[k], a = m && (m.ai || { min: 0, max: 999 }); return !!m && F.cool <= 0 && g.dist >= a.min && g.dist <= a.max && P.fav[k] > 0; });
        const pc = K.chain * (0.6 + 0.5 * P.aggr), blocked = O.state === 'block';
        if (F.meter >= 100 && M.su && g.dist <= ((M.su.ai && M.su.ai.max) || 520) && r < (blocked ? 0.15 : 0.35 + 0.55 * K.chain)) S.cPlan = 'x';
        else if (ok.length && r < 0.12 + 0.30 * K.chain * P.aggr + 0.1 * ok.length) {
          let tot = 0; for (const k of ok) tot += P.fav[k]; let q = rnd() * tot, pick = ok[0];
          for (const k of ok) { q -= P.fav[k]; if (q <= 0) { pick = k; break; } }
          S.cPlan = 's' + pick;
        } else if (A.chain && r < pc + 0.3) S.cPlan = A.chain.p && (!A.chain.k || rnd() < 0.6) ? 'p' : 'k';
      }
    }
    const pl = S.cPlan; if (!pl) return;
    S.cPlan = null;
    if (pl === 'x') i.x = true; else if (pl === 'p') i.p = true; else if (pl === 'k') i.k = true; else { i.s = true; i.mv = +pl[1]; }
    S.label = pl === 'x' ? 'SUPER' : pl[0] === 's' ? 'SPECIAL' : 'COMBO';
  }

  // the neutral game: spacing, specials, jump-ins, throws, pokes
  function decide(F, O, S, K, P, H, g, i) {
    const ad = K.adapt, M = MOVES[F.d.id], dist = g.dist, r = rnd();
    S.think = Math.max(2, Math.round(K.think * (0.7 + 0.6 * rnd())));
    const idle = (fightTicks - lastAtkTick) / 600;               // seconds of 10 with nobody attacking: turn the heat up
    const aggr = clamp(P.aggr * K.aggr + clamp(idle - 0.2, 0, 0.5), 0.05, 0.98);
    const rng = P.range, foeGuard = O.state === 'block';
    const inR = k => { const m = M.sp[k], a = m && (m.ai || { min: 0, max: 999 }); return !!m && F.cool <= 0 && dist >= a.min && dist <= a.max && P.fav[k] > 0; };

    // taunt: only when the foe is far away or down, and rarely (never at NIGHTMARE)
    if (dist > 260 && F.onGround && K.skill < 0.9 && rnd() < P.taunt * 0.35 * (1.25 - K.skill)) {
      const L = P.lines; S.taunt = 36; S.label = 'TAUNT'; if (game.popups) game.popups.push({ x: F.x, y: F.y - 250, t: 60, txt: L[Math.floor(rnd() * L.length)] });
      if (typeof beep === 'function') beep(330, 0.08, 'triangle', 0.04); return;
    }
    // blunder: it loses the thread for a moment
    if (rnd() < K.miss * 0.5) {
      const b = rnd();
      setAct(S, b < 0.4 ? A_wait(10 + Math.floor(rnd() * 14)) : b < 0.7 ? A_walk('toward', 0, 8 + Math.floor(rnd() * 10)) : b < 0.9 ? A_walk('away', 999, 8 + Math.floor(rnd() * 8)) : A_key('hop', { u: true }, 20), 'LOST'); return;
    }
    // super when it is full and the foe is not hiding behind a guard
    if (F.meter >= 100 && M.su && dist <= ((M.su.ai && M.su.ai.max) || 520) && (foeGuard ? rnd() < 0.2 : rnd() < 0.3 + 0.5 * K.skill)) { setAct(S, A_key('super', { x: true }, 12), 'SUPER'); return; }
    // a foe that blocks everything gets thrown; one that keeps jumping gets met in the air (reactions); one that spams shots gets rushed
    const wThrow = clamp(P.throw + (foeGuard ? 0.35 : 0) + ad * H.block * 0.5, 0, 0.95);
    if (dist <= 66 && F.onGround && rnd() < wThrow * (foeGuard ? 1 : 0.55) * (0.5 + aggr)) { setAct(S, A_throw(), 'THROW'); return; }
    // specials
    const ok = [0, 1, 2].filter(inR);
    if (ok.length && rnd() < 0.10 + 0.5 * aggr * (dist > rng[1] ? 1.2 : 1)) {
      let tot = 0; for (const k of ok) tot += P.fav[k]; let q = rnd() * tot, pick = ok[0];
      for (const k of ok) { q -= P.fav[k]; if (q <= 0) { pick = k; break; } }
      setAct(S, A_key('special', { s: true, mv: pick }, 12), 'SPECIAL'); return;
    }
    // guard stance in neutral
    if (dist < 240 && rnd() < P.block * 0.30) { setAct(S, A_guard(14 + Math.floor(rnd() * 16)), 'GUARD'); return; }

    const far = dist > rng[1], near = dist < rng[0];
    if (far) {
      const jumpW = P.jump * (1 / (1 + 0.8 * ad * LEARN[F.side].jumpHits)) * (1 + 0.8 * ad * H.shot);
      if (dist > 200 && rnd() < jumpW) { setAct(S, A_jumpin(rnd() < 0.7 ? 'k' : 'p'), 'JUMP-IN'); return; }
      if (dist > 220 && F.dashCool <= 0 && rnd() < P.dash * 0.6) { setAct(S, A_dash('toward'), 'RUSH'); S.think = 3; return; }
      setAct(S, A_walk('toward', rng[1] - 10, 30), 'ZONING'); return;
    }
    if (near && P.range[0] >= 100 && !g.wall && rnd() < 0.7) { setAct(S, A_walk('away', rng[0] + 20, 24), 'SPACING'); return; }
    // in the band (or near for a rusher): attack or weave
    if (rnd() < aggr) {
      const w = P.poke, lowBias = ad * H.low * 0.0;
      let a;
      if (dist > 126) { setAct(S, A_walk('toward', 100, 14), 'PRESSURE'); return; }
      if (dist > 106) a = 'sweep';
      else if (dist > 92) a = rnd() < 0.55 ? 'kick' : 'sweep';
      else {
        const tot = w[0] + w[1] + w[2] * (foeGuard ? 0.4 : 1) + w[3]; let q = rnd() * tot;
        a = (q -= w[0]) < 0 ? 'punch' : (q -= w[1]) < 0 ? 'kick' : (q -= w[2]) < 0 ? 'low' : 'sweep';
      }
      if (foeGuard && dist <= 70 && rnd() < 0.5) { setAct(S, A_throw(), 'THROW'); return; }
      const keys = a === 'punch' ? { p: true } : a === 'kick' ? { k: true } : a === 'low' ? { d: true, p: true } : { d: true, k: true };
      setAct(S, A_key(a, keys, 8), a === 'punch' || a === 'kick' ? 'POKE' : 'LOW'); return;
    }
    const b = rnd();
    if (b < 0.45 && !g.wall) setAct(S, A_walk('away', rng[1], 8 + Math.floor(rnd() * 8)), 'SPACING');
    else if (b < 0.75) setAct(S, A_walk('toward', 0, 6 + Math.floor(rnd() * 8)), 'SPACING');
    else setAct(S, A_wait(6 + Math.floor(rnd() * 10)), 'WAIT');
  }

  // ======================================================================
  // The input hook: replaces the CPU's input in the fight phase. Humans, training dummies and the finisher keep what the engine computed.
  // ======================================================================
  const SKIP_MODE = /train|tutorial|practice|dummy|sandbox/i;
  HOOKS.add('input', (inp, side, f) => {
    if (!api.enabled || !f || !f.cpu || f.cpu2off || game.phase !== 'fight' || !game.f || game.f.length < 2 || SKIP_MODE.test(String(game.modeId || ''))) return undefined;
    try { return brain(f); } catch (e) { api.enabled = false; throw e; }   // a bug turns the layer off, the stock CPU takes over; the hook error is logged once
  }, -50);

  // ======================================================================
  // Screens
  // ======================================================================
  function tag(txt, x, y, col, align, size) { if (typeof ptext === 'function') ptext(ctx, txt, x, y, size || 2, col, align || 'left'); }
  HOOKS.add('drawHud', (c, gm) => {   // CPU vs CPU (#demo): both personalities and their level
    const a = gm.f && gm.f[0], b = gm.f && gm.f[1]; if (!a || !b || !a.cpu || !b.cpu || !api.enabled) return;
    for (const f of [a, b]) {
      const P = profileOf(f), S = f.cpu2, lv = levelName(skillOf(f)), left = f.side === 0, x = left ? 76 : 960 - 76;
      tag(P.tag + ' / ' + lv.toUpperCase(), x, 80, LEVEL_COL[lv], left ? 'left' : 'right');
      if (S && S.label) tag(S.label, x, 98, '#c9a24a', left ? 'left' : 'right');
    }
  });
  HOOKS.add('drawTop', (c, gm) => {   // the VS screen in 1P shows the level the CPU plays at
    if (gm.phase !== 'vs' || !gm.f || !gm.f[1] || !gm.f[1].cpu || gm.f[0].cpu) return;
    const lv = levelName(skillOf(gm.f[1])), t = gm.phaseT || 0, a = Math.min(1, t / 14), pulse = lv === 'nightmare' ? 0.65 + 0.35 * Math.sin(t * 0.35) : 1;
    c.save(); c.globalAlpha = a;
    const txt = 'CPU LEVEL ' + lv.toUpperCase(), w = (typeof ptextWidth === 'function' ? ptextWidth(txt, 3) : 240) + 28, x = 480 - w / 2, y = 10;
    c.fillStyle = 'rgba(5,6,10,0.78)'; c.fillRect(x, y, w, 30); c.strokeStyle = LEVEL_COL[lv]; c.globalAlpha = a * pulse; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, 28);
    c.globalAlpha = a; tag(txt, 480, y + 7, LEVEL_COL[lv], 'center', 3);
    tag(profileOf(gm.f[1]).tag + ' STYLE', 480, y + 36, '#c9a24a', 'center', 2);
    c.restore();
  });

  // ======================================================================
  // Public API (tests and other features)
  // ======================================================================
  const api = window.CPU2 = {
    enabled: true,
    levels: [null, null],           // per side override of the skill: a level name or a number 0..1; null = game.cpuLevel (the SETTINGS difficulty)
    PROFILES, TABLE, ANCHORS: ANCH, NAMES,
    params, skillOf, levelName, profileOf, reads,
    habits: side => Object.assign({}, HAB[side]),
    intent: side => (game.f && game.f[side] && game.f[side].cpu2 && game.f[side].cpu2.label) || '',
    reset() { HAB = [freshHab(), freshHab()]; LEARN = [{ jumpHits: 0 }, { jumpHits: 0 }]; HIST[0].length = HIST[1].length = 0; },
  };
})();
