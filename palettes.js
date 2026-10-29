// ===== AGENT BRAWL feature file: PALETTES. Loaded last (see docs/ARCHITECTURE.md). =====
// Owner: the x-palettes agent. Only that agent edits this file, tools/tests/x-palettes.mjs and docs/features/x-palettes.md.
// Area: alternate colourways. Four per fighter (the classic look plus three), and one star colourway per fighter that a match win unlocks.
// Plug in with BUS 'match:start' (warm the canvases) and 'match:end' (unlock), HOOKS 'update' (the special button cycles the colourway on the select screen)
// and 'drawTop' (swatches, hint and unlock note), SETTINGS 'palettes.p1', 'palettes.p2' (fighter id -> last colourway) and 'palettes.unlocked'.
// How it recolours: the engine rasterises each fighter from a LOOK table through colour ramps. This file builds the same ramps for a colourway, pairs them with the
// default ramps into an exact-colour map (clothes, shoes, wraps, fur and accents only; skin, hair, face and glasses are never in the map), recolours the sheet, extra-pose
// sheet and bust once into cached canvases, and wraps drawSprite / drawPortrait / drawHeadIcon so every screen that draws a fighter shows the right colourway.
// No engine file is edited. Public API: window.PALETTES (see the bottom of this file and docs/features/x-palettes.md).
'use strict';
(() => {
  window.STUB_PALETTES = 1;   // marker: tools/tests/core.mjs style checks that this file loaded.

  // ---------- the colourways: overrides of the engine's LOOK table (a missing field keeps the classic colour) ----------
  // humans: top, pants, shoe, wrap (also the belt collar), acc (aura and orb). blob: body, tint, acc. plush: fur, acc. Skin, hair and the plush face are never touched.
  // The last entry of each list is the star colourway (unlocked by winning a match with that fighter).
  const WAYS = {
    tibo: [
      { n: 'CLASSIC' },
      { n: 'EMBER', top: '#7a3040', pants: '#3a2c3c', shoe: '#f4e8da', wrap: '#ff9a5c', acc: '#ff9a5c' },
      { n: 'MINT', top: '#1f5f58', pants: '#22383e', shoe: '#e4f6ee', wrap: '#7dffc4', acc: '#7dffc4' },
      { n: 'VIOLET', top: '#51358a', pants: '#2c2556', shoe: '#efe8ff', wrap: '#ffd24a', acc: '#ffd24a' },
      { n: 'GOLD RUSH', star: 1, top: '#262432', pants: '#15141e', shoe: '#f6d890', wrap: '#ffc830', acc: '#ffc830' },
    ],
    poteto: [
      { n: 'CLASSIC' },
      { n: 'ROSE', top: '#7a3050', pants: '#3a2438', shoe: '#f8d9e0', wrap: '#ff7aa8', acc: '#ff9cc0' },
      { n: 'SKY', top: '#2d5a8a', pants: '#2a3350', shoe: '#e6f2ff', wrap: '#8fe0ff', acc: '#bfeaff' },
      { n: 'FOREST', top: '#2f5a3a', pants: '#2c3a30', shoe: '#e9f0c0', wrap: '#c8f06a', acc: '#e8ff8a' },
      { n: 'MIDNIGHT', star: 1, top: '#1c1c34', pants: '#14142a', shoe: '#ff9cc0', wrap: '#ff5a9a', acc: '#ffd24a' },
    ],
    dot: [
      { n: 'CLASSIC' },
      { n: 'BERRY', body: '#e5558f', tint: '#8a2a5a', acc: '#ff9ac0' },
      { n: 'MINT', body: '#5fd6a0', tint: '#1e7a6a', acc: '#b0ffe0' },
      { n: 'BLUEBERRY', body: '#6aa6ff', tint: '#2a3a9a', acc: '#bcd8ff' },
      { n: 'COSMIC', star: 1, body: '#8a6ae0', tint: '#3a1a8a', acc: '#ffe27a' },
    ],
    wang: [
      { n: 'CLASSIC' },
      { n: 'CRIMSON', top: '#8a3340', pants: '#2c2a3a', shoe: '#f0e0e0', wrap: '#ff6a6a', acc: '#ff6a6a' },
      { n: 'TEAL', top: '#2f7a80', pants: '#26333f', shoe: '#e0f4f4', wrap: '#6af0e0', acc: '#6af0e0' },
      { n: 'AMBER', top: '#a8782e', pants: '#3a3128', shoe: '#f6ecd0', wrap: '#ffd05a', acc: '#ffd05a' },
      { n: 'OBSIDIAN', star: 1, top: '#22222e', pants: '#14141c', shoe: '#c0c8d8', wrap: '#7cf0ff', acc: '#7cf0ff' },
    ],
    muse: [
      { n: 'CLASSIC' },
      { n: 'LILAC', fur: '#d9cbf3', acc: '#ff9ae8' },
      { n: 'MINT', fur: '#cdeee0', acc: '#ffe27a' },
      { n: 'SKY', fur: '#c9def6', acc: '#ffa8c8' },
      { n: 'NIGHT', star: 1, fur: '#5b4f86', acc: '#ffd24a' },
    ],
  };
  const KEYS = ['palettes.p1', 'palettes.p2'];
  SETTINGS.define(KEYS[0], { def: {}, label: 'P1 COLOURWAYS' });        // { fighterId: colourway index }, what each player picked last for each fighter
  SETTINGS.define(KEYS[1], { def: {}, label: 'P2 COLOURWAYS' });
  SETTINGS.define('palettes.unlocked', { def: {}, label: 'STAR COLOURWAYS' });   // { fighterId: true } after a match win with that fighter

  // ---------- the engine pieces this file leans on (all optional at call time: without them the game just keeps the classic look) ----------
  const engineOk = () => typeof R === 'function' && typeof dim === 'function' && typeof mix === 'function' && typeof flat === 'function' &&
    typeof LOOK !== 'undefined' && typeof SHEETS !== 'undefined' && typeof XSHEETS !== 'undefined' && typeof HEADCANVAS !== 'undefined' &&
    typeof drawSprite === 'function' && typeof drawPortrait === 'function' && typeof ROSTER !== 'undefined' && typeof game !== 'undefined';
  const OK = engineOk();
  const hexOf = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? ((255 << 24) | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0 : null;   // ImageData byte order on little-endian

  // every colour family sprites.js derives from a look: same recipes as drawHuman / plushInk / drawBlob / drawAura (a wrong guess shows up in the test as a pixel difference)
  function groups(L) {
    const g = [];
    if (L.kind === 'human') {
      const tp = R(L.top, '#2a2a7a'), pn = R(L.pants, '#2a1f7a'), sho = R(L.shoe, '#5a4a9a'), wr = R(L.wrap, '#3a2a78');
      g.push(tp, dim(tp), pn, dim(pn), sho, dim(sho), wr, dim(wr), R(L.acc, '#2a2a9a'), flat(L.belt));
    } else if (L.kind === 'plush') {
      const fur = { ...R(L.fur, '#b06a70') }; fur.ol = mix(fur.sh, INK, 0.5);
      g.push(fur, dim(fur, 0.2, FARFUR), { rim: mix(fur.sh, INK, 0.12) }, R(L.acc, '#2a2a9a'));
    } else {
      const body = { ...R(L.body, L.tint) }; body.ol = mix(body.sh, INK, 0.6);
      g.push(body, dim(body, 0.18), R(L.acc, '#2a2a9a'));
    }
    return g;
  }
  function lookWith(id, idx) {
    const w = (WAYS[id] || [])[idx] || {}, L = Object.assign({}, LOOK[id]);
    for (const k in w) if (k !== 'n' && k !== 'star') L[k] = w[k];
    if (L.kind === 'human' && w.wrap) L.belt = w.wrap;
    return L;
  }
  let clashes = 0;   // two classic colours that would need different targets (the first one wins); the test keeps this at 0
  function mapOf(id, idx) {
    const A = groups(LOOK[id]), B = groups(lookWith(id, idx)), map = new Map();
    for (let i = 0; i < A.length; i++) for (const k in A[i]) {
      const s = hexOf(A[i][k]), d = hexOf(B[i][k]); if (s === null || d === null || s === d) continue;
      if (!map.has(s)) map.set(s, d); else if (map.get(s) !== d) clashes++;
    }
    return map;
  }

  // ---------- recolouring with a cache: one canvas read per source canvas, one recoloured canvas per (fighter, colourway, kind) ----------
  const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d', { willReadFrequently: true });
  const pixels = new WeakMap();   // source canvas -> its original pixels
  function pixelsOf(cv) {
    let s = pixels.get(cv); if (s) return s;
    scratch.width = cv.width; scratch.height = cv.height; sctx.clearRect(0, 0, cv.width, cv.height); sctx.drawImage(cv, 0, 0);
    s = { w: cv.width, h: cv.height, u: new Uint32Array(sctx.getImageData(0, 0, cv.width, cv.height).data.buffer) }; pixels.set(cv, s); return s;
  }
  function recolour(cv, map) {
    const s = pixelsOf(cv), u = new Uint32Array(s.u), n = u.length;
    for (let i = 0; i < n; i++) { const v = u[i]; if (v >>> 24) { const m = map.get(v); if (m !== undefined) u[i] = m; } }
    const out = document.createElement('canvas'); out.width = s.w; out.height = s.h;
    out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(u.buffer), s.w, s.h), 0, 0); return out;
  }
  const cache = new Map(), CACHE_MAX = 10;   // 'id:idx' -> { src: [sheet, xsheet, bust], sheet, xsheet, bust, t }; the least recently used entry goes when more than CACHE_MAX exist
  function entry(id, idx) {
    if (!OK || !idx || !WAYS[id] || !WAYS[id][idx] || !SHEETS[id]) return null;
    const key = id + ':' + idx; let e = cache.get(key);
    if (e && e.src[0] === SHEETS[id] && e.src[1] === XSHEETS[id] && e.src[2] === HEADCANVAS[id]) { e.t = game.tick; return e; }
    if (cache.size >= CACHE_MAX) { let old = null; for (const [k, v] of cache) if (!old || v.t < old[1].t) old = [k, v]; if (old) cache.delete(old[0]); }
    const map = mapOf(id, idx), src = [SHEETS[id], XSHEETS[id], HEADCANVAS[id]];
    e = { src, map, t: game.tick, sheet: recolour(src[0], map), xsheet: src[1] ? recolour(src[1], map) : null, bust: src[2] ? recolour(src[2], map) : null };
    cache.set(key, e); return e;
  }

  // ---------- state: which colourway each side wears ----------
  const NOT_MATCH = { title: 1, select: 1, sheet: 1 };
  const matchLike = () => { const f = game.f; return !!(f && f.length === 2 && f[0] && f[1] && f[0].d && f[1].d && !NOT_MATCH[game.phase]); };
  function fighterId(side) {   // the fighter a side shows right now: the highlighted cell on the select screen, the live fighter in a match, nobody elsewhere
    if (!OK) return null;
    if (game.phase === 'select') { const r = ROSTER[game.sel && game.sel[side]]; return r ? r.id : null; }
    return matchLike() ? game.f[side].d.id : null;
  }
  const unlocked = id => { const u = SETTINGS.get('palettes.unlocked'); return !!(u && u[id]); };
  const usable = (id, idx) => !!(WAYS[id] && WAYS[id][idx] && (!WAYS[id][idx].star || unlocked(id)));
  function chosen(side, id) {   // what the player picked last for this fighter (0 when nothing valid is stored)
    const m = SETTINGS.get(KEYS[side]), v = m && typeof m === 'object' ? m[id] | 0 : 0; return usable(id, v) ? v : 0;
  }
  function other(id, not) { const n = WAYS[id].length; for (let k = 1; k < n; k++) { const c = (not + k) % n; if (usable(id, c)) return c; } return not; }
  function effectiveFor(side, id0, id1) {   // mirror match: P1 keeps its pick, P2 takes the next colourway when both would wear the same
    const id = side ? id1 : id0; if (!id || !WAYS[id]) return 0;
    const v = chosen(side, id);
    if (side === 1 && id0 === id1 && chosen(0, id) === v) return other(id, v);
    return v;
  }
  const effective = side => effectiveFor(side, fighterId(0), fighterId(1));
  function warm(id, idx) { try { return !!entry(id, idx); } catch (e) { return false; } }
  function set(side, idx, id) {
    id = id || fighterId(side); if (!id || !usable(id, idx)) return -1;
    SETTINGS.set(KEYS[side], Object.assign({}, SETTINGS.get(KEYS[side]), { [id]: idx })); warm(id, idx); return idx;
  }
  function cycle(side, dir) {   // next usable colourway for the side's fighter; P2 in a mirror match skips the colourway P1 wears
    const id = fighterId(side); if (!id || !WAYS[id]) return -1;
    const n = WAYS[id].length, mirror = side === 1 && fighterId(0) === id, p1 = mirror ? chosen(0, id) : -1;
    let v = effective(side);
    for (let k = 0; k < n; k++) { v = (v + (dir || 1) + n) % n; if (usable(id, v) && v !== p1) break; }
    return set(side, v, id);
  }

  // ---------- which side is a draw call for? ----------
  let cur = -1;   // set while Fighter.draw runs: the exact side
  const overWinner = () => {
    const w = typeof roundsToWin === 'function' ? (game.wins[0] >= roundsToWin() ? 0 : 1) : (game.winner ? game.winner.side : 0); return w;
  };
  function spriteSide(id, anim, face, x, y) {
    if (cur >= 0) return cur;
    const ph = game.phase;
    if (ph === 'select') return face < 0 ? 1 : 0;   // the two side panels: P1 faces right, P2 faces left
    if (ph === 'title') return 0;   // the title line-up shows every fighter once, in the colourway player 1 last used
    if (!matchLike()) return -1;
    const a = game.f[0].d.id === id, b = game.f[1].d.id === id;
    if (a !== b) return a ? 0 : 1;
    if (!a) return -1;
    // a mirror match, and a draw call that did not come from Fighter.draw (end screen, finisher, trails): work out whose it is
    if (ph === 'over') { const w = overWinner(); return anim === 'ko' ? 1 - w : w; }
    const L = game.loser, W = game.winner;
    if (ph === 'finisher' && L && W) return anim === 'ko' || anim === 'hit' ? L.side : W.side;
    let best = 0, bd = 1e9;
    for (let s = 0; s < 2; s++) { const o = game.f[s], d = Math.abs(o.x - x) + (o.face === face ? 0 : 40); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function portraitSide(id, flip) {
    if (game.phase === 'select') {   // the portrait grid: a highlighted fighter shows the colourway of the player who highlights it
      for (let s = 0; s < 2; s++) { const r = ROSTER[game.sel && game.sel[s]]; if (r && r.id === id) return s; }
      return -1;
    }
    if (!matchLike()) return -1;
    const s = flip ? 1 : 0;
    if (game.f[s].d.id === id) return s;
    return game.f[1 - s].d.id === id ? 1 - s : -1;
  }
  const idxFor = (side, id) => side < 0 ? 0 : game.phase === 'title' ? chosen(0, id) : effective(side);

  // ---------- wrappers: swap the cached canvases in for the one call, then put the originals back ----------
  if (OK) {
    const baseSprite = window.drawSprite, basePortrait = window.drawPortrait, baseIcon = typeof drawHeadIcon === 'function' ? window.drawHeadIcon : null;
    window.drawSprite = function (c, id, anim, f, x, y, face, scale) {
      let e = null;
      try { const idx = idxFor(spriteSide(id, anim, face === undefined ? 1 : face, Math.round(x), Math.round(y)), id); e = idx ? entry(id, idx) : null; } catch (err) { e = null; }
      if (!e) return baseSprite.apply(this, arguments);
      const s0 = SHEETS[id], x0 = XSHEETS[id]; SHEETS[id] = e.sheet; if (e.xsheet) XSHEETS[id] = e.xsheet;
      try { return baseSprite.apply(this, arguments); } finally { SHEETS[id] = s0; XSHEETS[id] = x0; }
    };
    const bust = (base) => function (c, id, a, b, d, e2, flip) {
      let en = null;
      try { const idx = idxFor(portraitSide(id, base === baseIcon ? arguments[5] : flip), id); en = idx ? entry(id, idx) : null; } catch (err) { en = null; }
      if (!en || !en.bust) return base.apply(this, arguments);
      const h0 = HEADCANVAS[id]; HEADCANVAS[id] = en.bust;
      try { return base.apply(this, arguments); } finally { HEADCANVAS[id] = h0; }
    };
    window.drawPortrait = bust(basePortrait);
    if (baseIcon) window.drawHeadIcon = bust(baseIcon);
    if (typeof Fighter === 'function' && Fighter.prototype && Fighter.prototype.draw) {
      const baseDraw = Fighter.prototype.draw;
      Fighter.prototype.draw = function () { const was = cur; cur = this.side; try { return baseDraw.apply(this, arguments); } finally { cur = was; } };
    }
  }

  // ---------- events and hooks ----------
  let note = null;   // { id, name, t }: shown on the end screen after a win unlocked a star colourway
  BUS.on('match:start', e => {
    if (!OK) return;
    const ids = (e.fighters || []).map(f => f.d.id);
    for (let s = 0; s < 2; s++) if (ids[s]) warm(ids[s], effectiveFor(s, ids[0], ids[1]));
    note = null;
  });
  BUS.on('match:end', e => {
    const w = e && e.winner; if (!OK || !w || !w.d || w.cpu || !WAYS[w.d.id] || unlocked(w.d.id)) return;
    SETTINGS.set('palettes.unlocked', Object.assign({}, SETTINGS.get('palettes.unlocked'), { [w.d.id]: true }));
    const ways = WAYS[w.d.id]; note = { id: w.d.id, name: ways[ways.length - 1].n, t: 0 };
  });
  BUS.on('phase', e => { if (e.to === 'select' || e.to === 'title') note = null; });

  HOOKS.add('update', g => {
    if (!OK || g.phase !== 'select' || !g.ready) return;
    if (g.mode === 1) { const s = g.ready[0] ? 1 : 0; if (hit(0, 's')) { cycle(s); if (typeof beep === 'function') beep(700 - s * 100, 0.05); } }
    else for (let s = 0; s < 2; s++) if (!g.ready[s] && hit(s, 's')) { cycle(s); if (typeof beep === 'function') beep(700 - s * 100, 0.05); }
  });

  // ---------- the select screen: swatch strip, key hint and colourway name in the outer bottom corner of each side panel (clear of the sprite and the move list) ----------
  const SWC = {};   // 'id:idx' -> [main colour, accent]: the main garment (or fur or body) and the accent, half and half on a swatch
  function swatchColours(id, idx) { const k = id + ':' + idx; if (SWC[k]) return SWC[k]; const L = lookWith(id, idx); return SWC[k] = L.kind === 'human' ? [L.top, L.wrap] : L.kind === 'plush' ? [L.fur, L.acc] : [L.body, L.acc]; }
  function starPath(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  const PANEL_W = 300, SWS = 14, SWG = 4, SWY = 238;   // panel geometry follows drawSelect in game.js (panels at x 12 and W - 312, sprite feet at y 286)
  const keyName = s => (typeof touch !== 'undefined' && touch.on) ? 'SP' : (game.mode === 1 ? (typeof LABEL !== 'undefined' ? LABEL[0].s : 'L') + (typeof ALTL !== 'undefined' ? ' / ' + ALTL.s : '') : (typeof LABEL !== 'undefined' ? LABEL[s].s : s ? 'NUM3' : 'L'));
  const stripX = (s, n) => { const px = s ? W - 12 - PANEL_W : 12, tw = n * SWS + (n - 1) * SWG; return s ? px + PANEL_W - 10 - tw : px + 10; };   // left edge of a side's swatch strip
  function drawSwatches(c, g, s) {
    const id = fighterId(s); if (!id || !WAYS[id]) return;
    const list = WAYS[id], n = list.length, cur2 = effective(s), ready = !!g.ready[s], mine = g.mode === 1 ? s === (g.ready[0] ? 1 : 0) : !ready;
    const tw = n * SWS + (n - 1) * SWG, x0 = stripX(s, n), col = s ? '#ff4d4d' : '#4dc3ff', al = s ? 'right' : 'left', tx = s ? x0 + tw : x0;
    c.save(); c.globalAlpha = mine ? 1 : 0.55;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (SWS + SWG), y = SWY, lock = !usable(id, i), on = i === cur2;
      c.fillStyle = '#05030a'; c.fillRect(x - 2, y - 2, SWS + 4, SWS + 4);
      if (lock) { c.fillStyle = '#26202c'; c.fillRect(x, y, SWS, SWS); starPath(c, x + SWS / 2, y + SWS / 2 + 0.5, 5.5); c.strokeStyle = '#6a5f78'; c.lineWidth = 1.2; c.stroke(); }
      else {
        const [a, b] = swatchColours(id, i), h = SWS / 2; c.fillStyle = a; c.fillRect(x, y, h + 1, SWS); c.fillStyle = b; c.fillRect(x + h + 1, y, h - 1, SWS);
        if (list[i].star) { starPath(c, x + h, y + h + 0.5, 6); c.fillStyle = '#ffe27a'; c.fill(); c.strokeStyle = '#3a2000'; c.lineWidth = 1.2; c.stroke(); }
      }
      c.strokeStyle = on ? col : '#4a4254'; c.lineWidth = on ? 2 : 1; const o = on ? 3 : 2; c.strokeRect(x - o + 0.5, y - o + 0.5, SWS + 2 * o - 1, SWS + 2 * o - 1);
    }
    c.restore();
    const w = list[cur2] || list[0];
    if (mine) uiText(keyName(s) + '  COLOURWAY', tx, SWY - 14, 11, '#c9c3b8', al);
    uiText(w.n + (w.star ? ' *' : ''), tx, SWY + SWS + 13, 12, ready || !mine ? '#c9c3b8' : '#ffe27a', al);
    if (mine && !unlocked(id)) uiText('WIN TO UNLOCK *', tx, SWY + SWS + 26, 10, '#8d8696', al);
  }
  HOOKS.add('drawTop', (c, g) => {
    if (!OK || typeof uiText !== 'function') return;
    if (g.phase === 'select' && g.ready) { drawSwatches(c, g, 0); drawSwatches(c, g, 1); }
    else if (note && g.phase === 'over') { const a = Math.min(1, ++note.t / 20); uiText('STAR COLOURWAY UNLOCKED: ' + note.name, W / 2, 150, 18, '#ffe27a', 'center', a); }
  });

  window.PALETTES = {
    ready: OK, ways: id => (WAYS[id] || []).map((w, i) => ({ name: w.n, star: !!w.star, locked: !usable(id, i) })), count: id => (WAYS[id] || []).length,
    choice: side => { const id = fighterId(side); return id ? chosen(side, id) : 0; }, effective, set, cycle, unlocked, unlock: id => { if (WAYS[id]) SETTINGS.set('palettes.unlocked', Object.assign({}, SETTINGS.get('palettes.unlocked'), { [id]: true })); },
    look: lookWith, entry, swatch: swatchColours, clashes: () => clashes, fighterId,
    note: () => note ? { id: note.id, name: note.name } : null, clearNote: () => { note = null; },
    swatchRect: (side, idx, id) => { id = id || fighterId(side); const n = (WAYS[id] || []).length; return { x: stripX(side, n) + idx * (SWS + SWG), y: SWY, w: SWS, h: SWS }; },
  };
})();
