// Tests for p-review: the parody code review shown after a 1P match against the CPU (p-review.js). Owner: the review agent.
// Covers: the pure review builder (the rules for no blocks, one special spammed, no throws, a loss, a clean win; the verdict; 3 to 5 comments; ASCII
// capitals in the pixel font's glyphs; two lines at most; no banned names; the same counts always give the same text), the counts taken from BUS
// events in a real match, when the review opens and when it does not (2P, CPU against CPU, the setting off, an end screen set directly), the keys
// (a grace period, skip, close, reopen with L, rematch and Enter to the select screen), the pixels it draws, and no console errors.
// Every step is deterministic: hold(true), step(n) and key taps.
export async function run(t) {
  const { check, tap, stepUntil } = t, ev = t.eval;
  const errors0 = t.p.errors.length;
  const HELPERS = `(() => {
    const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true });
    window.__snap = (x, y, w, h) => { sc.width = w; sc.height = h; sx.clearRect(0, 0, w, h); sx.drawImage(cv, x, y, w, h, 0, 0, w, h); return new Uint32Array(sx.getImageData(0, 0, w, h).data.buffer.slice(0)); };
    window.__pk = h => (0xff000000 | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;
    window.__count = (hex, x, y, w, h) => { render(); const k = __pk(hex); let n = 0; for (const v of __snap(x, y, w, h)) if (v === k) n++; return n; };
    return true;
  })()`;
  const open = async hash => { await t.open(hash); await ev(HELPERS); await ev('hold(true)'); };
  const press = async code => { await tap(code); await ev('step(1)'); };   // the pressed flag waits for the next update: a tap plus one step is one press
  const st = () => ev(`(() => { const s = REVIEW.state(); return { open: s.open, t: s.t, end: s.end, pending: !!s.pending, data: !!s.data, phase: game.phase,
    verdict: s.data && s.data.verdict, ids: s.data ? s.data.comments.map(c => c.id) : [], texts: s.data ? s.data.comments.map(c => c.text) : [] }; })()`);
  // a one-round match: sides [human P1, CPU P2] by default; before the KO, 'pre' runs in the page with x (P1) and y (P2) in scope
  const match = async ({ mode = 1, cpu = [false, true], pre = '', modeId = 'versus' } = {}) => {
    await ev(`SETTINGS.set('rounds', 1); game.modeId = ${JSON.stringify(modeId)}; game.sel = [0, 1]; game.mode = ${mode}; startMatch(); game.f[0].cpu = ${cpu[0]}; game.f[1].cpu = ${cpu[1]};`);
    const ph = await stepUntil('fight', 3000);
    await ev(`(() => { const [x, y] = game.f; ${pre}; y.inv = 0; y.hp = 1; y.takeHit(x, 60, 3, 14, 'punch'); })()`);
    return ph === 'fight' && await stepUntil('over', 30000) === 'over';
  };

  // ---- the builder: a pure function of the counts ----
  await open('#select');
  check(await ev('window.STUB_REVIEW === 1 && typeof REVIEW.build === "function" && SETTINGS.get("review.on") === true'), 'p-review.js is loaded and the review is on by default');
  await ev(`window.__B = o => REVIEW.build(Object.assign({ me: 'TIBO', foe: 'DOT', won: true, w: 1, l: 0, rounds: 1, meter: 40, pauses: 0, timeouts: [], first: 0, H: {}, F: {} }, o))`);
  const cases = await ev(`(() => {
    const pick = r => ({ verdict: r.verdict, approved: r.approved, n: r.comments.length, ids: r.comments.map(c => c.id), tags: r.comments.map(c => c.tag), texts: r.comments.map(c => c.text), title: r.title, summary: r.summary });
    return {
      noblock: pick(__B({ H: { hits: 10, taken: 9, blocks: 0, throws: 1, spN: 2, sp: { A: 1, B: 1 }, su: 1, combo: 3 } })),
      spam: pick(__B({ H: { hits: 12, taken: 3, blocks: 2, spN: 6, sp: { ROCKET: 5, BEAM: 1 }, su: 1, throws: 1, combo: 3 } })),
      nothrow: pick(__B({ H: { hits: 12, taken: 2, blocks: 3, spN: 2, sp: { A: 1, B: 1 }, su: 1, combo: 5 } })),
      lost: pick(__B({ won: false, w: 0, l: 2, rounds: 2, H: { hits: 9, taken: 12, blocks: 3, throws: 2, spN: 2, sp: { A: 1, B: 1 }, su: 1, combo: 2 } })),
      clean: pick(__B({ H: { hits: 14, taken: 2, blocks: 6, throws: 3, spN: 3, sp: { A: 1, B: 1, C: 1 }, su: 1, combo: 5, perfect: [1], fin: 'BIG FINISH' } })),
      idle: pick(__B({ H: {} })),
    };
  })()`);
  const has = (c, id) => c.ids.includes(id);
  check(has(cases.noblock, 'noblock') && cases.noblock.tags[0] === 'BLOCKING' && /ZERO BLOCKS, 9 HITS TAKEN/.test(cases.noblock.texts[0]) && cases.noblock.verdict === 'CHANGES REQUESTED',
    'never blocking while taking 9 hits is a blocking comment, and a win with a blocker still gets CHANGES REQUESTED: ' + cases.noblock.texts[0]);
  check(has(cases.spam, 'spam') && cases.spam.texts.some(s => /ROCKET X5 OUT OF 6 SPECIALS/.test(s)) && cases.spam.verdict === 'CHANGES REQUESTED', 'one special used 5 times out of 6 is named in a blocking comment');
  check(has(cases.nothrow, 'nothrow') && cases.nothrow.texts.some(s => /NO THROWS|ZERO THROWS/.test(s)) && cases.nothrow.verdict === 'APPROVED' && /^LGTM/.test(cases.nothrow.summary),
    'never throwing is a nit, and a win with only nits is APPROVED: ' + cases.nothrow.summary);
  check(cases.lost.ids[0] === 'lost' && cases.lost.verdict === 'CHANGES REQUESTED' && cases.lost.title === 'WIP: LOST TO DOT 0-2' && /DOT WON 2-0|2-0 TO DOT/.test(cases.lost.texts[0]),
    'a loss opens with a blocking comment and the score: ' + cases.lost.texts[0]);
  check(cases.clean.verdict === 'APPROVED' && cases.clean.approved && cases.clean.tags.filter(x => x === 'PRAISE').length >= 2 && cases.clean.summary === 'LGTM! SHIP IT.' && cases.clean.title === 'FEAT: BEAT DOT 1-0',
    'a clean win is APPROVED with praise: ' + cases.clean.ids.join(','));
  check(has(cases.idle, 'idle') && cases.idle.n >= 3, 'a match with no hits gets the idle comment and is padded to 3 comments: ' + cases.idle.ids.join(','));
  const RANK = { BLOCKING: 0, SUGGESTION: 1, QUESTION: 2, NIT: 3, PRAISE: 4 };
  check(Object.values(cases).every(c => c.tags.every((x, i) => i === 0 || RANK[c.tags[i - 1]] <= RANK[x])), 'comments are listed by severity: blocking first, praise last');

  // many count combinations: always 3 to 5 comments, text the pixel font can draw, two lines at most, the verdict rule, the same input gives the same output
  const BAD = [['mortal', ' kombat'], ['fatal', 'ity'], ['finish', ' him'], ['flaw', 'less'], ['get over', ' here'], ['toast', 'y'], ['scorp', 'ion'], ['sub', '-zero'], ['rai', 'den'],
    ['hadou', 'ken'], ['shoryu', 'ken'], ['street', ' fighter'], ['tek', 'ken'], ['babal', 'ity'], ['brutal', 'ity'], ['pot', 'ato']].map(a => a.join('').toUpperCase());
  const fuzz = await ev(`(() => {
    const BAD = ${JSON.stringify(BAD)}, OK = /^[A-Z0-9 .,!?:;\\-_/'"()\\[\\]+=<>&@#%*]*$/, bad = []; let a = 12345, n = 0;
    const r = m => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a % m; };
    for (let i = 0; i < 400; i++) {
      const sp = {}, kinds = r(4); let spN = 0; for (let k = 0; k < kinds; k++) { const c = r(7); if (c) { sp[['FIREWALL', 'HOT PATCH', 'BUBBLE', 'GRAD DESCENT'][k]] = c; spN += c; } }
      const hits = r(30), won = r(2) === 1, rounds = 1 + r(5), w = won ? 1 + r(3) : r(3), l = won ? r(w) : w + 1 + r(2);
      const s = { me: ['TIBO', 'POTETO', 'DOT', 'WANG', 'MUSE'][r(5)], foe: ['TIBO', 'POTETO', 'DOT', 'WANG', 'MUSE'][r(5)], won, w, l, rounds, meter: r(101), pauses: r(4),
        timeouts: r(3) ? [] : [1 + r(rounds)], first: r(3) - 1,
        H: { hits, dmg: hits * 7.3, punch: r(hits + 1), kick: 0, combo: r(9), taken: r(25), dmgTaken: r(200) + 0.4, blocks: r(15), chip: r(9), sp, spN, su: r(3), throws: r(5),
          thrown: r(5), kd: r(4), kdTaken: r(5), fin: r(4) ? '' : 'GRAND EXIT', won: w, lost: l, perfect: r(4) ? [] : [1 + r(rounds)] }, F: {} };
      s.H.kick = hits - s.H.punch;
      const out = REVIEW.build(s), again = REVIEW.build(JSON.parse(JSON.stringify(s))), all = [out.title, out.meta, out.summary, out.verdict, out.plus, out.minus, 'PULL REQUEST #' + out.pr];
      n++;
      const why = [];
      if (JSON.stringify(out) !== JSON.stringify(again)) why.push('not deterministic');
      if (out.comments.length < 3 || out.comments.length > 5) why.push(out.comments.length + ' comments');
      if (out.pr < 100 || out.pr > 999) why.push('pr ' + out.pr);
      if (out.approved !== (won && !out.comments.some(c => c.tag === 'BLOCKING'))) why.push('verdict rule');
      if (!won && out.comments[0].id !== 'lost') why.push('a loss without the loss comment');
      if (new Set(out.comments.map(c => c.id)).size !== out.comments.length) why.push('a comment twice');
      for (const c of out.comments) {
        all.push(c.tag, c.file, c.text);
        if (c.lines.length < 1 || c.lines.length > 2 || c.lines.some(x => x.length > REVIEW.COLS) || c.lines.join(' ') !== c.text) why.push('wrap of ' + c.text);
      }
      for (const x of all) { if (!OK.test(x)) why.push('glyphs: ' + x); if (BAD.some(b => x.includes(b))) why.push('banned: ' + x); }
      if (ptextWidth(out.title, 3) > 760 || ptextWidth(out.meta, 2) > 768 || ptextWidth(out.summary, 2) > 768) why.push('too wide: ' + out.title + ' / ' + out.summary);
      if (why.length) bad.push(i + ': ' + why.join('; '));
    }
    return { n, bad: bad.slice(0, 4) };
  })()`);
  check(fuzz.n === 400 && fuzz.bad.length === 0, '400 count combinations give 3 to 5 comments in ASCII capitals, at most 2 lines, the verdict rule and the same text each time' + (fuzz.bad.length ? ': ' + fuzz.bad.join(' | ') : ''));

  // ---- a real 1P match: the counts come from BUS, the review opens over the end screen ----
  await open('#select');
  const ok1 = await match({ pre: `for (let i = 0; i < 5; i++) BUS.emit('special', { fighter: x, foe: y, move: { name: 'ROCKET' } }); BUS.emit('special', { fighter: y, foe: x, move: { name: 'BEAM' } })` });
  check(ok1, 'a one-round match won by human P1 against the CPU reaches the end screen');
  const s1 = await st();
  const counts = await ev(`(() => { const s = REVIEW.stats().sides; return { sp: s[0].spN, rocket: s[0].sp.ROCKET, cpuSp: s[1].spN, hits: s[0].hits, won: s[0].won, taken: s[1].taken }; })()`);
  check(counts.sp === 5 && counts.rocket === 5 && counts.cpuSp === 1 && counts.hits >= 1 && counts.taken >= 1 && counts.won === 1, 'specials, hits and rounds are counted per side from BUS: ' + JSON.stringify(counts));
  check(s1.open && s1.t === 0 && s1.ids.includes('spam') && s1.texts.some(x => /ROCKET X5 OUT OF 5/.test(x)) && s1.verdict === 'CHANGES REQUESTED' && s1.ids.length >= 3 && s1.ids.length <= 5,
    'the review opens on the end screen and names the spammed special: ' + s1.ids.join(','));
  const shareVis = () => ev(`document.getElementById('share').style.visibility`);
  check(await shareVis() === 'hidden', 'the SHARE ON X link that sits over the canvas is hidden while the review is open');
  const panel = `'#0d1117', 72, 112, 816, 280`;
  const px0 = await ev(`__count(${panel})`);
  check(px0 < 200, 'on its first frame (before any update) the review draws nothing: ' + px0 + ' panel pixels');
  await press('Enter');
  check((await st()).open && (await st()).phase === 'over', 'Enter right away is ignored (grace period): the review stays open on the end screen');
  await ev('step(30)');
  const px1 = await ev(`__count(${panel})`), red1 = await ev(`__count('#f85149', 72, 22, 816, 496)`);
  check(px1 > 100000 && red1 > 300, 'after 30 ticks the panel covers the end screen and the blocking tags are drawn: ' + px1 + ' panel, ' + red1 + ' red pixels');
  await press('Enter');
  const s2 = await st();
  check(s2.open && s2.t === s2.end && s2.phase === 'over', 'the first Enter after the grace period skips the animation to the verdict');
  const stamp = await ev(`__count('#f85149', 120, 395, 720, 70)`);
  check(stamp > 400, 'the CHANGES REQUESTED stamp is drawn in red: ' + stamp + ' pixels');
  await press('Enter');
  const s3 = await st();
  check(!s3.open && s3.data && s3.phase === 'over' && await shareVis() === '', 'the next Enter closes the review, the end screen stays and SHARE ON X shows again');
  const badge = await ev(`__count('#f85149', 0, 0, 480, 44)`), px3 = await ev(`__count(${panel})`);
  check(badge > 60 && px3 < 200, 'closed, only a small verdict badge stays in the corner: ' + badge + ' red pixels, ' + px3 + ' panel pixels');
  await press('KeyL');
  const s4 = await st();
  check(s4.open && s4.t === s4.end && await ev(`__count(${panel})`) > 100000, 'L opens the review again, fully drawn');
  await press('Enter');
  check(!(await st()).open, 'Enter closes it again');
  await press('Enter');
  const s5 = await st();
  check(s5.phase === 'select' && !s5.data && !s5.open, 'with the review closed, Enter goes to the select screen as before');

  // R rematches straight from the open review, and the counts start again
  await open('#select');
  check(await match(), 'a second human win reaches the end screen');
  await ev('step(20)');
  await press('KeyR');
  const s6 = await st(), fresh = await ev('REVIEW.stats().sides[0].spN + REVIEW.stats().sides[0].won');
  check(s6.phase === 'vs' && !s6.open && !s6.data && fresh === 0, 'R rematches from the open review, which closes; the new match starts from zero counts');

  // a clean human win with praise gets APPROVED
  await open('#select');
  check(await match({ pre: `for (const n of ['A1', 'B2', 'C3']) BUS.emit('special', { fighter: x, foe: y, move: { name: n } }); for (let i = 0; i < 3; i++) BUS.emit('throw', { src: x, victim: y });
    for (let i = 0; i < 12; i++) BUS.emit('hit', { src: x, victim: y, dmg: 4, kind: i % 2 ? 'kick' : 'punch', combo: 1 + i % 5, hp: 50 }); BUS.emit('super', { fighter: x, foe: y, move: { name: 'S' } });
    for (let i = 0; i < 6; i++) BUS.emit('block', { src: y, victim: x, dmg: 1, kind: 'kick', hp: 90 })` }), 'a clean human win reaches the end screen');
  const s7 = await st();
  check(s7.open && s7.verdict === 'APPROVED' && s7.ids.includes('perfect'), 'a clean win in a real match is APPROVED, with the zero-hits round praised: ' + s7.ids.join(','));
  await ev('step(200)');
  const green = await ev(`__count('#3fb950', 120, 395, 720, 70)`);
  check(green > 300, 'the APPROVED stamp is drawn in green: ' + green + ' pixels');

  // ---- no review when there is nobody (or no one setting) to review ----
  const none = async (label, opts, setup = '') => {
    await open('#select'); if (setup) await ev(setup);
    const reached = await match(opts), s = await st();
    check(reached && !s.open && !s.data && !s.pending, label);
    await press('Enter');
    check((await st()).phase === 'select', label + ': Enter goes to the select screen at once');
  };
  await none('no review in a 2P match', { mode: 2, cpu: [false, false] });
  await none('no review when the CPU plays both sides', { cpu: [true, true] });
  await none('no review with the review.on setting off', {}, `SETTINGS.set('review.on', false)`);
  await ev(`SETTINGS.reset('review.on')`);
  await none('no review in another mode', { modeId: 'x-review-other' });
  await open('#select');
  await ev(`game.sel = [0, 1]; game.mode = 1; startMatch(); game.phase = 'over'; game.phaseT = 0`);
  const s8 = await st();
  check(!s8.open && !s8.data, 'an end screen set directly (no match:end) shows no review');

  check(t.p.errors.length === errors0, 'no console errors from the review' + (t.p.errors.length > errors0 ? ': ' + t.p.errors.slice(errors0, errors0 + 3).join(' | ') : ''));
}
