// Tests for x-palettes: alternate colourways (palettes.js). Owner: the x-palettes agent. Runs after core.mjs and the other feature files in alphabetical order.
// Covers: the recoloured sheets, extra poses and busts against a direct render with the alternate look; L (and C) cycling on the select screen, its memory per
// fighter and across reloads; the mirror-match shift, compared in pixels on the fight screen and in the portraits; the star colourway unlocking after a match won
// by a human; the swatch strip on the select screen; no console errors. Every step is deterministic: hold(true), step(n) and key taps.
export async function run(t) {
  const { check, tap, stepUntil } = t, ev = t.eval;
  const errors0 = t.p.errors.length;

  // page helpers: __snap copies a rectangle of any canvas into a Uint32Array (through a scratch canvas made for reading), __pk packs '#rrggbb' like the canvas does
  const HELPERS = `(() => {
    const sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true });
    window.__snap = (src, x, y, w, h) => { sc.width = w; sc.height = h; sx.clearRect(0, 0, w, h); sx.drawImage(src, x, y, w, h, 0, 0, w, h); return new Uint32Array(sx.getImageData(0, 0, w, h).data.buffer.slice(0)); };
    window.__pk = h => (0xff000000 | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;
    return true;
  })()`;
  const open = async hash => { await t.open(hash); await ev(HELPERS); await ev('hold(true)'); };
  const clean = async hash => { await t.open(); await ev('localStorage.clear()'); await open(hash); };
  const stored = (side, id) => ev(`((SETTINGS.get('palettes.p${side + 1}') || {})[${JSON.stringify(id)}] | 0)`);
  const press = async code => { await tap(code); await ev('step(1)'); };   // the pressed flag waits for the next update, so a tap plus one step is one press

  // ---- the data: five fighters, each a default, three colourways and a locked star one ----
  await clean('#select');
  const ids = await ev('ROSTER.map(r => r.id)');
  const api = await ev(`(() => ({ ready: window.STUB_PALETTES === 1 && !!window.PALETTES && PALETTES.ready,
    counts: ROSTER.map(r => PALETTES.count(r.id)), stars: ROSTER.map(r => PALETTES.ways(r.id).filter(w => w.star).length),
    names: ROSTER.map(r => new Set(PALETTES.ways(r.id).map(w => w.name)).size), locked: ROSTER.map(r => PALETTES.ways(r.id).map(w => w.locked ? 1 : 0).join('')) }))()`);
  check(api.ready, 'palettes.js is loaded and ready');
  check(api.counts.length === 5 && api.counts.every(n => n === 5) && api.stars.every(n => n === 1) && api.names.every(n => n === 5), 'every fighter has a default, three colourways and one star colourway, each with its own name');
  check(api.locked.every(s => s === '00001'), 'only the star colourway starts locked: ' + api.locked.join(' '));

  // ---- the recoloured canvases equal a direct render of the fighter with the alternate look (sheet, extra poses and bust) ----
  for (const id of ids) {
    const r = await ev(`(() => {
      const id = ${JSON.stringify(id)}, saved = LOOK[id], out = [];
      const orig = __snap(SHEETS[id], 0, 0, SHEETS[id].width, SHEETS[id].height); let opaque = 0; for (const v of orig) if (v >>> 24 === 255) opaque++;
      for (let idx = 1; idx <= 4; idx++) {
        const e = PALETTES.entry(id, idx); let bad = 0, changed = 0;
        LOOK[id] = PALETTES.look(id, idx);
        try {
          const w = SHEETS[id].width, h = SHEETS[id].height, img = document.createElement('canvas').getContext('2d').createImageData(w, h);
          ANIMS.forEach((a, row) => { for (let f = 0; f < a.f; f++) renderFrame(id, a.n, f).writeTo(img, f * FW, row * FH); });
          const got = __snap(e.sheet, 0, 0, w, h), want = new Uint32Array(img.data.buffer);
          for (let i = 0; i < got.length; i++) { if (got[i] !== want[i]) bad++; if (got[i] !== orig[i]) changed++; }
          const xw = XSHEETS[id].width, xh = XSHEETS[id].height, xi = document.createElement('canvas').getContext('2d').createImageData(xw, xh);
          XROWS.forEach((n, row) => { for (let f = 0; f < XFRAMES; f++) renderFrame(id, n, f).writeTo(xi, f * FW, row * FH); });
          const xg = __snap(e.xsheet, 0, 0, xw, xh), xwant = new Uint32Array(xi.data.buffer); for (let i = 0; i < xg.length; i++) if (xg[i] !== xwant[i]) bad++;
          const bw = HEADCANVAS[id].width, bh = HEADCANVAS[id].height, bg = __snap(e.bust, 0, 0, bw, bh), bwant = __snap(canvasOf(drawBust(id)), 0, 0, bw, bh);
          for (let i = 0; i < bg.length; i++) if (bg[i] !== bwant[i]) bad++;
        } finally { LOOK[id] = saved; }
        out.push([bad, Math.round(changed * 100 / opaque)]);
      }
      return out;
    })()`);
    check(r.every(x => x[0] === 0), id + ': all four recoloured sets match a direct render with the alternate look (differing pixels ' + r.map(x => x[0]).join('/') + ')');
    check(r.every(x => x[1] >= 1 && x[1] <= 99), id + ': colourways change the clothes, not the whole fighter (changed share of the sheet in percent ' + r.map(x => x[1]).join('/') + ')');
  }
  check(await ev('PALETTES.clashes()') === 0, 'no two classic colours of a fighter need different colourway targets');

  // ---- select screen: L cycles the highlighted fighter's colourway, per fighter, and the choice is stored ----
  await clean('#select');
  await ev('game.sel = [0, 1]; game.mode = 1; game.ready = [false, false]');
  const a = await ev('PALETTES.fighterId(0)'), b = await ev('ROSTER[2].id');
  check(await stored(0, a) === 0 && await ev('PALETTES.effective(0)') === 0, 'a new player starts on the default colourway');
  const seq = []; for (let i = 0; i < 4; i++) { await press('KeyL'); seq.push(await stored(0, a)); }
  check(seq.join() === '1,2,3,0', 'L cycles the colourways and skips the locked star one: ' + seq.join());
  await press('KeyL');
  check(await stored(0, a) === 1 && await ev('PALETTES.choice(0)') === 1, 'the stored colourway is read back as the choice of player 1');
  await ev('game.sel[0] = 2');
  check(await ev('PALETTES.effective(0)') === 0 && await ev('PALETTES.fighterId(0)') === b, 'another fighter on the cursor starts on its own default');
  await press('KeyL');
  check(await stored(0, b) === 1 && await stored(0, a) === 1 && await stored(1, 'poteto') === 0, 'cycling changes only the highlighted fighter of the side that pressed');
  await press('KeyC');
  check(await stored(0, b) === 2, 'C cycles as well in one-player mode');
  await ev('game.sel[0] = 0');
  check(await ev('PALETTES.effective(0)') === 1, 'going back to a fighter shows the colourway it had');

  await open('#select');
  check(await ev('PALETTES.choice(0)') === 1 && await stored(0, b) === 2, 'the choices survive a reload (SETTINGS)');

  // two players: each side cycles its own fighter
  await ev('game.mode = 0; game.sel = [0, 1]; game.ready = [false, false]');
  await press('Numpad3');
  check(await stored(1, 'poteto') === 1 && await stored(0, a) === 1, 'NUM3 cycles player 2 in a two-player game and leaves player 1 alone');
  await press('KeyL');
  check(await stored(0, a) === 2 && await stored(1, 'poteto') === 1, 'L cycles player 1 in a two-player game and leaves player 2 alone');
  await ev('game.ready[0] = true'); await press('KeyL');
  check(await stored(0, a) === 2, 'a side that is ready no longer cycles');
  await ev('game.ready = [false, false]');

  // one player: after the pick, the same key dresses the opponent; in a mirror the opponent never gets the colourway of player 1
  await ev('game.mode = 1; game.sel = [0, 0]; game.ready = [true, false]');
  const wear = [await ev('PALETTES.effective(1)')];
  for (let i = 0; i < 4; i++) { await press('KeyL'); wear.push(await ev('PALETTES.effective(1)')); }
  const p1wear = await ev('PALETTES.effective(0)');
  check(wear.every(v => v !== p1wear) && new Set(wear).size >= 3, 'in a mirror the opponent cycles through the colourways that player 1 does not wear (' + wear.join() + ' against ' + p1wear + ')');

  // ---- mirror match on the fight screen: the two fighters wear different colourways (pixels) ----
  await clean('#demo=0,0&stop');
  check(await stepUntil('fight') === 'fight', 'the mirror match reaches the fight');
  const MIRROR = `(() => {
    const id = game.f[0].d.id, i0 = PALETTES.effective(0), i1 = PALETTES.effective(1);
    const garment = idx => idx === 0 ? new Set(PALETTES.entry(id, 1).map.keys()) : new Set(PALETTES.entry(id, idx).map.values());
    const g0 = garment(i0), g1 = garment(i1), ex0 = new Set([...g0].filter(c => !g1.has(c))), ex1 = new Set([...g1].filter(c => !g0.has(c)));
    const post = window.drawPost; window.drawPost = () => {};   // the post effect (scanlines, vignette) changes every colour on screen, so it is left out of this comparison
    let A, B; const hid = game.f.map(f => f.hidden);
    try { render(); A = __snap(cv, 0, 0, W, H); game.f.forEach(f => { f.hidden = true; }); render(); B = __snap(cv, 0, 0, W, H); }
    finally { window.drawPost = post; game.f.forEach((f, i) => { f.hidden = hid[i]; }); }
    const half = [{ n: 0, a: 0, b: 0, cols: new Set() }, { n: 0, a: 0, b: 0, cols: new Set() }];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (A[i] === B[i]) continue; const o = half[x < W / 2 ? 0 : 1]; o.n++; o.cols.add(A[i]); if (ex0.has(A[i])) o.a++; if (ex1.has(A[i])) o.b++; }
    const only = (p, q) => [...p].filter(c => !q.has(c)).length;
    return { i0, i1, n: [half[0].n, half[1].n], p1: [half[0].a, half[0].b], p2: [half[1].a, half[1].b], only: [only(half[0].cols, half[1].cols), only(half[1].cols, half[0].cols)], ex: [ex0.size, ex1.size] };
  })()`;
  let m = await ev(MIRROR);
  check(m.i0 !== m.i1 && m.i0 === 0, 'a mirror match gives the two sides different colourways: ' + m.i0 + ' and ' + m.i1);
  check(m.n[0] > 1000 && m.n[1] > 1000 && m.ex[0] >= 4 && m.ex[1] >= 4, 'both fighters are drawn: ' + m.n.join(' / ') + ' sprite pixels');
  check(m.p1[0] > 200 && m.p1[1] * 20 < m.p1[0], 'player 1 wears the default clothes on the fight screen (own ' + m.p1[0] + ' pixels, other ' + m.p1[1] + ')');
  check(m.p2[1] > 200 && m.p2[0] * 20 < m.p2[1], 'player 2 wears the other colourway on the fight screen (own ' + m.p2[1] + ' pixels, other ' + m.p2[0] + ')');
  check(m.only[0] >= 4 && m.only[1] >= 4, 'the two sides share few colours: ' + m.only.join(' and ') + ' colours belong to one side only');
  await ev(`PALETTES.set(0, 2); PALETTES.set(1, 2)`);
  m = await ev(MIRROR);
  check(m.i0 === 2 && m.i1 === 3 && m.only[0] >= 4 && m.only[1] >= 4, 'when both sides picked the same colourway, player 2 is moved to the next one: ' + m.i0 + ' and ' + m.i1 + ' (' + m.only.join(' and ') + ' own colours)');

  // the portraits and head icons of the VS and HUD screens follow the side too (flip = player 2)
  const pr = await ev(`(() => {
    const id = game.f[0].d.id, i0 = PALETTES.effective(0), i1 = PALETTES.effective(1);
    const garment = idx => idx === 0 ? new Set(PALETTES.entry(id, 1).map.keys()) : new Set(PALETTES.entry(id, idx).map.values());
    const g0 = garment(i0), g1 = garment(i1), ex0 = new Set([...g0].filter(c => !g1.has(c))), ex1 = new Set([...g1].filter(c => !g0.has(c)));
    const c2 = document.createElement('canvas'); c2.width = c2.height = 160; const x2 = c2.getContext('2d', { willReadFrequently: true });
    const grab = draw => { x2.clearRect(0, 0, 160, 160); draw(); const d = new Uint32Array(x2.getImageData(0, 0, 160, 160).data.buffer); let a = 0, b = 0; for (const v of d) { if (ex0.has(v)) a++; if (ex1.has(v)) b++; } return [a, b]; };
    return { portrait: [grab(() => drawPortrait(x2, id, 0, 0, 160, 160, false)), grab(() => drawPortrait(x2, id, 0, 0, 160, 160, true))],
      icon: [grab(() => drawHeadIcon(x2, id, 0, 0, 160, false)), grab(() => drawHeadIcon(x2, id, 0, 0, 160, true))] };
  })()`);
  check(pr.portrait[0][0] > 50 && pr.portrait[0][1] === 0 && pr.portrait[1][1] > 50 && pr.portrait[1][0] === 0, 'the portrait follows the side: ' + JSON.stringify(pr.portrait));
  check(pr.icon[0][0] > 50 && pr.icon[0][1] === 0 && pr.icon[1][1] > 50 && pr.icon[1][0] === 0, 'the head icon follows the side: ' + JSON.stringify(pr.icon));

  // a computer-controlled winner unlocks nothing
  await ev(`BUS.emit('match:end', { winner: game.f[0], loser: game.f[1], wins: [2, 0], rounds: 2, modeId: 'versus' })`);
  check(await ev(`PALETTES.unlocked(${JSON.stringify(ids[0])})`) === false && await ev('PALETTES.set(0, 4)') === -1, 'a computer winner does not unlock a star colourway, and a locked one cannot be chosen');

  // ---- winning a match as a human unlocks the star colourway of the winner (stored locally) ----
  await clean('#select');
  await ev(`SETTINGS.set('rounds', 1); game.sel = [0, 1]; game.mode = 1; startMatch(); game.f[0].cpu = false; game.f[1].cpu = true;`);
  check(await stepUntil('fight', 3000) === 'fight', 'a one-round match with a human player 1 reaches the fight');
  await ev(`(() => { const [x, y] = game.f; y.inv = 0; y.hp = 1; y.takeHit(x, 60, 3, 14, 'punch'); })()`);
  check(await stepUntil('over', 30000) === 'over', 'the human wins and the end screen shows');
  const star = ids[0];
  check(await ev(`PALETTES.unlocked(${JSON.stringify(star)})`) === true && await ev(`!!SETTINGS.get('palettes.unlocked')[${JSON.stringify(star)}]`) === true, 'the winner unlocks his star colourway and it is stored');
  check(await ev(`PALETTES.ways(${JSON.stringify(star)})[4].locked`) === false && await ev(`PALETTES.ways(${JSON.stringify(ids[1])})[4].locked`) === true, 'only the star colourway of the winner is open');
  const note = await ev(`(() => { for (let i = 0; i < 30; i++) render(); const gold = __pk('#ffe27a'), count = () => { let n = 0; for (const v of __snap(cv, 0, 130, W, 40)) if (v === gold) n++; return n; };
    const withNote = count(), n = PALETTES.note(); PALETTES.clearNote(); render(); return { n, gain: withNote - count() }; })()`);
  check(note.n && note.n.id === star && /\S/.test(note.n.name) && note.gain >= 60, 'the end screen announces the unlock in text: ' + JSON.stringify(note.n) + ', ' + note.gain + ' gold pixels');

  // ---- the star colourway can be picked now, and the swatch strip draws all five slots ----
  await open('#select');
  await ev('game.sel = [0, 1]; game.mode = 1; game.ready = [false, false]');
  const seq2 = []; for (let i = 0; i < 4; i++) { await press('KeyL'); seq2.push(await stored(0, star)); }
  check(seq2.join() === '1,2,3,4' && await ev('PALETTES.effective(0)') === 4, 'with the star colourway open, L reaches it after the three others: ' + seq2.join());
  const draw = async () => ev(`(() => { render(); const S = __snap(cv, 0, 0, W, H), id = PALETTES.fighterId(0), out = [];
    for (let i = 0; i < 5; i++) { const r = PALETTES.swatchRect(0, i), at = (dx, dy) => S[(r.y + dy) * W + r.x + dx], [p, q] = PALETTES.swatch(id, i), lock = PALETTES.ways(id)[i].locked; let gold = 0;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (at(x, y) === __pk('#ffe27a')) gold++;
      out.push({ lock, left: at(1, 2) === __pk(p), right: at(12, 2) === __pk(q), dim: at(1, 2) === __pk('#26202c'), gold }); }
    return out; })()`);
  let sw = await draw();
  check(sw.slice(0, 4).every(s => !s.lock && s.left && s.right && s.gold === 0), 'the first four swatches show the garment colour and the accent of their colourway on the select screen');
  check(!sw[4].lock && sw[4].left && sw[4].right && sw[4].gold >= 5, 'the open star colourway has a swatch with a star: ' + sw[4].gold + ' gold pixels');
  await clean('#select');
  sw = await draw();
  check(sw[4].lock && sw[4].dim && sw[4].gold === 0 && !sw[4].left, 'the locked star colourway shows as a dim slot');

  check(t.p.errors.length === errors0, 'colourways raise no console errors' + (t.p.errors.length === errors0 ? '' : ': ' + t.p.errors.slice(errors0).join(' | ').slice(0, 300)));
}
