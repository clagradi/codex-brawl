// Tests for p-mutators: match modifiers picked before a VS match (p-mutators.js). Owner: the p-mutators agent. Runs after core.mjs and the other feature files in alphabetical order.
// Covers: the API and the all-off default; the G panel on the select screen (open, move, toggle, quick digits, clear, close, and the select screen ignoring keys while it is open); the
// saved choice across reloads and a corrupt stored value; the mode scope; TURBO (1.5x ticks and a jump that takes two thirds of the steps); LOW GRAVITY (a higher, longer jump);
// RATE LIMITED (a special restarts only after the long cooldown, for a human and for the CPU); GLASS CANNON (double damage); LEGACY MODE (a green-only frame); BIG HEADS (bigger head
// sheets swapped in while live and restored after); the chips on the VS screen, under the HUD timer and in the select hint. Every step is deterministic: hold(true), step(n) and key taps.
export async function run(t) {
  const { check, tap } = t, ev = t.eval;
  const errors0 = t.p.errors.length;

  // page helpers: __M.fresh starts a match of two humans and plays the intro, place / jump / key drive a fighter, count counts exact-colour pixels on the canvas
  const HELPERS = `(() => {
    window.__M = {};
    __M.key = (c, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: c }));
    __M.until = (fn, n) => { let i = 0; while (!fn() && i < n) { step(1); i++; } return i; };
    __M.fresh = (i, j, modeId) => {
      dispatchEvent(new Event('blur')); game.hitstop = game.slow = game.dark = 0; game.proj = []; game.fx = []; game.delayed = [];
      game.modeId = modeId || 'versus2'; game.mode = 2; game.sel = [i, j]; game.arenaPick = 0; startMatch(); __M.until(() => game.phase === 'fight', 1500);
      const [a, b] = game.f; a.cpu = b.cpu = false; step(1); return [a, b];
    };
    __M.place = dx => {
      const [f, o] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.hitstop = 0; game.slow = 0;
      for (const q of [f, o]) { q.set('idle'); q.hp = q.d.hp; q.y = GROUND; q.vx = q.vy = 0; q.cool = q.inv = q.dashCool = 0; q.combo = 0; q.meter = 0; q.lie = 0; q.land = 0; q.hidden = false; }
      f.x = 300; o.x = 300 + dx; f.face = 1; o.face = -1; step(1); return [f, o];
    };
    __M.jump = () => {
      const [f] = __M.place(300); let air = 0, top = GROUND, started = false, n = 0;
      __M.key('KeyW', true);
      for (; n < 500; n++) { step(1); if (n === 1) __M.key('KeyW', false); if (f.y < GROUND) { started = true; air++; top = Math.min(top, f.y); } else if (started) break; }
      __M.key('KeyW', false); return { apex: GROUND - top, air };
    };
    __M.count = (x, y, w, h, r, g, b, tol) => { const d = ctx.getImageData(x, y, w, h).data, e = tol || 0; let n = 0; for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - r) <= e && Math.abs(d[k + 1] - g) <= e && Math.abs(d[k + 2] - b) <= e) n++; return n; };
    __M.hitDamage = () => { const [a, b] = __M.place(120); step(20); b.inv = 0; b.hp = b.d.hp; b.set('idle'); game.hitstop = 0; const h0 = b.hp; b.takeHit(a, 8, 3, 10, 'punch', {}); const d1 = h0 - b.hp;
      step(40); b.inv = 0; b.hp = b.d.hp; b.set('idle'); game.hitstop = 0; const h1 = b.hp; b.takeHit(a, 20, 3, 10, 'super', {}); return [d1, h1 - b.hp]; };
    return true;
  })()`;
  const open = async hash => { await t.open(hash); await ev(HELPERS); await ev('hold(true)'); };
  const press = async code => { await tap(code); await ev('step(1)'); };   // the pressed flag waits for the next update, so a tap plus one step is one press
  const near = (v, want, tol) => Math.abs(v - want) <= tol;

  try {
    // ---- the API and the defaults ----
    await t.open(); await ev('localStorage.clear()');
    await open('#select');
    const api = await ev(`(() => ({ ready: window.STUB_MUTATORS === 1 && !!window.MUTATORS && MUTATORS.ready, ids: MUTATORS.ids.join(','), on: MUTATORS.active().length, count: MUTATORS.count(),
      names: MUTATORS.list().map(m => m.name).join('|'), descs: MUTATORS.list().every(m => m.desc && m.desc.length > 8), key: MUTATORS.key,
      hooks: ['update', 'fighterUpdate', 'damage', 'drawFighter', 'drawHud', 'drawTop'].every(h => HOOKS.has(h)), setting: JSON.stringify(SETTINGS.get('mutators.on')) }))()`);
    check(api.ready, 'p-mutators.js is loaded and ready');
    check(api.ids === 'bigheads,lowgrav,turbo,rate,legacy,glass', 'six mutators in a fixed order: ' + api.ids);
    check(api.names === 'BIG HEADS|LOW GRAVITY|TURBO 1.5X|RATE LIMITED|LEGACY MODE|GLASS CANNON' && api.descs, 'names are capitals and each has a one-line description');
    check(api.on === 0 && api.count === 0 && api.setting === '{}', 'every mutator is off by default and the saved choice is empty');
    check(api.hooks && api.key === 'KeyG', 'it plugs in through the update, fighterUpdate, damage, drawFighter, drawHud and drawTop hooks and opens with G');
    check(await ev('MUTATORS.scope()') === true && await ev('MUTATORS.isOpen') === false, 'the select screen of the versus mode is in scope and the panel starts closed');

    // ---- the panel on the select screen ----
    await ev('step(2)');
    const sel0 = await ev('JSON.stringify(game.sel) + JSON.stringify(game.ready)');
    await press('KeyG');
    check(await ev('MUTATORS.isOpen') === true && await ev('MUTATORS.sel') === 0, 'G opens the panel with the first row selected');
    await ev('render()');
    const looks = await ev(`(() => ({ body: __M.count(190, 72, 6, 6, 11, 7, 20), edge: __M.count(170, 100, 3, 40, 201, 162, 74) }))()`);
    check(looks.body === 36 && looks.edge > 60, 'the panel is drawn: dark plate and gold frame (' + looks.body + ' plate pixels, ' + looks.edge + ' frame pixels)');
    await press('KeyS'); const s1 = await ev('MUTATORS.sel');
    await press('ArrowDown'); const s2 = await ev('MUTATORS.sel');
    await press('KeyW'); await press('ArrowUp'); const s3 = await ev('MUTATORS.sel');
    check(s1 === 1 && s2 === 2 && s3 === 0, 'S / W and the arrow keys move the row: ' + [s1, s2, s3].join(' '));
    await press('ArrowUp'); check(await ev('MUTATORS.sel') === 5, 'the row list wraps from the first row to the last');
    await press('ArrowDown');
    await press('Enter');
    check(await ev('MUTATORS.isOn("bigheads")') === true && await ev('MUTATORS.active().join()') === 'bigheads', 'Enter toggles the selected row on');
    check(await ev('JSON.stringify(game.sel) + JSON.stringify(game.ready)') === sel0 && await ev('game.phase') === 'select', 'Enter did not pick a fighter while the panel was open');
    await press('Digit3');
    check(await ev('MUTATORS.isOn("turbo")') === true && await ev('MUTATORS.sel') === 2, 'a digit toggles that row and moves the cursor to it');
    await press('KeyD');
    check(await ev('MUTATORS.isOn("turbo")') === false && await ev('JSON.stringify(game.sel)') === JSON.stringify(JSON.parse(sel0.slice(0, sel0.indexOf(']') + 1))), 'D toggles the row off and does not move the fighter cursor');
    await press('Digit6'); await press('Digit4');
    check(await ev('MUTATORS.active().join()') === 'bigheads,rate,glass', 'several can be on together, listed in the fixed order: ' + await ev('MUTATORS.active().join()'));
    await ev('render()');
    check(await ev('__M.count(690, 148, 80, 32, 85, 224, 122)') > 40, 'the ON labels are green on screen');
    await press('KeyX');
    check(await ev('MUTATORS.count()') === 0, 'X clears every mutator');
    await press('Escape');
    check(await ev('MUTATORS.isOpen') === false && await ev('game.phase') === 'select', 'Esc closes the panel and does not leave the select screen');
    await press('KeyG'); await press('KeyG');
    check(await ev('MUTATORS.isOpen') === false, 'G opens and closes the panel');
    await ev('MUTATORS.set("glass", true); step(1); render()');
    check(await ev('__M.count(700, 8, 260, 30, 255, 226, 122)') > 30, 'with a mutator on, the select hint (G MUTATORS, count) is drawn in gold at the top right');
    await ev('MUTATORS.clear(); step(1); render()');
    check(await ev('__M.count(700, 8, 260, 30, 255, 226, 122)') === 0 && await ev('__M.count(700, 8, 260, 30, 141, 134, 150)') > 20, 'with all off, the hint is grey and says nothing is on');
    const mv = await ev('(() => { const x = game.sel[0]; return x; })()');
    await press('KeyD');
    check(await ev('game.sel[0]') !== mv, 'with the panel closed, D moves the fighter cursor again');
    await press('KeyG');
    await ev('setPhase("title")'); await ev('step(1)');
    check(await ev('MUTATORS.isOpen') === false, 'leaving the select screen closes the panel');
    await ev('MUTATORS.clear()');

    // ---- the saved choice ----
    await open('#select');
    await ev('MUTATORS.set("bigheads", true); MUTATORS.set("glass", true)');
    check(await ev('JSON.stringify(SETTINGS.get("mutators.on"))') === '{"bigheads":true,"glass":true}', 'the choice is stored in SETTINGS as { id: true }');
    await open('#select');
    check(await ev('MUTATORS.active().join()') === 'bigheads,glass', 'the choice survives a reload');
    await ev('MUTATORS.clear()');
    await ev(`localStorage.setItem('brawl.settings', JSON.stringify({ 'mutators.on': 5 }))`);
    await open('#select');
    check(await ev('MUTATORS.count()') === 0, 'a corrupt stored value means everything off');
    await ev(`localStorage.setItem('brawl.settings', JSON.stringify({ 'mutators.on': { nonsense: true, glass: true } }))`);
    await open('#select');
    check(await ev('MUTATORS.active().join()') === 'glass', 'unknown ids in the stored value are ignored');
    await ev('MUTATORS.clear()');

    // ---- TURBO: 1.5 ticks of simulation per step in a fight ----
    await open('#select');
    const tk = await ev(`(() => {
      const out = {}; __M.fresh(0, 1); __M.place(300); step(10);
      let t0 = game.tick, c0 = game.clock; step(120); out.baseTick = game.tick - t0; out.baseClock = game.clock - c0;
      out.base = __M.jump();
      MUTATORS.set('turbo', true); step(5); t0 = game.tick; c0 = game.clock; step(120); out.turboTick = game.tick - t0; out.turboClock = game.clock - c0;
      out.turbo = __M.jump();
      MUTATORS.clear(); step(2); t0 = game.tick; step(60); out.after = game.tick - t0;
      MUTATORS.set('turbo', true); startMatch(); t0 = game.tick; step(70); out.vsTick = game.tick - t0; out.vsPhase = game.phase;
      __M.until(() => game.phase === 'intro', 200); t0 = game.tick; step(30); out.introTick = game.tick - t0;
      MUTATORS.clear(); return out;
    })()`);
    check(tk.baseTick === 120 && tk.baseClock === 120, 'baseline: 120 steps are 120 ticks and 120 fight-clock ticks');
    check(near(tk.turboTick, 180, 1) && near(tk.turboClock, 180, 1), 'TURBO: 120 steps are 180 ticks and 180 fight-clock ticks: ' + tk.turboTick + ' / ' + tk.turboClock);
    check(tk.after === 60, 'turning TURBO off returns the game to one tick per step');
    check(tk.vsTick === 70 && tk.introTick === 30, 'TURBO does not speed up the VS screen or the round intro');
    check(near(tk.turbo.air / tk.base.air, 2 / 3, 0.07) && near(tk.turbo.apex / tk.base.apex, 1, 0.08), 'TURBO: a jump takes two thirds of the steps and reaches the same height (' + tk.base.air + ' -> ' + tk.turbo.air + ' steps, ' + tk.base.apex.toFixed(0) + ' -> ' + tk.turbo.apex.toFixed(0) + ' px)');

    // ---- LOW GRAVITY ----
    const lg = await ev(`(() => {
      __M.fresh(0, 1); __M.place(300); step(10);
      const base = __M.jump(); MUTATORS.set('lowgrav', true); step(2); const low = __M.jump();
      const f = game.f[0]; __M.place(300); f.y = GROUND - 50; f.vy = 0; step(1); const dy1 = f.y - (GROUND - 50);
      MUTATORS.clear(); step(2); const rest = __M.jump(); return { base, low, rest, dy1 };
    })()`);
    const k = await ev('MUTATORS.K');
    check(near(lg.low.apex / lg.base.apex, 1 / k.GRAV_K, 0.12), 'LOW GRAVITY: the jump is ' + (lg.low.apex / lg.base.apex).toFixed(2) + 'x higher (' + lg.base.apex.toFixed(0) + ' -> ' + lg.low.apex.toFixed(0) + ' px)');
    check(near(lg.low.air / lg.base.air, 1 / k.GRAV_K, 0.15), 'LOW GRAVITY: the air time is longer (' + lg.base.air + ' -> ' + lg.low.air + ' steps)');
    check(lg.rest.apex === lg.base.apex && lg.rest.air === lg.base.air, 'with it off again the jump is the baseline jump');
    check(lg.dy1 > 0 && lg.dy1 < 1, 'a fighter dropped in the air falls less than one pixel on the first tick (' + lg.dy1.toFixed(2) + ')');

    // ---- RATE LIMITED ----
    const rate = async on => ev(`(() => {
      __M.fresh(0, 1); const [f] = __M.place(300); step(10); MUTATORS.clear(); ${on ? 'MUTATORS.set("rate", true);' : ''} f.cool = 0;
      __M.key('KeyL', true); let n = 0; for (; n < 80 && f.state !== 'special'; n++) step(1);
      const first = f.state === 'special'; let len = 0; for (; len < 300 && f.state === 'special'; len++) step(1); __M.key('KeyL', true);
      const coolAfter = f.cool; let gap = -1; for (let i = 0; i < 500; i++) { __M.key('KeyL', false); __M.key('KeyL', true); step(1); if (f.state === 'special') { gap = i; break; } }
      __M.key('KeyL', false); MUTATORS.clear(); return { first, coolAfter, gap };
    })()`);
    const r0 = await rate(false), r1 = await rate(true);
    check(r0.first && r1.first, 'a special can be fired from a clean state with and without the mutator');
    check(r0.coolAfter < 100 && r0.gap >= 0 && r0.gap < 150, 'baseline: the special comes back quickly (cooldown ' + r0.coolAfter + ', restart after ' + r0.gap + ' steps)');
    check(r1.coolAfter >= k.RATE_COOL - 3 && r1.gap >= k.RATE_COOL - 12 && r1.gap <= k.RATE_COOL + 12, 'RATE LIMITED: the cooldown is ' + k.RATE_COOL + ' ticks and the special restarts after ' + r1.gap + ' steps');
    const cpu = async on => ev(`(() => {
      const mr = Math.random; let s = 987654321; Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      try {
        __M.fresh(0, 1); const [a, b] = __M.place(320); step(10); MUTATORS.clear(); ${on ? 'MUTATORS.set("rate", true);' : ''} b.cpu = true; game.cpuLevel = 1;
        const starts = []; let prev = ''; for (let i = 0; i < 900; i++) { step(1); a.hp = a.d.hp; a.inv = 0; if (b.state === 'special' && prev !== 'special') starts.push(i); prev = b.state; }
        MUTATORS.clear(); return starts;
      } finally { Math.random = mr; }
    })()`);
    const c0 = await cpu(false), c1 = await cpu(true);
    const gaps = a => a.slice(1).map((x, i) => x - a[i]);
    check(c1.length >= 1, 'the CPU fires at least one special in 900 steps with RATE LIMITED on (starts at ' + c1.join(',') + ')');
    check(gaps(c1).every(g => g >= k.RATE_COOL), 'the CPU respects the long cooldown: every gap between its specials is at least ' + k.RATE_COOL + ' steps (gaps ' + gaps(c1).join(',') + ')');
    check(c0.length >= c1.length, 'without it the same CPU fires at least as many specials (' + c0.length + ' against ' + c1.length + ')');

    // ---- GLASS CANNON ----
    const gl = await ev(`(() => { __M.fresh(0, 1); const base = __M.hitDamage(); MUTATORS.set('glass', true); step(2); const glass = __M.hitDamage();
      MUTATORS.clear(); step(2); const after = __M.hitDamage(); return { base, glass, after }; })()`);
    check(gl.base[0] > 0 && gl.base[1] > gl.base[0], 'baseline damage: a punch takes ' + gl.base[0] + ', a super takes ' + gl.base[1]);
    check(near(gl.glass[0] / gl.base[0], k.GLASS_K, 0.05) && near(gl.glass[1] / gl.base[1], k.GLASS_K, 0.05), 'GLASS CANNON doubles the damage of a punch and of a super (' + gl.glass.join(' / ') + ')');
    check(gl.after[0] === gl.base[0] && gl.after[1] === gl.base[1], 'with it off again the damage is the baseline damage');

    // ---- the mode scope ----
    const sc = await ev(`(() => {
      __M.fresh(0, 1, 'versus2'); const [a] = game.f; const out = {}; MUTATORS.clear(); MUTATORS.set('glass', true); MUTATORS.set('turbo', true); MUTATORS.set('lowgrav', true); step(2);
      out.versus2 = [MUTATORS.scope(), MUTATORS.live('glass')];
      game.modeId = 'zz-none'; step(1); out.scopeTraining = MUTATORS.scope(); out.liveTraining = MUTATORS.live('glass');
      out.dmg = __M.hitDamage()[0]; let t0 = game.tick; step(60); out.ticks = game.tick - t0; out.jump = __M.jump().apex;
      const g0 = MODES.get; MODES.get = id => id === 'zz-none' ? { id, mutators: true } : g0(id); step(1); out.scopeFlag = MUTATORS.scope(); out.dmgFlag = __M.hitDamage()[0]; MODES.get = g0;
      game.modeId = 'versus'; step(1); out.versus = MUTATORS.scope();
      MUTATORS.clear(); step(1); game.modeId = 'zz-none'; out.base = __M.hitDamage()[0]; out.baseJump = __M.jump().apex; game.modeId = 'versus'; return out;
    })()`);
    check(sc.versus2[0] && sc.versus2[1] && sc.versus, 'versus and versus2 are in scope');
    check(!sc.scopeTraining && !sc.liveTraining, 'a mode without mutators: true is out of scope');
    check(sc.dmg === sc.base && sc.ticks === 60 && sc.jump === sc.baseJump, 'out of scope, GLASS, TURBO and LOW GRAVITY change nothing (damage ' + sc.dmg + ', ticks ' + sc.ticks + ', jump ' + sc.jump.toFixed(0) + ')');
    check(sc.scopeFlag && near(sc.dmgFlag / sc.base, 2, 0.05), 'a mode that sets mutators: true is in scope and the mutators apply');

    // ---- LEGACY MODE ----
    const lc = await ev(`(() => {
      __M.fresh(0, 1); step(90); const share = () => { const d = ctx.getImageData(0, 0, 960, 540).data; let n = 0, red = 0, green = 0, lit = 0;
        for (let k = 0; k < d.length; k += 28) { n++; const r = d[k], g = d[k + 1], b = d[k + 2]; if (r > g + 20 || b > g + 20) red++; if (g >= r && g >= b) green++; if (g > 40) lit++; } return { red: red / n, green: green / n, lit: lit / n }; };
      render(); const off = share(); MUTATORS.set('legacy', true); render(); const on = share();
      game.modeId = 'zz-none'; render(); const scoped = share(); game.modeId = 'versus2';
      MUTATORS.clear(); render(); const back = share(); return { off, on, scoped, back };
    })()`);
    check(lc.off.red > 0.02, 'baseline frame has plenty of non-green colour (' + (lc.off.red * 100).toFixed(1) + '% of sampled pixels)');
    check(lc.on.red === 0 && lc.on.green > 0.999 && lc.on.lit > 0.2, 'LEGACY MODE: every sampled pixel is green-dominant and the frame is not black (' + (lc.on.green * 100).toFixed(1) + '% green, ' + (lc.on.lit * 100).toFixed(0) + '% lit)');
    check(lc.scoped.red > 0.02 && lc.back.red > 0.02, 'LEGACY MODE does nothing out of scope or once it is off');

    // ---- BIG HEADS ----
    const bh = await ev(`(() => {
      const out = { ids: [], area: [], diff: [], same: [], restored: [], draws: [], dims: [] };
      const idle = ANIMS.findIndex(a => a.n === 'idle'), sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true }); sc.width = FW; sc.height = FH;
      const area = (cv, row) => { sx.clearRect(0, 0, FW, FH); sx.drawImage(cv, 0, row * FH, FW, FH, 0, 0, FW, FH); const d = sx.getImageData(0, 0, FW, FH).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 200) n++; return n; };
      const diff = (a, b, row) => { sx.clearRect(0, 0, FW, FH); sx.drawImage(a, 0, row * FH, FW, FH, 0, 0, FW, FH); const d1 = sx.getImageData(0, 0, FW, FH).data; sx.clearRect(0, 0, FW, FH); sx.drawImage(b, 0, row * FH, FW, FH, 0, 0, FW, FH); const d2 = sx.getImageData(0, 0, FW, FH).data; let n = 0; for (let k = 0; k < d1.length; k += 4) if (d1[k] !== d2[k] || d1[k + 1] !== d2[k + 1] || d1[k + 2] !== d2[k + 2] || d1[k + 3] !== d2[k + 3]) n++; return n; };
      const spy = (img, fn) => { let n = 0; const o = CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage = function (i) { if (i === img) n++; return o.apply(this, arguments); }; try { fn(); } finally { CanvasRenderingContext2D.prototype.drawImage = o; } return n; };
      for (const pair of [[0, 1], [2, 3], [4, 0]]) {
        __M.fresh(pair[0], pair[1]); step(80); MUTATORS.clear(); step(2);
        const ids = game.f.map(f => f.d.id), orig = ids.map(id => SHEETS[id]), xorig = ids.map(id => XSHEETS[id]), a0 = ids.map((id, i) => area(orig[i], idle));
        const drawsOff = ids.map((id, i) => spy(orig[i], () => render()));
        MUTATORS.set('bigheads', true); step(2);
        ids.forEach((id, i) => {
          const b = MUTATORS.bigSheets(id); out.ids.push(id); out.area.push(+(area(SHEETS[id], idle) / a0[i]).toFixed(3)); out.diff.push(diff(SHEETS[id], orig[i], idle));
          out.same.push(!!b && SHEETS[id] === b.sheet && XSHEETS[id] === b.xsheet && SHEETS[id] !== orig[i] && XSHEETS[id] !== xorig[i] && MUTATORS.bigLive(id));
          out.dims.push(SHEETS[id].width === orig[i].width && SHEETS[id].height === orig[i].height && XSHEETS[id].width === xorig[i].width && XSHEETS[id].height === xorig[i].height);
          out.draws.push([drawsOff[i], spy(SHEETS[id], () => render()), spy(orig[i], () => render())]);
        });
        MUTATORS.set('bigheads', false); step(2); out.restored.push(ids.every((id, i) => SHEETS[id] === orig[i] && XSHEETS[id] === xorig[i] && !MUTATORS.bigLive(id)));
        MUTATORS.set('bigheads', true); step(2); setPhase('select'); step(1); out.restored.push(ids.every((id, i) => SHEETS[id] === orig[i] && XSHEETS[id] === xorig[i]));
        MUTATORS.clear();
      }
      return out;
    })()`);
    check(bh.ids.length === 6 && new Set(bh.ids).size === 5, 'all five fighters were covered: ' + [...new Set(bh.ids)].join(' '));
    check(bh.diff.every(n => n > 60) && bh.area.every(a => a >= 0.99 && a < 1.5), 'every fighter has a different idle sprite with BIG HEADS that is not smaller (changed pixels ' + bh.diff.join(' ') + ', opaque area ratios ' + bh.area.join(' ') + ')');
    check(bh.ids.every((id, i) => !['tibo', 'poteto', 'wang'].includes(id) || bh.area[i] > 1.1), 'the human heads grow the silhouette by at least a tenth');
    check(bh.same.every(Boolean) && bh.dims.every(Boolean), 'BIG HEADS swaps SHEETS and XSHEETS for its own same-sized sheets while live');
    check(bh.draws.every(d => d[0] > 0 && d[1] > 0 && d[2] === 0), 'the renderer draws from the big sheets while live and from the classic sheets otherwise (draw calls ' + JSON.stringify(bh.draws[0]) + ')');
    check(bh.restored.every(Boolean), 'the classic sheets are put back when it is switched off and when the select screen returns');
    if (await ev('typeof PALETTES === "object" && PALETTES.ready')) {
      const pal = await ev(`(() => {
        __M.fresh(0, 1); step(40); MUTATORS.set('bigheads', true); PALETTES.set(0, 1, 'tibo'); step(20); render(); const e = PALETTES.entry('tibo', 1);
        const ok = !!e && SHEETS.tibo === MUTATORS.bigSheets('tibo').sheet; PALETTES.set(0, 0, 'tibo'); MUTATORS.clear(); step(2); return ok;
      })()`);
      check(pal, 'BIG HEADS and an alternate colourway work together (the colourway is built from the big sheet)');
    }

    // ---- the chips: VS screen, under the round timer ----
    const ch = await ev(`(() => {
      const out = {}; MUTATORS.clear(); dispatchEvent(new Event('blur')); game.modeId = 'versus2'; game.mode = 2; game.sel = [0, 1]; game.arenaPick = 0; startMatch(); step(60); render();
      out.vsOff = __M.count(0, 344, 960, 2, 215, 155, 255); MUTATORS.set('glass', true); MUTATORS.set('lowgrav', true); render(); out.vsOn = __M.count(0, 344, 960, 2, 215, 155, 255); out.vsLow = __M.count(0, 344, 960, 2, 122, 215, 255);
      __M.until(() => game.phase === 'fight', 1500); step(90); render(); out.hudOn = __M.count(0, 80, 960, 2, 215, 155, 255, 45); out.hudLow = __M.count(0, 80, 960, 2, 122, 215, 255, 45);
      MUTATORS.clear(); render(); out.hudOff = __M.count(0, 80, 960, 2, 215, 155, 255, 45); out.hudOffLow = __M.count(0, 80, 960, 2, 122, 215, 255, 45); return out;
    })()`);
    check(ch.vsOff === 0 && ch.vsOn > 40 && ch.vsLow > 40, 'the VS screen shows a coloured chip per active mutator and none when all are off (' + ch.vsOn + ' / ' + ch.vsLow + ' edge pixels)');
    check(ch.hudOn > 40 && ch.hudLow > 40 && ch.hudOff === 0 && ch.hudOffLow === 0, 'the HUD shows the same chips under the round timer during the fight and drops them when off (' + ch.hudOn + ' / ' + ch.hudLow + ' edge pixels, ' + ch.hudOff + ' / ' + ch.hudOffLow + ' when off)');

    // ---- everything off is the plain game ----
    const plain = await ev(`(() => { MUTATORS.clear(); step(2); __M.fresh(0, 1); __M.place(300); const t0 = game.tick; step(100); return { n: MUTATORS.count(), ticks: game.tick - t0, sheets: ROSTER.every(r => !MUTATORS.bigLive(r.id)), api: MUTATORS.active().length }; })()`);
    check(plain.n === 0 && plain.ticks === 100 && plain.sheets && plain.api === 0, 'with everything off the game runs one tick per step on the classic sheets');
  } finally {
    await ev('MUTATORS.clear()').catch(() => {});
  }
  check(t.p.errors.length === errors0, 'no console errors from p-mutators' + (t.p.errors.length > errors0 ? ': ' + t.p.errors.slice(errors0, errors0 + 2).join(' | ') : ''));
}
