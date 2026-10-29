// ===== AGENT BRAWL feature file: TRAINING (p-training2). Loaded last, after vfx.js (see docs/ARCHITECTURE.md). =====
// Owner: the p-training2 agent. Only that agent edits this file, tools/tests/x-p-training2.mjs and docs/features/p-training2.md.
// training.js is still the stub of the original plan, so the practice room lives here and registers the 'training' mode it described.
// What it adds, all only while game.modeId === 'training':
//   - an endless round against a dummy (no KO, the clock never runs out, health refills after a quiet second, P1 keeps a full meter)
//   - an input display: P1's last 12 inputs (direction relative to the facing, buttons, ticks held)
//   - a frame-advantage readout after every hit or block between the two fighters, plus the damage of the last combo
//   - dummy behaviours: STAND, CROUCH, JUMP, BLOCK ALL, BLOCK AFTER HIT, and a 5 second recording of the dummy's inputs played back in a loop
//   - a hitbox overlay (hurtboxes, attack boxes by phase, projectiles) and a position reset (R, or R with left/right held for a corner)
// Keys in the training fight: 1 dummy behaviour, 2 record, 3 play, 4 hitboxes, 5 input display, R reset. A key that the player bound to an action is left alone.
// Plugs in through MODES, SETTINGS, BUS and HOOKS (input, update, fighterUpdate, damage, drawWorld, drawHud, pauseItems). No engine edit.
// Test hook: window.TRAINING2 (state and helpers) used by tools/tests/x-p-training2.mjs.
'use strict';
(() => {
  window.STUB_P_TRAINING2 = 1;   // marker: this file loaded
  const ID = 'training', REC_MAX = 300, HIST_MAX = 12, CALM = 40, GUARD_KEEP = 60, MEASURE_MAX = 240;
  const DUMMY = ['stand', 'crouch', 'jump', 'block', 'after'];
  const DUMMY_NAME = { stand: 'STAND', crouch: 'CROUCH', jump: 'JUMP', block: 'BLOCK ALL', after: 'BLOCK AFTER HIT' };
  SETTINGS.define('training2.dummy', { def: 'stand', values: DUMMY, label: 'TRAINING DUMMY' });
  SETTINGS.define('training2.hitbox', { def: false, label: 'TRAINING HITBOXES' });
  SETTINGS.define('training2.inputs', { def: true, label: 'TRAINING INPUT DISPLAY' });
  SETTINGS.define('training2.refill', { def: true, label: 'TRAINING REFILL' });

  const blank = () => ({ l: false, r: false, u: false, d: false, p: false, k: false, s: false, x: false });
  const fresh = () => ({
    hist: [],                                         // newest last: { dir (numpad 1-9, forward = 6), b (bits P1 K2 SP4 SU8), n (ticks) }
    meas: null,                                       // the hit or block being measured: { a, v, kind, n, ua, uv }
    adv: null,                                        // the last result: { adv, kind, side (attacker), t }
    combo: { hits: 0, dmg: 0 },                       // P1's last combo on the dummy
    rec: { mode: 'idle', frames: [], idx: 0, raw: null },   // mode 'idle' | 'rec' | 'play'; frames are { f, b, u, d, p, k, s, x } relative to the dummy's facing
    guardT: 0,                                        // BLOCK AFTER HIT: ticks left of guarding
    calm: [0, 0],                                     // free ticks since each fighter was last hit, for the refill
    resets: 0,
  });
  let S = fresh();
  const DUMMIES = new WeakSet();   // the dummies of training matches: a fighter made by any other match (or a test that only flips game.modeId) is left alone
  const on = () => game.modeId === ID && !!game.f && game.f.length === 2 && DUMMIES.has(game.f[1]);
  const fighting = () => on() && game.phase === 'fight';
  const isFighter = f => !!f && game.f && (f === game.f[0] || f === game.f[1]);

  // a fighter can act: not in a move, hit stun or knockdown, on the ground, not held in the guard by a blockstun (defense.js adds one when loaded)
  function free(f) {
    if (f.busy() || !f.onGround) return false;
    const D = window.DEFENSE, r = D && D.rec && D.rec[f.side];
    return !(r && r.bstun > 0);
  }

  // ---------- the mode ----------
  MODES.register({
    id: ID, label: 'TRAINING', order: 27, players: 1,   // after ARCADE (25) and SURVIVAL (26), which the arcade tests keep right after the two classic modes
    onMatchStart(info) {
      S = fresh();
      const d = info && info.fighters && info.fighters[1]; if (d) { d.cpu = false; DUMMIES.add(d); }   // the dummy is driven by this file, never by the CPU brain
    },
    onRoundStart() { const d = game.f && game.f[1]; if (d) d.cpu = false; S.meas = null; S.calm = [0, 0]; },
  });

  // ---------- input: P1's history, recording, the dummy ----------
  function numpad(i, face) {
    const fw = face > 0 ? i.r && !i.l : i.l && !i.r, bk = face > 0 ? i.l && !i.r : i.r && !i.l;
    const v = i.u && !i.d ? 1 : i.d && !i.u ? -1 : 0;
    return 5 + v * 3 + (fw ? 1 : bk ? -1 : 0);
  }
  function logInput(i, f) {
    const dir = numpad(i, f.face), b = (i.p ? 1 : 0) | (i.k ? 2 : 0) | (i.s ? 4 : 0) | (i.x ? 8 : 0);
    const h = S.hist, last = h[h.length - 1];
    if (!last || b || last.b || last.dir !== dir) { h.push({ dir, b, n: 1 }); if (h.length > HIST_MAX) h.shift(); }
    else if (last.n < 999) last.n++;
  }
  const toRel = (i, face) => ({ f: face > 0 ? !!i.r : !!i.l, b: face > 0 ? !!i.l : !!i.r, u: !!i.u, d: !!i.d, p: !!i.p, k: !!i.k, s: !!i.s, x: !!i.x });
  const fromRel = (fr, face) => ({ l: face > 0 ? fr.b : fr.f, r: face > 0 ? fr.f : fr.b, u: fr.u, d: fr.d, p: fr.p, k: fr.k, s: fr.s, x: fr.x });
  function lowIncoming(o, d) {   // the height of what the attacker is throwing at the dummy: true when it must be blocked crouching
    for (const p of game.proj) if (p.owner === o && p.t >= 0 && p.cb && p.cb.low && Math.abs(p.x - d.x) < 300) return true;
    const A = o.curAtk(); if (A) return A.hl === 'low';
    return !!(o.mv && o.mv.cbLow && (o.state === 'special' || o.state === 'super'));
  }
  function overheadIncoming(o) {   // an overhead or an air attack is out: guard standing (a foe that only jumps is met crouching until it attacks)
    const A = o.curAtk(); return !!A && (A.hl === 'ovh' || (!A.hl && !!A.air));
  }
  // guard everything: back is held all the time (no fresh presses, so no perfect guards that would skew the numbers) and down too,
  // which keeps the guard up without walking away, unless an overhead is coming
  function guardInput(d, o) {
    const i = blank(); i[o.x < d.x ? 'r' : 'l'] = true;
    i.d = lowIncoming(o, d) || !overheadIncoming(o);
    return i;
  }
  function dummyInput(d, o) {
    const R = S.rec;
    if (R.mode === 'rec') {
      const r = R.raw || blank(); R.raw = null;
      R.frames.push(toRel(r, d.face)); if (R.frames.length >= REC_MAX) R.mode = 'idle';
      return Object.assign(blank(), { l: !!r.l, r: !!r.r, u: !!r.u, d: !!r.d, p: !!r.p, k: !!r.k, s: !!r.s, x: !!r.x });
    }
    if (R.mode === 'play' && R.frames.length) { const fr = R.frames[R.idx]; R.idx = (R.idx + 1) % R.frames.length; return fromRel(fr, d.face); }
    const m = SETTINGS.get('training2.dummy'), i = blank();
    if (m === 'crouch') i.d = true;
    else if (m === 'jump') i.u = true;
    else if (m === 'block' || (m === 'after' && S.guardT > 0)) return guardInput(d, o);
    return i;
  }
  // order -1000: before every other input hook, so combat.js (crouch, breaker) and defense.js (blockstun) see the dummy's real input
  HOOKS.add('input', (i, side, f) => {
    if (!fighting() || !i) return;
    if (side === 0) {
      logInput(i, f);
      if (S.rec.mode === 'rec') { S.rec.raw = Object.assign({}, i); return blank(); }   // while recording, P1's controls drive the dummy
      return;
    }
    return dummyInput(f, game.f[0]);
  }, -1000);

  // ---------- keys ----------
  function bound(code) {   // a key the player bound to a fighter action keeps that job
    for (const m of [MAP[0], MAP[1], ALT]) for (const a in m) if (m[a] && m[a].includes(code)) return true;
    return false;
  }
  function cycleDummy(dir = 1) {
    const cur = DUMMY.indexOf(SETTINGS.get('training2.dummy'));
    SETTINGS.set('training2.dummy', DUMMY[(cur + dir + DUMMY.length) % DUMMY.length]); S.guardT = 0;
  }
  function record() {
    const R = S.rec;
    if (R.mode === 'rec') { R.mode = 'idle'; return; }
    R.mode = 'rec'; R.frames = []; R.idx = 0; R.raw = null;
  }
  function play() {
    const R = S.rec;
    if (R.mode === 'play') { R.mode = 'idle'; return; }
    if (R.mode === 'rec') R.mode = 'idle';
    if (R.frames.length) { R.mode = 'play'; R.idx = 0; }
  }
  function reset(corner = 0) {   // corner: 0 the start positions, -1 the dummy in the left corner, 1 in the right one
    if (!on()) return;
    const [a, b] = game.f;
    for (const f of game.f) f.reset();
    if (corner) { b.x = corner < 0 ? 60 : W - 60; a.x = b.x - corner * 110; a.face = corner; b.face = -corner; }
    game.proj = []; game.hitstop = 0; game.slow = 0;
    S.meas = null; S.calm = [0, 0]; S.guardT = 0; S.combo = { hits: 0, dmg: 0 }; S.resets++;
    if (S.rec.mode === 'rec') S.rec.mode = 'idle';
    S.rec.idx = 0;
  }
  const KEYS = [
    { code: 'Digit1', run: () => cycleDummy(1) },
    { code: 'Digit2', run: record },
    { code: 'Digit3', run: play },
    { code: 'Digit4', run: () => SETTINGS.toggle('training2.hitbox') },
    { code: 'Digit5', run: () => SETTINGS.toggle('training2.inputs') },
    { code: 'KeyR', run: () => reset(held(0, 'l') && !held(0, 'r') ? -1 : held(0, 'r') && !held(0, 'l') ? 1 : 0) },
  ];
  HOOKS.add('update', g => {
    if (!on() || g.phase !== 'fight') return;
    if ((g.clock + 1) % 60 === 0) g.clock++;   // the round clock skips every whole second, so the timer never runs down
    for (const k of KEYS) if (!bound(k.code) && tap(k.code)) k.run();
  });
  HOOKS.add('pauseItems', () => on() ? [
    { key: 'Digit1', label: '1 DUMMY ' + DUMMY_NAME[SETTINGS.get('training2.dummy')], run: () => cycleDummy(1) },
    { key: 'Digit4', label: '4 HITBOXES ' + (SETTINGS.get('training2.hitbox') ? 'ON' : 'OFF'), run: () => SETTINGS.toggle('training2.hitbox') },
    { key: 'Digit5', label: '5 INPUTS ' + (SETTINGS.get('training2.inputs') ? 'ON' : 'OFF'), run: () => SETTINGS.toggle('training2.inputs') },
  ] : null);

  // ---------- results: frame advantage, combo damage, endless health ----------
  function onContact(e, kind) {
    if (!fighting() || !e || !isFighter(e.src) || !isFighter(e.victim) || e.src === e.victim) return;
    S.meas = { a: e.src, v: e.victim, kind, n: 0, ua: null, uv: null };
    S.calm[e.victim.side] = 0;
    if (e.victim === game.f[1]) S.guardT = GUARD_KEEP;
    if (kind === 'hit' && e.src === game.f[0]) {
      if (e.combo >= 2 && S.combo.hits) { S.combo.hits++; S.combo.dmg += e.dmg; } else S.combo = { hits: 1, dmg: e.dmg };
    }
  }
  BUS.on('hit', e => onContact(e, 'hit'));
  BUS.on('block', e => onContact(e, 'block'));
  HOOKS.add('fighterUpdate', (a, b) => {
    if (!fighting()) return;
    const m = S.meas;
    if (m) {
      m.n++;
      if (m.ua == null && free(m.a)) m.ua = m.n;
      if (m.uv == null && free(m.v)) m.uv = m.n;
      if (m.ua != null && m.uv != null) { S.adv = { adv: m.uv - m.ua, kind: m.kind, side: m.a.side, t: game.tick }; S.meas = null; }
      else if (m.n > MEASURE_MAX) S.meas = null;
    }
    const d = game.f[1];
    if (S.guardT > 0 && free(d)) S.guardT--;
    const refill = SETTINGS.get('training2.refill');
    for (const f of game.f) {
      S.calm[f.side] = free(f) ? S.calm[f.side] + 1 : 0;
      if (refill && S.calm[f.side] >= CALM && f.hp < f.d.hp) f.hp = f.d.hp;
    }
    if (refill && game.f[0].state !== 'super') game.f[0].meter = 100;
  });
  HOOKS.add('damage', pl => {   // last in line: nobody is knocked out in training
    if (!on() || !pl || !pl.victim || !isFinite(pl.dmg)) return;
    const room = Math.max(0, pl.victim.hp - 1);
    if (pl.dmg > room) pl.dmg = room;
  }, 1e9);

  // ---------- drawing ----------
  const BTN = [[1, 'P', '#ffd23f'], [2, 'K', '#ff7a5c'], [4, 'SP', '#7cc7ff'], [8, 'SU', '#ff4d6d']];
  const ANG = { 6: 0, 3: 45, 2: 90, 1: 135, 4: 180, 7: 225, 8: 270, 9: 315 };
  function arrow(c, x, y, dir) {
    c.fillStyle = 'rgba(10,12,22,0.9)'; c.beginPath(); c.arc(x, y, 7.5, 0, Math.PI * 2); c.fill();
    if (dir === 5) { c.fillStyle = '#6b7488'; c.fillRect(x - 1.5, y - 1.5, 3, 3); return; }
    c.save(); c.translate(x, y); c.rotate(ANG[dir] * Math.PI / 180); c.fillStyle = '#e8f0ff';
    c.fillRect(-5, -1.5, 6, 3); c.beginPath(); c.moveTo(6, 0); c.lineTo(0, -5); c.lineTo(0, 5); c.closePath(); c.fill(); c.restore();
  }
  function drawInputs(c) {
    const h = S.hist, x0 = 12, y0 = 92, rh = 18;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x0 - 4, y0 - 18, 132, 18 + HIST_MAX * rh + 4);
    ptext(c, 'INPUTS', x0, y0 - 14, 1, '#9aa6c0');
    for (let k = 0; k < h.length; k++) {
      const e = h[h.length - 1 - k], y = y0 + k * rh + 9;
      c.globalAlpha = k ? Math.max(0.45, 1 - k * 0.05) : 1;
      arrow(c, x0 + 8, y, e.dir);
      let bx = x0 + 20;
      for (const [bit, lbl, col] of BTN) if (e.b & bit) {
        const w = lbl.length * 6 + 5; c.fillStyle = col; c.fillRect(bx, y - 6, w, 12);
        ptext(c, lbl, bx + 3, y - 4, 1, '#0a0c16', 'left', false); bx += w + 2;
      }
      ptext(c, String(Math.min(99, e.n)), x0 + 122, y - 7, 2, '#ffffff', 'right');
    }
    c.globalAlpha = 1;
  }
  function drawReadout(c) {
    const x = W - 14; let y = 92;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x - 200, y - 18, 204, 166);
    ptext(c, 'FRAMES', x, y - 14, 1, '#9aa6c0', 'right');
    const A = S.adv;
    if (A) {
      const who = A.side === 0 ? '' : 'DUMMY ';
      ptext(c, who + (A.kind === 'hit' ? 'ON HIT' : 'ON BLOCK'), x, y, 2, A.kind === 'hit' ? '#ffd23f' : '#7cc7ff', 'right');
      ptext(c, (A.adv > 0 ? '+' : '') + A.adv, x, y + 18, 4, A.adv > 0 ? '#5dff8a' : A.adv < 0 ? '#ff5d5d' : '#ffffff', 'right');
    } else ptext(c, S.meas ? '...' : '--', x, y + 18, 4, '#6b7488', 'right');
    y += 58;
    if (S.combo.hits) ptext(c, S.combo.hits + (S.combo.hits > 1 ? ' HITS ' : ' HIT ') + Math.round(S.combo.dmg) + ' DMG', x, y, 2, '#ffffff', 'right');
    y += 22;
    const R = S.rec;
    if (R.mode === 'rec') ptext(c, 'REC ' + ((REC_MAX - R.frames.length) / 60).toFixed(1), x, y, 2, game.tick % 30 < 15 ? '#ff4d4d' : '#ff9a8a', 'right');
    else if (R.mode === 'play') ptext(c, 'PLAYBACK', x, y, 2, '#5dff8a', 'right');
    else { const nm = DUMMY_NAME[SETTINGS.get('training2.dummy')] || ''; ptext(c, nm.length > 10 ? nm : 'DUMMY ' + nm, x, y, 2, '#7ef0ff', 'right'); }
    y += 22;
    ptext(c, '1 DUMMY  2 REC  3 PLAY', x, y, 1, '#c8d0e0', 'right');
    ptext(c, '4 HITBOX ' + (SETTINGS.get('training2.hitbox') ? 'ON ' : 'OFF') + '  5 INPUTS', x, y + 11, 1, '#c8d0e0', 'right');
    ptext(c, 'R RESET  R+LEFT/RIGHT CORNER', x, y + 22, 1, '#c8d0e0', 'right');
  }
  HOOKS.add('drawHud', (c, g) => {
    if (!on() || !c) return;
    c.save();
    if (SETTINGS.get('training2.inputs')) drawInputs(c);
    drawReadout(c);
    c.restore();
  });
  HOOKS.add('drawWorld', (c, g) => {
    if (!on() || !c || !SETTINGS.get('training2.hitbox')) return;
    c.save(); c.lineWidth = 2;
    for (const f of g.f) {
      if (f.hidden) continue;
      c.fillStyle = f.inv > 0 ? 'rgba(255,255,255,0.10)' : 'rgba(80,190,255,0.16)'; c.fillRect(f.x - 26, f.y - 150, 52, 150);
      c.strokeStyle = f.inv > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(80,190,255,0.95)'; c.strokeRect(f.x - 26, f.y - 150, 52, 150);
      const A = f.curAtk();
      if (A && A.box) {
        const [x0, x1, y0, y1] = A.box, s = f.face, ax0 = f.x + Math.min(x0 * s, x1 * s), ax1 = f.x + Math.max(x0 * s, x1 * s);
        const ph = f.st < A.hit ? 0 : f.st === A.hit ? 1 : 2;   // startup, the active tick, recovery
        c.fillStyle = ['rgba(255,170,60,0.10)', 'rgba(255,40,40,0.45)', 'rgba(140,140,140,0.08)'][ph]; c.fillRect(ax0, f.y + y0, ax1 - ax0, y1 - y0);
        c.strokeStyle = ['rgba(255,170,60,0.9)', 'rgba(255,60,60,1)', 'rgba(160,160,160,0.6)'][ph]; c.strokeRect(ax0, f.y + y0, ax1 - ax0, y1 - y0);
      }
    }
    for (const p of g.proj) if (p.t >= 0 && p.life > 0 && p.r > 0) {
      c.strokeStyle = 'rgba(255,60,60,0.95)'; c.fillStyle = 'rgba(255,40,40,0.25)';
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
  });

  window.TRAINING2 = { ID, DUMMY, REC_MAX, HIST_MAX, state: () => S, free, reset, record, play, cycleDummy, numpad };
})();
