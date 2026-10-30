// Tests for p-voice.js (VS banter, win quotes, announcer callouts with captions, the voice.speech setting). Owner: the p-voice agent. Runs after core.mjs.
// Everything is driven with hold(true) and step(n). ANNOUNCER.say is wrapped by a spy that records every call and still runs the real chain (so the
// engine-call gating in p-voice.js is exercised); ptext is spied during render() to see which captions are drawn.
// Hooks used by p-voice.js: update, damage, drawTop, pauseItems. Setting: voice.speech. Engine hook: ANNOUNCER.define (hud.js).
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    window.V = {};
    V.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    V.speech0 = SETTINGS.get('voice.speech'); V.inf0 = SETTINGS.get('infTime');
    V.said = []; V.stops = 0; V.say0 = ANNOUNCER.say; V.stop0 = ANNOUNCER.stop;
    ANNOUNCER.say = function (k, a) {
      V.said.push({ k: String(k), a: a == null ? '' : String(a), T: VOICE.state().T, ph: game.phase });
      const r = V.say0.apply(this, arguments); return String(k).slice(0, 6) === 'voice.' ? true : r;   // a voice line counts as played even when the headless page is muted
    };
    ANNOUNCER.stop = function () { V.stops++; return V.stop0.apply(this, arguments); };
    V.voiced = () => V.said.filter(s => s.k.slice(0, 6) === 'voice.');
    V.drawn = () => { const out = [], p0 = window.ptext; window.ptext = function (c, s) { out.push(String(s)); return p0.apply(this, arguments); }; try { render(); } finally { window.ptext = p0; } return out; };
    V.start = (i, j) => {   // a fresh two-player versus match, left on its first VS tick
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      if (typeof MODES !== 'undefined' && MODES.pick) MODES.pick('versus2'); game.mode = 2;
      game.sel = [i, j]; game.arenaPick = 0; V.said.length = 0; startMatch(); game.f[0].cpu = game.f[1].cpu = false; return game.f;
    };
    V.fresh = (i, j, wins) => { V.start(i, j); V.until(() => game.phase === 'fight', 900); if (wins) game.wins = wins.slice(); step(1); return game.f; };
    V.place = () => {
      const [a, b] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [a, b]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.lie = 0; q.land = 0; q.hidden = false; }
      a.x = 300; b.x = 560; a.face = 1; b.face = -1; return [a, b];
    };
  })()`);

  // ---- structure, setting, announcer phrases, pause item ----
  const s0 = await ev(`(() => {
    const st = VOICE.state(), item = HOOKS.collect('pauseItems').find(x => x && x.id === 'voice');
    return { api: typeof VOICE === 'object' && typeof VOICE.state === 'function', defined: st.defined, marker: window.STUB_P_VOICE === 1,
      phrases: ['tibo', 'poteto', 'dot', 'wang', 'muse', 'call'].every(k => ANNOUNCER.phrases.indexOf('voice.' + k) >= 0),
      def: SETTINGS.get('voice.speech'), hooks: ['update', 'damage', 'drawTop', 'pauseItems'].every(h => HOOKS.has(h)),
      item: item ? { key: item.key, label: item.label } : null, roster: ROSTER.map(r => r.id).join(','), handles: ROSTER.every(r => r.handle === '') };
  })()`);
  check(s0.api && s0.marker && s0.hooks, 'VOICE is loaded and uses the update, damage, drawTop and pauseItems hooks');
  check(s0.defined && s0.phrases, 'p-voice registers its announcer phrases (voice.tibo ... voice.call) through ANNOUNCER.define');
  check(s0.def === true && s0.item && s0.item.key === 'KeyN' && s0.item.label === 'N VOICE LINES ON', 'voice.speech defaults to on and the pause menu offers N VOICE LINES: ' + JSON.stringify(s0.item));
  check(s0.roster === 'tibo,poteto,dot,wang,muse' && s0.handles, 'the roster is still the five fighters with empty handles: ' + s0.roster);

  // ---- the lines themselves: every pair, every winner, glyphs, wrap widths, banned words ----
  const d = await ev(`(() => {
    const ids = ROSTER.map(r => r.id), out = { pairs: Object.keys(VOICE.BANTER).length, bad: [], rows: 0, sp: 0, gen: 0, winBad: [], quoteRows: 0, quoteWide: 0 };
    for (const a of ids) for (const b of ids) {
      for (let n = 0; n < 4; n++) {
        const bt = VOICE.banterFor(a, b, n), bt2 = VOICE.banterFor(b, a, n);
        if (!bt || !bt2) { out.bad.push(a + '/' + b + ' missing'); continue; }
        if (bt.opener.id !== (bt.opener.side ? b : a) || bt.reply.id !== (bt.reply.side ? b : a) || bt.opener.side + bt.reply.side !== 1) out.bad.push(a + '/' + b + ' sides');
        if (a !== b && (bt.opener.text !== bt2.opener.text || bt.opener.id !== bt2.opener.id)) out.bad.push(a + '/' + b + ' order');
        for (const x of [bt.opener, bt.reply]) { const r = VOICE.wrap(x.text, VOICE.C.BUBBLE_COLS); out.rows = Math.max(out.rows, r.length); if (!x.text || r.some(s => s.length > VOICE.C.BUBBLE_COLS)) out.bad.push(x.text); }
        const q = VOICE.winQuote(a, b, n);
        if (!q) { out.winBad.push(a + '/' + b); continue; }
        if (a !== b && q === VOICE.WIN_VS[a][b]) out.sp++; else out.gen++;
        const box = VOICE.wrap('"' + q + '"', VOICE.C.BOX_COLS); out.quoteRows = Math.max(out.quoteRows, box.length);
        out.quoteWide = Math.max(out.quoteWide, ...box.map(s => ptextWidth(s, 2)));
      }
      if (a === b && VOICE.banterFor(a, a, 0).opener.side === VOICE.banterFor(a, a, 1).opener.side) out.bad.push(a + ' mirror never alternates');
    }
    out.win = ids.every(id => VOICE.WIN[id] && VOICE.WIN[id].length >= 4 && ids.every(f => f === id || (VOICE.WIN_VS[id] && typeof VOICE.WIN_VS[id][f] === 'string' && VOICE.WIN_VS[id][f].length > 0)));
    const all = VOICE.lines(), extra = '":';
    out.count = all.length; out.badGlyph = [];
    for (const s of all.concat([extra])) for (const ch of s) if (ch !== ' ' && !GLYPHS[ch]) out.badGlyph.push(ch);
    out.ascii = all.every(s => /^[\\x20-\\x7e]+$/.test(s));
    const BAN = [['mortal', ' kombat'], ['fatal', 'ity'], ['finish', ' him'], ['flaw', 'less'], ['get over', ' here'], ['toast', 'y'], ['scorp', 'ion'], ['sub', '-zero'], ['rai', 'den'],
      ['hado', 'uken'], ['shory', 'uken'], ['street', ' fighter'], ['tek', 'ken'], ['baba', 'lity'], ['bruta', 'lity'], ['pot', 'ato']].map(p => p.join('').toUpperCase());
    out.banned = all.concat(all.map(s => VOICE.spoken(s).toUpperCase())).filter(s => BAN.some(b => s.includes(b)));
    out.boxX = VOICE.C.BOX_X; out.boxY = VOICE.C.BOX_Y;
    out.calls = Object.keys(VOICE.CALLS).map(k => VOICE.CALLS[k].title).join('|');
    out.spoken = VOICE.spoken('Poteto says LGTM... GG');
    return out;
  })()`);
  check(d.pairs === 15 && d.bad.length === 0, 'banter covers all 15 pairings (mirrors too), either order picks the same exchange and the opener side matches its fighter: ' + JSON.stringify(d.bad.slice(0, 4)));
  check(d.rows >= 1 && d.rows <= 2, 'every banter line fits a VS bubble in at most 2 rows of ' + 34 + ' columns: ' + d.rows);
  check(d.win && d.winBad.length === 0 && d.sp > 0 && d.gen > 0, 'every fighter has general win quotes and a line for each opponent, and both kinds come up: ' + JSON.stringify([d.sp, d.gen, d.winBad.slice(0, 3)]));
  check(d.boxY >= 180 && d.boxY + (d.quoteRows + 1) * 20 + 16 <= 468 && d.boxX + d.quoteWide + 28 + 12 <= 330,
    'every win quote fits the end-screen bubble below the title lines and notes and left of the winner sprite: ' + JSON.stringify([d.quoteRows, d.quoteWide, d.boxX, d.boxY]));
  check(d.count > 100 && d.ascii && d.badGlyph.length === 0, 'every caption is ASCII and drawable in the pixel font: ' + JSON.stringify([d.count, d.badGlyph.slice(0, 6)]));
  check(d.banned.length === 0, 'no caption or spoken line uses a banned phrase: ' + JSON.stringify(d.banned.slice(0, 3)));
  check(d.calls === 'FIRST HIT|COUNTER|COMEBACK|LAST SECOND', 'the four announcer callouts are FIRST HIT, COUNTER, COMEBACK and LAST SECOND: ' + d.calls);
  check(d.spoken === 'Poh-tay-toe says L G T M,  G G', 'spoken text fixes the pronunciation of names and acronyms: ' + JSON.stringify(d.spoken));

  // ---- VS screen: the opener bubble, then the reply bubble, and the opener spoken before the arena call ----
  const vs = await ev(`(() => {
    const out = {}; V.start(0, 1); const f = game.f, st = VOICE.state();
    out.phase = game.phase; out.ids = [f[0].d.id, f[1].d.id]; out.vs = st.vs; out.queue = st.queue;
    const bt = VOICE.banterFor(out.ids[0], out.ids[1], st.n);
    out.match = !!bt && !!st.vs && st.vs[0].text === bt.opener.text && st.vs[1].text === bt.reply.text && st.vs[0].side === bt.opener.side && st.vs[0].at === VOICE.C.VS_A && st.vs[1].at === VOICE.C.VS_B;
    out.d0 = V.drawn();
    step(VOICE.C.VS_A + 4); out.t1 = game.phaseT; out.d1 = V.drawn();
    step(VOICE.C.VS_B + 6 - game.phaseT); out.t2 = game.phaseT; out.d2 = V.drawn();
    V.until(() => game.phase !== 'vs', 400); out.after = game.phase;
    out.voiced = V.voiced(); out.arena = V.said.filter(s => s.k === 'arena').map(s => s.T);
    out.est = out.vs ? out.vs.map(L => VOICE.est(VOICE.spoken(L.text), VOICE.VOICES[L.id][1])) : [];
    return out;
  })()`);
  const has = (arr, row) => Array.isArray(arr) && arr.includes(row);
  check(vs.phase === 'vs' && vs.match && vs.queue.length === 2, 'match:start builds the VS exchange for this pairing and queues both lines: ' + JSON.stringify(vs.ids));
  if (vs.vs && vs.vs.length === 2) {
    const r0 = vs.vs[0].rows[0], r1 = vs.vs[1].rows[0];
    check(!has(vs.d0, r0) && !has(vs.d0, r1), 'no banter caption before VS tick ' + 4);
    check(has(vs.d1, r0) && !has(vs.d1, r1), 'the opener caption shows from VS tick 4, the reply not yet (tick ' + vs.t1 + ')');
    check(has(vs.d2, r0) && has(vs.d2, r1), 'the reply caption shows from VS tick 56 (tick ' + vs.t2 + ')');
    const op = vs.voiced.find(v => v.k === 'voice.' + vs.vs[0].id && v.a === vs.vs[0].text && v.ph === 'vs');
    const arenaT = vs.arena[0];
    check(op && typeof arenaT === 'number' && op.T < arenaT, 'the opener is spoken in its own voice during VS, before the engine names the arena: ' + JSON.stringify([op && op.T, arenaT]));
    const rep = vs.voiced.find(v => v.a === vs.vs[1].text);
    check(!rep || rep.T + vs.est[1] <= vs.queue[1].fin, 'the reply is spoken only when it ends before the arena call (otherwise it stays a caption): ' + JSON.stringify([rep && rep.T, vs.est[1], vs.queue[1].fin]));
    check(vs.voiced.filter(v => v.ph === 'vs').every(v => v.T < arenaT), 'no voice line starts in VS after the arena call');
  }
  check(vs.after === 'intro', 'the VS screen still hands over to the round intro: ' + vs.after);

  // ---- callouts: FIRST HIT, COUNTER (with a cooldown), not in training, spoken after the engine's FIGHT call ----
  const c1 = await ev(`(() => {
    const [a, b] = V.fresh(0, 1), out = {}; V.place();
    const mode0 = game.modeId; game.modeId = 'training'; b.takeHit(a, 4, 3, 10, 'punch', {}); out.training = VOICE.state().calls.length; out.trainingFirst = VOICE.state().first; game.modeId = mode0;
    step(20); V.place(); b.takeHit(a, 4, 3, 10, 'punch', {}); let st = VOICE.state(); out.first = st.calls.map(c => c.kind + c.side); out.firstFlag = st.first;
    out.d1 = V.drawn();
    step(20); V.place(); a.takeHit(b, 4, 3, 10, 'punch', {}); out.second = VOICE.state().calls.map(c => c.kind + c.side);
    step(20); V.place(); b.set('kick'); b.takeHit(a, 4, 3, 10, 'punch', {}); st = VOICE.state(); out.counter = st.calls.map(c => c.kind + c.side); out.counts1 = st.counts.counter;
    out.d2 = V.drawn();
    step(5); V.place(); b.set('kick'); b.takeHit(a, 4, 3, 10, 'punch', {}); out.counts2 = VOICE.state().counts.counter;
    step(5); V.place(); b.set('idle'); b.takeHit(a, 4, 3, 10, 'punch', {}); out.counts3 = VOICE.state().counts.counter;
    V.until(() => V.voiced().filter(v => v.k === 'voice.call').length >= 2, 400);
    out.calls = V.voiced().filter(v => v.k === 'voice.call').map(v => ({ a: v.a, T: v.T }));
    out.fight = V.said.filter(s => s.k === 'fight').map(s => s.T);
    out.est = out.calls.map(c => VOICE.est(VOICE.spoken(c.a), VOICE.VOICES.call[1]));
    out.C = { first: VOICE.CALLS.first, counter: VOICE.CALLS.counter };
    out.age = V.until(() => VOICE.state().calls.length === 0 || game.phase !== 'fight', 400);
    return out;
  })()`);
  check(c1.training === 0 && c1.trainingFirst === false, 'no callouts in training mode');
  check(c1.first.join() === 'first0' && c1.firstFlag, 'the first clean hit of the round calls FIRST HIT for the attacker: ' + c1.first.join());
  check(has(c1.d1, c1.C.first.title) && c1.C.first.quips.some(q => has(c1.d1, q)), 'the FIRST HIT caption and its flavour line are drawn');
  check(c1.second.join() === 'first0', 'a later hit in the same round is not another FIRST HIT: ' + c1.second.join());
  check(c1.counter.join() === 'first0,counter0' && c1.counts1 === 1, 'hitting a fighter in the middle of an attack calls COUNTER: ' + c1.counter.join());
  check(has(c1.d2, c1.C.counter.title), 'the COUNTER caption is drawn');
  check(c1.counts2 === 1 && c1.counts3 === 1, 'a second counter inside the cooldown and a plain hit call nothing: ' + JSON.stringify([c1.counts2, c1.counts3]));
  check(c1.calls.length >= 2 && c1.calls[0].a === c1.C.first.say && c1.calls[1].a === c1.C.counter.say, 'the announcer voice says both callouts in order: ' + JSON.stringify(c1.calls.map(c => c.a)));
  if (c1.calls.length >= 2 && c1.fight.length) {
    check(c1.calls[0].T >= c1.fight[c1.fight.length - 1] + 30, 'a callout waits for the engine FIGHT call to finish: ' + JSON.stringify([c1.fight, c1.calls[0].T]));
    check(c1.calls[1].T >= c1.calls[0].T + c1.est[0], 'the second callout waits for the first to finish: ' + JSON.stringify([c1.calls.map(c => c.T), c1.est[0]]));
  }
  check(c1.age > 0 && c1.age < 200, 'callout captions leave by themselves after about 2 seconds: ' + c1.age);

  // ---- COMEBACK and LAST SECOND at the KO; nothing when the win was clean or the clock is infinite ----
  const c2 = await ev(`(() => {
    const out = {};
    let [a, b] = V.fresh(2, 3); V.place(); a.hp = Math.round(a.d.hp * 0.3); step(2); out.gap = VOICE.state().gap;
    b.hp = 1; game.timer = 2; game.koBy(a, b); let st = VOICE.state(); out.calls = st.calls.map(c => c.kind + c.side); out.phase = game.phase;
    out.d = V.drawn(); out.C = { last: VOICE.CALLS.last.title, comeback: VOICE.CALLS.comeback.title };
    [a, b] = V.fresh(2, 3); V.place(); step(2); b.hp = 1; game.timer = 40; game.koBy(a, b); out.clean = VOICE.state().calls.map(c => c.kind + c.side);
    SETTINGS.set('infTime', true); [a, b] = V.fresh(4, 0); V.place(); step(2); b.hp = 1; game.timer = 2; game.koBy(b, a); out.inf = VOICE.state().calls.map(c => c.kind + c.side);
    SETTINGS.set('infTime', V.inf0);
    return out;
  })()`);
  check(c2.gap[0] >= 0.69 && c2.gap[1] === 0, 'the comeback gap tracks how far each side fell behind: ' + JSON.stringify(c2.gap));
  check(c2.calls.join() === 'last0,comeback0', 'a KO with under 3 seconds left calls LAST SECOND, and winning from far behind calls COMEBACK: ' + c2.calls.join());
  check(has(c2.d, c2.C.last) && has(c2.d, c2.C.comeback), 'both callout captions are drawn during the KO');
  check(c2.clean.length === 0, 'a clean KO with time left calls neither: ' + c2.clean.join());
  check(c2.inf.length === 0, 'LAST SECOND is skipped with the infinite clock: ' + c2.inf.join());

  // ---- match end: the win quote on the winner call and on the end screen, spoken after the engine's call ----
  const q = await ev(`(() => {
    const need = typeof roundsToWin === 'function' ? roundsToWin() : 2;
    const [a, b] = V.fresh(1, 4, [need - 1, 0]), out = { ids: [a.d.id, b.d.id] }; V.place(); V.said.length = 0;
    b.hp = 1; game.koBy(a, b);
    out.n = V.until(() => game.phase === 'outro', 4000);
    const st = VOICE.state(); out.quote = st.quote; out.expect = VOICE.winQuote(a.d.id, b.d.id, st.n);
    step(VOICE.C.QUOTE_AT + 2); out.d1 = V.drawn(); out.name = SHORT(a.d) + ':';
    V.until(() => V.voiced().some(v => v.k === 'voice.' + a.d.id) || game.phase === 'over', 400);
    out.voiced = V.voiced().filter(v => v.k === 'voice.' + a.d.id); out.wins = V.said.filter(s => s.k === 'wins').map(s => s.T);
    V.until(() => game.phase === 'over', 400); out.ph2 = game.phase; out.mode = game.modeId; out.d2 = V.drawn();
    return out;
  })()`);
  check(q.n < 4000 && q.quote && q.quote.id === q.ids[0] && q.quote.side === 0 && q.quote.text === q.expect, 'match:end picks the winner quote for this matchup: ' + JSON.stringify(q.quote && q.quote.text));
  if (q.quote) {
    check(has(q.d1, q.name) && q.quote.sub.every(r => has(q.d1, r)), 'the quote is captioned under the winner call');
    check(q.voiced.length === 1 && q.voiced[0].a === q.quote.text && (q.voiced[0].ph === 'outro' || q.voiced[0].ph === 'over'), 'the winner says the quote once in their own voice: ' + JSON.stringify(q.voiced.map(v => v.ph)));
    check(q.voiced.length && q.wins.length && q.voiced[0].T >= q.wins[0] + 30, 'the quote waits for the engine winner call: ' + JSON.stringify([q.wins, q.voiced[0] && q.voiced[0].T]));
    check(q.ph2 === 'over' && q.mode === 'versus2' && q.quote.box.every(r => has(q.d2, r)), 'the end screen shows the quote box in versus: ' + q.ph2);
  }

  // ---- voice.speech off: captions stay, voice lines stop, the engine announcer is untouched ----
  const off = await ev(`(() => {
    const out = {}; SETTINGS.set('voice.speech', false); out.val = SETTINGS.get('voice.speech'); out.label = HOOKS.collect('pauseItems').find(x => x && x.id === 'voice').label;
    V.start(0, 2); let st = VOICE.state(); out.queue = st.queue.length; out.vs = st.vs ? st.vs.map(L => L.rows[0]) : [];
    step(70); out.d = V.drawn();
    V.until(() => game.phase === 'fight', 900); step(1); const [a, b] = V.place(); b.takeHit(a, 4, 3, 10, 'punch', {}); out.calls = VOICE.state().calls.length;
    step(150); out.voiced = V.voiced().length; out.engine = V.said.filter(s => s.k.slice(0, 6) !== 'voice.').map(s => s.k);
    return out;
  })()`);
  check(off.val === false && off.label === 'N VOICE LINES OFF', 'voice.speech can be turned off and the pause label follows');
  check(off.queue === 0 && off.voiced === 0, 'with voice.speech off nothing is queued or spoken: ' + JSON.stringify([off.queue, off.voiced]));
  check(off.vs.length === 2 && off.vs.every(r => has(off.d, r)) && off.calls === 1, 'captions stay on with the voice off (VS bubbles and callouts)');
  check(off.engine.includes('arena') && off.engine.includes('fight'), 'the engine announcer still speaks: ' + off.engine.join());

  // ---- turning it off mid-line cuts our line only; the pause item toggles; the clock stops in pause ----
  const cut = await ev(`(() => {
    const out = {}; SETTINGS.set('voice.speech', true); V.start(3, 4); V.until(() => V.voiced().length > 0, 60);
    let st = VOICE.state(); out.spoke = V.voiced().length; out.playing = st.mineUntil > st.T; out.q = st.queue.length; const s0 = V.stops;
    SETTINGS.set('voice.speech', false); st = VOICE.state(); out.stopped = V.stops - s0; out.q2 = st.queue.length; out.mine = st.mineUntil;
    SETTINGS.set('voice.speech', true);
    V.fresh(0, 1); const prev = game.phase, T0 = VOICE.state().T, s1 = V.stops;
    game.phase = 'pause'; pressed.KeyN = true; step(1); out.p1 = SETTINGS.get('voice.speech');
    pressed.KeyN = true; step(1); out.p2 = SETTINGS.get('voice.speech'); out.pauseT = VOICE.state().T - T0; out.pd = V.drawn().length;
    game.phase = prev; out.stops2 = V.stops - s1;
    out.toggle = [VOICE.toggle(false), SETTINGS.get('voice.speech'), VOICE.toggle(true), SETTINGS.get('voice.speech')];
    return out;
  })()`);
  check(cut.spoke >= 1 && cut.playing && cut.q >= 1, 'a VS line is playing with the reply still queued: ' + JSON.stringify([cut.spoke, cut.playing, cut.q]));
  check(cut.stopped === 1 && cut.q2 === 0 && cut.mine === 0, 'turning voice.speech off mid-line stops our line and clears the queue: ' + JSON.stringify([cut.stopped, cut.q2, cut.mine]));
  check(cut.p1 === false && cut.p2 === true && cut.stops2 === 0, 'N in the pause menu toggles voice.speech off and on again: ' + JSON.stringify([cut.p1, cut.p2]));
  check(cut.pauseT === 0, 'the voice clock stops while the game is paused: ' + cut.pauseT);
  check(cut.toggle.join() === 'false,false,true,true', 'VOICE.toggle sets the setting and reports it: ' + cut.toggle.join());

  // ---- leave the page as we found it ----
  await ev(`(() => { ANNOUNCER.say = V.say0; ANNOUNCER.stop = V.stop0; SETTINGS.set('voice.speech', V.speech0 !== false); SETTINGS.set('infTime', !!V.inf0); })()`);
}
