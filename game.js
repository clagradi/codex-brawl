// ===== AGENT BRAWL: 8-bit parody fighter. Engine, AI, UI =====
// Depends on heads.js (generated pixel heads), pixelfont.js and sprites.js being loaded first.
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = 960, H = 540, GROUND = 468;
const TICK = 1000 / 60;            // fixed simulation step (ms)
const GRAV = 0.7, JUMP_V = -13.5;

// ---------- scaling / resize ----------
function fit() {
  const s = Math.max(0.25, Math.floor(Math.min(innerWidth / W, innerHeight / H) * 4) / 4); // quarter-pixel steps keep pixels even
  cv.style.width = Math.round(W * s) + 'px'; cv.style.height = Math.round(H * s) + 'px';
}
addEventListener('resize', fit); fit();

// ---------- audio (tiny synth, unlocked on first interaction) ----------
let AC = null, muted = false;
function audioInit() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; } }
function beep(f, d, type = 'square', v = 0.06, slide = 0.5) {
  if (!AC || muted || AC.state !== 'running') return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(AC.destination);
    const n = AC.currentTime; o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), n + d); g.gain.exponentialRampToValueAtTime(0.0001, n + d); o.start(); o.stop(n + d);
  } catch (e) { }
}
let NOISE = null;
function thud(d = 0.12, v = 0.12) { // short noise burst for impacts
  if (!AC || muted || AC.state !== 'running') return;
  try {
    if (!NOISE) { NOISE = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate); const ch = NOISE.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length); }
    const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter(); s.buffer = NOISE; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = v;
    s.connect(f); f.connect(g); g.connect(AC.destination); const n = AC.currentTime; g.gain.exponentialRampToValueAtTime(0.0001, n + d); s.start(); s.stop(n + d);
  } catch (e) { }
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, audioInit, { passive: true });

