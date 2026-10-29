// ===== AGENT BRAWL feature file: X-HAZARDS. Loaded after touch.js (see docs/ARCHITECTURE.md). =====
// Owner: the x-hazards agent. Only that agent edits this file, tools/tests/x-hazards.mjs and docs/features/x-hazards.md.
// Area: interactive arenas (one usable object per stage, K+L together next to it) and cartoon stage finishes (DOWN + SUPER during FINISH IT).
// Hooks used: HOOKS 'input' (the K+L chord next to the object, the stage-finish trigger), 'update' (mounts the arena object, ticks its cooldown),
// 'drawHud' (the stage-finish hint). BUS in: match:start, round:start. BUS out: 'hazard' { id, name, user, foe }, 'stagefinish' { id, name, winner, loser }.
// Registry: HAZARDS.register(arenaId, spec) (see docs/features/x-hazards.md). Arena files loaded before this one queue into window.HAZARD_QUEUE.
// All damage goes through Fighter.takeHit (blockable, 'damage' filter applies); finishes reuse startFinisher so the match ends as usual.
'use strict';
(() => {
  const cl = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const ph = (t, a, b) => cl((t - a) / (b - a), 0, 1), ease = k => k * k * (3 - 2 * k);
  const hs = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const rc = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const dot = (c, col, x, y, rx, ry, a) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry === undefined ? rx : ry, a || 0, 0, 7); c.fill(); };
  const tx = (c, s, x, y, size, col) => ptext(c, s, x, y, size, col || '#fff', 'center');
  const NOP = () => {};
  const WIN = 5;                                             // ticks within which K and L count as one chord
  const LIVE = new Set(['intro', 'fight', 'pause', 'finish', 'finisher', 'ko', 'outro']);
  const reg = Object.create(null), ST = { uses: 0, finishes: 0 };
  const stamp = [{ k: -99, s: -99, p: -99 }, { k: -99, s: -99, p: -99 }];
  let tick = 0, cur = null, broken = false, TMP = null;
  function fault(e) { if (!broken) { broken = true; console.error('hazards: ' + (e && e.stack ? e.stack : e)); } }

  // ---------- fighter sprites for finishes: { anim, fr, x, y, face, rot, sx, sy, a, tint, clip(-1 left half, 1 right half), hide, shw } ----------
  function fig(c, who, d) {
    if (!d || d.hide) return;
    const y = d.y === undefined ? GROUND : d.y;
    if (d.shw !== 0) dot(c, 'rgba(0,0,0,0.4)', d.x, GROUND + 2, 40 * (d.shw === undefined ? 1 : d.shw), 7);
    c.save(); c.translate(Math.round(d.x), Math.round(y));
    if (d.rot) c.rotate(d.rot);
    if (d.sx !== undefined || d.sy !== undefined) c.scale(d.sx === undefined ? 1 : d.sx, d.sy === undefined ? 1 : d.sy);
    if (d.a !== undefined) c.globalAlpha *= cl(d.a, 0, 1);
    if (d.clip) { c.beginPath(); c.rect(d.clip > 0 ? 0 : -400, -600, 400, 700); c.clip(); }
    if (d.tint) {
      if (!TMP) { TMP = document.createElement('canvas'); TMP.width = 320; TMP.height = 320; }
      const t = TMP.getContext('2d'); t.clearRect(0, 0, 320, 320); t.imageSmoothingEnabled = false;
      drawSprite(t, who.d.id, d.anim, d.fr, 160, 280, d.face || 1);
      t.globalCompositeOperation = 'source-atop'; t.fillStyle = d.tint; t.fillRect(0, 0, 320, 320); t.globalCompositeOperation = 'source-over';
      c.imageSmoothingEnabled = false; c.drawImage(TMP, -160, -280);
    } else drawSprite(c, who.d.id, d.anim, d.fr, 0, 0, d.face || 1);
    c.restore();
  }

  // ---------- the usable object on screen ----------
  const FXOBJ = { life: 1e9, t: 0, update: NOP, draw: c => paint(c) };   // one shared game.fx entry, re-pushed after every round reset
  function foeOf(f) { return game.f[1 - f.side]; }
  function vul(t) { return !!t && !t.hidden && t.inv <= 0 && t.state !== 'ko' && t.state !== 'dizzy' && t.state !== 'down' && t.state !== 'grabbed'; }
  function mount(id) {
    const sp = HAZARDS.get(id);
    cur = { aid: id, spec: sp, x: sp.x, cool: 0, flash: 0, uses: 0, t: 0 };
  }
  function glow(c, h, t) {
    const a = 0.12 + 0.06 * Math.sin(t / 8);
    dot(c, 'rgba(255,230,120,' + a + ')', 0, -h / 2, 58, h * 0.7 + 10); dot(c, 'rgba(255,230,120,' + a + ')', 0, -h / 2, 38, h * 0.5 + 4);
    for (let k = 0; k < 3; k++) { const u = ((t * 0.6 + k * 20) % 60) / 60; c.globalAlpha = 1 - u; rc(c, '#fff3b0', Math.sin(t / 15 + k * 2.1) * 36, -u * (h + 20), 3, 3); }
    c.globalAlpha = 1;
  }
  function paint(c) {
    const o = cur; if (!o || broken || !LIVE.has(game.phase)) return;
    const sp = o.spec, ready = o.cool <= 0;
    try {
      c.save(); c.translate(o.x, GROUND);
      if (ready) glow(c, sp.h, o.t);
      sp.draw(c, { t: o.t, ready, flash: o.flash, cd: ready ? 0 : o.cool / sp.cool, x: o.x });
      if (!ready && game.phase === 'fight') { rc(c, 'rgba(0,0,0,0.6)', -24, 8, 48, 6); rc(c, '#7a8396', -23, 9, Math.round(46 * (1 - o.cool / sp.cool)), 4); }
      c.restore();
      if (ready && game.phase === 'fight') for (const f of game.f) {
        if (f.cpu || f.hidden || Math.abs(f.x - o.x) > sp.reach * 1.8) continue;
        const lb = LABEL[f.side].k + '+' + LABEL[f.side].s, w = lb.length * 12 + 14, y = GROUND - Math.max(sp.h, 200) - 34 + Math.sin(o.t / 9) * 3;
        rc(c, '#000', o.x - w / 2 - 2, y - 6, w + 4, 28); rc(c, Math.abs(f.x - o.x) <= sp.reach ? '#ffe36e' : '#4a5070', o.x - w / 2, y - 4, w, 24);
        ptext(c, lb, o.x, y, 2, '#14121a', 'center', false);
        rc(c, '#ffe36e', o.x - 3, y + 21, 6, 5);
      }
    } catch (e) { fault(e); }
  }
  HOOKS.add('update', g => {
    tick++;
    if (broken || g.f.length !== 2 || !LIVE.has(g.phase)) return;
    const A = ARENAS[g.arena], id = A ? A.id : 'generic';
    if (!cur || cur.aid !== id) mount(id);
    cur.t++; if (cur.flash > 0) cur.flash--;
    if (cur.cool > 0 && g.phase === 'fight') cur.cool--;
    if (g.fx.indexOf(FXOBJ) < 0) g.fx.push(FXOBJ);
  });
  BUS.on('match:start', () => { cur = null; });
  BUS.on('round:start', () => { if (cur) { cur.cool = 0; cur.flash = 0; } for (const s of stamp) s.k = s.s = s.p = -99; });

  // ---------- using it ----------
  function near(f, o) { return Math.abs(f.x - o.x) <= o.spec.reach; }
  function canUse(f) {
    const o = cur; if (!o || o.cool > 0 || game.phase !== 'fight' || f.hidden || !f.onGround || !near(f, o)) return false;
    const s = f.state; if (s === 'idle' || s === 'walk' || s === 'block' || s === 'dash') return true;
    return (s === 'kick' || s === 'punch' || (s === 'special' && !(f.mv && f.mv.name === 'hazard'))) && f.st <= WIN + 3 && !f.contact;
  }
  // a short posed state for the user: a special that never fires; update(self, foe, st) drives it
  function pose(f, len, anim, upd) {
    f.set('special'); f.vx = 0; f.bufP = f.bufK = f.bufS = 0;
    f.mv = { name: 'hazard', len, anim: anim || 'special', hit: 9999, cool: 10, friction: 1, fire: NOP, update: upd || NOP };
  }
  function fire(f) {
    const o = cur, foe = f && foeOf(f);
    if (!o || !foe || o.cool > 0 || game.phase !== 'fight') return false;
    const sp = o.spec;
    if (f.state === 'kick' || f.state === 'punch' || f.state === 'special') { f.set('idle'); f.cool = 0; }   // the first key of the chord had just started a move
    f.bufP = f.bufK = f.bufS = 0;
    let r; try { r = sp.use(f, foe, o); } catch (e) { fault(e); return false; }
    if (r === false) return false;
    o.cool = sp.cool; o.flash = 18; o.uses++; ST.uses++;
    game.popups.push({ x: o.x, y: GROUND - sp.h - 50, t: 44, txt: sp.name });
    beep(520, 0.07, 'square', 0.05, 1.6); game.shake = Math.max(game.shake, 3);
    BUS.emit('hazard', { id: o.aid, name: sp.name, user: f, foe });
    return true;
  }
  // props that fly: a projectile the engine updates and draws but never hit-tests itself (r < 0); our own box test goes through takeHit
  function prop(f, o) {
    const p = {
      owner: f, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, r: -99, life: o.life || 120, dmg: o.dmg || 0, kb: o.kb || 0, stun: o.stun || 0, t: -(o.delay || 0), noClash: true, hz: true,
      update(p) {
        if (p.t < 0) return;
        if (o.step) o.step(p);
        p.vy += o.g || 0; p.x += p.vx; p.y += p.vy;
        const tg = foeOf(f);
        if (o.hw && !p.done && vul(tg) && Math.abs(p.x - tg.x) < o.hw && Math.abs(p.y - (tg.y - 80)) < o.hh) {
          tg.takeHit(f, o.dmg, o.kb, o.stun, o.kind || 'hit', o.opt);
          if (o.hit) o.hit(p, tg);
          if (o.pierce) p.done = true; else p.life = 0;
        }
        if (o.floor !== undefined && p.y >= GROUND - o.floor && p.life > 0) { p.life = 0; if (o.land) o.land(p); }
      },
      draw(c, p) { if (p.t >= 0) o.draw(c, p); },
    };
    game.proj.push(p); return p;
  }
  function boom(f, x, rad, dmg, kb, stun, tag, col) {
    FX.sparks(x, GROUND - 20, col || '#ffb347', 14); FX.ring(x, GROUND - 30, col || '#ffb347', 50, 18); thud(0.2, 0.14); game.shake = Math.max(game.shake, 8);
    const t = foeOf(f); if (vul(t) && Math.abs(t.x - x) < rad && t.y > GROUND - 130) t.takeHit(f, dmg, kb, stun, 'hit', { launch: true, tag });
  }
  // a lobbed prop that lands on the foe's spot: from (x0, y0) over T ticks
  function lob(f, foe, o) {
    const x0 = f.x + f.face * 46, y0 = f.y - 150, g = 0.5, T = o.T || cl(Math.abs(foe.x - x0) / 9, 20, 46);
    return prop(f, {
      x: x0, y: y0, vx: (foe.x + (o.spread || 0) - x0) / T, vy: (foe.y - 70 - y0 - g * T * (T + 1) / 2) / T, g, delay: o.delay || 0, life: 160, hw: o.hw || 44, hh: 80, floor: 0,
      dmg: o.dmg, kb: o.kb, stun: o.stun, kind: 'hit', opt: o.opt, draw: o.draw, hit: (p, tg) => { if (o.rad) boom(f, p.x, 0, 0, 0, 0); FX.sparks(p.x, p.y, o.col || '#ffb347', 10); },
      land: p => { if (o.rad) boom(f, p.x, o.rad, o.dmg * 0.8, o.kb, o.stun, o.opt && o.opt.tag, o.col); else { FX.dust(p.x, GROUND); thud(0.08, 0.08); } },
    });
  }
  const dirTo = (f, foe) => (foe.x === f.x ? f.face : Math.sign(foe.x - f.x));

  // ---------- the nine arena objects (art draws at the origin = the object's feet) and what they do ----------
  function dGpu(c, o) {
    const hot = o.ready, t = o.t;
    rc(c, '#07070c', -38, -8, 76, 10); rc(c, '#1a1d2b', -32, -46, 64, 36); rc(c, '#2f3556', -32, -46, 64, 4); rc(c, '#0f111a', -32, -14, 64, 4);
    for (const fx of [-16, 16]) {
      rc(c, '#0b0b12', fx - 12, -42, 24, 24); rc(c, hot ? '#ff7a3d' : '#5a607e', fx - 10, -40, 20, 20);
      if ((t >> 2) & 1) { rc(c, '#0b0b12', fx - 9, -31, 18, 2); rc(c, '#0b0b12', fx - 1, -39, 2, 18); } else { rc(c, '#0b0b12', fx - 7, -37, 3, 14); rc(c, '#0b0b12', fx + 4, -37, 3, 14); }
    }
    rc(c, '#d8b24a', -26, -10, 52, 3); rc(c, hot ? '#ff3b1f' : '#44302c', -32, -46, 4, 6); rc(c, hot ? '#ff3b1f' : '#44302c', 28, -46, 4, 6);
    if (hot) for (let j = 0; j < 4; j++) { const u = (t * 0.7 + j * 11) % 30; c.globalAlpha = 1 - u / 30; rc(c, '#ffb347', -24 + j * 15 + Math.sin(t / 5 + j) * 3, -50 - u, 4, 4); c.globalAlpha = 1; }
  }
  function gpuFly(c, p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.t * 0.22);
    dot(c, 'rgba(255,120,40,0.35)', 0, 0, 34, 22); rc(c, '#0b0b12', -22, -13, 44, 26); rc(c, '#ff7a3d', -19, -10, 38, 20); rc(c, '#0b0b12', -9, -9, 3, 18); rc(c, '#0b0b12', 6, -9, 3, 18); rc(c, '#d8b24a', -16, 10, 32, 3);
    c.restore();
  }
  function useGpu(f, foe) {
    pose(f, 26, 'special'); sfx(260, 0.25, 'sawtooth');
    lob(f, foe, { dmg: 12, kb: 9, stun: 22, rad: 74, delay: 8, draw: gpuFly, opt: { tag: 'THERMAL SPIKE' }, col: '#ff7a3d' });
  }
  function dRope(c, o) {
    const sw = Math.sin(o.t / 14) * (o.ready ? 4 : 2) + o.flash * Math.sin(o.t * 1.3) * 0.5;
    rc(c, '#2a2438', -30, -360, 60, 8); c.fillStyle = o.flash > 0 ? '#fff3b0' : '#d8b24a'; c.beginPath(); c.moveTo(-26 + sw * 0.3, -352); c.lineTo(26 + sw * 0.3, -352); c.lineTo(36, -316); c.lineTo(-36, -316); c.fill();
    rc(c, '#a98a2e', -36, -318, 72, 5);
    for (let y = -312; y < -58; y += 6) { const x = sw * (y + 312) / 254; rc(c, ((y / 6) | 0) & 1 ? '#c9a96a' : '#8a6d3a', x - 2, y, 4, 6); }
    const bx = sw; rc(c, '#e8d39a', bx - 7, -66, 14, 12); rc(c, '#a98a2e', bx - 7, -54, 14, 3); rc(c, '#c9a96a', bx - 4, -51, 3, 10); rc(c, '#c9a96a', bx + 1, -51, 3, 10);
    if (o.flash > 0) { c.strokeStyle = 'rgba(255,230,120,' + o.flash / 18 + ')'; c.lineWidth = 3; c.beginPath(); c.arc(0, -334, 40 + (18 - o.flash) * 3, 0, 7); c.stroke(); }
  }
  function useBell(f, foe) {
    const dx = foe.x - f.x, sd = dx === 0 ? f.face : Math.sign(dx); f.face = sd;
    const sp = sd * cl(Math.abs(dx) / 31, 4.5, 9.5); let done = false;
    pose(f, 60, 'kick', (s, o2, st) => {
      if (st === 1) { s.vx = sp; s.vy = -11.5; beep(210, 0.5, 'sine', 0.08, 0.7); }
      if (!done && st >= 3 && vul(foe) && Math.abs(foe.x - s.x) < 70 && Math.abs(foe.y - s.y) < 120) { done = true; foe.takeHit(s, 13, 9, 24, 'kick', { knock: true, tag: 'BELL RINGER' }); beep(150, 0.35, 'sine', 0.1, 0.6); }
      if (st > 6 && s.onGround) { s.vx = 0; s.st = s.mv.len; }
    });
  }
  function dBarrier(c, o) {
    rc(c, '#14121a', -46, -4, 92, 6); rc(c, '#e6e6e6', -42, -44, 84, 40);
    for (let x = -42; x < 42; x += 28) rc(c, '#d83a3a', x + 7, -44, 14, 40);
    rc(c, '#1c1c28', -42, -48, 84, 6); rc(c, '#555a70', -3, -88, 6, 40);
    rc(c, '#14121a', -28, -110, 56, 26); rc(c, o.ready ? '#ffd23f' : '#6b5e2a', -26, -108, 52, 22); ptext(c, '429', 0, -104, 2, '#14121a', 'center', false);
    rc(c, o.ready && ((o.t >> 3) & 1) ? '#ff5a3d' : '#5a2a22', -5, -120, 10, 8);
  }
  function useBarrier(f, foe) {
    const sd = dirTo(f, foe); f.face = sd; let done = false;
    pose(f, 30, 'kick', (s, o2, st) => {
      if (st === 1) beep(300, 0.2, 'square', 0.06, 2);
      s.vx = sd * 14 * (1 - st / 44);
      if (!done && st >= 3 && vul(foe) && Math.abs(foe.x - s.x) < 62 && Math.abs(foe.y - s.y) < 100) { done = true; foe.takeHit(s, 11, 12, 24, 'kick', { launch: true, tag: '429' }); s.vx = 0; s.st = s.mv.len - 6; }
      if (st >= s.mv.len - 1) s.vx = 0;
    });
  }
  function dVent(c, o) {
    rc(c, '#1a1114', -32, -6, 64, 8); rc(c, '#3b2a2e', -22, -44, 44, 38); rc(c, '#5b3f3f', -22, -44, 44, 5); rc(c, '#14090b', -14, -50, 28, 8); rc(c, '#d9822b', -24, -26, 48, 5);
    rc(c, '#2a2a2a', -1, -64, 2, 14); rc(c, o.ready ? '#e04a3a' : '#6e3a34', -9, -70, 18, 7);
    for (let j = 0; j < (o.ready ? 4 : 1); j++) { const u = ((o.t * 0.9 + j * 17) % 50) / 50; c.globalAlpha = (1 - u) * 0.7; dot(c, '#e8e8f0', Math.sin(u * 5 + j) * 8, -54 - u * 50, 7 + u * 12); } c.globalAlpha = 1;
  }
  function useVent(f, foe) {
    const x = cl(foe.x, 60, W - 60); pose(f, 22, 'special'); beep(180, 0.5, 'sawtooth', 0.05, 0.5);
    prop(f, {
      x, y: GROUND, life: 56, delay: 4, draw: (c, p) => {
        if (p.t < 30) { for (let j = 0; j < 5; j++) { c.globalAlpha = 0.5 + 0.4 * Math.sin(p.t / 2 + j); dot(c, '#e8e8f0', x + (j - 2) * 9, GROUND - ((p.t * 0.7 + j * 6) % 18), 4 + p.t / 10); } c.globalAlpha = 1; if ((p.t >> 2) & 1) tx(c, '!', x, GROUND - 60, 3, '#ff6b5c'); }
        else { const a = 1 - ph(p.t, 36, 56); c.globalAlpha = Math.max(0.1, a); for (let j = 0; j < 9; j++) dot(c, j % 2 ? '#ffffff' : '#cfd6e6', x + Math.sin(p.t / 3 + j) * 9, GROUND - 12 - j * 22, 26 + Math.sin(j) * 5, 16); c.globalAlpha = 1; }
      },
      step: p => { if (p.t >= 30 && !p.fx) { p.fx = 1; FX.dust(x, GROUND); thud(0.2, 0.1); game.shake = Math.max(game.shake, 6); beep(110, 0.3, 'sawtooth', 0.06, 0.4); if (vul(foe) && Math.abs(foe.x - x) < 50 && foe.y > GROUND - 60) foe.takeHit(f, 11, 6, 26, 'hit', { launch: true, tag: 'STEAMED' }); } },
    });
  }
  function dSign(c, o) {
    rc(c, '#4a2f1a', -4, -92, 8, 92); rc(c, '#2e1c10', -4, -92, 2, 92);
    if (o.cd > 0) { rc(c, '#c9a96a', -14, -86, 28, 4); return; }
    c.save(); c.translate(0, -84); c.rotate(Math.sin(o.t / 10) * (o.ready ? 0.08 : 0.02) + 0.04);
    rc(c, '#2b1a10', -46, -2, 92, 34); rc(c, '#c43b2a', -44, 0, 88, 30); rc(c, '#ff8a7a', -44, 0, 88, 3); ptext(c, 'DEPRECATED', 0, 10, 1, '#fff', 'center', false);
    c.restore();
  }
  function bigSign(c, x, y, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); rc(c, '#2b1a10', -112, -48, 224, 96); rc(c, '#c43b2a', -108, -44, 216, 88); rc(c, '#ff8a7a', -108, -44, 216, 6);
    ptext(c, 'DEPRECATED', 0, -16, 3, '#fff', 'center', false); ptext(c, 'USE SOMETHING NEWER', 0, 16, 1, '#ffd0c8', 'center', false); c.restore();
  }
  function useSign(f, foe) {
    const x = cl(foe.x, 60, W - 60); pose(f, 22, 'special'); beep(260, 0.15, 'triangle', 0.05, 0.6);
    prop(f, {
      x, y: GROUND, life: 60, delay: 4, draw: (c, p) => {
        const k = ph(p.t, 0, 30); dot(c, 'rgba(0,0,0,' + 0.15 + 0.3 * k + ')', x, GROUND + 2, 20 + 40 * k, 6);
        if (p.t < 30) { if ((p.t >> 2) & 1) tx(c, '!', x, GROUND - 60, 3, '#ff6b5c'); bigSign(c, x, lerp(-260, GROUND - 52, ease(ph(p.t, 6, 30))), (1 - k) * 0.3); }
        else { c.globalAlpha = 1 - ph(p.t, 40, 60); bigSign(c, x, GROUND - 46, 0.08); c.globalAlpha = 1; }
      },
      step: p => { if (p.t >= 30 && !p.fx) { p.fx = 1; FX.dust(x, GROUND); FX.dust(x - 30, GROUND); thud(0.3, 0.16); game.shake = Math.max(game.shake, 9); if (vul(foe) && Math.abs(foe.x - x) < 70 && foe.y > GROUND - 90) foe.takeHit(f, 14, 5, 30, 'hit', { knock: true, tag: 'DEPRECATED' }); } },
    });
  }
  function dGong(c, o) {
    rc(c, '#3a1d14', -46, -154, 8, 154); rc(c, '#3a1d14', 38, -154, 8, 154); rc(c, '#5a2c1c', -54, -160, 108, 10);
    const sh = o.flash > 0 ? Math.sin(o.t * 2.2) * o.flash * 0.4 : 0; rc(c, '#c9a96a', -2, -150, 4, 16);
    dot(c, '#7a5a1a', sh, -94, 37); dot(c, o.ready ? '#e8c14a' : '#a58a3a', sh, -94, 33); dot(c, '#b8902a', sh, -94, 12);
    if (o.flash > 0) { c.strokeStyle = 'rgba(255,226,120,' + o.flash / 18 + ')'; c.lineWidth = 3; c.beginPath(); c.arc(sh, -94, 36 + (18 - o.flash) * 3, 0, 7); c.stroke(); }
  }
  function useGong(f, foe, o) {
    const sd = dirTo(f, foe); f.face = sd; pose(f, 26, 'punch'); beep(130, 0.9, 'sine', 0.1, 0.9); FX.ring(o.x, GROUND - 94, '#e8c14a', 70, 24);
    prop(f, {
      x: o.x + sd * 40, y: GROUND - 70, vx: sd * 9, life: 80, delay: 6, hw: 30, hh: 70, dmg: 7, kb: 16, stun: 26, opt: { launch: true, tag: 'GONG' },
      draw: (c, p) => { for (let k = 0; k < 3; k++) { c.strokeStyle = 'rgba(255,226,120,' + (0.8 - k * 0.2) + ')'; c.lineWidth = 4; c.beginPath(); c.ellipse(p.x - sd * k * 14, p.y, 14, 60 - k * 8, 0, -1.2, 1.2); c.stroke(); } },
    });
  }
  function dTomb(c, o) {
    if (o.cd > 0) { rc(c, '#2a2118', -28, -8, 56, 8); rc(c, '#3a2e22', -18, -12, 36, 6); return; }
    c.fillStyle = o.ready ? '#8d98a8' : '#6c7480'; c.beginPath(); c.moveTo(-24, 0); c.lineTo(-24, -52); c.arc(0, -52, 24, Math.PI, 0); c.lineTo(24, 0); c.fill();
    rc(c, '#58606c', -26, -6, 52, 6); ptext(c, 'RIP', 0, -50, 2, '#3a4048', 'center', false);
    if (o.ready) { c.globalAlpha = 0.35 + 0.2 * Math.sin(o.t / 10); rc(c, '#7cffb0', -4 + Math.sin(o.t / 12) * 8, -82 - (o.t % 40) * 0.5, 8, 10); c.globalAlpha = 1; }
  }
  function tombFly(c, p) { c.fillStyle = '#8d98a8'; c.beginPath(); c.moveTo(p.x - 20, GROUND); c.lineTo(p.x - 20, GROUND - 34); c.arc(p.x, GROUND - 34, 20, Math.PI, 0); c.lineTo(p.x + 20, GROUND); c.fill(); ptext(c, 'RIP', p.x, GROUND - 32, 1, '#3a4048', 'center', false); if ((p.t >> 1) & 1) FX.dust(p.x - 20 * Math.sign(p.vx), GROUND); }
  function useTomb(f, foe, o) {
    const sd = dirTo(f, foe); f.face = sd; pose(f, 22, 'kick'); beep(90, 0.3, 'sawtooth', 0.06, 0.6);
    prop(f, { x: o.x + sd * 44, y: GROUND - 30, vx: sd * 7, life: 140, delay: 6, hw: 40, hh: 70, dmg: 10, kb: 7, stun: 24, opt: { knock: true, tag: 'TOMBSTONED' }, draw: tombFly, hit: p => { FX.sparks(p.x, GROUND - 30, '#c8d0dc', 10); } });
  }
  function dAC(c, o) {
    const vb = o.ready ? Math.sin(o.t * 2) * 0.8 : 0; c.translate(vb, 0);
    rc(c, '#16161e', -46, -4, 92, 6); rc(c, '#9aa3b2', -42, -58, 84, 54); rc(c, '#c3cad6', -42, -58, 84, 5); rc(c, '#6d7684', -42, -8, 84, 4);
    dot(c, '#2a2f3a', -12, -32, 21); const a = o.t * (o.ready ? 0.35 : 0.1);
    c.strokeStyle = '#7e8696'; c.lineWidth = 4; for (let b = 0; b < 3; b++) { c.beginPath(); c.moveTo(-12, -32); c.lineTo(-12 + Math.cos(a + b * 2.09) * 17, -32 + Math.sin(a + b * 2.09) * 17); c.stroke(); }
    for (let y = -50; y < -12; y += 6) rc(c, '#6d7684', 16, y, 22, 2);
    rc(c, o.ready ? '#7ef0ff' : '#3a5a60', 32, -54, 6, 4);
  }
  function useAC(f, foe, o) {
    const sd = dirTo(f, foe); f.face = sd; pose(f, 26, 'special'); beep(200, 0.6, 'sawtooth', 0.04, 0.8);
    prop(f, {
      x: o.x + sd * 50, y: GROUND - 90, vx: sd * 6.5, life: 120, delay: 6, hw: 62, hh: 100, dmg: 6, kb: 15, stun: 26, opt: { tag: 'COLD FRONT' },
      draw: (c, p) => { c.strokeStyle = 'rgba(180,240,255,0.8)'; c.lineWidth = 3; for (let k = 0; k < 6; k++) { const y = p.y - 70 + k * 28, x = p.x - sd * ((p.t * 3 + k * 17) % 60); c.beginPath(); c.moveTo(x, y); c.lineTo(x - sd * 34, y); c.stroke(); } rc(c, '#e8fbff', p.x - 3, p.y - 70 + ((p.t * 5) % 140), 5, 5); },
    });
  }
  function potato(c, x, y, s, rot) { c.save(); c.translate(x, y); c.rotate(rot || 0); dot(c, '#c79a4f', 0, 0, 11 * s, 8 * s, 0.4); dot(c, '#a87d38', 3 * s, 2 * s, 6 * s, 4 * s, 0.4); rc(c, '#3a2a12', -4 * s, -3 * s, 2, 2); rc(c, '#3a2a12', 2 * s, -3 * s, 2, 2); c.restore(); }
  function dSack(c, o) {
    c.save(); c.rotate(Math.sin(o.t / 12) * (o.ready ? 0.05 : 0.015));
    dot(c, '#9b7a45', 0, -26, 31, 28); dot(c, '#7e6034', 9, -22, 20, 22); rc(c, '#9b7a45', -9, -62, 18, 12); rc(c, '#5a4423', -11, -56, 22, 3);
    if (o.cd <= 0) for (const [x, y] of [[-15, -52], [0, -58], [14, -52]]) potato(c, x, y, 1);
    ptext(c, 'SPUD', 0, -30, 1, '#3a2a12', 'center', false); c.restore();
  }
  function useSack(f, foe) {
    pose(f, 34, 'special'); beep(240, 0.1, 'triangle', 0.05, 1.5);
    for (let k = 0; k < 3; k++) lob(f, foe, { dmg: 5, kb: 5, stun: 16, delay: 6 + k * 9, spread: (k - 1) * 44, hw: 36, draw: (c, p) => potato(c, p.x, p.y, 1.3, p.t * 0.3) });
  }
  function dCrate(c, o) {
    rc(c, '#3a2614', -28, -54, 56, 54); rc(c, '#8a5a2b', -25, -51, 50, 48); rc(c, '#6b4420', -25, -31, 50, 4); rc(c, '#6b4420', -2, -51, 4, 48); ptext(c, 'FRAGILE', 0, -44, 1, '#2a1a0c', 'center', false);
  }
  function useCrate(f, foe) {
    pose(f, 26, 'special');
    lob(f, foe, { dmg: 9, kb: 7, stun: 20, delay: 8, draw: (c, p) => { c.save(); c.translate(p.x, p.y); c.rotate(p.t * 0.2); rc(c, '#3a2614', -15, -15, 30, 30); rc(c, '#8a5a2b', -12, -12, 24, 24); rc(c, '#6b4420', -12, -2, 24, 3); c.restore(); }, opt: { tag: 'CRATE' } });
  }
  function sfx(f, d, ty) { beep(f, d, ty || 'square', 0.05, 0.6); }

  // ---------- stage finishes: cartoon only, nothing gory ----------
  // finish = { name, x?, reach?, len?, edge?, keepL?, scene(c, S, t, dr, w, l), tick?(S, t, w, l) }
  // S = { w, l, o (sign toward the stage centre), spot (where the loser stands), lx, wx (current x), over }; dr(c, fighter, descriptor) draws a fighter unless the scene is over.
  const fr = (a, u) => timedFrame(a, cl(u, 0, 0.999));
  const winAt = (S, w, t, a0, a1, anim) => ({ x: S.wx, anim: t >= a0 && t < a1 ? anim : 'idle', fr: t >= a0 && t < a1 ? fr(anim, ph(t, a0, a1)) : loopFrame('idle', t), face: -S.o });
  const loseAt = (S, o) => Object.assign({ x: S.lx, anim: 'hit', fr: 1, face: S.o }, o);
  const FIN = {};
  FIN.gpupit = { name: 'OOM KILLED', scene(c, S, t, dr, w, l) {
    const hit = t >= 44, y = t < 80 ? lerp(-260, GROUND - 124, ease(ph(t, 26, 44))) : lerp(GROUND - 124, -260, ease(ph(t, 80, 104)));
    dr(c, w, winAt(S, w, t, 14, 40, 'special')); dr(c, l, loseAt(S, hit ? { sy: 0.2, sx: 1.5 } : {}));
    if (y > -250) { const x = S.lx; rc(c, '#07070c', x - 66, y - 4, 132, 130); rc(c, '#1a1d2b', x - 62, y, 124, 122); rc(c, '#ff7a3d', x - 52, y + 8, 104, 14); tx(c, 'OUT OF MEMORY', x, y + 44, 1, '#ffd23f'); tx(c, '137', x, y + 70, 4, '#ff6b5c'); }
    if (hit) tx(c, 'EXIT CODE 137', S.lx, GROUND - 70 - Math.min(40, (t - 44) * 0.8), 2, '#ffd23f');
  }, tick(S, t) { if (t === 44) { FX.dust(S.lx, GROUND); FX.dust(S.lx + 30, GROUND); thud(0.3, 0.2); game.shake = 14; beep(80, 0.5, 'sawtooth', 0.08, 0.3); } } };
  FIN.cathedral = { name: 'BELL CURVED', scene(c, S, t, dr, w, l) {
    const by = lerp(-340, GROUND - 2, ease(ph(t, 26, 46))), sh = t > 46 && t < 110 ? Math.sin(t * 1.3) * (110 - t) * 0.07 : 0, x = S.lx + sh;
    dr(c, w, winAt(S, w, t, 14, 40, 'punch')); if (t < 46) dr(c, l, loseAt(S));
    c.fillStyle = '#d8b24a'; c.beginPath(); c.moveTo(x - 72, by); c.quadraticCurveTo(x - 78, by - 170, x, by - 196); c.quadraticCurveTo(x + 78, by - 170, x + 72, by); c.fill();
    rc(c, '#a98a2e', x - 78, by - 8, 156, 10); rc(c, '#f3e2a8', x - 30, by - 160, 10, 100); rc(c, '#8a6d3a', x - 4, by - 206, 8, 14);
    if (t > 46 && t < 120) tx(c, 'DONG', S.lx, GROUND - 240 - (t - 46) * 0.4, 3, '#ffd23f');
    if (t >= 120) tx(c, 'SCORED ON A CURVE', S.lx, GROUND - 240, 2, '#ffd23f');
  }, tick(S, t) { if (t === 46) { thud(0.4, 0.2); game.shake = 12; beep(120, 1.2, 'sine', 0.12, 0.7); FX.ring(S.lx, GROUND - 100, '#d8b24a', 90, 30); } } };
  function flyOff(c, S, t, dr, l, t0, t1, hgt) {
    const k = ph(t, t0, t1), sg = -S.o;
    if (t < t0) dr(c, l, loseAt(S)); else if (k < 1) dr(c, l, { x: S.lx + sg * k * 560, y: GROUND - Math.sin(k * Math.PI) * hgt + k * k * 200, anim: 'hit', fr: 2, face: S.o, rot: sg * k * 14, shw: 0 });
  }
  FIN.bridge = { name: '429 RATE LIMITED', scene(c, S, t, dr, w, l) {
    const k = ease(ph(t, 14, 40)), cx = cl(S.lx, 200, W - 200), dy = 40 * (1 - k);
    dr(c, w, winAt(S, w, t, 44, 64, 'kick')); flyOff(c, S, t, dr, l, 56, 112, 240);
    c.globalAlpha = k; rc(c, '#14121a', cx - 150, 52 - dy, 300, 150); rc(c, '#ffd23f', cx - 144, 58 - dy, 288, 138); ptext(c, '429', cx, 70 - dy, 9, '#14121a', 'center', false); ptext(c, 'TOO MANY REQUESTS', cx, 160 - dy, 2, '#14121a', 'center', false); c.globalAlpha = 1;
  }, tick(S, t) { if (t === 56) { thud(0.3, 0.2); game.shake = 14; FX.sparks(S.lx, GROUND - 90, '#ffd23f', 16); beep(500, 0.4, 'square', 0.07, 0.2); } } };
  FIN.furnace = { name: 'RECYCLED INTO A CHIP', scene(c, S, t, dr, w, l) {
    const hx = S.lx - S.o * 110, k = ease(ph(t, 34, 72)), fl = 0.55 + 0.45 * Math.sin(t / 3), u = ph(t, 84, 118), cxp = lerp(hx, hx - S.o * 140, u), cyp = GROUND - 40 - Math.sin(u * Math.PI) * 130;
    rc(c, '#07070c', hx - 70, GROUND - 150, 140, 150); rc(c, '#2a1a1c', hx - 62, GROUND - 142, 124, 142); rc(c, 'rgb(255,' + ((120 + 80 * fl) | 0) + ',40)', hx - 44, GROUND - 120, 88, 120);
    dr(c, w, winAt(S, w, t, 14, 40, 'special'));
    if (t < 74) dr(c, l, loseAt(S, { x: lerp(S.lx, hx, k), sx: 1 - 0.8 * k, sy: 1 - 0.8 * k, rot: S.o * k * 8, a: 1 - ph(t, 66, 74), shw: 1 - k }));
    if (t >= 84) { c.save(); c.translate(cxp, cyp); c.rotate(u * 6); rc(c, '#07070c', -16, -16, 32, 32); rc(c, l.d.col, -13, -13, 26, 26); rc(c, '#07070c', -6, -6, 12, 12); for (let p = -10; p <= 10; p += 10) { rc(c, '#d8b24a', p - 1, -22, 3, 6); rc(c, '#d8b24a', p - 1, 16, 3, 6); } c.restore(); }
    if (t >= 120) tx(c, 'NEW TOKENS', cxp, GROUND - 90, 2, '#ffd23f');
  }, tick(S, t) { if (t === 72) { FX.sparks(S.lx - S.o * 110, GROUND - 60, '#ff8a2b', 18); beep(200, 0.6, 'sawtooth', 0.07, 0.3); game.shake = 8; } if (t === 118) { thud(0.1, 0.1); FX.dust(S.lx - S.o * 250, GROUND); } } };
  FIN.forest = { name: 'SUNSET NOTICE', scene(c, S, t, dr, w, l) {
    const k = ease(ph(t, 28, 48)), y = lerp(-170, GROUND - 120, k), hit = t >= 48;
    dr(c, w, winAt(S, w, t, 14, 44, 'special')); dr(c, l, loseAt(S, hit ? { sy: 0.28, sx: 1.4 } : {}));
    rc(c, '#4a2f1a', S.lx - 6, y + 40, 12, GROUND - y - 40); bigSign(c, S.lx, y, hit ? 0.06 : 0.3 * (1 - k));
    if (t >= 60) tx(c, 'NO LONGER MAINTAINED', S.lx, GROUND - 250, 2, '#ffd23f');
  }, tick(S, t) { if (t === 48) { FX.dust(S.lx, GROUND); FX.dust(S.lx - 40, GROUND); thud(0.3, 0.18); game.shake = 12; beep(110, 0.4, 'sawtooth', 0.07, 0.4); } } };
  FIN.temple = { name: 'MERGE CONFLICT', keepL: false, scene(c, S, t, dr, w, l) {
    const k = ease(ph(t, 24, 54)) * (1 - ease(ph(t, 86, 104))), off = 96 * k;
    dr(c, w, winAt(S, w, t, 14, 40, 'special'));
    if (t < 24 || t >= 104) dr(c, l, loseAt(S)); else { dr(c, l, loseAt(S, { x: S.lx - off, tint: 'rgba(80,150,255,0.5)' })); dr(c, l, loseAt(S, { x: S.lx + off, tint: 'rgba(255,90,90,0.5)', shw: 0 })); }
    if (t > 28 && t < 100) { tx(c, '<<<<<<< OURS', S.lx - off, GROUND - 270, 2, '#6aa8ff'); tx(c, '=======', S.lx, GROUND - 292, 2, '#ffd23f'); tx(c, '>>>>>>> THEIRS', S.lx + off, GROUND - 248, 2, '#ff6b5c'); }
    if (t >= 104) tx(c, 'CONFLICT', S.lx, GROUND - 270, 3, '#ff6b5c');
  }, tick(S, t) { if (t === 24 || t === 86) { beep(t === 24 ? 330 : 220, 0.3, 'square', 0.06, 0.5); FX.ring(S.lx, GROUND - 90, '#ffd23f', 70, 20); } if (t === 104) { thud(0.2, 0.14); game.shake = 9; } } };
  FIN.graveyard = { name: 'GARBAGE COLLECTED', scene(c, S, t, dr, w, l) {
    const sg = -S.o, home = S.lx + sg * 84, bx = t < 96 ? lerp(S.lx + sg * 520, home, ease(ph(t, 14, 40))) : lerp(home, S.lx + sg * 700, ease(ph(t, 100, 140))), k = ease(ph(t, 44, 72)), lid = t < 74 ? -34 : 0;
    dr(c, w, winAt(S, w, t, 20, 44, 'punch'));
    if (t < 72) dr(c, l, loseAt(S, { x: lerp(S.lx, home, k), sx: 1 - 0.7 * k, sy: 1 - 0.7 * k, a: 1 - ph(t, 66, 72), shw: 1 - k }));
    rc(c, '#14121a', bx - 50, GROUND - 112, 100, 112); rc(c, '#3f9b5a', bx - 46, GROUND - 108, 92, 104); rc(c, '#2e7a44', bx - 46, GROUND - 108, 92, 8); rc(c, '#14121a', bx - 56, GROUND - 124 + lid, 112, 14); rc(c, '#2e7a44', bx - 52, GROUND - 120 + lid, 104, 8);
    tx(c, 'GC', bx, GROUND - 76, 4, '#e8ffe8');
    if (t >= 100) { c.fillStyle = '#8d98a8'; c.beginPath(); c.moveTo(S.lx - 24, GROUND); c.lineTo(S.lx - 24, GROUND - 52); c.arc(S.lx, GROUND - 52, 24, Math.PI, 0); c.lineTo(S.lx + 24, GROUND); c.fill(); tx(c, 'RIP', S.lx, GROUND - 50, 2, '#3a4048'); tx(c, 'GC PAUSE', S.lx, GROUND - 100, 2, '#7cffb0'); }
  }, tick(S, t) { if (t === 74) { thud(0.2, 0.16); game.shake = 8; beep(150, 0.3, 'square', 0.07, 0.5); } } };
  FIN.rooftop = { name: 'SHIPPED TO PROD', scene(c, S, t, dr, w, l) {
    const up = t > 64 ? Math.pow((t - 64) * 0.42, 2) * 1.6 : 0, x = S.lx, y = GROUND - up, cd = t < 20 ? 0 : t < 32 ? 3 : t < 44 ? 2 : t < 56 ? 1 : 0;
    dr(c, w, winAt(S, w, t, 50, 70, 'punch'));
    rc(c, '#14121a', x - 22, y - 232, 44, 232); rc(c, '#eef2f8', x - 19, y - 229, 38, 226); rc(c, '#c43b2a', x - 19, y - 229, 38, 22); rc(c, '#c43b2a', x - 36, y - 40, 14, 40); rc(c, '#c43b2a', x + 22, y - 40, 14, 40);
    if (t > 56) { const f = 14 + (t % 4) * 4; rc(c, '#ffb347', x - 12, y, 24, 24 + f); rc(c, '#ffe9a0', x - 6, y, 12, 14 + f); }
    if (t < 150) dr(c, l, loseAt(S, { y: y - 20, sx: 0.62, sy: 0.62, shw: 0 }));
    if (t >= 20 && t < 58 && cd) tx(c, String(cd), x, GROUND - 300, 5, '#ffd23f');
    if (t >= 58) tx(c, 'SHIPPED', x, Math.max(60, GROUND - 300 - up * 0.2), 3, '#ffd23f');
  }, tick(S, t) { if (t === 58) beep(120, 1.4, 'sawtooth', 0.08, 3); if (t === 100) { FX.sparks(S.lx, 60, '#ffd23f', 24); FX.ring(S.lx, 60, '#ffffff', 90, 24); thud(0.1, 0.1); } } };
  FIN.wasteland = { name: 'HASH BROWNED', scene(c, S, t, dr, w, l) {
    const sg = -S.o, px = lerp(S.lx + sg * 520, S.lx - sg * 560, ease(ph(t, 30, 96))), passed = (px - S.lx) * S.o >= 0;
    dr(c, w, winAt(S, w, t, 14, 40, 'special')); dr(c, l, loseAt(S, passed ? { sy: 0.16, sx: 1.6 } : {}));
    if (t < 104) potato(c, px, GROUND - 82, 9, px * 0.03);
    if (passed) tx(c, 'HASHED', S.lx, GROUND - 60 - Math.min(30, Math.max(0, (t - 60) * 0.5)), 3, '#ffd23f');
  }, tick(S, t) { if (t === 62) { thud(0.4, 0.2); game.shake = 14; FX.dust(S.lx, GROUND); beep(90, 0.5, 'sawtooth', 0.08, 0.3); } } };
  const GFIN = { name: 'FORCE PUSH', edge: true, scene(c, S, t, dr, w, l) {
    const cx = cl(S.lx, 200, W - 200), k = ease(ph(t, 12, 30));
    dr(c, w, winAt(S, w, t, 40, 62, 'punch')); flyOff(c, S, t, dr, l, 52, 108, 200);
    c.globalAlpha = k; rc(c, '#07070c', cx - 190, 70, 380, 70); rc(c, '#14212a', cx - 186, 74, 372, 62); ptext(c, 'FORCE PUSH TO MAIN', cx, 96, 2, '#7cffb0', 'center', false); c.globalAlpha = 1;
    if (t >= 52) tx(c, 'HISTORY REWRITTEN', cx, 160, 2, '#ffd23f');
  }, tick(S, t) { if (t === 52) { thud(0.3, 0.2); game.shake = 12; FX.sparks(S.lx, GROUND - 90, '#7cffb0', 14); beep(420, 0.3, 'square', 0.07, 0.3); } } };

  // a finisher spec the engine accepts (name, len, start, update, draw), built from a scene
  function makeFin(F, sp, spot) {
    const len = F.len || 150; let S = null;
    const end = (w, l) => {
      S.over = true; w.hidden = false; w.x = S.wx; w.y = GROUND; w.vx = w.vy = 0; w.face = -S.o; l.x = S.lx; l.y = GROUND; l.vx = l.vy = 0;
      if (F.keepL !== false) l.hidden = true; else { l.hidden = false; l.set('ko'); l.st = 60; }
    };
    return {
      name: F.name, len, stage: true,
      start(w, l) { S = { w, l, o: spot < W / 2 ? 1 : -1, spot, lx0: l.x, wx0: w.x, lx: l.x, wx: w.x, over: false }; w.hidden = l.hidden = true; w.vx = w.vy = l.vx = l.vy = 0; w.y = l.y = GROUND; },
      update(w, l, t) {
        if (!S || S.over) return;
        const k = ease(ph(t, 0, 12)); S.lx = lerp(S.lx0, spot, k); S.wx = lerp(S.wx0, spot + S.o * 150, k); l.x = S.lx; w.x = S.wx; w.face = -S.o; l.face = S.o;
        if (F.tick && !broken) try { F.tick(S, t, w, l); } catch (e) { fault(e); }
        if (t >= len - 1) end(w, l);
      },
      draw(c, w, l, t) {
        if (!S || broken) return;
        const dr = (c2, who, d) => { if (S.over && (who === S.w || F.keepL === false)) return; fig(c2, who, d); };
        try { F.scene(c, S, Math.min(t, len), dr, w, l); } catch (e) { fault(e); }
      },
    };
  }
  // where the finish happens for this arena and how close the loser must be
  function finOf(sp, l) {
    const F = sp.finish || GFIN, spot = F.edge || !sp.finish ? (l.x < W / 2 ? 80 : W - 80) : cl(F.x === undefined ? sp.x : F.x, 100, W - 100);
    return { F, spot, reach: F.reach || 260 };
  }
  let pend = null;
  function stage(w, l) {
    const o = cur; if (!o || broken || game.phase !== 'finish') return false;
    const { F, spot } = finOf(o.spec, l), M = MOVES[w.d.id], keep = M.fin;
    M.fin = makeFin(F, o.spec, spot);
    try { startFinisher(w, l); } finally { M.fin = keep; }
    if (game.phase !== 'finisher') return false;
    ST.finishes++; BUS.emit('stagefinish', { id: o.aid, name: F.name, winner: w, loser: l });
    return true;
  }

  // ---------- hooks: the chord next to the object, the DOWN + SUPER stage finish ----------
  HOOKS.add('input', (i, side, f) => {
    if (broken || !i || !f || f.cpu) return;
    try {
      const sd = stamp[side];
      if (i.k) sd.k = tick; if (i.s) sd.s = tick; if (i.p) sd.p = tick;
      if (game.phase === 'fight') {
        if ((i.k || i.s) && Math.abs(sd.k - sd.s) <= WIN && canUse(f) && fire(f)) { i.k = i.s = i.p = i.x = false; sd.k = sd.s = -99; }
      } else if (game.phase === 'finish' && cur && !pend && i.d && (i.x || ((i.p || i.k) && Math.abs(sd.p - sd.k) <= 4))) {
        const l = game.f.find(x => x.state === 'dizzy'), fo = l && finOf(cur.spec, l);
        if (l && l !== f && !f.hidden && Math.abs(l.x - fo.spot) <= fo.reach) { pend = { w: f, l }; i.x = i.p = i.k = i.s = false; sd.p = sd.k = -99; }
      }
    } catch (e) { fault(e); }
  });
  HOOKS.add('update', g => {   // runs before the phase logic: a stage finish asked for on the last tick starts here
    if (!pend) return;
    const p = pend; pend = null;
    try { if (g.phase === 'finish') stage(p.w, p.l); } catch (e) { fault(e); }
  }, -5);
  HOOKS.add('drawHud', (c, g) => {
    if (broken || g.phase !== 'finish' || !cur) return;
    try {
      const l = g.f.find(x => x.state === 'dizzy'), w = l && g.f[1 - l.side]; if (!l || !w || w.cpu) return;
      const fo = finOf(cur.spec, l); if (Math.abs(l.x - fo.spot) > fo.reach) return;
      const s = 'DOWN + SUPER: ' + fo.F.name, bw = s.length * 12 + 20, y = 318 + Math.sin(tick / 9) * 2;
      rc(c, '#000', W / 2 - bw / 2 - 2, y - 8, bw + 4, 34); rc(c, '#2a1f10', W / 2 - bw / 2, y - 6, bw, 30); ptext(c, s, W / 2, y, 2, '#ffd23f', 'center', false);
    } catch (e) { fault(e); }
  });

  // ---------- the registry ----------
  function norm(sp) {
    const s = Object.assign({ name: 'HAZARD', x: 92, h: 60, reach: 70, cool: 420, draw: dCrate, use: NOP }, sp || {});
    s.x = cl(s.x, 60, W - 60);
    if (s.finish) s.finish = Object.assign({ len: 150, reach: 260, keepL: true }, s.finish);
    return s;
  }
  const HAZARDS = {
    // register(arenaId, { name, x, h, reach, cool, draw(c, o), use(user, foe, obj), finish? }); later calls replace earlier ones.
    // draw paints at the object's feet (0,0) with o = { t, ready, flash, cd, x }; use returns false to refuse; finish = { name, x?, reach?, len?, edge?, keepL?, scene, tick? }.
    register(id, spec) { reg[id] = norm(spec); if (cur && cur.aid === id) mount(id); return reg[id]; },
    get: id => reg[id] || reg.generic,
    has: id => !!reg[id],
    list: () => Object.keys(reg),
    state: () => cur ? { arena: cur.aid, name: cur.spec.name, x: cur.x, cool: cur.cool, ready: cur.cool <= 0, uses: cur.uses, flash: cur.flash } : null,
    stats: () => ({ uses: ST.uses, finishes: ST.finishes, broken }),
    use: side => !!(game.f[side] && fire(game.f[side])),
    finish: side => !!(game.f[side] && game.f[1 - side] && stage(game.f[side], game.f[1 - side])),
    scenes: FIN,
  };
  const NINE = {
    gpupit: { name: 'GPU THROW', x: 96, h: 60, cool: 400, draw: dGpu, use: useGpu },
    cathedral: { name: 'BELL ROPE', x: W - 100, h: 120, reach: 64, cool: 420, draw: dRope, use: useBell },
    bridge: { name: 'RATE LIMITER', x: 104, h: 120, cool: 400, draw: dBarrier, use: useBarrier },
    furnace: { name: 'STEAM VENT', x: W - 100, h: 70, cool: 380, draw: dVent, use: useVent },
    forest: { name: 'FALLING SIGN', x: 92, h: 92, cool: 420, draw: dSign, use: useSign },
    temple: { name: 'GONG', x: W - 96, h: 150, reach: 80, cool: 400, draw: dGong, use: useGong },
    graveyard: { name: 'TOMBSTONE', x: 96, h: 70, cool: 380, draw: dTomb, use: useTomb },
    rooftop: { name: 'AC UNIT', x: W - 100, h: 60, cool: 400, draw: dAC, use: useAC },
    wasteland: { name: 'POTATO SACK', x: 96, h: 64, cool: 360, draw: dSack, use: useSack },
    generic: { name: 'CRATE', x: 92, h: 54, cool: 400, draw: dCrate, use: useCrate },
  };
  for (const id of Object.keys(NINE)) HAZARDS.register(id, Object.assign({ finish: FIN[id] || GFIN }, NINE[id]));
  const Q = window.HAZARD_QUEUE;                       // arena files loaded earlier may have queued [arenaId, spec] pairs
  window.HAZARDS = HAZARDS;
  window.HAZARD_QUEUE = { push(...a) { for (const e of a) HAZARDS.register(e[0], e[1]); return a.length; } };
  if (Array.isArray(Q)) for (const e of Q) HAZARDS.register(e[0], e[1]);
  const LABEL = [{ k: 'K', s: 'L' }, { k: '2', s: '3' }];
})();
