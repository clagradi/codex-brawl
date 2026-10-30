// ===== AGENT BRAWL feature file: STRINGS (premium batch, p-strings). Loaded last, after vfx.js. =====
// Owner: p-strings agent (branch feat/p-strings).
// Area: four named combo strings per fighter (shown on a STRINGS page of the move lists, announced on screen when they land),
//       a chase jump that follows a launcher into a juggle, air chains (P > K > special in the air) and juggle damage scaling.
// Hooks used: 'update' (N key on the move lists, callout clock), 'input' (CPU chase and air chain, order 5), 'fighterUpdate' (chase steering,
//             juggle end and lock), 'damage' (juggle scaling, order 20: after combat.js), 'drawFighter' (juggle pips), 'drawHud' (string callouts),
//             'drawTop' (N key hints), 'pauseItems' (N STRINGS).
// BUS used: hit, hitstate, special, phase, round:start (listens); strings:land, strings:chase, strings:juggle (emits).
// Settings: strings.on (the whole feature: chase, air chains, juggle rules, detection), strings.callouts (the on-screen name and the sting).
// Engine touch points that are not hooks (nothing in game.js is edited): Fighter.prototype.tryCancel is wrapped (outermost: this file loads last)
//   for the chase jump and the air chains, Fighter.prototype.reset for the per-fighter state (fighter.strs), window.moveRows for the STRINGS page
//   and window.drawMoveList for the page title (and to drop the hit counts on the narrow select-screen panel).
// Public: window.STRINGS (list, rows, tokenOf, feed, state, page, toggle, counters, constants) for tests and other feature files.
'use strict';
(() => {
  window.STUB_P_STRINGS = 1;
  if (typeof Fighter === 'undefined' || typeof HOOKS === 'undefined' || typeof BUS === 'undefined' || typeof SETTINGS === 'undefined') return;

  // ---------- tuning ----------
  const JUG_MAX = 4, JUG_SCALE = [0.9, 0.8, 0.7, 0.6], JUG_CAP = 0.35, JUG_KB = 3;   // juggle: hits before the victim is let go, damage factor per juggle hit, cap of the whole combo (share of a life bar), knockback cap
  const CHASE_V = -12, CHASE_T = 40, CHASE_GAP = 50, STEER = 5;                     // chase jump: take-off speed, steering ticks, distance kept from the victim, steering px per tick
  const AIR_WIN = 9, SP_MEM = 150, HIST = 12, CALL_T = 96;                          // air chain window after contact, ticks a special stays the source of a late shot, token history, callout ticks
  const GOLD = '#ffd23f', SKY = '#7cc7ff', HINT = '#c9a24a';

  SETTINGS.define('strings.on', { def: true, label: 'COMBO STRINGS' });
  SETTINGS.define('strings.callouts', { def: true, label: 'STRING CALLOUTS' });
  const opt = k => { try { return SETTINGS.get(k) !== false; } catch (e) { return true; } };
  const isOn = () => opt('strings.on');
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const OPT = () => (typeof OPTIONS !== 'undefined' && OPTIONS) || null;
  const sfx = (f, d, type, v) => { try { beep(f, d, type, v); } catch (e) { /* audio is optional */ } };

  // ---------- the strings ----------
  // Tokens: P K plain normals (a target-combo step counts as its button), L a launcher (the third punch or a launching string end),
  // jP jK jS the air punch, air kick and air special, S0 S1 S2 the specials (SP, FWD + SP, DOWN + SP). A string lands when the last hits
  // of one combo spell it. Kind: AIR starts in the air, JUGGLE has a launcher (hold UP to chase), CANCEL ends in a special cancel.
  const TABLE = {
    tibo: [['SHIP IT', 'jP jK jS'], ['FORCE PUSH', 'P P L jP jK jS'], ['HOTFIX DEPLOY', 'K K L jK jS'], ['MERGE CONFLICT', 'P K S2']],
    poteto: [['DEEP FRYER', 'jP jK jS'], ['SPUD ORBIT', 'P P L jP jK jS'], ['CURLY FRIES', 'K P L jK jS'], ['HASH BROWN', 'P P S1']],
    dot: [['ELLIPSIS', 'jP jK jS'], ['CONNECT THE DOTS', 'P P L jP jK jS'], ['TYPING BUBBLE', 'K K S0'], ['READ RECEIPT', 'P K S2']],
    wang: [['GRADIENT DESCENT', 'jP jK jS'], ['BACKPROP', 'P P L jP jK jS'], ['TRAINING RUN', 'P K P L jK jS'], ['OVERFIT', 'K K S0']],
    muse: [['PACKET STORM', 'jP jK jS'], ['CLOUD SYNC', 'P P L jP jK jS'], ['FLUFF ORBIT', 'K P K L jK jS'], ['PING FLOOD', 'P P S0']],
  };
  const LIST = {}, SORTED = {};
  for (const id of Object.keys(TABLE)) {
    LIST[id] = TABLE[id].map(([name, seq], n) => {
      const toks = seq.split(' ');
      return { name, seq, toks, hits: toks.length, bit: 1 << n, kind: toks[0][0] === 'j' ? 'AIR' : toks.includes('L') ? 'JUGGLE' : 'CANCEL' };
    });
    SORTED[id] = LIST[id].slice().sort((a, b) => b.hits - a.hits);   // longest first: FORCE PUSH wins over the SHIP IT at its end
  }

  // ---------- per-fighter state ----------
  const fresh = () => ({ hist: [], used: 0, sp: { tok: '', t: -999 }, chase: 0, cpuGo: false, cpuP: false, cdmg: 0, jug: { on: false, src: null, n: 0, lock: false } });
  const st = f => f.strs || (f.strs = fresh());
  const P = Fighter.prototype;
  const reset0 = P.reset;
  P.reset = function () { const r = reset0.apply(this, arguments); this.strs = fresh(); return r; };
  const foeOf = f => (game.f || []).find(x => x && x !== f) || null;
  const COUNT = { land: 0, chase: 0, chain: 0, juggle: 0 };
  const CALL = [{ name: '', sub: '', t: 0 }, { name: '', sub: '', t: 0 }];   // the on-screen callout of each side

  // ---------- what a hit was: one token ----------
  function spIdx(f, mv) {
    const sp = (MOVES[f.d.id] && MOVES[f.d.id].sp) || [];
    let k = sp.indexOf(mv); if (k < 0 && mv) k = sp.findIndex(m => m && m.name === mv.name);
    return k;
  }
  const spTok = (f, mv) => { if (f.airSp) return 'jS'; const k = spIdx(f, mv); return k >= 0 ? 'S' + k : 'S'; };
  function atkTok(f, A) {
    const k = f.atk || '';
    if (A.air) return k === 'airk' ? 'jK' : 'jP';
    if (k === 'kickf') return 'T';
    if (k === 'low') return 'dP';
    if (k === 'sweep') return 'dK';
    if (k.startsWith('ovh_')) return 'fK';
    if (A.launch) return 'L';
    return A.st === 'kick' ? 'K' : 'P';
  }
  function tokenOf(f, kind) {
    if (!f || !f.d) return '?';
    if (kind === 'super' || f.state === 'super') return 'SU';
    if (f.state === 'throw') return 'X';
    const A = f.curAtk();
    if (A && (kind === 'punch' || kind === 'kick') && f.st === A.hit) return atkTok(f, A);
    if (f.state === 'special' && f.mv) return spTok(f, f.mv);
    const s = st(f);
    if (s.sp.tok && f.t - s.sp.t <= SP_MEM) return s.sp.tok;   // a shot that lands after its special ended
    return '?';
  }
  BUS.on('special', e => { const f = e && e.fighter; if (!f || !f.d) return; const s = st(f); s.sp.tok = spTok(f, e.move); s.sp.t = f.t; });

  // push one token, return the string it completes (longest first, each string once per combo)
  function match(f, tok) {
    const s = st(f), h = s.hist; h.push(tok); if (h.length > HIST) h.shift();
    const L = f.d && SORTED[f.d.id]; if (!L) return null;
    for (const S of L) {
      if (s.used & S.bit) continue;
      const n = S.toks.length; if (h.length < n) continue;
      let ok = true; for (let k = 0; k < n; k++) if (h[h.length - n + k] !== S.toks[k]) { ok = false; break; }
      if (ok) return S;
    }
    return null;
  }
  function land(f, o, S) {
    const s = st(f); s.used |= S.bit; COUNT.land++;
    BUS.emit('strings:land', { fighter: f, foe: o, name: S.name, hits: S.hits, kind: S.kind, combo: f.combo });
    if (!opt('strings.callouts')) return;
    const k = CALL[f.side ? 1 : 0]; k.name = S.name; k.sub = S.hits + ' HIT STRING'; k.t = CALL_T;
    sfx(784, 0.07, 'square', 0.05);
    if (game.later) { game.later(5, () => sfx(988, 0.07, 'square', 0.05)); game.later(10, () => sfx(1175, 0.14, 'triangle', 0.05)); }
  }

  // ---------- juggles ----------
  function startJug(src, v) {
    const j = st(v).jug; if (j.on) return;
    j.on = true; j.src = src; j.n = 0; j.lock = false; COUNT.juggle++;
    const s = st(src); s.cpuGo = !!src.cpu && Math.random() < clamp(((game.cpuLevel || 0) - 0.3) * 1.4, 0, 0.9);
    BUS.emit('strings:juggle', { src, victim: v });
  }
  function endJug(vs) {
    const j = vs.jug; if (j.src && j.src.strs) j.src.strs.cpuGo = false;
    j.on = false; j.n = 0; j.lock = false; j.src = null;
  }
  BUS.on('hit', e => {
    if (!e || !isOn()) return;
    const src = e.src, v = e.victim; if (!src || !v || src === v || !src.d || !v.d) return;
    const s = st(src), vs = st(v), j = vs.jug;
    if (!(e.combo > 1)) { s.hist.length = 0; s.used = 0; vs.cdmg = 0; }   // a new combo
    vs.cdmg += +e.dmg || 0;
    if (j.on) {
      if (j.src !== src) endJug(vs);
      else if (!v.onGround) { j.n++; if (j.n >= JUG_MAX) j.lock = true; }
    }
    if (!j.on && v.onGround && v.vy <= -9) startJug(src, v);   // a launcher: the victim leaves the floor at -9.5
    const S = match(src, tokenOf(src, e.kind));
    if (S) land(src, v, S);
  });
  BUS.on('hitstate', e => { if (e && e.state === 'launch' && isOn() && e.src && e.victim && e.src !== e.victim) startJug(e.src, e.victim); });   // EX and airborne launches (combat.js)

  // juggle scaling: each juggle hit is worth less, the whole combo stays under JUG_CAP of a life bar, and the knockback is short so the chase reaches
  HOOKS.add('damage', pl => {
    if (!pl || pl.guarding || !isOn()) return;
    const v = pl.victim, src = pl.src; if (!v || !src || !v.strs || !v.d) return;
    const j = v.strs.jug; if (!j.on || j.src !== src || v.onGround) return;
    let d = (+pl.dmg || 0) * JUG_SCALE[Math.min(j.n, JUG_SCALE.length - 1)];
    if (pl.kind !== 'super') {   // a super ends a juggle at full price
      const fe = Math.max(0.6, 1 - 0.06 * Math.max(0, (src.combo || 0) - 1));   // the engine's own combo scaling, applied after this filter
      const room = JUG_CAP * v.d.hp - (v.strs.cdmg || 0);
      if (d * fe > room) { d = Math.max(room, 0) / fe; j.lock = true; }   // a locked juggle deals nothing more
    }
    pl.dmg = d; if (isFinite(pl.kb)) pl.kb = Math.min(pl.kb, JUG_KB);
    return pl;
  }, 20);

  // ---------- chase jump and air chains ----------
  function canChase(f, o) {
    if (!f.onGround || !o || !o.strs) return false;
    const j = o.strs.jug;
    return j.on && j.src === f && !j.lock && (o.state === 'hurt' || o.state === 'hit');
  }
  function chase(f, o) {
    const s = st(f);
    f.set('jump'); f.st = 4; f.y = GROUND - 1; f.vy = CHASE_V; f.vx = 0;   // past the jump squat: off the floor this tick
    s.chase = CHASE_T; s.cpuP = false; COUNT.chase++;
    if (typeof FX !== 'undefined' && FX.dust) FX.dust(f.x, GROUND);
    sfx(560, 0.06, 'triangle', 0.04);
    BUS.emit('strings:chase', { fighter: f, foe: o });
  }
  function airCancel(f, o, A) {
    if (!f.contact || f.onGround || f.st <= A.hit || f.st > A.hit + AIR_WIN) return false;
    const M = MOVES[f.d.id], sp0 = M && M.sp && M.sp[0];
    if (f.atk === 'airp' && f.bufK > 0) { f.bufP = f.bufK = 0; f.startAtk('airk'); }
    else if (f.bufS > 0 && f.cool <= 0 && f.y < GROUND - 24 && sp0) { f.bufS = f.bufP = f.bufK = 0; f.startMove(sp0, 'special', o); }
    else return false;
    COUNT.chain++; return true;
  }
  const tryCancel0 = P.tryCancel;
  P.tryCancel = function (o, i, A, fwd) {
    if (A && isOn() && game.phase === 'fight') {
      if (A.air) { if (airCancel(this, o, A)) return true; }
      else if (A.launch && i && i.u && this.cancelOpen && !(this.bufS > 0 && this.cool <= 0) && canChase(this, o)) { chase(this, o); return true; }
    }
    return tryCancel0.apply(this, arguments);
  };

  function upd(f, o) {
    const s = f.strs; if (!s) return;
    if (s.chase > 0) {
      s.chase--;
      const oj = o && o.strs && o.strs.jug;
      if (!f.onGround && oj && oj.on && oj.src === f) f.x = clamp(f.x + clamp(o.x - f.face * CHASE_GAP - f.x, -STEER, STEER), 46, W - 46);
    }
    const j = s.jug;
    if (j.on) {
      if (!(f.state === 'hurt' || f.state === 'hit' || f.state === 'down') || (f.onGround && f.vy >= 0)) endJug(s);
      else if (j.lock) f.inv = Math.max(f.inv, 2);   // juggle over: untouchable until the landing
    }
  }
  HOOKS.add('fighterUpdate', (a, b) => { if (!isOn() || !a || !b) return; upd(a, b); upd(b, a); });

  // the CPU: holds UP after its launcher lands, then presses P, K and SP in the air (more often on harder levels, decided at the launch)
  HOOKS.add('input', (i, side, f) => {
    if (!i || !f || !f.cpu) return;
    const s = f.strs; if (!s || !s.cpuGo || !isOn() || game.phase !== 'fight') return;
    const A = f.curAtk();
    if (A && !A.air && A.launch && f.contact && f.onGround) { i.u = true; i.p = i.k = i.s = i.x = false; return i; }
    if (s.chase > 0 && !f.onGround) {
      const o = foeOf(f);
      if (f.state === 'jump' && f.st > 3 && !s.cpuP && o && Math.abs(o.x - f.x) < 110) { i.p = true; s.cpuP = true; }
      else if (A && A.air && f.contact && f.st > A.hit) { if (f.atk === 'airp') i.k = true; else if (f.atk === 'airk') i.s = true; }
    }
    return i;
  }, 5);

  // ---------- move lists: the STRINGS page (N on the select screen and on the pause MOVES screen) ----------
  let page = false;
  const BTN = { p: 'P', k: 'K', s: 'SP' };
  function labels(side, cpu) {
    const btn = cpu || (typeof touch !== 'undefined' && touch.on && side === 0);
    let L = btn ? BTN : (typeof LABEL !== 'undefined' && LABEL[side]) || BTN;
    if (String(L.p).length > 2 || String(L.k).length > 2 || String(L.s).length > 2) L = BTN;   // NUM1 keys: the button names keep the chips short
    return L;
  }
  function inputOf(toks, L) {
    const out = [];
    toks.forEach((t, n) => {
      if (t[0] === 'j' && (n === 0 || toks[n - 1] === 'L')) out.push('UP');   // jump in, or hold UP on the launcher
      if (t === 'P' || t === 'L' || t === 'jP') out.push(L.p);
      else if (t === 'K' || t === 'jK') out.push(L.k);
      else if (t === 'jS' || t === 'S0') out.push(L.s);
      else if (t === 'S1') out.push('FWD+' + L.s);
      else if (t === 'S2') out.push('DOWN+' + L.s);
    });
    return out.join('>');
  }
  const ROWS = {};
  function stringRows(id, side, cpu) {
    const L = labels(side, cpu), key = id + '|' + L.p + '|' + L.k + '|' + L.s;
    if (ROWS[key]) return ROWS[key];
    const rows = [{ input: [L.p, L.p, L.p, 'UP'].join('>'), name: 'CHASE JUMP', note: 'ANY LAUNCHER' }];
    for (const S of LIST[id]) rows.push({ input: inputOf(S.toks, L), name: S.name, note: S.hits + ' HITS', col: S.kind === 'JUGGLE' ? GOLD : S.kind === 'AIR' ? SKY : undefined });
    rows.strings = true;
    return (ROWS[key] = rows);
  }
  const moveRows0 = window.moveRows;
  if (typeof moveRows0 === 'function') window.moveRows = function (id, side, cpu) {
    if (page && isOn() && LIST[id]) return stringRows(id, side, cpu);
    return moveRows0.apply(this, arguments);
  };
  const drawMoveList0 = window.drawMoveList;
  if (typeof drawMoveList0 === 'function') window.drawMoveList = function (c, title, rows, x, y, w, h) {
    if (rows && rows.strings) {
      if (title === 'MOVES') title = 'STRINGS'; else if (title && title !== 'READY') title = title + ' STRINGS';
      if (w < 400) rows = rows.narrow || (rows.narrow = Object.assign(rows.map(r => Object.assign({}, r, { note: '' })), { strings: true }));   // narrow panel: names need the room
      return drawMoveList0.call(this, c, title, rows, x, y, w, h);
    }
    return drawMoveList0.apply(this, arguments);
  };
  const keyFree = code => {
    try { for (const m of [MAP[0], MAP[1], ALT]) for (const a in m) if ((m[a] || []).includes(code)) return false; } catch (e) { /* no key maps */ }
    return true;
  };
  function toggle() { page = !page; sfx(page ? 880 : 440, 0.04, 'square', 0.05); return page; }
  BUS.on('phase', () => { page = false; });
  BUS.on('round:start', () => { CALL[0].t = CALL[1].t = 0; });
  HOOKS.add('update', g => {
    const ph = g.phase, O = OPT();
    if (ph !== 'pause') { if (CALL[0].t > 0) CALL[0].t--; if (CALL[1].t > 0) CALL[1].t--; }
    if (ph !== 'select' && ph !== 'pause') return;
    if (ph === 'pause' && O) { if (O.screen !== 'moves') { page = false; return; } }
    else if (ph === 'pause') return;   // no options screen: the pause item below toggles the page
    if (pressed.KeyN && isOn() && keyFree('KeyN')) { pressed.KeyN = false; toggle(); }
  }, -10);   // before options.js (-5), which eats unknown keys on its screens
  HOOKS.add('pauseItems', () => isOn() ? [{
    id: 'strings', key: 'KeyN', label: 'N STRINGS',
    run: () => { const O = OPT(); if (O && typeof O.open === 'function') { O.open('moves'); page = true; sfx(880, 0.04, 'square', 0.05); } else toggle(); },
  }] : null);

  // ---------- drawing ----------
  HOOKS.add('drawHud', c => {
    if (!isOn() || typeof ptext !== 'function') return;
    for (let s = 0; s < 2; s++) {
      const k = CALL[s]; if (k.t <= 0) continue;
      const age = CALL_T - k.t, a = Math.min(1, k.t / 16, (age + 1) / 4), x = s ? W * 0.75 : W * 0.25, y = 116;
      const pop = age < 8 ? 1 + 0.3 * (1 - age / 8) : 1, bw = Math.max(ptextWidth(k.name, 3), ptextWidth(k.sub, 2)) + 24;
      c.save(); c.globalAlpha = a;
      c.fillStyle = 'rgba(8,10,20,0.62)'; c.fillRect(x - bw / 2, y - 8, bw, 56);
      c.fillStyle = GOLD; c.fillRect(x - bw / 2, y - 8, bw, 2); c.fillRect(x - bw / 2, y + 46, bw, 2);
      c.save(); c.translate(x, y + 10); c.scale(pop, pop); ptext(c, k.name, 0, -10, 3, GOLD, 'center'); c.restore();
      ptext(c, k.sub, x, y + 30, 2, '#ffffff', 'center');
      c.restore();
    }
  });
  HOOKS.add('drawFighter', (c, f) => {
    const s = f && f.strs; if (!s || !s.jug.on || !isOn()) return;
    const j = s.jug, x0 = Math.round(f.x - (JUG_MAX * 10 - 4) / 2), y = Math.round(f.y - 182);
    for (let k = 0; k < JUG_MAX; k++) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x0 + k * 10 - 1, y - 1, 8, 8);
      c.fillStyle = j.lock ? '#ff5a4d' : k < j.n ? GOLD : 'rgba(255,255,255,0.3)'; c.fillRect(x0 + k * 10, y, 6, 6);
    }
  });
  HOOKS.add('drawTop', (c, g) => {
    if (!isOn() || typeof ptext !== 'function') return;
    const O = OPT(), lbl = page ? 'N  MOVES' : 'N  STRINGS';
    if (g.phase === 'pause' && O && O.screen === 'moves') ptext(c, lbl, W / 2, 96, 2, HINT, 'center');
    else if (g.phase === 'select' && keyFree('KeyN')) for (let s = 0; s < 2; s++) { const px = s ? W - 12 - 300 : 12; ptext(c, lbl, px + 280, 366, 1, HINT, 'right'); }
  });

  window.STRINGS = {
    on: isOn,
    get page() { return page; }, set page(v) { page = !!v; },
    toggle,
    list: id => (LIST[id] || []).map(S => ({ name: S.name, seq: S.seq, hits: S.hits, kind: S.kind })),
    rows: (id, side, cpu) => LIST[id] ? stringRows(id, side || 0, !!cpu) : [],
    tokenOf,
    feed(f, tok) { const S = match(f, tok); if (S) land(f, foeOf(f), S); return S ? S.name : null; },   // tests: push one token as if it hit
    state: f => st(f),
    CALL, COUNT,
    JUG: { MAX: JUG_MAX, SCALE: JUG_SCALE, CAP: JUG_CAP, KB: JUG_KB }, CHASE: { V: CHASE_V, T: CHASE_T, GAP: CHASE_GAP }, AIR_WIN,
  };
})();
