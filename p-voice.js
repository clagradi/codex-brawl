// ===== AGENT BRAWL feature file: VOICE (premium: banter, win quotes, announcer callouts, captions). =====
// Owner: voice agent (branch feat/p-voice).
// Area: VS-screen banter for every pairing of the five fighters (10 pairs and 5 mirror matches, two exchanges each), win quotes on the
//       outro and the end screen, and announcer callouts during the fight: FIRST HIT, COUNTER, COMEBACK, LAST SECOND.
//       Every line is a caption in the pixel font, always on. Speech is optional and goes through the existing announcer (hud.js ANNOUNCER).
// Speech: each fighter and the callouts get their own phrase key ('voice.tibo', ..., 'voice.call') through ANNOUNCER.define, the one engine
//         edit (hud.js). The engine's own calls always win: a line waits until the engine call is over, and a line that cannot start in time
//         is dropped from speech while its caption still shows. Without ANNOUNCER.define the feature runs with captions only.
// Settings: voice.speech (VOICE LINES, default on) mutes the voice lines only; the shared 'announcer' setting and mute silence them too.
// Hooks used: 'update' (own clock, speech queue, comeback tracking), 'damage' (reads the hit before it lands for COUNTER, never changes it),
//             'drawTop' (VS bubbles, callouts, quotes), 'pauseItems' (V turns the voice lines on or off).
// BUS used: match:start, phase, round:start, round:end, match:end, hit, block, ko, settings.
// Content rule: jokes about AI and dev culture only. Wang is played as the in-game persona (calm, bubbles, the lab), nothing about the real person.
// Public: window.VOICE (data, banterFor, winQuote, callout, state, speechOn, toggle) for tests and other feature files.
'use strict';
(() => {
  window.STUB_P_VOICE = 1;   // marker: the feature file loaded

  // ---------------------------------------------------------------- lines (sentence case; the captions are the same text in capitals)
  // BANTER[pair] = [[opener id, opener line, reply line], ...]; the pair key is the two ids in alphabetical order
  const BANTER = {
    'poteto|tibo': [['tibo', 'Your takes ship without tests.', 'Tests are for the timid, Tibo.'], ['poteto', 'Hot take: your hoodie is legacy.', 'Reverted. Try a cooler take.']],
    'dot|tibo': [['tibo', 'Stop typing and fight, Dot.', 'Thinking... thinking... done!'], ['dot', 'Three dots. Zero bugs. Your move.', "I'll ship before you finish."]],
    'tibo|wang': [['tibo', 'Your lab ran the numbers? Cute.', 'The lab ran you. Twice.'], ['wang', 'Stay calm. It is only a benchmark.', 'Benchmarks fear my commits.']],
    'muse|tibo': [['tibo', 'Ping me again and I revert you.', 'Undo. Undo. Still here!'], ['muse', 'Ping! Ping! Did you see my ping?', 'Marked as read. Ignored.']],
    'dot|poteto': [['poteto', 'Fresh out the oven, Dot. Hot take!', 'Cooling down... done. Next?'], ['dot', 'Hm... let me think about you.', "Think faster. I'm baking."]],
    'poteto|wang': [['poteto', 'I will pop your bubbles, Wang.', 'Bubbles do not pop. They reflect.'], ['wang', 'The lab predicts your next take.', 'Then the lab needs a nap.']],
    'muse|poteto': [['poteto', 'Your swarm smells like spam.', 'Swarm! Reply all! Reply all!'], ['muse', 'Undo your last take, please.', 'No undo. Only hotter takes.']],
    'dot|wang': [['dot', 'Typing... typing... still calm?', 'Calm is my whole build.'], ['wang', 'Your dots are a loading screen.', 'Loading your defeat... 99%.']],
    'dot|muse': [['dot', "Wait, I'm almost done typing...", 'Pinged you nine times already!'], ['muse', "Fluff versus round. Let's go!", 'Round wins. Physics says so.']],
    'muse|wang': [['wang', 'Breathe. The lab has a plan.', 'The swarm has a group chat.'], ['muse', 'Same badge, different bubble!', 'Then I will review you calmly.']],
    'tibo|tibo': [['tibo', 'Two of me? Merge conflict.', 'Resolve it with my fists.'], ['tibo', 'I wrote you last sprint.', 'And I reverted you this one.']],
    'poteto|poteto': [['poteto', 'Only one of us is the hot take.', "Then let's see who cools first."], ['poteto', 'Nice glasses. Mine are rounder.', 'Mine are hotter.']],
    'dot|dot': [['dot', 'Is that my typing indicator?', 'No, you are mine.'], ['dot', 'Who is thinking now?', 'Both of us. Forever.']],
    'wang|wang': [['wang', 'A calm mirror. How peaceful.', 'Peace ends in three seconds.'], ['wang', 'Two labs, one ring.', 'The better lab wins.']],
    'muse|muse': [['muse', 'Ping!', "Pong! You're it!"], ['muse', 'Undo yourself.', 'Redo! Redo!']],
  };
  const WIN = {
    tibo: ['Shipped. The tests passed in spirit.', 'That fight is now in the changelog.', 'LGTM. Merging the win.', 'Want a rematch? Open a ticket.'],
    poteto: ['Hot take: I was always going to win.', 'Fresh from the oven: one hot take, served.', 'Glasses on, takes hot, you down.', 'That take was spicy. So was that combo.'],
    dot: ['... and done. Thanks for waiting.', 'Small, round and undefeated.', 'I was thinking. You were losing.', 'Typing indicator off. Fight over.'],
    wang: ['Calm wins. The lab agrees.', 'The bubbles saw it coming.', 'Stay calm. Try again.', 'The lab will study this rematch.'],
    muse: ['Ping! You lost. Ping!', 'Swarm says: GG.', 'Undo that loss? Not this time.', 'Fluffy. Quick. Victorious.'],
  };
  const WIN_VS = {   // WIN_VS[winner][loser]: the line for that matchup (mirror matches use the general lines)
    tibo: { poteto: 'Your take got reverted.', dot: 'Shipped before your dots loaded.', wang: 'Calm is nice. Shipping is nicer.', muse: 'Ping me after the postmortem.' },
    poteto: { tibo: 'Revert that, Tibo.', dot: 'That take was too hot for you, Dot.', wang: 'Bubbles popped. Takes stay hot.', muse: 'Your swarm needs a hotter take.' },
    dot: { tibo: "Ship that, Tibo. I'll wait.", poteto: 'Cooling your take... done.', wang: 'Calm, meet quick.', muse: 'Read your pings. All nine.' },
    wang: { tibo: 'Slow down, Tibo. Breathe.', poteto: 'Hot takes cool off in the lab.', dot: 'Your dots were a long pause.', muse: 'Same badge. Calmer result.' },
    muse: { tibo: 'Undo your commit? Already did.', poteto: 'Take, meet swarm.', dot: 'Ping! Your dots stopped.', wang: 'The lab got swarmed.' },
  };
  const CALLS = {   // announcer callouts: the big tag, what the announcer says, the tag colour and the small flavour line under it
    first: { title: 'FIRST HIT', say: 'First hit!', col: '#ffd76a', quips: ['HELLO, WORLD', 'FIRST COMMIT LANDS', 'OPENING MOVE MERGED'] },
    counter: { title: 'COUNTER', say: 'Counter!', col: '#7ef0ff', quips: ['INTERRUPT HANDLED', 'RACE CONDITION WON', 'EXCEPTION CAUGHT'] },
    comeback: { title: 'COMEBACK', say: 'Comeback!', col: '#9cff8a', quips: ['ROLLBACK SUCCESSFUL', 'BACK FROM A 500', 'RECOVERED FROM THE CRASH'] },
    last: { title: 'LAST SECOND', say: 'Last second!', col: '#ff9a6a', quips: ['DEPLOYED AT 4:59 FRIDAY', 'MERGED ON THE DEADLINE', 'JUST UNDER THE TIMEOUT'] },
  };
  // speech: [pitch, rate] per phrase key; the callouts use the announcer's low voice and the whoosh stinger
  const VOICES = { tibo: [0.95, 1.25], poteto: [0.7, 1.15], dot: [1.6, 1.35], wang: [0.8, 1.1], muse: [1.4, 1.35], call: [0.4, 0.95] };
  const SAYAS = [[/\bPoteto\b/g, 'Poh-tay-toe'], [/\bTibo\b/g, 'Tee-bo'], [/\bLGTM\b/g, 'L G T M'], [/\bGG\b/g, 'G G'], [/\.\.\./g, ', ']];
  const spoken = s => { let t = String(s == null ? '' : s); for (const [re, to] of SAYAS) t = t.replace(re, to); return t.replace(/^[\s,]+/, ''); };

  // ---------------------------------------------------------------- timing and layout
  const VS_A = 4, VS_B = 56, TYPE = 1.5;                     // VS ticks when the opener and the reply appear; typewriter speed in characters per tick
  const VS_CALL = typeof VS_LAND === 'number' ? VS_LAND : 110; // the engine names the arena at this VS tick: the reply is spoken only if it ends before
  const BUBBLE_COLS = 34, SUB_COLS = 48, BOX_COLS = 22;      // wrap widths in characters at pixel-font size 2 (BOX: the end-screen bubble)
  const BOX_X = 24, BOX_Y = 196;                             // end screen: below the title lines and notes (y < 180), left of the winner sprite (x > 330)
  const CALL_IN = 8, CALL_HOLD = 110, CALL_OUT = 15, CALL_LIFE = CALL_IN + CALL_HOLD + CALL_OUT, CALL_MAX = 2, CALL_Y = 112, CALL_STEP = 70;
  const COUNTER_CD = 240, COMEBACK_GAP = 0.4, LAST_SECONDS = 3;
  const CALL_WAIT = 75, QUOTE_AT = 30, QUOTE_WAIT = 260, ENGINE_BASE = 30;
  const FIGHTING = ['intro', 'fight', 'finish', 'finisher', 'ko'];
  const CALL_PHASES = new Set(FIGHTING);
  const STD_OVER = new Set(['versus', 'versus2']);           // the plain end screen; other modes draw their own panels there
  const ATK = typeof ATTACKS !== 'undefined' && ATTACKS && ATTACKS.has ? ATTACKS : new Set(['punch', 'kick', 'special', 'super']);

  SETTINGS.define('voice.speech', { def: true, label: 'VOICE LINES' });

  const opt = k => { try { return SETTINGS.get(k); } catch (e) { return undefined; } };
  const speechOn = () => opt('voice.speech') !== false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = x => { x = clamp(x, 0, 1); return 1 - (1 - x) * (1 - x); };
  const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h; };
  const colOf = id => { const r = ROSTER.find(x => x.id === id); return r ? r.col : '#ffffff'; };
  const est = (text, rate) => Math.round(16 + String(text).length * 3.9 / (rate || 1));   // rough speech length in ticks
  const ratio = f => f && f.d && f.d.hp ? Math.max(0, f.hp) / f.d.hp : 0;
  function wrap(text, cols) {
    const rows = []; let cur = '';
    for (const w of String(text).toUpperCase().split(' ')) { if (!w) continue; if (!cur) cur = w; else if (cur.length + 1 + w.length <= cols) cur += ' ' + w; else { rows.push(cur); cur = w; } }
    if (cur) rows.push(cur);
    return rows;
  }
  const widest = rows => rows.reduce((m, r) => Math.max(m, ptextWidth(r, 2)), 0);

  // ---------------------------------------------------------------- state
  const S = {
    T: 0, n: 0,                                  // own clock (stops while paused) and the number of matches started
    queue: [], engineUntil: 0, mineUntil: 0, log: [],
    vs: null, calls: [], quote: null,
    first: false, gap: [0, 0], counterAt: -1e9, pend: null,
    counts: { first: 0, counter: 0, comeback: 0, last: 0, banter: 0, quote: 0, spoken: 0 },
    defined: false,
  };

  // ---------------------------------------------------------------- speech through the announcer
  try {
    if (window.ANNOUNCER && typeof ANNOUNCER.define === 'function') {
      for (const k of Object.keys(VOICES)) {
        const v = VOICES[k], st = k === 'call' ? 'whoosh' : undefined;
        ANNOUNCER.define('voice.' + k, txt => ({ text: spoken(txt), pitch: v[0], rate: v[1], st }));
      }
      S.defined = true;
    }
  } catch (e) { S.defined = false; }
  if (window.ANNOUNCER && typeof ANNOUNCER.say === 'function') {   // note when the engine speaks: its calls win, our lines wait for them
    const say0 = ANNOUNCER.say;
    ANNOUNCER.say = function (key, arg) {
      if (typeof key === 'string' && key.slice(0, 6) !== 'voice.') {
        const len = key.length + (arg == null ? 0 : String(arg).length);
        S.engineUntil = Math.max(S.engineUntil, S.T + ENGINE_BASE + Math.round(len * 3.6)); S.mineUntil = 0;   // the engine's call cancels ours
      }
      return say0.apply(this, arguments);
    };
  }
  // o: { delay, wait (ticks it may wait), fin (absolute tick the line must end by), phases }
  function enqueue(key, text, o) {
    if (!speechOn()) return false;
    S.queue.push({ key, text, at: S.T + (o.delay || 0), exp: S.T + (o.delay || 0) + (o.wait || 60), fin: o.fin == null ? Infinity : o.fin, phases: o.phases || null });
    if (S.queue.length > 6) S.queue.shift();
    return true;
  }
  function speak(key, text, len) {
    if (!speechOn() || !window.ANNOUNCER) return false;
    let ok = false; try { ok = !!ANNOUNCER.say('voice.' + key, text); } catch (e) { ok = false; }
    S.log.push({ key: 'voice.' + key, text, T: S.T, ok }); if (S.log.length > 24) S.log.shift();
    if (ok) { S.mineUntil = S.T + len; S.counts.spoken++; }
    return ok;
  }
  function pump(ph) {
    for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; if (S.T > q.exp || (q.phases && q.phases.indexOf(ph) < 0)) S.queue.splice(i, 1); }
    const q = S.queue[0]; if (!q || S.T < q.at || S.T < S.engineUntil || S.T < S.mineUntil) return;
    S.queue.shift();
    const v = VOICES[q.key], len = est(spoken(q.text), v ? v[1] : 1);
    if (S.T + len > q.fin) return;   // it would run into an engine call that is due: caption only
    speak(q.key, q.text, len);
  }

  // ---------------------------------------------------------------- content pickers
  function banterFor(a, b, n) {
    const key = pairKey(a, b), list = BANTER[key]; if (!list) return null;
    const ex = list[((n | 0) + hash(key)) % list.length];
    const s = a === b ? ((n | 0) & 1) : (ex[0] === a ? 0 : 1);   // the opener's side; a mirror match alternates
    return { opener: { side: s, id: s ? b : a, text: ex[1] }, reply: { side: 1 - s, id: s ? a : b, text: ex[2] } };
  }
  function winQuote(id, foe, n) {
    const gen = WIN[id]; if (!gen) return '';
    const sp = WIN_VS[id] && foe !== id ? WIN_VS[id][foe] : null, k = (n | 0) + hash(id + '|' + (foe || ''));
    return sp && k % 2 === 0 ? sp : gen[(k >> 1) % gen.length];
  }
  function startBanter(a, b) {
    const bt = banterFor(a, b, S.n); if (!bt) { S.vs = null; return null; }
    const mk = (x, at) => { const rows = wrap(x.text, BUBBLE_COLS); return { side: x.side, id: x.id, text: x.text, rows, w: widest(rows), col: colOf(x.id), at }; };
    S.vs = { lines: [mk(bt.opener, VS_A), mk(bt.reply, VS_B)] };
    S.counts.banter++;
    enqueue(bt.opener.id, bt.opener.text, { delay: VS_A, wait: 40, phases: ['vs'] });
    enqueue(bt.reply.id, bt.reply.text, { delay: VS_B, wait: VS_CALL - VS_B, fin: S.T + VS_CALL, phases: ['vs'] });
    return S.vs;
  }
  function callout(kind, side) {
    const c = CALLS[kind]; if (!c || (side !== 0 && side !== 1)) return null;
    const f = game.f && game.f[side], quip = c.quips[(S.counts[kind] + S.n) % c.quips.length];
    S.counts[kind]++;
    const it = { kind, side, title: c.title, quip, col: c.col, fcol: f && f.d ? colOf(f.d.id) : '#ffffff', t0: S.T, w: Math.max(ptextWidth(c.title, 4), ptextWidth(quip, 2)) };
    S.calls.push(it); while (S.calls.length > CALL_MAX) S.calls.shift();
    enqueue('call', c.say, { wait: CALL_WAIT, phases: FIGHTING });
    return it;
  }
  function setQuote(w, l) {
    const id = w.d.id, foe = l && l.d ? l.d.id : '', text = winQuote(id, foe, S.n); if (!text) return null;
    const sub = wrap(text, SUB_COLS), box = wrap('"' + text + '"', BOX_COLS);
    S.quote = { side: w.side, id, name: (typeof SHORT === 'function' ? SHORT(w.d) : w.d.name) + ':', text, sub, box, wSub: widest(sub), wBox: widest(box), col: colOf(id), t0: S.T };
    S.counts.quote++;
    enqueue(id, text, { delay: QUOTE_AT, wait: QUOTE_WAIT, phases: ['outro', 'over'] });
    return S.quote;
  }
  const fighting = () => game.modeId !== 'training' && game.f && game.f.length === 2;
  function track() {
    const f = game.f; if (!f || f.length < 2) return;
    const r0 = ratio(f[0]), r1 = ratio(f[1]);
    if (r1 - r0 > S.gap[0]) S.gap[0] = r1 - r0;
    if (r0 - r1 > S.gap[1]) S.gap[1] = r0 - r1;
  }

  // ---------------------------------------------------------------- events
  BUS.on('match:start', () => {
    S.n++; S.calls.length = 0; S.quote = null; S.queue.length = 0; S.counterAt = -1e9;
    const f = game.f; if (f && f.length === 2 && f[0].d && f[1].d) startBanter(f[0].d.id, f[1].d.id); else S.vs = null;
  });
  BUS.on('phase', e => { if (e && (e.to === 'title' || e.to === 'select')) { S.queue.length = 0; S.vs = null; S.calls.length = 0; S.quote = null; } });
  BUS.on('round:start', () => { S.first = false; S.gap[0] = S.gap[1] = 0; S.calls.length = 0; S.pend = null; });
  HOOKS.add('damage', pl => {   // sees the hit before it lands; never changes it
    try { const v = pl.victim; S.pend = { victim: v, vstate: v.state, vcontact: !!v.contact, guarding: !!pl.guarding }; } catch (e) { S.pend = null; }
    return undefined;
  }, 110);
  BUS.on('block', () => { S.pend = null; });
  BUS.on('hit', e => {
    const pd = S.pend; S.pend = null;
    if (!e || !e.src || !fighting() || game.f.indexOf(e.src) < 0) return;
    const side = e.src.side;
    if (!S.first) { S.first = true; callout('first', side); }
    if (pd && pd.victim === e.victim && !pd.guarding && ATK.has(pd.vstate) && !pd.vcontact && S.T - S.counterAt >= COUNTER_CD) { S.counterAt = S.T; callout('counter', side); }
    track();
  });
  BUS.on('ko', e => {   // emitted while the phase is still 'fight'
    if (!e || !e.winner || !fighting() || opt('infTime')) return;
    if (typeof game.timer === 'number' && game.timer <= LAST_SECONDS) callout('last', e.winner.side);
  });
  BUS.on('round:end', e => {
    if (!e || !e.winner || (e.reason !== 'ko' && e.reason !== 'time') || !fighting()) return;
    if (S.gap[e.winner.side] >= COMEBACK_GAP) callout('comeback', e.winner.side);
  });
  BUS.on('match:end', e => { if (e && e.winner && e.winner.d) setQuote(e.winner, e.loser); });
  BUS.on('settings', e => {
    if (!e || e.key !== 'voice.speech' || e.value !== false) return;
    S.queue.length = 0;
    if (S.T < S.mineUntil) { S.mineUntil = 0; try { ANNOUNCER.stop(); } catch (x) { /* no announcer */ } }   // only our line is playing: cut it
  });
  HOOKS.add('update', g => {
    if (g.phase === 'pause') return;
    S.T++;
    if (g.phase === 'fight') track();
    while (S.calls.length && S.T - S.calls[0].t0 > CALL_LIFE) S.calls.shift();
    if (S.queue.length) pump(g.phase);
  });
  const LBL_ON = 'V VOICE LINES ON', LBL_OFF = 'V VOICE LINES OFF';
  function toggle(v) { try { SETTINGS.set('voice.speech', typeof v === 'boolean' ? v : !speechOn()); } catch (e) { /* settings refused */ } return speechOn(); }
  HOOKS.add('pauseItems', () => ({ id: 'voice', key: 'KeyV', label: speechOn() ? LBL_ON : LBL_OFF, run: () => toggle() }));

  // ---------------------------------------------------------------- drawing (screen space, pixel font)
  function plate(c, x, y, w, h, col) {
    c.fillStyle = 'rgba(5,6,12,0.86)'; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, w, 2); c.fillRect(x, y + h - 2, w, 2); c.fillRect(x, y, 2, h); c.fillRect(x + w - 2, y, 2, h);
  }
  function bubble(c, L, age) {
    const n = L.rows.length, padX = 12, padY = 9, lh = 20, w = L.w + padX * 2, h = n * lh - 2 + padY * 2;
    const left = L.side === 0, x = left ? 18 : W - 18 - w, y = n > 1 ? 6 : 14, tail = left ? x + 44 : x + w - 44;
    c.save(); c.globalAlpha = clamp(age / 6, 0, 1);
    plate(c, x, y, w, h, L.col);
    c.fillStyle = L.col; c.beginPath(); c.moveTo(tail - 8, y + h); c.lineTo(tail + 8, y + h); c.lineTo(tail + (left ? -4 : 4), y + h + 9); c.closePath(); c.fill();
    let left2 = Math.floor(age * TYPE);   // characters revealed so far (typewriter, by clipping: no new strings per frame)
    for (let r = 0; r < n && left2 > 0; r++) {
      const row = L.rows[r], k = Math.min(row.length, left2), tx = x + padX, ty = y + padY + r * lh; left2 -= row.length + 1;
      c.save(); c.beginPath(); c.rect(tx - 1, ty - 1, k * 12 + 2, lh); c.clip(); ptext(c, row, tx, ty, 2, '#ffffff', 'left', true); c.restore();
    }
    c.restore();
  }
  function drawCalls(c) {
    let k0 = 0, k1 = 0;
    for (const it of S.calls) {
      const age = S.T - it.t0, k = it.side ? k1++ : k0++, left = it.side === 0;
      const a = age > CALL_IN + CALL_HOLD ? 1 - (age - CALL_IN - CALL_HOLD) / CALL_OUT : 1, w = it.w + 30, h = 66;
      const x = left ? 16 : W - 16 - w, y = CALL_Y + k * CALL_STEP, off = (1 - ease(age / CALL_IN)) * (w + 30) * (left ? -1 : 1);
      c.save(); c.globalAlpha = clamp(a, 0, 1); c.translate(Math.round(off), 0);
      c.fillStyle = 'rgba(4,5,10,0.72)'; c.fillRect(x, y, w, h);
      c.fillStyle = it.col; c.fillRect(left ? x : x + w - 4, y, 4, h);
      const tx = left ? x + 16 : x + w - 16, al = left ? 'left' : 'right';
      ptext(c, it.title, tx, y + 6, 4, it.col, al, true);
      ptext(c, it.quip, tx, y + 45, 2, it.fcol, al, true);
      c.restore();
    }
  }
  function quoteBlock(c, q, rows, wq, left, top, age) {   // left == null: centred on the screen; otherwise a bubble with a tail toward the winner
    const lh = 20, w = Math.max(wq, ptextWidth(q.name, 2)) + 28, h = (rows.length + 1) * lh + 16, x = left == null ? Math.round(W / 2 - w / 2) : left, cx = x + w / 2;
    c.save(); c.globalAlpha = clamp(age / 10, 0, 1);
    plate(c, x, top, w, h, q.col);
    if (left != null) { c.fillStyle = q.col; c.beginPath(); c.moveTo(x + w, top + 16); c.lineTo(x + w + 12, top + 26); c.lineTo(x + w, top + 36); c.closePath(); c.fill(); }
    ptext(c, q.name, x + 14, top + 9, 2, q.col, 'left', true);
    for (let r = 0; r < rows.length; r++) ptext(c, rows[r], cx, top + 9 + (r + 1) * lh, 2, '#ffffff', 'center', true);
    c.restore();
  }
  HOOKS.add('drawTop', (c, g) => {
    const ph = g.phase;
    if (ph === 'vs') { if (S.vs) for (const L of S.vs.lines) if (g.phaseT >= L.at) bubble(c, L, g.phaseT - L.at); return; }
    if (ph === 'outro') { const q = S.quote; if (q && g.phaseT >= QUOTE_AT) quoteBlock(c, q, q.sub, q.wSub, null, 470 - ((q.sub.length + 1) * 20 + 16), g.phaseT - QUOTE_AT); return; }
    if (ph === 'over') { const q = S.quote; if (q && STD_OVER.has(g.modeId)) quoteBlock(c, q, q.box, q.wBox, BOX_X, BOX_Y, S.T - q.t0); return; }
    if (S.calls.length && CALL_PHASES.has(ph)) drawCalls(c);
  }, 20);

  // ---------------------------------------------------------------- public
  function lines() {   // every caption the feature can show, in capitals (tests check the glyphs and the banned words)
    const out = [];
    for (const k of Object.keys(BANTER)) for (const ex of BANTER[k]) out.push(ex[1], ex[2]);
    for (const k of Object.keys(WIN)) out.push(...WIN[k]);
    for (const k of Object.keys(WIN_VS)) for (const f of Object.keys(WIN_VS[k])) out.push(WIN_VS[k][f]);
    for (const k of Object.keys(CALLS)) out.push(CALLS[k].title, CALLS[k].say, ...CALLS[k].quips);
    return out.map(s => s.toUpperCase());
  }
  window.VOICE = {
    BANTER, WIN, WIN_VS, CALLS, VOICES,
    C: { VS_A, VS_B, VS_CALL, TYPE, BUBBLE_COLS, SUB_COLS, BOX_COLS, BOX_X, BOX_Y, CALL_LIFE, CALL_MAX, CALL_Y, COUNTER_CD, COMEBACK_GAP, LAST_SECONDS, QUOTE_AT },
    banterFor, winQuote, wrap, est, spoken, lines, callout, speechOn, toggle, pairKey,
    state() {
      return {
        T: S.T, n: S.n, defined: S.defined, engineUntil: S.engineUntil, mineUntil: S.mineUntil, first: S.first, gap: S.gap.slice(),
        queue: S.queue.map(q => ({ key: q.key, text: q.text, at: q.at, exp: q.exp, fin: q.fin })), log: S.log.slice(),
        vs: S.vs && S.vs.lines.map(L => ({ side: L.side, id: L.id, text: L.text, rows: L.rows.slice(), at: L.at })),
        calls: S.calls.map(it => ({ kind: it.kind, side: it.side, title: it.title, quip: it.quip, age: S.T - it.t0 })),
        quote: S.quote && { side: S.quote.side, id: S.quote.id, text: S.quote.text, sub: S.quote.sub.slice(), box: S.quote.box.slice() },
        counts: Object.assign({}, S.counts),
      };
    },
  };
})();
