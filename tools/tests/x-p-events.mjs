// Tests for p-events.js (seasonal events: Halloween, winter lights, New Year confetti, April 1 silly announcer). Owner: the p-events agent. Runs after core.mjs.
// Everything is pinned: the date comes from EVENTS.setDate (the suite runs on the real date, which may sit inside a window), the mode from events.mode, and time from hold(true) + step(n).
// Hooks used by p-events.js: update, drawWorld, drawTop, pauseItems. Setting: events.mode. Wraps: drawArena, drawArenaFront, ANNOUNCER.say, speechSynthesis.speak.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open('#demo=0,1&stop');
  await ev(`(() => {
    hold(true);
    window.E = {};
    E.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    E.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    E.fresh = (i, j) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); E.until(() => game.phase === 'fight', 900);
      const [a, b] = game.f; a.cpu = b.cpu = false; step(1); return [a, b];
    };
    E.sum = () => { render(); const d = ctx.getImageData(0, 0, 960, 540).data; let s = 0; for (let k = 0; k < d.length; k += 97) s = (s * 31 + d[k]) | 0; return s; };
    E.mode = (m, md) => { SETTINGS.set('events.mode', m); EVENTS.setDate(md ? md[0] : null, md ? md[1] : null); EVENTS.clear(); };
    // a whole CPU vs CPU round with a fixed Math.random: the state at the end must not depend on the event mode
    E.sig = (mode, md) => {
      const rand = Math.random; let seed = 12345;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      try {
        E.mode(mode, md);
        dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
        game.mode = 2; game.sel = [0, 1]; game.arenaPick = 0; startMatch(); game.f[0].cpu = game.f[1].cpu = true;
        let n = 0, koAt = -1;
        while (n < 7000) {
          step(1); n++; if (n % 20 === 0) render();
          if (koAt < 0 && game.phase !== 'vs' && game.phase !== 'intro' && game.phase !== 'fight') koAt = n;
          if (koAt >= 0 && n - koAt > 150) break;
        }
        return JSON.stringify([n, koAt, game.phase, game.round, game.wins, game.timer, game.f.map(f => [Math.round(f.x * 100), Math.round(f.y * 100), f.hp, f.state, f.meter | 0])]);
      } finally { Math.random = rand; }
    };
    E.oldMuted = muted; E.oldFlash = SETTINGS.get('reduceFlash');
  })()`);

  // ---- structure, settings, pause key ----
  const s0 = await ev(`(() => {
    SETTINGS.reset('events.mode'); EVENTS.setDate(null);
    const item = HOOKS.collect('pauseItems').find(i => i.id === 'events');
    return { marker: window.STUB_P_EVENTS === 1, api: ['activeOn', 'active', 'has', 'setMode', 'cycle', 'silly', 'setDate', 'burst', 'clear', 'state'].every(k => typeof EVENTS[k] === 'function'),
      hooks: ['update', 'drawWorld', 'drawTop'].every(h => HOOKS.has(h)), item: item ? [item.key, item.label] : null, def: SETTINGS.get('events.mode'),
      modes: EVENTS.modes.join(), ids: EVENTS.ids.join(), tags: EVENTS.ids.map(id => EVENTS.windows[id].tag) };
  })()`);
  check(s0.marker && s0.api && s0.hooks, 'EVENTS is loaded and uses the update, drawWorld and drawTop hooks');
  check(s0.def === 'auto' && s0.modes === 'auto,off,halloween,winter,newyear,april' && s0.ids === 'halloween,winter,newyear,april', 'events.mode defaults to auto and offers off plus the four events: ' + s0.modes);
  check(s0.item && s0.item[0] === 'KeyE' && s0.item[1] === 'E EVENTS AUTO', 'the pause screen gets an E EVENTS item: ' + JSON.stringify(s0.item));
  check(s0.tags.every(x => /^[A-Z0-9 ]+$/.test(x)), 'event titles are capitals and ASCII only: ' + s0.tags.join(' | '));

  // ---- calendar windows, edge to edge (local date, month and day only) ----
  const cal = await ev(`(() => {
    const rows = [[10,19],[10,20],[10,31],[11,2],[11,3],[12,14],[12,15],[12,29],[12,30],[12,31],[1,1],[1,2],[1,3],[1,6],[1,7],[2,29],[3,31],[4,1],[4,2],[7,15]];
    return rows.map(([m, d]) => m + '/' + d + '=' + EVENTS.activeOn(m, d).join('+'));
  })()`);
  const want = ['10/19=', '10/20=halloween', '10/31=halloween', '11/2=halloween', '11/3=', '12/14=', '12/15=winter', '12/29=winter', '12/30=winter+newyear', '12/31=winter+newyear', '1/1=winter+newyear', '1/2=winter+newyear', '1/3=winter', '1/6=winter', '1/7=', '2/29=', '3/31=', '4/1=april', '4/2=', '7/15='];
  check(JSON.stringify(cal) === JSON.stringify(want), 'windows: Halloween 20 Oct - 2 Nov, winter 15 Dec - 6 Jan, New Year 30 Dec - 2 Jan, April 1 only' + (JSON.stringify(cal) === JSON.stringify(want) ? '' : ': ' + cal.join(' ')));

  // ---- mode resolution ----
  const m = await ev(`(() => {
    const o = {};
    SETTINGS.set('events.mode', 'auto');
    EVENTS.setDate(10, 31); o.autoHal = EVENTS.active().join(); o.hasHal = EVENTS.has('halloween') && !EVENTS.has('winter');
    EVENTS.setDate(7, 15); o.autoSummer = EVENTS.active().join();
    EVENTS.setDate(12, 31); o.autoNye = EVENTS.active().join();
    EVENTS.setMode('off'); EVENTS.setDate(10, 31); o.off = EVENTS.active().join(); o.offHas = EVENTS.has('halloween');
    EVENTS.setMode('winter'); EVENTS.setDate(7, 15); o.forced = EVENTS.active().join(); o.forcedSaved = SETTINGS.get('events.mode');
    EVENTS.setMode('april'); o.forcedApril = EVENTS.active().join();
    o.bogus = EVENTS.setMode('bogus'); o.bogusMode = EVENTS.mode(); o.bogusSaved = SETTINGS.get('events.mode');
    EVENTS.setMode('auto'); EVENTS.setDate(null); const d = new Date(); o.real = EVENTS.active().join() === EVENTS.activeOn(d.getMonth() + 1, d.getDate()).join();
    SETTINGS.set('events.mode', 'off'); o.viaSettings = EVENTS.active().length;   // changing the setting directly is picked up at once
    SETTINGS.set('events.mode', 'auto');
    const seq = []; for (let i = 0; i < 6; i++) seq.push(EVENTS.cycle()); o.cycle = seq.join();
    return o;
  })()`);
  check(m.autoHal === 'halloween' && m.hasHal && m.autoSummer === '' && m.autoNye === 'winter,newyear', 'auto follows the date: ' + [m.autoHal, m.autoSummer || 'none', m.autoNye].join(' / '));
  check(m.off === '' && !m.offHas, 'off disables every event, whatever the date');
  check(m.forced === 'winter' && m.forcedSaved === 'winter' && m.forcedApril === 'april', 'a forced mode ignores the date and is saved in events.mode');
  check(m.bogusMode === 'april' && m.bogusSaved === 'april', 'an unknown mode is ignored: ' + m.bogus);
  check(m.real, 'with no pinned date the events follow the real local date');
  check(m.viaSettings === 0, 'changing events.mode through SETTINGS takes effect without waiting');
  check(m.cycle === 'off,halloween,winter,newyear,april,auto', 'cycle steps through every mode and wraps: ' + m.cycle);

  // ---- the pause key E ----
  const p = await ev(`(() => {
    const [a] = E.fresh(0, 1); E.mode('auto', [7, 15]); const o = {};
    game.phase = 'pause'; const c0 = EVENTS.state().clock; step(5); o.frozen = EVENTS.state().clock === c0;
    E.T('KeyE'); step(1); o.after = EVENTS.mode(); o.label = HOOKS.collect('pauseItems').find(i => i.id === 'events').label;
    E.T('KeyE'); step(1); o.second = EVENTS.mode();
    game.phase = 'fight'; const c1 = EVENTS.state().clock; step(5); o.runs = EVENTS.state().clock - c1;
    EVENTS.setMode('auto'); return o;
  })()`);
  check(p.after === 'off' && p.label === 'E EVENTS OFF' && p.second === 'halloween', 'E in the pause screen cycles the mode and the label follows: ' + JSON.stringify([p.after, p.label, p.second]));
  check(p.frozen && p.runs === 5, 'event animation stands still in pause and runs again after');

  // ---- draw-only: the same CPU vs CPU round ends in the same state under every mode ----
  await ev(`E.sig('off', [7, 15])`);   // warm-up: the first round after the earlier checks starts from leftover engine state
  const base = await ev(`E.sig('off', [7, 15])`), again = await ev(`E.sig('off', [7, 15])`);
  check(base === again && JSON.parse(base)[1] > 0, 'baseline: the seeded CPU vs CPU round is repeatable and reaches its KO: ' + base.slice(0, 90));
  for (const [mode, md] of [['halloween', [10, 31]], ['winter', [12, 20]], ['newyear', [12, 31]], ['april', [4, 1]], ['auto', [12, 31]]]) {
    const s = await ev(`E.sig('${mode}', [${md}])`);
    check(s === base, mode + (mode === 'auto' ? ' (auto, 31 Dec)' : '') + ' changes only the drawing, the simulation ends in the same state' + (s === base ? '' : ': ' + s.slice(0, 120) + ' vs ' + base.slice(0, 120)));
  }

  // ---- the drawing: arenas change under Halloween and winter, not under the other two until something happens ----
  const d = await ev(`(() => {
    E.fresh(0, 1); const o = {};
    E.mode('off', [7, 15]); o.off = E.sum(); o.off2 = E.sum();
    E.mode('halloween'); o.hal = E.sum(); o.hal2 = E.sum();
    E.mode('winter'); o.win = E.sum();
    E.mode('newyear'); o.ny = E.sum();
    E.mode('april'); o.apr = E.sum();
    E.mode('auto', [7, 15]); o.autoSummer = E.sum();
    E.mode('auto', [10, 31]); o.autoHal = E.sum();
    return o;
  })()`);
  check(d.off === d.off2 && d.hal === d.hal2, 'rendering one tick twice gives the same picture (the decoration is a pure function of the tick)');
  check(d.hal !== d.off && d.win !== d.off && d.hal !== d.win, 'Halloween and winter repaint the arena, each in its own way');
  check(d.ny !== d.off && d.ny !== d.hal && d.ny !== d.win, 'New Year puts fireworks in the sky');
  check(d.apr === d.off, 'April 1 draws nothing until the announcer speaks');
  check(d.autoSummer === d.off && d.autoHal === d.hal, 'auto on a summer day draws nothing, on 31 Oct it draws Halloween');

  // ---- title screen: a tag top left, decoration without props ----
  const ti = await ev(`(() => {
    E.fresh(0, 1); const o = {}; setPhase('title');
    E.mode('off', [7, 15]); o.off = E.sum(); E.mode('winter'); o.win = E.sum(); E.mode('halloween'); o.hal = E.sum();
    E.mode('off', [7, 15]); o.off2 = E.sum();
    return o;
  })()`);
  check(ti.win !== ti.off && ti.hal !== ti.off && ti.off === ti.off2, 'the title screen shows the season (tag and decoration) and is back to normal with events off');
  // the tag sits under the OKRS corner button (y 12 to 42), and stays away while a feature screen (here the ARCADE select) is over the title
  const tg = await ev(`(() => {
    E.fresh(0, 1); setPhase('title'); E.mode('halloween'); const log = [], p0 = window.ptext, out = {};
    window.ptext = function (c, str, x, y) { if (String(str).includes('SPOOKY')) log.push([x, y]); return p0.apply(this, arguments); };
    try { render(); out.plain = log.slice(); log.length = 0; MODES.get('arcade').onPick(); step(1); render(); out.arcade = log.slice(); ARCADE.S.screen = null; } finally { window.ptext = p0; }
    return out;
  })()`);
  check(tg.plain.length === 1 && tg.plain[0][1] >= 46 && tg.arcade.length === 0, 'the season tag is drawn below the OKRS corner button on the plain title and not over a feature screen: ' + JSON.stringify(tg));

  // ---- New Year confetti on a KO ----
  const c = await ev(`(() => {
    const o = {}, ko = (mode, md) => { const [a, b] = E.fresh(0, 1); E.mode(mode, md); o['pre' + mode] = EVENTS.state().confetti; const pre = E.sum(); game.koBy(a, b); const st = EVENTS.state().confetti; step(3); const post = E.sum(); return { st, pre, post }; };
    const hal = ko('halloween', [10, 31]); o.halConf = hal.st;
    const ny = ko('newyear'); o.nyConf = ny.st; o.nyDrawn = ny.pre !== ny.post;
    step(40); o.nyAlive = EVENTS.state().confetti; o.nyRain = EVENTS.state().rain;
    step(900); o.nyGone = EVENTS.state().confetti;
    const auto = ko('auto', [12, 31]); o.autoConf = auto.st;
    const sum = ko('auto', [7, 15]); o.summerConf = sum.st;
    SETTINGS.set('reduceFlash', true); const soft = ko('newyear'); o.softConf = soft.st; SETTINGS.set('reduceFlash', E.oldFlash);
    const [a, b] = E.fresh(0, 1); EVENTS.clear(); EVENTS.burst(480, 200, 500); o.cap = EVENTS.state().confetti;
    E.fresh(0, 1); o.reset = EVENTS.state().confetti;
    return o;
  })()`);
  check(c.halConf === 0 && c.summerConf === 0, 'no confetti on a KO outside New Year');
  check(c.nyConf === 130 && c.autoConf === 130 && c.nyDrawn, 'a KO during New Year bursts 130 confetti pieces at the fighters, and they are drawn: ' + c.nyConf);
  check(c.nyAlive > 0 && c.nyRain > 0 && c.nyGone === 0, 'the confetti keeps falling for a while, with a short rain from the top, then is gone');
  check(c.softConf === 70, 'reduce flash gives a softer burst: ' + c.softConf);
  check(c.cap === 300 && c.reset === 0, 'the confetti count is capped at 300 and a new match clears it: ' + [c.cap, c.reset]);

  // ---- April 1: the silly announcer ----
  const si = await ev(`(() => {
    const o = { missing: [], bad: [], n: 0 };
    for (const key of ANNOUNCER.phrases) if (!key.startsWith('voice.')) for (let n = 0; n < 4; n++) {   // voice.* keys belong to p-voice: they carry free text, not a fixed phrase
      const r = EVENTS.silly(key, 'Tibo', n); o.n++;
      if (!r) { o.missing.push(key); continue; }
      if (!/^[A-Z0-9 .,!?'-]+$/.test(r.caption) || !r.spoken || /[^\\x20-\\x7e]/.test(r.spoken)) o.bad.push(key + ':' + r.caption + '|' + r.spoken);
    }
    o.none = EVENTS.silly('nonsense', 'x') === null;
    o.wins = EVENTS.silly('wins', 'Tibo', 0).caption;
    return o;
  })()`);
  check(si.missing.length === 0 && si.bad.length === 0 && si.n >= 30, 'every announcer phrase has silly lines, in capitals and plain ASCII: ' + JSON.stringify([si.missing, si.bad]));
  check(si.none && /TIBO/.test(si.wins), 'an unknown phrase has no silly line, and the fighter name is kept: ' + si.wins);

  const an = await ev(`(() => {
    const [a, b] = E.fresh(0, 1), o = {}; muted = false;
    E.mode('off', [7, 15]); const w00 = EVENTS.state().whistles; o.offSay = ANNOUNCER.say('select'); o.offCap = EVENTS.state().caption; o.offWh = EVENTS.state().whistles - w00;
    E.mode('halloween', [10, 31]); o.halSay = ANNOUNCER.say('choose'); o.halCap = EVENTS.state().caption;
    E.mode('auto', [4, 1]); const w0 = EVENTS.state().whistles;
    o.aprSay = ANNOUNCER.say('fight'); const s = EVENTS.state(); o.aprCap = s.caption; o.aprWh = s.whistles - w0; o.n = s.sillyN;
    o.dup = ANNOUNCER.say('fight'); o.dupWh = EVENTS.state().whistles - w0;
    step(14); const shown = E.sum(); EVENTS.clear(); const cleared = E.sum(); o.drawn = shown !== cleared;
    ANNOUNCER.say('wins', 'TIBO'); o.winsCap = EVENTS.state().caption;
    step(200); o.gone = EVENTS.state().caption;
    EVENTS.clear(); muted = true; const w1 = EVENTS.state().whistles; o.mutedSay = ANNOUNCER.say('finish'); o.mutedCap = EVENTS.state().caption; o.mutedWh = EVENTS.state().whistles - w1; muted = E.oldMuted;
    EVENTS.setDate(null); EVENTS.setMode('auto'); EVENTS.clear();
    return o;
  })()`);
  check(an.offCap == null && an.offWh === 0 && an.halCap == null, 'off and Halloween leave the announcer alone: no caption, no whistle');
  check(an.aprSay && /^FIGHT/.test(an.aprCap) && an.aprWh === 1 && an.n >= 1, 'on April 1 a line from the announcer shows a silly caption and a slide whistle: ' + an.aprCap);
  check(!an.dup && an.dupWh === 1, 'a line the announcer drops as a duplicate gets no second whistle');
  check(an.drawn, 'the April caption is drawn on screen once it has faded in');
  check(/TIBO/.test(an.winsCap || '') && an.gone == null, 'the winner line carries the name and the caption fades out by itself: ' + an.winsCap);
  check(!an.mutedSay && an.mutedCap == null && an.mutedWh === 0, 'a muted game stays silent: no caption, no whistle');

  // speech: the spoken text is swapped for the silly version on April 1 only (needs the browser speech engine)
  const hasSpeech = await ev(`typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' && typeof speechSynthesis.speak === 'function'`);
  if (hasSpeech) {
    await ev(`(() => { muted = false; E.mode('auto', [4, 1]); ANNOUNCER.say('arena', 'Test Arena'); })()`);
    await t.wait(160);
    const sp = await ev(`EVENTS.state().lastSpeech`);
    check(sp && /test arena/i.test(sp.text) && /floor|step/i.test(sp.text) && Math.abs(sp.pitch - 1.65) < 0.01 && Math.abs(sp.rate - 1.12) < 0.01, 'on April 1 the spoken line is the silly one, higher and quicker: ' + JSON.stringify(sp));
    await ev(`(() => { E.mode('off', [7, 15]); ANNOUNCER.say('round', 9); })()`);
    await t.wait(160);
    const sp2 = await ev(`EVENTS.state().lastSpeech`);
    check(JSON.stringify(sp2) === JSON.stringify(sp), 'with events off the spoken line is left alone');
  } else check(true, 'speech engine absent here: spoken line check skipped');

  // ---- the URL hash: events=<mode> forces a mode for this visit only ----
  await ev(`(() => { SETTINGS.reset('events.mode'); EVENTS.setDate(null); muted = E.oldMuted; })()`);
  await t.open('#demo=0,1&stop&events=winter');
  const h1 = await ev(`(() => { EVENTS.setDate(7, 15); const o = { mode: EVENTS.mode(), active: EVENTS.active().join(), saved: SETTINGS.get('events.mode') }; o.cycled = EVENTS.cycle(); o.modeAfter = EVENTS.mode(); o.savedAfter = SETTINGS.get('events.mode'); SETTINGS.reset('events.mode'); return o; })()`);
  check(h1.mode === 'winter' && h1.active === 'winter' && h1.saved === 'auto', '#events=winter forces the winter lights without saving anything: ' + JSON.stringify(h1));
  check(h1.cycled === 'newyear' && h1.modeAfter === 'newyear' && h1.savedAfter === 'newyear', 'the first E press after a hash override cycles on from it and saves the new mode');
  await t.open('#demo=0,1&stop&events=bogus');
  check(await ev(`EVENTS.mode() === 'auto'`), '#events= with an unknown mode is ignored');

  // ---- the mode survives a reload ----
  await ev(`EVENTS.setMode('halloween')`);
  await t.open('#demo=0,1&stop');
  const keep = await ev(`({ mode: EVENTS.mode(), saved: SETTINGS.get('events.mode') })`);
  check(keep.mode === 'halloween' && keep.saved === 'halloween', 'the chosen mode is remembered after a reload: ' + JSON.stringify(keep));
  await ev(`(() => { SETTINGS.reset('events.mode'); EVENTS.setDate(null); })()`);
}