// ---------- input ----------
const keys = {}, pressed = {};
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyR', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyP', 'KeyQ', 'KeyM', 'Enter', 'Escape']);
addEventListener('keydown', e => { if (e.repeat) return; if (!keys[e.code]) pressed[e.code] = true; keys[e.code] = true; if (GAME_KEYS.has(e.code)) e.preventDefault(); if (e.code === 'KeyM') muted = !muted; });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; if (game.phase === 'fight') game.phase = 'pause'; });
function clearPressed() { for (const k in pressed) pressed[k] = false; }
const MAP = [
  { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', p: 'KeyF', k: 'KeyG', s: 'KeyH', x: 'KeyR' },
  { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', p: 'KeyK', k: 'KeyL', s: 'KeyJ', x: 'KeyI' },
];
function tap(c) { if (pressed[c]) { pressed[c] = false; return true; } return false; }

// ---------- touch controls (appear after the first touch) ----------
const touch = { on: false, ptr: new Map() };
const TBTN = [
  { code: 'KeyA', x: 70, y: 455, r: 34, lbl: '<' }, { code: 'KeyD', x: 160, y: 455, r: 34, lbl: '>' },
  { code: 'KeyW', x: 115, y: 385, r: 30, lbl: 'JUMP' }, { code: 'KeyS', x: 115, y: 505, r: 26, lbl: 'BLOCK' },
  { code: 'KeyF', x: 800, y: 475, r: 32, lbl: 'P', col: '#ffd23f' }, { code: 'KeyG', x: 870, y: 445, r: 32, lbl: 'K', col: '#ff7a5c' },
  { code: 'KeyH', x: 790, y: 400, r: 30, lbl: 'SP', col: '#7cc7ff' }, { code: 'KeyR', x: 900, y: 370, r: 30, lbl: 'SU', col: '#ff4d6d' },
  { code: 'KeyP', x: 480, y: 92, r: 18, lbl: 'II', col: '#aaa' },
];
function canvasPos(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
function hitBtn(x, y) { return TBTN.find(b => (x - b.x) ** 2 + (y - b.y) ** 2 < (b.r + 8) ** 2); }
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && !touch.on) return;
  touch.on = true; e.preventDefault(); const [x, y] = canvasPos(e); const b = hitBtn(x, y);
  if (b) { touch.ptr.set(e.pointerId, b.code); if (!keys[b.code]) pressed[b.code] = true; keys[b.code] = true; }
  else if (game.phase === 'title' || game.phase === 'over') pressed.Enter = true;   // tap anywhere = confirm on menu screens
});
cv.addEventListener('pointermove', e => {
  if (!touch.ptr.has(e.pointerId)) return; const [x, y] = canvasPos(e); const b = hitBtn(x, y); const cur = touch.ptr.get(e.pointerId);
  if (b && b.code !== cur && ['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(b.code) && ['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(cur)) { keys[cur] = false; touch.ptr.set(e.pointerId, b.code); if (!keys[b.code]) pressed[b.code] = true; keys[b.code] = true; }
});
const touchUp = e => { const c = touch.ptr.get(e.pointerId); if (c) { keys[c] = false; touch.ptr.delete(e.pointerId); } };
cv.addEventListener('pointerup', touchUp); cv.addEventListener('pointercancel', touchUp); cv.addEventListener('pointerleave', touchUp);
cv.addEventListener('contextmenu', e => e.preventDefault());

// ---------- roster ----------
const ROSTER = [
  { id: 'tibo', name: 'TIBO', tag: 'CODEX @ OPENAI', col: '#7cc7ff', spd: 3.2, pow: 1.0, hp: 100, sp: { name: 'CODEX BOLT', col: '#7cc7ff' }, su: { name: 'RATE LIMIT RESET', col: '#ff4d4d' }, bio: 'SHIPS CODEX. GRINS THROUGH EVERY OUTAGE. SUPER HITS RESET.' },
  { id: 'poteto', name: 'POTETO', tag: 'GROK BOT', col: '#f6c544', spd: 3.4, pow: 0.95, hp: 100, sp: { name: 'SWEET POTATO', col: '#c25a3a' }, su: { name: 'HUNDREDS OF PRS', col: '#58e07a' }, bio: 'REACT COMPILER ALUM. THROWS HOT SWEET POTATOES. SUPER: A PR STORM.' },
  { id: 'potato', name: 'POTATO', tag: 'STARCH BRAWLER', col: '#d9a648', spd: 2.6, pow: 1.2, hp: 115, sp: { name: 'FRY TOSS', col: '#ffd23f' }, su: { name: 'MASHED', col: '#ffe08a' }, bio: 'LUMPY, STURDY, HITS LIKE A SACK OF SPUDS. SLOW BUT TANKY.' },
  { id: 'news', name: 'NEWS', tag: 'BREAKING DAILY', col: '#f4efe1', spd: 3.0, pow: 1.0, hp: 100, sp: { name: 'HEADLINE', col: '#ffffff' }, su: { name: 'BREAKING NEWS', col: '#ff3b3b' }, bio: 'FOLDS, ROLLS, AND HITS YOU WITH THE FRONT PAGE.' },
  { id: 'dot', name: 'DOT', tag: 'TWO-DOT BLOB', col: '#f8f6f1', spd: 3.7, pow: 0.9, hp: 92, sp: { name: 'PUFF RING', col: '#e9e6de' }, su: { name: 'BIG BOUNCE', col: '#ffffff' }, bio: 'SOFT, ROUND, AND SURPRISINGLY FAST. FRAGILE THOUGH.' },
  { id: 'wang', name: 'ALEXANDR WANG', tag: 'META SUPERINTELLIGENCE', col: '#b98cff', spd: 3.1, pow: 1.05, hp: 100, sp: { name: 'SCALE BUBBLE', col: '#b98cff' }, su: { name: 'SUPERINTELLIGENCE', col: '#4f7dff' }, bio: 'CALM. IRIDESCENT BUBBLES. SUPER SUMMONS THE LAB.' },
  { id: 'muse', name: 'MUSE', tag: "META'S AGENT", col: '#f2a9ab', spd: 3.3, pow: 0.95, hp: 100, sp: { name: 'SENTINEL', col: '#7ef0ff' }, su: { name: 'SECURE VM', col: '#7ef0ff' }, bio: 'FLUFFY PERSONAL AGENT. RUNS ON ITS OWN VM. WAVES BEFORE IT HITS.' },
];
const SHORT = r => r.id === 'wang' ? 'WANG' : r.name;

// ---------- attacks ----------
// len: total ticks, hit: tick the hitbox fires, frames: ticks spent on each sheet frame (sum = len)
const ATK = {
  punch: { len: 14, hit: 6, frames: [3, 3, 3, 3, 2], box: [8, 64, -150, -30], dmg: 5, kb: 4, stun: 14 },
  kick: { len: 22, hit: 9, frames: [4, 5, 5, 4, 4], box: [10, 76, -120, -5], dmg: 8, kb: 7, stun: 20 },
  special: { len: 30, hit: 12, frames: [4, 4, 4, 6, 6, 6] },
  super: { len: 48, hit: 16, frames: [4, 4, 4, 4, 8, 8, 8, 8] },
};
function frameFromTimeline(frames, st) { let acc = 0; for (let i = 0; i < frames.length; i++) { acc += frames[i]; if (st < acc) return i; } return frames.length - 1; }

// ---------- fighter ----------
class Fighter {
  constructor(def, side, cpu) { this.d = def; this.side = side; this.cpu = cpu; this.reset(); }
  reset() {
    this.x = this.side ? W * 0.7 : W * 0.3; this.y = GROUND; this.vx = 0; this.vy = 0; this.face = this.side ? -1 : 1;
    this.hp = this.d.hp; this.meter = 0; this.state = 'idle'; this.st = 0; this.t = 0; this.hitDone = false; this.stun = 0; this.cool = 0; this.inv = 0; this.shield = 0; this.land = 0; this.combo = 0;
    this.ai = { t: 0, act: null, lastX: this.x, stuck: 0 };
  }
  get onGround() { return this.y >= GROUND; }
  busy() { return ['punch', 'kick', 'special', 'super', 'hurt', 'ko', 'win'].includes(this.state); }
  set(s) { this.state = s; this.st = 0; this.hitDone = false; }
  input() { if (this.cpu) return this.aiInput(); const m = MAP[this.side]; return { l: keys[m.l], r: keys[m.r], u: keys[m.u], d: keys[m.d], p: tap(m.p), k: tap(m.k), s: tap(m.s), x: tap(m.x) }; }
  // ---- CPU brain: picks an intent every few ticks, reacts to threats, never camps in a corner ----
  aiInput() {
    const o = game.f[1 - this.side], a = this.ai, i = {};
    const dx = o.x - this.x, dist = Math.abs(dx), lvl = game.cpuLevel;
    const toward = dx > 0 ? 'r' : 'l', away = dx > 0 ? 'l' : 'r';
    const threat = (o.state === 'punch' || o.state === 'kick' || o.state === 'special') && dist < 150 && o.st < 10;
    const incoming = game.proj.find(p => p.owner !== this && Math.sign(p.vx) === Math.sign(this.x - p.x) && Math.abs(p.x - this.x) < 230 && Math.abs(p.x - this.x) > 40);
    const atWall = this.x < 70 || this.x > W - 70;
    a.t--;
    if (Math.abs(this.x - a.lastX) < 0.5 && dist < 130) a.stuck++; else a.stuck = 0; a.lastX = this.x;
    if (a.t <= 0 || (threat && Math.random() < 0.2 + lvl * 0.25) || (incoming && Math.random() < 0.3)) {
      a.t = 8 + Math.random() * (22 - lvl * 6); const r = Math.random();
      if (this.meter >= 100 && Math.random() < 0.35 + lvl * 0.3 && dist < 420) a.act = 'super';
      else if (threat) a.act = r < 0.45 + lvl * 0.15 ? 'block' : r < 0.8 ? 'jump' : 'punch';
      else if (incoming) a.act = r < 0.5 ? 'jump' : r < 0.85 ? 'block' : 'special';
      else if (a.stuck > 40 || (atWall && dist < 120 && r < 0.5)) a.act = r < 0.5 ? 'jumpover' : 'kick';
      else if (dist > 340) a.act = r < 0.4 && this.cool <= 0 ? 'special' : r < 0.9 ? 'approach' : 'jumpfwd';
      else if (dist > 140) a.act = r < 0.18 && this.cool <= 0 ? 'special' : r < 0.78 ? 'approach' : r < 0.9 ? 'jumpfwd' : 'retreat';
      else a.act = r < 0.38 ? 'punch' : r < 0.66 ? 'kick' : r < 0.8 ? 'block' : r < 0.9 ? 'retreat' : 'wait';
    }
    switch (a.act) {
      case 'approach': i[toward] = true; break;
      case 'retreat': if (!atWall) i[away] = true; else a.act = 'jumpover'; break;
      case 'block': i.d = true; break;
      case 'jump': i.u = true; a.act = 'wait'; break;
      case 'jumpfwd': i.u = true; i[toward] = true; if (!this.onGround) a.act = 'airfwd'; break;
      case 'airfwd': i[toward] = true; if (this.onGround) a.act = 'approach'; break;
      case 'jumpover': i.u = true; i[toward] = true; if (!this.onGround) a.act = 'airover'; break;
      case 'airover': i[toward] = true; if (this.onGround) { a.act = 'wait'; a.stuck = 0; } break;
      case 'punch': i.p = true; a.act = Math.random() < 0.4 ? 'punch2' : 'wait'; break;
      case 'punch2': if (!this.busy()) { i.k = true; a.act = 'wait'; } break;
      case 'kick': i.k = true; a.act = 'wait'; break;
      case 'special': if (this.cool <= 0) i.s = true; a.act = 'wait'; break;
      case 'super': i.x = true; a.act = 'wait'; break;
    }
    return i;
  }
  update(o) {
    this.t++; if (this.cool > 0) this.cool--; if (this.inv > 0) this.inv--; if (this.shield > 0) this.shield--; if (this.land > 0) this.land--;
    const i = game.phase === 'fight' ? this.input() : {};
    this.st++;
    if (!this.busy() && this.state !== 'block') this.face = o.x > this.x ? 1 : -1;
    if (this.state === 'hurt') { if (this.st > this.stun && (this.onGround || this.st > this.stun + 30)) this.set('idle'); }
    else if (this.busy()) {
      const A = ATK[this.state];
      if (A) { if (this.st === A.hit && !this.hitDone && A.dmg) this.doHit(o, A); if (this.st >= A.len) this.set('idle'); }
      if (this.state === 'special' && this.st === ATK.special.hit) this.fireSpecial(o);
      if (this.state === 'super' && this.st === ATK.super.hit) this.fireSuper(o);
    } else {
      let mv = 0; if (i.l) mv -= 1; if (i.r) mv += 1;
      if (this.state === 'jump' && this.st === 3 && this.onGround) { this.vy = JUMP_V; beep(500, 0.08, 'triangle'); }  // jump squat
      if (i.d && this.onGround && this.state !== 'jump') { if (this.state !== 'block') this.set('block'); this.vx = 0; }
      else {
        if (this.state === 'block') this.set('idle');
        this.vx = mv * this.d.spd * (this.onGround ? 1 : 0.85);
        if (i.u && this.onGround && this.state !== 'jump') this.set('jump');
        if (this.onGround && this.state !== 'jump') this.state = mv ? 'walk' : 'idle';
        else if (!this.onGround) this.state = 'jump';
      }
      if (this.state !== 'jump' || this.st > 3) {
        if (i.p) { this.set('punch'); beep(300, 0.05); }
        else if (i.k) { this.set('kick'); beep(220, 0.06); }
        else if (i.s && this.cool <= 0) { this.set('special'); this.cool = 50; }
        else if (i.x && this.meter >= 100) { this.set('super'); this.meter = 0; game.flash = 10; game.hitstop = 8; game.banner = { t: 75, txt: this.d.su.name, col: this.d.su.col }; beep(880, 0.4, 'sawtooth', 0.07); }
      }
    }
    // physics
    if (['punch', 'kick', 'special', 'super', 'ko', 'win', 'block'].includes(this.state) && this.onGround) this.vx *= 0.7;
    if (this.state === 'hurt' && this.onGround) this.vx *= 0.86;
    this.x += this.vx; this.vy += GRAV; this.y += this.vy;
    if (this.y > GROUND) { const wasAir = this.vy > 4; this.y = GROUND; this.vy = 0; if (wasAir) { this.land = 4; if (this.state === 'jump') { this.state = 'idle'; puff(this.x, GROUND); } } }
    this.x = Math.max(46, Math.min(W - 46, this.x));
    const ov = 56 - Math.abs(this.x - o.x); // push apart
    if (ov > 0 && Math.abs(this.y - o.y) < 100 && this.state !== 'ko' && o.state !== 'ko') { const s = this.x < o.x ? -1 : 1; this.x += s * ov / 2; if (this.x < 46 || this.x > W - 46) o.x -= s * ov / 2; }
  }
  doHit(o, A) {
    this.hitDone = true;
    const [x0, x1, y0, y1] = A.box; const f = this.face;
    const ax0 = this.x + Math.min(x0 * f, x1 * f), ax1 = this.x + Math.max(x0 * f, x1 * f);
    const bx0 = o.x - 26, bx1 = o.x + 26, by0 = o.y - 150, by1 = o.y;
    if (ax1 > bx0 && ax0 < bx1 && this.y + y1 > by0 && this.y + y0 < by1) o.takeHit(this, A.dmg * this.d.pow, A.kb, A.stun, A === ATK.kick ? 'kick' : 'punch');
    else if (o.state !== 'ko') beep(140, 0.03, 'triangle', 0.02); // whiff
  }
  takeHit(src, dmg, kb, stun, kind = 'hit') {
    if (this.state === 'ko' || this.inv > 0 || game.phase !== 'fight') return;
    const facingSrc = (src.x > this.x) === (this.face > 0);
    const blocking = this.state === 'block' && facingSrc;
    let shielded = false;
    if (this.shield > 0) { dmg *= 0.35; kb *= 0.4; shielded = true; spark(this.x, this.y - 80, '#7ef0ff', 6); }
    if (blocking) { dmg *= 0.15; kb *= 0.5; spark(this.x + this.face * 28, this.y - 80, '#9cf', 6); beep(160, 0.05, 'square', 0.04); game.hitstop = 3; }
    else {
      this.set('hurt'); this.stun = stun; spark(this.x, this.y - 85, '#fff', 10); thud(); beep(120, 0.1, 'sawtooth', 0.06);
      game.shake = Math.max(game.shake, kind === 'super' ? 12 : 6); game.hitstop = Math.max(game.hitstop, kind === 'super' ? 9 : kind === 'kick' ? 6 : 5);
      this.inv = 6; src.combo = (src.lastHitT && this.t - src.lastHitT < 50) ? src.combo + 1 : 1; src.lastHitT = this.t;
      if (src.combo >= 2) game.popups.push({ x: src.x, y: src.y - 200, t: 50, txt: src.combo + ' HITS', col: '#7cc7ff' });
      if (!this.onGround || kb >= 10) this.vy = Math.min(this.vy, -4);
    }
    this.hp = Math.max(0, this.hp - dmg); this.vx = (this.x < src.x ? -1 : 1) * kb;
    src.meter = Math.min(100, src.meter + dmg * 1.5); this.meter = Math.min(100, this.meter + dmg * 0.7);
    game.popups.push({ x: this.x, y: this.y - 160, t: 40, txt: Math.round(dmg) || 1, col: blocking || shielded ? '#9cf' : '#ffd23f' });
    if (this.hp <= 0) { this.set('ko'); this.vy = -9; this.vx = (this.x < src.x ? -1 : 1) * 7; game.koBy(src, this); }
  }
  fireSpecial(o) {
    const d = this.d, id = d.id, f = this.face, x = this.x + f * 50, y = this.y - 80; beep(660, 0.15, 'triangle');
    const P = o2 => game.proj.push(Object.assign({ owner: this, x, y, vx: f * 7, vy: 0, dmg: 9 * d.pow, kb: 6, stun: 16, r: 16, life: 140, kind: id, t: 0 }, o2));
    if (id === 'tibo') P({ vx: f * 10, map: 'bolt', dmg: 9 * d.pow });
    else if (id === 'poteto') P({ vy: -7.5, grav: 0.32, vx: f * 7.5, r: 18, map: 'spud', spin: 1, dmg: 10 * d.pow });
    else if (id === 'potato') for (let k = 0; k < 3; k++) P({ vy: -3 - k * 2.2, grav: 0.3, vx: f * (6 + k), dmg: 4.5 * d.pow, r: 10, stun: 10, map: 'fry', spin: 1, kb: 3 });
    else if (id === 'news') P({ vx: f * 9.5, r: 20, map: 'paper', spin: 1 });
    else if (id === 'dot') P({ vx: f * 4.5, r: 20, grow: 0.12, map: 'ring', dmg: 8 * d.pow, kb: 8 });
    else if (id === 'wang') P({ vx: f * 4.5, r: 20, wob: true, map: 'bubble', dmg: 10 * d.pow, life: 160 });
    else if (id === 'muse') P({ vx: f * 3.5, home: true, r: 14, life: 200, map: 'drone', dmg: 8 * d.pow, stun: 14 });
  }
  fireSuper(o) {
    const d = this.d, id = d.id, f = this.face; game.shake = 10;
    if (id === 'tibo') { const fx = { kind: 'reset', x: o.x, y: o.y - 300, t: 0 }; game.fx.push(fx); game.later(24, () => { if (o.state !== 'ko' && Math.abs(o.x - fx.x) < 80) o.takeHit(this, 24 * d.pow, 12, 40, 'super'); }); this.hp = Math.min(this.d.hp, this.hp + 6); }
    else if (id === 'poteto') { for (let k = 0; k < 11; k++) game.proj.push({ owner: this, x: o.x + (k - 5) * 38 + (Math.random() - 0.5) * 30, y: -40 - k * 42, vx: 0, vy: 6.5, dmg: 3 * d.pow, kb: 3, stun: 12, r: 18, life: 220, kind: 'pr', map: 'pr', t: 0 }); }
    else if (id === 'potato') { game.fx.push({ kind: 'quake', x: this.x, y: GROUND, t: 0 }); game.later(6, () => { if (o.onGround && o.state !== 'ko') o.takeHit(this, 22 * d.pow, 10, 40, 'super'); }); }
    else if (id === 'news') { game.proj.push({ owner: this, x: this.x + f * 70, y: this.y - 85, vx: f * 12, vy: 0, dmg: 22 * d.pow, kb: 14, stun: 40, r: 70, life: 120, kind: 'breaking', t: 0, super: true }); }
    else if (id === 'dot') { this.vy = -19; this.vx = Math.sign(o.x - this.x) * Math.min(12, Math.abs(o.x - this.x) / 24); game.fx.push({ kind: 'dotdrop', t: 0 }); game.later(44, () => { game.shake = 14; thud(0.2, 0.2); if (Math.abs(o.x - this.x) < 190 && o.state !== 'ko') o.takeHit(this, 21 * d.pow, 12, 40, 'super'); game.fx.push({ kind: 'quake', x: this.x, y: GROUND, t: 30 }); }); }
    else if (id === 'wang') { game.proj.push({ owner: this, x: this.x + f * 60, y: this.y - 95, vx: f * 5.5, vy: 0, dmg: 24 * d.pow, kb: 12, stun: 40, r: 56, life: 200, kind: 'superbubble', map: 'bubble', scale: 10, t: 0, super: true }); }
    else if (id === 'muse') { this.shield = 240; this.hp = Math.min(this.d.hp, this.hp + 8); for (let k = 0; k < 3; k++) game.proj.push({ owner: this, x: this.x, y: this.y - 130 - k * 30, vx: f * (3 + k), vy: 0, home: true, dmg: 6 * d.pow, kb: 5, stun: 16, r: 14, life: 260, kind: 'muse', map: 'drone', t: -k * 8 }); }
  }
  // which sheet row/frame to show right now
  frame() {
    const s = this.state;
    if (s === 'idle' || s === 'walk' || s === 'win' || s === 'block') { if (this.land > 0 && s !== 'block') return ['jump', 0]; return [s, loopFrame(s, this.t)]; }
    if (s === 'jump') { if (this.st <= 3 && this.onGround) return ['jump', 0]; return ['jump', this.vy < -5 ? 1 : this.vy < 4 ? 2 : 3]; }
    if (ATK[s]) return [s, frameFromTimeline(ATK[s].frames, this.st)];
    if (s === 'hurt') return ['hit', Math.min(2, Math.floor(this.st / Math.max(1, this.stun) * 3))];
    if (s === 'ko') return ['ko', this.st < 6 ? 0 : this.st < 16 ? 1 : !this.onGround ? 1 : this.st < 26 ? 2 : this.st < 40 ? 3 : 4];
    return ['idle', 0];
  }
  draw() {
    const [anim, f] = this.frame();
    const airH = GROUND - this.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; const sh = Math.max(0.4, 1 - airH / 320); ctx.fillRect(Math.round(this.x - 28 * sh), GROUND - 2, Math.round(56 * sh), 6);
    if (this.state === 'hurt' && this.st % 4 < 2) ctx.globalAlpha = 0.7;
    drawSprite(ctx, this.d.id, anim, f, this.x, this.y, this.face);
    ctx.globalAlpha = 1;
    if (this.shield > 0) {
      const a = 0.35 + 0.25 * Math.sin(this.t / 4); ctx.strokeStyle = 'rgba(126,240,255,' + a + ')'; ctx.lineWidth = 4;
      ctx.strokeRect(this.x - 64, this.y - 176, 128, 180); ctx.fillStyle = 'rgba(126,240,255,0.07)'; ctx.fillRect(this.x - 64, this.y - 176, 128, 180);
      ptext(ctx, 'SECURE VM', this.x, this.y - 192, 1, '#7ef0ff', 'center');
    }
  }
}

// ---------- effects ----------
const parts = [];
function spark(x, y, c, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.8) * 8, t: 18 + Math.random() * 10, c, s: 4 }); }
function puff(x, y) { for (let i = 0; i < 6; i++) parts.push({ x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 1.5, t: 14, c: 'rgba(255,255,255,0.5)', s: 6, g: 0 }); }

