# Agent Brawl architecture

Agent Brawl is an 8-bit parody fighter for the browser: a 960x540 canvas, procedural pixel art and procedural chiptune, no image or audio files, no network requests. This page is the contract between the engine and the feature files, so that several people (or agents) can work on the game at the same time without stepping on each other.

Read this first, then read only the files you own.

## Ground rules

- Classic scripts in one global scope. No `import`/`export`, no modules, no npm dependencies, no build tools beyond `node build.mjs`, no `.github/workflows`.
- `dev.html` is the development entry point and lists every script in order. `node build.mjs` inlines them into `index.html`, which is committed build output: rebuild before every commit.
- `node tools/headless.mjs --test` must pass before every commit. It loads `index.html` in headless Chrome, plays full matches, and fails on any console error or warning.
- The roster is fixed: Tibo, Poteto, Dot, Wang, Muse. Their `handle` fields stay empty strings. Jokes are about AI and developer culture only.
- No third-party trademarks, names or catchphrases from other games. The test greps for them.
- Text on screen is capitals in the pixel font. The look is a dark arcade palette.
- Do not edit a file you do not own. If you need something from the engine, add a hook or an event in a small separate change and say so in the commit message.

## Running and testing

- `open dev.html` (or `index.html` after a build) in a browser. Debug routes: `#select`, `#demo=0,1` with optional `&ff=3000` (fast-forward ticks), `&arena=K`, `&stop` (freeze the real-time loop), `#sheet=muse`.
- `window.step(n)` advances the fixed 60 Hz simulation by `n` ticks, `window.hold(true)` freezes the real-time loop so only `step` advances the game. Tests rely on both.
- `node tools/headless.mjs --test` runs everything. `node tools/headless.mjs "file://$PWD/index.html#select" --shot tools/shots/select.png` takes a screenshot (`tools/shots/` is git-ignored).

## Load order

`dev.html` loads these scripts, in this order. A new script goes at the end of its group, and in the same place in `dev.html`.

| # | Script | What it is | Owner |
|---|--------|-----------|-------|
| 0 | inline script | `W`, `H`, `GROUND` constants | scaffold |
| 1 | `bus.js` | `BUS` (events) and `HOOKS` (extension points) | scaffold |
| 2 | `settings.js` | `SETTINGS`, one persisted store for every option | scaffold |
| 3 | `modes.js` | `MODES`, the registry behind the title menu | scaffold |
| 4 | `pixelfont.js` | pixel font | engine |
| 5 | `sprites.js` | fighter art, drawn in code | engine |
| 6 | `arenas.js` | the nine stages, plus `ARENAS.make` and `ARENAS.kit` | engine |
| 7 | `hud.js` | HUD, banners, blood and sparks (`FX`), announcer | engine |
| 8 | `music.js` | procedural chiptune, public `MUSIC` | engine |
| 9 | `moves.js` | move tables per fighter | engine |
| 10 | `game.js` | the game: fighters, match flow, menus, input, render loop | engine |
| 11 | `combat.js` | fighting depth | combat agent |
| 12 | `arcade.js` | single player ladder | arcade agent |
| 13 | `training.js` | practice room | training agent |
| 14 | `arenas2.js` | more stages | arenas agent |
| 15 | `music2.js` | more themes and instruments | music agent |
| 16 | `options.js` | options screen, key rebinding | options agent |
| 17 | `touch.js` | phone and tablet controls | touch agent |
| 18 | `bonus.js` | bonus minigames (BENCHMARK BREAK, BUG SQUASH) and `BONUS.run` | bonus agent |
| last | `p-strings.js` | named combo strings, chase jump, air chains, juggle scaling; loads after `vfx.js` so its `tryCancel` wrapper is the outermost | p-strings agent |
| last | `p-voice.js` | VS banter, win quotes and announcer callouts with captions (`VOICE`); after `vfx.js` in `dev.html` | p-voice agent |
| 19 | `p-tutorial.js` | TUTORIAL mode: ten lessons against a scripted dummy, last in `dev.html` | p-tutorial agent |
| 19 | `p-vault.js` | EXTRAS title screen: fighter and arena galleries, colourways, lifetime stats (`VAULT`) | p-vault agent |
| 19 | `p-jukebox.js` | SOUND TEST screen, five fighter themes (`fight_<id>`), visualiser bars; global `JUKEBOX` | jukebox agent |
| last | `p-training2.js` | the TRAINING mode: dummy behaviours, record and playback, input display, frame advantage, hitboxes, reset (loaded after every other feature file, so its `training` mode wins over the `training.js` stub) | p-training2 agent |
| 25 | `p-replays.js` | input-based match replays and the REPLAYS title screen; loaded last in `dev.html`, after `vfx.js` | p-replays agent |
| 19 | `p-achievements.js` | OKRS: 30 parody achievements, an unlock toast, the OKRS screen, saved in `SETTINGS` (`window.OKRS`) | p-achievements agent |
| 19 | `p-ranked.js` | RANKED: the PERFORMANCE REVIEW rating against the CPU (last script in `dev.html`, after `vfx.js`) | p-ranked agent |
| 19 | `p-daily.js` | SPRINT OF THE DAY: the daily challenge, streak and result card | p-daily agent |
| 19 | `p-mutators.js` | match mutators picked on the select screen (G): BIG HEADS, LOW GRAVITY, TURBO 1.5X, RATE LIMITED, LEGACY MODE, GLASS CANNON; public `MUTATORS` | p-mutators agent |
| 19 | `p-photomode.js` | photo mode from the pause screen: free camera, six filters, frames, PNG save (`PHOTO`) | p-photomode agent |
| 19 | `p-a11y.js` | accessibility options (colour filters, high contrast HUD, larger text, reduced motion, screen reader announcements, simple specials) and `A11Y`; loads after `vfx.js` | a11y agent |
| 19 | `p-observability.js` | OBSERVABILITY: the post-match dashboard (damage-over-time chart, KPI scorecard, incident log), public `OBS`; loads last in `dev.html` | observability agent |
| 19 | `p-watch.js` | attract demo after 20 s idle on the title, the WATCH entry, live commentary captions | p-watch agent |
| last | `p-perf.js` | frame-time overlay (F3), adaptive quality, arena snapshot cache and `PERF`; it loads after every other feature file because it wraps the functions they may have wrapped | perf agent |
| 26 | `p-clips.js` | KO clips: rolling canvas capture, the KO CLIP panel and SAVE CLIP on the end screen (`CLIPS`); last script in `dev.html` | clips agent |

