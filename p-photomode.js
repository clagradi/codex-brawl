// ===== AGENT BRAWL premium feature: PHOTO MODE. Owner: the p-photomode agent. Docs: docs/features/p-photomode.md. Tests: tools/tests/x-p-photomode.mjs. =====
// From the pause screen, C opens a photo studio: the match stays frozen while a free camera pans and zooms over the arena. The HUD can be hidden, six filters
// (CRT, SEPIA, NOIR, VAPORWAVE, PIXEL BIG, NONE) and four frames (CINEMA, POLAROID, ARCADE, FILM) can be applied, and SAVE writes the picture as a PNG.
// Nothing is saved or downloaded unless the player asks for it with Enter or the SAVE button (a tap on a touch screen): the download link only exists inside save().
//
// Plugs in through the extension layer only (game.js is not touched):
//   HOOKS pauseItems   the C PHOTO MODE entry on the pause screen
//   HOOKS update       order -10: runs before options.js so the keys of the studio never reach the pause menu, the fight or the options screen
//   HOOKS drawTop      order 9999: draws the finished picture and the control bar last, in screen space
//   BUS phase          leaving the pause phase closes the studio
//   SETTINGS           photo.filter, photo.frame, photo.hud (the last choices are remembered)
//   window.drawFight   wrapped like options.js wraps it: while the studio is open the engine does not paint its own pause scene (the studio paints the scene itself)
// How a picture is made: the scene (arena, fighters, effects, optional HUD) is drawn through the engine's own draw functions with the camera
// as an outer transform and the tick frozen, copied to an offscreen canvas, run through the filter, framed, and kept. It is rebuilt only when something
// changed, so the picture never flickers and a still view costs one drawImage per frame. SAVE encodes that same offscreen canvas, so the control bar is never in the file.
// Keys: arrows or WASD pan, E / Q / + / - or the wheel zoom, H hides the HUD, G or 1-6 pick the filter, B the frame, V resets the view, U hides the bar,
// Enter saves, Esc / C / P goes back to the pause screen. F (fullscreen) and M (mute) keep working.
// Pointer: drag pans, wheel or pinch zooms, the bar buttons do the rest. Public API: window.PHOTO.
'use strict';
(function () {
  if (typeof HOOKS === 'undefined' || typeof SETTINGS === 'undefined' || typeof BUS === 'undefined' || typeof game === 'undefined' || typeof ctx === 'undefined') return;

  const FILTERS = ['crt', 'sepia', 'noir', 'vapor', 'pixel', 'none'];
  const FILTER_NAMES = { crt: 'CRT', sepia: 'SEPIA', noir: 'NOIR', vapor: 'VAPORWAVE', pixel: 'PIXEL BIG', none: 'NONE' };
  const FRAMES = ['none', 'cinema', 'polaroid', 'arcade', 'film'];
  const FRAME_NAMES = { none: 'NONE', cinema: 'CINEMA', polaroid: 'POLAROID', arcade: 'ARCADE', film: 'FILM' };
  const ZMIN = 1, ZMAX = 4;
  SETTINGS.define('photo.filter', { def: 'none', values: FILTERS, label: 'PHOTO FILTER' });
  SETTINGS.define('photo.frame', { def: 'none', values: FRAMES, label: 'PHOTO FRAME' });
  SETTINGS.define('photo.hud', { def: true, label: 'PHOTO HUD' });

  const st = {
    active: false, x: 0, y: 0, z: 1,        // the view: centre offset from the middle of the screen (screen pixels at zoom 1) and zoom
    tick: 0, cam: { x: 0, zoom: 1 }, dark: 0, // the frozen moment
    dirty: true, ui: true, toast: '', toastBad: false, toastT: 0, saves: 0, busy: null, last: null, builds: 0, note: '',
    ptr: new Map(), pinch: null,
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const cur = key => SETTINGS.get(key);
  const isTouch = () => typeof touch !== 'undefined' && !!touch.on;
  const optionsOpen = () => !!(window.OPTIONS && OPTIONS.screen);

  // ---------- the view ----------
  function setView(x, y, z) {
    const nz = +clamp(z, ZMIN, ZMAX).toFixed(4), lx = W / 2 * (1 - 1 / nz), ly = H / 2 * (1 - 1 / nz);
    const nx = +clamp(x, -lx, lx).toFixed(3) || 0, ny = +clamp(y, -ly, ly).toFixed(3) || 0;
    if (nx !== st.x || ny !== st.y || nz !== st.z) { st.x = nx; st.y = ny; st.z = nz; st.dirty = true; }
  }
  function zoomAt(nz, px, py) {   // zoom keeping the picture point under (px, py) where it is
    nz = clamp(nz, ZMIN, ZMAX);
    const mx = px - W / 2, my = py - H / 2, sx = W / 2 + st.x + mx / st.z, sy = H / 2 + st.y + my / st.z;
    setView(sx - mx / nz - W / 2, sy - my / nz - H / 2, nz);
  }
  const resetView = () => setView(0, 0, 1);

  // ---------- offscreen canvases ----------
  let raw, rawC, out, outC, tmp, tmpC, small, smallC;
  function mk(read) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined); g.imageSmoothingEnabled = false; return [c, g]; }
  function ensure() { if (!raw) { [raw, rawC] = mk(true); [out, outC] = mk(true); [tmp, tmpC] = mk(false); } }

  // ---------- filters ----------
  let VIG = null, CRT = null, VAP = null;
  function vig() {   // 0..255 brightness multiplier, darker towards the corners
    if (VIG) return VIG;
    VIG = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { const v = y / (H - 1) * 2 - 1; for (let x = 0; x < W; x++) { const u = x / (W - 1) * 2 - 1; VIG[y * W + x] = Math.round(255 * clamp(1 - 0.3 * (u * u + v * v), 0, 1)); } }
    return VIG;
  }
  function crtMap() {   // for every output pixel the source pixel it shows through the curved glass, or -1 outside the glass
    if (CRT) return CRT;
    CRT = new Int32Array(W * H); const k = 0.1;
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1) * 2 - 1;
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1) * 2 - 1, f = (1 + k * (u * u + v * v)) / (1 + k), su = u * f, sv = v * f;
        CRT[y * W + x] = su < -1 || su > 1 || sv < -1 || sv > 1 ? -1 : Math.round((sv + 1) / 2 * (H - 1)) * W + Math.round((su + 1) / 2 * (W - 1));
      }
    }
    return CRT;
  }
  function vaporLut() {   // luminance -> deep violet, hot pink, cyan
    if (VAP) return VAP;
    const stops = [[0, 26, 8, 70], [0.5, 255, 64, 178], [1, 96, 246, 255]];
    VAP = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
    for (let l = 0; l < 256; l++) {
      const t = l / 255, a = t < 0.5 ? stops[0] : stops[1], b = t < 0.5 ? stops[1] : stops[2], k = (t - a[0]) / (b[0] - a[0]);
      for (let c = 0; c < 3; c++) VAP[c][l] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * k);
    }
    return VAP;
  }
  function applyFilter(name) {
    if (name === 'none') { outC.drawImage(raw, 0, 0); return; }
    const src = rawC.getImageData(0, 0, W, H), s = src.data, n = W * H;
    if (name === 'pixel') {   // 5x5 blocks averaged, then seven levels per colour channel, drawn back at full size without smoothing
      const B = 5, sw = Math.ceil(W / B), sh = Math.ceil(H / B);
      if (!small) { small = document.createElement('canvas'); small.width = sw; small.height = sh; smallC = small.getContext('2d'); }
      const img = smallC.createImageData(sw, sh), d = img.data;
      for (let by = 0; by < sh; by++) for (let bx = 0; bx < sw; bx++) {
        let r = 0, g = 0, b = 0, c = 0;
        for (let y = by * B; y < Math.min(H, by * B + B); y++) for (let x = bx * B; x < Math.min(W, bx * B + B); x++) { const i = (y * W + x) * 4; r += s[i]; g += s[i + 1]; b += s[i + 2]; c++; }
        const o = (by * sw + bx) * 4, q = v => Math.round(v / c / 255 * 6) * 42.5;
        d[o] = q(r); d[o + 1] = q(g); d[o + 2] = q(b); d[o + 3] = 255;
      }
      smallC.putImageData(img, 0, 0); outC.imageSmoothingEnabled = false; outC.drawImage(small, 0, 0, sw, sh, 0, 0, sw * B, sh * B);
      return;
    }
    const dst = outC.createImageData(W, H), d = dst.data, V = vig();
    if (name === 'sepia') {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const r = s[i], g = s[i + 1], b = s[i + 2], m = 0.78 + 0.22 * V[p] / 255;
        d[i] = (0.393 * r + 0.769 * g + 0.189 * b) * m; d[i + 1] = (0.349 * r + 0.686 * g + 0.168 * b) * m; d[i + 2] = (0.272 * r + 0.534 * g + 0.131 * b) * m; d[i + 3] = 255;
      }
    } else if (name === 'noir') {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const l = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2], grain = (Math.imul(p, 0x9E3779B1) >>> 28) - 7;   // fixed grain: the same picture every time
        const v = ((l - 128) * 1.3 + 128 + grain) * (0.55 + 0.45 * V[p] / 255);
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    } else if (name === 'vapor') {
      const L = vaporLut();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, ir = (y * W + (x >= 3 ? x - 3 : 0)) * 4, ib = (y * W + (x < W - 3 ? x + 3 : W - 1)) * 4;   // red and blue drift apart a little
        const r = s[ir], g = s[i + 1], b = s[ib + 2], l = (299 * r + 587 * g + 114 * b) / 1000 | 0;
        d[i] = L[0][l] * 0.62 + r * 0.38; d[i + 1] = L[1][l] * 0.62 + g * 0.3; d[i + 2] = L[2][l] * 0.62 + b * 0.38; d[i + 3] = 255;
      }
    } else if (name === 'crt') {
      const M = crtMap();
      for (let y = 0; y < H; y++) {
        const sl = y % 3 === 2 ? 0.62 : 1;   // scan lines
        for (let x = 0; x < W; x++) {
          const p = y * W + x, i = p * 4, q = M[p];
          if (q < 0) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; continue; }
          const j = q * 4, jl = q % W ? j - 4 : j, m = sl * (0.45 + 0.55 * V[p] / 255) * 1.22, c = x % 3;   // soft left neighbour, vignette, phosphor stripes
          d[i] = (s[j] * 0.78 + s[jl] * 0.22) * m * (c === 0 ? 1 : 0.82); d[i + 1] = (s[j + 1] * 0.78 + s[jl + 1] * 0.22) * m * (c === 1 ? 1 : 0.82); d[i + 2] = (s[j + 2] * 0.78 + s[jl + 2] * 0.22) * m * (c === 2 ? 1 : 0.82); d[i + 3] = 255;
        }
      }
    } else { outC.drawImage(raw, 0, 0); return; }
    outC.putImageData(dst, 0, 0);
  }

  // ---------- frames (drawn on the filtered picture; the frames keep their own colours) ----------
  const safe = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 .,!?:\-\/&]/g, '');
  const arenaName = () => { try { return safe(ARENAS[game.arena].name); } catch (e) { return ''; } };
  const duelName = () => { try { return safe(SHORT(game.f[0].d) + ' VS ' + SHORT(game.f[1].d)); } catch (e) { return 'AGENT BRAWL'; } };
  function inset(x, y, w, h, bg) {   // the picture shrinks into the frame
    tmpC.clearRect(0, 0, W, H); tmpC.drawImage(out, 0, 0);
    outC.fillStyle = bg; outC.fillRect(0, 0, W, H);
    outC.imageSmoothingEnabled = true; outC.imageSmoothingQuality = 'high'; outC.drawImage(tmp, x, y, w, h); outC.imageSmoothingEnabled = false;
  }
  function applyFrame(name) {
    const c = outC;
    if (name === 'cinema') {
      inset(48, 27, 864, 486, '#050507'); c.strokeStyle = '#c9a24a'; c.lineWidth = 2; c.strokeRect(47, 26, 866, 488);
      ptext(c, 'AGENT BRAWL', 50, H - 22, 2, '#c9a24a', 'left', false); ptext(c, arenaName(), W - 50, H - 22, 2, '#8d8576', 'right', false);
    } else if (name === 'polaroid') {
      inset(105, 34, 749, 421, '#efe9db'); c.strokeStyle = 'rgba(30,24,40,0.35)'; c.lineWidth = 2; c.strokeRect(104, 33, 751, 423);
      ptext(c, duelName(), W / 2, 34 + 421 + 28, 2, '#2a2433', 'center', false); ptext(c, 'AGENT BRAWL', W / 2, 34 + 421 + 52, 1, '#8d8576', 'center', false);
    } else if (name === 'arcade') {
      inset(29, 16, 902, 508, '#0a0620');
      c.save(); c.shadowBlur = 8; c.shadowColor = '#38f0ff'; c.strokeStyle = '#38f0ff'; c.lineWidth = 3; c.strokeRect(26.5, 13.5, 907, 513);
      c.shadowColor = '#ff3fb4'; c.strokeStyle = '#ff3fb4'; c.lineWidth = 2; c.strokeRect(20.5, 7.5, 919, 525); c.restore();
      c.fillStyle = '#ffffff'; for (const [cx, cy, dx, dy] of [[8, 8, 1, 1], [W - 8, 8, -1, 1], [8, H - 8, 1, -1], [W - 8, H - 8, -1, -1]]) { c.fillRect(Math.min(cx, cx + dx * 34), cy - 2, 34, 4); c.fillRect(cx - 2, Math.min(cy, cy + dy * 34), 4, 34); }
      c.fillStyle = '#0a0620'; c.fillRect(W / 2 - 84, H - 26, 168, 22); c.strokeStyle = '#ff3fb4'; c.lineWidth = 2; c.strokeRect(W / 2 - 83, H - 25, 166, 20);
      ptext(c, 'AGENT BRAWL', W / 2, H - 22, 2, '#ffe9a8', 'center', false);
    } else if (name === 'film') {
      inset(46, 22, 868, 488, '#0b0a0a'); c.strokeStyle = '#3a3630'; c.lineWidth = 2; c.strokeRect(45, 21, 870, 490);
      c.fillStyle = '#d9d4c4';
      for (let y = 12; y < H - 12; y += 36) for (const x of [14, W - 32]) { c.beginPath(); c.roundRect ? c.roundRect(x, y, 18, 24, 4) : c.rect(x, y, 18, 24); c.fill(); }
      ptext(c, 'AGENT BRAWL', W / 2, H - 22, 2, '#a89f8a', 'center', false);
    }
  }

  // ---------- building the picture ----------
  function rebuild() {
    ensure();
    const g = game, tick0 = g.tick, ph0 = g._phase, sh0 = g.shake, cx0 = g.cam.x, cz0 = g.cam.zoom, dk0 = g.dark;
    g.tick = st.tick; g.shake = 0; g.cam.x = st.cam.x; g.cam.zoom = st.cam.zoom; g.dark = st.dark; g._phase = 'fight';   // the scene as it was when the pause began (the same trick options.js plays for its pause menu)
    try {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(st.z, st.z); ctx.translate(-W / 2 - st.x, -H / 2 - st.y);
      try { window.drawWorld(); } finally { ctx.restore(); }
      if (cur('photo.hud')) { window.drawHUD(ctx, g); HOOKS.run('drawHud', ctx, g); }
      if (typeof window.drawPost === 'function') window.drawPost(ctx, st.tick, { flash: 0, red: 0 });
      ctx.restore();
    } finally { g.tick = tick0; g._phase = ph0; g.shake = sh0; g.cam.x = cx0; g.cam.zoom = cz0; g.dark = dk0; }
    rawC.clearRect(0, 0, W, H); rawC.drawImage(cv, 0, 0);
    outC.setTransform(1, 0, 0, 1, 0, 0); outC.globalAlpha = 1; outC.imageSmoothingEnabled = false;
    try { applyFilter(cur('photo.filter')); st.note = ''; } catch (e) { outC.drawImage(raw, 0, 0); st.note = 'FILTER FAILED'; }
    applyFrame(cur('photo.frame'));
    st.dirty = false; st.builds++;
    return out;
  }

  // ---------- saving ----------
  function fileName() {
    const d = new Date(), p = (n, l = 2) => String(n).padStart(l, '0');
    return 'agent-brawl-photo-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + (st.saves + 1) + '.png';
  }
  function download(url, name) {   // the only place a link is created, and only reached from save()
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    try { a.click(); } finally { a.remove(); }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ } }, 15000);
  }
  function save() {
    if (!st.active) return Promise.resolve(null);
    if (st.busy) return st.busy;
    if (st.dirty) rebuild();
    const p = new Promise(res => {
      const fail = () => { toast('SAVE FAILED', true); res(null); };
      try {
        out.toBlob(blob => {
          if (!blob) { fail(); return; }
          try {
            const name = fileName(); download(URL.createObjectURL(blob), name);
            st.saves++; st.last = { name, bytes: blob.size, type: blob.type, width: out.width, height: out.height, filter: cur('photo.filter'), frame: cur('photo.frame'), hud: !!cur('photo.hud'), zoom: st.z };
            toast('PHOTO SAVED'); BUS.emit('photo', { saved: name }); res(Object.assign({}, st.last));
          } catch (e) { fail(); }
        }, 'image/png');
      } catch (e) { fail(); }
    }).then(r => { st.busy = null; return r; });
    st.busy = p;
    return p;
  }

  // ---------- controls ----------
  function toast(txt, bad) { st.toast = txt; st.toastBad = !!bad; st.toastT = 100; }
  function setKey(key, v, label) { SETTINGS.set(key, v); st.dirty = true; toast(label + ' ' + String(FILTER_NAMES[v] || FRAME_NAMES[v] || (v ? 'ON' : 'OFF'))); }
  const setFilter = v => { if (FILTERS.includes(v)) setKey('photo.filter', v, 'FILTER'); };
  const setFrame = v => { if (FRAMES.includes(v)) setKey('photo.frame', v, 'FRAME'); };
  const setHud = v => setKey('photo.hud', !!v, 'HUD');
  function toggleBar(v) { st.ui = v === undefined ? !st.ui : !!v; if (!st.ui) toast(isTouch() ? 'BAR HIDDEN: TAP TO SHOW' : 'BAR HIDDEN: U OR CLICK TO SHOW'); }
  const cycle = (key, list, d) => { const i = list.indexOf(cur(key)); return list[(i + d + list.length) % list.length]; };

  function layout() {   // the buttons of the control bar, in canvas units
    const big = isTouch(), BH = big ? 46 : 34, G = 8, yB = H - G - BH, yA = yB - G - BH, L = [];
    const add = (id, x, w, y, text, o) => L.push(Object.assign({ id, x, y, w, h: BH, text }, o));
    add('fprev', 14, 34, yA, '<'); add('fname', 52, 150, yA, FILTER_NAMES[cur('photo.filter')], { cap: big ? '' : 'FILTER  G OR 1-6' }); add('fnext', 206, 34, yA, '>');
    add('rprev', 254, 34, yA, '<'); add('rname', 292, 150, yA, FRAME_NAMES[cur('photo.frame')], { cap: big ? '' : 'FRAME  B' }); add('rnext', 446, 34, yA, '>');
    add('hud', 494, 120, yA, cur('photo.hud') ? 'HUD ON' : 'HUD OFF', { cap: big ? '' : 'HUD  H', on: !!cur('photo.hud') });
    add('zout', 628, 34, yA, '-'); add('zval', 666, 84, yA, st.z.toFixed(1) + 'X', { cap: big ? '' : 'ZOOM  Q E OR WHEEL' }); add('zin', 754, 34, yA, '+');
    add('reset', 14, 168, yB, 'V RESET VIEW'); add('ui', 190, 150, yB, 'U HIDE BAR');
    add('save', 600, 222, yB, 'ENTER SAVE PNG', { primary: true }); add('done', 830, 116, yB, 'ESC DONE');
    L.top = yA - (big ? 8 : 20);
    return L;
  }
  function hitButton(x, y) {
    if (!st.ui) return null;
    const L = layout();
    for (const b of L) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    return y >= L.top ? { id: 'bar' } : null;
  }
  function press(id) {
    switch (id) {
      case 'fprev': setFilter(cycle('photo.filter', FILTERS, -1)); break; case 'fname': case 'fnext': setFilter(cycle('photo.filter', FILTERS, 1)); break;
      case 'rprev': setFrame(cycle('photo.frame', FRAMES, -1)); break; case 'rname': case 'rnext': setFrame(cycle('photo.frame', FRAMES, 1)); break;
      case 'hud': setHud(!cur('photo.hud')); break;
      case 'zout': zoomAt(st.z / 1.25, W / 2, H / 2); break; case 'zin': zoomAt(st.z * 1.25, W / 2, H / 2); break;
      case 'reset': resetView(); break; case 'ui': toggleBar(); break;
      case 'save': save(); break; case 'done': close(); break;
      default: break;
    }
  }

  function onUpdate(g) {
    if (!st.active) return;
    if (g.phase !== 'pause') { close(); return; }
    if (st.toastT > 0) st.toastT--;
    if (tap('Escape') || tap('KeyC') || tap('KeyP') || tap('Backspace')) { close(); return; }
    if (tap('Enter') || tap('NumpadEnter') || tap('Space')) save();
    if (tap('KeyH')) setHud(!cur('photo.hud'));
    if (tap('KeyG')) setFilter(cycle('photo.filter', FILTERS, 1));
    if (tap('KeyB')) setFrame(cycle('photo.frame', FRAMES, 1));
    FILTERS.forEach((f, i) => { if (tap('Digit' + (i + 1)) || tap('Numpad' + (i + 1))) setFilter(f); });
    if (tap('KeyU')) toggleBar();
    if (tap('KeyV') || tap('Digit0')) resetView();
    const K = (...c) => c.some(k => keys[k]) ? 1 : 0;
    const dx = K('ArrowRight', 'KeyD') - K('ArrowLeft', 'KeyA'), dy = K('ArrowDown', 'KeyS') - K('ArrowUp', 'KeyW'), zi = K('KeyE', 'Equal', 'NumpadAdd', 'PageUp') - K('KeyQ', 'Minus', 'NumpadSubtract', 'PageDown');
    if (zi) zoomAt(st.z * (zi > 0 ? 1.03 : 1 / 1.03), W / 2, H / 2);
    if (dx || dy) { const sp = (K('ShiftLeft', 'ShiftRight') ? 14 : 6) / st.z; setView(st.x + dx * sp, st.y + dy * sp, st.z); }
    clearPressed();   // nothing else may see these keys: not the pause menu, not the fight, not the options screen
  }
  HOOKS.add('update', onUpdate, -10);
  // The engine keeps a key press that nothing used (a C pressed during the fight would still be waiting when the pause screen starts), so the entry only counts a C pressed while paused.
  let cFresh = false;
  addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat) cFresh = game.phase === 'pause' && !st.active; });
  HOOKS.add('pauseItems', () => ({ id: 'photo', key: 'KeyC', label: 'C PHOTO MODE', run: () => { if (cFresh) { cFresh = false; open(); } } }));
  BUS.on('phase', e => { if (st.active && e.to !== 'pause') close(); });
  BUS.on('settings', e => { if (st.active && typeof e.key === 'string' && e.key.startsWith('photo.')) st.dirty = true; });

  // ---------- opening and closing ----------
  let ov = null;
  function overlay() {   // a transparent layer over the canvas that takes the mouse and touch input of the studio (options.js ignores events that do not target the canvas)
    if (ov) return ov;
    ov = document.createElement('div');
    ov.style.cssText = 'position:absolute;left:0;top:0;z-index:4;touch-action:none;display:none;cursor:grab;-webkit-user-select:none;user-select:none';
    document.body.appendChild(ov);
    const pos = e => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) * W / (r.width || W), (e.clientY - r.top) * H / (r.height || H)]; };
    const two = () => { const [a, b] = [...st.ptr.values()]; return [a, b, Math.hypot(a.x - b.x, a.y - b.y)]; };
    ov.addEventListener('pointerdown', e => {
      if (!st.active || (e.pointerType === 'mouse' && e.button > 0)) return;
      e.preventDefault();
      try { ov.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
      const [x, y] = pos(e);
      st.ptr.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, btn: hitButton(x, y) });
      if (st.ptr.size === 2) { const [, , d] = two(); st.pinch = { d, z: st.z }; for (const q of st.ptr.values()) q.btn = null; }
    });
    ov.addEventListener('pointermove', e => {
      const p = st.ptr.get(e.pointerId); if (!p || !st.active) return;
      const [x, y] = pos(e), dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
      if (Math.hypot(x - p.sx, y - p.sy) > 6) p.moved = true;
      if (st.pinch && st.ptr.size >= 2) { const [a, b, d] = two(); if (st.pinch.d > 1) zoomAt(st.pinch.z * d / st.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (p.btn) return;
      setView(st.x - dx / st.z, st.y - dy / st.z, st.z);
    });
    const up = e => {
      const p = st.ptr.get(e.pointerId); if (!p) return;
      st.ptr.delete(e.pointerId); if (st.ptr.size < 2) st.pinch = null;
      if (e.type === 'pointerup' && st.active) {
        if (p.btn) { const [x, y] = pos(e), b = hitButton(x, y); if (!p.moved && b && b.id === p.btn.id) press(b.id); }   // a button counts when the finger lifts on it
        else if (!p.moved && !st.ui && !st.ptr.size) st.ui = true;                                                         // a tap on the bare picture brings the bar back
      }
      try { ov.releasePointerCapture(e.pointerId); } catch (err) { /* nothing held */ }
    };
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
    ov.addEventListener('wheel', e => { if (!st.active) return; e.preventDefault(); const [x, y] = pos(e); zoomAt(st.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, y); }, { passive: false });
    ov.addEventListener('contextmenu', e => e.preventDefault());
    return ov;
  }
  function syncOverlay() {
    if (!ov) return; const s = cv.style;
    if (ov.style.left !== s.left) ov.style.left = s.left; if (ov.style.top !== s.top) ov.style.top = s.top;
    if (ov.style.width !== s.width) ov.style.width = s.width; if (ov.style.height !== s.height) ov.style.height = s.height;
  }
  function open() {
    if (st.active || game.phase !== 'pause' || optionsOpen()) return false;
    ensure(); overlay();
    st.active = true; st.tick = game.tick; st.cam = { x: game.cam.x, zoom: game.cam.zoom }; st.dark = game.dark;
    st.x = st.y = 0; st.z = 1; st.ui = true; st.dirty = true; st.toastT = 0; st.ptr.clear(); st.pinch = null;
    ov.style.display = 'block'; syncOverlay(); clearPressed();
    BUS.emit('photo', { open: true });
    return true;
  }
  function close() {
    if (!st.active) return false;
    st.active = false; st.ptr.clear(); st.pinch = null;
    if (ov) ov.style.display = 'none';
    clearPressed(); BUS.emit('photo', { open: false });
    return true;
  }

  // ---------- drawing ----------
  function plate(c, x, y, w, h, on, primary) {
    c.fillStyle = primary ? '#6b4d0e' : on ? 'rgba(28,52,36,0.95)' : 'rgba(34,28,46,0.95)'; c.fillRect(x, y, w, h);
    c.strokeStyle = primary ? '#ffd76a' : on ? '#7bd88f' : '#6b6277'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function drawBar(c) {
    const L = layout();
    c.fillStyle = 'rgba(8,6,12,0.96)'; c.fillRect(0, L.top, W, H - L.top); c.fillStyle = '#c9a24a'; c.fillRect(0, L.top, W, 2);
    for (const b of L) {
      plate(c, b.x, b.y, b.w, b.h, b.on, b.primary);
      ptext(c, b.text, b.x + b.w / 2, b.y + Math.round((b.h - 14) / 2), 2, b.primary ? '#ffe9a8' : '#e8e0cc', 'center');
      if (b.cap) ptext(c, b.cap, b.x, b.y - 10, 1, '#8d8576', 'left', false);
    }
    ptext(c, 'ARROWS OR DRAG: PAN', 352, L[0].y + 0 + (L[0].h) + 8 + Math.round((L[0].h - 14) / 2), 2, '#8d8576', 'left', false);
  }
  function drawPhoto(c) {
    syncOverlay();
    if (st.dirty) rebuild();
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = false;
    c.drawImage(out, 0, 0);
    if (st.ui) drawBar(c);
    const msg = st.toastT > 0 ? st.toast : st.note;
    if (msg) { const w = msg.length * 12 + 28; plate(c, W / 2 - w / 2, 46, w, 32, false, false); ptext(c, msg, W / 2, 54, 2, st.toastBad || !st.toastT ? '#ff8a7a' : '#a8f0b4', 'center'); }
    c.restore();
  }
  const entryRect = () => ({ x: W - 170, y: 340, w: 156, h: isTouch() ? 48 : 40 });
  function drawEntry(c) {   // a button on the pause screen for mouse and touch (the C key works without it)
    if (game.phase !== 'pause' || optionsOpen()) return;
    const r = entryRect(); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); plate(c, r.x, r.y, r.w, r.h, false, false);
    ptext(c, isTouch() ? 'PHOTO MODE' : 'C PHOTO MODE', r.x + r.w / 2, r.y + Math.round((r.h - 14) / 2), 2, '#ffe9a8', 'center'); c.restore();
  }
  HOOKS.add('drawTop', (c, g) => { if (st.active && g.phase === 'pause') drawPhoto(c); else if (!st.active) drawEntry(c); }, 9999);

  // while the studio is open the engine does not paint its own pause scene: the studio paints the whole picture itself (and only when something changed)
  const drawFight0 = window.drawFight;
  if (typeof drawFight0 === 'function') window.drawFight = function () { if (st.active && game.phase === 'pause') return; return drawFight0.apply(this, arguments); };

  // the pause screen button: the pointer goes to the canvas, so this looks at it first (options.js only takes its own pause rows)
  addEventListener('pointerdown', e => {
    if (st.active || e.target !== cv || game.phase !== 'pause' || optionsOpen() || (e.pointerType === 'mouse' && e.button > 0)) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / (r.width || W), y = (e.clientY - r.top) * H / (r.height || H), b = entryRect();
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return;
    e.preventDefault(); e.stopImmediatePropagation(); open();
  }, true);

  window.PHOTO = {
    FILTERS: FILTERS.slice(), FRAMES: FRAMES.slice(),
    get active() { return st.active; },
    get canvas() { return out || null; },
    state: () => ({ active: st.active, x: st.x, y: st.y, zoom: st.z, filter: cur('photo.filter'), frame: cur('photo.frame'), hud: !!cur('photo.hud'), ui: st.ui, tick: st.tick, saves: st.saves, builds: st.builds, dirty: st.dirty, toast: st.toastT > 0 ? st.toast : '', last: st.last && Object.assign({}, st.last) }),
    open, close, save, rebuild: () => { if (st.active) rebuild(); return out || null; },
    reset: resetView, setView, zoomAt,
    pan: (dx, dy) => setView(st.x + dx, st.y + dy, st.z),
    setFilter, setFrame, setHud, ui: toggleBar,
    buttons: () => layout().map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, text: b.text })),
    entryButton: entryRect,
    overlay: () => ov,
  };
})();
