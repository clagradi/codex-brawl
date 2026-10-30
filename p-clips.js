// ===== AGENT BRAWL feature file: P-CLIPS (KO clips). =====
// Owner: clips agent (branch feat/p-clips).
// Area: a rolling capture of the canvas while a match is played (MediaRecorder on canvas.captureStream, video only), cut a few seconds after
//       the blow that decides the match, and a KO CLIP panel on the end screen with a looping preview and SAVE CLIP. The file is saved only
//       when the player presses C or taps the panel, as a local download (.webm; .mp4 where the browser only records mp4). Nothing is uploaded.
// How the rolling window works: two recorders overlap, a new one starts every SEG ms and the oldest is dropped, so the older one always holds
//       the last 3 to 6 s. At the deciding blow the newer one is dropped and the older one runs on for TAIL ms; a FINISH IT window or a
//       finisher holds the cut until it ends, plus AFTER ms (never past MAX_LEN from the recorder's start).
// Hooks used: 'update' (the recorder clock: rotation and the cut), 'drawTop' (preview thumbnails while recording, the KO CLIP panel on the end screen).
// BUS used: match:start, round:start, ko, round:end, match:end, phase, settings.
// Settings: clips.on (default true).
// Unsupported browsers (no MediaRecorder, no canvas.captureStream, no webm or mp4 type) and headless or automated ones register nothing: a no-op.
// Public: window.CLIPS (supported(), state(), save(), cut(), consts; _test(opts) switches the recorder environment for the tests).
'use strict';
(() => {
  window.STUB_P_CLIPS = 1;
  const SEG = 3000, TAIL = 3000, AFTER = 1500, MAX_LEN = 16000;             // ms of recorded time (pauses do not count)
  const HOLD = new Set(['finish', 'finisher']);                              // the cut waits while FINISH IT or a finisher is on screen
  const FPS = 30, BPS = 2500000, SLICE = 1000;                               // capture frame rate, video bit rate, MediaRecorder timeslice
  const THUMB_MS = 125, THUMB_W = 160, THUMB_H = 90, THUMBS = 100;           // preview strip: 8 frames a second, 12.5 s of history
  const SAVE_GAP = 30, SAVED_SHOW = 120, KEY = 'KeyC';                       // ticks between two saves, ticks the CLIP SAVED label stays
  const PANEL = { x: 40, y: 304, w: 216, h: 180 };                           // the KO CLIP panel on the end screen, canvas units (also the tap target); the left column: toast (to y 238), O button (246 to 296), then this
  const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const GOLD = '#c9a24a', INK = '#e8e0cc', DIM = '#8d8576', GREEN = '#7fdc6a';

  SETTINGS.define('clips.on', { def: true, label: 'KO CLIPS' });
  const enabled = () => { try { return SETTINGS.get('clips.on') !== false; } catch (e) { return true; } };
  const need = () => { try { return roundsToWin(); } catch (e) { return 2; } };

  const canvas = document.getElementById('c');
  const realEnv = () => ({
    MR: typeof MediaRecorder === 'function' ? MediaRecorder : null,
    capture: canvas && typeof canvas.captureStream === 'function' ? c => c.captureStream(FPS) : null,
    now: () => performance.now(),
  });
  const automated = () => { try { return !!navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent || ''); } catch (e) { return false; } };
  function pickType(e) {
    if (!e || typeof e.MR !== 'function' || typeof e.capture !== 'function' || typeof e.MR.isTypeSupported !== 'function') return '';
    for (const t of TYPES) { try { if (e.MR.isTypeSupported(t)) return t; } catch (err) { /* treat as unsupported */ } }
    return '';
  }

  let env = realEnv(), seg = SEG, tail = TAIL, type = '', booted = false;
  let armed = false, stream = null, recs = [], cutAt = -1, gen = 0, pending = false;
  let paused = false, pausedAt = 0, pausedTotal = 0;
  let clip = null, savedTick = -1e9, saves = 0;
  let thumbs = null, thumbG = null, thumbT = null, head = 0, lastThumb = -1e12;

  const rnow = () => (paused ? pausedAt : env.now()) - pausedTotal;   // recorded time: frozen while the match is paused or the tab is hidden

  // ---------------------------------------------------------------- recorders
  function startRec() {
    let mr;
    try { mr = new env.MR(stream, { mimeType: type, videoBitsPerSecond: BPS }); } catch (e) { return false; }
    const r = { mr, chunks: [], t0: rnow(), dead: false };
    mr.ondataavailable = ev => { if (!r.dead && ev && ev.data && ev.data.size) r.chunks.push(ev.data); };
    mr.onerror = () => drop(r);   // a recorder that fails is dropped quietly; the next rotation starts a fresh one
    try { mr.start(SLICE); if (paused) mr.pause(); } catch (e) { r.dead = true; return false; }
    recs.push(r); return true;
  }
  function drop(r) {
    r.dead = true; r.chunks = [];
    const i = recs.indexOf(r); if (i >= 0) recs.splice(i, 1);
    try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) { /* already stopped */ }
  }
  function stopTracks(s) { try { if (s) for (const tr of s.getTracks()) tr.stop(); } catch (e) { /* nothing to stop */ } }
  function stopStream() { stopTracks(stream); stream = null; }
  function abort() { gen++; while (recs.length) drop(recs[0]); cutAt = -1; armed = false; pending = false; stopStream(); }
  function releaseClip() { if (clip) { try { URL.revokeObjectURL(clip.url); } catch (e) { /* not a blob url */ } clip = null; } }

  function begin() {
    if (!type || !armed || recs.length || !enabled() || game.modeId === 'training') return;
    try { stream = env.capture(canvas); } catch (e) { stream = null; }   // a canvas that is not origin-clean refuses: no clip this match
    if (!stream) { armed = false; return; }
    paused = false; pausedTotal = 0; cutAt = -1; lastThumb = -1e12; syncPause();
    if (!startRec()) abort();
  }
  // the deciding moment: keep the older recorder (3 to 6 s of lead-up), drop the newer one, and run on for `after` ms
  function decide(after) {
    if (!recs.length || cutAt >= 0) return;
    while (recs.length > 1) drop(recs[recs.length - 1]);
    cutAt = Math.min(rnow() + after, recs[0].t0 + MAX_LEN);
  }
  function extend(after) { if (recs.length && cutAt >= 0) cutAt = Math.min(Math.max(cutAt, rnow() + after), recs[0].t0 + MAX_LEN); }
  function cutNow() { if (!recs.length) return; while (recs.length > 1) drop(recs[recs.length - 1]); finalize(); }

  function finalize() {
    const r = recs[0], t1 = rnow(), g = ++gen, st = stream;   // the capture this clip came from: a later match gets its own stream
    recs = []; cutAt = -1; armed = false; stream = null;
    if (!r) { stopTracks(st); return; }
    const w = game.winner && game.winner.d ? game.winner.d.id : '', l = game.loser && game.loser.d ? game.loser.d.id : '';
    let done = false;
    const finish = () => {
      if (done) return; done = true; r.dead = true; stopTracks(st);
      if (g !== gen) { r.chunks = []; return; }   // a new match started (or the end screen was left) while the recorder was closing
      pending = false;
      const base = String(r.mr.mimeType || type).split(';')[0] || 'video/webm', blob = new Blob(r.chunks, { type: base }); r.chunks = [];
      if (!blob.size) return;
      let url; try { url = URL.createObjectURL(blob); } catch (e) { return; }
      const dur = Math.max(0, t1 - r.t0), ext = /mp4/.test(base) ? 'mp4' : 'webm';
      releaseClip();
      clip = { blob, url, dur, name: 'agent-brawl-ko-' + (w && l ? w + '-vs-' + l + '-' : '') + stamp() + '.' + ext,
        durText: (dur / 1000).toFixed(1) + 'S', frames: framesIn(r.t0, t1) };
    };
    pending = true; r.mr.onstop = finish; r.mr.onerror = finish;
    try { if (r.mr.state === 'inactive') finish(); else r.mr.stop(); } catch (e) { finish(); }
  }
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }

  function syncPause() {
    const want = game.phase === 'pause' || document.hidden === true;
    if (want === paused) return;
    const t = env.now();
    if (want) { pausedAt = t; paused = true; for (const r of recs) { try { if (r.mr.state === 'recording') r.mr.pause(); } catch (e) { /* ignore */ } } }
    else { pausedTotal += t - pausedAt; paused = false; for (const r of recs) { try { if (r.mr.state === 'paused') r.mr.resume(); } catch (e) { /* ignore */ } } }
  }

  // ---------------------------------------------------------------- preview thumbnails (small canvases, reused ring)
  function grab() {
    const t = rnow(); if (t - lastThumb < THUMB_MS) return; lastThumb = t;
    if (!thumbs) { thumbs = []; thumbG = []; thumbT = new Float64Array(THUMBS).fill(-1e12); }
    if (!thumbs[head]) { const c = document.createElement('canvas'); c.width = THUMB_W; c.height = THUMB_H; thumbs[head] = c; thumbG[head] = c.getContext('2d'); }
    try { thumbG[head].drawImage(canvas, 0, 0, THUMB_W, THUMB_H); } catch (e) { return; }
    thumbT[head] = t; head = (head + 1) % THUMBS;
  }
  function framesIn(t0, t1) {
    const out = []; if (!thumbs) return out;
    for (let k = 0; k < THUMBS; k++) { const i = (head + k) % THUMBS; if (thumbs[i] && thumbT[i] >= t0 - THUMB_MS && thumbT[i] <= t1) out.push(thumbs[i]); }
    return out;   // oldest first
  }

  // ---------------------------------------------------------------- saving (only from the key or a tap on the panel)
  function save() {
    if (!clip || game.phase !== 'over' || game.tick - savedTick < SAVE_GAP) return false;
    try {
      const a = document.createElement('a'); a.href = clip.url; a.download = clip.name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { return false; }
    savedTick = game.tick; saves++;
    try { beep(880, 0.07, 'square', 0.04); } catch (e) { /* no audio yet */ }
    return true;
  }
  const inPanel = (x, y) => x >= PANEL.x && x <= PANEL.x + PANEL.w && y >= PANEL.y && y <= PANEL.y + PANEL.h;
  const covered = () => { try { return !!((window.REVIEW && REVIEW.state().open) || (window.OBS && OBS.isOpen())); } catch (e) { return false; } };   // the code review (modal) or the match report is up: the panel is not drawn and takes no key or tap

  // ---------------------------------------------------------------- the KO CLIP panel on the end screen
  function drawPanel(c) {
    const { x, y, w, h } = PANEL, t = game.tick, saved = t - savedTick < SAVED_SHOW;
    c.save();
    c.fillStyle = 'rgba(8,8,14,0.88)'; c.fillRect(x, y, w, h);
    c.fillStyle = saved ? GREEN : GOLD; c.fillRect(x, y, w, 3); c.fillRect(x, y + h - 3, w, 3); c.fillRect(x, y, 3, h); c.fillRect(x + w - 3, y, 3, h);
    ptext(c, 'KO CLIP', x + 10, y + 9, 2, GOLD, 'left');
    ptext(c, clip.durText, x + w - 10, y + 9, 2, DIM, 'right');
    const px = x + 8, py = y + 28, pw = w - 16, ph = Math.round(pw * 9 / 16), fr = clip.frames;
    c.fillStyle = '#000'; c.fillRect(px, py, pw, ph);
    if (fr.length) {
      const n = fr.length + 8, i = Math.floor(t * 8 / 60) % n, f = Math.min(i, fr.length - 1);   // 8 frames a second, the last one held a moment
      c.imageSmoothingEnabled = true; c.drawImage(fr[f], px, py, pw, ph); c.imageSmoothingEnabled = false;
      c.fillStyle = GOLD; c.fillRect(px, py + ph - 3, Math.round(pw * (f + 1) / fr.length), 3);
    } else ptext(c, 'K.O.', px + pw / 2, py + ph / 2 - 7, 2, DIM, 'center');
    const by = py + ph + 6, bh = y + h - 8 - by, blink = !saved && Math.floor(t / 30) % 2 === 0;
    c.fillStyle = saved ? '#1d3a1a' : blink ? '#3a2f18' : '#2a2216'; c.fillRect(px, by, pw, bh);
    const label = saved ? 'CLIP SAVED' : touch.on ? 'TAP TO SAVE' : 'C SAVE CLIP';
    ptext(c, label, px + pw / 2, by + Math.round((bh - 14) / 2), 2, saved ? GREEN : INK, 'center');
    c.restore();
  }

  // ---------------------------------------------------------------- wiring (only when recording is possible)
  function boot() {
    if (booted) return; booted = true;
    HOOKS.add('update', () => {
      if (!recs.length || paused) return;   // idle: one length check per tick
      const t = rnow();
      if (cutAt >= 0) { if (t >= cutAt && !(HOLD.has(game.phase) && t < recs[0].t0 + MAX_LEN)) finalize(); return; }
      if (t - recs[recs.length - 1].t0 >= seg) { if (!startRec()) abort(); else if (recs.length > 2) drop(recs[0]); }   // a recorder the browser refuses ends this match's clip
    });
    HOOKS.add('drawTop', c => {
      if (recs.length) { if (!paused) grab(); return; }
      if (clip && game.phase === 'over' && !covered()) drawPanel(c);
    }, 1000);
    BUS.on('match:start', () => { abort(); releaseClip(); armed = !!type; });
    BUS.on('round:start', () => { if (!recs.length) begin(); });
    BUS.on('ko', e => { if (recs.length && e && e.winner && game.wins[e.winner.side] >= need()) decide(tail); });
    BUS.on('round:end', e => { if (recs.length && e && e.winner && e.wins && e.wins[e.winner.side] >= need()) decide(tail); });
    BUS.on('match:end', () => { if (recs.length && cutAt < 0) cutNow(); });
    BUS.on('phase', e => {
      if (recs.length) {
        if (e.to === 'over') cutNow();
        else if (e.to === 'title' || e.to === 'select') abort();   // the match was left half way
        else { syncPause(); if (HOLD.has(e.from) && !HOLD.has(e.to)) extend(AFTER); }   // FINISH IT or the finisher is over: keep the K.O. a moment
      }
      if (e.from === 'over') { gen++; releaseClip(); }
    });
    BUS.on('settings', e => { if (e.key === 'clips.on' && e.value === false) { abort(); releaseClip(); } });
    document.addEventListener('visibilitychange', () => { if (recs.length) syncPause(); });
    addEventListener('keydown', e => {
      if (e.code !== KEY || e.repeat || game.phase !== 'over' || !clip || covered()) return;
      tap(KEY); save();   // tap() consumes the press so no other end-screen reader sees it
    });
    canvas.addEventListener('pointerdown', e => {
      if (game.phase !== 'over' || !clip || e.button > 0 || covered()) return;
      const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (inPanel((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height)) save();
    });
  }

  type = automated() ? '' : pickType(env);
  if (type) boot();

  window.CLIPS = {
    consts: { SEG, TAIL, AFTER, MAX_LEN, FPS, THUMB_MS, SAVE_GAP, KEY, PANEL },
    supported: () => !!type,
    save,
    cut: cutNow,
    state: () => ({
      booted, live: !!type, type, armed, recording: recs.length, ages: recs.map(r => Math.round(rnow() - r.t0)), cutIn: cutAt < 0 ? -1 : Math.round(cutAt - rnow()),
      paused, pending, saves, savedTick, thumbs: thumbs ? thumbs.filter(Boolean).length : 0,
      clip: clip ? { size: clip.blob.size, type: clip.blob.type, dur: Math.round(clip.dur), name: clip.name, url: clip.url, frames: clip.frames.length, blob: clip.blob } : null,
    }),
    // tests: { MR, capture, now } replace the browser's recorder, capture and clock (missing ones fall back to the real ones; MR: null means unsupported),
    // seg / tail shorten the window. It boots the wiring even in a headless browser. Returns whether recording is possible.
    _test(o = {}) {
      abort(); releaseClip(); paused = false; pausedTotal = 0;
      env = Object.assign(realEnv(), o); seg = o.seg || SEG; tail = o.tail === undefined ? TAIL : o.tail;
      type = pickType(env); if (type) boot(); return !!type;
    },
  };
})();