Because the feature files load after `game.js`, they can use everything it declares. The engine files never name a feature file; features reach the engine only through the contracts below.

## File ownership

| Files | Owner | Notes |
|-------|-------|-------|
| `bus.js`, `settings.js`, `modes.js`, `docs/ARCHITECTURE.md`, `tools/test-match.mjs` (the loader at the end), `tools/tests/core.mjs` | scaffold | change a contract only with the whole team told |
| `pixelfont.js`, `sprites.js`, `arenas.js`, `hud.js`, `music.js`, `moves.js`, `game.js` | engine | small, additive edits only; every edit is a risk to five other branches |
| `combat.js`, `tools/tests/combat.mjs` | combat agent | |
| `arcade.js`, `tools/tests/arcade.mjs` | arcade agent | |
| `training.js`, `tools/tests/training.mjs` | training agent | |
| `arenas2.js`, `tools/tests/arenas2.mjs` | arenas agent | |
| `music2.js`, `tools/tests/music2.mjs` | music agent | |
| `options.js`, `tools/tests/options.mjs` | options agent | |
| `touch.js`, `tools/tests/touch.mjs` | touch agent | |
| `bonus.js`, `tools/tests/x-bonus.mjs` | bonus agent | |
| `p-strings.js`, `tools/tests/x-p-strings.mjs` | p-strings agent | |
| `p-voice.js`, `tools/tests/x-p-voice.mjs` | p-voice agent | |
| `p-tutorial.js`, `tools/tests/x-p-tutorial.mjs`, `docs/features/p-tutorial.md` | p-tutorial agent | |
| `p-vault.js`, `tools/tests/x-p-vault.mjs` | p-vault agent | |
| `p-jukebox.js`, `tools/tests/x-p-jukebox.mjs` | jukebox agent | its one engine edit is the read-only `MUSIC.info` / `MUSIC.hits` / `MUSIC.clock` block at the end of `music.js` |
| `p-training2.js`, `tools/tests/x-p-training2.mjs`, `docs/features/p-training2.md` | p-training2 agent | no engine edit: MODES, SETTINGS, BUS `hit`/`block` and HOOKS `input` (order -1000), `update`, `fighterUpdate`, `damage` (order 1e9), `drawWorld`, `drawHud`, `pauseItems` |
| `p-replays.js`, `tools/tests/x-p-replays.mjs` | p-replays agent | hooks `update` (order -1e9), `titleItems`, `drawTop` (order 40); listens to the BUS `phase`, `match:start` and `match:end`; pins `Math.random` to a seeded generator only while a recorded or replayed match runs; while a replay plays it wraps `BUS.emit` to keep that match's `match:end` from the other listeners; reads the engine globals `keys`, `pressed`, `NOISE` and `thud`; see `docs/features/p-replays.md` |
| `p-ranked.js`, `tools/tests/x-p-ranked.mjs` | p-ranked agent | uses `match:start`, `round:start`, `match:end`, `phase`, the `update` and `drawTop` hooks, `MODES.register` and two `SETTINGS` keys; wraps `SETTINGS.get('difficulty')` while a rated match is on screen |
| `p-daily.js`, `tools/tests/x-p-daily.mjs` | p-daily agent | |
| `p-mutators.js`, `tools/tests/x-p-mutators.mjs` | p-mutators agent | |
| `p-photomode.js`, `tools/tests/x-p-photomode.mjs` | p-photomode agent | |
| `p-a11y.js`, `tools/tests/x-p-a11y.mjs` | a11y agent | |
| `p-observability.js`, `tools/tests/x-p-observability.mjs` | observability agent | uses `update`, `fighterUpdate`, `drawTop` and the BUS events `match:start`, `round:start`, `round:end`, `hit`, `block`, `special`, `super`, `throw`, `match:end`, `phase`, `settings`; one pointerdown listener on `#c` |
| `p-watch.js`, `tools/tests/x-p-watch.mjs` | p-watch agent | |
| `p-perf.js`, `tools/tests/x-p-perf.mjs` | perf agent | wraps `frame`, `update`, `render`, `drawArena`, `drawPost`, `FX.blood/sparks/dust/ring` and `ARENAS2.react`; at HIGH every wrapper passes straight through |
| `p-clips.js`, `tools/tests/x-p-clips.mjs`, `docs/features/p-clips.md` | clips agent | |
| `docs/features/<name>.md` | the agent of that feature | short notes on what the feature does and how to test it |
| `index.html` | nobody | build output: never merge it by hand, rebuild with `node build.mjs` |