// ---------- stages ----------
function pxRect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
const STAGES = [
  { name: 'CODEX TERMINAL', sky: ['#0b1022', '#1a2450'], floor: '#1c2238', floor2: '#283052', deco(t) { for (let i = 0; i < 14; i++) { const y = (i * 40 + t * 0.4) % 420; ptext(ctx, ['> CODEX RUN', '$ NPM TEST', '42 PASSED', '> /PET', 'DIFF --GIT', 'PR #' + (1000 + i * 37)][i % 6], 40 + (i * 137) % 820, y, 2, 'rgba(124,199,255,0.22)', 'left', false); } } },
  { name: 'META LAB', sky: ['#1b1036', '#3b2a7a'], floor: '#2a2050', floor2: '#3a2d6a', deco(t) { for (let i = 0; i < 9; i++) { const x = (i * 113 + t * 0.3) % W, y = 120 + Math.sin(t / 40 + i) * 40 + i * 25; drawFxMap(ctx, 'bubble', x, y, 2 + i % 3); } } },
  { name: 'LAUNCH PAD ROOFTOP', sky: ['#0a0a12', '#26203c'], floor: '#22222e', floor2: '#30303f', deco(t) { for (let i = 0; i < 60; i++) if ((i * 7 + Math.floor(t / 20)) % 9) pxRect((i * 157) % W, (i * 91) % 330, 3, 3, '#fff'); pxRect(800, 140, 16, 240, '#ddd'); pxRect(804, 110, 8, 30, '#ddd'); pxRect(796, 370, 24, 10, '#999'); } },
  { name: 'POTATO FIELD', sky: ['#7fc8ff', '#ffe1a8'], floor: '#6b4a2b', floor2: '#7d5a36', deco(t) { pxRect(800, 70, 40, 40, '#ffd23f'); pxRect(792, 78, 56, 24, '#ffd23f'); pxRect(808, 62, 24, 56, '#ffd23f'); for (let i = 0; i < 20; i++) { pxRect(i * 50 + (t * 0.1 % 50), 384, 8, 20, '#4f8f3a'); pxRect(i * 50 + (t * 0.1 % 50) - 4, 380, 16, 6, '#6cc04a'); } } },
];

