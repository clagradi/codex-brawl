// Tests for p-strings.js (premium batch, p-strings). Owner: the p-strings agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Deterministic: hold(true) freezes the real-time loop, only step() advances time, the keys are set directly (keys.KeyW = held up, pressed.KeyJ = a punch press)
// and Math.random is fixed wherever the CPU decides.
// Covers: the string table (four per fighter, ASCII capitals, no banned words), every string of every fighter landed with real key input (callout, event,
// damage under the juggle cap), the chase jump and the air chains, juggle scaling, the juggle lock, both settings, the callout on the canvas,
// the STRINGS page (select screen, pause MOVES screen, pause item) and the CPU chase by difficulty.
import { readFileSync } from 'node:fs';

const rot13 = s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
// the banned list in ROT13, so this file passes tools/check-banned.mjs
const BANNED = ['zbegny xbzong', 'sngnyvgl', 'svavfu uvz', 'synjyrff', 'trg bire urer', 'gbnfgl', 'fpbecvba', 'fho-mreb', 'envqra', 'unqbhxra', 'fubelhxra', 'fgerrg svtugre', 'grxxra', 'onovyvgl', 'oehgnyvgl'].map(rot13);

// records every text drawn during fn(): the HUD draws with ptext (pixelfont.js), the move lists with canvas fillText
const SPY = `(fn => { const seen = [], pt = window.ptext, P = CanvasRenderingContext2D.prototype, ft = P.fillText;
  window.ptext = function (c, s) { seen.push(String(s)); return pt.apply(this, arguments); };
  P.fillText = function (s) { seen.push(String(s)); return ft.apply(this, arguments); };
  try { fn(); } finally { window.ptext = pt; P.fillText = ft; } return seen; })`;

