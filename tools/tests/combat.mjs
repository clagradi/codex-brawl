// Combat depth checks: hit states, guard heights, counter and punish, the 3-bar meter (EX, breaker, taunt), target combos, the CPU and the on-screen hints.
// Owner: combat. Every scenario is driven by step() with the real-time loop frozen, so nothing here depends on wall-clock timing.
export async function run(t) {
  const { check } = t, ev = t.eval;
  const ids = ['tibo', 'poteto', 'dot', 'wang', 'muse'];
  const TCW = {
    tibo: [['KKP', 'HOTFIX CHAIN'], ['PKK', 'ROLLBACK']], poteto: [['KPP', 'DOUBLE MASH'], ['PKP', 'FRY CYCLE']], dot: [['KKK', 'DOT DASH'], ['KPK', 'ROUND TRIP']],
    wang: [['KKPK', 'SCALING PLAN'], ['PKPP', 'LAB RETREAT']], muse: [['KPKP', 'FLUFF FLURRY'], ['PKKK', 'PAW SHUFFLE']],
  };

  // ---- scene helpers, installed once per page load ----
  const boot = async (i = 0, j = 1) => {
    await t.open('#select');
    await ev(`(() => {
      hold(true); SETTINGS.set('rounds', 2); SETTINGS.set('difficulty', 'normal'); game.sel = [${i}, ${j}]; game.mode = 1; startMatch();
      let n = 0; while (game.phase !== 'fight' && n++ < 3000) step(1);
      window.__hs = []; window.__hits = []; window.__blocks = []; window.__ev = [];
      BUS.on('hitstate', p => __hs.push(p.state)); BUS.on('hit', p => __hits.push(p)); BUS.on('block', p => __blocks.push(p));
      for (const k of ['breaker', 'ex', 'taunt']) BUS.on(k, p => __ev.push([k, p]));
      window.CB = {
        place(xa, xb) {
          const [a, b] = game.f; game.proj = []; game.fx = []; game.delayed = []; game.popups = []; game.hitstop = 0; game.slow = 0; game.phase = 'fight';
          for (const f of [a, b]) { f.reset(); f.cpu = false; f.t = 100; f.lastHitT = 0; }
          a.x = xa; b.x = xb; a.face = 1; b.face = -1; __hs.length = 0; __hits.length = 0; __blocks.length = 0; __ev.length = 0;
          return [a, b];
        },
        calm() { game.hitstop = 0; game.slow = 0; },
        evs(k) { return __ev.filter(e => e[0] === k).length; },
      };
      return game.phase;
    })()`);
  };

  // ---- hit states ----
  await boot(0, 1);
  const hs = await ev(`(() => {
    const out = {}, hitstate = () => __hs.join(), last = () => __hits[__hits.length - 1];
    let [a, b] = CB.place(300, 360);
    // launch: once per combo
    b.takeHit(a, 8, 3.5, 26, 'kick', ATK.punch3); out.launch = [hitstate(), b.vy < 0, b.state];
    b.inv = 0; b.takeHit(a, 8, 3.5, 26, 'kick', ATK.punch3); out.launchTwice = hitstate();
    // crumple: a heavy counter hit on a grounded fighter that is in the startup of a kick
    [a, b] = CB.place(300, 360); b.set('kick'); b.atk = 'kick'; b.st = 2; b.takeHit(a, 8, 7, 20, 'kick', ATK.kick);
    out.crumple = [hitstate(), b.state, b.stun >= 50, last().counter === true, b.frame()[0]];
    b.inv = 0; a.set('special'); a.mv = MOVES[a.d.id].sp[2]; b.takeHit(a, 8, 5, 20, 'hit'); out.crumpleTwice = hitstate();
    // a flagged special crumples on its own
    [a, b] = CB.place(300, 360); a.set('special'); a.mv = MOVES[a.d.id].sp[2]; b.takeHit(a, 8, 5, 20, 'hit'); out.spCrumple = [hitstate(), b.state];
    // stagger: a counter-hit overhead, no knockdown
    [a, b] = CB.place(300, 360); b.set('punch'); b.atk = 'punch'; b.st = 2; b.takeHit(a, 8, 4, 24, 'kick', ATK.ovh_tibo);
    out.stagger = [hitstate(), b.state, b.stun >= 40, last().counter === true, last().hl];
    // ground bounce: an air kick on a foe that is falling near the floor
    [a, b] = CB.place(300, 360); b.set('hurt'); b.y = GROUND - 40; b.vy = 3; b.stun = 30; a.y = GROUND - 60; b.takeHit(a, 8, 6, 20, 'kick', ATK.airk);
    out.bounce = [hitstate(), b.vy < -8];
    // wall bounce: a heavy hit within 40 px of the wall, once per combo
    [a, b] = CB.place(150, 70); b.takeHit(a, 8, 7, 20, 'kick', ATK.kick);
    out.wall = [hitstate(), b.vx > 3, b.state];
    b.inv = 0; b.takeHit(a, 8, 7, 20, 'kick', ATK.kick); out.wallOnce = hitstate();
    return out;
  })()`);
  check(hs.launch[0] === 'launch' && hs.launch[1] && hs.launchTwice === 'launch', 'launch happens once per combo: ' + JSON.stringify([hs.launch, hs.launchTwice]));
  check(hs.crumple[0] === 'crumple' && hs.crumple[1] === 'hurt' && hs.crumple[2] && hs.crumple[3] && hs.crumple[4] === 'hit' && hs.crumpleTwice === 'crumple', 'a heavy counter hit crumples (slow collapse, long hitstun), once per combo: ' + JSON.stringify([hs.crumple, hs.crumpleTwice]));
  check(hs.spCrumple[0] === 'crumple' && hs.spCrumple[1] === 'hurt', 'a flagged special crumples on its own: ' + JSON.stringify(hs.spCrumple));
  check(hs.stagger[0] === 'stagger' && hs.stagger[1] === 'hurt' && hs.stagger[2] && hs.stagger[3] && hs.stagger[4] === 'ovh', 'a counter-hit overhead staggers without a knockdown: ' + JSON.stringify(hs.stagger));
  check(hs.bounce[0] === 'bounce' && hs.bounce[1], 'an air kick on a falling foe near the floor ground-bounces: ' + JSON.stringify(hs.bounce));
  check(hs.wall[0] === 'wall' && hs.wall[1] && hs.wallOnce === 'wall', 'a heavy hit within 40 px of the wall throws the victim back, once per combo: ' + JSON.stringify([hs.wall, hs.wallOnce]));

  const hk = await ev(`(() => {
    const out = {}; let [a, b] = CB.place(300, 360);
    const rise = opt => { [a, b] = CB.place(100, 560); b.takeHit(a, 7, 4, 20, 'kick', opt); const st = __hs.join(); CB.calm(); let n = 0; while (n < 200) { a.x = 100; step(1); n++; if (b.state === 'idle') break; } return [n, st]; };
    const sweep = rise(ATK.sweep), plain = rise({ knock: true });
    [a, b] = CB.place(300, 360); b.takeHit(a, 12, 4, 0, 'kick', { knock: true, unblock: true, force: true });
    return { sweep: sweep[0], hsSweep: sweep[1], plain: plain[0], hsPlain: plain[1], throwState: __hs.join() };
  })()`);
  check(hk.hsSweep === 'hard' && hk.hsPlain === '' && hk.sweep >= hk.plain + 15, 'a sweep is a hard knockdown: the victim stays down longer than after a plain knockdown: ' + JSON.stringify(hk));
  check(hk.throwState === 'hard', 'a throw is a hard knockdown too: ' + JSON.stringify(hk.throwState));

  // ---- guard heights ----
  const g = await ev(`(() => {
    const out = {}; let [a, b] = CB.place(300, 360);
    const guard = (opt, crouch, dmg = 4) => { [a, b] = CB.place(300, 360); b.set('block'); b.cb.crouch = crouch; const hp0 = b.hp; b.takeHit(a, dmg, 3, 14, 'punch', opt); return { lost: +(hp0 - b.hp).toFixed(2), hit: __hits.length, blk: __blocks.length, flash: b.cb.flashT > game.tick, hl: (__hits[0] || __blocks[0] || {}).hl }; };
    out.lowStand = guard(ATK.low, false); out.lowCrouch = guard(ATK.low, true); out.sweepStand = guard(ATK.sweep, false, 7);
    out.ovhStand = guard(ATK.ovh_tibo, false, 8); out.ovhCrouch = guard(ATK.ovh_tibo, true, 8); out.airCrouch = guard(ATK.airp, true, 5);
    out.midStand = guard(ATK.punch, false); out.midCrouch = guard(ATK.punch, true);
    return out;
  })()`);
  check(g.lowStand.hit === 1 && g.lowStand.blk === 0 && g.lowStand.flash && g.lowStand.hl === 'low' && g.lowCrouch.blk === 1 && g.lowCrouch.hit === 0, 'a low beats a standing guard and is blocked crouching: ' + JSON.stringify([g.lowStand, g.lowCrouch]));
  check(g.sweepStand.hit === 1 && g.ovhStand.blk === 1 && g.ovhStand.hit === 0 && g.ovhCrouch.hit === 1 && g.ovhCrouch.flash && g.ovhCrouch.hl === 'ovh', 'an overhead beats a crouching guard and is blocked standing: ' + JSON.stringify([g.sweepStand, g.ovhStand, g.ovhCrouch]));
  check(g.airCrouch.hit === 1 && g.midStand.blk === 1 && g.midCrouch.blk === 1, 'jump attacks are overheads; mids are blocked either way: ' + JSON.stringify([g.airCrouch, g.midStand, g.midCrouch]));

  // ---- chip damage on blocked specials and supers ----
  const chip = await ev(`(() => {
    const out = {}; let [a, b] = CB.place(300, 360);
    const lost = (setup, kind, opt) => { [a, b] = CB.place(300, 360); setup(); b.set('block'); b.cb.crouch = false; const hp0 = b.hp; b.takeHit(a, 6, 3, 14, kind, opt); return { lost: +(hp0 - b.hp).toFixed(2), blk: __blocks.length, hit: __hits.length }; };
    out.sp = lost(() => { a.set('special'); a.mv = MOVES[a.d.id].sp[0]; }, 'hit');
    out.sup = lost(() => { a.set('super'); }, 'super');
    out.plain = lost(() => {}, 'punch', ATK.punch);
    return out;
  })()`);
  check(chip.sp.blk === 1 && chip.sp.lost >= 1 && chip.sup.blk === 1 && chip.sup.lost >= 1 && chip.plain.blk === 1 && chip.plain.lost < chip.sp.lost, 'blocked specials and supers chip at least a point, a blocked normal chips less: ' + JSON.stringify(chip));

  // ---- counter and punish ----
  const cp = await ev(`(() => {
    const out = {}; let [a, b] = CB.place(300, 360);
    b.takeHit(a, 10, 3, 14, 'punch', ATK.punch); const plain = __hits[0], plainLost = b.d.hp - b.hp;
    [a, b] = CB.place(300, 360); b.set('kick'); b.atk = 'kick'; b.st = 3; b.takeHit(a, 10, 3, 14, 'punch', ATK.punch); const ctr = __hits[0], ctrLost = b.d.hp - b.hp;
    out.counter = [ctr.counter, ctr.punish, plain.counter, plain.punish, +(ctrLost / plainLost).toFixed(2), b.stun >= 20];
    [a, b] = CB.place(300, 360); b.set('kick'); b.atk = 'kick'; b.st = 20; const m0 = a.meter; b.takeHit(a, 10, 3, 14, 'punch', ATK.punch); const pun = __hits[0];
    out.punish = [pun.punish, pun.counter, a.meter - m0 > 15];
    [a, b] = CB.place(300, 360); b.set('kick'); b.atk = 'kick'; b.st = 20; b.cb.landT = b.t; b.takeHit(a, 10, 3, 14, 'punch', ATK.punch); out.landedNoPunish = __hits[0].punish === false;
    [a, b] = CB.place(300, 360); b.set('win'); b.cb.taunt = 40; b.takeHit(a, 10, 3, 14, 'punch', ATK.punch); out.tauntPunish = __hits[0].punish === true;
    return out;
  })()`);
  check(cp.counter[0] === true && cp.counter[1] === false && cp.counter[2] === false && cp.counter[3] === false && cp.counter[4] >= 1.2 && cp.counter[5], 'a hit in the startup of the victim\'s move is a counter hit: payload counter:true, 1.25x damage, more hitstun: ' + JSON.stringify(cp.counter));
  check(cp.punish[0] === true && cp.punish[1] === false && cp.punish[2] && cp.landedNoPunish && cp.tauntPunish, 'a hit in the recovery of a whiffed move (or a taunt) is a punish with extra meter, but not after a move that landed: ' + JSON.stringify([cp.punish, cp.landedNoPunish, cp.tauntPunish]));

  // ---- meter: EX, breaker, taunt (driven through the real key state: keys / pressed) ----
  const mt = await ev(`(() => {
    const out = {}, kc = a => codes(0, a)[0];
    const press = (hold, tap, n = 1) => { for (const a of hold) keys[kc(a)] = true; for (const a of tap) pressed[kc(a)] = true; step(n); for (const a of hold) keys[kc(a)] = false; };
    // EX by keyboard: hold super, press special
    let [a, b] = CB.place(300, 700); a.meter = 34; CB.calm(); press(['x'], ['s']);
    out.ex1 = [Math.round(a.meter), a.cb.ex, CB.evs('ex'), a.state];
    [a, b] = CB.place(300, 700); a.meter = 20; CB.calm(); press(['x'], ['s']); out.exShort = [Math.round(a.meter), CB.evs('ex')];
    [a, b] = CB.place(300, 700); a.meter = 100; CB.calm(); press(['x'], ['s']); out.exFull = [Math.round(a.meter), CB.evs('ex'), a.state];
    // an EX shot hits harder than the plain one, and the fighter with a projectile special throws a second one
    const shot = ex => { [a, b] = CB.place(200, 800); a.meter = ex ? 40 : 0; CB.calm(); if (ex) press(['x'], ['s']); else press([], ['s']); let n = 0; while (n++ < 60 && !game.proj.some(p => p.owner === a)) step(1); const q = game.proj.filter(p => p.owner === a); for (let m = 0; m < 14; m++) step(1); return { n0: q.length, n: game.proj.filter(p => p.owner === a).length, dmg: q[0] ? q[0].dmg : 0, ex: !!(q[0] && q[0].cb && q[0].cb.ex), state: a.state }; };
    out.plainShot = shot(false); out.exShot = shot(true);
    return out;
  })()`);
  check(mt.ex1[0] <= 1 && mt.ex1[1] === true && mt.ex1[2] === 1 && mt.ex1[3] === 'special', 'hold super + press special: an EX special costs exactly one bar and announces itself: ' + JSON.stringify(mt.ex1));
  check(mt.exShort[1] === 0 && mt.exShort[0] === 20, 'EX needs a full bar: with less meter the plain special comes out and nothing is spent: ' + JSON.stringify(mt.exShort));
  check((mt.exFull[0] === 67 || mt.exFull[0] === 66) && mt.exFull[1] === 1 && mt.exFull[2] === 'special', 'with three bars an EX special leaves two and does not trigger the super: ' + JSON.stringify(mt.exFull));
  check(mt.exShot.ex && mt.plainShot.ex === false && mt.exShot.dmg > mt.plainShot.dmg && mt.exShot.n >= mt.exShot.n0, 'an EX shot hits harder than the plain one: ' + JSON.stringify([mt.plainShot, mt.exShot]));

  const br = await ev(`(() => {
    const out = {}, kc = a => codes(0, a)[0];
    const press = (hold, tap, n = 1) => { for (const a of hold) keys[kc(a)] = true; for (const a of tap) pressed[kc(a)] = true; step(n); for (const a of hold) keys[kc(a)] = false; };
    const hurt = () => { for (let k = 0; k < 3; k++) { a.inv = 0; a.takeHit(b, 3, 2, 14, 'punch', ATK.punch2); } a.stun = 80; a.state === 'hurt' || a.set('hurt'); CB.calm(); };
    let [a, b] = CB.place(300, 360); hurt(); out.combo = b.combo; a.meter = 70; a.cb.brk = 0;
    press(['l'], ['x']);   // back + super while hit
    out.after = [Math.round(a.meter), a.state, b.combo, a.cb.brk > 100, CB.evs('breaker'), b.x - a.x > 60 || b.vx > 4];
    hurt(); a.meter = 70; press(['l'], ['x']); out.cool = [CB.evs('breaker'), Math.round(a.meter)];
    [a, b] = CB.place(300, 360); hurt(); a.meter = 50; press(['l'], ['x']); out.poor = [CB.evs('breaker'), Math.round(a.meter)];
    [a, b] = CB.place(300, 360); hurt(); a.meter = 70; press([], ['x']); out.noBack = CB.evs('breaker');
    return out;
  })()`);
  check(br.combo >= 3 && br.after[0] <= 4 && br.after[2] === 0 && br.after[3] && br.after[4] === 1 && br.after[5], 'back + super while hit: a breaker costs two bars, ends the combo, pushes the attacker away and fires the BUS breaker event: ' + JSON.stringify(br.after));
  check(br.cool[0] === 1 && br.poor[0] === 0 && br.poor[1] >= 49 && br.noBack === 0, 'no second breaker inside the cooldown, none without two bars, none without holding back: ' + JSON.stringify([br.cool, br.poor, br.noBack]));

  const tn = await ev(`(() => {
    const out = {}, kc = a => codes(0, a)[0];
    let [a, b] = CB.place(300, 700); a.meter = 10; CB.calm();
    keys[kc('d')] = true; step(1); keys[kc('d')] = false; step(1);
    keys[kc('d')] = true; pressed[kc('x')] = true; step(1); keys[kc('d')] = false;   // down, down + super
    for (let n = 0; n < 8; n++) step(1);
    out.taunt = [a.state, Math.round(a.meter), CB.evs('taunt'), a.cb.taunt > 0];
    let m = 0; while (a.state === 'win' && m++ < 200) step(1); out.len = m; out.end = a.state;
    [a, b] = CB.place(300, 700); a.meter = 10; CB.calm(); keys[kc('d')] = true; pressed[kc('x')] = true; step(1); keys[kc('d')] = false; out.single = a.state;
    [a, b] = CB.place(300, 700); a.meter = 40; CB.calm(); keys[kc('d')] = true; step(1); keys[kc('d')] = false; step(1); keys[kc('d')] = true; pressed[kc('x')] = true; step(1); keys[kc('d')] = false; out.withBar = [CB.evs('taunt'), a.state];
    return out;
  })()`);
  check(tn.taunt[0] === 'win' && tn.taunt[1] >= 24 && tn.taunt[2] === 1 && tn.taunt[3] && tn.len >= 50 && tn.end === 'idle', 'down, down + super with an empty meter taunts: +15 meter, a long recovery, then back to idle: ' + JSON.stringify([tn.taunt, tn.len, tn.end]));
  check(tn.single !== 'win' && tn.withBar[0] === 0, 'a single down + super is no taunt, and neither is the chord with a bar in the tank: ' + JSON.stringify([tn.single, tn.withBar]));

  // ---- target combos, overheads, move lists ----
  const mr = await ev(`(() => {
    const out = {}; for (const r of ROSTER) for (const side of [0, 1]) for (const cpu of [false, true]) {
      const rows = moveRows(r.id, side, cpu); out[r.id + side + (cpu ? 'c' : 'h')] = rows.map(x => x.input + '|' + x.name + '|' + (x.note || ''));
    }
    return out;
  })()`);
  const miss = [];
  for (const id of ids) {
    const rows = mr[id + '0c'];   // CPU labels are the plain P / K, so the strings read the same everywhere
    for (const [s, nm] of TCW[id]) if (!rows.some(r => r.startsWith([...s].join('>') + '|' + nm + '|'))) miss.push(id + ':' + s);
    if (!rows.some(r => r.startsWith('FWD + K|') && r.endsWith('|OVERHEAD'))) miss.push(id + ':overhead');
    if (!rows.some(r => r.endsWith('|LOW'))) miss.push(id + ':low');
  }
  if (Object.values(mr).some(x => x.length > 12)) miss.push('rows>12');
  check(!miss.length, 'every move list shows two target combos, the overhead and a low flag, within 12 rows: ' + (miss.join(' ') || 'ok'));

  // ---- strings and overheads are playable ----
  const pl = {};
  for (const id of ids) {
    pl[id] = await ev(`(() => {
      const id = ${JSON.stringify(id)}, strs = ${JSON.stringify(TCW[id].map(x => x[0]))}, out = {};
      const idx = ROSTER.findIndex(r => r.id === id); game.sel = [idx, (idx + 1) % ROSTER.length]; game.mode = 1; startMatch();
      let g = 0; while (game.phase !== 'fight' && g++ < 3000) step(1);
      const nodeLen = f => { const k = f.atk; if (f.state !== 'punch' && f.state !== 'kick') return 0; return k === 'punch' || k === 'kick' ? 1 : k && k.startsWith('tc_') ? k.split('_')[2].length : 0; };
      for (const str of strs) {
        const [a, b] = CB.place(300, 350); let node = 0; const seen = [];
        const rm = HOOKS.add('input', (i, side, f) => {
          if (f !== a) return;
          i.p = i.k = i.s = i.x = false;
          const pr = ch => { i[ch === 'P' ? 'p' : 'k'] = true; };
          if (node === 0) { if (!a.busy() && a.cool <= 0) { pr(str[0]); node = 1; } }
          else if (node < str.length) { const A = a.curAtk(); if (A && a.contact && nodeLen(a) === node && a.st >= A.hit) { pr(str[node]); node++; } }
          return i;
        }, 9);
        for (let n = 0; n < 220; n++) { step(1); if (a.atk && seen[seen.length - 1] !== a.atk) seen.push(a.atk); }
        rm(); out[str] = { seen, hits: __hits.length, reached: seen.includes('tc_' + id + '_' + str) };
      }
      // the overhead: FWD + K from neutral
      const [a, b] = CB.place(300, 350); CB.calm(); const kc = x => codes(0, x)[0]; keys[kc('r')] = true; pressed[kc('k')] = true; step(1); keys[kc('r')] = false;
      const seen = []; for (let n = 0; n < 50; n++) { step(1); if (a.atk && seen[seen.length - 1] !== a.atk) seen.push(a.atk); }
      out.ovh = { seen, hl: __hits.map(h => h.hl).join(), lost: b.d.hp - b.hp };
      return out;
    })()`);
  }
  for (const id of ids) {
    const r = pl[id], bad = [];
    for (const [s] of TCW[id]) if (!r[s] || !r[s].reached || r[s].hits < s.length) bad.push(s + ':' + JSON.stringify(r[s] && r[s].seen) + ':' + (r[s] && r[s].hits));
    check(!bad.length, id + ': both target-combo strings can be played and every node connects: ' + (bad.join(' ') || 'ok'));
    check(r.ovh.seen.includes('ovh_' + id) && r.ovh.hl.includes('ovh') && r.ovh.lost > 0, id + ': FWD + K from neutral throws the overhead and it hits a standing foe: ' + JSON.stringify(r.ovh));
  }

  // ---- the CPU ----
  await boot(0, 1);
  const cpu = await ev(`(() => {
    const out = {}, rnd = Math.random; Math.random = () => 0;
    const brk = diff => { SETTINGS.set('difficulty', diff); const [a, b] = CB.place(300, 360); b.cpu = true; a.combo = 4; a.lastHitT = b.t; b.set('hurt'); b.stun = 80; b.meter = 100; for (let n = 0; n < 12; n++) { b.stun = 80; step(1); } return CB.evs('breaker'); };
    try {
      out.easyBreak = brk('easy'); out.normalBreak = brk('normal'); out.hardBreak = brk('hard');
      // hard CPU reads a crouching guard and throws the overhead (it needs a K press: injected before the brain runs)
      SETTINGS.set('difficulty', 'hard'); let [a, b] = CB.place(300, 360); b.cpu = true; b.face = -1;
      const rm = HOOKS.add('input', (i, side, f) => { if (f === b) { i.k = true; i.p = i.s = i.x = i.d = false; i.l = i.r = false; } if (f === a) { i.d = true; a.cb.crouch = true; } return i; }, -1);
      const rm2 = HOOKS.add('input', (i, side, f) => { if (f === a) { a.cb.crouch = true; } return i; }, 9);
      const seen = []; for (let n = 0; n < 8; n++) { step(1); if (b.atk && seen[seen.length - 1] !== b.atk) seen.push(b.atk); } rm(); rm2();
      out.ovh = seen;
      // hard CPU pays for EX when it presses special with a bar
      [a, b] = CB.place(300, 480); b.cpu = true; b.meter = 100; b.face = -1;
      const rm3 = HOOKS.add('input', (i, side, f) => { if (f === b) { i.s = true; i.k = i.p = i.x = false; } return i; }, -1);
      for (let n = 0; n < 6; n++) step(1); rm3(); out.ex = CB.evs('ex');
    } finally { Math.random = rnd; SETTINGS.set('difficulty', 'normal'); }
    return out;
  })()`);
  check(cpu.easyBreak === 0 && cpu.normalBreak === 0 && cpu.hardBreak === 1, 'only the hard CPU breaks combos (easy and normal never do): ' + JSON.stringify([cpu.easyBreak, cpu.normalBreak, cpu.hardBreak]));
  check(cpu.ovh.includes('ovh_poteto'), 'the hard CPU throws its overhead at a crouching guard: ' + JSON.stringify(cpu.ovh));
  check(cpu.ex >= 1, 'the hard CPU uses EX specials when it has a bar: ' + cpu.ex);

  // ---- discoverable on screen: pause screen lines, round-1 hint strip, move-list rows ----
  const disc = await ev(`(() => {
    const seen = [], u0 = window.uiText; window.uiText = function (txt) { seen.push(String(txt)); return u0.apply(this, arguments); };
    try {
      CB.place(300, 600); game.phase = 'pause'; render(); const pause = seen.join(' | '); seen.length = 0;
      CB.place(300, 600); game.round = 1; game.clock = 400; render(); const hint = seen.join(' | '); seen.length = 0;
      CB.place(300, 600); game.f[0].meter = 70; render(); const bars = seen.join(' | ');
      return { pause, hint, bars };
    } finally { window.uiText = u0; }
  })()`);
  check(/FWD \+ K OVERHEAD/.test(disc.pause) && /EX SPECIAL/.test(disc.pause) && /BREAKER/.test(disc.pause) && /TAUNT/.test(disc.pause), 'the pause screen explains the overhead, EX, the breaker and the taunt: ' + disc.pause.slice(0, 300));
  check(/BARS?/.test(disc.bars) && /2 BARS/.test(disc.bars), 'the HUD shows the bar count: ' + disc.bars.slice(0, 200));
}