## Contracts

### BUS events

`BUS.on(name, fn)` returns an unsubscribe function. `BUS.once`, `BUS.off(name, fn)`, `BUS.emit(name, payload)` and `BUS.count(name)` complete the API. Handlers run synchronously, in registration order. A handler that throws is caught and logged once per name with `console.error` (which fails the test run); the game goes on. Payload fields below are the whole contract; objects such as fighters are live, do not keep them across matches.

| Event | Payload | Emitted |
|-------|---------|---------|
| `phase` | `{ from, to }` | every change of `game.phase`, whether through `setPhase` or a direct assignment (title, select, vs, intro, fight, pause, finish, finisher, ko, outro, over, sheet) |
| `match:start` | `{ modeId, mode, p1, p2, arena, fighters }` | `startMatch()`; `p1`/`p2` are roster indices, `arena` an index into `ARENAS`, `fighters` the two `Fighter` objects (`game.f`) |
| `round:start` | `{ round, sudden, time }` | `startRound()`, before the intro; `time` is the round clock in seconds |
| `round:end` | `{ round, reason, winner, loser, wins, flawless }` | the round is decided; `reason` is `'ko'`, `'time'` or `'draw'`; `winner` and `loser` are fighters (both `null` on `'draw'`); `wins` is a copy of `[p1wins, p2wins]` |
| `match:end` | `{ winner, loser, wins, rounds, modeId }` | the match is decided, as the outro starts; `rounds` is the number of rounds played |
| `hit` | `{ src, victim, dmg, kind, combo, hp }` | a hit lands (not blocked); `dmg` is the damage after scaling, `kind` is `'punch'`, `'kick'`, `'hit'`, `'super'` or another move kind, `combo` the attacker's current combo length, `hp` the victim's health after the hit |
| `block` | `{ src, victim, dmg, kind, hp }` | a hit is blocked; `dmg` is the chip damage |
| `knockdown` | `{ src, victim }` | straight after a `hit` that knocks the victim down |
| `ko` | `{ winner, loser, flawless }` | a fighter's health reached zero in the fight (a time-out only produces `round:end`) |
| `throw` | `{ src, victim }` | a throw starts |
| `special` | `{ fighter, foe, move }` | a special move starts; `move` is the entry in `MOVES[id].sp` |
| `super` | `{ fighter, foe, move }` | a super starts; `move` is `MOVES[id].su` |
| `finisher` | `{ winner, loser, move }` | the end-of-match finisher begins; `move` is `MOVES[id].fin` |
| `okr:unlock` | `{ id, name, desc, count, total }` | `p-achievements.js`: an OKRS objective was reached (once per objective; `count` is how many are done now) |
| `settings` | `{ key, value, old }` | a `SETTINGS` value changed (only when the value is different) |
| `strings:land` | `{ fighter, foe, name, hits, kind, combo }` | `p-strings.js`: a named combo string landed; `kind` is `'AIR'`, `'JUGGLE'` or `'CANCEL'` |
| `strings:chase` | `{ fighter, foe }` | `p-strings.js`: a chase jump after a launcher |
| `strings:juggle` | `{ src, victim }` | `p-strings.js`: a launch started a juggle owned by `src` |
| `tutorial:step` | `{ lesson, id, step }` | `p-tutorial.js`: a step of a TUTORIAL lesson is done; `lesson` is the lesson index (0 to 9), `id` its name (`move`, `attack`, ... `getup`), `step` the index of the step |
| `tutorial:done` | `{ lesson, id, cleared, total }` | `p-tutorial.js`: a TUTORIAL lesson is cleared (LESSON CLEAR); `cleared` is how many of the `total` lessons are now cleared |
| `ranked:result` | `{ won, forfeit, before, after, delta, ... }` | `p-ranked.js` (not the engine): a rated RANKED match was settled, at `match:end` or when a live match is left; the payload is the same object as `RANKED.last()` |
| `photo` | `{ open: true }`, `{ open: false }` or `{ saved: name }` | `p-photomode.js`: photo mode opened or closed; a PNG was written (the file name is in `saved`) |
| `perf:level` | `{ level, name }` | `p-perf.js`: the adaptive quality level changed (`0` HIGH, `1` MEDIUM, `2` LOW) |