// ---------- game state ----------
const game = {
  phase: 'title', mode: 1, sel: [0, 6], ready: [false, false], f: [], proj: [], fx: [], popups: [], round: 1, wins: [0, 0], timer: 99, tick: 0,
  shake: 0, flash: 0, hitstop: 0, banner: null, stage: 0, msg: null, titleSel: 0, cpuLevel: 0.5, sudden: false, delayed: [],
  later(t, fn) { this.delayed.push({ t, fn }); },
};
function startMatch() {
  game.f = [new Fighter(ROSTER[game.sel[0]], 0, false), new Fighter(ROSTER[game.sel[1]], 1, game.mode === 1)];
  game.wins = [0, 0]; game.round = 1; game.sudden = false; game.stage = Math.floor(Math.random() * STAGES.length); game.cpuLevel = 0.45; startRound();
}
function startRound() {
  game.f.forEach(f => f.reset()); game.proj = []; game.fx = []; game.popups = []; game.delayed = []; parts.length = 0; game.timer = game.sudden ? 30 : 99; game.tick = 0; game.hitstop = 0; game.banner = null;
  if (game.sudden) game.f.forEach(f => f.hp = Math.ceil(f.d.hp * 0.25));
  game.phase = 'intro'; game.msg = { t: 110, txt: game.sudden ? 'SUDDEN DEATH' : 'ROUND ' + game.round }; clearPressed();
}
game.koBy = function (w, l) {
  if (game.phase !== 'fight') return;
  game.phase = 'ko'; game.msg = { t: 160, txt: 'K.O.!' }; beep(110, 0.6, 'sawtooth', 0.08); thud(0.3, 0.2); game.wins[w.side]++; game.hitstop = 12; game.shake = 14; game.flash = 8;
  game.later(45, () => { if (w.state !== 'ko') w.set('win'); });
};
function endRoundTime() {
  const [a, b] = game.f; game.phase = 'ko';
  const pa = a.hp / a.d.hp, pb = b.hp / b.d.hp; let w = Math.abs(pa - pb) < 0.001 ? -1 : (pa > pb ? 0 : 1);
  game.msg = { t: 150, txt: w < 0 ? 'DRAW' : 'TIME!' };
  if (w >= 0) { game.wins[w]++; game.f[w].set('win'); game.f[1 - w].set('ko'); game.f[1 - w].vy = -6; } else if (game.round >= 4) { w = a.meter >= b.meter ? 0 : 1; game.wins[w]++; }
}
function nextRound() {
  if (game.wins[0] >= 2 || game.wins[1] >= 2) { game.phase = 'over'; game.msg = null; clearPressed(); return; }
  game.round++; game.cpuLevel = Math.min(1, game.cpuLevel + 0.2);
  if (game.round >= 4) game.sudden = true;
  startRound();
}

