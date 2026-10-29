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
| `settings` | `{ key, value, old }` | a `SETTINGS` value changed (only when the value is different) |

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

### SETTINGS keys

One store, persisted as JSON under `localStorage` key `brawl.settings`. A blocked or corrupt store means the defaults. Never read `localStorage` for options anywhere else. API: `SETTINGS.get(key)`, `set(key, value)` (validates, stores, persists, emits `settings`, returns the stored value), `toggle(key)`, `reset(key)` (no key: all), `all()`, `list()` (definitions in registration order, for an options screen), and `SETTINGS.define(key, spec)`.

`define` takes `{ def, type?, min?, max?, step?, values?, label?, legacy?, fromLegacy? }`. The type is inferred: boolean is `'bool'`, number is `'num'` (clamped to `min..max`, rounded to `step`), a `values` array is `'enum'`, anything else is `'any'` (a JSON-safe value). `legacy` names an older `localStorage` key that is read once when nothing is stored yet, and `fromLegacy` turns its string into the value.

| Key | Type and default | Range | Read by |
|-----|------------------|-------|---------|
| `difficulty` | enum, `'normal'` | `'easy'`, `'normal'`, `'hard'` | `game.js` `DIFFICULTY`: the CPU level at the start of a match (0.2, 0.45, 0.7) and how much it rises after each round (0.15, 0.2, 0.25) |
| `rounds` | num, `2` | 1 to 4 | `roundsToWin()`; sudden death is round `2 * rounds` |
| `time` | num, `99` | 30 to 99 | seconds per round (sudden death stays 30) |
| `musicVol` | num, `1` | 0 to 1, step 0.05 | `music.js` level; 1 is the mix the tests measure |
| `sfxVol` | num, `1` | 0 to 1, step 0.05 | `beep()` and `thud()` in `game.js` |
| `voiceVol` | num, `1` | 0 to 1, step 0.05 | announcer speech and stingers in `hud.js` |
| `gore` | bool, `true` | | `FX.gore` in `hud.js` mirrors it; migrated from the old `brawl.gore` key |
| `muted` | bool, `false` | | the `muted` flag in `game.js` mirrors it (use `setMuted(v)`); migrated from the old `brawl.muted` key |
| `binds` | any, `null` | `null` or `{ p1?, p2?, alt? }` | `game.js` `applyBinds()`: for each player, an object of action letter to an array of `KeyboardEvent.code`; it replaces only the actions it names. Actions are `l r u d p k s x` |

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
- `MUSIC` (in `music.js`) is the public music object. `MUSIC.define(name, theme, { trim?, arena? })` adds or replaces a theme (`trim` is a level correction, `arena: true` also uses it for the arena whose `id` equals `name`), `MUSIC.instrument(name, spec)` adds an instrument, `MUSIC.themes()` lists the names. Every theme must stay inside the loudness limits that the tests measure.
- `game` (in `game.js`) is the shared state. Read it freely; write to it only through the functions and hooks above. Useful fields: `phase`, `modeId`, `mode`, `f` (the two fighters), `round`, `wins`, `timer`, `sudden`, `cpuLevel`, `sel`, `arena`, `winner`, `loser`, `tick`. A fighter has `side`, `d` (its roster entry, `d.id`), `hp`, `meter`, `state`, `x`, `y`, `face`, `combo`, `cpu`. Helpers: `startMatch()`, `startRound()`, `setPhase(p)`, `roundsToWin()`, `suddenRound()`, `setMuted(v)`, `titleItems()`.
- Name collision warning: everything is one global scope, and `game.js` already has globals such as `hit`, `tap`, `held`, `keys`, `pressed`, `ctx`, `muted`. Wrap each feature file in an IIFE and expose at most one global named after the feature.

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
