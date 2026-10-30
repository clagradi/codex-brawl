// Tests for p-photomode.js (photo mode from the pause screen). Owner: the p-photomode agent. Runs after core.mjs.
// Everything is driven with hold(true) and step(n); render() is called directly, so the drawTop hook that builds the picture runs on demand.
// Hooks used by p-photomode.js: update, drawTop, pauseItems. Settings: photo.filter, photo.frame, photo.hud. Events: phase (in), settings (in), photo (out).
// The save path is checked against the real toBlob: the PNG bytes are decoded again and compared with the picture on screen. The three browser calls that make a download
// (toBlob, createObjectURL, a link click) are wrapped to count calls; the link click itself is swallowed so that headless Chrome does not write files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    window.Q = {};
    Q.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    Q.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    Q.fight = () => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [0, 1]; game.arenaPick = 0; startMatch(); Q.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; step(90);
    };
    Q.pause = () => { Q.T('KeyP'); step(2); return game.phase; };
    Q.openStudio = () => { Q.T('KeyC'); step(2); render(); return PHOTO.active; };
    Q.data = () => PHOTO.canvas.getContext('2d').getImageData(0, 0, 960, 540).data;
    Q.hash = () => { const d = Q.data(); let s = 0; for (let k = 0; k < d.length; k += 53) s = (s * 31 + d[k]) | 0; return s; };
    Q.px = (x, y) => { const d = Q.data(), i = (y * 960 + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    Q.mainHash = () => { const d = ctx.getImageData(0, 0, 960, 540).data; let s = 0; for (let k = 0; k < d.length; k += 53) s = (s * 31 + d[k]) | 0; return s; };
    Q.rect = id => PHOTO.buttons().find(b => b.id === id);
    Q.client = (el, x, y) => { const r = el.getBoundingClientRect(); return [r.left + x * r.width / 960, r.top + y * r.height / 540]; };
    Q.ptr = (type, id, x, y, el) => { const [cx, cy] = Q.client(el, x, y); el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true })); };
    Q.click = (id) => { const r = Q.rect(id), ov = PHOTO.overlay(), x = r.x + r.w / 2, y = r.y + r.h / 2; Q.ptr('pointerdown', 7, x, y, ov); Q.ptr('pointerup', 7, x, y, ov); };
    Q.calls = { blob: 0, url: 0, click: 0, links: [] };
    const tb = HTMLCanvasElement.prototype.toBlob, cu = URL.createObjectURL, ck = HTMLAnchorElement.prototype.click;
    HTMLCanvasElement.prototype.toBlob = function (...a) { Q.calls.blob++; return tb.apply(this, a); };
    URL.createObjectURL = function (b) { Q.calls.url++; Q.blob = b; return cu.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { Q.calls.click++; Q.calls.links.push({ href: this.href, download: this.download, inDom: document.contains(this) }); };
    Q.reset = () => { for (const k of ['photo.filter', 'photo.frame', 'photo.hud']) SETTINGS.reset(k); };
  })()`);

  // ---- structure, settings, hooks, source hygiene ----
  const s0 = await ev(`({ api: typeof PHOTO === 'object' && typeof PHOTO.state === 'function' && typeof PHOTO.save === 'function', filters: PHOTO.FILTERS.join(), frames: PHOTO.FRAMES.join(),
    keys: [SETTINGS.get('photo.filter'), SETTINGS.get('photo.frame'), SETTINGS.get('photo.hud')], hooks: ['update', 'drawTop', 'pauseItems'].every(h => HOOKS.has(h)),
    item: HOOKS.collect('pauseItems').filter(i => i.key === 'KeyC').map(i => i.label), active: PHOTO.active })`);
  check(s0.api && s0.hooks && s0.active === false, 'PHOTO is loaded, uses the update, drawTop and pauseItems hooks and starts closed');
  check(s0.filters === 'crt,sepia,noir,vapor,pixel,none' && s0.frames === 'none,cinema,polaroid,arcade,film', 'six filters (CRT, SEPIA, NOIR, VAPORWAVE, PIXEL BIG, NONE) and the frames are listed: ' + s0.filters + ' / ' + s0.frames);
  check(s0.keys[0] === 'none' && s0.keys[1] === 'none' && s0.keys[2] === true, 'photo.filter and photo.frame default to none, photo.hud to on');
  check(s0.item.length === 1 && s0.item[0] === 'C PHOTO MODE', 'the pause screen lists C PHOTO MODE: ' + JSON.stringify(s0.item));

  const src = fs.readFileSync(path.join(ROOT, 'p-photomode.js'), 'utf8');
  const banned = ['mortal ' + 'kombat', 'fatal' + 'ity', 'finish ' + 'him', 'flaw' + 'less', 'get over ' + 'here', 'toast' + 'y', 'scorp' + 'ion', 'sub' + '-zero', 'rai' + 'den', 'hado' + 'uken', 'shor' + 'yuken', 'street ' + 'fighter', 'tek' + 'ken', 'baba' + 'lity', 'brutal' + 'ity'];
  check(!banned.some(w => src.toLowerCase().includes(w)), 'p-photomode.js contains no banned word');
  check(!/[^\x00-\x7f]/.test(src), 'p-photomode.js is plain ASCII');
  check(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|\bimport\s*\(/.test(src), 'p-photomode.js makes no network request and loads nothing');

  // ---- opening: only from the pause screen, with the C key ----
  const o = await ev(`(() => {
    const out = {}; Q.fight(); out.fightOpen = PHOTO.open(); Q.T('KeyC'); step(2); out.fightKey = PHOTO.active;
    out.phase = Q.pause(); out.pauseBefore = PHOTO.active; out.opened = Q.openStudio(); out.st = PHOTO.state(); out.canvas = PHOTO.canvas && [PHOTO.canvas.width, PHOTO.canvas.height];
    out.ovShown = PHOTO.overlay().style.display; out.builds = out.st.builds; return out;
  })()`);
  check(o.fightOpen === false && o.fightKey === false && o.phase === 'pause' && o.pauseBefore === false, 'photo mode does not open during a fight, only from the pause screen: ' + JSON.stringify([o.fightOpen, o.fightKey]));
  check(o.opened === true && o.st.zoom === 1 && o.st.x === 0 && o.st.y === 0 && o.st.ui === true && o.ovShown === 'block', 'C on the pause screen opens photo mode at the default view with the bar and the pointer layer: ' + JSON.stringify(o.st));
  check(o.canvas[0] === 960 && o.canvas[1] === 540, 'the picture is 960 by 540');

  // ---- the game is frozen, the picture is stable and cached ----
  const fz = await ev(`(() => {
    const out = {}, [a, b] = game.f, p0 = [a.x, a.y, a.st, b.x, b.st], h0 = Q.hash(), bd0 = PHOTO.state().builds, tk = game.tick, hp = [a.hp, b.hp];
    step(120); render(); out.tickAdvances = game.tick - tk; out.same = JSON.stringify(p0) === JSON.stringify([a.x, a.y, a.st, b.x, b.st]) && hp[0] === a.hp && hp[1] === b.hp;
    out.hashStable = h0 === Q.hash(); out.rebuilt = PHOTO.state().builds - bd0; out.phase = game.phase;
    return out;
  })()`);
  check(fz.same && fz.phase === 'pause', 'the fighters do not move or lose health while photo mode is open');
  check(fz.tickAdvances >= 120 && fz.hashStable, 'the clock keeps running but the picture does not change (the animated scene is frozen at the pause tick)');
  check(fz.rebuilt === 0, 'a still view is built once and reused: ' + fz.rebuilt + ' rebuilds in 120 frames');

  // ---- free camera: pan and zoom with limits ----
  const cam = await ev(`(() => {
    const out = {}; PHOTO.reset(); PHOTO.rebuild(); const h1 = Q.hash();   // rebuilt here: hazard animation in hazards.js counts its own frames while paused, so only a build made now can be compared with the one at the end
    PHOTO.pan(500, 500); out.noPanAtOne = [PHOTO.state().x, PHOTO.state().y];
    PHOTO.zoomAt(9, 480, 270); out.zoomMax = PHOTO.state().zoom; render(); out.hZoom = Q.hash();
    PHOTO.zoomAt(0.1, 480, 270); out.zoomMin = PHOTO.state().zoom; PHOTO.setView(0, 0, 2); PHOTO.pan(9999, -9999); out.limit2 = [PHOTO.state().x, PHOTO.state().y];
    render(); out.hPan = Q.hash(); PHOTO.setView(0, 0, 4); PHOTO.pan(9999, 9999); out.limit4 = [PHOTO.state().x, PHOTO.state().y];
    PHOTO.setView(-50, -30, 2); const a = Q.hash(); render(); const b = Q.hash(); PHOTO.setView(50, 30, 2); render(); out.panMoves = a !== Q.hash();
    PHOTO.setView(100, 20, 2); const before = PHOTO.state(); PHOTO.zoomAt(3, 700, 100);
    out.anchor = [before.x, before.y]; out.after = [PHOTO.state().x, PHOTO.state().y, PHOTO.state().zoom];
    const wx0 = 480 + before.x + (700 - 480) / 2, wx1 = 480 + PHOTO.state().x + (700 - 480) / 3; out.pinned = Math.abs(wx0 - wx1) < 0.01;
    PHOTO.reset(); out.back = [PHOTO.state().x, PHOTO.state().y, PHOTO.state().zoom]; render(); out.hBack = Q.hash(); out.h1 = h1; return out;
  })()`);
  check(cam.noPanAtOne[0] === 0 && cam.noPanAtOne[1] === 0, 'at zoom 1 there is nothing to pan to (the view cannot leave the scene)');
  check(cam.zoomMax === 4 && cam.zoomMin === 1, 'zoom is limited to 1x..4x: ' + cam.zoomMax + ' / ' + cam.zoomMin);
  check(cam.limit2[0] === 240 && cam.limit2[1] === -135 && cam.limit4[0] === 360 && cam.limit4[1] === 202.5, 'pan is limited so no unpainted edge shows: ' + JSON.stringify([cam.limit2, cam.limit4]));
  check(cam.hZoom !== cam.h1 && cam.hPan !== cam.hZoom && cam.panMoves, 'zooming and panning change the picture');
  check(cam.pinned, 'zooming around a point keeps the point under the pointer where it is');
  check(cam.back[0] === 0 && cam.back[1] === 0 && cam.back[2] === 1 && cam.hBack === cam.h1, 'reset view gives back exactly the first picture');

  // ---- keyboard: pan, zoom, HUD, filters, frames, bar, reset ----
  const kb = await ev(`(() => {
    const out = {}; PHOTO.reset(); const down = c => dispatchEvent(new KeyboardEvent('keydown', { code: c })), up = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    down('KeyE'); step(30); up('KeyE'); out.zoomIn = PHOTO.state().zoom; down('KeyQ'); step(10); up('KeyQ'); out.zoomOut = PHOTO.state().zoom;
    PHOTO.setView(0, 0, 2); down('ArrowRight'); step(10); up('ArrowRight'); out.right = PHOTO.state().x; down('KeyW'); step(10); up('KeyW'); out.up = PHOTO.state().y;
    down('ArrowLeft'); down('ShiftLeft'); step(5); up('ArrowLeft'); up('ShiftLeft'); out.shifted = PHOTO.state().x;
    PHOTO.reset(); const hud0 = PHOTO.state().hud; Q.T('KeyH'); step(1); out.hud = [hud0, PHOTO.state().hud, SETTINGS.get('photo.hud')]; Q.T('KeyH'); step(1);
    Q.T('KeyG'); step(1); out.g = PHOTO.state().filter; Q.T('Digit1'); step(1); out.d1 = PHOTO.state().filter; Q.T('Digit4'); step(1); out.d4 = PHOTO.state().filter; Q.T('Digit6'); step(1); out.d6 = PHOTO.state().filter; Q.T('Digit5'); step(1); out.d5 = PHOTO.state().filter;
    Q.T('KeyB'); step(1); out.b = PHOTO.state().frame; Q.T('KeyB'); step(1); out.b2 = PHOTO.state().frame; for (let i = 0; i < 4; i++) { Q.T('KeyB'); step(1); } out.bWrap = PHOTO.state().frame;
    Q.T('KeyU'); step(1); out.ui = PHOTO.state().ui; Q.T('KeyU'); step(1); out.ui2 = PHOTO.state().ui;
    PHOTO.setView(80, 40, 2); Q.T('KeyV'); step(1); out.v = [PHOTO.state().x, PHOTO.state().y, PHOTO.state().zoom]; return out;
  })()`);
  check(kb.zoomIn > 1.5 && kb.zoomOut < kb.zoomIn && kb.zoomOut > 1, 'E zooms in and Q zooms out while held: ' + kb.zoomIn.toFixed(2) + ' then ' + kb.zoomOut.toFixed(2));
  check(Math.abs(kb.right - 30) < 0.01 && Math.abs(kb.up + 30) < 0.01 && kb.shifted < kb.right && Math.abs(kb.right - kb.shifted - 35) < 0.01, 'arrows and WASD pan by 6 / zoom per tick, Shift makes it faster: ' + JSON.stringify([kb.right, kb.up, kb.shifted]));
  check(kb.hud[0] === true && kb.hud[1] === false && kb.hud[2] === false, 'H hides the HUD and the choice is stored in photo.hud: ' + JSON.stringify(kb.hud));
  check(kb.g === 'crt' && kb.d1 === 'crt' && kb.d4 === 'vapor' && kb.d6 === 'none' && kb.d5 === 'pixel', 'G cycles the filter and 1 to 6 pick it: ' + JSON.stringify([kb.g, kb.d1, kb.d4, kb.d6, kb.d5]));
  check(kb.b === 'cinema' && kb.b2 === 'polaroid' && kb.bWrap === 'cinema', 'B cycles the frame (and wraps around the list): ' + JSON.stringify([kb.b, kb.b2, kb.bWrap]));
  check(kb.ui === false && kb.ui2 === true, 'U hides and shows the control bar');
  check(kb.v[0] === 0 && kb.v[1] === 0 && kb.v[2] === 1, 'V resets the view');

  // ---- the HUD can be hidden: the picture changes, the scene stays ----
  const hud = await ev(`(() => {
    PHOTO.reset(); PHOTO.setFilter('none'); PHOTO.setFrame('none'); PHOTO.setHud(true); render(); const withHud = Q.hash(), d1 = Q.data().slice(); PHOTO.setHud(false); render(); const without = Q.hash(), d2 = Q.data();
    let diffTop = 0, diffMid = 0; for (let y = 0; y < 80; y++) for (let x = 0; x < 960; x++) { const i = (y * 960 + x) * 4; if (d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) diffTop++; }
    for (let y = 200; y < 330; y++) for (let x = 0; x < 960; x++) { const i = (y * 960 + x) * 4; if (d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) diffMid++; }
    PHOTO.setHud(true); return { withHud, without, diffTop, diffMid };
  })()`);
  check(hud.withHud !== hud.without && hud.diffTop > 800, 'HUD off removes the health bars and timer from the picture: ' + hud.diffTop + ' changed pixels in the top strip');
  check(hud.diffMid === 0, 'HUD off leaves the fighters and the arena exactly as they were: ' + hud.diffMid + ' changed pixels');

  // ---- the six filters ----
  const fl = await ev(`(() => {
    PHOTO.reset(); PHOTO.setHud(true); PHOTO.setFrame('none'); PHOTO.setFilter('none'); render(); const base = Q.hash(), bd = Q.data().slice(), out = { hashes: {} }, t = {};
    for (const f of PHOTO.FILTERS) { PHOTO.setFilter(f); const t0 = performance.now(); render(); t[f] = performance.now() - t0; out.hashes[f] = Q.hash(); const d = Q.data();
      if (f === 'sepia') { let bad = 0, n = 0; for (let k = 0; k < d.length; k += 4 * 37) { n++; if (!(d[k] >= d[k + 1] && d[k + 1] >= d[k + 2])) bad++; } out.sepiaBad = bad; out.sepiaN = n; }
      if (f === 'noir') { let bad = 0; for (let k = 0; k < d.length; k += 4 * 37) if (d[k] !== d[k + 1] || d[k + 1] !== d[k + 2]) bad++; out.noirBad = bad; }
      if (f === 'pixel') { let bad = 0, cells = 0; for (let by = 0; by < 108; by += 3) for (let bx = 0; bx < 192; bx += 5) { cells++; const i0 = ((by * 5) * 960 + bx * 5) * 4; for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) { const i = ((by * 5 + j) * 960 + bx * 5 + k) * 4; if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2]) bad++; } } out.pixelBad = bad; out.pixelCells = cells;
        const lv = new Set(); for (let k = 0; k < d.length; k += 4 * 29) lv.add(d[k]); out.pixelLevels = lv.size; }
      if (f === 'crt') { out.crtCorner = Q.px(0, 0).concat(Q.px(959, 539)); let a = 0, b = 0, n = 0; for (let y = 120; y < 420; y++) { if (y % 3 === 2) { for (let x = 200; x < 760; x += 3) { a += d[(y * 960 + x) * 4 + 1]; n++; } } else if (y % 3 === 0) { for (let x = 200; x < 760; x += 3) b += d[(y * 960 + x) * 4 + 1]; } } out.scan = a / b; out.crtCentre = Q.px(480, 270); }
      if (f === 'vapor') { let r = 0, g = 0, b = 0, n = 0; for (let k = 0; k < d.length; k += 4 * 41) { r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; } out.vapor = [r / n, g / n, b / n]; }
    }
    PHOTO.setFilter('none'); render(); out.base = base; out.backToBase = Q.hash() === base; out.t = t; return out;
  })()`);
  const names = ['crt', 'sepia', 'noir', 'vapor', 'pixel'];
  check(names.every(f => fl.hashes[f] !== fl.base) && new Set(Object.values(fl.hashes)).size === 6, 'each of the five filters changes the picture and no two look alike: ' + JSON.stringify(fl.hashes));
  check(fl.hashes.none === fl.base && fl.backToBase, 'the filter NONE gives back the plain picture');
  check(fl.sepiaBad === 0 && fl.sepiaN > 1000, 'SEPIA keeps red >= green >= blue on every sampled pixel');
  check(fl.noirBad === 0, 'NOIR is black and white (red = green = blue on every sampled pixel)');
  check(fl.pixelBad === 0 && fl.pixelCells > 400 && fl.pixelLevels <= 8, 'PIXEL BIG makes flat 5 by 5 blocks with a handful of levels: ' + JSON.stringify([fl.pixelBad, fl.pixelCells, fl.pixelLevels]));
  check(fl.crtCorner.every(v => v === 0), 'CRT rounds the glass: the corners of the screen are black: ' + JSON.stringify(fl.crtCorner));
  check(fl.scan < 0.85 && fl.scan > 0.3, 'CRT draws dark scan lines (every third row is dimmer): ratio ' + fl.scan.toFixed(2));
  check(fl.vapor[0] > 40 && fl.vapor[2] > 60 && fl.vapor[1] < fl.vapor[0] + fl.vapor[2], 'VAPORWAVE is a violet, pink and cyan palette: ' + fl.vapor.map(v => Math.round(v)).join(','));
  check(Object.values(fl.t).every(v => v < 600), 'every filter builds fast enough to use while dragging: ' + JSON.stringify(fl.t));

  // ---- frames ----
  const fr = await ev(`(() => {
    PHOTO.reset(); PHOTO.setHud(true); PHOTO.setFilter('none'); PHOTO.setFrame('none'); render(); const base = Q.hash(), out = { hashes: {}, corner: {}, mid: {} }, mid0 = Q.px(480, 270);
    for (const f of PHOTO.FRAMES) { PHOTO.setFrame(f); render(); out.hashes[f] = Q.hash(); out.corner[f] = Q.px(3, 3); out.mid[f] = Q.px(480, 270); }
    PHOTO.setFrame('none'); out.base = base; out.mid0 = mid0; return out;
  })()`);
  check(['cinema', 'polaroid', 'arcade', 'film'].every(f => fr.hashes[f] !== fr.base) && new Set(Object.values(fr.hashes)).size === 5, 'each frame changes the picture and no two look alike');
  check(fr.hashes.none === fr.base, 'the frame NONE adds nothing');
  check(fr.corner.polaroid[0] > 200 && fr.corner.polaroid[2] > 190 && fr.corner.cinema[0] < 20 && fr.corner.arcade[2] < 60 && fr.corner.film[0] < 30, 'the frames have their own colours (polaroid paper, black matte, dark arcade cabinet, film base): ' + JSON.stringify(fr.corner));
  check(fr.mid.cinema.every((v, i) => Math.abs(v - fr.mid0[i]) < 70), 'the picture stays visible inside the frame');

  // ---- nothing is saved or downloaded until the player asks ----
  const idle = await ev(`(() => {
    PHOTO.reset(); for (const f of PHOTO.FILTERS) { PHOTO.setFilter(f); render(); } for (const f of PHOTO.FRAMES) { PHOTO.setFrame(f); render(); } PHOTO.setHud(false); PHOTO.zoomAt(2, 300, 200); PHOTO.pan(40, 10); render(); PHOTO.ui(false); render(); PHOTO.ui(true); step(60); render();
    return { calls: JSON.stringify([Q.calls.blob, Q.calls.url, Q.calls.click]), links: document.querySelectorAll('a[download]').length, saves: PHOTO.state().saves };
  })()`);
  check(idle.calls === '[0,0,0]' && idle.links === 0 && idle.saves === 0, 'building, filtering, framing and moving never encode, link or download anything: ' + idle.calls);

  // ---- saving with Enter: a real PNG of the picture, not of the control bar ----
  await ev(`(() => { PHOTO.reset(); PHOTO.setFilter('sepia'); PHOTO.setFrame('polaroid'); PHOTO.setHud(false); PHOTO.setView(60, 30, 1.8); render(); window.__expect = Q.hash(); window.__main = Q.mainHash(); Q.T('Enter'); step(1); })()`);
  const sv = await ev(`(async () => {
    let n = 0; while (PHOTO.state().saves < 1 && n++ < 100) await new Promise(r => setTimeout(r, 30));
    const out = { saves: PHOTO.state().saves, calls: Q.calls, last: PHOTO.state().last, phase: game.phase, active: PHOTO.active };
    const bytes = new Uint8Array(await Q.blob.arrayBuffer()); out.size = bytes.length; out.sig = Array.from(bytes.slice(0, 8)).join(','); out.ihdr = String.fromCharCode(...bytes.slice(12, 16)); const dv = new DataView(bytes.buffer); out.w = dv.getUint32(16); out.h = dv.getUint32(20); out.type = Q.blob.type;
    const bm = await createImageBitmap(Q.blob), c = document.createElement('canvas'); c.width = 960; c.height = 540; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, 960, 540).data, e = Q.data(); let diff = 0; for (let k = 0; k < d.length; k += 4) if (d[k] !== e[k] || d[k + 1] !== e[k + 1] || d[k + 2] !== e[k + 2]) diff++;
    out.diff = diff; out.hashNow = Q.hash() === __expect; out.mainDiffers = Q.mainHash() !== __expect; out.leftover = document.querySelectorAll('a[download]').length; return out;
  })()`);
  check(sv.saves === 1 && sv.calls.blob === 1 && sv.calls.url === 1 && sv.calls.click === 1, 'Enter saves exactly once: one encode, one blob link, one click: ' + JSON.stringify(sv.calls.blob + ',' + sv.calls.url + ',' + sv.calls.click));
  check(/^agent-brawl-photo-\d{8}-\d{6}-1\.png$/.test(sv.calls.links[0].download) && sv.calls.links[0].href.startsWith('blob:') && sv.calls.links[0].inDom && sv.leftover === 0, 'the download link carries a .png name and a blob address, and is removed again: ' + JSON.stringify(sv.calls.links[0]));
  check(sv.type === 'image/png' && sv.sig === '137,80,78,71,13,10,26,10' && sv.ihdr === 'IHDR' && sv.w === 960 && sv.h === 540 && sv.size > 20000, 'the file is a real PNG, 960 by 540: ' + JSON.stringify([sv.type, sv.sig, sv.w, sv.h, sv.size]));
  check(sv.diff === 0 && sv.hashNow, 'the PNG is the filtered, framed picture pixel for pixel (decoded again and compared): ' + sv.diff + ' different pixels');
  check(sv.mainDiffers, 'the picture on screen (with the control bar) is not what is saved');
  check(sv.last && sv.last.filter === 'sepia' && sv.last.frame === 'polaroid' && sv.last.hud === false && sv.last.width === 960 && sv.phase === 'pause' && sv.active === true, 'save reports what it wrote and photo mode stays open and paused');

  // ---- mouse and touch: the pointer layer, the buttons, the pause screen button ----
  const pt = await ev(`(() => {
    const out = {}, ov = PHOTO.overlay(); PHOTO.reset(); PHOTO.setFilter('none'); PHOTO.setFrame('none'); PHOTO.setHud(true); render();
    const r = ov.getBoundingClientRect(), c = cv.getBoundingClientRect(); out.geo = [Math.round(r.left - c.left), Math.round(r.top - c.top), Math.round(r.width - c.width), Math.round(r.height - c.height)]; out.zIndex = ov.style.zIndex;
    const wheel = (dy, x, y) => { const [cx, cy] = Q.client(ov, x, y); ov.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, clientX: cx, clientY: cy, bubbles: true, cancelable: true })); };
    wheel(-100, 480, 270); out.wheelIn = PHOTO.state().zoom; wheel(-100, 480, 270); out.wheelIn2 = PHOTO.state().zoom; wheel(100, 480, 270); wheel(100, 480, 270); wheel(100, 480, 270); out.wheelOut = PHOTO.state().zoom;
    PHOTO.setView(0, 0, 2); Q.ptr('pointerdown', 1, 400, 200, ov); Q.ptr('pointermove', 1, 340, 170, ov); Q.ptr('pointerup', 1, 340, 170, ov); out.drag = [PHOTO.state().x, PHOTO.state().y];
    PHOTO.reset(); Q.ptr('pointerdown', 11, 380, 200, ov); Q.ptr('pointerdown', 12, 480, 200, ov); Q.ptr('pointermove', 12, 580, 200, ov); out.pinch = PHOTO.state().zoom; Q.ptr('pointerup', 12, 580, 200, ov); Q.ptr('pointerup', 11, 380, 200, ov);
    PHOTO.reset(); PHOTO.setHud(true); Q.click('hud'); out.hudBtn = PHOTO.state().hud; Q.click('hud'); Q.click('fnext'); out.fnext = PHOTO.state().filter; Q.click('fprev'); Q.click('fprev'); out.fprev = PHOTO.state().filter; Q.click('rnext'); out.rnext = PHOTO.state().frame; Q.click('rprev'); out.rprev = PHOTO.state().frame;
    Q.click('fprev'); Q.click('fnext'); Q.click('zin'); out.zin = PHOTO.state().zoom; Q.click('zout'); out.zout = PHOTO.state().zoom; PHOTO.setView(40, 20, 2); Q.click('reset'); out.resetBtn = PHOTO.state().zoom;
    Q.click('ui'); out.uiHidden = PHOTO.state().ui; const [x, y] = [400, 200]; Q.ptr('pointerdown', 3, x, y, ov); Q.ptr('pointerup', 3, x, y, ov); out.uiBack = PHOTO.state().ui;
    PHOTO.setView(0, 0, 2); const sv = PHOTO.state().saves, b = Q.rect('save'); Q.ptr('pointerdown', 5, b.x + 20, b.y + 10, ov); Q.ptr('pointermove', 5, b.x + 20, 100, ov); Q.ptr('pointerup', 5, b.x + 20, 100, ov); out.dragOffButton = [PHOTO.state().saves - sv, PHOTO.state().x];
    out.buttons = PHOTO.buttons().length; out.inside = PHOTO.buttons().every(b => b.x >= 0 && b.y >= 0 && b.x + b.w <= 960 && b.y + b.h <= 540); return out;
  })()`);
  check(pt.geo.every(v => Math.abs(v) <= 1) && pt.zIndex === '4', 'the pointer layer sits exactly over the canvas: ' + JSON.stringify(pt.geo));
  check(pt.wheelIn > 1.1 && pt.wheelIn2 > pt.wheelIn && pt.wheelOut === 1, 'the wheel zooms in and out: ' + [pt.wheelIn, pt.wheelIn2, pt.wheelOut].join(' / '));
  check(Math.abs(pt.drag[0] - 30) < 0.5 && Math.abs(pt.drag[1] - 15) < 0.5, 'dragging pans the picture with the finger (60 and 30 px at 2x is 30 and 15): ' + JSON.stringify(pt.drag));
  check(Math.abs(pt.pinch - 2) < 0.05, 'two fingers spreading to twice the distance zoom to 2x: ' + pt.pinch);
  check(pt.hudBtn === false && pt.fnext === 'crt' && pt.fprev === 'pixel', 'the HUD and filter buttons work: ' + JSON.stringify([pt.hudBtn, pt.fnext, pt.fprev]));
  check(pt.rnext === 'cinema' && pt.rprev === 'none' && pt.zin > 1 && pt.zout === 1 && pt.resetBtn === 1, 'the frame, zoom and reset buttons work: ' + JSON.stringify([pt.rnext, pt.rprev, pt.zin, pt.zout, pt.resetBtn]));
  check(pt.uiHidden === false && pt.uiBack === true, 'the bar can be hidden with its button and comes back with a tap on the picture');
  check(pt.dragOffButton[0] === 0 && pt.dragOffButton[1] === 0, 'pressing SAVE and dragging away does not save or pan: ' + JSON.stringify(pt.dragOffButton));
  check(pt.buttons === 14 && pt.inside, 'the bar has 14 controls and all of them fit inside the picture');

  // ---- saving with the SAVE button (a tap) ----
  const tapSave = await ev(`(async () => {
    const before = PHOTO.state().saves; Q.click('save'); let n = 0; while (PHOTO.state().saves < before + 1 && n++ < 100) await new Promise(r => setTimeout(r, 30));
    return { saves: PHOTO.state().saves - before, calls: Q.calls.click, name: PHOTO.state().last && PHOTO.state().last.name, second: Q.calls.links[1] && Q.calls.links[1].download };
  })()`);
  check(tapSave.saves === 1 && tapSave.calls === 2 && /-2\.png$/.test(tapSave.name || ''), 'tapping SAVE PNG saves once more with the next number: ' + JSON.stringify(tapSave));

  // ---- leaving: Esc, C and P go back to the pause screen; no key leaks into the pause menu or the game ----
  const lk = await ev(`(() => {
    const out = {}, gore = typeof FX !== 'undefined' ? FX.gore : null, before = JSON.stringify(Object.assign({}, SETTINGS.all(), { 'photo.filter': 0, 'photo.frame': 0, 'photo.hud': 0 }));
    for (const c of ['KeyQ', 'KeyB', 'Enter', 'Space', 'KeyT', 'KeyO', 'Tab']) { Q.T(c); step(1); }
    out.stillOpen = PHOTO.active; out.phase = game.phase; out.gore = gore === null || FX.gore === gore; out.opts = typeof OPTIONS === 'undefined' ? true : !OPTIONS.screen;
    out.settings = before === JSON.stringify(Object.assign({}, SETTINGS.all(), { 'photo.filter': 0, 'photo.frame': 0, 'photo.hud': 0 }));
    Q.T('Escape'); step(2); out.esc = [PHOTO.active, game.phase, PHOTO.overlay().style.display];
    render(); out.pauseDraw = true; Q.T('KeyC'); step(2); out.again = PHOTO.active; Q.T('KeyC'); step(2); out.cClose = [PHOTO.active, game.phase];
    Q.T('KeyC'); step(2); Q.T('KeyP'); step(2); out.pClose = [PHOTO.active, game.phase]; Q.T('KeyP'); step(2); out.resumed = game.phase;
    const a = game.f[0], x0 = a.x, tk = game.tick; step(30); out.runs = game.tick - tk >= 30; return out;
  })()`);
  check(lk.stillOpen && lk.phase === 'pause' && lk.gore && lk.opts && lk.settings, 'Q, B, Enter, Space, T, O and Tab are taken by photo mode: no quit, no resume, no blood toggle, no options screen, no setting changed: ' + JSON.stringify(lk));
  check(lk.esc[0] === false && lk.esc[1] === 'pause' && lk.esc[2] === 'none', 'Esc leaves photo mode and the pause screen is still there: ' + JSON.stringify(lk.esc));
  check(lk.again === true && lk.cClose[0] === false && lk.cClose[1] === 'pause', 'C opens and closes photo mode');
  check(lk.pClose[0] === false && lk.pClose[1] === 'pause' && lk.resumed === 'fight' && lk.runs, 'P leaves photo mode first and a second P resumes the fight: ' + JSON.stringify([lk.pClose, lk.resumed]));

  // ---- the pause screen button (mouse), phase changes, events ----
  const pb = await ev(`(() => {
    const out = {}; game.mode = 2; Q.pause(); out.paused = game.phase; out.rect = PHOTO.entryButton(); const r = out.rect; render();
    const ev0 = []; BUS.on('photo', e => ev0.push(JSON.stringify(e)));
    const [cx, cy] = Q.client(cv, r.x + r.w / 2, r.y + r.h / 2); cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: cx, clientY: cy, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true })); step(1);
    out.opened = PHOTO.active; out.events = ev0.slice();
    PHOTO.close(); const [mx, my] = Q.client(cv, 100, 100); cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: mx, clientY: my, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true })); step(1); out.missed = PHOTO.active;
    PHOTO.open(); out.reopen = PHOTO.active; game.phase = 'fight'; step(1); out.phaseClose = [PHOTO.active, PHOTO.overlay().style.display];
    Q.pause(); PHOTO.open(); BUS.emit('phase', { from: 'pause', to: 'title' }); out.busClose = PHOTO.active; out.events2 = ev0.slice(-2);
    PHOTO.close(); game.phase = 'pause'; if (typeof OPTIONS !== 'undefined') { OPTIONS.open('moves'); out.optionsBlocks = PHOTO.open(); OPTIONS.close && OPTIONS.close(); }
    return out;
  })()`);
  check(pb.paused === 'pause' && pb.opened === true, 'the PHOTO MODE button on the pause screen opens it for the mouse: ' + JSON.stringify(pb.rect));
  check(pb.events[0] === '{"open":true}' && pb.missed === false, 'opening emits BUS photo { open: true }; a click elsewhere on the pause screen does not open it');
  check(pb.reopen === true && pb.phaseClose[0] === false && pb.phaseClose[1] === 'none', 'leaving the pause phase closes photo mode and hides the pointer layer');
  check(pb.busClose === false && pb.events2.some(e => e === '{"open":false}'), 'a phase event closes photo mode too and emits BUS photo { open: false }: ' + JSON.stringify(pb.events2));
  check(pb.optionsBlocks === undefined || pb.optionsBlocks === false, 'photo mode does not open on top of the options screen');

  // ---- touch device layout: bigger buttons, shorter entry label ----
  const tc = await ev(`(() => {
    const was = touch.on; touch.on = true; PHOTO.close(); game.phase = 'pause'; step(1); const big = PHOTO.buttons(), eb = PHOTO.entryButton(); touch.on = false; const small = PHOTO.buttons();
    const out = { bigH: big[0].h, smallH: small[0].h, entry: [eb.w, eb.h], fits: big.every(b => b.x + b.w <= 960 && b.y + b.h <= 540 && b.h >= 44) }; touch.on = was; return out;
  })()`);
  check(tc.bigH >= 44 && tc.smallH < tc.bigH && tc.fits && tc.entry[1] >= 48, 'on a touch device the buttons grow to at least 44 pixels and still fit: ' + JSON.stringify(tc));

  // ---- end: clean up my settings, leave a plain pause screen, and look for console errors ----
  await ev(`(() => { PHOTO.close(); Q.reset(); dispatchEvent(new Event('blur')); })()`);
  const fin = await ev(`({ f: SETTINGS.get('photo.filter'), r: SETTINGS.get('photo.frame'), h: SETTINGS.get('photo.hud'), active: PHOTO.active })`);
  check(fin.f === 'none' && fin.r === 'none' && fin.h === true && fin.active === false, 'the photo settings are back to their defaults after the test');
  const doc = path.join(ROOT, 'docs', 'features', 'p-photomode.md');
  check(fs.existsSync(doc) && !banned.some(w => fs.readFileSync(doc, 'utf8').toLowerCase().includes(w)), 'docs/features/p-photomode.md exists and has no banned word');
}