// ---------- update ----------
function update() {
  game.tick++;
  if (game.shake > 0) game.shake--; if (game.flash > 0) game.flash--;
  if (game.phase === 'sheet' || !game.f.length && !['title', 'select'].includes(game.phase)) { if (game.phase !== 'sheet') game.phase = 'title'; return; }
  if (game.phase === 'title') {
    if (tap('KeyW') || tap('ArrowUp') || tap('KeyS') || tap('ArrowDown')) { game.titleSel ^= 1; beep(400, 0.04); }
    if (tap('Enter') || tap('Space') || tap('KeyF') || tap('KeyK')) { game.mode = game.titleSel ? 2 : 1; game.phase = 'select'; game.ready = [false, false]; beep(700, 0.1); clearPressed(); }
    return;
  }
  if (game.phase === 'select') {
    const N = ROSTER.length, COLS = 4;
    const nav = (s, m) => { let c = game.sel[s]; if (tap(m.l)) c = (c + N - 1) % N; if (tap(m.r)) c = (c + 1) % N; if (tap(m.u)) c = (c - COLS + N) % N; if (tap(m.d)) c = (c + COLS) % N; if (c !== game.sel[s]) beep(500 - s * 100, 0.04); game.sel[s] = c; };
    if (game.mode === 1) {
      const m = MAP[0], s = game.ready[0] ? 1 : 0; nav(s, m);
      if (tap(m.p) || tap('Enter')) { game.ready[s] = true; beep(900, 0.12); }
      else if (tap(m.k) || tap('Escape')) { if (s === 1) game.ready[0] = false; else game.phase = 'title'; beep(300, 0.06); }
      // P2 keys can also drive the CPU pick for convenience
    } else {
      for (let s = 0; s < 2; s++) { const m = MAP[s]; if (game.ready[s]) { if (tap(m.k)) { game.ready[s] = false; beep(300, 0.06); } continue; } nav(s, m); if (tap(m.p) || (s === 0 && tap('Enter'))) { game.ready[s] = true; beep(900, 0.12); } }
      if (tap('Escape')) { game.phase = 'title'; game.ready = [false, false]; }
    }
    if (game.ready[0] && game.ready[1]) { game.ready = [false, false]; startMatch(); }
    return;
  }
  if (game.phase === 'over') {
    if (tap('Enter') || tap('KeyF') || tap('KeyK') || tap('Space')) { game.phase = 'select'; game.ready = [false, false]; }
    if (tap('KeyR') || tap('KeyI')) startMatch();
    if (tap('Escape')) game.phase = 'title';
    return;
  }
  if (game.phase === 'pause') { if (tap('KeyP') || tap('Escape') || tap('Enter')) { game.phase = 'fight'; clearPressed(); } if (tap('KeyQ')) game.phase = 'title'; return; }
  if (game.phase === 'fight' && (tap('KeyP') || tap('Escape'))) { game.phase = 'pause'; return; }
  // messages (round intro, KO) always tick
  if (game.banner && --game.banner.t <= 0) game.banner = null;
  if (game.msg) { game.msg.t--; if (game.msg.t <= 0) { game.msg = null; if (game.phase === 'intro') { game.phase = 'fight'; game.msg = { t: 40, txt: 'FIGHT!' }; beep(1000, 0.3, 'square', 0.06); clearPressed(); } else if (game.phase === 'ko') nextRound(); } }
  for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g ?? 0.4; q.t--; } for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t <= 0) parts.splice(i, 1);
  for (const p of game.popups) { p.t--; p.y -= 1; } game.popups = game.popups.filter(p => p.t > 0);
  if (game.hitstop > 0) { game.hitstop--; return; }   // hit stop: freeze the fighters and projectiles
  const [a, b] = game.f; a.update(b); b.update(a);
  for (const d of game.delayed) d.t--; for (const d of game.delayed.filter(d => d.t <= 0)) d.fn(); game.delayed = game.delayed.filter(d => d.t > 0);
  if (game.phase === 'fight' && game.tick % 60 === 0) { game.timer--; if (game.timer <= 0) endRoundTime(); }
  // projectiles
  for (const p of game.proj) {
    p.t++; if (p.t < 0) continue; p.life--; if (p.grav) p.vy += p.grav; if (p.grow) p.r += p.grow; if (p.wob) p.y += Math.sin(p.t / 6) * 1.5;
    const tgt = game.f[1 - p.owner.side];
    if (p.home) { const dy = (tgt.y - 90) - p.y, dx = tgt.x - p.x; p.vy += Math.sign(dy) * 0.14; p.vx += Math.sign(dx) * 0.16; p.vx = Math.max(-6.5, Math.min(6.5, p.vx)); p.vy = Math.max(-3.5, Math.min(3.5, p.vy)); }
    p.x += p.vx; p.y += p.vy;
    if (p.y > GROUND - 8 && (p.grav || p.kind === 'pr')) { p.life = 0; spark(p.x, GROUND - 10, p.kind === 'pr' ? '#58e07a' : '#ffd23f', 6); }
    if (Math.abs(p.x - tgt.x) < p.r + 24 && Math.abs(p.y - (tgt.y - 80)) < p.r + 70 && tgt.state !== 'ko' && game.phase === 'fight') { if (!p.hit) { tgt.takeHit(p.owner, p.dmg, p.kb, p.stun, p.super ? 'super' : 'hit'); if (p.super) p.hit = true; else p.life = 0; } }
    if (p.x < -120 || p.x > W + 120) p.life = 0;
  }
  for (const p of game.proj) for (const q of game.proj) if (p !== q && p.owner !== q.owner && p.life > 0 && q.life > 0 && !p.super && !q.super && Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) { p.life = 0; q.life = 0; spark((p.x + q.x) / 2, (p.y + q.y) / 2, '#ff0'); beep(900, 0.08, 'square', 0.04); }
  game.proj = game.proj.filter(p => p.life > 0);
  for (const fx of game.fx) fx.t++; game.fx = game.fx.filter(f => f.t < 80);
}

