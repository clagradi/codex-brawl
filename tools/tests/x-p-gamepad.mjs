// Tests for p-gamepad.js (rumble, button glyphs on the menus, per-pad remapping, hot-plug toast). Owner: the p-gamepad agent. Runs after core.mjs.
// A fake navigator.getGamepads() feeds pad objects (with a recording vibrationActuator), everything is driven with hold(true) and step(n), so the checks are deterministic.
// Hooks used by p-gamepad.js: pad (added to game.js), menuHint (added to game.js), update, drawTop, titleItems, pauseItems. Settings: gamepad.rumble, gamepad.hints, gamepad.glyphs, gamepad.maps.
// Pixel checks count pixels of one exact glyph colour in a band of the canvas and compare the pad state with the keyboard state (the engine never draws those colours there).
const SETUP = `(() => {
  hold(true);
  window.G = {};
  G.ID = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';
  G.PS = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  G.NS = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
  G.OLD = '0079-0011-USB Gamepad';
  G.acts = [0, 1, 2].map(() => ({ log: [], resets: 0, playEffect(type, q) { this.log.push(Object.assign({ type }, q)); return Promise.resolve('complete'); }, reset() { this.resets++; return Promise.resolve('complete'); } }));
  G.clear = () => G.acts.forEach(a => { a.log = []; a.resets = 0; });
  G.mk = (id, down, o) => {
    o = o || {}; const slot = o.slot || 0;
    const gp = { id, index: slot, connected: true, mapping: o.mapping === undefined ? 'standard' : o.mapping, axes: o.axes || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (down || []).includes(i), value: 0 })) };
    if (!o.noAct) gp.vibrationActuator = G.acts[slot];
    return gp;
  };
  G.pads = []; navigator.getGamepads = () => G.pads;
  G.idle = () => { G.pads = [G.mk(G.ID, [])]; step(1); };
  G.T = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
  G.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
  G.fresh = (i, j) => {
    dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
    game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); G.until(() => game.phase === 'fight', 900);
    const [a, b] = game.f; a.cpu = b.cpu = false; step(1); return [a, b];
  };
  G.place = dx => {
    const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
    for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; }
    f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o];
  };
  G.count = (y0, h, pick) => { const d = ctx.getImageData(0, y0, 960, Math.min(h, 540 - y0)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (pick(d[i], d[i + 1], d[i + 2])) n++; return n; };   // the picture carries a slight colour grade, so colours are matched by hue
  G.green = (y0, h) => G.count(y0, h, (r, g, b) => g > 150 && g - r > 55 && g - b > 90);   // the A glyph and the connect toast
  G.blue = (y0, h) => G.count(y0, h, (r, g, b) => b > 200 && b - r > 80 && b - g > 50);    // the PlayStation-style cross
  step(1);
})()`;