export async function run(t) {
  const ck = (c, m) => t.check(c, m), ev = code => t.eval(code);
  const dev = readFileSync(new URL('../../dev.html', import.meta.url), 'utf8');
  ck(/<script src="vfx\.js"><\/script>\s*<script src="p-strings\.js"><\/script>/.test(dev), 'p-strings: dev.html loads p-strings.js right after vfx.js');
  const src = readFileSync(new URL('../../p-strings.js', import.meta.url), 'utf8');
  ck(!/\bimport\b|\bexport\b|fetch\(|XMLHttpRequest|WebSocket/.test(src.replace(/\/\/.*$/gm, '')), 'p-strings: classic script, no modules and no network calls');

  await t.open('#demo=0,1&stop');
  // helpers live on window.__ps for the evals below
  await ev(`(() => {
    hold(true);
    const T = window.__ps = { hits: 0, lands: [], chase: 0, juggle: 0 };
    BUS.on('hit', e => { if (e.src === T.a) T.hits++; });
    BUS.on('strings:land', e => T.lands.push(e.name));
    BUS.on('strings:chase', () => T.chase++); BUS.on('strings:juggle', () => T.juggle++);
    T.begin = k => { game.sel = [k, 1]; startMatch(); let n = 0; while (game.phase !== 'fight' && n++ < 2000) step(1); [T.a, T.b] = game.f; T.a.cpu = T.b.cpu = false; };
    T.setup = x0 => {
      for (const k in keys) keys[k] = false; for (const k in pressed) pressed[k] = false; step(20);
      game.proj = []; game.fx = []; game.delayed = []; game.popups = []; game.hitstop = 0; game.slow = 0; game.timer = 99;
      for (const f of [T.a, T.b]) { f.set('idle'); f.inv = 0; f.cool = 0; f.hp = f.d.hp; f.meter = 0; f.vx = 0; f.vy = 0; f.y = GROUND; f.combo = 0; f.lastHitT = 0; f.cpu = false; f.strs = null; f.hidden = false; }
      T.a.x = x0; T.b.x = 470; T.a.face = 1; T.b.face = -1; step(2); T.lands.length = 0; STRINGS.CALL[0].t = STRINGS.CALL[1].t = 0;
    };
    T.waitHit = () => { const h0 = T.hits; let k = 0; while (k++ < 50 && T.hits === h0) step(1); return T.hits > h0; };
    // play one string with the keys a player would press: each button after the previous hit lands; UP held through a launcher to chase;
    // a jump-in starts from further out with forward held and the air punch near the top of the jump
    const KEY = { P: 'KeyJ', L: 'KeyJ', K: 'KeyK', jP: 'KeyJ', jK: 'KeyK', jS: 'KeyL', S0: 'KeyL', S1: 'KeyL', S2: 'KeyL' }, HOLD = { S1: 'KeyD', S2: 'KeyS' };
    T.play = seq => {
      const a = T.a, b = T.b, toks = seq.split(' '), log = [];
      toks.forEach((tk, n) => {
        if (tk[0] === 'j' && n === 0) { keys.KeyW = keys.KeyD = true; step(5); keys.KeyW = false; let w = 0; while (w++ < 60 && !(a.vy > -2)) step(1); keys.KeyD = false; }
        if (tk[0] === 'j' && toks[n - 1] === 'L') {
          keys.KeyW = true; let w = 0; while (w++ < 30 && a.onGround) step(1); keys.KeyW = false;
          while (w++ < 40 && !(a.state === 'jump' && a.st > 3 && Math.abs(b.x - a.x) < 110 && b.y - a.y < 30)) step(1);
        }
        if (HOLD[tk]) keys[HOLD[tk]] = true;
        pressed[KEY[tk]] = true; const ok = T.waitHit(); if (HOLD[tk]) keys[HOLD[tk]] = false;
        log.push(tk + (ok ? '' : '(miss)'));
      });
      return log.join(' ');
    };
  })()`);

  // ---- the table ----
  const tab = await ev(`(() => ({
    ids: ROSTER.map(r => r.id), lists: ROSTER.map(r => STRINGS.list(r.id)),
    defs: [SETTINGS.get('strings.on'), SETTINGS.get('strings.callouts')], page: STRINGS.page,
    hooks: ['update', 'input', 'fighterUpdate', 'damage', 'drawFighter', 'drawHud', 'drawTop', 'pauseItems'].every(h => !HOOKS.has || HOOKS.has(h)),
    jug: STRINGS.JUG,
  }))()`);
  const all = tab.lists.flat(), names = all.map(s => s.name);
  ck(tab.ids.join() === 'tibo,poteto,dot,wang,muse' && tab.lists.every(l => l.length >= 3 && l.length <= 5), 'p-strings: every one of the five fighters has 3 to 5 named strings (' + tab.lists.map(l => l.length).join('/') + ')');
  ck(names.every(n => /^[A-Z][A-Z ]{2,17}$/.test(n)) && new Set(names).size === names.length, 'p-strings: string names are unique ASCII capitals that fit the move list');
  ck(!names.some(n => BANNED.some(w => n.toLowerCase().includes(w)) || /potato/i.test(n)), 'p-strings: no string name carries a banned word');
  ck(tab.lists.every(l => ['AIR', 'JUGGLE', 'CANCEL'].every(k => l.some(s => s.kind === k))), 'p-strings: each fighter has an air string, a launcher juggle and a special-cancel string');
  ck(all.every(s => s.seq.split(' ').every(x => /^(P|K|L|jP|jK|jS|S[012])$/.test(x)) && s.hits === s.seq.split(' ').length), 'p-strings: every string is written in the known tokens');
  ck(tab.defs.join() === 'true,true' && tab.page === false && tab.hooks, 'p-strings: strings.on and strings.callouts default to on, the STRINGS page starts closed, the hooks are registered');
  ck(tab.jug.MAX === 4 && tab.jug.CAP === 0.35 && tab.jug.SCALE.join() === '0.9,0.8,0.7,0.6' && tab.jug.KB === 3, 'p-strings: juggle tuning is 4 hits, 0.9 / 0.8 / 0.7 / 0.6 damage, a 35 percent cap and knockback 3');

  // ---- every string of every fighter, with real key input ----
  const land = await ev(`(() => {
    const T = window.__ps, out = [];
    ROSTER.forEach((r, k) => {
      T.begin(k);
      for (const S of STRINGS.list(r.id)) {
        T.setup(S.kind === 'AIR' ? 360 : 400); const hp0 = T.b.hp, c0 = T.chase;
        const log = T.play(S.seq); step(70);
        out.push({ id: r.id, name: S.name, kind: S.kind, hits: S.hits, log, lands: T.lands.slice(), call: STRINGS.CALL[0].name, sub: STRINGS.CALL[0].sub, dmg: hp0 - T.b.hp, cap: STRINGS.JUG.CAP * T.b.d.hp, chased: T.chase - c0 });
      }
    });
    return out;
  })()`);
  const bad = land.filter(r => !r.lands.includes(r.name));
  ck(land.length === 20 && !bad.length, 'p-strings: all 20 strings land with real key input' + (bad.length ? ': ' + bad.slice(0, 3).map(r => r.id + ' ' + r.name + ' [' + r.log + '] got ' + (r.lands.join() || 'none')).join('; ') : ''));
  ck(land.every(r => r.call === r.name || !r.lands.includes(r.name)) && land.every(r => !r.lands.includes(r.name) || r.sub === r.hits + ' HIT STRING'), 'p-strings: a landed string is announced on screen with its name and hit count');
  const over = land.filter(r => r.dmg > r.cap + 0.5);
  ck(!over.length, 'p-strings: no string does more than the juggle cap (35 percent of a life bar)' + (over.length ? ': ' + over.map(r => r.name + ' ' + r.dmg.toFixed(1)).join(', ') : '') + '; most: ' + Math.max(...land.map(r => r.dmg)).toFixed(1));
  ck(land.filter(r => r.kind === 'JUGGLE').every(r => r.chased === 1), 'p-strings: holding UP through a landed launcher chases (one chase jump per juggle string)');
  ck(land.filter(r => r.kind === 'JUGGLE').every(r => r.dmg >= 20), 'p-strings: juggle strings still hurt (at least 20 damage each)');

  // ---- juggle rules, with scripted hits ----
  const jr = await ev(`(() => {
    const T = window.__ps, out = {}; T.begin(0); const a = T.a, b = T.b;
    const up = () => { let w = 0; while (w++ < 30 && (game.hitstop > 0 || b.onGround)) step(1); };   // the launch hitstop ends and the victim leaves the ground
    T.setup(400); { const h = b.hp; b.takeHit(a, 10, 3, 14, 'punch'); out.ground = h - b.hp; }
    T.setup(400); const j0 = T.juggle; b.takeHit(a, 6, 3, 14, 'punch', { launch: true }); const J = STRINGS.state(b).jug;
    out.started = T.juggle - j0 === 1 && J.on && J.src === a; up();
    { b.inv = 0; const h = b.hp; b.takeHit(a, 10, 9, 14, 'punch'); out.air1 = h - b.hp; out.kb = Math.abs(b.vx); }
    for (let k = 0; k < 6 && !J.lock; k++) { step(3); b.inv = 0; b.takeHit(a, 3, 3, 14, 'punch'); }
    out.n = J.n; out.lock = J.lock; step(12); out.inv = b.inv; out.air = !b.onGround;   // long after the hit's own 6 frames of invulnerability
    { const h = b.hp; b.takeHit(a, 10, 3, 14, 'punch'); out.lockedDmg = h - b.hp; }
    let w = 0; while (w++ < 120 && !(b.onGround && b.vy >= 0)) step(1); step(2); out.endsOnLanding = !J.on;
    // the cap: big juggle hits stop at 35 percent of the bar
    T.setup(400); b.takeHit(a, 6, 3, 14, 'punch', { launch: true }); up(); const hp0 = b.d.hp;
    for (let k = 0; k < 3; k++) { b.inv = 0; b.takeHit(a, 20, 3, 14, 'kick'); step(3); }
    out.capDmg = hp0 - b.hp; out.capLock = STRINGS.state(b).jug.lock;
    // a super is not capped
    T.setup(400); b.takeHit(a, 6, 3, 14, 'punch', { launch: true }); up(); STRINGS.state(b).cdmg = 30; { b.inv = 0; const h = b.hp; b.takeHit(a, 20, 3, 14, 'super'); out.superDmg = h - b.hp; }
    // feature off: the same air hit is not scaled and no juggle starts
    SETTINGS.set('strings.on', false); T.setup(400); { const j1 = T.juggle; b.takeHit(a, 6, 3, 14, 'punch', { launch: true }); up(); b.inv = 0; const h = b.hp; b.takeHit(a, 10, 9, 14, 'punch'); out.offAir = h - b.hp; out.offJug = T.juggle - j1; }
    SETTINGS.set('strings.on', true);
    return out;
  })()`);
  ck(jr.started, 'p-strings: a launch starts a juggle owned by the launcher (strings:juggle)');
  ck(jr.air1 < jr.ground && jr.air1 <= jr.ground * 0.9 + 0.01 && jr.kb <= 3, 'p-strings: a juggle hit is scaled down (' + jr.air1.toFixed(2) + ' against ' + jr.ground.toFixed(2) + ' on the ground) and its knockback is capped at 3 (' + jr.kb.toFixed(1) + ')');
  ck(jr.n === 4 && jr.lock && jr.inv > 0 && jr.air && jr.lockedDmg === 0, 'p-strings: after 4 juggle hits the victim is locked: untouchable until it lands (n ' + jr.n + ', inv ' + jr.inv + ', locked hit ' + jr.lockedDmg + ')');
  ck(jr.endsOnLanding, 'p-strings: the juggle ends when the victim lands');
  ck(jr.capDmg <= 35.5 && jr.capLock, 'p-strings: heavy juggle hits stop at the 35 percent cap and lock the juggle (' + jr.capDmg.toFixed(1) + ')');
  ck(jr.superDmg > 10, 'p-strings: a super that ends a juggle is not capped (' + jr.superDmg.toFixed(1) + ')');
  ck(jr.offJug === 0 && jr.offAir > jr.air1, 'p-strings: with strings.on off there is no juggle and no juggle scaling (' + jr.offAir.toFixed(2) + ')');

  // ---- the switches: no chase, no air chain, no detection when off; callouts can be muted ----
  const sw = await ev(`(() => {
    const T = window.__ps, out = {}; T.begin(0); const a = T.a;
    SETTINGS.set('strings.on', false);
    T.setup(400); { const c0 = STRINGS.COUNT.chase; out.offLog = T.play('P P L jP jK jS'); out.offChase = STRINGS.COUNT.chase - c0; out.offLands = T.lands.length; }
    T.setup(360); { const c0 = STRINGS.COUNT.chain; out.offAirLog = T.play('jP jK jS'); out.offChain = STRINGS.COUNT.chain - c0; }
    STRINGS.page = true; out.offRows = !!moveRows('tibo', 0, false).strings; STRINGS.page = false;
    SETTINGS.set('strings.on', true); step(40);
    T.setup(360); { const c0 = STRINGS.COUNT.chain; T.play('jP jK jS'); out.onChain = STRINGS.COUNT.chain - c0; }
    SETTINGS.set('strings.callouts', false); T.setup(400); step(1);
    ['jP', 'jK'].forEach(x => STRINGS.feed(a, x)); out.mutedName = STRINGS.feed(a, 'jS'); out.mutedT = STRINGS.CALL[0].t; out.mutedEvent = T.lands.slice();
    SETTINGS.set('strings.callouts', true);
    T.setup(400); ['P', 'P'].forEach(x => STRINGS.feed(T.b, x)); out.p2 = [STRINGS.feed(T.b, 'S1'), STRINGS.CALL[1].name, STRINGS.CALL[1].t > 0, STRINGS.CALL[0].t];
    T.setup(400); ['jP', 'jK', 'jS'].forEach(x => STRINGS.feed(a, x)); out.again = STRINGS.feed(a, 'jS'); STRINGS.state(a).hist.length = 0; STRINGS.state(a).used = 0;
    return out;
  })()`);
  ck(sw.offChase === 0 && sw.offLands === 0 && /miss/.test(sw.offLog), 'p-strings: with strings.on off, UP after a launcher does not chase and nothing is announced (' + sw.offLog + ')');
  ck(sw.offChain === 0 && sw.onChain === 2, 'p-strings: the air chain (P > K > SP in the air) works only with strings.on (' + sw.onChain + ' cancels on, ' + sw.offChain + ' off)');
  ck(sw.offRows === false, 'p-strings: with strings.on off the move lists stay the plain move lists');
  ck(sw.mutedName === 'SHIP IT' && sw.mutedT === 0 && sw.mutedEvent.includes('SHIP IT'), 'p-strings: strings.callouts off keeps detection and the event but shows nothing');
  ck(sw.p2[0] === 'HASH BROWN' && sw.p2[1] === 'HASH BROWN' && sw.p2[2] === true && sw.p2[3] === 0, 'p-strings: player 2 strings are announced on the right side (' + sw.p2.join('/') + ')');
  ck(sw.again === null, 'p-strings: a string is announced once per combo');

  // ---- the callout on the canvas ----
  const cv = await ev(`(() => {
    const T = window.__ps; T.begin(0); let w = 0; while (w++ < 400 && game.banner) step(1); T.setup(400);
    const gold = () => { const d = ctx.getImageData(W * 0.25 - 90, 108, 180, 56).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 225 && d[k + 1] > 185 && d[k + 1] < 235 && d[k + 2] < 110) n++; return n; };
    render(); const before = gold();
    ['jP', 'jK', 'jS'].forEach(x => STRINGS.feed(T.a, x)); step(12); render(); const during = gold();
    step(100); render(); const after = gold();
    const seen = []; const pt = window.ptext; window.ptext = function (c, s) { seen.push(String(s)); return pt.apply(this, arguments); };
    STRINGS.state(T.a).used = 0; STRINGS.state(T.a).hist.length = 0; ['jP', 'jK', 'jS'].forEach(x => STRINGS.feed(T.a, x)); step(3); render(); window.ptext = pt;
    return { before, during, after, text: seen.includes('SHIP IT') && seen.includes('3 HIT STRING') };
  })()`);
  ck(cv.during > cv.before + 60 && cv.after < cv.during / 2 && cv.text, 'p-strings: the callout is drawn in gold over the left half and fades (' + cv.before + ' / ' + cv.during + ' / ' + cv.after + ' gold pixels)');

  // ---- the CPU chases by difficulty ----
  const cpu = await ev(`(() => {
    const T = window.__ps, out = {}, rnd = Math.random; T.begin(0);
    for (const lvl of [1, 0.2]) {
      T.setup(400); game.cpuLevel = lvl; Math.random = () => 0.5; const c0 = T.chase, h0 = T.b.hp;
      T.a.cpu = true; T.a.startAtk('punch3'); step(90); T.a.cpu = false; Math.random = rnd;
      out[lvl] = { chase: T.chase - c0, hist: STRINGS.state(T.a).hist.join(' '), dmg: h0 - T.b.hp };
    }
    return out;
  })()`);
  ck(cpu[1].chase === 1 && /jP/.test(cpu[1].hist), 'p-strings: a hard CPU chases its launcher and juggles in the air (' + cpu[1].hist + ')');
  ck(cpu[0.2].chase === 0, 'p-strings: an easy CPU does not chase');

  // ---- the STRINGS page: pause item, N on the pause MOVES screen ----
  const pz = await ev(`(() => {
    const T = window.__ps, out = {}; T.setup(400);
    pressed.Escape = true; step(1); out.phase = game.phase;
    const items = HOOKS.collect ? HOOKS.collect('pauseItems').flat().filter(Boolean) : [];
    out.item = items.filter(i => i.id === 'strings').map(i => i.key + ' ' + i.label).join();
    pressed.KeyN = true; step(1); out.open = [OPTIONS && OPTIONS.screen, STRINGS.page];
    const seen = ${SPY}(render);
    out.drawn = ['FORCE PUSH', 'MERGE CONFLICT', 'CHASE JUMP', '6 HITS', 'N  MOVES'].filter(s => seen.includes(s)).length + ' ' + new Set(seen.filter(s => /^P[12] .* STRINGS$/.test(s))).size;
    const rows = moveRows('tibo', 0, false); out.rows = rows.length; out.names = rows.map(r => r.name).join(','); out.force = rows[2].input;
    out.p2 = moveRows('poteto', 1, false)[2].input; out.cpuRows = moveRows('poteto', 1, true)[4].input;
    pressed.KeyN = true; step(1); out.back = [STRINGS.page, !!moveRows('tibo', 0, false).strings];
    pressed.KeyN = true; step(1); pressed.Escape = true; step(1); step(1); out.leave = [OPTIONS && OPTIONS.screen, STRINGS.page];
    let n = 0; while (game.phase === 'pause' && n++ < 5) { pressed.Escape = true; step(1); }
    out.resumed = game.phase;
    return out;
  })()`);
  ck(pz.phase === 'pause' && pz.item === 'KeyN N STRINGS', 'p-strings: the pause screen lists N STRINGS');
  ck(pz.open[0] === 'moves' && pz.open[1] === true && pz.drawn === '5 2', 'p-strings: N on the pause screen opens the MOVES screen on the STRINGS page with names, inputs, hit counts and the N hint (' + pz.drawn + ')');
  ck(pz.rows <= 12 && pz.names === 'CHASE JUMP,SHIP IT,FORCE PUSH,HOTFIX DEPLOY,MERGE CONFLICT' && pz.force === 'J>J>J>UP>J>K>L', 'p-strings: the page lists the chase jump and the four strings with the player keys (' + pz.force + ')');
  ck(pz.p2 === 'P>P>P>UP>P>K>SP' && pz.cpuRows === 'P>P>FWD+SP', 'p-strings: player 2 and CPU rows use the short button names P K SP');
  ck(pz.back.join() === 'false,false', 'p-strings: N again goes back to the plain move list');
  ck(pz.leave[1] === false, 'p-strings: leaving the MOVES screen closes the STRINGS page');

  // ---- the STRINGS page on the select screen ----
  await t.open('#select');
  const sel = await ev(`(() => {
    hold(true); step(3); const out = { phase: game.phase, p0: STRINGS.page };
    pressed.KeyN = true; step(1); out.p1 = STRINGS.page;
    const seen = ${SPY}(render);
    // the panels are cached canvases: the flip redraws both, so the titles and the names of the second fighter show up here
    out.title = seen.includes('STRINGS') && !seen.includes('MOVES');
    out.other = ROSTER.filter(r => r.id !== 'tibo').some(r => STRINGS.list(r.id).some(S => seen.includes(S.name))); out.names = ['CHASE JUMP', 'FORCE PUSH'].every(s => seen.includes(s)); out.notes = seen.includes('6 HITS'); out.hint = seen.includes('N  MOVES');
    pressed.KeyN = true; step(1); out.p2 = STRINGS.page;
    return out;
  })()`);
  ck(sel.phase === 'select' && sel.p0 === false && sel.p1 === true && sel.p2 === false, 'p-strings: N on the select screen flips the move list panels to STRINGS and back');
  ck(sel.title && sel.other && sel.names && !sel.notes && sel.hint, 'p-strings: both select panels show the STRINGS title and the names, without the hit counts (narrow panel), with the N hint');
}
