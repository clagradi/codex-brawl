// ===== AGENT BRAWL: procedural chiptune music. One theme per arena plus title / vs / over, synthesised live with WebAudio. No audio files. =====
// Self-contained, no hooks in game.js: setInterval(tick, 80) polls game / AC / muted (top-level lets of game.js, read by bare name inside try) and schedules ~0.25 s ahead on a 16th-note grid.
// Pattern strings: 16 chars per bar (spaces ignored). Notes: '.' rest, '-' holds the previous note, 0-9a-z = scale degree 0..35 above the tonic, A-Z = degrees -1..-26 below it. Drums: x hit, X accent, g ghost, o open hat.
// Theme fields: bpm, root (MIDI tonic), sc (scale), l / b / a = [instrument, octave offset in semitones, volume, [pattern, variant for odd repeats], chord?], d = drum rows {k,s,h,t},
// sw shuffle (fraction of a 16th), tm [tremolo Hz, depth], fill (snare roll before odd repeats), dv drum level, lf loop-from bar, qv level after the first pass.
(function () {
  'use strict';
  const MASTER = 0.12, LOOK = 0.25, DUCK = 0.35;
  const MIN = [0, 2, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11], PHR = [0, 1, 3, 5, 7, 8, 10], MAJ = [0, 2, 4, 5, 7, 9, 11];
  const CHR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], PENT = [0, 2, 4, 7, 9], MPENT = [0, 3, 5, 7, 10], SEN = [0, 1, 5, 7, 10];
  const AR = ['gpupit', 'cathedral', 'bridge', 'furnace', 'forest', 'temple', 'graveyard', 'rooftop', 'wasteland'];
  // instruments: w = partials [wave, detune cents, level]; a attack, d decay constant, s sustain fraction, r release constant, sl start-pitch ratio (twang scoop), max note length (s)
  const INS = {
    sq: { w: [['square', 0, 1]], a: .005, d: .12, s: .55, r: .04 }, sq2: { w: [['square', -8, .6], ['square', 8, .6]], a: .006, d: .14, s: .6, r: .05 },
    saw: { w: [['sawtooth', 0, 1]], a: .004, d: .1, s: .6, r: .03 }, saw2: { w: [['sawtooth', -9, .6], ['sawtooth', 9, .6]], a: .01, d: .2, s: .7, r: .08 },
    tri: { w: [['triangle', 0, 1]], a: .015, d: .25, s: .8, r: .08 }, pl: { w: [['square', 0, 1]], a: .002, d: .035, s: .05, r: .02, max: .12 },
    spl: { w: [['sawtooth', 0, 1]], a: .002, d: .05, s: .08, r: .03, max: .16 }, tw: { w: [['sawtooth', 0, 1]], a: .002, d: .07, s: .12, r: .04, sl: .94, max: .3 },
    org: { w: [['triangle', -7, 1], ['triangle', 7, 1], ['sine', 1200, .5]], a: .07, d: .3, s: .9, r: .22 },
    bell: { w: [['sine', 0, 1], ['sine', 1902, .35], ['sine', 2786, .18]], a: .003, d: .35, s: .05, r: .5, max: 1.5 },
    gh: { w: [['sine', 0, 1], ['triangle', 6, .5]], a: .14, d: .5, s: .85, r: .45 },
  };
  const T = {
    gpupit: { bpm: 150, root: 57, sc: MIN, fill: 1, // fast electro, A minor, 16th arpeggios
      l: ['sq', 0, .34, ['7.7.9.7.4...2.4. 5.5.7.5.2...0.2. 6.6.8.6.4...1.4. 7.9.b.9.7.4.2.0.', '7.7.9.7.4...2.4. 5.5.7.5.2...0.2. 6.8.a.8.6.4.3.1. b.b.b.9.7.9.b.d.']],
      b: ['saw', -12, .42, ['0.7.0.7.0.7.0.7. B.5.B.5.B.5.B.5. A.6.A.6.A.6.A.6. 0.7.0.7.C.4.C.4.']],
      a: ['pl', 12, .2, ['0247424702474724 B0252025B0252502 A1363136A1363613 02474247CA141A14']],
      d: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' } },
    cathedral: { bpm: 96, root: 50, sc: MIN, tm: [5.2, .1], dv: .6, // slow organ chords (detuned triangles), D minor, bell lead
      l: ['bell', 12, .34, ['4---------2---0- 5-------4---3--- 7-------5------- 6---4---2-------', '7---------4---2- 5-------3------- 7---8---7---5--- 6-------4-------']],
      b: ['tri', -12, .55, ['0-------0------- 5-------5------- 3-------3------- 4-------4-------']],
      a: ['org', 0, .3, ['0--------------- 5--------------- 3--------------- 4---------------', '0-------2------- 5-------4------- 3-------2------- 4---------------'], 1],
      d: { k: 'x.......x.......', t: '..............x.' } },
    bridge: { bpm: 140, root: 52, sc: CHR, fill: 1, // tense chromatic riff, tritone and minor-second crawls
      l: ['saw', 12, .3, ['0.0.1.0...3.1.0. 0.0.1.0...6.5.3. 7.7.8.7...5.3.1. 6.5.3.1.0-------', '0.0.1.0...3.1.0. 0.0.1.0...b.a.8. 7.7.8.7...5.3.1. 6.5.6.5.3.1.0.1.']],
      b: ['sq', -12, .38, ['0.0.0.0.0.0.1.0. 0.0.0.0.0.0.3.1. 7.7.7.7.7.7.8.7. 6.6.5.5.3.3.1.1.']],
      a: ['pl', 24, .16, ['0.0.0.0.0.0.0.0. 0.0.0.0.0.0.0.0. 7.7.7.7.7.7.7.7. 0101010101010101']],
      d: { k: 'x...x...x...x..x', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' } },
    furnace: { bpm: 128, root: 40, sc: PHR, fill: 1, dv: 1.1, // heavy: low sawtooth gallop, driving kick, E phrygian
      l: ['sq2', 24, .3, ['0-------3-----1- 0-----3-5------- 1-------0------- 3-----5-6-------', '7-----5-3------- 5-----3-1------- 1-----3-5-----6- 7-------6-5-3---']],
      b: ['saw', 0, .5, ['0.00.00.0.00.0.1 0.00.00.0.00.0.0 1.11.11.1.11.1.3 0.00.00.0.00.3.1']],
      d: { k: 'x...x.x.x...x.x.', s: '....x.......x...', t: '..............xx', h: 'x.x.x.x.x.x.x.xx' } },
    forest: { bpm: 100, root: 50, sc: PENT, dv: .5, // mellow D major pentatonic, soft triangle lead, sparse drums
      l: ['tri', 12, .4, ['2---3---5---3--- 4---3---2---1--- 2---3---5---6--- 5---3---2-------', '5---3---5---7--- 6---5---3---2--- 3---2---1---0--- 2-------0-------']],
      b: ['tri', -12, .6, ['0-------3------- 4-------0------- 0-------3------- 3-------0-------']],
      a: ['tri', 0, .28, ['0...2...3...2... A...0...2...0... 0...2...3...5... 3...5...6...5...']],
      d: { k: 'x.......x.......', s: '....g.......g...', h: '..x...x...x...x.' } },
    temple: { bpm: 120, root: 52, sc: SEN, dv: .9, // rhythmic, In-sen pentatonic (phrygian colour), toms and chimes
      l: ['sq', 12, .3, ['0..0.1.0..3.2.1. 0..0.1.0..4.3.2. 5..5.6.5..4.3.2. 3.2.1.0---------', '0..0.1.0..3.2.1. 0..0.1.0..4.3.2. 5..5.6.5..8.6.5. 4.3.2.1.0...3.4.']],
      b: ['saw', -12, .4, ['0..0..0.0..0..1. 0..0..0.0..0..1. 2..2..2.2..2..1. 0..0..0.0..0..0.']],
      a: ['bell', 12, .16, ['0.......3....... 0.......2....... 5.......3....... 2...3...4...3...']],
      d: { k: 'x.....x.x.......', s: '........x.......', t: '..x...x...x..x..', h: 'x.x.x.x.x.x.x.x.' } },
    graveyard: { bpm: 88, root: 47, sc: HMIN, tm: [3.2, .4], dv: .5, // eerie B harmonic minor, long ghostly notes, slow tremolo, heartbeat bass
      l: ['gh', 12, .4, ['4-----------3--- 2-----------0--- 5---------6----- 7---------------', '4-------6------- 7-----------5--- 4-------3------- 0---------------']],
      b: ['tri', 0, .55, ['0.0............. B.B............. D.D............. C.C.............']],
      a: ['gh', 0, .26, ['0--------------- 5--------------- 3--------------- 4---------------'], 1],
      d: { t: 'x...............', h: '..........g.....' } },
    rooftop: { bpm: 118, root: 48, sc: MAJ, fill: 1, // synthwave C major (I V vi IV), bright 16th arpeggio, detuned saw lead
      l: ['saw2', 24, .26, ['4--4-2--0---2--- 1--1-4--2---1--- 0--0-2--4---5--- 3--3-5--4---2---', '7--7-5--4---2--- 6--6-4--1---2--- 5--5-4--2---0--- 3--5-7--6-------']],
      b: ['saw', 0, .42, ['0.00.00.0.00.00. C.CC.CC.C.CC.CC. B.BB.BB.B.BB.BB. D.DD.DD.D.DD.DD.']],
      a: ['spl', 12, .2, ['0247424702474724 468b868b468b8b68 579c979c579c9c79 357a757a357a7a57']],
      d: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' } },
    wasteland: { bpm: 110, root: 52, sc: MPENT, sw: .55, dv: .8, // western: shuffled E minor pentatonic, short sawtooth twang plucks, boom-chuck bass
      l: ['tw', 12, .34, ['0.0.1.2.3.2.1.0. 0.0.1.2.4.3.2.1. 5.5.4.3.2.3.4.3. 2.3.2.1.0.......', '0.0.1.2.3.2.1.0. 0.0.1.2.4.3.2.1. 5.7.6.5.3.2.1.0. 3.2.1.0...0.1.2.']],
      b: ['saw', -12, .4, ['0.3.0.3.0.3.0.3. 0.3.0.3.0.3.0.3. 2.5.2.5.2.5.2.5. 3.3.3.3.4.3.2.1.']],
      a: ['spl', 0, .2, ['....0.......0... ....0.......0... ....2.......2... ....3.......3...'], 1],
      d: { k: 'x.......x.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' } },
    title: { bpm: 132, root: 50, sc: MIN, fill: 1, // energetic arcade fanfare, D minor
      l: ['sq2', 12, .3, ['0.0.0.2.4------- 5.5.5.4.2------- 6.6.6.5.4.5.6.7. 9---7---4---0---', '0.0.0.2.4.7.9.b. 5.5.5.4.2.4.5.7. 6.6.6.5.4.5.6.8. 7---4---0-------']],
      b: ['saw', -12, .42, ['0.0.0.0.0.0.0.0. 5.5.5.5.5.5.5.5. 6.6.6.6.6.6.6.6. 0.0.0.0.4.4.4.4.']],
      a: ['pl', 12, .18, ['0247424702474724 579c979c579c9c79 68ada8ad68adad8a 02474247468b868b']],
      d: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' } },
    vs: { bpm: 140, root: 40, sc: PHR, // short rising riff, 2-bar loop
      l: ['saw2', 24, .28, ['0.0.0.0.1.1.3.3. 4.4.5.5.6.6.7.7.', '0.0.0.0.1.1.3.3. 4.4.5.5.7.7.9.b.']],
      b: ['saw', 0, .45, ['0.0.0.0.0.0.0.0. 3.3.3.3.4.4.5.5.']],
      a: ['pl', 12, .18, ['0357035703570357 3579357935793579']],
      d: { k: 'x...x...x...x...', s: '....x.......x.xx', h: 'x.xxx.xxx.xxx.xx' } },
    over: { bpm: 112, root: 48, sc: MAJ, lf: 2, qv: .5, // 2-bar victory jingle (C C C C-E-G, high C) then a quiet 4-bar loop
      l: ['sq2', 12, .32, ['0.0.0.0---2---4- 7--------------- 4-----------2--- 2-----------4--- 3-----------5--- 1-------4-------', '0.0.0.0---2---4- 7--------------- 7-----------4--- 5-----------4--- 3-----------7--- 6-------4-------']],
      b: ['tri', 0, .5, ['0.0.0.0.0.0.0.0. 0--------------- 0-------0------- B-------B------- D-------D------- C-------C-------']],
      d: { k: 'x...x...x...x... x...............' + ' x...............'.repeat(4), s: '....x.......x.xx x...............' + ' ................'.repeat(4), h: '................ ................' + ' ..x...x...x...x.'.repeat(4) } },
  };

  // ---------- helpers ----------
  const mod = (a, n) => ((a % n) + n) % n, hz = m => 440 * 2 ** ((m - 69) / 12), strip = s => s.replace(/[\s|]/g, '');
  const pitch = (th, d, off) => th.root + off + th.sc[mod(d, th.sc.length)] + 12 * Math.floor(d / th.sc.length);
  const xn = s => { const o = []; let cur = null; for (const c of strip(s)) { if (c === '-' && cur) { cur[1]++; o.push(0); } else if (c === '.' || c === '-') { cur = null; o.push(0); } else { cur = [/[A-Z]/.test(c) ? 64 - c.charCodeAt(0) : parseInt(c, 36), 1]; o.push(cur); } } return o; }; // [degree, length in steps] per step
  function comp(th) { // expand the pattern strings once per theme
    if (th._c) return th._c;
    const c = th._c = { d: {} };
    for (const k of 'lba') c[k] = th[k] ? th[k][3].map(xn) : [];
    for (const k in th.d || {}) c.d[k] = [...strip(th.d[k])].map(x => x === '.' ? 0 : x);
    c.len = Math.max(16, ...[...c.l, ...c.b, ...c.a].map(p => p.length), ...Object.values(c.d).map(p => p.length));
    return c;
  }
  let NB = null, NBa = null;
  const nbuf = A => { if (NBa !== A) { NB = A.createBuffer(1, A.sampleRate, A.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NBa = A; } return NB; };

  // ---------- voices ----------
  function note(A, dst, name, f, t, dur, v) { // enveloped oscillator stack
    const I = INS[name]; dur = Math.max(Math.min(dur, I.max || 9), I.a + .02);
    const g = A.createGain(), e = g.gain; e.setValueAtTime(.0001, t); e.linearRampToValueAtTime(v, t + I.a); e.setTargetAtTime(v * I.s, t + I.a, I.d); e.setTargetAtTime(0, t + dur, I.r); g.connect(dst);
    for (const w of I.w) {
      const o = A.createOscillator(); o.type = w[0]; o.detune.value = w[1]; o.frequency.setValueAtTime(f * (I.sl || 1), t); if (I.sl) o.frequency.exponentialRampToValueAtTime(f, t + .04);
      if (w[2] !== 1) { const og = A.createGain(); og.gain.value = w[2]; o.connect(og); og.connect(g); } else o.connect(g);
      o.start(t); o.stop(t + dur + I.r * 6);
    }
  }
  function thump(A, dst, t, v, f0, f1, d, type = 'sine') { // pitch-dropping body: kick, tom, snare tone
    const o = A.createOscillator(), g = A.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * .6);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(dst); o.start(t); o.stop(t + d + .02);
  }
  function noise(A, dst, t, d, type, f, v) { // filtered noise burst: hats and snare
    const s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain(); s.buffer = nbuf(A); fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random() * .5); s.stop(t + d + .02);
  }
  const snare = (A, dst, t, v) => { noise(A, dst, t, .14, 'highpass', 1500, .45 * v); thump(A, dst, t, .3 * v, 230, 130, .09, 'triangle'); };

  // ---------- scheduler ----------
  let S = null, off = false, cool = 0;   // S: running theme {name, ac, ch (node chain), t (next step time), n (step), rep (loop count), lv (master level)}
  const M = window.MUSIC = { tick, stop() { off = true; halt(); }, resume() { off = false; }, now: null, theme: null, err: null };   // now: theme actually sounding, theme: theme the game state asks for
  function stepAt(th, t, sd) {
    const c = comp(th), n = S.n, A = S.ac, bus = S.ch.bus, vm = th.lf && S.rep ? th.qv : 1;
    for (const k of 'lba') {
      const vs = c[k]; if (!vs.length) continue;
      const arr = vs[S.rep & 1 ? vs.length - 1 : 0], e = arr[n % arr.length]; if (!e) continue;
      const [ins, o, vol, , chord] = th[k], dst = k === 'b' ? bus : S.ch.tb, dur = e[1] * sd * .92;
      if (chord) for (const j of [0, 2, 4]) note(A, dst, ins, hz(pitch(th, e[0] + j, o)), t, dur, vol * vm * .6);   // diatonic triad on the degree
      else note(A, dst, ins, hz(pitch(th, e[0], o)), t, dur, vol * vm);
    }
    const dv = (th.dv || 1) * vm, row = x => { const r = c.d[x]; return r && r[n % r.length]; }, g = x => x === 'X' ? 1.3 : x === 'g' ? .4 : 1;
    let x;
    if ((x = row('k'))) thump(A, bus, t, .9 * dv * g(x), 150, 42, .2);
    if ((x = row('s'))) snare(A, bus, t, dv * g(x));
    if ((x = row('t'))) thump(A, bus, t, .6 * dv * g(x), 250, 95, .18);
    if ((x = row('h'))) noise(A, bus, t, x === 'o' ? .14 : .035, 'highpass', 7000, .2 * dv * g(x));
    if (th.fill && S.rep & 1 && n >= c.len - 4) snare(A, bus, t, dv * (.5 + (n - c.len + 4) * .15));   // roll into the next repeat
  }
  function halt() { // fade the running chain out and drop it; notes already scheduled die with it
    M.now = null; if (!S) return;
    const { ac: A, ch } = S; S = null;
    try { ch.m.gain.cancelScheduledValues(A.currentTime); ch.m.gain.setTargetAtTime(0, A.currentTime, .025); } catch (e) { /* ignore */ }
    setTimeout(() => { try { ch.lfo.stop(); } catch (e) { /* ignore */ } for (const nd of [ch.tb, ch.bus, ch.m]) try { nd.disconnect(); } catch (e) { /* ignore */ } }, 400);
  }
  function begin(A, name, lv) { // fresh node chain: tremolo bus (lead / pads) and plain bus (bass / drums) -> compressor -> master -> out
    halt();
    const th = T[name], t0 = A.currentTime, ch = { bus: A.createDynamicsCompressor(), m: A.createGain(), tb: A.createGain(), lfo: A.createOscillator(), lg: A.createGain() }, [tr, td] = th.tm || [4, 0], k = ch.bus;
    k.threshold.value = -16; k.knee.value = 12; k.ratio.value = 8; k.attack.value = .004; k.release.value = .2;
    ch.m.gain.setValueAtTime(0, t0); ch.m.gain.setTargetAtTime(lv, t0 + .01, .02);
    ch.tb.gain.value = 1 - td; ch.lg.gain.value = td; ch.lfo.frequency.value = tr; ch.lfo.connect(ch.lg); ch.lg.connect(ch.tb.gain); ch.lfo.start();
    ch.tb.connect(k); k.connect(ch.m); ch.m.connect(A.destination);
    S = { name, ac: A, ch, t: t0 + .06, n: 0, rep: 0, lv }; M.now = name;
  }

  // ---------- reading the game ----------
  const rd = f => { try { return f(); } catch (e) { return undefined; } };
  function arenaTheme(g) {
    const i = Math.floor(+g.arena), id = rd(() => ARENAS[mod(i, ARENAS.length)].id);   // wraps like drawArena; NaN / missing arena falls through to the index
    return AR.includes(id) ? id : AR[mod(i || 0, AR.length)];
  }
  function want(g) {
    if (!g) return null;
    const p = g.phase;
    if (p === 'title' || p === 'select') return 'title';
    if (p === 'over') return 'over';
    if (p === 'vs' || (p === 'intro' && !(g.round > 1) && !g.sudden)) return 'vs';   // later rounds keep the arena theme running through the intro banner
    return ['intro', 'fight', 'pause', 'finish', 'finisher', 'ko', 'outro'].includes(p) ? arenaTheme(g) : null;   // sheet / unknown: silence
  }
  function tick() {
    if (cool > 0) { cool--; return; }
    try {
      const g = rd(() => typeof game !== 'undefined' ? game : window.game), w = want(g); M.theme = w;
      const A = rd(() => typeof AC !== 'undefined' ? AC : window.AC), mu = rd(() => typeof muted !== 'undefined' ? muted : window.muted);
      if (off || !w || !A || A.state !== 'running' || mu || document.hidden) { halt(); return; }   // nothing is scheduled while muted / suspended / hidden
      const lv = MASTER * (g.phase === 'pause' ? DUCK : 1);
      if (!S || S.name !== w || S.ac !== A) begin(A, w, lv);
      if (S.lv !== lv) { S.ch.m.gain.setTargetAtTime(lv, A.currentTime, .06); S.lv = lv; }
      const th = T[w], sd = 15 / th.bpm, now = A.currentTime;
      if (S.t < now) S.t = now + .03;   // fell behind (throttled timer): resync instead of bursting
      while (S.t < now + LOOK) {
        stepAt(th, S.t + (S.n % 4 === 2 ? (th.sw || 0) * sd : 0), sd);
        S.t += sd; if (++S.n >= comp(th).len) { S.n = (th.lf || 0) * 16; S.rep++; }
      }
    } catch (e) { M.err = e; cool = 12; try { halt(); } catch (e2) { /* ignore */ } }
  }
  setInterval(tick, 80);
})();
