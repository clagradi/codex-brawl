// ===== AGENT BRAWL feature file: DEFENSE (second batch, x-defense). Loaded after touch.js (see docs/ARCHITECTURE.md and docs/features/x-defense.md). =====
// Owner: the x-defense agent. Only that agent edits this file, tools/tests/x-defense.mjs and docs/features/x-defense.md.
// Area: defensive options that make it feel like a real fighter. Perfect guard (tap back as a hit lands), a short blockstun, guard pushback,
// quick rise, tech roll and stay-down when knocked down, air recovery and a wake-up reversal.
// Hooks used:
//   HOOKS 'update' (tick clock, effect timers), 'input' (back-press edge, blockstun lock, pushback, knockdown options, air recovery, wake-up reversal, CPU choices),
//   'damage' (perfect guard: no chip, a 4 tick stun), 'fighterUpdate' (roll bookkeeping), 'drawFighter' (the roll sprite), 'drawWorld' (rings, texts),
//   'drawHud' (round 1 hint strip), 'drawTop' (blue flash, pause panel).
//   BUS 'block' 'hit' 'match:start' 'round:start' (listens), 'defense:perfect' 'defense:pushback' 'defense:rise' 'defense:roll' 'defense:air' 'defense:reversal' (emits).
//   SETTINGS 'difficulty' is read for the CPU. No other file is edited; there is no setting of its own: DEFENSE.on = false switches the whole feature off.
// Integration notes (combat.js brings a three-bar meter, its own blockstun and hard knockdowns): DEFENSE.meter() finds the meter size and bars, DEFENSE.ownBlockstun = false
// hands the blockstun to combat.js, and a fighter with f.noTech = true cannot rise or roll. The 'damage' payload stun is lowered to 4 on a perfect guard for combat.js to read.
'use strict';
(() => {
  const WIN = 4, LOCK = 10, PG_STUN = 4, PG_METER = 0.06;           // perfect guard: ticks before the hit, anti-mash lockout between presses, blockstun, meter reward (share of the bar)
  const RISE_WIN = 10, STAY_EXTRA = 20, ROLL_LEN = 14, PUSH_INV = 12, PUSH_LOCK = 8, PUSH_RANGE = 240;
  const AIR_AFTER = 30, WAKE_INV = 6, PRE = 3;                              // air recovery: juggle ticks before the escape opens; wake-up reversal: invulnerable ticks
  const mk = () => ({ pre: -99, bk: false, edgeN: -99, edgeOk: false, bstun: 0, inDown: false, used: false, stay: false, plan: null, rollT: 0, rollDir: 0, air: 0, airDone: false, wasDown: false });
  const REC = [mk(), mk()];
  const S = { n: 0, fx: [], flash: 0, pg: null, stun: 0 };
  const COUNT = { perfect: 0, push: 0, rise: 0, roll: 0, stay: 0, air: 0, reversal: 0 };

  // meter size, number of bars and the price of one pushback; combat.js (three bars) is found when it exposes COMBAT, otherwise the bar is the plain 100 and the price is half of it
  function meterInfo() {
    const C = (typeof COMBAT !== 'undefined' && COMBAT) || window.COMBAT || {};
    const max = Number(C.meterMax || C.METER_MAX || (typeof METER_MAX !== 'undefined' && METER_MAX)) || 100;
    const bars = Number(C.bars || C.BARS || C.meterBars || (typeof METER_BARS !== 'undefined' && METER_BARS)) || 1;
    return { max, bars, cost: bars > 1 ? max / bars : max / 2 };
  }
  const D = window.DEFENSE = { on: true, ownBlockstun: true, rec: REC, state: S, count: COUNT, meter: meterInfo, WIN, RISE_WIN, STAY_EXTRA, PG_STUN, reset: () => reset(), rates: () => ({ pg: pgRate(), rise: riseRate() }) };

  const diff = () => { try { return SETTINGS.get('difficulty'); } catch (e) { return 'normal'; } };
  const pgRate = () => ({ easy: 0.06, normal: 0.16, hard: 0.3 }[diff()] ?? 0.16) * (0.7 + 0.6 * (game.cpuLevel || 0.5));   // CPU perfect guard chance per blocked hit
  const riseRate = () => ({ easy: 0.12, normal: 0.3, hard: 0.55 }[diff()] ?? 0.3);                                       // CPU quick rise chance per knockdown
  const strip = i => { i.p = i.k = i.s = i.x = i.u = false; i.dash = 0; };
  const say = (f, txt, col = '#9fd3ff') => S.fx.push({ k: 'txt', x: f.x, y: f.y - 215, t: 0, life: 34, txt, col });
  const ring = (x, y, col, r0, dr, life = 16) => S.fx.push({ k: 'ring', x, y, t: 0, life, col, r0, dr });
  const bstunFor = (stun, kind) => kind === 'super' ? 16 : Math.max(6, Math.min(14, Math.round((stun || 14) * 0.55)));   // the engine has no blockstun: a share of the hit's own stun

  function perfect(v, src, kind) {
    const r = REC[v.side], mi = D.meter();
    r.bstun = PG_STUN; v.meter = Math.min(mi.max, v.meter + mi.max * PG_METER);
    game.hitstop = Math.max(game.hitstop, 9); S.flash = 12;
    if (src) src.vx = (src.x < v.x ? -1 : 1) * 4;
    const x = v.x + v.face * 30, y = v.y - 100;
    FX.sparks(x, y, '#7ec8ff', 14); ring(x, y, '#9fd3ff', 8, 5, 18); ring(x, y, '#ffffff', 4, 9, 12); say(v, 'PERFECT GUARD', '#9fd3ff');
    beep(1320, 0.07, 'sine', 0.07, 1); game.later(4, () => beep(1760, 0.14, 'sine', 0.06, 1));
    COUNT.perfect++; BUS.emit('defense:perfect', { victim: v, src, kind });
  }

  // ---- 'damage': a guarded hit whose victim pressed back in the last WIN ticks (human) or won the CPU roll becomes a perfect guard ----
  HOOKS.add('damage', pl => {
    if (!D.on || !pl || !pl.guarding || !pl.victim) return;
    const v = pl.victim, r = REC[v.side];
    S.stun = pl.stun;
    const pg = v.cpu ? Math.random() < pgRate() : r.bk && r.edgeOk && S.n - r.edgeN <= WIN && v.onGround;
    if (!pg) return;
    pl.dmg = 0; pl.kb = Math.min(pl.kb, 1); pl.stun = Math.min(pl.stun, PG_STUN);   // no chip, no pushback, the stun a combat blockstun would read
    S.pg = { victim: v, n: S.n };
  }, 50);

  BUS.on('block', e => {
    if (!D.on || !e || !e.victim) return;
    const v = e.victim, r = REC[v.side];
    if (S.pg && S.pg.victim === v && S.pg.n === S.n) { S.pg = null; perfect(v, e.src, e.kind); return; }
    if (D.ownBlockstun) r.bstun = Math.max(r.bstun, bstunFor(S.stun, e.kind));
  });
  BUS.on('hit', e => { const r = e && e.victim && REC[e.victim.side]; if (r) r.bstun = 0; });
  const reset = () => { (game.f || []).forEach((f, s) => { if (REC[s] && REC[s].rollT > 0) f.hidden = false; }); for (const s of [0, 1]) Object.assign(REC[s], mk()); S.fx.length = 0; S.flash = 0; S.pg = null; };
  BUS.on('match:start', reset); BUS.on('round:start', reset);

  // ---- guard pushback: L during blockstun spends a bar (half the plain meter) and shoves the attacker away; the defender is untouchable for a few ticks ----
  function pushback(f, side, r) {
    const o = game.f[1 - side], cost = D.meter().cost;
    if (f.meter < cost - 1e-6) { beep(110, 0.07, 'square', 0.05); say(f, 'NEED METER', '#ff9c8a'); return; }
    if (!o || o.state === 'ko' || o.hidden || Math.abs(o.x - f.x) > PUSH_RANGE) { beep(110, 0.07, 'square', 0.05); say(f, 'TOO FAR', '#ff9c8a'); return; }
    f.meter = Math.max(0, f.meter - cost);
    const away = o.x >= f.x ? 1 : -1;
    o.set('hurt'); o.stun = 16; o.vx = away * 12; o.vy = o.onGround ? 0 : Math.min(o.vy, -2); o.airSp = false; o.bufP = o.bufK = o.bufS = 0;
    f.inv = Math.max(f.inv, PUSH_INV); r.bstun = PUSH_LOCK;
    game.hitstop = Math.max(game.hitstop, 6); game.shake = Math.max(game.shake, 6);
    FX.sparks(f.x + f.face * 30, f.y - 100, '#7ec8ff', 14); ring(f.x, f.y - 90, '#ffffff', 20, 9, 18); say(f, 'PUSHBACK', '#ffffff');
    beep(300, 0.12, 'square', 0.06, 2); thud(0.12, 0.1);
    COUNT.push++; BUS.emit('defense:pushback', { victim: f, src: o, cost });
  }

  // ---- knocked down: P or K in the first RISE_WIN ticks on the floor rises early, a direction rolls, down held at the end stays down STAY_EXTRA ticks longer ----
  function quickRise(f) {
    f.lie = Math.max(f.lie, DOWN_LIE - 8); f.st = Math.max(f.st, 36);   // the last 8 ticks of the engine's own get-up animation, then its usual 14 invulnerable ticks
    COUNT.rise++; say(f, 'QUICK RISE'); beep(520, 0.05, 'triangle', 0.04); FX.dust(f.x, GROUND); BUS.emit('defense:rise', { fighter: f });
  }
  function startRoll(f, r, dir) {
    f.set('dash'); f.dashBack = dir !== f.face; f.dashV = dir * f.d.spd * 2.7; f.dashCool = 22; f.inv = Math.max(f.inv, ROLL_LEN + 4); f.hidden = true;   // hidden: untargetable and slips through the foe
    r.rollT = ROLL_LEN; r.rollDir = dir; COUNT.roll++; say(f, 'ROLL'); beep(200, 0.07, 'triangle', 0.05); FX.dust(f.x, GROUND); BUS.emit('defense:roll', { fighter: f, dir });
  }
  const cpuPlan = () => { const go = Math.random() < riseRate(); return { go, at: 2 + Math.floor(Math.random() * 5), roll: go && Math.random() < 0.35 ? (Math.random() < 0.5 ? 1 : -1) : 0 }; };
  function downOptions(i, f, r, fw, bw) {
    if (!r.inDown) { r.inDown = true; r.used = false; r.stay = false; r.plan = null; r.air = 0; r.airDone = false; r.pre = -99; }
    if (!f.onGround || f.vy < 0 || f.noTech) { if (i.p || i.k) r.pre = S.n; return; }   // still being tossed does not count as lying down; a press in the last PRE ticks of the fall is kept
    const L = f.lie, early = S.n - r.pre <= PRE;
    if (f.cpu) {   // the CPU's own random presses are ignored while it lies there; it follows one plan per knockdown
      i.p = i.k = false; i[fw] = i[bw] = false; if (!r.plan) r.plan = cpuPlan();
      if (r.plan.go && L === r.plan.at) { i.p = true; if (r.plan.roll) i[r.plan.roll > 0 ? fw : bw] = true; }
    }
    if (!r.used && L < RISE_WIN && (i.p || i.k || early)) {
      r.used = true;
      const goF = i[fw] && !i[bw], goB = i[bw] && !i[fw];
      i.p = i.k = false; f.bufP = f.bufK = 0;
      if (goF || goB) startRoll(f, r, goF ? f.face : -f.face); else quickRise(f);
      return;
    }
    if (!r.stay && !r.used && i.d && L >= DOWN_LIE - 1) { r.stay = true; f.lie = DOWN_LIE - 1 - STAY_EXTRA; COUNT.stay++; say(f, 'STAY DOWN'); }
  }

  // ---- air recovery: reeling in the air for more than AIR_AFTER ticks, any button flips the victim out once per combo ----
  function airRecovery(i, f, r) {
    const air = (f.state === 'hurt' || f.state === 'hit') && !f.onGround;
    if (!air) { r.air = 0; if (f.state === 'idle' || f.state === 'walk' || f.state === 'block') r.airDone = false; return; }   // back on the floor in a neutral state: the next combo gets its own escape
    r.air++;
    if (f.cpu || r.airDone || r.air <= AIR_AFTER || !(i.p || i.k || i.s)) return;
    r.airDone = true; i.p = i.k = i.s = false; f.bufP = f.bufK = f.bufS = 0;
    const o = game.f[1 - f.side], dir = o && o.x > f.x ? -1 : 1;
    f.set('jump'); f.vy = -7; f.vx = dir * 4.5; f.inv = Math.max(f.inv, 12); f.land = 0;
    COUNT.air++; say(f, 'AIR RECOVERY'); FX.sparks(f.x, f.y - 90, '#9fd3ff', 10); beep(640, 0.08, 'triangle', 0.05, 1.6); BUS.emit('defense:air', { fighter: f });
  }

  // ---- wake-up reversal: a special pressed (or buffered) on the very first free tick after standing up carries WAKE_INV invulnerable ticks ----
  function wakeUp(i, f, r) {
    const first = r.wasDown && f.state === 'idle';
    r.wasDown = f.state === 'down';
    if (!first || f.cpu || f.cool > 0 || !(i.s || f.bufS > 0)) return;
    f.inv += WAKE_INV; COUNT.reversal++; say(f, 'REVERSAL', '#ffd76a'); BUS.emit('defense:reversal', { fighter: f });
  }

  function onInput(i, side, f) {
    if (!D.on || !i || !f || game.phase !== 'fight') return;
    const r = REC[side], fw = f.face > 0 ? 'r' : 'l', bw = f.face > 0 ? 'l' : 'r';
    const bk = !!(i[bw] && !i[fw]);
    if (bk && !r.bk) { r.edgeOk = S.n - r.edgeN >= LOCK; r.edgeN = S.n; }   // a fresh press of back opens the perfect guard window unless the last press was under LOCK ticks ago
    r.bk = bk;
    if (f.state === 'down') downOptions(i, f, r, fw, bw); else r.inDown = false;
    airRecovery(i, f, r); wakeUp(i, f, r);
    if (r.rollT > 0) { strip(i); return i; }
    if (r.bstun > 0) {
      if (f.state !== 'block') r.bstun = 0;
      else {
        if (i.s && !f.cpu) pushback(f, side, r);
        r.bstun--; strip(i); i[bw] = true; i[fw] = false;   // locked in the guard for the rest of the blockstun
        f.bufP = f.bufK = f.bufS = 0;
      }
    }
    return i;
  }
  HOOKS.add('input', onInput, 50);

  HOOKS.add('update', g => {
    if (!D.on || g.phase === 'pause') return;
    if (g.phase !== 'fight') for (const f of g.f || []) { const r = REC[f.side]; if (r && r.rollT > 0) { r.rollT = 0; f.hidden = false; } }   // a roll never outlives the fight (KO, finisher, outro): nobody stays invisible
    if (g.hitstop <= 0) S.n++;
    for (const e of S.fx) e.t++;
    S.fx = S.fx.filter(e => e.t < e.life);
    if (S.flash > 0) S.flash--;
  });
  HOOKS.add('fighterUpdate', (a, b) => {
    for (const f of [a, b]) { const r = REC[f.side]; if (r && r.rollT > 0) { r.rollT--; if (r.rollT <= 0 || f.state !== 'dash') { r.rollT = 0; f.hidden = false; } } }
  });

  // ---- art: the roll is the fighter tucked and spinning with two ghosts behind it ----
  HOOKS.add('drawFighter', (c, f) => {
    const r = REC[f.side]; if (!D.on || !r || r.rollT <= 0 || !f.hidden) return;
    const k = ROLL_LEN - r.rollT, dir = r.rollDir, cy = f.y - 50;
    c.save(); c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(f.x, GROUND + 2, 40, 7, 0, 0, 7); c.fill(); c.restore();
    for (let g = 2; g >= 0; g--) {
      const xg = f.x - dir * g * 16;
      c.save(); c.globalAlpha = g ? 0.2 : 1; c.translate(xg, cy); c.rotate(dir * (k * 0.55 - g * 0.5)); c.translate(-xg, -cy);
      drawSprite(c, f.d.id, 'jump', 2, Math.round(xg), Math.round(f.y), f.face); c.restore();
    }
  });
  HOOKS.add('drawWorld', c => {
    if (!D.on) return;
    for (const e of S.fx) {
      const p = e.t / e.life;
      if (e.k === 'ring') { c.save(); c.globalAlpha = 1 - p; c.strokeStyle = e.col; c.lineWidth = 4 - 2 * p; c.beginPath(); c.arc(e.x, e.y, e.r0 + e.t * e.dr, 0, 7); c.stroke(); c.restore(); }
      else uiText(e.txt, e.x, e.y - e.t * 1.2, 16, e.col, 'center', 1 - p * p);
    }
  });
  HOOKS.add('drawHud', (c, g) => {   // the two new lines sit above the engine's own round 1 hint strip and fade with it
    if (!D.on || g.phase !== 'fight' || g.round !== 1 || g.clock >= 360 || (typeof touch !== 'undefined' && touch.on) || (g.f[0].cpu && g.f[1].cpu)) return;
    const a = Math.min(1, (360 - g.clock) / 60);
    uiText('PERFECT GUARD: TAP BACK JUST AS A HIT LANDS · BLOCKING + L: PUSHBACK, COSTS METER', W / 2, H - 96, 13, '#9fd3ff', 'center', a);
    uiText('KNOCKED DOWN: P OR K GETS UP FAST · ADD A DIRECTION TO ROLL · HOLD DOWN TO STAY DOWN', W / 2, H - 76, 13, '#9fd3ff', 'center', a);
  });
  HOOKS.add('drawTop', (c, g) => {
    if (!D.on) return;
    if (S.flash > 0 && g.phase !== 'pause') { c.fillStyle = 'rgba(110,180,255,' + (0.32 * S.flash / 12).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
    if (g.phase === 'pause' && !(typeof OPTIONS !== 'undefined' && OPTIONS.screen)) {   // the options sub-screens (MOVES, CONTROLS...) use the bottom rows
      uiText('DEFENSE · TAP BACK AS A HIT LANDS: PERFECT GUARD · WHILE BLOCKING, SPECIAL: PUSHBACK (COSTS METER)', W / 2, 496, 13, '#9fd3ff');
      uiText('KNOCKED DOWN · PUNCH OR KICK: QUICK RISE · WITH A DIRECTION: ROLL · HOLD DOWN: STAY DOWN LONGER', W / 2, 514, 13, '#9fd3ff');
    }
  });
})();
