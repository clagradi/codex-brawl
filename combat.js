'use strict';
// Combat depth. Owner: the combat feature (branch feat/combat). Everything here wraps Fighter.prototype and the extension layer
// (BUS, HOOKS) so game.js stays untouched: hit states, high/low/overhead guard rules, counter and punish hits, the 3-bar meter
// (EX specials, combo breaker, taunt), per-fighter overheads and target combos, and the CPU use of all of it.
// Notes for readers: docs/features/combat.md has the player-facing summary; docs/ARCHITECTURE.md lists the hooks and events used here.
(() => {
  window.STUB_COMBAT = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
  if (typeof Fighter === 'undefined' || typeof HOOKS === 'undefined' || typeof BUS === 'undefined') return;

  const P = Fighter.prototype;
  const BAR = 100 / 3, BREAKER_CD = 180, TAUNT_LEN = 72, HARD_EXTRA = 24, WALL_ZONE = 40;
  const diffName = () => { try { return SETTINGS.get('difficulty'); } catch (e) { return 'normal'; } };

  // ---------- data ----------
  // standing overhead (FWD + K): name, damage, startup ticks. Slow on purpose so it can be reacted to; it must be blocked standing.
  const OVH = {
    tibo: ['MERGE HAMMER', 9, 16], poteto: ['MASHER SMASH', 10, 18], dot: ['DOT DROP', 8, 14], wang: ['SCALING LAW', 9, 16], muse: ['FLUFF SLAM', 8, 15],
  };
  // target combos: [string of normals, name]. The first letter is the plain normal, every later letter is a node built below.
  const TCS = {
    tibo: [['KKP', 'HOTFIX CHAIN'], ['PKK', 'ROLLBACK']],
    poteto: [['KPP', 'DOUBLE MASH'], ['PKP', 'FRY CYCLE']],
    dot: [['KKK', 'DOT DASH'], ['KPK', 'ROUND TRIP']],
    wang: [['KKPK', 'SCALING PLAN'], ['PKPP', 'LAB RETREAT']],
    muse: [['KPKP', 'FLUFF FLURRY'], ['PKKK', 'PAW SHUFFLE']],
  };
  // specials with a height or a state of their own (index into MOVES[id].sp): low = block crouching, crumple = always crumples
  const SPEC = { tibo: { 2: { low: 1, crumple: 1 } }, poteto: { 2: { crumple: 1 } }, dot: { 2: { crumple: 1 } }, wang: { 2: { crumple: 1 } }, muse: { 2: { crumple: 1 } } };
  const TAUNTS = { tibo: 'RATE LIMIT? NOT TODAY.', poteto: 'THAT TAKE WAS WELL DONE.', dot: 'DOT. DOT. DOT.', wang: 'LET ME SCALE THAT FOR YOU.', muse: 'REQUEST QUEUED. AND DENIED.' };
  // look of each hit state: word, colour, sparks, extra hitstop and shake, beep pitch
  const STY = {
    launch: { w: '', c: '#7cc7ff', n: 10, hs: 2, sh: 2, f: 700 },
    crumple: { w: 'CRUMPLE', c: '#ff9a3c', n: 14, hs: 5, sh: 6, f: 180 },
    stagger: { w: 'STAGGER', c: '#c8a2ff', n: 12, hs: 4, sh: 4, f: 330 },
    bounce: { w: 'BOUNCE', c: '#6be675', n: 14, hs: 5, sh: 8, f: 260 },
    wall: { w: 'WALL SPLAT', c: '#ff6b6b', n: 18, hs: 7, sh: 10, f: 150 },
    hard: { w: 'HARD DOWN', c: '#ff4d6d', n: 16, hs: 6, sh: 9, f: 110 },
  };

  // ---------- per-fighter state ----------
  const fresh = () => ({ landT: -99, crouch: false, dPrev: false, dT1: -99, dT2: -99, ovhReq: 0, exReq: 0, ex: false, arm: 0, brk: 0, taunt: 0, crumple: 0, stag: 0, hard: 0, hardT: 0, used: {}, flashT: 0, flashCol: '#ff4d4d' });
  const cx = f => f.cb || (f.cb = fresh());
  const bars = f => Math.min(3, Math.floor(((+f.meter || 0) + 0.001) / BAR));
  const pathOf = f => { const k = f.atk; if (k === 'punch') return 'P'; if (k === 'kick') return 'K'; return k && k.startsWith('tc_') ? k.split('_')[2] : null; };

  // floating words (hit states, counter, punish, guard flash, EX, speech): drawn in world space, pruned by age
  const words = [];
  function word(x, y, txt, col, size, max) {
    if (!txt) return;
    words.push({ x, y, txt, col, size: size || 22, max: max || 44, born: game.tick });
    if (words.length > 24) words.shift();
  }

  // ---------- build the attack tables once ----------
  function setup() {
    ATK.low.hl = 'low'; ATK.sweep.hl = 'low'; ATK.sweep.hard = true; ATK.airp.hl = 'ovh'; ATK.airk.hl = 'ovh';
    for (const id of Object.keys(OVH)) {
      const [, dmg, hit] = OVH[id];
      ATK['ovh_' + id] = { row: 'kick', st: 'kick', len: hit + 17, hit, frames: [Math.ceil(hit * 0.4), Math.floor(hit * 0.6), 5, 6, 6], box: [10, 84, -170, -50], dmg, kb: 4, stun: 24, kind: 'kick', hl: 'ovh', tag: 'OVERHEAD' };
    }
    for (const id of Object.keys(TCS)) {
      const map = TCN[id] = {};
      for (const [s, nm] of TCS[id]) for (let n = 2; n <= s.length; n++) {
        const path = s.slice(0, n), key = 'tc_' + id + '_' + path, L = path[n - 1], last = n === s.length;
        map[path] = key;
        if (ATK[key]) continue;
        const base = !last ? (L === 'P' ? ATK.punch2 : ATK.kick) : (L === 'P' ? ATK.punch3 : ATK.kick);
        const A = Object.assign({}, base, { chain: undefined, box: [base.box[0], base.box[1] + 10, base.box[2], base.box[3]] });   // a little more reach: a string steps in
        if (!last) { A.dmg = Math.max(4, base.dmg - 0.5); A.stun = 18; A.kb = Math.min(base.kb, 3); }   // gentle push: the next node still reaches
        else { A.tag = nm; A.dmg = 9; if (L === 'P') A.launch = true; else { A.knock = true; A.kb = 6; A.kind = 'kick'; } }
        ATK[key] = A;
      }
    }
    for (const id of Object.keys(MOVES)) {
      const M = MOVES[id], flags = SPEC[id] || {};
      (M.sp || []).forEach((mv, k) => {
        if (flags[k]) { mv.cbLow = !!flags[k].low; mv.cbCrumple = !!flags[k].crumple; }
        wrapFire(mv, k);
      });
    }
  }
  const TCN = {};   // fighter id -> { path: attack key }

  // ---------- EX shots: the shot carries its tag, EX specials with a projectile throw a second one ----------
  function wrapFire(mv, idx) {
    if (!mv || mv.cbWrapped || typeof mv.fire !== 'function') return;
    mv.cbWrapped = 1;
    const fire = mv.fire;
    mv.fire = function (self, opp) {
      const n0 = game.proj.length, c = cx(self), ex = c.ex;
      fire.call(mv, self, opp);
      tagShots(self, n0, mv, ex);
      if (ex && idx === 0 && game.proj.length > n0) {
        game.later(9, () => {
          if (game.phase !== 'fight' || self.state !== 'special' || self.hp <= 0) return;
          const n1 = game.proj.length;
          try { fire.call(mv, self, opp); } catch (e) { return; }
          tagShots(self, n1, mv, true);
        });
      }
    };
  }
  function tagShots(self, from, mv, ex) {
    for (let k = from; k < game.proj.length; k++) {
      const p = game.proj[k];
      if (p.owner !== self) continue;
      p.cb = { ex, low: !!mv.cbLow, crumple: !!mv.cbCrumple };
      if (ex) { p.dmg *= 1.35; p.kb *= 1.1; }
    }
  }

  // ---------- helpers ----------
  // which part of its own move the fighter is in: 'active' (startup through the hit tick, counter hit) or 'recovery' (punish)
  function windowOf(v, vc) {
    if (v.state === 'win' && vc.taunt > 0) return 'recovery';
    if (v.state !== 'punch' && v.state !== 'kick' && v.state !== 'special' && v.state !== 'super') return null;
    const hitTick = v.mv ? Math.max(1, v.mv.hit) : (v.curAtk() || {}).hit;
    if (hitTick == null) return null;
    if (v.st <= hitTick + 3) return 'active';
    return vc.landT >= v.t - v.st ? null : 'recovery';   // recovery after a whiff or a block; a move that landed is no punish
  }
  function hlOf(f) {
    const A = f.curAtk(); if (A) return A.hl || (A.air ? 'ovh' : 'mid');
    if (f.mv && f.mv.cbLow) return 'low';
    if (!f.onGround && f.state === 'jump') return 'ovh';
    return 'mid';
  }
  function nearestShot(src, v) {
    let best = null, bd = 1e9;
    for (const p of game.proj) { if (p.owner !== src) continue; const d = Math.abs(p.x - v.x); if (d < bd && d < (p.r || 20) + 60) { bd = d; best = p; } }
    return best;
  }
  function classify(src, v, kind, opt, sc) {
    const o = opt || {};
    const I = { src, victim: v, kind: kind || 'hit', raw: 0, hl: 'mid', sp: false, ex: false, proj: null, counter: false, punish: false, arm: false, state: null, guard: false, wrong: null, crumple: false, hardKD: false, exLaunch: false, isAirK: opt === ATK.airk };
    if (o.hl) I.hl = o.hl; else if (o.air) I.hl = 'ovh';
    if (!opt) {   // specials and shots call takeHit without options
      const p = nearestShot(src, v);
      if (p) { I.sp = true; I.proj = p; if (p.cb) { I.ex = !!p.cb.ex; if (p.cb.low) I.hl = 'low'; I.crumple = !!p.cb.crumple; } }
      else if (src.mv && (src.state === 'special' || src.state === 'super')) { I.sp = true; I.ex = !!sc.ex && src.state === 'special'; if (src.mv.cbLow) I.hl = 'low'; if (src.mv.cbCrumple) I.crumple = true; }
      else if (kind === 'super') I.sp = true;
    }
    if (o.knock && (o.hard || (o.unblock && o.force))) I.hardKD = true;
    return I;
  }

  // ---------- takeHit: guard heights, counter and punish, hit states, EX armour ----------
  let cur = null;   // the hit being resolved, read by the damage filter and the hit handler
  const takeHit0 = P.takeHit;
  P.takeHit = function (src, dmg, kb, stun, kind, opt) {
    const v = this;
    if (!src || src === v || game.phase !== 'fight' || v.state === 'ko' || v.state === 'dizzy' || (!(opt && opt.force) && (v.inv > 0 || v.state === 'down' || v.state === 'grabbed')))
      return takeHit0.apply(v, arguments);
    const sc = cx(src), vc = cx(v);
    const reeling = v.state === 'hurt' || v.state === 'hit' || v.state === 'down' || v.state === 'grabbed' || !v.onGround;
    if (!(src.lastHitT && v.t - src.lastHitT < 70 && reeling)) sc.used = {};   // a new combo: every hit state is available again
    const I = classify(src, v, kind, opt, sc);
    let o2 = opt || {};
    I.arm = !!(vc.ex && vc.arm > 0 && v.state === 'special' && v.mv && v.st <= Math.max(1, v.mv.hit) + 3 && !o2.force);
    const facingSrc = (src.x > v.x) === (v.face > 0);
    const canGuard = !o2.unblock && (v.state === 'block' || (v.back && v.onGround && !v.busy())) && facingSrc;
    if (canGuard) { if (I.hl === 'low' && !vc.crouch) I.wrong = 'LOW'; else if (I.hl === 'ovh' && vc.crouch) I.wrong = 'HIGH'; }
    I.guard = canGuard && !I.wrong;
    if (I.wrong) o2 = Object.assign({}, o2, { unblock: true });   // wrong guard height: the hit lands as if unblocked
    if (!I.guard && !I.arm) { const w = windowOf(v, vc); if (w === 'active') I.counter = true; else if (w === 'recovery') I.punish = true; }
    if (!I.guard) {
      const U = sc.used, heavy = (+dmg || 0) >= 7, dir = v.x < src.x ? -1 : 1;
      I.raw = +dmg || 0;
      if (o2.launch && U.launch) o2 = Object.assign({}, o2, { launch: false, tag: undefined });   // one launch per combo
      if (o2.launch) { I.state = 'launch'; U.launch = 1; }
      else if (I.isAirK && !v.onGround && GROUND - v.y < 100 && !U.bounce) { I.state = 'bounce'; U.bounce = 1; }
      else if (heavy && !o2.knock && !U.wall && ((v.x <= 46 + WALL_ZONE && dir < 0) || (v.x >= W - 46 - WALL_ZONE && dir > 0))) { I.state = 'wall'; U.wall = 1; }
      else if (I.counter && I.hl === 'ovh' && !U.stagger && v.onGround) { I.state = 'stagger'; U.stagger = 1; }
      else if ((I.crumple || (I.counter && heavy && !o2.knock)) && !U.crumple && v.onGround) { I.state = 'crumple'; U.crumple = 1; }
      else if (I.ex && I.sp && !I.proj && !U.launch && !o2.knock) { I.state = 'launch'; I.exLaunch = true; U.launch = 1; }
      else if (o2.knock && I.hardKD) I.state = 'hard';
    }
    const snap = I.arm ? { state: v.state, st: v.st, hitDone: v.hitDone, atk: v.atk, air: v.air, contact: v.contact, mv: v.mv, bufP: v.bufP, bufK: v.bufK, bufS: v.bufS, vx: v.vx, vy: v.vy, stun: v.stun, lie: v.lie } : null;
    cur = I;
    try { takeHit0.call(v, src, dmg, kb, stun, kind, o2); } finally { cur = null; }
    if (I.arm) { Object.assign(v, snap); vc.arm = 0; word(v.x, v.y - 255, 'ARMOUR', '#7ef0ff', 20, 36); FX.sparks(v.x, v.y - 100, '#7ef0ff', 10); return; }
    if (I.guard) return;
    if (I.wrong) { vc.flashT = game.tick + 10; vc.flashCol = 'rgba(255,60,60,0.55)'; word(v.x, v.y - 255, I.wrong, '#ff5a5a', 28, 40); FX.sparks(v.x + v.face * 24, v.y - 100, '#ff5a5a', 10); beep(240, 0.08, 'square', 0.05); }
    sc.landT = src.t; vc.crumple = vc.stag = 0; vc.hard = 0;
    if (v.state === 'ko' || v.hp <= 0) return;
    if (I.state) applyState(I, v, src);
    if (I.counter) { word(v.x, v.y - 282, 'COUNTER!', '#ffd23f', 26, 46); FX.sparks(v.x, v.y - 110, '#ffd23f', 10); game.hitstop = Math.max(game.hitstop, 8); beep(520, 0.07, 'square', 0.05); }
    else if (I.punish) { word(v.x, v.y - 282, 'PUNISH!', '#7cf0ff', 26, 46); FX.sparks(v.x, v.y - 110, '#7cf0ff', 10); src.meter = Math.min(100, src.meter + 12); game.hitstop = Math.max(game.hitstop, 6); beep(640, 0.07, 'square', 0.05); }
  };

  function applyState(I, v, src) {
    const s = I.state, vc = cx(v), dir = v.x < src.x ? -1 : 1, S = STY[s];
    if (s === 'bounce') { v.vy = -11; v.vx = dir * 2.5; v.stun = Math.max(v.stun, 34); FX.dust(v.x, GROUND); }
    else if (s === 'wall') { v.vx = -dir * 8; v.vy = Math.min(v.vy, -6); v.stun = Math.max(v.stun, 34); FX.dust(v.x, GROUND); }
    else if (s === 'stagger' && v.state === 'hurt') { v.vx = 0; v.stun = 44; vc.stag = 44; vc.crumple = 0; }
    else if (s === 'crumple' && v.state === 'hurt') { v.vx = dir * 1.2; v.stun = 56; vc.crumple = 56; vc.stag = 0; }
    else if (s === 'hard' && v.state === 'down') { vc.hard = HARD_EXTRA; vc.hardT = 0; }
    else if (s === 'launch' && I.exLaunch) v.vy = -9.5;
    if (S) {
      word(v.x, v.y - 250, S.w, S.c, 24, 46);
      FX.sparks(v.x - dir * 14, v.y - 105, S.c, S.n);
      game.hitstop = Math.max(game.hitstop, S.hs); game.shake = Math.max(game.shake, S.sh); beep(S.f, 0.09, 'square', 0.05);
    }
    BUS.emit('hitstate', { src, victim: v, state: s });
  }

  // damage filter: counter hits, EX melee, armour and chip on blocked specials and supers
  HOOKS.add('damage', pl => {
    const I = cur; if (!I || pl.victim !== I.victim || pl.src !== I.src) return;
    if (pl.guarding) {
      if (I.sp || pl.kind === 'super') pl.dmg = Math.max(pl.dmg * (I.ex ? 1.7 : 1.4), 7);   // the guard multiplier then leaves at least a point of chip
      return pl;
    }
    let m = 1;
    if (I.counter) { m *= 1.25; pl.stun += 6; }
    if (I.ex && I.sp && !I.proj) m *= 1.35;   // an EX shot carries its bonus from the moment it is fired
    if (I.arm) m *= 0.6;
    pl.dmg *= m;
    return pl;
  }, 5);

  // the hit event gets the combat flags (handlers registered after this file see them)
  BUS.on('hit', pl => {
    const I = cur; if (!I || pl.src !== I.src || pl.victim !== I.victim) return;
    pl.counter = !!I.counter; pl.punish = !!I.punish; pl.hl = I.hl; pl.state = I.state; if (I.ex) pl.ex = true; if (I.arm) pl.armour = true;
  });
  BUS.on('block', pl => { const I = cur; if (I && pl.src === I.src && pl.victim === I.victim) pl.hl = I.hl; });

  // ---------- moves: overhead remap, target combos, EX payment ----------
  const startAtk0 = P.startAtk;
  P.startAtk = function (key) {
    const c = cx(this), ov = 'ovh_' + this.d.id;
    if (key === 'kick' && c.ovhReq > 0 && this.onGround && (this.state === 'idle' || this.state === 'walk' || this.state === 'dash') && ATK[ov]) { key = ov; c.ovhReq = 0; }
    return startAtk0.call(this, key);
  };
  const tryCancel0 = P.tryCancel;
  P.tryCancel = function (o, i, A, fwd) {
    if (this.cancelOpen && !(this.bufS > 0 && this.cool <= 0 && this.onGround)) {   // a special cancel keeps priority over the strings
      const p = pathOf(this), map = TCN[this.d.id];
      if (p && map) {
        const nx = this.bufP > 0 && map[p + 'P'] ? map[p + 'P'] : this.bufK > 0 && map[p + 'K'] ? map[p + 'K'] : null;
        if (nx) { this.bufP = this.bufK = 0; this.startAtk(nx); this.vx = this.face * 4.5; return true; }
      }
    }
    return tryCancel0.apply(this, arguments);
  };
  const startMove0 = P.startMove;
  P.startMove = function (mv, kind, o) {
    const c = cx(this);
    c.ex = false;
    if (mv && kind === 'special' && c.exReq > 0 && bars(this) >= 1) {
      c.exReq = 0; this.meter = Math.max(0, this.meter - BAR); c.ex = true; c.arm = 1;
      word(this.x, this.y - 255, 'EX', '#7ef0ff', 26, 40); FX.sparks(this.x, this.y - 100, '#7ef0ff', 14); beep(760, 0.1, 'sawtooth', 0.06);
      BUS.emit('ex', { fighter: this, foe: o, move: mv });
    } else if (kind !== 'special') c.exReq = 0;
    return startMove0.call(this, mv, kind, o);
  };
  const reset0 = P.reset;
  P.reset = function () { reset0.apply(this, arguments); this.cb = fresh(); };
  const frame0 = P.frame;
  P.frame = function () {
    const c = this.cb;
    if (c && this.state === 'hurt') {
      if (c.crumple > 0) return ['hit', this.st < 8 ? 1 : 2];   // knees giving way
      if (c.stag > 0) return ['hit', [0, 1, 0, 2][Math.floor(this.t / 6) % 4]];   // wobbling
    }
    return frame0.call(this);
  };

  // ---------- breaker and taunt ----------
  function doBreaker(f, o) {
    const c = cx(f), combo = o.combo;
    f.meter = Math.max(0, f.meter - 2 * BAR); c.brk = BREAKER_CD; c.crumple = c.stag = 0;
    o.combo = 0; o.lastHitT = -999;   // the string is over
    f.set(f.onGround ? 'idle' : 'jump'); f.stun = 0; f.inv = Math.max(f.inv, 24); f.cool = Math.max(f.cool, 10); f.vx = 0;
    const away = o.x < f.x ? -1 : 1;
    if (o.state !== 'ko') { o.set('hurt'); o.stun = 16; o.vx = away * 11; o.vy = Math.min(o.vy, o.onGround ? 0 : -3); o.inv = Math.max(o.inv, 16); }
    game.flash = Math.max(game.flash, 10); game.hitstop = Math.max(game.hitstop, 8); game.shake = Math.max(game.shake, 10);
    FX.sparks(f.x, f.y - 100, '#7ef0ff', 20); FX.dust(f.x, GROUND); beep(900, 0.18, 'sawtooth', 0.07);
    word(f.x, f.y - 255, 'BREAKER!', '#7ef0ff', 30, 50);
    BUS.emit('breaker', { fighter: f, foe: o, combo });
  }
  function startTaunt(f, o) {
    const c = cx(f);
    f.set('win'); f.vx = 0; c.taunt = TAUNT_LEN; f.meter = Math.min(100, f.meter + 15);
    word(f.x, f.y - 235, TAUNTS[f.d.id] || '...', '#ffffff', 16, TAUNT_LEN);
    beep(330, 0.12, 'triangle', 0.05);
    BUS.emit('taunt', { fighter: f, foe: o });
  }

  // ---------- CPU: strings after a landed hit; at hard also overheads, lows, EX, height reading and breakers ----------
  function cpuBrain(f, o, i, c) {
    const diff = diffName(), oc = cx(o), dist = Math.abs(o.x - f.x), fw = f.face > 0 ? 'r' : 'l', bk = f.face > 0 ? 'l' : 'r';
    const A = f.curAtk(), path = pathOf(f);
    if (A && path && f.contact && f.st === A.hit && !A.air && !i.s && diff !== 'easy') {   // a landed normal: keep going along one of this fighter's target combos
      const cand = (TCS[f.d.id] || []).filter(t => t[0].startsWith(path) && t[0].length > path.length);
      if (cand.length && Math.random() < (diff === 'hard' ? 0.85 : 0.5)) { const L = cand[Math.floor(Math.random() * cand.length)][0][path.length]; i.p = L === 'P'; i.k = L === 'K'; }
    }
    if (diff !== 'hard') return;
    const idle = !f.busy();
    if (idle && i.k && !i.p && !i.d && !i.s && dist >= 40 && dist <= 110 && ATK['ovh_' + f.d.id] && Math.random() < (oc.crouch ? 0.6 : 0.1)) i[fw] = true;   // overhead against a crouching guard
    else if (idle && (i.p || i.k) && !i.d && !i.s && dist <= 110 && o.state === 'block' && !oc.crouch && Math.random() < 0.5) i.d = true;   // low against a standing guard
    if (i.s && bars(f) >= 1 && Math.random() < 0.5) c.exReq = 8;
    if (i.d && !i.p && !i.k && !i.s && !i.x && !i.u && hlOf(o) === 'ovh') { i.d = false; i[bk] = true; }   // read the overhead: guard standing
    if (f.state === 'hurt' && f.st >= 5 && o.combo >= 3 && bars(f) >= 2 && c.brk <= 0 && Math.random() < 0.1) doBreaker(f, o);
  }

  // ---------- input: crouch tracking, EX request, overhead request, breaker, taunt ----------
  HOOKS.add('input', (i, side, f) => {
    if (!i || !f) return;
    const c = cx(f);
    if (c.brk > 0) c.brk--; if (c.exReq > 0) c.exReq--; if (c.ovhReq > 0) c.ovhReq--;
    const o = game.f[1 - side];
    if (!o || game.phase !== 'fight') return;
    if (f.cpu) cpuBrain(f, o, i, c);
    const fwdHeld = f.face > 0 ? i.r : i.l, backHeld = f.face > 0 ? i.l && !i.r : i.r && !i.l;
    c.crouch = !!i.d;
    if (i.d && !c.dPrev) { c.dT2 = c.dT1; c.dT1 = f.t; }
    c.dPrev = !!i.d;
    if (i.s && !f.cpu && (i.x || held(side, 'x')) && bars(f) >= 1) { c.exReq = 8; i.x = false; }   // hold super + press special
    if (i.k && fwdHeld && !i.d && !i.p && !i.x && !i.s) c.ovhReq = 8;   // FWD + K from neutral
    if (i.x && !f.cpu) {
      if (f.state === 'hurt' && backHeld && c.brk <= 0 && bars(f) >= 2 && o.combo >= 1) { doBreaker(f, o); i.x = false; }
      else if (i.d && c.dT1 > c.dT2 && f.t - c.dT2 <= 30 && bars(f) < 1 && f.onGround && (f.state === 'idle' || f.state === 'walk' || f.state === 'block')) { startTaunt(f, o); i.x = false; }
    }
    return i;
  });

  // ---------- per-tick upkeep ----------
  HOOKS.add('fighterUpdate', (a, b) => {
    for (const f of [a, b]) {
      const c = cx(f);
      if (c.taunt > 0) { if (f.state !== 'win') c.taunt = 0; else if (--c.taunt <= 0) { f.set('idle'); f.cool = Math.max(f.cool, 6); } }
      if (c.crumple > 0) { if (f.state !== 'hurt') c.crumple = 0; else { c.crumple--; f.vx *= 0.9; } }
      if (c.stag > 0) { if (f.state !== 'hurt') c.stag = 0; else { c.stag--; f.x = Math.max(46, Math.min(W - 46, f.x + (f.t % 6 < 3 ? 0.9 : -0.9))); } }
      if (c.hard > 0) { if (f.state !== 'down') c.hard = 0; else if (f.onGround && f.lie >= 20 && c.hardT < c.hard) { f.lie = 19; c.hardT++; } }   // hard knockdown: stays flat longer
      if (c.ex && f.state !== 'special') { c.ex = false; c.arm = 0; }
    }
    for (let k = words.length - 1; k >= 0; k--) if (game.tick - words[k].born > words[k].max) words.splice(k, 1);
  });
  BUS.on('round:start', () => { words.length = 0; });
  BUS.on('match:start', () => { words.length = 0; });

  // ---------- move lists ----------
  const moveRows0 = window.moveRows;
  // the extra rows (overhead, target combos) show on the pause screen only: the select panels have no room for them
  if (typeof moveRows0 === 'function') window.moveRows = function (id, side, cpu) {
    const rows = moveRows0(id, side, cpu), M = MOVES[id], room = game.phase !== 'select', L = cpu ? { s: 'SP', x: 'SU', p: 'P', k: 'K' } : LABEL[side], out = [];
    const finRow = rows.find(r => M.fin && r.name === M.fin.name && r.col === '#ff6b5c');
    for (const r of rows) {
      if (room && r === finRow) continue;
      const mv = (M.sp || []).find(m => m.name === r.name);
      const row = (mv && mv.cbLow) || (r.name === 'SWEEP' && !r.note) ? Object.assign({}, r, { note: 'LOW' }) : r;   // lows are blocked crouching
      if (room && r.name === M.su.name && finRow) out.push(Object.assign({}, row, { note: 'FIN ' + M.fin.name }));
      else out.push(row);
      if (room && r.name === 'SWEEP' && OVH[id]) out.push({ input: 'FWD + ' + L.k, name: OVH[id][0], note: 'OVERHEAD' });
      if (room && r.name === M.air.name) for (const [s, nm] of TCS[id] || []) out.push({ input: [...s].map(ch => ch === 'P' ? L.p : L.k).join('>'), name: nm });
    }
    return out;
  };

  // ---------- drawing ----------
  HOOKS.add('drawFighter', (c, f) => {
    const s = f.cb; if (!s || f.hidden) return;
    if (s.flashT > game.tick) { c.save(); c.fillStyle = s.flashCol; c.fillRect(f.x - 36, f.y - 165, 72, 165); c.restore(); }   // wrong guard height
    if (s.ex && f.state === 'special') { c.save(); c.strokeStyle = 'rgba(126,240,255,' + (0.5 + 0.3 * Math.sin(game.tick / 3)) + ')'; c.lineWidth = 3; c.strokeRect(f.x - 44, f.y - 175, 88, 178); c.restore(); }
    if (s.stag > 0 || s.crumple > 0) { c.save(); c.fillStyle = s.stag > 0 ? 'rgba(200,162,255,0.18)' : 'rgba(255,154,60,0.18)'; c.fillRect(f.x - 36, f.y - 165, 72, 165); c.restore(); }
  });
  HOOKS.add('drawWorld', (c, g) => {
    for (const w of words) {
      const age = g.tick - w.born; if (age < 0 || age > w.max) continue;
      uiText(w.txt, w.x, w.y - age * 0.6, w.size, w.col, 'center', age > w.max - 10 ? (w.max - age) / 10 : 1);
    }
  });
  HOOKS.add('drawHud', (c, g) => {
    if (!g.f || !g.f[0] || !g.f[1]) return;
    for (let s = 0; s < 2; s++) {
      const f = g.f[s], o = g.f[1 - s], n = bars(f), left = s === 0, x = left ? 332 : W - 332, al = left ? 'left' : 'right';
      uiText(n + (n === 1 ? ' BAR' : ' BARS'), x, H - 26, 13, n >= 3 ? '#ffd23f' : n >= 1 ? '#9fe8ff' : '#7f8aa0', al, 0.95);
      if (g.phase === 'fight' && f.state === 'hurt' && n >= 2 && cx(f).brk <= 0 && o.combo >= 2 && g.tick % 24 < 16)
        uiText('BREAK! BACK + SU', left ? 24 : W - 24, H - 62, 18, '#7ef0ff', left ? 'left' : 'right', 1);
    }
  });
  HOOKS.add('drawTop', (c, g) => {
    if (g.phase === 'pause') {
      const scr = typeof OPTIONS !== 'undefined' ? OPTIONS.screen : 'moves', y = scr === 'moves' ? 457 : 417;   // the options pause menu has a gap under its rows (defense.js has the first two lines of it, these the next two); its other screens have no room
      if (scr && scr !== 'moves') return;
      uiText('FWD + K OVERHEAD (GUARD STANDING) · DOWN + P/K ARE LOWS (GUARD CROUCHING) · JUMP ATTACKS ARE OVERHEADS', W / 2, y + 17, 12, '#aab');
      uiText('HOLD SU + SP = EX SPECIAL, 1 BAR (PAD RB + X) · BACK + SU WHILE HIT = BREAKER, 2 BARS · DOWN, DOWN + SU = TAUNT', W / 2, y, 12, '#aab');
    } else if (g.phase === 'fight' && g.round === 1 && g.clock >= 340 && g.clock < 700 && !(g.f[0].cpu && g.f[1].cpu))
      uiText('FWD+K OVERHEAD · HOLD SU+SP EX · BACK+SU IN HITSTUN BREAKER · 3 BARS = SUPER', W / 2, H - 18, 14, '#fff', 'center', Math.min(1, (700 - g.clock) / 60, (g.clock - 340) / 30));
  });

  setup();
})();