### HOOKS points

`HOOKS.add(name, fn, order = 0)` returns a remove function; lower `order` runs first, ties run in registration order. The engine calls them in three styles:

- `HOOKS.run(name, ...args)` calls every handler (updates and drawing).
- `HOOKS.filter(name, value, ...args)` passes `value` through the handlers; each returns the new value, or `undefined` to keep it (mutating the object in place also works). The engine uses what comes out.
- `HOOKS.collect(name, ...args)` gathers what the handlers return (one item or an array each, `null` skipped) into one flat array.

With nothing registered a call returns at once, so the engine calls them from hot paths. A handler that throws is caught and logged once per name.

| Hook | Style | Arguments and meaning |
|------|-------|-----------------------|
| `input` | filter | `(input, side, fighter)`; `input` is `{ l, r, u, d, p, k, s, x }` booleans (the four directions are held states, the four buttons are presses of this tick; the CPU may add `mv` and `fin`); return the input object to use. Called once per fighter per tick. `side` is 0 or 1 |
| `update` | run | `(game)`; every tick in every phase, before the phase logic and before hit stop |
| `fighterUpdate` | run | `(a, b)`; after both fighters updated, on ticks where the fight advances (not during hit stop or the finisher) |
| `damage` | filter | `({ src, victim, dmg, kind, guarding, opt, kb, stun })`; change `dmg`, `kb` or `stun` before they apply (non-finite values are ignored); runs before the guard and shield reductions |
| `drawFighter` | run | `(ctx, fighter)`; straight after a fighter is drawn, in world space |
| `drawWorld` | run | `(ctx, game)`; after fighters, projectiles and effects, still in world space (camera, shake and zoom applied) |
| `drawHud` | run | `(ctx, game)`; after the HUD in the fight scenes, in screen space |
| `drawTop` | run | `(ctx, game)`; the last thing drawn, in every phase, in screen space (menus, overlays) |
| `titleItems` | collect | no arguments (read the global `game`); items `{ id, label, order?, run(game) }` added to the title menu next to the modes (default `order` 100); called every tick on the title and every frame it is drawn |
| `pauseItems` | collect | no arguments; items `{ key, label, run(game) }`: while paused, pressing `key` (a `KeyboardEvent.code`) calls `run`; the labels are drawn under the pause text |
| `musicTheme` | filter | `(themeName, game)`; return the name of any defined theme to replace the one the engine picked |

`p-strings.js` uses `update` (order -10), `input` (order 5, CPU only), `fighterUpdate`, `damage` (order 20, after `combat.js`: juggle scaling and the 35 percent cap), `drawFighter`, `drawHud`, `drawTop` and `pauseItems` (`N STRINGS`).
A handler may run the engine's own `window.update()` again from inside an `update` handler to add a tick (`p-mutators.js` does this for TURBO 1.5X, with a re-entry guard and every other tick of a fight only). Every `update` handler then runs a second time inside that one real tick, so an `update` handler must be safe to run twice in a row and must not count real time by calls.
Order notes: `vfx.js` plays the KO slow motion from an `update` handler at order 50. `p-a11y.js` reads `game.hitstop` at order 49 and, with reduced motion on, removes the extra 1-tick hit-stop at order 51. In `drawTop`, `p-a11y.js` draws at 8000 (the high contrast HUD), 9000 (its screen) and 10000 (the colour filter, last of all).

### SETTINGS keys

One store, persisted as JSON under `localStorage` key `brawl.settings`. A blocked or corrupt store means the defaults. Never read `localStorage` for options anywhere else. API: `SETTINGS.get(key)`, `set(key, value)` (validates, stores, persists, emits `settings`, returns the stored value), `toggle(key)`, `reset(key)` (no key: all), `all()`, `list()` (definitions in registration order, for an options screen), and `SETTINGS.define(key, spec)`.

`define` takes `{ def, type?, min?, max?, step?, values?, label?, legacy?, fromLegacy? }`. The type is inferred: boolean is `'bool'`, number is `'num'` (clamped to `min..max`, rounded to `step`), a `values` array is `'enum'`, anything else is `'any'` (a JSON-safe value). `legacy` names an older `localStorage` key that is read once when nothing is stored yet, and `fromLegacy` turns its string into the value.

