// Tests for p-clips.js (KO clips: rolling canvas capture, the cut after the deciding blow, the KO CLIP panel and SAVE CLIP). Owner: the clips agent.
// Runs after core.mjs. The headless browser counts as unsupported, so the feature is switched on with CLIPS._test({ MR, capture, now }):
// a fake MediaRecorder, a fake capture stream and a clock driven by game.tick (60 ticks a second). Everything then runs on hold(true) and
// step(n), so the checks are deterministic. One short check at the end records the real canvas with the browser's own MediaRecorder.
// Downloads are caught by stubbing HTMLAnchorElement.prototype.click, so nothing is written to disk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');

  // ---- headless default: a no-op ----
  const d0 = await ev(`({ api: typeof CLIPS === 'object' && typeof CLIPS.state === 'function', marker: window.STUB_P_CLIPS === 1, sup: CLIPS.supported(),
    booted: CLIPS.state().booted, on: SETTINGS.get('clips.on'), def: SETTINGS.list().find(d => d.key === 'clips.on') })`);
  check(d0.api && d0.marker, 'CLIPS is loaded');
  check(d0.sup === false && d0.booted === false, 'in the headless browser the clips feature registers nothing (graceful no-op)');
  check(d0.on === true && d0.def && d0.def.label === 'KO CLIPS', 'the clips.on setting exists and defaults to on');

  await ev(`(() => {
    hold(true);
    const K = window.K = { made: [], downloads: [], revoked: [], tracksStopped: 0, captures: 0, types: ['video/webm;codecs=vp9', 'video/webm'], defer: false, q: [] };
    K.MR = class {
      static isTypeSupported(ty) { return K.types.includes(ty); }
      constructor(stream, o) { this.stream = stream; this.mimeType = o.mimeType; this.bps = o.videoBitsPerSecond; this.state = 'inactive'; this.log = []; this.ondataavailable = this.onstop = this.onerror = null; K.made.push(this); }
      start(slice) { this.slice = slice; this.state = 'recording'; this.log.push('start'); }
      pause() { this.state = 'paused'; this.log.push('pause'); }
      resume() { this.state = 'recording'; this.log.push('resume'); }
      stop() {
        if (this.state === 'inactive') return; this.state = 'inactive'; this.log.push('stop');
        const fire = () => { if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array(1234)]) }); if (this.onstop) this.onstop(); };
        if (K.defer) K.q.push(fire); else fire();
      }
    };
    K.flush = () => { const q = K.q; K.q = []; q.forEach(f => f()); };
    K.capture = () => { K.captures++; return { getTracks: () => [{ stop() { K.tracksStopped++; } }] }; };
    K.now = () => game.tick * 1000 / 60;
    K.env = o => CLIPS._test(Object.assign({ MR: K.MR, capture: K.capture, now: K.now }, o || {}));
    K.click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { K.downloads.push({ href: this.href, name: this.download, inDoc: document.body.contains(this) }); };
    K.revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = u => { K.revoked.push(u); K.revoke.call(URL, u); };
    K.key = (c, rep) => { dispatchEvent(new KeyboardEvent('keydown', { code: c, repeat: !!rep })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    K.tapAt = (x, y) => { const cv = document.getElementById('c'), r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x * r.width / W, clientY: r.top + y * r.height / H, button: 0, bubbles: true })); };
    K.run = n => { for (let i = 0; i < n; i++) { step(1); if (i % 4 === 0) render(); } };   // render now and then so the drawTop preview grabs frames
    K.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); if (i % 4 === 0) render(); i++; } return i; };
    K.fresh = (i, j, wins) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); K.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; if (wins) game.wins = wins.slice(); return [a, b];
    };
    K.deciding = () => [roundsToWin() - 1, 0];
    K.ko = (a, b) => { b.inv = 0; b.set('idle'); b.hp = 1; b.takeHit(a, 20, 3, 10, 'hit', { knock: true }); if (game.phase === 'fight') { b.hp = 0; game.koBy(a, b); } };
    K.px = (x, y) => { const cv = document.getElementById('c'), s = cv.width / W; return [...ctx.getImageData(Math.floor(x * s), Math.floor(y * s), 1, 1).data]; };
    K.s = () => CLIPS.state();
  })()`);

  // ---- support detection ----
  const sup = await ev(`(() => {
    const out = {};
    out.none = CLIPS._test({ MR: null }); out.noneSup = CLIPS.supported();
    out.noCapture = CLIPS._test({ MR: K.MR, capture: null });
    K.types = []; out.noType = K.env(); K.types = ['video/mp4']; out.mp4 = K.env(); out.mp4Type = K.s().type;
    K.types = ['video/webm;codecs=vp9', 'video/webm']; out.webm = K.env(); out.type = K.s().type; out.booted = K.s().booted;
    return out;
  })()`);
  check(sup.none === false && sup.noneSup === false && sup.noCapture === false && sup.noType === false, 'no MediaRecorder, no canvas.captureStream or no recordable type: unsupported');
  check(sup.mp4 === true && sup.mp4Type === 'video/mp4' && sup.webm === true && sup.type === 'video/webm;codecs=vp9' && sup.booted, 'webm (vp9 first) is preferred, mp4 is the fallback');

  // ---- the rolling window: two overlapping recorders, the oldest dropped every SEG ms ----
  const roll = await ev(`(() => {
    const out = {}; K.made.length = 0; const [a, b] = K.fresh(0, 1);
    out.start = K.s().recording; out.made = K.made.length; out.slice = K.made[0] && K.made[0].slice; out.bps = K.made[0] && K.made[0].bps; out.mime = K.made[0] && K.made[0].mimeType;
    K.until(() => K.s().recording === 2, 400); out.two = K.s().ages;
    K.run(185); out.after = K.s().ages; out.rec = K.s().recording; out.made2 = K.made.length; out.firstState = K.made[0].state; out.firstLog = K.made[0].log.join();
    out.thumbs = K.s().thumbs;
    game.phase = 'pause'; const p0 = K.s().ages; step(120); out.pausedAges = [p0, K.s().ages]; out.paused = K.s().paused; out.pausedStates = K.made.filter(m => m.state !== 'inactive').map(m => m.state);
    game.phase = 'fight'; out.resumed = K.made.filter(m => m.state !== 'inactive').map(m => m.state); step(60); out.resumedAges = K.s().ages;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    out.hiddenPaused = K.s().paused; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); out.shownPaused = K.s().paused;
    K.key('KeyC'); step(1); out.fightDownloads = K.downloads.length;
    return out;
  })()`);
  check(roll.start === 1 && roll.made === 1 && roll.slice === 1000 && roll.bps > 0 && roll.mime === 'video/webm;codecs=vp9', 'recording starts at the first round with one recorder (1 s slices, the chosen type): ' + JSON.stringify([roll.start, roll.made, roll.slice, roll.mime]));
  check(roll.two && roll.two.length === 2 && roll.two[0] >= 3000 && roll.two[0] < 3050 && roll.two[1] < 50, 'a second recorder starts 3 s later and overlaps the first: ' + JSON.stringify(roll.two));
  check(roll.rec === 2 && roll.made2 === 3 && roll.firstState === 'inactive' && /stop/.test(roll.firstLog) && roll.after[0] >= 3000 && roll.after[0] < 3100, 'every 3 s a fresh recorder starts and the oldest is dropped, so the older one holds 3 to 6 s: ' + JSON.stringify([roll.after, roll.made2, roll.firstState]));
  check(roll.thumbs > 10, 'preview thumbnails are grabbed while recording: ' + roll.thumbs);
  check(roll.paused === true && JSON.stringify(roll.pausedAges[0]) === JSON.stringify(roll.pausedAges[1]) && roll.pausedStates.every(s => s === 'paused'), 'pausing the match pauses the recorders and freezes the recorded time: ' + JSON.stringify(roll.pausedAges));
  check(roll.resumed.every(s => s === 'recording') && roll.resumedAges[0] > roll.pausedAges[1][0], 'resuming resumes the recorders');
  check(roll.hiddenPaused === true && roll.shownPaused === false, 'a hidden tab pauses the capture too');
  check(roll.fightDownloads === 0, 'C during the fight saves nothing');

  // ---- the deciding KO, FINISH IT not taken: the clip waits for the window, then keeps the K.O. a moment ----
  const ko = await ev(`(() => {
    const out = {}; K.made.length = 0; K.downloads.length = 0; const [a, b] = K.fresh(0, 1, K.deciding());
    K.run(250); out.w = a.d.id; out.l = b.d.id;
    const before = K.s().ages; K.ko(a, b); const s = K.s(); out.phase = game.phase; out.rec = s.recording; out.cutIn = s.cutIn; out.age0 = s.ages[0]; out.before = before;
    K.run(200); out.held = [game.phase, K.s().recording];
    out.window = 200 + K.until(() => game.phase !== 'finish', 400); out.koPhase = game.phase; out.cutIn2 = K.s().cutIn;
    const n = K.until(() => !K.s().recording, 400); out.cutAfter = n; out.phaseAtCut = game.phase;
    const c = K.s().clip; out.clip = c && { size: c.size, type: c.type, dur: c.dur, name: c.name, url: c.url, frames: c.frames };
    out.tracks = K.tracksStopped; out.downloads = K.downloads.length;
    K.until(() => game.phase === 'over', 1500); out.over = game.phase; out.overClip = !!K.s().clip; out.autoDownloads = K.downloads.length;
    render(); out.border = K.px(41, 173); out.inside = K.px(40 + 108, 172 + 120);
    return out;
  })()`);
  check(ko.phase === 'finish' && ko.rec === 1 && ko.cutIn >= 2980 && ko.cutIn <= 3000 && ko.age0 >= 3000 && ko.age0 <= 6000, 'the deciding blow keeps the older recorder (3 to 6 s of lead-up), drops the newer one and schedules the cut 3 s later: ' + JSON.stringify([ko.phase, ko.rec, ko.cutIn, ko.age0, ko.before]));
  check(ko.held[0] === 'finish' && ko.held[1] === 1, 'the cut waits while FINISH IT is on screen: ' + JSON.stringify(ko.held));
  check(ko.koPhase === 'ko' && ko.cutIn2 >= 1480 && ko.cutIn2 <= 1500 && ko.cutAfter >= 85 && ko.cutAfter <= 95, 'when the window ends the K.O. is kept 1.5 s, then the clip is cut: ' + JSON.stringify([ko.koPhase, ko.cutIn2, ko.cutAfter, ko.phaseAtCut]));
  const want = ko.age0 + ko.window * 1000 / 60 + 1500;
  check(ko.clip && ko.clip.size === 1234 && ko.clip.type === 'video/webm' && Math.abs(ko.clip.dur - want) < 120 && /^blob:/.test(ko.clip.url), 'the clip is a webm blob of the whole moment, lead-up to K.O.: ' + JSON.stringify(ko.clip) + ' want ~' + want);
  check(ko.clip && new RegExp('^agent-brawl-ko-' + ko.w + '-vs-' + ko.l + '-\\d{8}-\\d{6}\\.webm$').test(ko.clip.name), 'the file name names the winner and the loser: ' + (ko.clip && ko.clip.name));
  check(ko.clip && ko.clip.frames > 20, 'the clip keeps its preview frames: ' + (ko.clip && ko.clip.frames));
  check(ko.tracks >= 1, 'the capture stream is stopped once the clip is cut');
  check(ko.over === 'over' && ko.overClip && ko.downloads === 0 && ko.autoDownloads === 0, 'the end screen offers the clip and nothing is downloaded on its own');
  const gold = c => c[0] > 150 && c[1] > 120 && c[2] < 110 && c[0] > c[2] + 60;
  check(gold(ko.border), 'the KO CLIP panel is drawn on the end screen (gold frame): ' + JSON.stringify(ko.border));

  // ---- saving: only on C or a tap on the panel ----
  const sv = await ev(`(() => {
    const out = {}, url = K.s().clip.url, name = K.s().clip.name;
    K.key('KeyC'); out.one = K.downloads.slice(); out.consumed = tap('KeyC') === false; out.phase1 = game.phase;
    K.key('KeyC', true); out.repeat = K.downloads.length;
    K.key('KeyC'); out.gap = K.downloads.length;
    render(); out.green = K.px(41, 173);
    step(31); K.tapAt(600, 300); out.outside = K.downloads.length;
    K.tapAt(40 + 100, 172 + 160); out.tapped = K.downloads.length; out.saves = K.s().saves;
    out.url = url; out.name = name; out.links = document.querySelectorAll('a[download]').length;
    K.key('Escape'); step(2); out.left = game.phase; out.clipAfter = K.s().clip; out.revoked = K.revoked.includes(url);
    K.key('KeyC'); step(1); out.afterLeave = K.downloads.length;
    return out;
  })()`);
  check(sv.one.length === 1 && sv.one[0].href === sv.url && sv.one[0].name === sv.name && sv.one[0].inDoc && sv.phase1 === 'over', 'C on the end screen saves the clip once, as a local blob download: ' + JSON.stringify(sv.one));
  check(sv.consumed, 'the C press is consumed so nothing else on the end screen reads it');
  check(sv.repeat === 1 && sv.gap === 1, 'a held key (auto-repeat) and a second press right away save nothing more');
  check(sv.green[1] > sv.green[0] && sv.green[1] > sv.green[2], 'the panel turns green after a save (CLIP SAVED): ' + JSON.stringify(sv.green));
  check(sv.outside === 1 && sv.tapped === 2 && sv.saves === 2, 'a tap on the panel saves; a tap elsewhere does not: ' + JSON.stringify([sv.outside, sv.tapped, sv.saves]));
  check(sv.links === 0, 'the download link is removed after use');
  check(sv.left === 'title' && sv.clipAfter === null && sv.revoked && sv.afterLeave === 2, 'leaving the end screen frees the clip (object URL revoked) and C does nothing more: ' + JSON.stringify([sv.left, sv.revoked, sv.afterLeave]));

  // ---- a finisher: the cut waits for it, then keeps the K.O. a moment ----
  const fin = await ev(`(() => {
    const out = {}; const [a, b] = K.fresh(2, 3, K.deciding()); K.run(200);
    K.ko(a, b); out.age0 = K.s().ages[0]; K.run(30); out.p0 = game.phase;
    startFinisher(a, b); out.p1 = game.phase; let n = 0, minRec = 1;
    while (game.phase === 'finisher' && n < 600) { step(1); n++; minRec = Math.min(minRec, K.s().recording); }
    out.len = n; out.minRec = minRec; out.p2 = game.phase; out.cutIn = K.s().cutIn;
    out.cutAfter = K.until(() => !K.s().recording, 400); const c = K.s().clip; out.dur = c && c.dur; out.name = c && c.name;
    return out;
  })()`);
  check(fin.p0 === 'finish' && fin.p1 === 'finisher' && fin.len > 120 && fin.minRec === 1, 'the clip keeps recording through the whole finisher: ' + JSON.stringify([fin.p0, fin.p1, fin.len, fin.minRec]));
  check(fin.p2 === 'ko' && fin.cutIn >= 1480 && fin.cutIn <= 1500 && fin.cutAfter >= 85 && fin.cutAfter <= 95, 'after the finisher the K.O. is kept 1.5 s: ' + JSON.stringify([fin.p2, fin.cutIn, fin.cutAfter]));
  const fwant = fin.age0 + (30 + 1 + fin.len) * 1000 / 60 + 1500;
  check(fin.dur && Math.abs(fin.dur - fwant) < 120 && /^agent-brawl-ko-dot-vs-wang-/.test(fin.name), 'the finisher clip runs from the lead-up to the end of the finisher: ' + JSON.stringify([fin.dur, Math.round(fwant), fin.name]));

  // ---- a time-out decides the match; the length cap; a rematch while the recorder is still closing ----
  const misc = await ev(`(() => {
    const out = {};
    let [a, b] = K.fresh(0, 1, K.deciding()); K.run(100); b.hp = Math.round(b.d.hp / 2); endRoundTime();
    out.timeCut = K.s().cutIn; out.timeRec = K.s().recording; out.timeAfter = K.until(() => !K.s().recording, 400); out.timeClip = !!K.s().clip;
    [a, b] = K.fresh(0, 1, K.deciding()); K.run(100); K.ko(a, b); let n = 0;
    while (K.s().recording && n < 2000) { game.phaseT = 0; step(1); n++; }   // FINISH IT held open far longer than the engine allows
    out.capDur = K.s().clip && K.s().clip.dur; out.max = CLIPS.consts.MAX_LEN;
    [a, b] = K.fresh(0, 1); K.run(100); K.defer = true; CLIPS.cut(); out.pending = K.s().pending; out.pendingClip = K.s().clip; out.stopped0 = K.tracksStopped;
    K.flush(); out.flushed = !!K.s().clip && !K.s().pending; out.stopped1 = K.tracksStopped;
    [a, b] = K.fresh(0, 1); K.run(100); CLIPS.cut(); out.pending2 = K.s().pending; [a, b] = K.fresh(0, 1); out.newRec = K.s().recording; const t0 = K.tracksStopped;
    K.flush(); out.stale = K.s().clip; out.newRecAfter = K.s().recording; out.newStreamKept = K.tracksStopped === t0 + 1; K.defer = false;
    return out;
  })()`);
  check(misc.timeCut >= 2980 && misc.timeCut <= 3000 && misc.timeRec === 1 && misc.timeAfter >= 175 && misc.timeAfter <= 185 && misc.timeClip, 'a match decided on time is clipped 3 s after the bell: ' + JSON.stringify([misc.timeCut, misc.timeAfter]));
  check(misc.capDur >= misc.max && misc.capDur <= misc.max + 40, 'a clip never runs past ' + misc.max + ' ms from its recorder start: ' + misc.capDur);
  check(misc.pending === true && misc.pendingClip === null && misc.flushed, 'the clip is ready once the recorder has delivered its last data');
  check(misc.pending2 === true && misc.newRec === 1 && misc.stale === null && misc.newRecAfter === 1 && misc.newStreamKept, 'a recorder still closing when a new match starts is discarded and does not touch the new recording: ' + JSON.stringify([misc.pending2, misc.newRec, misc.stale, misc.newRecAfter]));

  // ---- leaving a match half way, the setting, training ----
  const off = await ev(`(() => {
    const out = {};
    let [a, b] = K.fresh(0, 1); K.run(60); const live = K.made.filter(m => m.state !== 'inactive'); game.phase = 'title';
    out.quit = K.s().recording; out.quitStates = live.map(m => m.state); out.quitClip = K.s().clip;
    [a, b] = K.fresh(0, 1); K.run(60); SETTINGS.set('clips.on', false); out.offRec = K.s().recording;
    [a, b] = K.fresh(0, 1); K.run(60); out.offNext = K.s().recording; SETTINGS.set('clips.on', true);
    [a, b] = K.fresh(0, 1); out.onAgain = K.s().recording;
    if (!MODES.pick('training')) game.modeId = 'training';   // training.js may still be a stub: the clips feature only reads game.modeId
    game.sel = [0, 1]; startMatch(); K.until(() => game.phase === 'fight', 900); K.run(30); out.training = K.s().recording; out.trainPhase = game.phase;
    if (!MODES.pick('versus')) game.modeId = 'versus';
    game.phase = 'title';
    return out;
  })()`);
  check(off.quit === 0 && off.quitStates.length && off.quitStates.every(s => s === 'inactive') && off.quitClip === null, 'quitting a match half way stops the recorders and keeps no clip');
  check(off.offRec === 0 && off.offNext === 0 && off.onAgain === 1, 'clips.on off stops the recording at once and keeps it off; on again records the next match');
  check(off.training === 0 && off.trainPhase === 'fight', 'training is never recorded: ' + JSON.stringify([off.training, off.trainPhase]));

  // ---- unsupported at run time: a full match still plays with nothing recorded ----
  const un = await ev(`(() => {
    const ok = CLIPS._test({ MR: null }); const n0 = K.made.length, d0 = K.downloads.length; K.fresh(0, 1, K.deciding()); const [a, b] = game.f; K.ko(a, b);
    K.until(() => game.phase === 'over', 2000); render(); K.key('KeyC'); step(1);
    return { ok, phase: game.phase, rec: K.s().recording, clip: K.s().clip, made: K.made.length - n0, downloads: K.downloads.length - d0 };
  })()`);
  check(un.ok === false && un.phase === 'over' && un.rec === 0 && un.clip === null && un.made === 0 && un.downloads === 0, 'without recording support the match plays to the end screen with no recorder, no panel and no download: ' + JSON.stringify(un));

  // ---- the real recorder of this browser (video/webm), a short real-time run ----
  const real = await ev(`(async () => {
    if (typeof MediaRecorder !== 'function' || !document.getElementById('c').captureStream) return { skipped: true };
    HTMLAnchorElement.prototype.click = K.click; URL.revokeObjectURL = K.revoke;
    const ok = CLIPS._test({ seg: 600, tail: 300 }); if (!ok) return { skipped: true };
    game.mode = 2; game.sel = [1, 4]; game.arenaPick = 0; startMatch(); step(400); game.f[0].cpu = game.f[1].cpu = true; hold(false);
    const wait = ms => new Promise(r => setTimeout(r, ms)), t0 = performance.now();
    while (game.phase !== 'fight' && performance.now() - t0 < 5000) await wait(30);
    await wait(1500); const rec = CLIPS.state().recording; CLIPS.cut();
    const t1 = performance.now(); while (CLIPS.state().pending && performance.now() - t1 < 5000) await wait(30);
    hold(true); const s = CLIPS.state(); if (!s.clip) return { rec, failed: true, s: JSON.stringify(s) };
    const buf = new Uint8Array(await s.clip.blob.arrayBuffer()); let tainted = false; try { ctx.getImageData(0, 0, 1, 1); } catch (e) { tainted = true; }
    const out = { rec, type: s.type, size: s.clip.size, blobType: s.clip.type, magic: [...buf.slice(0, 4)].map(x => x.toString(16)).join(''), tainted, frames: s.clip.frames };
    CLIPS._test({ MR: null }); game.phase = 'title'; return out;
  })()`);
  if (real.skipped) check(true, 'this browser has no MediaRecorder: the real-recorder check is skipped');
  else check(real.rec >= 1 && real.size > 1000 && real.magic === '1a45dfa3' && /^video\/(webm|mp4)$/.test(real.blobType) && !real.tainted, 'the real MediaRecorder records the canvas into a playable webm (EBML header), the canvas stays readable: ' + JSON.stringify(real));

  // ---- privacy: no network code, shipped in the build ----
  const src = fs.readFileSync(path.join(ROOT, 'p-clips.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), dev = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
  const net = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /window\.open/, /navigator\.share/, /\.src\s*=/].filter(r => r.test(src)).map(String);
  check(!net.length, 'p-clips.js has no network or upload code' + (net.length ? ': ' + net.join(' ') : ''));
  check(/<script src="p-clips\.js"><\/script>/.test(dev) && idx.includes('STUB_P_CLIPS'), 'dev.html loads p-clips.js and the built index.html includes it');
}