export async function run(t) {
  const { check } = t, ev = t.eval;
  const boot = async () => { await t.open('#demo=0,1&stop'); await ev(SETUP); };
  await boot();
  const ID = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';

  // ---- structure, settings, and the game with no pad connected ----
  const s0 = await ev(`(() => {
    const out = { api: typeof GAMEPAD === 'object' && ['open', 'close', 'rumble', 'assign', 'effective', 'hint', 'state', 'reset'].every(k => typeof GAMEPAD[k] === 'function'), marker: window.STUB_P_GAMEPAD === 1,
      hooks: ['pad', 'menuHint', 'update', 'drawTop', 'titleItems', 'pauseItems'].every(h => HOOKS.has(h)),
      def: ['gamepad.rumble', 'gamepad.hints', 'gamepad.glyphs', 'gamepad.maps'].map(k => SETTINGS.get(k)), keys: SETTINGS.list().map(d => d.key).filter(k => k.startsWith('gamepad.')) };
    out.badEnum = SETTINGS.set('gamepad.glyphs', 'nope'); G.pads = []; step(2);
    out.item = HOOKS.collect('titleItems').some(i => i && i.id === 'gamepad'); out.key = HOOKS.collect('pauseItems').some(i => i && i.key === 'KeyG');
    out.active = GAMEPAD.active(); out.st = GAMEPAD.state();
    return out;
  })()`);
  check(s0.api && s0.marker && s0.hooks, 'GAMEPAD is loaded and uses the pad, menuHint, update, drawTop, titleItems and pauseItems hooks');
  check(JSON.stringify(s0.def) === '[true,true,"auto",null]' && s0.keys.length === 4 && s0.badEnum === 'auto', 'settings: rumble and hints on, glyphs auto, no saved maps; a bad glyph set is refused: ' + JSON.stringify(s0.def));
  check(!s0.item && !s0.key && !s0.active && s0.st.n === 0 && s0.st.toasts.length === 0 && !s0.st.open, 'with no pad connected: no GAMEPAD title entry, no pause key, no hints, no toast');

  // ---- the pad filter: no map leaves the real pad alone, a map builds a virtual pad ----
  const f0 = await ev(`(() => {
    const gp = G.mk(G.ID, [0, 5]), out = { same: HOOKS.filter('pad', gp, 0) === gp, side2: HOOKS.filter('pad', gp, 2) === gp, bare: HOOKS.filter('pad', null, 0) === null };
    GAMEPAD.assign(G.ID, 'p', 7);
    const v = HOOKS.filter('pad', gp, 0); out.virt = v !== gp; out.v = [v.buttons[0].pressed, v.buttons[3].pressed, v.buttons[1].pressed];   // the virtual pad is reused per side: read it before asking again
    const w = HOOKS.filter('pad', G.mk(G.ID, [7]), 0); out.w = [w.buttons[0].pressed, w.buttons[3].pressed];
    out.other = HOOKS.filter('pad', G.mk(G.PS, [0]), 0).buttons[0].pressed === true;   // another controller id keeps its own layout
    GAMEPAD.reset(G.ID); out.back = HOOKS.filter('pad', gp, 0) === gp;
    return out;
  })()`);
  check(f0.same && f0.side2 && f0.bare, 'the pad filter hands back the very same pad when no map is saved (and for a third pad or nothing)');
  check(f0.virt && f0.v.join() === 'false,true,false' && f0.w.join() === 'true,false', 'a remapped pad is a virtual pad: the new button presses punch, the old one does not, the super keeps its default buttons: ' + f0.v + ' / ' + f0.w);
  check(f0.other && f0.back, 'a map belongs to one controller id only, and reset puts the real pad back');

  // ---- remapping drives the real fighters ----
  const mv = await ev(`(() => {
    const out = {}, [a] = G.fresh(0, 1);
    const run = pad => { G.place(400); const x0 = a.x; G.pads = [pad]; step(10); const dx = a.x - x0; G.idle(); step(2); return dx; };
    out.defRight = run(G.mk(G.ID, [15]));
    GAMEPAD.assign(G.ID, 'r', 6);
    out.oldRight = run(G.mk(G.ID, [15])); out.newRight = run(G.mk(G.ID, [6])); out.stick = run(G.mk(G.ID, [], { axes: [0.9, 0] }));
    GAMEPAD.reset(G.ID); out.back = run(G.mk(G.ID, [15]));
    return out;
  })()`);
  check(mv.defRight > 5 && Math.abs(mv.oldRight) < 1 && mv.newRight > 5 && mv.stick > 5 && mv.back > 5, 'remapping RIGHT to button 6: the d-pad right stops walking, button 6 walks, the stick still works, reset restores it: ' + JSON.stringify(mv));

  const pk = await ev(`(() => {
    const out = {}, [a] = G.fresh(0, 1);
    const press = btn => { G.idle(); G.place(60); G.pads = [G.mk(G.ID, btn)]; step(2); const s = a.state; G.idle(); return s; };
    out.def = [press([0]), press([1])];
    GAMEPAD.assign(G.ID, 'p', 7); out.moved = [press([7]), press([0])];
    GAMEPAD.reset(G.ID); GAMEPAD.assign(G.ID, 'k', 0); const e = GAMEPAD.effective(G.ID); out.swapped = [e.p.join(), e.k.join()]; out.swap = [press([0]), press([1])];
    GAMEPAD.reset(G.ID);
    return out;
  })()`);
  check(pk.def[0].startsWith('punch') && pk.def[1] === 'kick', 'default pad: A punches, B kicks: ' + pk.def);
  check(pk.moved[0].startsWith('punch') && pk.moved[1] === 'idle', 'PUNCH remapped to button 7: the new button punches and A does nothing: ' + pk.moved);
  check(pk.swapped.join('|') === '1|0' && pk.swap[0] === 'kick' && pk.swap[1].startsWith('punch'), 'binding a taken button swaps: KICK on A moves PUNCH to B, and the fighter follows: ' + JSON.stringify([pk.swapped, pk.swap]));

  const sp = await ev(`(() => {
    const out = {};
    const sup = btn => { const [a] = G.fresh(0, 1); G.idle(); G.place(100); a.meter = 100; G.pads = [G.mk(G.ID, btn)]; step(2); const s = a.state; G.idle(); return s; };
    out.def = [sup([5]), sup([3])];
    GAMEPAD.assign(G.ID, 'x', 6); out.moved = [sup([6]), sup([3]), sup([5])]; GAMEPAD.reset(G.ID);
    const [a] = G.fresh(0, 1); G.place(300); GAMEPAD.assign(G.ID, 'st', 6);
    G.pads = [G.mk(G.ID, [9])]; step(1); out.oldStart = game.phase; G.idle();
    G.pads = [G.mk(G.ID, [6])]; step(1); out.newStart = game.phase; G.idle(); GAMEPAD.reset(G.ID);
    return out;
  })()`);
  check(sp.def.join() === 'super,super', 'default pad: RB and Y both fire the super: ' + sp.def);
  check(sp.moved.join() === 'super,idle,idle', 'SUPER remapped to button 6 replaces both default super buttons: ' + sp.moved);
  check(sp.oldStart === 'fight' && sp.newStart === 'pause', 'START remapped to button 6: the old Start button no longer pauses, the new one does: ' + [sp.oldStart, sp.newStart]);

  // ---- saved maps ----
  const sv = await ev(`(() => {
    const out = {}; GAMEPAD.reset(G.ID);
    GAMEPAD.assign(G.ID, 'p', 0); out.defaultStores = SETTINGS.get('gamepad.maps');   // the default layout stores nothing
    GAMEPAD.assign(G.ID, 'k', 0); const m = SETTINGS.get('gamepad.maps'); out.stored = m && m[G.ID] && m[G.ID].p.join() + '|' + m[G.ID].k.join();
    out.ps = GAMEPAD.effective(G.PS).p.join(); out.onDisk = JSON.parse(localStorage.getItem('brawl.settings'))['gamepad.maps'] !== undefined;
    for (let i = 0; i < 9; i++) GAMEPAD.assign('pad-' + i, 'p', 7); out.cap = Object.keys(SETTINGS.get('gamepad.maps')).length;
    GAMEPAD.assign('pad-9', 'p', 7); out.keepsNewest = !!SETTINGS.get('gamepad.maps')['pad-9'];
    SETTINGS.set('gamepad.maps', { junk: { p: ['x', -4, 99, 1.5], l: 'no' }, [G.ID]: { p: [7, 7, 7, 7, 7] } }); out.junk = [GAMEPAD.effective('junk').p.join(), GAMEPAD.effective('junk').l.join(), GAMEPAD.effective(G.ID).p.join()];   // bad stored data falls back to the defaults
    SETTINGS.set('gamepad.maps', null); GAMEPAD.assign(G.ID, 'p', 7);
    return out;
  })()`);
  check(sv.defaultStores === null && sv.stored === '1|0' && sv.ps === '0', 'a map is stored per controller id (the default layout stores nothing): ' + JSON.stringify([sv.defaultStores, sv.stored, sv.ps]));
  check(sv.onDisk && sv.cap === 6 && sv.keepsNewest, 'the maps persist through SETTINGS and only the six newest pads are kept: ' + sv.cap);
  check(sv.junk.join('|') === '0|14|7', 'unusable stored maps fall back to the default buttons, and repeated buttons are folded: ' + sv.junk);
  await boot();   // a reload keeps the map
  const rl = await ev(`(() => { const e = GAMEPAD.effective(${JSON.stringify(ID)}); return e.p.join(); })()`);
  check(rl === '7', 'a saved map survives a reload: PUNCH is on button ' + rl);
  await ev('GAMEPAD.reset(' + JSON.stringify(ID) + ')');
  await boot();

  // ---- rumble ----
  const ru = await ev(`(() => {
    const out = {}, [a, b] = G.fresh(0, 1), strong = n => G.acts[n].log.map(q => q.strongMagnitude), both = [G.mk(G.ID, [], { slot: 0 }), G.mk(G.PS, [], { slot: 1 })];
    G.pads = both; step(2); G.place(260); step(70); G.clear();
    b.inv = 0; b.hp = b.d.hp; b.set('idle'); b.takeHit(a, 14, 3, 10, 'hit', { knock: true });
    out.victim = G.acts[1].log.length; out.attacker = G.acts[0].log.length; out.types = G.acts[1].log.concat(G.acts[0].log).every(q => q.type === 'dual-rumble' && q.duration > 0 && q.strongMagnitude >= 0 && q.strongMagnitude <= 1 && q.weakMagnitude >= 0 && q.weakMagnitude <= 1);
    out.tap = G.acts[0].log[0] && [G.acts[0].log[0].strongMagnitude, G.acts[0].log[0].weakMagnitude, G.acts[0].log[0].duration];
    step(80); G.clear(); b.cpu = true; G.place(260); b.inv = 0; b.hp = b.d.hp; b.set('idle'); b.takeHit(a, 14, 3, 10, 'hit', { knock: true }); out.cpuVictim = G.acts[1].log.length; out.cpuAttacker = G.acts[0].log.length; b.cpu = false;
    return out;
  })()`);
  check(ru.victim >= 1 && ru.attacker >= 1 && ru.types, 'a hit rumbles the victim\'s pad and gives the attacker a tap, as proper dual-rumble effects: ' + JSON.stringify([ru.victim, ru.attacker]));
  check(ru.tap && ru.tap.join() === '0.05,0.22,40', 'the attacker\'s tap is light and short: ' + (ru.tap && ru.tap.join()));
  check(ru.cpuVictim === 0 && ru.cpuAttacker >= 1, 'a CPU fighter has no pad to rumble: the CPU victim\'s slot stays silent');

  const ev2 = await ev(`(() => {
    const out = {}, [a, b] = G.fresh(0, 1); G.pads = [G.mk(G.ID, [], { slot: 0 }), G.mk(G.PS, [], { slot: 1 })]; step(2);
    const last = (n, key) => { const l = G.acts[n].log; return l.length ? l[0][key] : null; };
    const shot = (name, fn, n) => { step(80); G.clear(); fn(); out[name] = G.acts[n].log.length ? [G.acts[n].log[0].strongMagnitude, G.acts[n].log[0].weakMagnitude, G.acts[n].log[0].duration].join() : 'none'; };
    shot('block', () => BUS.emit('block', { src: a, victim: b, dmg: 1 }), 1);
    shot('knockdown', () => BUS.emit('knockdown', { src: a, victim: b }), 1);
    shot('throw', () => BUS.emit('throw', { src: a, victim: b }), 1);
    shot('super', () => BUS.emit('super', { fighter: a, foe: b, move: null }), 0);
    shot('koLoser', () => BUS.emit('ko', { winner: a, loser: b }), 1);
    shot('koWinner', () => BUS.emit('ko', { winner: a, loser: b }), 0);
    shot('small', () => BUS.emit('hit', { src: a, victim: b, dmg: 1, kind: 'punch', combo: 1, hp: b.hp }), 1); const small = G.acts[1].log[0];
    shot('big', () => BUS.emit('hit', { src: a, victim: b, dmg: 60, kind: 'hit', combo: 1, hp: b.hp }), 1); const big = G.acts[1].log[0];
    out.scale = [small.strongMagnitude < big.strongMagnitude, small.duration < big.duration, big.strongMagnitude <= 1 && big.weakMagnitude <= 1];
    return out;
  })()`);
  check(ev2.block === '0.1,0.25,45' && ev2.knockdown === '0.85,0.5,220' && ev2.throw === '0.7,0.4,200', 'block is a tick, a knockdown and a throw are heavy: ' + [ev2.block, ev2.knockdown, ev2.throw].join(' | '));
  check(ev2.super === '0.45,0.8,300' && ev2.koLoser === '1,0.9,650' && ev2.koWinner === '0.25,0.3,200', 'a super rumbles its owner, the KO rumbles the loser hardest and the winner a little: ' + [ev2.super, ev2.koLoser, ev2.koWinner].join(' | '));
  check(ev2.scale.join() === 'true,true,true', 'a bigger hit rumbles harder and longer, and magnitudes never pass 1: ' + ev2.scale);

  const th = await ev(`(() => {
    const out = {}; G.pads = [G.mk(G.ID, [], { slot: 0 })]; step(80); G.clear();
    out.first = GAMEPAD.rumble(0, 0.2, 0.2, 100); out.same = GAMEPAD.rumble(0, 0.2, 0.2, 100); out.stronger = GAMEPAD.rumble(0, 0.9, 0.9, 100); out.weaker = GAMEPAD.rumble(0, 0.1, 0.1, 100);
    out.logged = G.acts[0].log.length; step(8); out.after = GAMEPAD.rumble(0, 0.2, 0.2, 100);
    G.pads = [G.mk(G.ID, [], { slot: 0, noAct: true })]; step(1); out.noActuator = GAMEPAD.rumble(0, 1, 1, 100);
    const pulses = []; const old = G.mk(G.OLD, [], { slot: 0, noAct: true, mapping: '' }); old.hapticActuators = [{ pulse(v, ms) { pulses.push([v, ms]); return Promise.resolve(true); } }];
    G.pads = [old]; step(80); out.pulse = GAMEPAD.rumble(0, 0.4, 0.2, 120); out.pulses = pulses.length && pulses[0].join();
    G.pads = []; step(1); out.noPad = GAMEPAD.rumble(0, 1, 1, 100);
    return out;
  })()`);
  check(th.first && !th.same && th.stronger && !th.weaker && th.logged === 2 && th.after, 'a running effect is not cut off by an equal or weaker one, a stronger one takes over, and it plays again once it ended: ' + JSON.stringify(th));
  check(!th.noActuator && !th.noPad && th.pulse && th.pulses === '0.4,120', 'no actuator or no pad: nothing happens and nothing throws; an older pulse-only pad still buzzes: ' + JSON.stringify([th.noActuator, th.noPad, th.pulse, th.pulses]));

  const off = await ev(`(() => {
    const out = {}, [a, b] = G.fresh(0, 1); G.pads = [G.mk(G.ID, [], { slot: 0 }), G.mk(G.PS, [], { slot: 1 })]; step(80); G.clear();
    SETTINGS.set('gamepad.rumble', false); out.resets = G.acts.slice(0, 2).map(x => x.resets);
    out.silent = GAMEPAD.rumble(0, 1, 1, 100); BUS.emit('ko', { winner: a, loser: b }); G.place(260); b.inv = 0; b.set('idle'); b.takeHit(a, 14, 3, 10, 'hit', { knock: true });
    out.logs = G.acts.slice(0, 2).map(x => x.log.length);
    SETTINGS.set('gamepad.rumble', true); step(80); out.back = GAMEPAD.rumble(0, 1, 1, 100);
    return out;
  })()`);
  check(off.resets.join() === '1,1' && !off.silent && off.logs.join() === '0,0' && off.back, 'switching rumble off stops what runs on every pad and keeps every event silent; switching it on again works: ' + JSON.stringify(off));

  // ---- glyphs on the menus ----
  const gl = await ev(`(() => {
    const out = {}, names = h => JSON.stringify(h.map(x => x.text + ':' + x.glyphs.join('/')));
    G.pads = [G.mk(G.ID, [])]; step(1); out.xbox = names(GAMEPAD.hint('select')); out.over = names(GAMEPAD.hint('over')); out.title = names(GAMEPAD.hint('title')); out.pause = names(GAMEPAD.hint('pause'));
    GAMEPAD.assign(G.ID, 'p', 7); out.remap = names(GAMEPAD.hint('title')); GAMEPAD.reset(G.ID);
    G.pads = [G.mk(G.PS, [])]; step(1); out.ps = names(GAMEPAD.hint('title')); out.psStyle = GAMEPAD.styleOf(G.pads[0]);
    G.pads = [G.mk(G.NS, [])]; step(1); out.ns = names(GAMEPAD.hint('title')); out.nsStyle = GAMEPAD.styleOf(G.pads[0]);
    G.pads = [G.mk(G.OLD, [], { mapping: '' })]; step(1); out.old = names(GAMEPAD.hint('title')); out.oldStyle = GAMEPAD.styleOf(G.pads[0]);
    G.pads = [G.mk(G.ID, [])]; step(1); SETTINGS.set('gamepad.glyphs', 'shapes'); out.forced = names(GAMEPAD.hint('title')); SETTINGS.set('gamepad.glyphs', 'auto');
    out.faces = [0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15].map(i => GAMEPAD.glyph(i, G.pads[0])).join();
    return out;
  })()`);
  check(gl.xbox === '["MOVE:LEFT/RIGHT/UP/DOWN","PICK:A","UNDO:B","ARENA:Y","TITLE:SEL"]', 'select screen hints on an Xbox-style pad follow its layout: ' + gl.xbox);
  check(gl.over === '["SELECT:A","REMATCH:Y","TITLE:SEL"]' && gl.title === '["CHOOSE:UP/DOWN","PICK:A"]' && gl.pause === '["GAMEPAD SETUP:Y"]', 'end, title and pause hints: ' + [gl.over, gl.title, gl.pause].join(' '));
  check(gl.remap === '["CHOOSE:UP/DOWN","PICK:RT"]', 'the hints follow the remapping: PICK shows the button it was moved to: ' + gl.remap);
  check(gl.ps === '["CHOOSE:UP/DOWN","PICK:CROSS"]' && gl.psStyle === 'shapes' && gl.ns === '["CHOOSE:UP/DOWN","PICK:B"]' && gl.nsStyle === 'swapped', 'a PlayStation-style id shows shapes and a Switch-style id swaps A and B: ' + [gl.ps, gl.ns].join(' '));
  check(gl.old === '["CHOOSE:B12/B13","PICK:B0"]' && gl.oldStyle === 'num', 'a pad without the standard layout shows plain button numbers: ' + gl.old);
  check(gl.forced === '["CHOOSE:UP/DOWN","PICK:CROSS"]' && gl.faces === 'A,B,X,Y,LB,RB,SEL,START,UP,DOWN,LEFT,RIGHT', 'the glyph set can be forced from the setting, and the standard buttons are named: ' + gl.faces);

  const dr = await ev(`(() => {
    const out = {}; G.pads = [G.mk(G.ID, [7])]; step(1); G.idle();
    setPhase('select'); game.ready = [false, false]; step(1); render(); out.selPad = G.green(518, 24);
    G.T('F9'); step(1); render(); out.selKey = G.green(518, 24); out.last = GAMEPAD.state().last;
    G.pads = [G.mk(G.ID, [7])]; step(1); G.idle(); render(); out.selAgain = G.green(518, 24); out.last2 = GAMEPAD.state().last;
    SETTINGS.set('gamepad.hints', false); render(); out.selOff = G.green(518, 24); SETTINGS.set('gamepad.hints', true);
    G.pads = [G.mk(G.PS, [])]; step(1); render(); out.ps = [G.blue(518, 24), G.green(518, 24)];   // the cross is blue, there is no green A
    G.pads = [G.mk(G.ID, [7])]; step(1); G.idle(); setPhase('title'); step(1); render(); out.titlePad = G.green(494, 26);
    G.T('F9'); step(1); render(); out.titleKey = G.green(494, 26);
    G.pads = [G.mk(G.ID, [7])]; step(1); G.idle(); setPhase('select'); game.ready = [false, false]; step(1); out.noPad = (G.pads = [], step(2), render(), G.green(518, 24));
    return out;
  })()`);
  check(dr.selPad > 20 && dr.selKey === 0 && dr.last === 'key', 'the select screen shows the glyph strip while a pad was the last input and the key hints again after a key press: ' + [dr.selPad, dr.selKey, dr.last]);
  check(dr.selAgain > 20 && dr.last2 === 'pad' && dr.selOff === 0, 'touching the pad brings the strip back, and the hints setting hides it: ' + [dr.selAgain, dr.last2, dr.selOff]);
  check(dr.ps[0] > 5 && dr.ps[1] === 0, 'a PlayStation-style pad draws a blue cross, not a green A: ' + dr.ps);
  check(dr.titlePad > 20 && dr.titleKey === 0, 'the title screen strip follows the same rule: ' + [dr.titlePad, dr.titleKey]);
  check(dr.noPad === 0, 'unplugging the pad drops the strip');

  // ---- hot-plug toast ----
  await boot();
  const hp = await ev(`(() => {
    const out = {}, tx = () => GAMEPAD.state().toasts.join('|');
    G.pads = []; step(2); setPhase('title'); step(1); out.none = tx();
    G.pads = [G.mk(G.ID, [])]; step(1); out.p1 = tx(); step(16); render(); out.drawn = G.green(6, 28);
    G.pads = [G.mk(G.ID, []), G.mk(G.PS, [], { slot: 1 })]; step(1); out.p2 = tx();
    G.pads = [G.mk(G.ID, []), G.mk(G.PS, [], { slot: 1 }), G.mk(G.NS, [], { slot: 2 })]; step(1); out.spare = tx();
    step(120); G.pads = [G.mk(G.ID, [])]; step(1); out.gone = tx();
    step(200); out.expired = tx(); render(); out.drawnAfter = G.green(6, 28);
    G.pads = [G.mk(G.ID, [], { slot: 0 })]; step(1); const n = GAMEPAD.state().toasts.length; step(1); out.steady = GAMEPAD.state().toasts.length === n;
    return out;
  })()`);
  check(hp.none === '' && hp.p1 === 'GAMEPAD CONNECTED · P1' && hp.p2.endsWith('GAMEPAD CONNECTED · P2') && hp.spare.endsWith('GAMEPAD CONNECTED · SPARE'), 'plugging in pads toasts "connected" with the player number (the third is a spare): ' + [hp.p1, hp.p2, hp.spare].join(' / '));
  check(hp.gone.includes('GAMEPAD DISCONNECTED · P2') && hp.gone.includes('GAMEPAD DISCONNECTED · SPARE'), 'unplugging toasts "disconnected": ' + hp.gone);
  check(hp.drawn > 5 && hp.expired === '' && hp.drawnAfter === 0 && hp.steady, 'the toast draws while it lives, vanishes after a few seconds, and nothing repeats while the pads stay as they are: ' + [hp.drawn, hp.expired, hp.drawnAfter, hp.steady]);

  // ---- the setup screen: from the title menu ----
  await boot();
  const tl = await ev(`(() => {
    const out = {}; G.idle(); GAMEPAD.reset(G.ID); setPhase('title'); step(2);
    const items = titleItems(), idx = items.findIndex(i => i.id === 'gamepad'); out.listed = idx >= 0; out.last = idx === items.length - 1 || items[items.length - 1].order >= 905;
    game.titleSel = idx; G.pads = [G.mk(G.ID, [0])]; step(1); out.open = GAMEPAD.isOpen(); out.from = GAMEPAD.state().from;
    step(3); out.heldA = [GAMEPAD.state().sel, game.phase, GAMEPAD.state().cap];   // A still held from the title: nothing is picked on the screen
    G.idle(); G.pads = [G.mk(G.ID, [13])]; step(1); out.down = GAMEPAD.state().sel; G.idle();
    G.pads = [G.mk(G.ID, [0])]; step(1); out.cap = GAMEPAD.state().cap; G.idle(); out.during = [game.phase, GAMEPAD.isOpen()];
    G.pads = [G.mk(G.ID, [7])]; step(1); out.assigned = [GAMEPAD.state().cap, GAMEPAD.effective(G.ID).l.join()]; G.idle();
    G.pads = [G.mk(G.ID, [0])]; step(1); G.idle(); G.T('Escape'); step(1); out.esc = [GAMEPAD.state().cap, GAMEPAD.effective(G.ID).l.join(), GAMEPAD.isOpen()];
    G.pads = [G.mk(G.ID, [4, 7])]; step(1); out.held = GAMEPAD.state().held.join(); G.idle(); render(); out.rendered = true;
    return out;
  })()`);
  check(tl.listed && tl.last && tl.open && tl.from === 'title', 'with a pad connected the title menu lists GAMEPAD last, and picking it with A opens the setup: ' + JSON.stringify([tl.listed, tl.last, tl.open, tl.from]));
  check(tl.heldA[0] === 0 && tl.heldA[1] === 'title' && tl.heldA[2] === null, 'the A that opened the screen does nothing on it until it is let go: ' + tl.heldA);
  check(tl.down === 1 && tl.cap === 'l' && tl.during[0] === 'title' && tl.during[1], 'the d-pad moves down to LEFT and A waits for a new button: ' + [tl.down, tl.cap]);
  check(tl.assigned[0] === null && tl.assigned[1] === '7', 'the next button pressed is bound to LEFT: ' + tl.assigned);
  check(tl.esc[0] === null && tl.esc[1] === '7' && tl.esc[2], 'Esc gives up a capture without changing anything: ' + tl.esc);
  check(tl.held === '4,7', 'the screen shows the buttons that are held: ' + tl.held);

  const cl = await ev(`(() => {
    const out = {}; GAMEPAD.reset(G.ID); GAMEPAD.close(); G.idle(); setPhase('title'); step(2); GAMEPAD.open('title'); step(2);
    G.pads = [G.mk(G.ID, [12])]; step(1); out.wrap = GAMEPAD.state().sel; G.idle(); step(1);   // up from the first row lands on DONE
    G.pads = [G.mk(G.ID, [0])]; step(1); out.closed = !GAMEPAD.isOpen(); out.phase = game.phase;
    step(3); out.stillShut = !GAMEPAD.isOpen() && game.phase === 'title'; out.blank = GAMEPAD.state().blank[0];   // A is still down: it must not pick GAMEPAD again
    G.idle(); step(1); out.blankAfter = GAMEPAD.state().blank[0];
    game.titleSel = titleItems().findIndex(i => i.id === 'gamepad'); G.pads = [G.mk(G.ID, [0])]; step(1); out.reopened = GAMEPAD.isOpen();
    return out;
  })()`);
  check(cl.wrap === 15 && cl.closed && cl.phase === 'title', 'up from the first row wraps to DONE, and A on it closes the screen: ' + [cl.wrap, cl.closed, cl.phase]);
  check(cl.stillShut && cl.blank === true && cl.blankAfter === false && cl.reopened, 'after closing, a still-held A is ignored until it is released (it does not pick the title entry again), then works again: ' + [cl.stillShut, cl.blank, cl.blankAfter, cl.reopened]);

  // ---- the setup screen: from the pause screen, two pads, reset ----
  const ps = await ev(`(() => {
    const out = {}, [a, b] = G.fresh(0, 1); GAMEPAD.reset(G.ID); G.pads = [G.mk(G.ID, [7])]; step(1); G.idle();
    G.T('KeyP'); step(1); out.paused = game.phase; out.key = HOOKS.collect('pauseItems').some(i => i.key === 'KeyG');
    G.pads = [G.mk(G.ID, [7])]; step(1); G.idle(); G.pads = [G.mk(G.ID, [3])]; step(1); G.idle();   // the pad's super button on the pause screen
    out.byPad = [GAMEPAD.isOpen(), GAMEPAD.state().from, game.phase]; GAMEPAD.close(); step(1); G.idle(); step(95);
    G.pads = [G.mk(G.ID, [7])]; step(1); G.idle(); G.T('KeyG'); step(1); out.byKey = [GAMEPAD.isOpen(), GAMEPAD.state().from];
    G.T('KeyQ'); step(1); out.quit = [game.phase, GAMEPAD.isOpen()];   // the screen takes every key: Q does not quit to the title
    render(); out.drew = true;
    G.T('Escape'); step(1); out.closed = [GAMEPAD.isOpen(), game.phase];   // and Esc closes only the screen, it does not resume
    G.T('KeyG'); step(1); game.phase = 'fight'; step(1); out.auto = GAMEPAD.isOpen();
    return out;
  })()`);
  check(ps.paused === 'pause' && ps.key && ps.byPad[0] && ps.byPad[1] === 'pause' && ps.byPad[2] === 'pause', 'on the pause screen the super button opens the setup: ' + JSON.stringify(ps.byPad));
  check(ps.byKey[0] && ps.byKey[1] === 'pause' && ps.quit[0] === 'pause' && ps.quit[1], 'on the pause screen G opens the setup and the screen swallows other keys (Q does not quit): ' + JSON.stringify([ps.byKey, ps.quit]));
  check(ps.closed[0] === false && ps.closed[1] === 'pause' && ps.auto === false, 'Esc closes the screen without resuming, and leaving the pause screen closes it: ' + JSON.stringify([ps.closed, ps.auto]));

  const two = await ev(`(() => {
    const out = {}, both = (a, b) => { G.pads = [G.mk(G.ID, a, { slot: 0 }), G.mk(G.PS, b, { slot: 1 })]; step(1); };
    GAMEPAD.reset(G.ID); GAMEPAD.reset(G.PS); G.fresh(0, 1); both([], []); G.T('KeyP'); step(1); G.T('KeyG'); step(2);
    both([15], []); out.tab = GAMEPAD.state().tab; both([], []);   // right on the first row: the next pad
    both([], [13]); out.sel = GAMEPAD.state().sel; both([], []);   // from now on the second pad drives the screen
    both([], [0]); out.cap = GAMEPAD.state().cap; both([], []);
    both([], [6]); out.capAfter = GAMEPAD.state().cap; both([], []);   // the next button pressed is bound to LEFT
    out.ps = GAMEPAD.effective(G.PS).l.join(); out.xbox = GAMEPAD.effective(G.ID).l.join();
    out.maps = Object.keys(SETTINGS.get('gamepad.maps') || {});
    GAMEPAD.close(); GAMEPAD.reset(G.PS);
    return out;
  })()`);
  check(two.tab === 1 && two.sel === 1 && two.cap === 'l' && two.capAfter === null && two.ps === '6' && two.xbox === '14' && two.maps.length === 1 && two.maps[0].startsWith('Wireless'), 'with two pads the first row switches pad, and a remap lands on that pad\'s id only: ' + JSON.stringify(two));

  const rs = await ev(`(() => {
    const out = {}; GAMEPAD.reset(G.ID); GAMEPAD.reset(G.PS); G.fresh(0, 1); G.idle(); GAMEPAD.assign(G.ID, 'p', 7); G.T('KeyP'); step(1); G.T('KeyG'); step(2);
    out.before = GAMEPAD.effective(G.ID).p.join();
    for (let i = 0; i < 14; i++) { G.T('KeyS'); step(1); }   // rows: the pad, ten buttons, rumble, glyphs, hints, then RESET at 14 and DONE at 15
    out.sel = GAMEPAD.state().sel; G.T('Enter'); step(1); out.maps = SETTINGS.get('gamepad.maps'); out.after = GAMEPAD.effective(G.ID).p.join();
    GAMEPAD.close();
    return out;
  })()`);
  check(rs.before === '7' && rs.sel === 14 && rs.maps === null && rs.after === '0', 'RESET THIS GAMEPAD puts the default buttons back: ' + JSON.stringify(rs));

  // the three option rows (rumble, glyphs, hints) sit at rows 11, 12 and 13 of the setup list
  const rows = await ev(`(() => {
    const out = {}; GAMEPAD.close(); G.idle(); step(95); GAMEPAD.open('pause'); step(2);
    const go = n => { for (let i = 0; i < n; i++) { G.T('KeyS'); step(1); } }; go(11); out.rumbleRow = GAMEPAD.state().sel;
    G.T('Enter'); step(1); out.rumbleOff = SETTINGS.get('gamepad.rumble'); G.T('Enter'); step(1); out.rumbleOn = SETTINGS.get('gamepad.rumble');
    go(1); out.glyphRow = GAMEPAD.state().sel; G.T('Enter'); step(1); out.glyph1 = SETTINGS.get('gamepad.glyphs'); G.T('ArrowLeft'); step(1); out.glyph0 = SETTINGS.get('gamepad.glyphs');
    go(1); out.hintsRow = GAMEPAD.state().sel; G.T('Enter'); step(1); out.hintsOff = SETTINGS.get('gamepad.hints'); G.T('Enter'); step(1); out.hintsOn = SETTINGS.get('gamepad.hints');
    GAMEPAD.close(); return out;
  })()`);
  check(rows.rumbleRow === 11 && rows.rumbleOff === false && rows.rumbleOn === true && rows.glyphRow === 12 && rows.glyph1 === 'letters' && rows.glyph0 === 'auto' && rows.hintsRow === 13 && rows.hintsOff === false && rows.hintsOn === true, 'the setup screen toggles rumble and the hints, and steps through the glyph sets with Enter and the arrows: ' + JSON.stringify(rows));
}