| Key | Type and default | Range | Read by |
|-----|------------------|-------|---------|
| `difficulty` | enum, `'normal'` | `'easy'`, `'normal'`, `'hard'`, `'nightmare'` | `game.js` `DIFFICULTY`: the CPU level at the start of a match (0.2, 0.45, 0.7) and how much it rises after each round (0.15, 0.2, 0.25). `options.js` adds `'nightmare'` (0.9, 0.3) |
| `rounds` | num, `2` | 1 to 4 | `roundsToWin()`; sudden death is round `2 * rounds` |
| `time` | num, `99` | 30 to 99 | seconds per round (sudden death stays 30) |
| `musicVol` | num, `1` | 0 to 1, step 0.05 | `music.js` level; 1 is the mix the tests measure |
| `sfxVol` | num, `1` | 0 to 1, step 0.05 | `beep()` and `thud()` in `game.js` |
| `voiceVol` | num, `1` | 0 to 1, step 0.05 | announcer speech and stingers in `hud.js` |
| `gore` | bool, `true` | | `FX.gore` in `hud.js` mirrors it; migrated from the old `brawl.gore` key |
| `muted` | bool, `false` | | the `muted` flag in `game.js` mirrors it (use `setMuted(v)`); migrated from the old `brawl.muted` key |
| `binds` | any, `null` | `null` or `{ p1?, p2?, alt? }` | `game.js` `applyBinds()`: for each player, an object of action letter to an array of `KeyboardEvent.code`; it replaces only the actions it names. Actions are `l r u d p k s x` |
| `infTime` | bool, `false` | | `options.js`: the round clock never runs out and the HUD shows `--` (the `time` value stays as the finite choice) |
| `shake` | enum, `'full'` | `'off'`, `'low'`, `'full'` | `options.js` scales `game.shake` while the world is drawn |
| `reduceFlash` | bool, `false` | | `options.js` caps the white screen flash passed to `drawPost` |
| `crt` | bool, `false` | | `options.js` asks `drawPost` for scanlines |
| `announcer` | bool, `true` | | `options.js`: `false` silences `ANNOUNCER.say` (the stingers follow `voiceVol`) |
| `trackToast` | bool, `true` | | `options.js` hides the note with the arena track name at the start of a round |
| `bonus.scores` | any, `{ benchmark: [], squash: [] }` | per mode, up to five `{ s, f }` rows (score, fighter index), best first | `bonus.js`: the top-five lists of BENCHMARK BREAK and BUG SQUASH; migrated from the old `brawl.bonus` key |
| `palettes.p1` | any, `{}` | `{ fighterId: index }` | `palettes.js`: the colourway player 1 last picked for each fighter (0 classic, 1 to 3 alternates, 4 the star colourway) |
| `palettes.p2` | any, `{}` | `{ fighterId: index }` | `palettes.js`: the same for player 2 |
| `palettes.unlocked` | any, `{}` | `{ fighterId: true }` | `palettes.js`: the star colourways opened by winning a match as a human player |
| `vfx.replay` | bool, `true` | | `vfx.js`: the instant replay of the deciding KO |
| `daily.state` | any, `null` | `{ v, last, streak, best, cleared, won, played, h }` | `p-daily.js`: the streak, the totals and the last 30 days of SPRINT OF THE DAY |
| `vfx.cutin` | bool, `true` | | `vfx.js`: the cut-in panel for supers and finishers |
| `vfx.impact` | bool, `true` | | `vfx.js`: the inverted impact frames on counters, heavy hits and supers |
| `strings.on` | bool, `true` | | `p-strings.js`: combo strings, the chase jump, air chains, juggle scaling and the STRINGS page; off is the game without them |
| `strings.callouts` | bool, `true` | | `p-strings.js`: the on-screen string name and its sting (detection and `strings:land` stay on) |
| `voice.speech` | bool, `true` | | `p-voice.js`: the banter, callouts and win quotes are spoken (captions stay on either way); N in the pause menu toggles it |
| `tutorial.done` | num, `0` | 0..1023 | `p-tutorial.js`: the cleared TUTORIAL lessons as a bit mask (bit k = lesson k + 1) |
| `vault.stats` | any, `{}` | `{ v, m, r, ko, sp, su, fi, combo, comboBy, f: { fighterId: { w, l, c } }, ar: { arenaId: plays } }` | `p-vault.js`: lifetime stats counted from `BUS` events (matches, rounds, KOs, specials, supers, finishers, longest combo, wins and losses per fighter, plays per arena); only human fighters outside training count, the mirror boss never does; shown on the EXTRAS screen next to the arcade stats |
| `jukebox.vs` | bool, `false` | | `p-jukebox.js`: the VS screen (and the round 1 intro) plays the first fighter's own theme `fight_<id>` instead of the classic `vs` track; off by default because the match test expects `vs` |
| `jukebox.last` | string, `''` | any theme name | `p-jukebox.js`: the track last played on the SOUND TEST, where the cursor starts next time |
| `training2.dummy` | enum, `'stand'` | `'stand'`, `'crouch'`, `'jump'`, `'block'`, `'after'` | `p-training2.js`: what the training dummy does (BLOCK ALL guards high or low as needed, BLOCK AFTER HIT guards for a second after it is hit) |
| `training2.hitbox` | bool, `false` | | `p-training2.js`: the hurtbox, attack box and projectile overlay in training |
| `training2.inputs` | bool, `true` | | `p-training2.js`: the input display (P1's last 12 inputs) in training |
| `training2.refill` | bool, `true` | | `p-training2.js`: health refills after a quiet moment and P1 keeps a full meter in training |
| `replays.list` | any, `[]` | up to five replay entries, newest first | `p-replays.js`: the last five VERSUS matches (seed, settings snapshot, input events, checksums, result); see `docs/features/p-replays.md` for the entry format |
| `replays.restore` | any, `null` | `null` or the viewer's settings | `p-replays.js`: a crash guard; set while a replay plays with the recorded match settings, and put back on the next load if the page closed mid-replay |
| `okrs` | any, `null` | `null` or `{ v, got, n, best, cur, fx, ar, md }` | `p-achievements.js`: the OKRS progress (done objectives, counters, best combo and win streak, fighters, arenas and modes won with); a junk value is cleaned on load, and the live object is stored once at load so that saving later emits no `settings` event during a match |
| `ranked.rating` | num, `1000` | 0 to 5000 | `p-ranked.js`: the RANKED rating (INTERN below 1100, then JUNIOR, SENIOR, STAFF, PRINCIPAL, DISTINGUISHED from 1700) |
| `ranked.record` | any, an empty record | `{ games, wins, losses, streak, best, peak, forfeits, hist }` | `p-ranked.js`: the RANKED record; sanitised on every read, `hist` keeps the last 12 ratings |
| `mutators.on` | any, `{}` | `{ mutatorId: true }` | `p-mutators.js`: the match mutators that are on (`bigheads`, `lowgrav`, `turbo`, `rate`, `legacy`, `glass`); all off by default; read and written through `window.MUTATORS` |
| `photo.filter` | enum, `'none'` | `'crt'`, `'sepia'`, `'noir'`, `'vapor'`, `'pixel'`, `'none'` | `p-photomode.js`: the last filter used in photo mode |
| `photo.frame` | enum, `'none'` | `'none'`, `'cinema'`, `'polaroid'`, `'arcade'`, `'film'` | `p-photomode.js`: the last frame used in photo mode |
| `photo.hud` | bool, `true` | | `p-photomode.js`: whether photo mode shows the HUD in the picture |
| `a11y.cb` | enum, `'off'` | `'off'`, `'protan'`, `'deutan'`, `'tritan'` | `p-a11y.js`: the colour filter applied to the whole frame |
| `a11y.contrast` | bool, `prefers-contrast: more` | | `p-a11y.js`: the high contrast HUD drawn over the normal one |
| `a11y.bigText` | bool, `false` | | `p-a11y.js`: larger `uiText` and `ptext` text where it fits |
| `a11y.motion` | bool, `prefers-reduced-motion: reduce` | | `p-a11y.js`: no screen shake, white flash or KO slow motion; while it is on, `SETTINGS.get('reducedFlash')` reads `true` for `vfx.js` |
| `a11y.live` | bool, `true` | | `p-a11y.js`: announcements in the `#a11y-live` region |
| `a11y.simpleSp` | bool, `false` | | `p-a11y.js`: specials by direction plus the special button, for human players |
| `observability.enabled` | bool, `true` | | `p-observability.js`: records the match and offers the OBSERVABILITY report (O key or tap) on the end screen |
| `observability.auto` | bool, `false` | | `p-observability.js`: open the report by itself when the end screen appears |
| `observability.fleet` | any, `{ m: 0, d: 0, h: 0 }` | matches, damage and hits ever logged | `p-observability.js`: the lifetime totals shown in the footer of the report |
| `watch.attract` | bool, `true` | | `p-watch.js`: the attract demo after the idle time on the title |
| `watch.idle` | num, `20` | 5 to 120 seconds | `p-watch.js`: seconds without input on the title before the attract demo starts |
| `watch.captions` | bool, `true` | | `p-watch.js`: the live commentary captions in the demo and in WATCH |
| `watch.level` | enum, `normal` | `easy`, `normal`, `hard`, `nightmare` | `p-watch.js`: the CPU level of a WATCH match (it sets `game.cpuLevel`) |
| `watch.pick` | any, `{}` | `{ a, b, arena }` | `p-watch.js`: the two fighters and the arena (-1 random) last picked in WATCH |
| `perf.quality` | enum, `'auto'` | `'auto'`, `'high'`, `'low'` | `p-perf.js`: AUTO steps down to MEDIUM or LOW when the average frame costs over 12 ms; `Shift`+`F3` cycles it |
| `clips.on` | bool, `true` | | `p-clips.js`: record the canvas during a match and offer the KO clip on the end screen (no effect where recording is unsupported) |

Features add their own keys with `SETTINGS.define` at load time (prefix them with the feature name, for example `arcade.best`).

### MODES interface

The title menu is `MODES.list()` plus whatever `HOOKS` `titleItems` collects, sorted by `order`. A feature that is a way to fight is a mode; one that is a place to go (options) is a title item.

- `MODES.register(def)` adds a mode, or replaces the one with the same `id`. `def` is `{ id, label, order?, players?, onPick?, onMatchStart?, onRoundStart?, onRoundEnd?, onMatchEnd? }`.
  - `id` is a unique string, stored in `game.modeId` while the mode is played. `label` is the menu text (capitals). `order` is the menu position, lowest first (default 100).
  - `players` is `1` (P1 against the CPU) or `2` (two humans); it becomes `game.mode`, which the engine and the tests still read.
  - `onPick(game)` runs when the entry is chosen, before the select screen; return `false` to skip the select screen because the mode took over.
  - `onMatchStart(info)`, `onRoundStart(info)`, `onRoundEnd(info)` and `onMatchEnd(info)` are called for the current mode only (`game.modeId`), from the `match:start`, `round:start`, `round:end` and `match:end` events; `info` is the event payload.
- `MODES.get(id)`, `MODES.list()` (sorted), `MODES.current()` (the mode of `game.modeId`) and `MODES.pick(id)` (sets `game.modeId` and `game.mode`, returns the mode).
- Built in: `versus` ("1 PLAYER VS CPU", order 10, one player) and `versus2` ("2 PLAYERS", order 20, two players). With two entries the title looks exactly as it always did; more entries shrink and, from four on, split into two columns (`titleSlot` in `game.js`, room for six).

### Other extension points

- `ARENAS` (in `arenas.js`) is a plain array that can be pushed to; `game.arena` indexes it modulo its length. `ARENAS.make(o)` builds an entry from the description the nine shipped stages use (`{ id, name, tagline, accent, build(A), paint(g, t, cam, A), front?(g, t, cam, A) }`, painted on a half-resolution 480x270 canvas and built once on first use). `ARENAS.kit` holds the painter's kit they share: sizes `AW`, `AH`, `AG` (the walking line) and `TAU`, plus the helpers `R`, `grad`, `disc`, `fogDraw`, `motes`, `floorBase` and the rest of the list in `arenas.js`.
- `MUSIC` (in `music.js`) is the public music object. `MUSIC.define(name, theme, { trim?, arena? })` adds or replaces a theme (`trim` is a level correction, `arena: true` also uses it for the arena whose `id` equals `name`), `MUSIC.instrument(name, spec)` adds an instrument, `MUSIC.themes()` lists the names. Every theme must stay inside the loudness limits that the tests measure. Read-only peeks for visualisers and tools (they schedule and change nothing): `MUSIC.info(name)` returns `{ bpm, len, from, root, voices }` (`len` in 16th steps, `from` the step a loop restarts at, `voices` the instrument of each of `l`, `b`, `a` that the theme has) or `null`; `MUSIC.hits(name, step, rep)` returns what starts on one 16th step, `{ k, s, t, h, l, b, a }` (drums as 0, 0.4, 1 or 1.3 for a ghost, normal or accented hit; `l`, `b`, `a` as a MIDI pitch or 0), or `null`; `MUSIC.clock()` returns `{ name, step, rep, sd, len }` (`sd` is the seconds of one step, `rep` counts the passes of the loop) for the theme that is sounding right now (`step` is fractional, the audio position) or `null` when nothing sounds.
- `game` (in `game.js`) is the shared state. Read it freely; write to it only through the functions and hooks above. Useful fields: `phase`, `modeId`, `mode`, `f` (the two fighters), `round`, `wins`, `timer`, `sudden`, `cpuLevel`, `sel`, `arena`, `winner`, `loser`, `tick`. A fighter has `side`, `d` (its roster entry, `d.id`), `hp`, `meter`, `state`, `x`, `y`, `face`, `combo`, `cpu`. Helpers: `startMatch()`, `startRound()`, `setPhase(p)`, `roundsToWin()`, `suddenRound()`, `setMuted(v)`, `titleItems()`.
- `ANNOUNCER` (in `hud.js`) speaks the announcer phrases. `ANNOUNCER.define(key, mk)` adds a phrase, where `mk(arg)` returns `{ text, pitch, rate, st? }` (`st` names a stinger); `ANNOUNCER.say(key, arg)` speaks it and `ANNOUNCER.stop()` cuts the current line. `p-voice.js` adds the `voice.*` phrases this way and holds its own lines while an engine phrase plays.
- Name collision warning: everything is one global scope, and `game.js` already has globals such as `hit`, `tap`, `held`, `keys`, `pressed`, `ctx`, `muted`. Wrap each feature file in an IIFE and expose at most one global named after the feature.
- Hooks in use by `p-achievements.js`: `update` (order -20, keeps the OKRS screen's keys away from the title and pause menu), `drawTop` (order 100, the toast and the screen), `titleItems` (`okrs`, order 880) and `pauseItems` (`KeyG`). Details in `docs/features/p-achievements.md`.

## How to add things

**A mode.** In your feature file call `MODES.register({ id: 'arcade', label: 'ARCADE', order: 12, players: 1, onPick(game) { ... }, onMatchEnd(info) { ... } })`. It appears in the title menu on its own. Use `game.modeId === 'arcade'` inside hooks to act only in your mode.

**A title item that is not a mode.** `HOOKS.add('titleItems', () => ({ id: 'options', label: 'OPTIONS', order: 50, run(game) { open the screen } }))`. Draw the screen from a `drawTop` hook and read its keys from an `update` hook while it is open.

**An arena.** In `arenas2.js`: `ARENAS.push(ARENAS.make({ id: 'mystage', name: 'MY STAGE', tagline: '...', accent: '#ffcc00', build(A) { ... }, paint(g, t, cam, A) { ... } }))`, using `ARENAS.kit` for the drawing helpers. Add a theme with the same id in `music2.js` (`MUSIC.define('mystage', theme, { arena: true })`) or the stage borrows one by index.

**A music theme or instrument.** In `music2.js`: `MUSIC.define(name, theme, { trim })` and `MUSIC.instrument(name, spec)`; copy the shape of an existing theme in `music.js`. To switch tracks in play add a `musicTheme` filter. Keep the level inside the limits the music tests measure.

**A move.** Move data lives in `MOVES[id]` in `moves.js` (`sp` the three specials, `su` the super, `fin` the finisher, attack tables). Extra or changed moves belong in `combat.js`, which edits `MOVES` at load time; the engine reads it every tick. React to moves with the `special`/`super` events and change their effects with the `damage` filter.

**A setting.** `SETTINGS.define('arcade.best', { def: 0, min: 0, max: 99, label: 'BEST' })` at load time; read it with `SETTINGS.get`. It is saved and reported through the `settings` event for free. If the options screen should show it, it appears in `SETTINGS.list()`.

**A test.** Write checks in `tools/tests/<feature>.mjs` as `export async function run(t) { ... }`; never edit the body of `tools/test-match.mjs` and add engine or scaffold checks only to `tools/tests/core.mjs`. The runner imports every `tools/tests/*.mjs` (`core.mjs` first, then alphabetical) after the engine checks and before the final console-error check. `t` is `{ p, check, tap, key, wait, stepUntil, park, open, eval }`:

- `t.check(condition, message)` records one line (`ok` or `FAIL`) and fails the run on false.
- `await t.open(hash = '')` loads a fresh `index.html`, optionally with a route such as `'#select'` or `'#demo=0,1&stop'`.
- `await t.eval(code)` runs JavaScript in the page and returns the value (an exception fails the file).
- `await t.tap(code)` presses and releases a key (`'KeyS'`, `'Enter'`) and waits 45 ms; `await t.key(code, down)` is the raw event.
- `await t.stepUntil(phase, max)` steps the simulation until `game.phase` is `phase` (or `max` ticks).
- `t.park` is a snippet to run with `t.eval`: it parks the CPU far from P1 so a human-input test is not interrupted.
- `t.wait(ms)` waits; `t.p` is the raw page driver (`goto`, `eval`, `shot`, `key`, `tap`, `wait`, `errors`).

Tests must be deterministic: freeze the loop with `hold(true)` and advance with `step(n)`. A file that throws is reported as one failure. Screenshots for your own eyes go to `tools/shots/` (git-ignored).

## Coding rules

- Every feature file is wrapped in an IIFE, starts with a header comment naming its owner and area, and keeps the `window.STUB_<NAME> = 1` marker line (the core test checks that each file loaded).
- Additive and zero-cost when idle: a feature that is off must not change the game. The existing tests are the proof; do not loosen them.
- No `localStorage` outside `SETTINGS`, no `fetch`, no external scripts, fonts or images, no `eval`.
- Everything procedural: art and sound are generated in code.
- Hooks must be cheap (they can run every tick) and must not allocate in `update`, `fighterUpdate` or the draw hooks when nothing changed.
- Do not use `console.warn` or `console.error` except for real faults: the test harness treats both as failures.
- Commit messages and documentation are plain prose. Mention the files you touched outside your own.
- Rebuild (`node build.mjs`) and run `node tools/headless.mjs --test` before committing; commit `index.html` with the sources.
