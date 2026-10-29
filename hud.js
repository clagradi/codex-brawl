// ===== hud.js: Agent Brawl presentation layer =====
// HUD, chiselled title text, banners, VS screen, logo, move list, post effects, announcer voice, blood/spark particles.
// Classic script, no dependencies besides the browser. Everything is generated in code (canvas fonts only).
// Exposes (globals): drawTitleText, drawHUD, hudReset, drawBanner, drawVersus, drawLogo, drawMoveList, drawPost, ANNOUNCER, FX.
// Optional globals used when present at call time: W, H, GROUND, game, AC, muted, drawPortrait, drawHeadIcon.
(function () {
  'use strict';
  const SW = 960, SH = 540, TAU = Math.PI * 2;
  const FONT = 'Impact, Haettenschweiler, "Arial Black", sans-serif';
  const UIFONT = '"Arial Black", Impact, Haettenschweiler, sans-serif';
  const gy = () => (typeof GROUND === 'number' ? GROUND : 468);

  // ---------- small helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const rgba = (c, a) => { const h = hex(c); return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + a + ')'; };
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const prng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const HCOL = { tibo: '#7cc7ff', poteto: '#f6c544', dot: '#f8f6f1', wang: '#b98cff', muse: '#f2a9ab' };
  const fcol = d => (d && (d.col || HCOL[d.id])) || '#9aa7c0';

  // ======================================================================
  // Chiselled title text
  // ======================================================================
  // Palette per style. f = 6 face stops at [0,.24,.49,.51,.76,1] (the hard step at .5 gives the chrome-horizon look).
  const STY = {
    gold: { f: ['#fffdd8', '#ffe55e', '#e5a416', '#8a4c04', '#dc9c1c', '#ffe990'], rim: ['#fff4b8', '#9a5c08'], edge: '#1d0d00', glow: '#ffae00', hi: '#fffbe6', lo: '#5a2e00' },
    blood: { f: ['#ffb4a2', '#ff4a36', '#d00f10', '#6e0000', '#c01212', '#ff5c48'], rim: ['#ffc6b8', '#7a0808'], edge: '#190000', glow: '#ff1c1c', hi: '#ffe0d8', lo: '#3c0000' },
    steel: { f: ['#ffffff', '#dfe7f2', '#9eadc2', '#3c485c', '#8294ae', '#e4edf9'], rim: ['#ffffff', '#5b6779'], edge: '#05070d', glow: '#6cb2ff', hi: '#ffffff', lo: '#1e2736' },
    ice: { f: ['#ffffff', '#c8f7ff', '#55d0f2', '#14729e', '#4cc4ea', '#e4fcff'], rim: ['#f0ffff', '#2a7ea4'], edge: '#021520', glow: '#2ee0ff', hi: '#ffffff', lo: '#073d58' },
    toxic: { f: ['#f7ffb0', '#b6ff3a', '#4fc400', '#146000', '#58d000', '#d6ff6e'], rim: ['#f4ffb8', '#2c7c00'], edge: '#041800', glow: '#6bff00', hi: '#fbffd8', lo: '#0c3a00' },
  };
  const SS = 2; // text supersampling: sprites are built at 2x and drawn scaled, so they stay crisp up to 2x zoom
  let measCtx = null;
  const meas = () => measCtx || (measCtx = mkCanvas(8, 8).getContext('2d'));
  const setSpacing = (c, px) => { if ('letterSpacing' in c) c.letterSpacing = px + 'px'; };
  function textWidth(txt, size, track) {
    const c = meas(); c.font = size + 'px ' + FONT; setSpacing(c, size * track);
    return c.measureText(txt).width - ('letterSpacing' in c ? size * track : 0);
  }
  const TEXT_CACHE = new Map();
  function buildText(txt, size, styleName, glow, track) {
    const st = STY[styleName] || STY.gold, px = size * SS, sp = px * track;
    const m = meas(); m.font = px + 'px ' + FONT; setSpacing(m, sp);
    const tw = Math.ceil(m.measureText(txt).width - ('letterSpacing' in m ? sp : 0));
    const cap = Math.round(m.measureText('H').actualBoundingBoxAscent || px * 0.78);
    const O = Math.max(3, Math.round(px * 0.12)), D = Math.max(2, Math.round(px * 0.055)), B = px * 0.3 * glow;
    const pad = Math.ceil(px * 0.1 + O + B * 1.15) + D, w = tw + pad * 2, h = cap + pad * 2 + D, by = pad + cap;
    const S = mkCanvas(w, h), F = mkCanvas(w, h), T = mkCanvas(w, h);
    const s = S.getContext('2d'), f = F.getContext('2d'), tc = T.getContext('2d');
    for (const c of [s, f, tc]) { c.font = px + 'px ' + FONT; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; setSpacing(c, sp); c.lineJoin = 'miter'; c.miterLimit = 2.2; }
    // 1. glow
    if (glow > 0) {
      s.save(); s.shadowColor = st.glow; s.shadowBlur = B; s.strokeStyle = st.glow; s.lineWidth = O; s.globalAlpha = Math.min(1, 0.9 * glow);
      s.strokeText(txt, pad, by); s.strokeText(txt, pad, by); s.restore();
    }
    // 2. extrusion slab + dark outline
    s.strokeStyle = st.edge; s.lineWidth = O;
    for (let i = D; i >= 1; i--) s.strokeText(txt, pad, by + i);
    s.strokeText(txt, pad, by);
    // 3. metal rim (visible only outside the face)
    const rg = s.createLinearGradient(0, by - cap, 0, by); rg.addColorStop(0, st.rim[0]); rg.addColorStop(1, st.rim[1]);
    s.strokeStyle = rg; s.lineWidth = O * 0.62; s.strokeText(txt, pad, by);
    // 4. face
    const fg = f.createLinearGradient(0, by - cap, 0, by);
    [0, 0.24, 0.49, 0.51, 0.76, 1].forEach((p, i) => fg.addColorStop(p, st.f[i]));
    f.fillStyle = fg; f.fillText(txt, pad, by);
    const b = Math.max(1, Math.round(px * 0.026));
    // engraved inner edge
    f.globalCompositeOperation = 'source-atop'; f.strokeStyle = 'rgba(0,0,0,0.38)'; f.lineWidth = b * 1.6; f.strokeText(txt, pad, by);
    f.globalCompositeOperation = 'source-over';
    // bevel: highlight on the top-left rim, shade on the bottom-right rim
    tc.fillStyle = st.hi; tc.fillText(txt, pad, by); tc.globalCompositeOperation = 'destination-out'; tc.fillText(txt, pad + b, by + b);
    f.globalAlpha = 0.9; f.drawImage(T, 0, 0);
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, w, h);
    tc.fillStyle = st.lo; tc.fillText(txt, pad, by); tc.globalCompositeOperation = 'destination-out'; tc.fillText(txt, pad - b, by - b);
    f.globalAlpha = 0.85; f.drawImage(T, 0, 0); f.globalAlpha = 1;
    // top shine, grit and scratches clipped to the glyphs
    f.globalCompositeOperation = 'source-atop';
    const sh = f.createLinearGradient(0, by - cap, 0, by - cap * 0.48); sh.addColorStop(0, 'rgba(255,255,255,0.38)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    f.fillStyle = sh; f.fillRect(0, by - cap, w, cap * 0.52);
    const rnd = prng(hash(txt + styleName));
    const nSpecks = Math.round(tw * cap / 520);
    for (let i = 0; i < nSpecks; i++) {
      f.fillStyle = rnd() < 0.62 ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.2)';
      f.fillRect(pad + rnd() * tw, by - cap + rnd() * cap, 1 + ((rnd() * SS) | 0), 1 + ((rnd() * SS * 0.7) | 0));
    }
    f.strokeStyle = 'rgba(0,0,0,0.16)'; f.lineWidth = SS * 0.8;
    for (let i = 0; i < Math.max(2, tw / 90); i++) { const x = pad + rnd() * tw, y = by - cap + rnd() * cap * 0.8, l = cap * (0.15 + rnd() * 0.25); f.beginPath(); f.moveTo(x, y); f.lineTo(x + l * 0.5, y + l); f.stroke(); }
    f.globalCompositeOperation = 'source-over';
    s.drawImage(F, 0, 0);
    return { cv: S, tw, w, h, pad, cap, by };
  }
  function getText(txt, size, style, glow, track) {
    const key = txt + '|' + size + '|' + style + '|' + glow + '|' + track;
    let e = TEXT_CACHE.get(key);
    if (!e) {
      e = buildText(txt, size, style, glow, track); TEXT_CACHE.set(key, e);
      if (TEXT_CACHE.size > 110) TEXT_CACHE.delete(TEXT_CACHE.keys().next().value);
    }
    return e;
  }
  let sweepCv = null;
  function sweepImage(spr, p) { // sprite with a diagonal highlight band at progress p (0..1), clipped to the glyphs
    if (!sweepCv) sweepCv = mkCanvas(8, 8);
    if (sweepCv.width !== spr.w || sweepCv.height !== spr.h) { sweepCv.width = spr.w; sweepCv.height = spr.h; }
    const c = sweepCv.getContext('2d'); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, spr.w, spr.h); c.drawImage(spr.cv, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    const cx = lerp(-spr.h * 0.5, spr.w + spr.h * 0.5, p), bw = spr.h * 0.28;
    const g = c.createLinearGradient(cx - bw, 0, cx + bw, spr.h * 0.7); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, spr.w, spr.h); c.globalCompositeOperation = 'source-over';
    return sweepCv;
  }
  // y is the vertical centre of the capital letters. opts: align, style, glow (bool|0..1), alpha, scale, rot, maxW, track (letter spacing in em), sweep (0..1).
  // Returns the drawn width in screen px.
  function drawTitleText(ctx, txt, x, y, size, opts) {
    opts = opts || {};
    txt = String(txt == null ? '' : txt).toUpperCase();
    if (!txt) return 0;
    const track = opts.track == null ? 0.03 : opts.track;
    let sz = Math.max(6, Math.round(size));
    if (opts.maxW) { const w0 = textWidth(txt, sz, track); if (w0 > opts.maxW) sz = Math.max(6, Math.floor(sz * opts.maxW / w0)); }
    const g = opts.glow === undefined || opts.glow === true ? 1 : opts.glow === false ? 0 : clamp(+opts.glow || 0, 0, 1.5);
    const spr = getText(txt, sz, opts.style || 'gold', Math.round(g * 4) / 4, track);
    const k = (opts.scale == null ? 1 : opts.scale) / SS, al = opts.align || 'center';
    const ax = al === 'left' ? spr.pad : al === 'right' ? spr.pad + spr.tw : spr.pad + spr.tw / 2;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha *= clamp(opts.alpha, 0, 1);
    ctx.translate(x, y); if (opts.rot) ctx.rotate(opts.rot); ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const img = opts.sweep > 0 && opts.sweep < 1 ? sweepImage(spr, opts.sweep) : spr.cv;
    ctx.drawImage(img, -ax, -(spr.by - spr.cap / 2));
    ctx.restore();
    return spr.tw * k;
  }

  // ======================================================================
  // Shared drawing pieces
  // ======================================================================
  function oct(c, cx, cy, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); }
  function rivet(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#4a5466');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.7; c.stroke();
  }
  function steelGrad(c, y0, y1) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#f4f8fd'); g.addColorStop(0.3, '#a3afc0'); g.addColorStop(0.52, '#5d687a'); g.addColorStop(0.56, '#3a4352'); g.addColorStop(1, '#1f2530'); return g; }
  // Chamfered, slanted-end bar outline: outer end x0 (chamfered), inner end x1 slanted by sl.
  function barPath(c, x0, x1, y, h, pad, sl) {
    const l = x0 - pad, r = x1 + pad, t = y - pad, b = y + h + pad, ch = 5 + pad * 0.6;
    c.beginPath(); c.moveTo(l + ch, t); c.lineTo(r, t); c.lineTo(r - sl, b); c.lineTo(l + ch, b); c.lineTo(l, b - ch); c.lineTo(l, t + ch); c.closePath();
  }
  function silhouette(c, x, y, w, h, flip, col) {
    const cx = x + w / 2, g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#1b2236'); g.addColorStop(1, '#090b14'); c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = rgba(col || '#9aa7c0', 0.55); c.beginPath(); c.ellipse(cx, y + h * 1.02, w * 0.42, h * 0.34, 0, Math.PI, TAU); c.fill();
    c.beginPath(); c.arc(cx + (flip ? -1 : 1) * w * 0.02, y + h * 0.42, Math.min(w, h) * 0.22, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.55)'; const ex = Math.min(w, h) * 0.08; c.fillRect(cx - ex * 1.6, y + h * 0.4, ex, ex * 0.7); c.fillRect(cx + ex * 0.6, y + h * 0.4, ex, ex * 0.7);
  }
  // Fighter portrait clipped to a rect. Uses drawPortrait, else drawHeadIcon, else a silhouette placeholder.
  function portrait(c, id, x, y, w, h, flip, col) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    try {
      if (typeof drawPortrait === 'function') drawPortrait(c, id, x, y, w, h, flip);
      else if (typeof drawHeadIcon === 'function') { const s = Math.min(w, h); drawHeadIcon(c, id, x + (w - s) / 2, y + (h - s) / 2, s, flip); }
      else silhouette(c, x, y, w, h, flip, col);
    } catch (e) { c.restore(); c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); silhouette(c, x, y, w, h, flip, col); }
    c.restore();
  }

  // ======================================================================
  // HUD
  // ======================================================================
  const mkSide = () => ({ init: false, id: null, hp: 0, trail: 0, hold: 0, hit: 0, wins: 0, pop: 0 });
  const hudS = [mkSide(), mkSide()];
  let hudLast = null, hudTimerStr = '', hudTimerAt = 0;
  function hudReset() { hudS[0] = mkSide(); hudS[1] = mkSide(); hudLast = null; hudTimerStr = ''; }

  function healthCols(r) { // bright gold when healthy, orange, then red
    const A = ['#fff7a8', '#ffd52a', '#e39208'], B = ['#ffd27a', '#ff9420', '#c2540a'], C = ['#ffc070', '#ff6e12', '#b23406'];
    let from, to, t;
    if (r > 0.45) { from = B; to = A; t = (r - 0.45) / 0.55; } else if (r > 0.15) { from = C; to = B; t = (r - 0.15) / 0.3; } else { from = C; to = C; t = 0; }
    return from.map((c, i) => mix(c, to[i], clamp(t, 0, 1)));
  }
  function updSide(i, f, wins, dt) {
    const st = hudS[i], max = (f.d && f.d.hp) || 100, hp = clamp(+f.hp || 0, 0, max);
    if (!st.init || st.id !== (f.d && f.d.id) || hp > st.hp + 0.01) { st.init = true; st.id = f.d && f.d.id; st.hp = hp; st.trail = hp; st.hold = 0; st.hit = 0; }
    else if (hp < st.hp - 0.01) { st.hp = hp; st.hold = 26; st.hit = 1; }
    if (st.hold > 0) st.hold -= dt; else if (st.trail > st.hp) st.trail = Math.max(st.hp, st.trail - (max * 0.005 + (st.trail - st.hp) * 0.035) * dt);
    if (st.trail < st.hp) st.trail = st.hp;
    st.hit = Math.max(0, st.hit - 0.1 * dt);
    if (wins > st.wins && st.init && st.wins !== -1) st.pop = 1;
    st.wins = wins; st.pop = Math.max(0, st.pop - 0.025 * dt);
  }
  function drawHealth(c, i, st, max, tick) {
    const X0 = 76, X1 = 418, Y = 18, Hh = 24, SL = 12, L = X1 - X0;
    const r = max > 0 ? clamp(st.hp / max, 0, 1) : 0, rt = max > 0 ? clamp(st.trail / max, 0, 1) : 0;
    const low = r > 0 && r <= 0.25, pulse = 0.5 + 0.5 * Math.sin(tick * 0.35);
    c.save(); if (i) { c.translate(SW, 0); c.scale(-1, 1); }
    c.save(); c.translate(0, 3); c.fillStyle = 'rgba(0,0,0,0.5)'; barPath(c, X0, X1, Y, Hh, 5, SL); c.fill(); c.restore();
    barPath(c, X0, X1, Y, Hh, 5, SL);
    if (low) { c.save(); c.shadowColor = 'rgba(255,40,30,' + (0.45 + 0.55 * pulse) + ')'; c.shadowBlur = 16; c.fillStyle = '#000'; c.fill(); c.restore(); }
    c.fillStyle = steelGrad(c, Y - 5, Y + Hh + 5); c.fill(); c.lineWidth = 1; c.strokeStyle = '#05070b'; c.stroke();
    barPath(c, X0, X1, Y, Hh, 2, SL); c.fillStyle = '#05060a'; c.fill();
    barPath(c, X0, X1, Y, Hh, 0, SL);
    let g = c.createLinearGradient(0, Y, 0, Y + Hh); g.addColorStop(0, '#42101c'); g.addColorStop(1, '#14030a'); c.fillStyle = g; c.fill();
    c.save(); c.clip();
    const ext = rr => L * rr + (rr >= 0.999 ? SL + 8 : 0);
    if (rt > r) { // damage trail
      const a = X0 + L * r, bEnd = X0 + ext(rt);
      g = c.createLinearGradient(0, Y, 0, Y + Hh); g.addColorStop(0, '#d8303c'); g.addColorStop(0.5, '#9c0c16'); g.addColorStop(1, '#4a0208'); c.fillStyle = g; c.fillRect(a, Y, bEnd - a, Hh);
      c.fillStyle = 'rgba(255,90,80,0.35)'; c.fillRect(a, Y + 1, bEnd - a, 2);
      if (st.hit > 0) { c.fillStyle = 'rgba(255,255,255,' + (st.hit * 0.9) + ')'; c.fillRect(a, Y, bEnd - a, Hh); }
    }
    if (r > 0) {
      const cols = healthCols(r), fw = ext(r);
      g = c.createLinearGradient(0, Y, 0, Y + Hh); g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
      c.fillStyle = g; c.fillRect(X0 - 8, Y, fw + 8, Hh);
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(X0 - 8, Y + 1, fw + 8, Hh * 0.3);
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(X0 - 8, Y + Hh * 0.8, fw + 8, Hh * 0.2);
      if (low) { c.fillStyle = 'rgba(255,255,255,' + (0.28 * pulse) + ')'; c.fillRect(X0 - 8, Y, fw + 8, Hh); }
      if (r < 0.999) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(X0 + L * r - 1.5, Y, 1.5, Hh); }
    }
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 1; k < 10; k++) c.fillRect(X0 + L * k / 10 - 0.5, Y, 1.2, Hh);
    c.restore();
    c.restore();
  }
  function drawPortraitChip(c, i, f, low, tick) {
    const w = 54, h = 48, y = 6, x = i ? SW - 12 - w : 12, col = fcol(f.d);
    c.save(); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 1, y + 3, w, h);
    c.fillStyle = steelGrad(c, y - 3, y + h + 3); c.fillRect(x - 3, y - 3, w + 6, h + 6); c.strokeStyle = '#05070b'; c.lineWidth = 1; c.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
    c.fillStyle = '#05060a'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, mix('#0a0c16', col, 0.35)); g.addColorStop(1, '#07080f'); c.fillStyle = g; c.fillRect(x, y, w, h);
    portrait(c, f.d && f.d.id, x, y, w, h, !!i, col);
    c.strokeStyle = rgba(col, 0.55); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (low) { c.fillStyle = 'rgba(255,0,0,' + (0.12 + 0.12 * Math.sin(tick * 0.35)) + ')'; c.fillRect(x, y, w, h); }
    // P1 / P2 / CPU chip
    const tag = f.cpu ? 'CPU' : 'P' + (i + 1);
    c.font = '10px ' + UIFONT; const tw = c.measureText(tag).width + 8, tx = i ? x + w - tw : x;
    c.fillStyle = 'rgba(5,7,12,0.85)'; c.fillRect(tx, y + h - 13, tw, 13); c.fillStyle = f.cpu ? '#ff9a8a' : '#e8f0ff'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(tag, tx + 4, y + h - 6.5);
    c.restore();
  }
  function medal(c, cx, cy, r, filled, pop) {
    if (pop > 0) r *= 1 + pop * 0.7;
    c.save();
    if (filled) {
      c.shadowColor = 'rgba(255,190,40,0.8)'; c.shadowBlur = 6 + 12 * pop;
      let g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, '#fff8c4'); g.addColorStop(0.5, '#ffc828'); g.addColorStop(1, '#a8640a');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = '#2a1500'; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r * 0.74, 0, TAU); c.stroke();
      c.strokeStyle = '#6a3a02'; c.lineWidth = Math.max(1.4, r * 0.16); c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(cx - r * 0.3, cy - r * 0.34); c.lineTo(cx + r * 0.1, cy); c.lineTo(cx - r * 0.3, cy + r * 0.34); c.stroke();
      c.beginPath(); c.moveTo(cx + r * 0.02, cy + r * 0.42); c.lineTo(cx + r * 0.42, cy + r * 0.42); c.stroke();
      if (pop > 0) { c.strokeStyle = 'rgba(255,230,120,' + pop + ')'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r * (1.3 + (1 - pop) * 1.6), 0, TAU); c.stroke(); }
    } else {
      c.fillStyle = '#080a10'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
      c.strokeStyle = '#4b5567'; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r * 0.62, 0, TAU); c.stroke();
    }
    c.restore();
  }
  function timerPlate(c, cx, cy, r, urgent, pulse) {
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.5)'; oct(c, cx, cy + 3, r + 5); c.fill();
    if (urgent) { c.shadowColor = 'rgba(255,30,20,' + (0.4 + 0.6 * pulse) + ')'; c.shadowBlur = 18; }
    oct(c, cx, cy, r + 5); c.fillStyle = steelGrad(c, cy - r - 5, cy + r + 5); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#05070b'; c.lineWidth = 1; c.stroke();
    oct(c, cx, cy, r + 1.5); c.fillStyle = '#05060a'; c.fill();
    oct(c, cx, cy, r - 1.5); const g = c.createRadialGradient(cx, cy - r * 0.3, 2, cx, cy, r); g.addColorStop(0, urgent ? '#3a0c12' : '#252e44'); g.addColorStop(1, '#06080e'); c.fillStyle = g; c.fill();
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2 - Math.PI / 8 + Math.PI / 8; rivet(c, cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1), 1.8); }
    c.restore();
  }
  function superBar(c, i, f, tick) {
    const X0 = 24, X1 = 324, Hh = 13, Y = SH - 32, SL = 10, L = X1 - X0;
    const m = clamp((+f.meter || 0) / 100, 0, 1), ready = m >= 0.999, pulse = 0.5 + 0.5 * Math.sin(tick * 0.3);
    const pal = i ? { a: '#ffc2cf', b: '#ff3a68', c: '#97103a', glow: '255,60,110', st: 'blood' } : { a: '#c4f8ff', b: '#30c6ff', c: '#0a70c4', glow: '60,200,255', st: 'ice' };
    c.save(); if (i) { c.translate(SW, 0); c.scale(-1, 1); }
    c.save(); c.translate(0, 2); c.fillStyle = 'rgba(0,0,0,0.5)'; barPath(c, X0, X1, Y, Hh, 4, SL); c.fill(); c.restore();
    barPath(c, X0, X1, Y, Hh, 4, SL);
    if (ready) { c.save(); c.shadowColor = 'rgba(' + pal.glow + ',' + (0.55 + 0.45 * pulse) + ')'; c.shadowBlur = 16; c.fillStyle = '#000'; c.fill(); c.restore(); }
    c.fillStyle = steelGrad(c, Y - 4, Y + Hh + 4); c.fill(); c.lineWidth = 1; c.strokeStyle = '#05070b'; c.stroke();
    barPath(c, X0, X1, Y, Hh, 1.5, SL); c.fillStyle = '#05060a'; c.fill();
    barPath(c, X0, X1, Y, Hh, 0, SL); c.fillStyle = '#0b1220'; c.fill();
    c.save(); c.clip();
    if (m > 0) {
      const fw = L * m + (ready ? SL + 8 : 0), g = c.createLinearGradient(0, Y, 0, Y + Hh);
      g.addColorStop(0, ready ? mix(pal.a, '#ffffff', pulse * 0.6) : pal.a); g.addColorStop(0.5, pal.b); g.addColorStop(1, pal.c);
      c.fillStyle = g; c.fillRect(X0 - 8, Y, fw + 8, Hh);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(X0 - 8, Y + 1, fw + 8, Hh * 0.32);
      if (ready) { c.fillStyle = 'rgba(255,255,255,' + (0.35 * pulse) + ')'; c.fillRect(X0 - 8, Y, fw + 8, Hh); }
      else { c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(X0 + L * m - 1.5, Y, 1.5, Hh); }
    }
    c.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 1; k < 4; k++) c.fillRect(X0 + L * k / 4 - 1, Y, 2, Hh);
    c.restore(); c.restore();
    // label
    const lx = i ? SW - X0 : X0, al = i ? 'right' : 'left', ly = Y - 13;
    if (ready) {
      const sc = 1 + 0.07 * pulse;
      let w = drawTitleText(c, 'SUPER READY', lx, ly, 23, { align: al, style: pal.st, glow: 0.6 + 0.6 * pulse, scale: sc });
      if (f.keyHint) drawTitleText(c, '[' + f.keyHint + ']', i ? lx - w - 10 : lx + w + 10, ly, 17, { align: al, style: 'steel', glow: 0 });
    } else drawTitleText(c, 'SUPER', lx, ly + 1, 15, { align: al, style: 'steel', glow: 0, alpha: 0.75 });
  }
  function drawHUD(c, g) {
    if (!g || !g.f || !g.f[0] || !g.f[1]) return;
    const tick = typeof g.tick === 'number' ? g.tick : (hudLast == null ? 0 : hudLast + 1);
    const dt = hudLast == null ? 0 : clamp(tick - hudLast, 0, 6); hudLast = tick;
    for (let i = 0; i < 2; i++) updSide(i, g.f[i], (g.wins && g.wins[i]) | 0, dt);
    const tm = g.timer, tstr = typeof tm === 'number' ? String(Math.max(0, Math.round(tm))).padStart(2, '0') : '--';
    if (tstr !== hudTimerStr) { hudTimerStr = tstr; hudTimerAt = tick; }
    const urgent = typeof tm === 'number' && tm <= 10, pulse = 0.5 + 0.5 * Math.sin(tick * 0.4);
    c.save();
    for (let i = 0; i < 2; i++) {
      const f = g.f[i], st = hudS[i], max = (f.d && f.d.hp) || 100, low = st.hp > 0 && st.hp / max <= 0.25;
      drawHealth(c, i, st, max, tick);
      drawPortraitChip(c, i, f, low, tick);
      const nx = i ? SW - 76 : 76, al = i ? 'right' : 'left';
      drawTitleText(c, (f.d && f.d.name) || '', nx, 62, 21, { align: al, style: 'steel', glow: 0, maxW: 250 });
      const need = Math.max(2, g.toWin | 0, st.wins);
      for (let k = 0; k < need; k++) { // medals grow outwards from the timer
        const mx = i ? SW - 418 + 6 + k * 21 : 418 - 6 - k * 21;
        medal(c, mx, 63, 7.5, k < st.wins, k === st.wins - 1 ? st.pop : 0);
      }
      superBar(c, i, f, tick);
    }
    // timer
    timerPlate(c, SW / 2, 40, 33, urgent, pulse);
    const tp = clamp(1 - (tick - hudTimerAt) / 14, 0, 1);
    drawTitleText(c, tstr, SW / 2, 41, 40, { style: urgent ? 'blood' : 'steel', glow: urgent ? 0.9 : 0.35, maxW: 54, scale: 1 + (urgent ? 0.2 : 0.07) * tp * tp });
    if (g.sudden) drawTitleText(c, 'SUDDEN DEATH', SW / 2, 90, 17, { style: 'blood', glow: 0.5 + 0.5 * pulse, scale: 1 + 0.05 * pulse });
    else if (g.round) drawTitleText(c, 'ROUND ' + g.round, SW / 2, 90, 15, { style: 'gold', glow: 0 });
    c.restore();
  }

  // ======================================================================
  // Banner
  // ======================================================================
  function bannerStyle(txt) {
    if (/SUDDEN|FINISH|^FIGHT/.test(txt)) return 'blood';
    if (/^ROUND/.test(txt)) return 'steel';
    return 'gold';
  }
  // t = ticks since the banner appeared. opts: style, size, y, maxW, dur (default 90), sub, subStyle. Returns true while visible.
  function drawBanner(c, txt, t, opts) {
    opts = opts || {}; txt = String(txt == null ? '' : txt).toUpperCase(); t = t == null ? 24 : t;
    const dur = opts.dur || 90, slam = 9, fade = Math.min(22, dur * 0.3);
    if (t < 0 || t >= dur || !txt) return false;
    const style = opts.style || bannerStyle(txt), col = (STY[style] || STY.gold).glow, y = opts.y == null ? 196 : opts.y;
    const size = opts.size || (txt.length > 11 ? 90 : txt.length > 7 ? 124 : 150), maxW = opts.maxW || 880;
    let sc, a = 1, shake = 0, q = 0;
    if (t < slam) { const p = t / slam; sc = lerp(3.4, 0.94, p * p); a = clamp(p * 2.6, 0, 1); shake = 2 * p; }
    else { q = clamp((t - slam) / 9, 0, 1); sc = lerp(0.94, 1, easeOutBack(q)) + 0.012 * Math.sin((t - slam) * 0.08); shake = 15 * Math.pow(1 - clamp((t - slam) / 14, 0, 1), 2); }
    let fq = 0; if (t > dur - fade) { fq = (t - (dur - fade)) / fade; a *= 1 - fq; sc *= 1 + fq * 0.18; }
    const rnd = prng(t * 7919 + 13);
    const sx = shake ? (rnd() - 0.5) * 2 * shake : 0, sy = shake ? (rnd() - 0.5) * 2 * shake : 0, cx = SW / 2;
    c.save();
    // dark band with accent rules
    const bh = size * 1.55, bg = c.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.22, 'rgba(0,0,0,0.62)'); bg.addColorStop(0.78, 'rgba(0,0,0,0.62)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a * clamp(t / 5, 0, 1); c.fillStyle = bg; c.fillRect(0, y - bh / 2, SW, bh);
    const lg = c.createLinearGradient(0, 0, SW, 0); lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, rgba(col, 0.9)); lg.addColorStop(1, rgba(col, 0));
    c.fillStyle = lg; const lw = SW * clamp(t / 10, 0, 1), lx = cx - lw / 2; c.fillRect(lx, y - bh * 0.3, lw, 2); c.fillRect(lx, y + bh * 0.3 - 2, lw, 2);
    // rays
    c.save(); c.translate(cx, y); c.globalAlpha = a * 0.16; c.fillStyle = col; const ra = t * 0.004;
    for (let i = 0; i < 14; i++) { const an = ra + i * TAU / 14, w2 = 0.05; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(an - w2) * 700, Math.sin(an - w2) * 700 * 0.35); c.lineTo(Math.cos(an + w2) * 700, Math.sin(an + w2) * 700 * 0.35); c.closePath(); c.fill(); }
    c.restore();
    // impact shockwave + flash
    if (t >= slam && t < slam + 14) {
      const p = (t - slam) / 14; c.save(); c.globalAlpha = a * (1 - p) * 0.9; c.strokeStyle = '#ffffff'; c.lineWidth = 5 * (1 - p) + 1;
      c.beginPath(); c.ellipse(cx, y, 80 + p * 520, 22 + p * 80, 0, 0, TAU); c.stroke();
      c.globalAlpha = a * (1 - p) * 0.3; c.fillStyle = '#fff'; c.fillRect(0, y - bh * 0.3, SW, bh * 0.6); c.restore();
    }
    c.globalAlpha = 1;
    if (t < slam + 8) drawTitleText(c, txt, cx + sx, y + sy, size, { style, scale: sc * 1.12, alpha: a * 0.28, maxW, glow: 0 }); // ghost echo
    drawTitleText(c, txt, cx + sx, y + sy, size, { style, scale: sc, alpha: a, maxW, glow: 1 });
    if (opts.sub) drawTitleText(c, opts.sub, cx + sx * 0.5, y + size * 0.62 + sy * 0.5, Math.round(size * 0.26), { style: opts.subStyle || 'steel', glow: 0, alpha: a * clamp((t - slam) / 8, 0, 1), maxW: 700 });
    c.restore();
    return true;
  }

  // ======================================================================
  // VS screen
  // ======================================================================
  const seamX = y => SW / 2 + 66 - 132 * (y / SH);
  const mxs = (side, v) => (side ? SW - v : v);
  function polyPath(c, pts) { c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.closePath(); }
  function drawVersus(c, a, b, t, arenaName) {
    t = t || 0; const fs = [a || {}, b || {}], cols = [fcol(fs[0]), fcol(fs[1])];
    c.save();
    c.fillStyle = '#05060c'; c.fillRect(0, 0, SW, SH);
    // split background halves
    for (let s = 0; s < 2; s++) {
      c.save(); polyPath(c, s ? [[SW, 0], [seamX(0), 0], [seamX(SH), SH], [SW, SH]] : [[0, 0], [seamX(0), 0], [seamX(SH), SH], [0, SH]]); c.clip();
      const col = cols[s], base = s ? '#1e0610' : '#081230';
      let g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, mix(base, col, 0.2)); g.addColorStop(1, '#04050b'); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
      g = c.createRadialGradient(mxs(s, 215), 250, 10, mxs(s, 215), 250, 420); g.addColorStop(0, rgba(col, 0.42)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
      c.fillStyle = rgba(col, 0.07); // speed stripes
      for (let i = 0; i < 12; i++) { const x0 = ((i * 97 + t * (s ? -2.6 : 2.6)) % (SW + 360) + (SW + 360)) % (SW + 360) - 220, w = 14 + (i % 4) * 14; polyPath(c, [[x0, 0], [x0 + w, 0], [x0 + w - 150, SH], [x0 - 150, SH]]); c.fill(); }
      c.restore();
    }
    // embers
    for (let i = 0; i < 34; i++) {
      const sp = 0.45 + (i % 4) * 0.28, x = (i * 151) % SW + Math.sin(t * 0.03 + i) * 14, y = SH - ((t * sp + i * 71) % (SH + 40)) + 20, s = 1 + (i % 3);
      c.fillStyle = (i % 3 ? 'rgba(255,170,60,' : 'rgba(255,255,255,') + (0.25 + 0.25 * ((i * 7) % 3) / 2) + ')'; c.fillRect(Math.round(x), Math.round(y), s, s);
    }
    // portrait panels
    const names = [fs[0].name || '', fs[1].name || ''], tags = [fs[0].tag || '', fs[1].tag || ''];
    for (let s = 0; s < 2; s++) {
      const p = easeOut(clamp((t - 4) / 38, 0, 1)), off = (1 - p) * -520 * (s ? -1 : 1), bob = t > 42 ? Math.sin(t * 0.05 + s * 2) * 2 : 0, col = cols[s];
      c.save(); c.translate(off, bob);
      const P = [[mxs(s, 40), 76], [mxs(s, 418), 76], [mxs(s, 332), 474], [mxs(s, 40), 474]];
      c.save(); c.translate(0, 8); c.fillStyle = 'rgba(0,0,0,0.55)'; polyPath(c, P); c.fill(); c.restore();
      polyPath(c, P); c.save(); c.shadowColor = rgba(col, 0.8); c.shadowBlur = 22; c.fillStyle = '#05060c'; c.fill(); c.restore();
      c.save(); polyPath(c, P); c.clip();
      let g = c.createLinearGradient(0, 76, 0, 474); g.addColorStop(0, mix('#0b0e1c', col, 0.5)); g.addColorStop(1, '#06070e'); c.fillStyle = g; c.fillRect(0, 70, SW, 410);
      g = c.createRadialGradient(mxs(s, 215), 240, 10, mxs(s, 215), 240, 260); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 70, SW, 410);
      portrait(c, fs[s].id, mxs(s, 215) - 170, 88, 340, 386, !!s, col);
      g = c.createLinearGradient(0, 360, 0, 474); g.addColorStop(0, 'rgba(3,4,10,0)'); g.addColorStop(1, 'rgba(3,4,10,0.92)'); c.fillStyle = g; c.fillRect(0, 360, SW, 120);
      c.restore();
      polyPath(c, P); c.lineWidth = 6; c.strokeStyle = steelGrad(c, 70, 480); c.stroke(); c.lineWidth = 1.5; c.strokeStyle = '#05070b'; c.stroke();
      c.save(); polyPath(c, [[mxs(s, 46), 82], [mxs(s, 412), 82], [mxs(s, 337), 468], [mxs(s, 46), 468]]); c.lineWidth = 1.5; c.strokeStyle = rgba(col, 0.7); c.stroke(); c.restore();
      rivet(c, mxs(s, 40), 76, 4); rivet(c, mxs(s, 40), 474, 4); rivet(c, mxs(s, 418), 76, 4); rivet(c, mxs(s, 332), 474, 4);
      c.restore();
      // name plate slides in a little later from the outer edge
      const np = easeOut(clamp((t - 24) / 22, 0, 1)), nx = mxs(s, 192) + (1 - np) * (s ? 260 : -260);
      c.save(); c.globalAlpha = np; c.translate(0, bob);
      drawTitleText(c, names[s], nx, 424, 58, { style: 'steel', glow: 0.5, maxW: 292 });
      const tg = tags[s]; if (tg) { c.font = '13px ' + UIFONT; setSpacing(c, 2); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#05060c'; c.fillText(tg, nx + 1, 458 + 1); c.fillStyle = mix('#ffffff', col, 0.45); c.fillText(tg, nx, 458); setSpacing(c, 0); }
      c.restore();
    }
    // seam: bright slash + flickering lightning
    const fl = 0.6 + 0.4 * Math.sin(t * 0.7);
    c.save(); polyPath(c, [[seamX(0) - 3, 0], [seamX(0) + 3, 0], [seamX(SH) + 3, SH], [seamX(SH) - 3, SH]]); c.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.1 * fl) + ')'; c.fill(); c.restore();
    const bolt = (alpha, wid, col) => {
      const rr = prng(Math.floor(t / 2) * 31 + 5); c.beginPath(); c.moveTo(seamX(0), 0);
      for (let y = 30; y < SH; y += 30) c.lineTo(seamX(y) + (rr() - 0.5) * 34, y);
      c.lineTo(seamX(SH), SH); c.lineWidth = wid; c.strokeStyle = rgba(col, alpha); c.stroke();
    };
    if (t > 30) { c.save(); c.globalAlpha = clamp((t - 30) / 12, 0, 1); bolt(0.25, 9, '#7ad0ff'); bolt(0.6, 3.5, '#a8e4ff'); bolt(1, 1.4, '#ffffff'); c.restore(); }
    // VS slam
    if (t >= 44) {
      const vt = t - 44, vsc = vt < 10 ? lerp(5, 0.92, (vt / 10) * (vt / 10)) : lerp(0.92, 1, easeOutBack(clamp((vt - 10) / 10, 0, 1))) + 0.025 * Math.sin(vt * 0.12);
      const va = clamp(vt / 4, 0, 1), vy = SH / 2 - 8, sh = vt >= 10 && vt < 26 ? 13 * Math.pow(1 - (vt - 10) / 16, 2) : 0, rr = prng(t * 17 + 3);
      const sx = sh ? (rr() - 0.5) * 2 * sh : 0, sy = sh ? (rr() - 0.5) * 2 * sh : 0;
      c.save(); c.globalAlpha = va;
      c.save(); c.translate(SW / 2, vy); const sp = 0.35 + 0.1 * Math.sin(t * 0.08); // starburst
      let g = c.createRadialGradient(0, 0, 20, 0, 0, 230); g.addColorStop(0, 'rgba(255,60,30,' + sp + ')'); g.addColorStop(1, 'rgba(255,60,30,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 230, 0, TAU); c.fill();
      c.rotate(t * 0.004); c.fillStyle = 'rgba(255,214,90,0.10)';
      for (let i = 0; i < 16; i++) { const an = i * TAU / 16; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(an - 0.07) * 330, Math.sin(an - 0.07) * 330); c.lineTo(Math.cos(an + 0.07) * 330, Math.sin(an + 0.07) * 330); c.closePath(); c.fill(); }
      c.restore();
      if (vt >= 10 && vt < 26) { const p = (vt - 10) / 16; c.save(); c.globalAlpha = va * (1 - p); c.strokeStyle = '#fff'; c.lineWidth = 6 * (1 - p) + 1; c.beginPath(); c.arc(SW / 2, vy, 60 + p * 380, 0, TAU); c.stroke(); c.restore(); }
      drawTitleText(c, 'VS', SW / 2 + sx, vy + sy, 205, { style: 'gold', scale: vsc, glow: 1.2, track: 0.02 });
      c.restore();
    }
    // arena strip
    const ap = easeOut(clamp((t - 66) / 20, 0, 1));
    if (ap > 0) {
      c.save(); c.globalAlpha = ap; c.translate(0, (1 - ap) * 40);
      const g = c.createLinearGradient(0, SH - 54, 0, SH); g.addColorStop(0, 'rgba(3,4,8,0.55)'); g.addColorStop(0.15, 'rgba(3,4,8,0.9)'); g.addColorStop(1, 'rgba(3,4,8,0.95)'); c.fillStyle = g; c.fillRect(0, SH - 54, SW, 54);
      const lg = c.createLinearGradient(0, 0, SW, 0); lg.addColorStop(0, 'rgba(255,200,60,0)'); lg.addColorStop(0.5, 'rgba(255,214,90,0.95)'); lg.addColorStop(1, 'rgba(255,200,60,0)'); c.fillStyle = lg; c.fillRect(0, SH - 54, SW, 2);
      c.font = '12px ' + UIFONT; setSpacing(c, 5); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd25a'; c.fillText('ARENA', SW / 2, SH - 40); setSpacing(c, 0);
      drawTitleText(c, arenaName || '', SW / 2, SH - 20, 28, { style: 'steel', glow: 0, maxW: 700 });
      c.restore();
    }
    // fade in from black
    if (t < 9) { c.fillStyle = 'rgba(0,0,0,' + (1 - t / 9) + ')'; c.fillRect(0, 0, SW, SH); }
    c.restore();
  }

  // ======================================================================
  // Logo
  // ======================================================================
  function drawEmblem(c, cx, cy, R, t) {
    c.save(); c.translate(cx, cy);
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.05);
    let g = c.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 1.7); g.addColorStop(0, 'rgba(255,40,30,' + (0.4 + 0.12 * pulse) + ')'); g.addColorStop(1, 'rgba(255,40,30,0)'); c.fillStyle = g; c.fillRect(-R * 1.8, -R * 1.8, R * 3.6, R * 3.6);
    // toothed outer ring
    const teeth = 24, u = TAU / teeth, rot = t * 0.004;
    c.beginPath();
    for (let k = 0; k < teeth; k++) { const a0 = rot + k * u; [[0, 0.88], [0.14, 1], [0.5, 1], [0.64, 0.88]].forEach((q, j) => { const a = a0 + q[0] * u * 1.0; c[k || j ? 'lineTo' : 'moveTo'](Math.cos(a) * R * q[1], Math.sin(a) * R * q[1]); }); }
    c.closePath(); c.fillStyle = steelGrad(c, -R, R); c.fill(); c.lineWidth = 3; c.strokeStyle = '#05070b'; c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.86, 0, TAU); c.fillStyle = '#0a0d15'; c.fill();
    c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU); c.lineWidth = R * 0.075; c.strokeStyle = steelGrad(c, -R, R); c.stroke(); c.lineWidth = 1.5; c.strokeStyle = '#05070b'; c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, R * 0.76, 0, TAU); c.stroke();
    g = c.createRadialGradient(0, -R * 0.2, 4, 0, 0, R * 0.74); g.addColorStop(0, '#5a0c14'); g.addColorStop(0.6, '#1c0408'); g.addColorStop(1, '#07020a'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 0.74, 0, TAU); c.fill();
    // neural knot: three interlaced loops
    const rr = R * 0.62, ex = rr * 0.98, ey = rr * 0.38;
    for (let k = 0; k < 3; k++) {
      c.save(); c.rotate(k * Math.PI / 3 + Math.PI / 6); c.beginPath(); c.ellipse(0, 0, ex, ey, 0, 0, TAU);
      c.lineWidth = R * 0.085; c.strokeStyle = '#05070b'; c.stroke(); c.lineWidth = R * 0.05; c.strokeStyle = steelGrad(c, -ey, ey); c.stroke(); c.restore();
    }
    // neural net: nodes at the loop tips, hex links and spokes
    const nodes = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; nodes.push([Math.cos(a) * ex, Math.sin(a) * ex]); }
    c.strokeStyle = 'rgba(130,225,255,0.55)'; c.lineWidth = 1.4; c.beginPath(); nodes.forEach((n, i) => c[i ? 'lineTo' : 'moveTo'](n[0], n[1])); c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(130,225,255,0.22)'; nodes.forEach(n => { c.beginPath(); c.moveTo(0, 0); c.lineTo(n[0], n[1]); c.stroke(); });
    nodes.forEach((n, i) => {
      const p = 0.5 + 0.5 * Math.sin(t * 0.08 + i * 1.3), col = i % 2 ? '#ff5a4a' : '#6ee4ff';
      c.save(); c.shadowColor = col; c.shadowBlur = 8 + 8 * p; c.fillStyle = col; c.beginPath(); c.arc(n[0], n[1], R * 0.05, 0, TAU); c.fill(); c.restore();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(n[0] - 1, n[1] - 1, R * 0.018, 0, TAU); c.fill();
    });
    // centre hub with terminal prompt
    c.beginPath(); c.arc(0, 0, R * 0.3, 0, TAU); c.fillStyle = '#080a12'; c.fill(); c.lineWidth = R * 0.03; c.strokeStyle = '#d9a021'; c.stroke();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const prompt = (w, col) => { c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(-R * 0.15, -R * 0.12); c.lineTo(R * 0.01, 0); c.lineTo(-R * 0.15, R * 0.12); c.stroke(); if (Math.floor(t / 28) % 2 === 0) { c.beginPath(); c.moveTo(R * 0.05, R * 0.14); c.lineTo(R * 0.17, R * 0.14); c.stroke(); } };
    prompt(R * 0.075, '#2a1200'); prompt(R * 0.045, '#ffd84a');
    c.restore();
  }
  function drawLogo(c, x, y, scale, t) {
    t = t || 0; scale = scale || 1;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    drawEmblem(c, 0, -138, 98, t);
    // ornamental rules flanking AGENT
    const aw = textWidth('AGENT', 60, 0.36) + 24, lg = c.createLinearGradient(aw / 2, 0, aw / 2 + 170, 0);
    lg.addColorStop(0, 'rgba(255,214,90,0.95)'); lg.addColorStop(1, 'rgba(255,214,90,0)');
    c.fillStyle = lg; c.fillRect(aw / 2 + 4, -6, 170, 2.5); c.save(); c.scale(-1, 1); c.fillRect(aw / 2 + 4, -6, 170, 2.5); c.restore();
    c.fillStyle = '#ffd25a'; for (const sx of [-1, 1]) { c.save(); c.translate(sx * (aw / 2 + 4), -4.8); c.rotate(Math.PI / 4); c.fillRect(-3.5, -3.5, 7, 7); c.restore(); }
    drawTitleText(c, 'AGENT', 0, -4, 60, { style: 'gold', glow: 0.5, track: 0.36 });
    const sw = ((t % 240) - 20) / 46; // light sweep every 4 s
    drawTitleText(c, 'BRAWL', 0, 92, 138, { style: 'blood', glow: 1, track: 0.02, sweep: sw });
    c.restore();
  }

  // ======================================================================
  // Move list panel
  // ======================================================================
  function chipArrow(c, cx, cy, s, dir) { // dir: 0 right, 1 down, 2 left, 3 up
    c.save(); c.translate(cx, cy); c.rotate(dir * Math.PI / 2); c.beginPath(); c.moveTo(-s * 0.5, -s * 0.22); c.lineTo(s * 0.05, -s * 0.22); c.lineTo(s * 0.05, -s * 0.5); c.lineTo(s * 0.55, 0); c.lineTo(s * 0.05, s * 0.5); c.lineTo(s * 0.05, s * 0.22); c.lineTo(-s * 0.5, s * 0.22); c.closePath();
    c.fillStyle = '#ffe27a'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#3a2000'; c.stroke(); c.restore();
  }
  const ARROWS = { FWD: 0, FORWARD: 0, RIGHT: 0, DOWN: 1, BACK: 2, LEFT: 2, UP: 3 };
  function drawMoveList(c, title, rows, x, y, w, h) {
    rows = rows || []; c.save();
    const ch = 12, pad = 14, titleH = title ? 38 : 0;
    const path = () => { c.beginPath(); c.moveTo(x + ch, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - ch); c.lineTo(x + w - ch, y + h); c.lineTo(x, y + h); c.lineTo(x, y + ch); c.closePath(); };
    c.save(); c.translate(0, 4); c.fillStyle = 'rgba(0,0,0,0.5)'; path(); c.fill(); c.restore();
    path(); let g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(18,22,38,0.95)'); g.addColorStop(1, 'rgba(6,7,14,0.95)'); c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = steelGrad(c, y, y + h); c.stroke(); c.lineWidth = 1; c.strokeStyle = '#05070b'; c.stroke();
    c.save(); path(); c.clip(); c.strokeStyle = 'rgba(255,214,90,0.28)'; c.lineWidth = 1; c.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11); c.restore();
    rivet(c, x + 12, y + 12, 2.6); rivet(c, x + w - 8, y + 8, 2.6); rivet(c, x + 8, y + h - 8, 2.6); rivet(c, x + w - 12, y + h - 12, 2.6);
    if (title) {
      drawTitleText(c, title, x + w / 2, y + 22, 22, { style: 'gold', glow: 0.5, maxW: w - 40 });
      const lg = c.createLinearGradient(x, 0, x + w, 0); lg.addColorStop(0, 'rgba(255,214,90,0)'); lg.addColorStop(0.5, 'rgba(255,214,90,0.8)'); lg.addColorStop(1, 'rgba(255,214,90,0)'); c.fillStyle = lg; c.fillRect(x + 14, y + titleH, w - 28, 1.5);
    }
    if (rows.length) {
      // more than 7 rows: two columns, filled top to bottom. Input syntax: '+' keys held together, '>' tap sequence, '/' alternate keys (one chip, "J/Z")
      const two = rows.length > 7, cols = two ? 2 : 1, per = Math.ceil(rows.length / cols);
      const top = y + titleH + 8, avail = h - titleH - 16, rowH = Math.min(36, avail / per), chipH = Math.min(two ? 18 : 24, rowH - (two ? 5 : 6));
      const gx = 8, gap = 6, colW = (w - gx * 2 - gap * (cols - 1)) / cols, pd = two ? 6 : pad, sepW = two ? 9 : 11, tpad = two ? 8 : 14, fs = Math.round(chipH * 0.5);
      c.textBaseline = 'middle';
      const toks = rows.map(r => String(r.input == null ? '' : r.input).toUpperCase().split('+').map(g => g.split('>').map(s => s.replace(/\s*\/\s*/g, '/').trim()).filter(Boolean)).filter(g => g.length));
      const tokW = tk => ARROWS[tk] !== undefined ? chipH : (c.font = 'bold ' + fs + 'px ' + UIFONT, Math.max(chipH, c.measureText(tk).width + tpad));
      const grpW = g => g.reduce((s, tk) => s + tokW(tk), 0) + (g.length - 1) * 3;
      const rowChipW = toks.map(gs => gs.reduce((s, g) => s + grpW(g), 0) + Math.max(0, gs.length - 1) * sepW);
      const alignX = pd + Math.max(0, ...rowChipW) + 16;
      // one name size per column (the smallest that fits any of its rows) so the list does not jitter row to row
      const nmOf = r => String(r.name == null ? '' : r.name).toUpperCase(), colSz = [];
      rows.forEach((r, i) => {
        const col = Math.floor(i / per), colX = x + gx + col * (colW + gap), note = r.note ? String(r.note).toUpperCase() : '';
        c.font = '11px ' + UIFONT; const nw = note ? c.measureText(note).width + 6 : 0;
        const nameX = two ? colX + pd + rowChipW[i] + 8 : x + alignX, maxW = colX + colW - pd - nameX - nw;
        let fsz = Math.round(Math.min(17, rowH * 0.5)); c.font = fsz + 'px ' + UIFONT; const nm = nmOf(r);
        while (fsz > 8 && c.measureText(nm).width > maxW) { fsz--; c.font = fsz + 'px ' + UIFONT; }
        colSz[col] = Math.min(colSz[col] ?? 99, fsz);
      });
      rows.forEach((r, i) => {
        const col = Math.floor(i / per), ri = i % per, colX = x + gx + col * (colW + gap), ry = top + ri * rowH, cy = ry + rowH / 2;
        if (ri % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(colX, ry, colW, rowH); }
        let cx = colX + pd;
        toks[i].forEach((grp, j) => {
          if (j) { c.fillStyle = '#7d8aa3'; c.font = 'bold ' + fs + 'px ' + UIFONT; c.textAlign = 'center'; c.fillText('+', cx + sepW / 2, cy + 1); cx += sepW; }
          grp.forEach((tk, k) => {
            if (k) cx += 3;
            const tw = tokW(tk);
            c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(cx, cy - chipH / 2 + 2, tw, chipH);
            g = c.createLinearGradient(0, cy - chipH / 2, 0, cy + chipH / 2); g.addColorStop(0, '#3b445a'); g.addColorStop(0.5, '#1b2132'); g.addColorStop(1, '#0d111c'); c.fillStyle = g; c.fillRect(cx, cy - chipH / 2, tw, chipH);
            c.strokeStyle = '#8a96ac'; c.lineWidth = 1; c.strokeRect(cx + 0.5, cy - chipH / 2 + 0.5, tw - 1, chipH - 1);
            c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(cx + 1, cy - chipH / 2 + 1, tw - 2, chipH * 0.35);
            if (ARROWS[tk] !== undefined) chipArrow(c, cx + tw / 2, cy, chipH * 0.5, ARROWS[tk]);
            else { c.font = 'bold ' + fs + 'px ' + UIFONT; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(tk, cx + tw / 2 + 1, cy + 2); c.fillStyle = '#ffe27a'; c.fillText(tk, cx + tw / 2, cy + 1); }
            cx += tw;
          });
        });
        const note = r.note ? String(r.note).toUpperCase() : '';
        c.font = '11px ' + UIFONT; const nw = note ? c.measureText(note).width + 6 : 0;
        const nameX = two ? cx + 8 : x + alignX, maxNameW = colX + colW - pd - nameX - nw;
        c.font = colSz[Math.floor(i / per)] + 'px ' + UIFONT; const nm = nmOf(r);
        c.textAlign = 'left'; c.fillStyle = '#000'; c.fillText(nm, nameX + 1, cy + 2, maxNameW); c.fillStyle = r.col || '#f2f5fb'; c.fillText(nm, nameX, cy + 1, maxNameW);
        if (note) { c.font = '11px ' + UIFONT; c.textAlign = 'right'; c.fillStyle = '#8f9bb3'; c.fillText(note, colX + colW - pd, cy + 1); }
      });
    }
    c.restore();
  }

  // ======================================================================
  // Post processing
  // ======================================================================
  let vigCv = null, scanPat = null;
  function drawPost(c, t, opts) {
    opts = opts || {}; t = t || 0;
    const vig = opts.vignette == null ? 1 : opts.vignette, grade = opts.grade == null ? 1 : opts.grade, flash = clamp(opts.flash || 0, 0, 1), red = clamp(opts.red || 0, 0, 1), scan = opts.scan || 0;
    c.save(); c.globalCompositeOperation = 'source-over';
    if (grade > 0) { // teal shadows / warm floor
      c.globalCompositeOperation = 'soft-light'; c.globalAlpha = 0.5 * grade;
      const g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, '#4a74d8'); g.addColorStop(0.55, '#8a7aa8'); g.addColorStop(1, '#ff8a3c'); c.fillStyle = g; c.fillRect(-20, -20, SW + 40, SH + 40);
      c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.12 * grade; c.fillStyle = '#8fa0c8'; c.fillRect(-20, -20, SW + 40, SH + 40);
      c.globalCompositeOperation = 'source-over';
    }
    if (vig > 0) {
      if (!vigCv) {
        vigCv = mkCanvas(SW, SH); const v = vigCv.getContext('2d'), g = v.createRadialGradient(SW / 2, SH / 2 + 10, SH * 0.32, SW / 2, SH / 2 + 10, SW * 0.62);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0.78)'); v.fillStyle = g; v.fillRect(0, 0, SW, SH);
      }
      c.globalAlpha = clamp(vig * (0.92 + 0.08 * Math.sin(t * 0.03)), 0, 1); c.drawImage(vigCv, -20, -20, SW + 40, SH + 40); c.globalAlpha = 1;
    }
    if (scan > 0) {
      if (!scanPat) { const s = mkCanvas(1, 3), sc = s.getContext('2d'); sc.fillStyle = 'rgba(0,0,0,0.5)'; sc.fillRect(0, 2, 1, 1); scanPat = c.createPattern(s, 'repeat'); }
      c.globalAlpha = 0.25 * scan; c.fillStyle = scanPat; c.fillRect(0, 0, SW, SH); c.globalAlpha = 1;
    }
    if (red > 0) {
      const g = c.createRadialGradient(SW / 2, SH / 2, SH * 0.2, SW / 2, SH / 2, SW * 0.6); g.addColorStop(0, 'rgba(255,0,0,' + (red * 0.18) + ')'); g.addColorStop(1, 'rgba(255,0,0,' + (red * 0.6) + ')'); c.fillStyle = g; c.fillRect(-20, -20, SW + 40, SH + 40);
    }
    if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (flash * 0.85) + ')'; c.fillRect(-20, -20, SW + 40, SH + 40); }
    c.restore();
  }

  // ======================================================================
  // Announcer (speechSynthesis voice + WebAudio stinger)
  // ======================================================================
  const ANNOUNCER = (() => {
    const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const SAYN = { poteto: 'Poh-tay-toe', tibo: 'Tee-bo', muse: 'Muse', dot: 'Dot', wang: 'Alexander Wang', 'alexandr wang': 'Alexander Wang' };
    const spoken = s => { const k = String(s == null ? '' : s).toLowerCase().trim(); return SAYN[k] || k; };
    const PH = {
      round: n => ({ text: 'Round ' + (NUM[n | 0] || String(n)), pitch: 0.45, rate: 0.85, st: 'gong' }),
      sudden: () => ({ text: 'Sudden death', pitch: 0.35, rate: 0.8, st: 'gongLow' }),
      fight: () => ({ text: 'Fight!', pitch: 0.4, rate: 0.9, st: 'fight' }),
      finish: () => ({ text: 'Finish it!', pitch: 0.3, rate: 0.8, st: 'finish' }),
      wins: n => ({ text: spoken(n) + ' wins', pitch: 0.4, rate: 0.85, st: 'gong' }),
      flawless: () => ({ text: 'Flawless', pitch: 0.4, rate: 0.8, st: 'flawless' }),
      finisher: n => ({ text: spoken(n), pitch: 0.35, rate: 0.85, st: 'finisher' }),
      arena: n => ({ text: 'Arena: ' + spoken(n), pitch: 0.5, rate: 0.9, st: 'whoosh' }),
      select: () => ({ text: 'Choose your agent', pitch: 0.5, rate: 0.88, st: 'whoosh' }),
    };
    PH.choose = PH.select;
    let lastSig = '', lastAt = 0, token = 0, voice = null, hooked = false;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const isMuted = () => { try { return typeof muted !== 'undefined' && !!muted; } catch (e) { return false; } };
    const synth = () => { try { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null; } catch (e) { return null; } };
    function pickVoice(s) {
      let vs = []; try { vs = s.getVoices() || []; } catch (e) { }
      const en = vs.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
      for (const re of [/google uk english male/i, /daniel/i, /\balex\b/i, /fred/i, /david/i, /aaron/i, /\bmark\b/i, /arthur/i, /oliver/i, /male/i]) { const v = en.find(x => re.test(x.name)); if (v) return v; }
      return en[0] || null;
    }
    // ---- stinger synth ----
    let nbuf = null, nbufAC = null;
    function noiseBuf(a) { if (nbuf && nbufAC === a) return nbuf; nbufAC = a; nbuf = a.createBuffer(1, Math.floor(a.sampleRate * 1.2), a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
    function env(g, t0, atk, dur, vol) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
    function osc(a, type, f0, f1, dur, vol, delay, atk) {
      const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (delay || 0); o.type = type; o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      env(g, t0, atk || 0.005, dur, vol); o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function noise(a, dur, vol, f0, f1, q, delay, type, atk) {
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t0 = a.currentTime + (delay || 0); s.buffer = noiseBuf(a);
      f.type = type || 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      env(g, t0, atk || 0.005, dur, vol); s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.05);
    }
    const boom = (a, v) => { osc(a, 'sine', 120, 36, 0.75, 0.5 * v); osc(a, 'triangle', 72, 30, 0.55, 0.25 * v); noise(a, 0.4, 0.35 * v, 800, 80, 0.7, 0, 'lowpass'); };
    const gong = (a, v, f0) => { f0 = f0 || 150; [[1, 1], [2.01, 0.55], [2.76, 0.4], [3.9, 0.28], [5.2, 0.18]].forEach((m, i) => osc(a, 'sine', f0 * m[0], f0 * m[0] * 0.994, 1.9 - i * 0.22, 0.17 * m[1] * v, 0, 0.012)); noise(a, 0.14, 0.14 * v, 3200, 1200, 1, 0, 'bandpass'); };
    const whoosh = (a, v, up) => noise(a, 0.5, 0.4 * v, up ? 200 : 2800, up ? 2800 : 200, 1.3, 0, 'bandpass', 0.14);
    const STING = {
      gong: a => { gong(a, 0.9); boom(a, 0.5); },
      gongLow: a => { gong(a, 1, 90); boom(a, 0.9); },
      fight: a => { boom(a, 1); whoosh(a, 0.8, false); osc(a, 'sawtooth', 110, 220, 0.3, 0.07, 0, 0.02); },
      finish: a => { boom(a, 1.2); whoosh(a, 0.9, true); osc(a, 'sawtooth', 70, 45, 0.9, 0.09, 0, 0.05); },
      flawless: a => { gong(a, 0.9); [880, 1320, 1760].forEach((f, i) => osc(a, 'triangle', f, f, 0.6, 0.05, 0.12 + i * 0.1, 0.01)); },
      finisher: a => { boom(a, 0.8); whoosh(a, 0.7, true); },
      whoosh: a => whoosh(a, 0.5, false),
    };
    function stinger(name) {
      try {
        if (typeof AC === 'undefined' || !AC || AC.state !== 'running') return;
        const f = STING[name]; if (f) f(AC);
      } catch (e) { }
    }
    function say(key, arg) {
      try {
        if (isMuted()) return false;
        const mk = PH[key]; if (!mk) return false;
        const sig = key + '|' + arg, tn = now();
        if (sig === lastSig && tn - lastAt < 350) return false;
        lastSig = sig; lastAt = tn;
        const ph = mk(arg);
        stinger(ph.st);
        const s = synth(); if (!s) return true;
        const my = ++token;
        if (!hooked) { hooked = true; try { s.addEventListener('voiceschanged', () => { voice = pickVoice(s); }); } catch (e) { } }
        try { s.cancel(); } catch (e) { }
        setTimeout(() => { // tiny delay after cancel() so Chrome does not drop the new utterance; stale calls are skipped
          try {
            if (my !== token || isMuted()) return;
            if (!voice) voice = pickVoice(s);
            const u = new SpeechSynthesisUtterance(ph.text);
            if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
            u.pitch = ph.pitch; u.rate = ph.rate; u.volume = 1; u.onerror = () => { };
            s.speak(u);
          } catch (e) { }
        }, 45);
        return true;
      } catch (e) { return false; }
    }
    function stop() { token++; try { const s = synth(); if (s) s.cancel(); } catch (e) { } }
    return { say, stop, phrases: Object.keys(PH) };
  })();

  // ======================================================================
  // FX: stylised pixel blood, sparks, dust
  // ======================================================================
  const FX = (() => {
    const P = [], S = [], MAXP = 520, MAXS = 150;
    let gore = true;
    try { const v = localStorage.getItem('brawl.gore'); if (v !== null) gore = v !== '0'; } catch (e) { /* storage blocked: default on */ }
    let rnd = prng((Math.random() * 4294967296) >>> 0);
    const BLOOD = ['#6a070c', '#8a0a10', '#a80e16', '#c8141c', '#e01c24', '#f03a3a'];
    const add = p => { if (P.length < MAXP) P.push(p); };
    function sparks(x, y, col, n) {
      n = n == null ? 10 : n; col = col || '#ffe14d';
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = 1.5 + rnd() * 6.5, r = rnd();
        add({ k: 2, x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, s: rnd() < 0.3 ? 3 : 2, life: 10 + ((rnd() * 14) | 0), max: 24, col: r < 0.45 ? '#ffffff' : r < 0.75 ? '#fff3a0' : col });
      }
      if (n >= 5) add({ k: 4, x, y, life: 7, max: 7, s: 9 + Math.min(14, n * 0.8), col });
    }
    function blood(x, y, dir, power) {
      if (!gore) { sparks(x, y, '#ffd23f', Math.round(6 + 4 * clamp(power || 1, 0.3, 4))); return; }
      power = clamp(power == null ? 1 : power, 0.3, 4); dir = dir < 0 ? -1 : 1;
      const n = Math.round(22 + 18 * power), sc = 0.8 + 0.3 * power;
      for (let i = 0; i < n; i++) {
        const sp = (1.6 + rnd() * 5.4) * sc, r = rnd();
        add({ k: 0, x: x + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 8, vx: dir * sp * (0.4 + rnd() * 0.9) + (rnd() - 0.5) * 1.4, vy: -(0.6 + rnd() * 4.6) * sc, s: r < 0.25 ? 4 : r < 0.62 ? 3 : 2, life: 110, max: 110, col: BLOOD[(rnd() * BLOOD.length) | 0], fl: (rnd() * 14) | 0 });
      }
      for (let i = 0; i < 3; i++) add({ k: 0, x, y, vx: -dir * rnd() * 1.6, vy: -rnd() * 2.5, s: 2, life: 80, max: 80, col: BLOOD[(rnd() * 3) | 0], fl: (rnd() * 10) | 0 });
      const m = Math.round(4 + 4 * power);
      for (let i = 0; i < m; i++) add({ k: 1, x, y: y + (rnd() - 0.5) * 10, vx: dir * (2 + rnd() * 5.5), vy: -rnd() * 3, s: 2, life: 9 + ((rnd() * 8) | 0), max: 17, col: rnd() < 0.5 ? '#e0262e' : '#ff4a4a' });
    }
    function dust(x, y) {
      for (let i = 0; i < 7; i++) {
        const sd = i % 2 ? 1 : -1;
        add({ k: 3, x: x + (rnd() - 0.5) * 30, y: y - rnd() * 4, vx: sd * (0.5 + rnd() * 1.8), vy: -(0.1 + rnd() * 0.7), s: 4 + rnd() * 4, life: 22 + ((rnd() * 12) | 0), max: 34 });
      }
    }
    function ring(x, y, col, r, life) { add({ k: 5, x, y, r: r || 70, life: life || 18, max: life || 18, col: col || '#ffffff' }); }
    function splat(p) {
      const big = p.s >= 3, w = 5 + ((rnd() * (big ? 14 : 7)) | 0), lf = 200 + ((rnd() * 160) | 0), sat = [];
      for (let i = 0, k = (rnd() * 3) | 0; i < k; i++) sat.push([((rnd() - 0.5) * (w + 10)) | 0, ((rnd() * 3) | 0) - 1, 1 + ((rnd() * 2) | 0)]);
      S.push({ x: Math.round(p.x), y: Math.round(p.y), w, h: big || rnd() < 0.4 ? 3 : 2, age: 0, life: lf, col: p.col, sat });
      if (S.length > MAXS) S.shift();
    }
    function update() {
      const g0 = gy();
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        switch (p.k) {
          case 0: p.vy += 0.34; p.px = p.x; p.py = p.y; p.x += p.vx; p.y += p.vy; p.vx *= 0.992; if (p.y >= g0 + p.fl) { p.y = g0 + p.fl; splat(p); p.life = 0; } break;
          case 1: p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.vx *= 0.88; break;
          case 2: p.px = p.x; p.py = p.y; p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy = p.vy * 0.9 + 0.16; break;
          case 3: p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.96; p.s += 0.28; break;
          default: break;
        }
        if (--p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); }
      }
      for (let i = S.length - 1; i >= 0; i--) if (++S[i].age >= S[i].life) S.splice(i, 1);
    }
    function drawSplats(c) {
      for (const s of S) {
        const half = s.life * 0.5, a = s.age < half ? 1 : 1 - (s.age - half) / half; c.globalAlpha = a;
        c.fillStyle = s.col; c.fillRect(s.x - (s.w >> 1), s.y, s.w, s.h);
        for (const q of s.sat) c.fillRect(s.x + q[0], s.y + q[1], q[2], q[2]);
        if (s.age < 50) { c.globalAlpha = a * (1 - s.age / 50) * 0.7; c.fillStyle = '#e8343c'; c.fillRect(s.x - (s.w >> 1), s.y, Math.max(1, s.w >> 1), 1); }
      }
      c.globalAlpha = 1;
    }
    function drawParts(c) {
      for (const p of P) if (p.k === 3) { c.globalAlpha = (p.life / p.max) * 0.5; c.fillStyle = '#d9cfba'; const s = Math.round(p.s); c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
      for (const p of P) {
        if (p.k === 0) {
          c.globalAlpha = 1; c.fillStyle = p.col; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
          c.globalAlpha = 0.5; c.fillRect(Math.round(p.px - (p.x - p.px) * 0.5), Math.round(p.py - (p.y - p.py) * 0.5), p.s - 1 || 1, p.s - 1 || 1);
          if (p.s >= 3) { c.globalAlpha = 0.7; c.fillStyle = '#ff7a6a'; c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); c.globalAlpha = 0.45; c.fillStyle = '#2a0003'; c.fillRect(Math.round(p.x + p.s - 1), Math.round(p.y + p.s - 1), 1, 1); }
        } else if (p.k === 1) { c.globalAlpha = p.life / p.max; c.fillStyle = p.col; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      }
      for (const p of P) if (p.k === 2) {
        const a = Math.min(1, p.life / 10); c.fillStyle = p.col; c.globalAlpha = a * 0.45; c.fillRect(Math.round(p.px), Math.round(p.py), p.s, p.s);
        c.globalAlpha = a; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      for (const p of P) {
        if (p.k === 4) { // hit-flash star
          const q = p.life / p.max, L = Math.round(p.s * (0.4 + 0.6 * q)), th = Math.max(2, Math.round(3 * q + 1)), x = Math.round(p.x), y = Math.round(p.y);
          c.globalAlpha = 1; c.fillStyle = p.col; c.fillRect(x - L, y - th / 2 - 0.5 | 0, L * 2, th + 1); c.fillRect(x - th / 2 - 0.5 | 0, y - L, th + 1, L * 2);
          c.fillStyle = '#fff'; c.fillRect(x - (L >> 1), y - 1, L, 2); c.fillRect(x - 1, y - (L >> 1), 2, L);
          c.fillRect(x - th, y - th, th * 2, th * 2);
        } else if (p.k === 5) {
          const q = 1 - p.life / p.max; c.globalAlpha = 1 - q; c.strokeStyle = p.col; c.lineWidth = 4 * (1 - q) + 1; c.beginPath(); c.ellipse(p.x, p.y, p.r * easeOut(q), p.r * easeOut(q) * 0.4, 0, 0, TAU); c.stroke();
        }
      }
      c.globalAlpha = 1;
    }
    const api = {
      blood, sparks, dust, ring, update,
      draw(c, layer) { c.save(); c.imageSmoothingEnabled = false; if (layer !== 'air') drawSplats(c); if (layer !== 'floor') drawParts(c); c.restore(); },
      clear() { P.length = 0; S.length = 0; },
      seed(n) { rnd = prng(n >>> 0); },
      get count() { return P.length + S.length; },
    };
    Object.defineProperty(api, 'gore', { enumerable: true, get() { return gore; }, set(v) { gore = !!v; try { localStorage.setItem('brawl.gore', gore ? '1' : '0'); } catch (e) { /* not persisted */ } } });
    return api;
  })();

  Object.assign(window, { drawTitleText, drawHUD, hudReset, drawBanner, drawVersus, drawLogo, drawMoveList, drawPost, ANNOUNCER, FX });
})();
