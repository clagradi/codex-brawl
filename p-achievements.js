'use strict';
// ===== AGENT BRAWL premium feature: OKRS (achievements). 30 parody objectives, a toast when one is reached, an OKRS screen with progress bars. Loaded after vfx.js. =====
// Owner: p-achievements (docs/features/p-achievements.md). game.js is not edited; everything goes through BUS, HOOKS and SETTINGS.
//   - Progress is driven only by BUS events: hit, block, throw, special, super, ex, breaker, taunt, defense:perfect, hazard, stagefinish, finisher, match:start, round:end, match:end.
//     Only human fighters count (cpu === false, read when the event fires), and the training mode never counts.
//   - Saved in SETTINGS 'okrs' ({ got, n, best, cur, fx, ar, md }), written when something is unlocked, when a match ends and a couple of times a second while counters move.
//   - BUS 'okr:unlock' { id, name, desc, count, total } fires for every new objective ('unlock' belongs to arcade.js).
//   - HOOKS: 'update' (toast clock, keys of the screen), 'drawTop' (toast and screen), 'titleItems' (OKRS entry), 'pauseItems' (G OKRS).
// window.OKRS is the small API the tests use.
(() => {
  window.STUB_P_ACHIEVEMENTS = 1;   // marker for the tests: the file loaded

  SETTINGS.define('okrs', { def: null, label: 'OKRS' });   // null = nothing reached yet; otherwise the saved progress (see clean() below)

  const GOLD = '#ffd76a', STEEL = '#d8d2c4', DIM = '#8c8576', GREEN = '#7ee08a', BLUE = '#5aa6d6', RED = '#ff6b5c';
  const blip = (f, d) => { try { beep(f, d || 0.04, 'square', 0.05); } catch (e) { /* audio is optional */ } };
  const human = f => !!f && f.cpu === false;   // read at event time: the demo routes set the cpu flags after startMatch
  const qaRun = () => !!(window.__qa && window.__qa.cur);   // tools/fuzz.mjs sets __qa.cur while it plays an automated match: those never count, so a replay of the same seed stays identical
  const replaying = () => { try { return !!(window.REPLAYS && REPLAYS.state().active); } catch (e) { return false; } };   // a replay re-runs a match that already counted
  const watching = () => { try { return game.modeId === 'watch' && !!(window.WATCH && WATCH.state().kind); } catch (e) { return false; } };   // the title demo and the WATCH matches are CPU against CPU: they count for nothing here
  const counting = () => game.modeId !== 'training' && !qaRun() && !replaying() && !watching();

  // ---------- the 30 objectives: id, parody name, text, goal, and how to read the progress from the saved counters ----------
  const N = k => s => s.n[k] || 0;
  const D = (id, name, desc, goal, val) => ({ id, name, desc, goal, val });
  const DEFS = [
    D('ship', 'SHIP IT', 'WIN YOUR FIRST MATCH', 1, N('wins')),
    D('cd', 'CONTINUOUS DELIVERY', 'WIN 10 MATCHES', 10, N('wins')),
    D('unicorn', 'UNICORN STATUS', 'WIN 50 MATCHES', 50, N('wins')),
    D('fullstack', 'FULL STACK', 'WIN A MATCH WITH EACH OF THE 5 FIGHTERS', 5, s => s.fx.length),
    D('debt', 'TECH DEBT', 'LOSE 10 MATCHES', 10, N('losses')),
    D('sprint', 'SPRINT VELOCITY', 'WIN 5 MATCHES IN A ROW', 5, s => s.best.streak),
    D('cloud', 'MULTI CLOUD', 'WIN ON 5 DIFFERENT ARENAS', 5, s => s.ar.length),
    D('pivot', 'PIVOT', 'PLAY 3 DIFFERENT GAME MODES', 3, s => s.md.length),
    D('hello', 'HELLO WORLD', 'LAND YOUR FIRST HIT', 1, N('hits')),
    D('commit', 'COMMIT HISTORY', 'LAND 200 HITS', 200, N('hits')),
    D('mono', 'MONOREPO', 'LAND 1000 HITS', 1000, N('hits')),
    D('pipeline', 'BUILD PIPELINE', 'LAND A 5 HIT COMBO', 5, s => s.best.combo),
    D('tenx', '10X ENGINEER', 'LAND A 10 HIT COMBO', 10, s => s.best.combo),
    D('firewall', 'FIREWALL', 'BLOCK 50 ATTACKS', 50, N('blocks')),
    D('ratelimit', 'RATE LIMITER', 'PULL OFF 5 PERFECT GUARDS', 5, N('perfect')),
    D('fork', 'HARD FORK', 'LAND 10 THROWS', 10, N('throws')),
    D('sudo', 'SUDO', 'USE 10 SUPERS', 10, N('supers')),
    D('flags', 'FEATURE FLAGS', 'USE 50 SPECIAL MOVES', 50, N('specials')),
    D('reload', 'HOT RELOAD', 'USE 5 EX SPECIALS', 5, N('ex')),
    D('glass', 'BREAK GLASS', 'BREAK A COMBO', 1, N('breakers')),
    D('ooo', 'OUT OF OFFICE', 'TAUNT 10 TIMES', 10, N('taunts')),
    D('rc', 'RELEASE CANDIDATE', 'LAND A FINISHER', 1, N('finishers')),
    D('chaos', 'CHAOS ENGINEERING', 'TRIGGER 5 ARENA HAZARDS', 5, N('hazards')),
    D('postmortem', 'POSTMORTEM', 'LAND AN ARENA FINISHER', 1, N('stagefinish')),
    D('zero', 'ZERO DOWNTIME', 'WIN A ROUND WITHOUT TAKING DAMAGE', 1, N('untouched')),
    D('rollback', 'ROLLBACK KING', 'WIN A ROUND AT 10% HEALTH OR LESS', 1, N('comebacks')),
    D('hotfix', 'HOTFIX', 'WIN A ROUND IN UNDER 20 SECONDS', 1, N('quick')),
    D('oncall', 'ON CALL', 'WIN A SUDDEN DEATH ROUND', 1, N('sudden')),
    D('freeze', 'CODE FREEZE', 'WIN A ROUND ON THE CLOCK', 1, N('clock')),
    D('nines', 'FIVE NINES', 'WIN 5 MATCHES WITHOUT LOSING A ROUND', 5, N('clean')),
  ];
  const TOTAL = DEFS.length;
  const NKEYS = ['wins', 'losses', 'hits', 'blocks', 'perfect', 'throws', 'supers', 'specials', 'ex', 'breakers', 'taunts', 'finishers', 'hazards', 'stagefinish', 'untouched', 'comebacks', 'quick', 'sudden', 'clock', 'clean'];

  // ---------- the saved state ----------
  const fresh = () => ({ v: 1, got: {}, n: {}, best: { combo: 0, streak: 0 }, cur: 0, fx: [], ar: [], md: [] });
  const nz = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.min(Math.floor(v), 1e9) : 0;
  const list = (v, ok, max) => { const o = []; if (Array.isArray(v)) for (const x of v) if (ok(x) && !o.includes(x) && o.length < max) o.push(x); return o; };
  function clean(raw) {   // whatever is stored (old file, hand edit, junk) becomes a state of the right shape
    const s = fresh(); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    if (raw.got && typeof raw.got === 'object') for (const d of DEFS) { const v = nz(raw.got[d.id]); if (v) s.got[d.id] = v; }
    if (raw.n && typeof raw.n === 'object') for (const k of NKEYS) { const v = nz(raw.n[k]); if (v) s.n[k] = v; }
    if (raw.best && typeof raw.best === 'object') { s.best.combo = nz(raw.best.combo); s.best.streak = nz(raw.best.streak); }
    s.cur = nz(raw.cur);
    s.fx = list(raw.fx, x => typeof x === 'string' && ROSTER.some(r => r.id === x), ROSTER.length);
    s.ar = list(raw.ar, x => Number.isInteger(x) && x >= 0 && x < 999, 64);
    s.md = list(raw.md, x => typeof x === 'string' && /^[a-z0-9_-]{1,24}$/i.test(x), 32);
    return s;
  }
  let state = clean(SETTINGS.get('okrs')), dirty = false, flushT = 0;
  function flush() { if (!dirty) return; dirty = false; flushT = 0; SETTINGS.set('okrs', state); }   // state itself is the stored value, so later changes only need a flush
  BUS.on('settings', e => { if (e.key === 'okrs' && e.value !== state) { state = clean(e.value); dirty = false; if (e.value === null) SETTINGS.set('okrs', state); } });   // a reset or a set from elsewhere (a reset stores the new empty state at once, so the key is never null)
  if (SETTINGS.get('okrs') !== state) SETTINGS.set('okrs', state);   // store the live object once at load: from then on a flush writes the same reference and emits no 'settings' event in the middle of a match
  addEventListener('pagehide', flush);
  const count = () => Object.keys(state.got).length;
  const inc = (k, by) => { state.n[k] = Math.min(1e9, (state.n[k] || 0) + (by || 1)); dirty = true; };
  const addTo = (arr, v, max) => { if (!arr.includes(v) && arr.length < max) { arr.push(v); dirty = true; } };
  const best = (k, v) => { if (v > state.best[k]) { state.best[k] = Math.min(999, v); dirty = true; } };

  // ---------- unlocking and the toast queue ----------
  const toasts = []; let cur = null;
  const TOAST_LEN = 210;
  function scan() {
    for (const d of DEFS) {
      if (state.got[d.id] || d.val(state) < d.goal) continue;
      state.got[d.id] = count() + 1; dirty = true;
      toasts.push({ id: d.id, name: d.name, desc: d.desc });
      flush();
      BUS.emit('okr:unlock', { id: d.id, name: d.name, desc: d.desc, count: count(), total: TOTAL });
    }
  }
  function tickToast() {
    if (!cur && toasts.length) cur = Object.assign({ t: 0 }, toasts.shift());
    if (!cur) return;
    const t = ++cur.t;
    if (t === 2) blip(660, 0.08); else if (t === 8) blip(880, 0.08); else if (t === 14) { try { beep(1320, 0.2, 'triangle', 0.06); } catch (e) { /* audio is optional */ } }
    if (t >= TOAST_LEN) cur = null;
  }

  // ---------- the BUS events ----------
  const listen = (name, fn) => BUS.on(name, e => { if (!e || !counting()) return; fn(e); scan(); });
  listen('hit', e => { if (!human(e.src)) return; inc('hits'); if (isFinite(e.combo)) best('combo', e.combo | 0); });
  listen('block', e => { if (human(e.victim)) inc('blocks'); });
  listen('defense:perfect', e => { if (human(e.victim)) inc('perfect'); });
  listen('throw', e => { if (human(e.src)) inc('throws'); });
  listen('special', e => { if (human(e.fighter)) inc('specials'); });
  listen('super', e => { if (human(e.fighter)) inc('supers'); });
  listen('ex', e => { if (human(e.fighter)) inc('ex'); });
  listen('breaker', e => { if (human(e.fighter)) inc('breakers'); });
  listen('taunt', e => { if (human(e.fighter)) inc('taunts'); });
  listen('hazard', e => { if (human(e.user)) inc('hazards'); });
  listen('stagefinish', e => { if (human(e.winner)) inc('stagefinish'); });
  listen('finisher', e => { if (human(e.winner)) inc('finishers'); });
  listen('match:start', e => { if (Array.isArray(e.fighters) && e.fighters.some(human) && typeof e.modeId === 'string') addTo(state.md, e.modeId, 32); });
  listen('round:end', e => {   // a round decided by a KO or by the clock (a draw has no winner)
    const w = e.winner; if (!human(w) || (e.reason !== 'ko' && e.reason !== 'time')) return;
    if (w.dmgTaken === 0) inc('untouched');
    if (w.hp > 0 && w.d && w.hp <= 0.1 * w.d.hp) inc('comebacks');
    if (e.reason === 'ko' && game.clock < 1200) inc('quick');   // game.clock counts the 60 ticks of a second of fighting
    if (e.reason === 'time') inc('clock');
    if (game.sudden) inc('sudden');
  });
  listen('match:end', e => {
    const w = e.winner, l = e.loser;
    if (human(w)) {
      inc('wins'); state.cur++; best('streak', state.cur);
      if (w.d && ROSTER.some(r => r.id === w.d.id)) addTo(state.fx, w.d.id, ROSTER.length);
      if (Number.isInteger(game.arena) && game.arena >= 0) addTo(state.ar, game.arena, 64);
      if (l && Array.isArray(e.wins) && e.wins[l.side] === 0) inc('clean');
    }
    if (human(l)) { inc('losses'); state.cur = 0; }
    flush();
  });

  // ---------- the OKRS screen ----------
  const PER = 15, PAGES = Math.ceil(TOTAL / PER), ROW0 = 98, PITCH = 25;
  const ui = { open: false, sel: 0, keepSel: -1 };
  const BACKB = { x: 20, y: 12, w: 96, h: 30 }, TITLEB = { x: 20, y: 12, w: 156, h: 30 }, PAGEB = { x: 740, y: 62, w: 152, h: 22 };
  const page = () => Math.floor(ui.sel / PER);
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function open() { if (ui.open) return; ui.open = true; ui.keepSel = game.phase === 'title' ? game.titleSel : -1; blip(700, 0.08); }
  function close() {
    if (!ui.open) return; ui.open = false; flush();
    if (game.phase === 'title' && ui.keepSel >= 0) game.titleSel = ui.keepSel;   // a tap on the title can move the cursor under the screen: put it back
    ui.keepSel = -1; blip(330);
  }
  const any = (...codes) => { let r = false; for (const c of codes) if (tap(c)) r = true; return r; };
  function readNav(ph) {
    const n = {};
    n.up = any('KeyW', 'ArrowUp') | hit(0, 'u') | hit(1, 'u'); n.dn = any('KeyS', 'ArrowDown') | hit(0, 'd') | hit(1, 'd');
    n.lf = any('KeyA', 'ArrowLeft') | hit(0, 'l') | hit(1, 'l'); n.rt = any('KeyD', 'ArrowRight') | hit(0, 'r') | hit(1, 'r');
    n.ok = any('Enter', 'NumpadEnter', 'Space') | hit(0, 'p') | hit(1, 'p');
    n.back = any('Escape', 'KeyG') | hit(0, 'k') | hit(1, 'k') | (ph === 'pause' && any('KeyP'));
    for (const k in n) n[k] = !!n[k];
    return n;
  }
  function turn(d) { const p = (page() + d + PAGES) % PAGES; ui.sel = Math.min(TOTAL - 1, p * PER + ui.sel % PER); blip(500); }
  function onUpdate(g) {
    if (!ui.open) { tickToast(); if (g.phase === 'title' && !covered() && tap('KeyG')) open(); if (dirty && ++flushT >= 120) flush(); return; }   // a toast waits while the screen is open
    const ph = g.phase;
    if (ph !== 'title' && ph !== 'pause') { close(); return; }
    const n = readNav(ph);
    if (n.up) { ui.sel = (ui.sel + TOTAL - 1) % TOTAL; blip(400); }
    if (n.dn) { ui.sel = (ui.sel + 1) % TOTAL; blip(400); }
    if (n.lf) turn(-1);
    if (n.rt || n.ok) turn(1);
    if (n.back) close();
    for (const k in pressed) pressed[k] = false;   // the menu keys stay inside this screen: the title and the pause menu see nothing
  }
  HOOKS.add('update', onUpdate, -20);
  HOOKS.add('titleItems', () => [{ id: 'okrs', label: 'OKRS', order: 880, run: () => open() }]);
  HOOKS.add('pauseItems', () => [{ id: 'okrs', key: 'KeyG', label: 'G OKRS', run: () => { if (game.phase === 'pause') open(); } }]);

  // a screen of another feature (the WATCH picker, GAMEPAD SETUP, OBS ...) sits over the title: its picture and its clicks come first, so no corner button or G key here
  const covered = () => { try { return typeof titleOverlayOpen === 'function' && titleOverlayOpen(); } catch (e) { return false; } };
  const canvasPos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  addEventListener('pointerdown', e => {
    const onTitle = !ui.open && game.phase === 'title' && !covered();
    if ((!ui.open && !onTitle) || e.target !== cv) return;
    const [x, y] = canvasPos(e);
    if (onTitle && !inRect(x, y, TITLEB)) return;   // on the title only the corner button is ours
    e.preventDefault(); e.stopImmediatePropagation(); if (e.pointerType !== 'mouse') touch.on = true;
    if (onTitle) { open(); return; }
    if (inRect(x, y, BACKB)) { close(); return; }
    if (inRect(x, y, PAGEB)) { turn(1); return; }
    const i = Math.floor((y - ROW0) / PITCH);
    if (x >= 68 && x <= 892 && i >= 0 && i < PER && page() * PER + i < TOTAL) { ui.sel = page() * PER + i; blip(400); }
  }, true);

  // ---------- drawing ----------
  const P = (s, x, y, size, col, al) => ptext(ctx, s, x, y, size, col, al || 'left');
  function box(x, y, w, h, fill, line) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  function bar(x, y, w, h, r, col) {
    ctx.fillStyle = '#26221c'; ctx.fillRect(x, y, w, h); const fw = Math.round((w - 2) * Math.max(0, Math.min(1, r)));
    if (fw > 0) { ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, fw, h - 2); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 1, y + 1, fw, 2); }
    ctx.strokeStyle = '#5a5244'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function tick(x, y, on) {   // the check box of a row
    ctx.fillStyle = on ? GOLD : '#26221c'; ctx.fillRect(x, y, 14, 14); ctx.strokeStyle = on ? '#fff3b0' : '#5a5244'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 13, 13);
    if (on) { ctx.strokeStyle = '#2a1d05'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 3, y + 7); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x + 11, y + 3); ctx.stroke(); }
  }
  function drawScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.96)'; ctx.fillRect(0, 0, W, H);
    drawTitleText(ctx, 'OKRS', W / 2, 30, 40, { align: 'center', style: 'gold', glow: true });
    box(BACKB.x, BACKB.y, BACKB.w, BACKB.h, 'rgba(0,0,0,0.6)', '#7d7668'); P('BACK', BACKB.x + BACKB.w / 2, BACKB.y + 8, 2, STEEL, 'center');
    box(60, 56, 840, 448, 'rgba(8,6,12,0.92)', '#c9a24a');
    const got = count(), pg = page();
    P(got + '/' + TOTAL + ' ACHIEVED', 80, 66, 2, got === TOTAL ? GOLD : STEEL);
    bar(300, 68, 400, 10, got / TOTAL, GOLD);
    P('PAGE ' + (pg + 1) + '/' + PAGES + ' >', PAGEB.x + PAGEB.w, 66, 2, STEEL, 'right');
    for (let i = 0; i < PER; i++) {
      const k = pg * PER + i; if (k >= TOTAL) break;
      const d = DEFS[k], v = d.val(state), done = !!state.got[d.id], on = k === ui.sel, y = ROW0 + i * PITCH;
      if (on) { ctx.fillStyle = 'rgba(201,162,74,0.22)'; ctx.fillRect(68, y, 824, PITCH - 2); }
      tick(76, y + 4, done);
      P(d.name, 100, y + 5, 2, done ? GOLD : on ? '#fff' : STEEL);
      bar(500, y + 6, 250, 10, v / d.goal, done ? GOLD : BLUE);
      P(done ? 'DONE' : Math.min(v, d.goal) + '/' + d.goal, 884, y + 5, 2, done ? GREEN : DIM, 'right');
    }
    const s = DEFS[ui.sel];
    ctx.fillStyle = 'rgba(201,162,74,0.12)'; ctx.fillRect(68, 474, 824, 24);
    P(s.name + ': ' + s.desc, W / 2, 479, 2, state.got[s.id] ? GOLD : STEEL, 'center');
    ctx.fillStyle = 'rgba(5,3,4,0.95)'; ctx.fillRect(0, 506, W, H - 506);
    P(touch.on ? 'TAP A ROW - TAP PAGE - TAP BACK' : 'W/S SELECT - A/D PAGE - ESC BACK', W / 2, 516, 2, '#c9c3b8', 'center');
  }
  function drawTitleButton() {   // the title menu is crowded (and can run off the screen), so the screen also has its own corner button and the G key
    box(TITLEB.x, TITLEB.y, TITLEB.w, TITLEB.h, 'rgba(0,0,0,0.6)', '#7d7668');
    P('G OKRS ' + count() + '/' + TOTAL, TITLEB.x + TITLEB.w / 2, TITLEB.y + 8, 2, STEEL, 'center');
  }
  const TOAST_W = 316, TOAST_Y = 112, OVER = { x: 12, y: 178 }, OVER_R = { x: W - 12 - TOAST_W, y: 62 };   // under the HUD, centred, while fighting; on the end screen in the free left side, below the colourways note (y 150) and clear of the share button; a mode with its own card there (MODES endCard) gets the top right, above the O button
  const card = () => { try { return !!(MODES.current() || {}).endCard; } catch (e) { return false; } };
  const want = () => game.phase === 'over' ? (card() ? OVER_R : OVER) : { x: Math.round((W - TOAST_W) / 2), y: TOAST_Y };
  let tx = want().x, ty = want().y;
  function drawToast() {
    if (!cur) { const q = want(); tx = q.x; ty = q.y; return; }
    const t = cur.t, ease = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3), k = t < 16 ? ease(t / 16) : t > TOAST_LEN - 16 ? ease((TOAST_LEN - t) / 16) : 1;
    const w = TOAST_W, h = 60, q = want();
    tx = Math.abs(q.x - tx) < 0.5 ? q.x : tx + (q.x - tx) * 0.25; ty = Math.abs(q.y - ty) < 0.5 ? q.y : ty + (q.y - ty) * 0.25;   // glides to the other spot when the match ends under it
    const x = Math.round(tx), y = Math.round(ty - (1 - k) * (h + ty));   // drops in from the top edge
    box(x, y, w, h, 'rgba(10,8,14,0.94)', GOLD);
    ctx.fillStyle = GOLD;   // a small cup
    ctx.fillRect(x + 16, y + 14, 20, 16); ctx.fillRect(x + 22, y + 30, 8, 8); ctx.fillRect(x + 17, y + 38, 18, 4); ctx.clearRect(x + 19, y + 14, 14, 3);
    ctx.fillStyle = '#6b5420'; ctx.fillRect(x + 20, y + 15, 12, 2);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(x + 12, y + 17, 5, 8); ctx.strokeRect(x + 35, y + 17, 5, 8);
    P('OKR ACHIEVED  ' + count() + '/' + TOTAL, x + 52, y + 8, 1, GOLD);
    P(cur.name, x + 52, y + 20, 2, '#fff');
    P(cur.desc, x + 52, y + 42, 1, DIM);
  }
  HOOKS.add('drawTop', () => { if (ui.open) drawScreen(); else { if (game.phase === 'title' && !covered()) drawTitleButton(); drawToast(); } }, 100);

  // the touch buttons would sit on top of the screen (the same trick options.js uses)
  const drawTouch0 = window.drawTouch;
  window.drawTouch = function () { if (!drawTouch0 || ui.open) return; return drawTouch0.apply(this, arguments); };

  window.OKRS = {
    defs: DEFS.map(d => ({ id: d.id, name: d.name, desc: d.desc, goal: d.goal })),
    get total() { return TOTAL; }, get count() { return count(); }, get state() { return state; }, get dirty() { return dirty; },
    progress(id) { const d = DEFS.find(x => x.id === id); return d ? { val: Math.min(d.val(state), d.goal), goal: d.goal, done: !!state.got[id] } : null; },
    unlocked: () => DEFS.filter(d => state.got[d.id]).map(d => d.id),
    get screen() { return ui.open; }, get selected() { return ui.sel; }, get page() { return page(); }, get pages() { return PAGES; }, get perPage() { return PER; },
    get toast() { return cur ? { id: cur.id, name: cur.name, desc: cur.desc, t: cur.t } : null; }, get queued() { return toasts.length; }, toastLength: TOAST_LEN,
    open, close, flush, clean, human,
    reset() { toasts.length = 0; cur = null; SETTINGS.reset('okrs'); state = fresh(); dirty = false; SETTINGS.set('okrs', state); },
  };
})();