// ---------- render ----------
function drawHeadBox(r, x, y, s, flip) { ctx.fillStyle = '#1a1c30'; ctx.fillRect(x, y, s, s); drawHeadIcon(ctx, r.id, x, y, s, flip); }
function drawTitle() {
  const t = game.tick; const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1022'); g.addColorStop(1, '#3b2a7a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  STAGES[0].deco(t);
  ptext(ctx, 'AGENT BRAWL', W / 2 + 4, 74 + 4, 8, '#5a3a00', 'center', false); ptext(ctx, 'AGENT BRAWL', W / 2, 74, 8, '#ffd23f', 'center', false);
  ptext(ctx, 'AN 8-BIT PARODY FIGHTER', W / 2, 150, 2, '#cfe', 'center');
  ctx.fillStyle = '#1c2238'; ctx.fillRect(0, 352, W, 6);
  ROSTER.forEach((r, i) => { const f = loopFrame('idle', t + i * 11); drawSprite(ctx, r.id, 'idle', f, 95 + i * 128, 352, 1, 3); });
  const opts = ['1 PLAYER VS CPU', '2 PLAYERS'];
  opts.forEach((o, i) => ptext(ctx, (game.titleSel === i ? '▶ ' : '  ') + o, W / 2, 400 + i * 34, 3, game.titleSel === i ? '#fff' : '#889', 'center'));
  ptext(ctx, touch.on ? 'TAP TO START' : 'W/S SELECT · ENTER START · M MUTE', W / 2, 480, 2, '#99a', 'center');
  ptext(ctx, 'UNOFFICIAL FAN PARODY. NOT AFFILIATED WITH OPENAI, META OR XAI.', W / 2, 518, 1, '#667', 'center', false);
}
function drawSelect() {
  const t = game.tick; ctx.fillStyle = '#10122a'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, i * 20 + (t % 20), W, 8); }
  ptext(ctx, 'SELECT YOUR AGENT', W / 2, 24, 4, '#ffd23f', 'center');
  const COLS = 4, cs = 92, gap = 14, gx = W / 2 - (COLS * cs + (COLS - 1) * gap) / 2, gy = 118;
  ROSTER.forEach((r, i) => {
    const row = Math.floor(i / COLS), col = i % COLS; const rowCount = Math.min(COLS, ROSTER.length - row * COLS); const off = (COLS - rowCount) * (cs + gap) / 2;
    const x = gx + off + col * (cs + gap), y = gy + row * (cs + gap + 22);
    drawHeadBox(r, x, y, cs); ctx.strokeStyle = r.col; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
    ptext(ctx, SHORT(r), x + cs / 2, y + cs + 6, 2, '#fff', 'center');
    for (let s = 0; s < 2; s++) if (game.sel[s] === i) { const c = s ? '#ff4d6d' : '#4dd2ff'; const blink = game.ready[s] || Math.floor(t / 8) % 2; ctx.strokeStyle = c; ctx.lineWidth = blink ? 5 : 3; const o = s * 5; ctx.strokeRect(x - 4 - o, y - 4 - o, cs + 8 + o * 2, cs + 8 + o * 2); ptext(ctx, s ? (game.mode === 1 ? 'CPU' : 'P2') : 'P1', x + (s ? cs - 4 : 4), y + 4, 1, c, s ? 'right' : 'left'); }
  });
  for (let s = 0; s < 2; s++) { // side panels
    const r = ROSTER[game.sel[s]]; const pw = 244, px = s ? W - 16 - pw : 16, py = 100, cx = px + pw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py - 10, pw, 340);
    const anim = game.ready[s] ? 'win' : 'idle'; drawSprite(ctx, r.id, anim, loopFrame(anim, t), cx, py + 205, s ? -1 : 1, 4);
    ptext(ctx, s ? (game.mode === 1 ? 'CPU' : 'P2') : 'P1', cx, py, 2, s ? '#ff4d6d' : '#4dd2ff', 'center');
    const fitSize = str => ptextWidth(str, 2) <= pw - 12 ? 2 : 1;
    ptext(ctx, SHORT(r), cx, py + 222, 2, '#fff', 'center'); ptext(ctx, r.tag, cx, py + 244, fitSize(r.tag), r.col, 'center');
    ptext(ctx, 'SP ' + r.sp.name, cx, py + 266, fitSize('SP ' + r.sp.name), '#ccd', 'center'); ptext(ctx, 'SU ' + r.su.name, cx, py + 286, fitSize('SU ' + r.su.name), '#ccd', 'center');
    if (game.ready[s]) ptext(ctx, 'READY!', cx, py + 308, 2, '#7f7', 'center');
  }
  const r = ROSTER[game.sel[game.mode === 1 && game.ready[0] ? 1 : 0]]; ptext(ctx, r.bio, W / 2, H - 74, 2, '#dde', 'center');
  const hint = touch.on ? (game.ready[0] ? 'PICK THE CPU · P CONFIRM · K BACK' : 'D-PAD MOVE · P CONFIRM') : game.mode === 1 ? (game.ready[0] ? 'NOW PICK THE CPU OPPONENT · WASD + F · G BACK' : 'P1: WASD MOVE · F CONFIRM') : 'P1: WASD + F    P2: ARROWS + K';
  ptext(ctx, hint, W / 2, H - 44, 2, '#99a', 'center'); ptext(ctx, 'ESC: TITLE', W / 2, H - 20, 2, '#667', 'center');
}
function bar(x, y, w, h, v, max, col, rev) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6); ctx.fillStyle = '#401'; ctx.fillRect(x, y, w, h);
  const ww = Math.round(w * Math.max(0, v) / max); ctx.fillStyle = col; if (rev) ctx.fillRect(x + w - ww, y, ww, h); else ctx.fillRect(x, y, ww, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; if (rev) ctx.fillRect(x + w - ww, y, ww, Math.ceil(h / 3)); else ctx.fillRect(x, y, ww, Math.ceil(h / 3));
}
function drawProj(p) {
  if (p.t < 0) return;
  const rot = p.spin ? Math.floor(p.t / 5) % 4 * Math.PI / 2 : 0, flip = p.vx < 0;
  if (p.kind === 'breaking') { ctx.fillStyle = '#c0141c'; ctx.fillRect(p.x - 90, p.y - 40, 180, 80); ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 90, p.y - 40, 180, 6); ptext(ctx, 'BREAKING', p.x, p.y - 30, 2, '#fff', 'center', false); ptext(ctx, 'NEWS', p.x, p.y + 4, 3, '#ffd23f', 'center', false); return; }
  if (p.kind === 'superbubble') { drawFxMap(ctx, 'bubble', p.x, p.y, 9); ptext(ctx, 'ASI', p.x, p.y - 8, 2, '#fff', 'center'); return; }
  if (p.kind === 'dot') { drawFxMap(ctx, 'ring', p.x, p.y, Math.max(2, p.r / 6)); return; }
  drawFxMap(ctx, p.map, p.x, p.y, p.scale || 4, rot, flip);
}
function drawFx(fx) {
  const t = fx.t;
  if (fx.kind === 'reset') { const y = Math.min(fx.y + t * 16, fx.y + 230); drawFxMap(ctx, 'reset', fx.x, y, 5); ptext(ctx, 'RESET', fx.x, y - 14, 2, '#fff', 'center'); }
  if (fx.kind === 'quake' && t < 50) { ctx.fillStyle = 'rgba(255,224,138,' + (1 - t / 50) + ')'; for (let i = 0; i < 12; i++) ctx.fillRect(fx.x + (i - 6) * 70, GROUND - 10 - Math.abs(Math.sin(t / 4 + i)) * 40, 50, 14); }
  if (fx.kind === 'dotdrop' && t < 40) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 - t / 140) + ')'; ctx.fillRect(0, 0, W, H); }
}
function drawTouch() {
  if (!touch.on) return;
  for (const b of TBTN) { const held = keys[b.code]; ctx.globalAlpha = held ? 0.65 : 0.3; ctx.fillStyle = b.col || '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.globalAlpha = 0.9; ptext(ctx, b.lbl, b.x, b.y - 4, b.lbl.length > 2 ? 1 : 2, '#000', 'center', false); }
  ctx.globalAlpha = 1;
}
function drawFight() {
  const t = game.tick, st = STAGES[game.stage];
  ctx.save(); if (game.shake) ctx.translate(Math.round((Math.random() - 0.5) * game.shake * 2), Math.round((Math.random() - 0.5) * game.shake * 2));
  const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]); ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40); st.deco(t);
  ctx.fillStyle = st.floor; ctx.fillRect(-20, GROUND, W + 40, H); ctx.fillStyle = st.floor2; for (let i = -20; i < W + 20; i += 48) ctx.fillRect(i, GROUND, 24, 6); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-20, GROUND + 28, W + 40, 4);
  ptext(ctx, st.name, W / 2, GROUND + 40, 2, 'rgba(255,255,255,0.35)', 'center', false);
  for (const fx of game.fx) drawFx(fx);
  const order = [...game.f].sort((a, b) => (a.state === 'hurt' || a.state === 'ko' ? 1 : 0) - (b.state === 'hurt' || b.state === 'ko' ? 1 : 0)); order.forEach(f => f.draw());
  for (const p of game.proj) drawProj(p);
  for (const q of parts) { ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
  for (const p of game.popups) ptext(ctx, p.txt, p.x, p.y, 2, p.col || '#ffd23f', 'center');
  ctx.restore();
  // HUD
  const [a, b] = game.f;
  drawHeadBox(a.d, 14, 10, 56); drawHeadBox(b.d, W - 70, 10, 56, true);
  bar(80, 16, 330, 20, a.hp, a.d.hp, a.hp > a.d.hp * 0.3 ? '#ffd23f' : '#ff5050', false); bar(W - 410, 16, 330, 20, b.hp, b.d.hp, b.hp > b.d.hp * 0.3 ? '#ffd23f' : '#ff5050', true);
  bar(80, 46, 180, 8, a.meter, 100, a.meter >= 100 ? (t % 10 < 5 ? '#fff' : '#4dd2ff') : '#4dd2ff'); bar(W - 260, 46, 180, 8, b.meter, 100, b.meter >= 100 ? (t % 10 < 5 ? '#fff' : '#ff4d6d') : '#ff4d6d', true);
  ptext(ctx, SHORT(a.d), 80, 60, 2, "#fff"); ptext(ctx, SHORT(b.d), W - 80, 60, 2, '#fff', 'right');
  for (let i = 0; i < 2; i++) { ctx.fillStyle = game.wins[0] > i ? '#ffd23f' : '#333'; ctx.fillRect(272 + i * 16, 46, 10, 10); ctx.fillStyle = game.wins[1] > i ? '#ffd23f' : '#333'; ctx.fillRect(W - 292 + i * 16, 46, 10, 10); }
  ptext(ctx, String(Math.max(0, game.timer)).padStart(2, '0'), W / 2, 14, 5, game.timer <= 10 ? '#ff5050' : '#fff', 'center');
  if (a.meter >= 100 && !a.cpu) ptext(ctx, 'SUPER READY ' + (touch.on ? '[SU]' : '[R]'), 80, 76, 1, '#4dd2ff'); if (b.meter >= 100 && !b.cpu) ptext(ctx, 'SUPER READY [I]', W - 80, 76, 1, '#ff4d6d', 'right');
  if (game.flash) { ctx.fillStyle = 'rgba(255,255,255,' + game.flash / 24 + ')'; ctx.fillRect(0, 0, W, H); }
  if (game.banner) { const bn = game.banner; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, H / 2 - 120, W, 46); ptext(ctx, bn.txt, W / 2, H / 2 - 108, 3, bn.col, 'center'); }
  if (game.msg) { const big = game.msg.txt.length > 8 ? 4 : 6; ptext(ctx, game.msg.txt, W / 2, H / 2 - 30, big, game.msg.txt === 'K.O.!' ? '#ff4d4d' : '#fff', 'center'); }
  if (game.sudden && game.phase === 'fight') ptext(ctx, 'SUDDEN DEATH', W / 2, 60, 1, '#ff5050', 'center');
  if (game.phase === 'pause') { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H); ptext(ctx, 'PAUSED', W / 2, H / 2 - 60, 6, '#fff', 'center'); ptext(ctx, 'P / ESC RESUME · Q QUIT TO TITLE · M MUTE', W / 2, H / 2 + 10, 2, '#aaa', 'center'); ptext(ctx, 'P1: WASD · F PUNCH · G KICK · H SPECIAL · R SUPER', W / 2, H / 2 + 50, 1, '#889', 'center'); ptext(ctx, 'P2: ARROWS · K PUNCH · L KICK · J SPECIAL · I SUPER', W / 2, H / 2 + 66, 1, '#889', 'center'); }
  if (game.phase === 'over') {
    const gr = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 520); gr.addColorStop(0, '#2a2350'); gr.addColorStop(1, '#07060f'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const w = game.wins[0] >= 2 ? a : b, l = w === a ? b : a;
    ctx.fillStyle = '#1c2238'; ctx.fillRect(0, H - 90, W, 90);
    drawSprite(ctx, w.d.id, 'win', loopFrame('win', t), W / 2, H - 90, 1, 5); drawSprite(ctx, l.d.id, 'ko', 4, W / 2 + 200, H - 90, -1, 4);
    ptext(ctx, w.d.name + ' WINS!', W / 2, 50, 4, '#ffd23f', 'center'); ptext(ctx, (w.cpu ? 'CPU' : 'P' + (w.side + 1)) + ' TAKES IT ' + game.wins[w.side] + '-' + game.wins[l.side], W / 2, 100, 2, '#fff', 'center');
    ptext(ctx, touch.on ? 'TAP: SELECT · SU: REMATCH' : 'ENTER: CHARACTER SELECT · R: REMATCH · ESC: TITLE', W / 2, H - 22, 1, '#ccc', 'center');
  }
  if (t < 300 && game.round === 1 && !touch.on && game.phase !== 'over') ptext(ctx, 'P1: WASD · F PUNCH · G KICK · H SPECIAL · R SUPER   |   P2: ARROWS · K · L · J · I', W / 2, H - 16, 2, "rgba(255,255,255,0.8)", "center", false);
}
function drawSheet() { // debug: #sheet=tibo
  ctx.fillStyle = '#3a4370'; ctx.fillRect(0, 0, W, H);
  const id = (location.hash.split('=')[1] || 'tibo').split(',')[0]; const sh = SHEETS[id] || SHEETS.tibo; ctx.imageSmoothingEnabled = false;
  const z = Math.min(W / sh.width, H / sh.height); ctx.drawImage(sh, 0, 0, sh.width * z, sh.height * z);
  ANIMS.forEach((a, r) => ptext(ctx, a.n, 2, r * FH * z + 2, 1, '#fff'));
}
function render() {
  if (game.phase === 'sheet') drawSheet(); else if (game.phase === 'title') drawTitle(); else if (game.phase === 'select') drawSelect(); else drawFight();
  drawTouch();
}

// ---------- main loop: fixed 60 Hz simulation, render once per animation frame ----------
let acc = 0, last = performance.now(), running = true;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  let n = 0; while (acc >= TICK && n < 4) { if (running) update(); acc -= TICK; n++; }
  if (acc >= TICK) acc = 0;
  render(); requestAnimationFrame(frame);
}
// debug / test hooks: #select, #demo=i,j (CPU vs CPU), #sheet=id; window.step(n) advances the simulation
window.step = n => { for (let i = 0; i < n; i++) update(); };
(function () {
  const h = location.hash;
  if (h.startsWith('#sheet')) game.phase = 'sheet';
  if (h === '#select') { game.mode = 1; game.phase = 'select'; }
  const m = h.match(/^#demo=(\d+),(\d+)/); if (m) { game.sel = [+m[1] % ROSTER.length, +m[2] % ROSTER.length]; startMatch(); game.f[0].cpu = true; game.f[1].cpu = true; }
  const ff = h.match(/ff=(\d+)/); if (ff) window.step(+ff[1]);
  if (h.includes('stop')) running = false;
})();
buildSheets();
requestAnimationFrame(frame);
