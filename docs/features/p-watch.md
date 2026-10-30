# Attract demo and WATCH mode (p-watch.js)

Two ways to watch the game play itself. Both run the normal engine with two CPU fighters, so moves, arenas, music, rounds, hazards and the automatic camera behave exactly as in a played match. Nothing in `game.js` was changed: the feature plugs in through `BUS`, `HOOKS`, `SETTINGS` and `MODES`.

## Attract demo

Leave the title screen alone for 20 seconds and a CPU versus CPU round starts by itself.

- The idle clock only counts while the title is showing, no options, controls or setup screen is open, and nobody touches anything. A key, a gamepad button, a mouse move, a click, a wheel turn or a touch resets it.
- The demo pairs rotate through ten matchups of the five fighters and through every arena, so two demos in a row never look the same. The CPU level is HARD so the round is lively.
- A gold PRESS START banner blinks at the bottom of the screen with ANY KEY FOR THE MENU under it. It sits in the gap between the two super meters and covers neither.
- Any key, click, tap or pad button ends the demo and returns to the title. That input is used up by leaving, so it does not also pick a menu entry.
- The demo lasts one round at most. It also ends 90 ticks after a KO, which is before the engine would start the next round. It never reaches the match end, so it adds nothing to the arcade stats.
- Everything the demo touches (banners, projectiles, effects, camera, slow motion) is cleared when it ends, and the title comes back exactly as it was.

## Live commentary captions

Both the demo and WATCH matches show a one-line caption in a box under the HUD. Lines come from event pools for round starts, leads, ties, combos, big hits, blocks, knockdowns, throws, specials, supers, finishing moves, low health, ten seconds left, quiet spells, KOs, time-outs, draws and match ends.

- Wording cycles through the pools by a counter, never by random numbers, so a replay of the same seeded fight says the same things.
- Every line has a priority. A lesser line cannot replace a fresher, more important one for the first second; the end of a round and the end of a match always get through.
- Captions fade after a few seconds and are not drawn on the versus screen, the pause screen or the end screen.
- The CAPTIONS switch (picker or settings) turns commentary off. With it off no line is even composed.

## WATCH in the title menu

WATCH sits in the title menu after 2 PLAYERS (order 45) and opens a picker instead of the character select.

| Row | What it does |
| --- | --- |
| Left fighter | Any of the five fighters. |
| Arena | Any arena, or RANDOM. |
| Right fighter | Any of the five fighters (the same one on both sides is allowed). |
| CPU level | EASY, NORMAL, HARD or NIGHTMARE. Applied to both fighters, and reset every round so the engine's difficulty ramp does not take over. |
| Captions | ON or OFF. |
| Demo idle | ON or OFF for the title attract demo. |
| START WATCHING | Starts the match. |

Controls on the picker: Up and Down change the row, Left and Right change the value, Enter (or punch) goes to the next row and starts on the last one, R rolls random fighters and a random arena, Esc (or kick, or the BACK button at top left) leaves. With the mouse or touch, a click on the left third of a value steps back, anywhere else on it steps forward, switches flip and START WATCHING starts. The last picks are remembered between visits.

During the match the keys are the engine's own, with P to pause and Q from the pause screen to leave. Input from the players is ignored, since both fighters are CPU. The auto camera runs as usual.

On the end screen: Enter or R watch the same pairing again, Esc goes back to the picker, and T shares the result on X as the engine already does.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `watch.attract` | on | Run the demo after the idle time. |
| `watch.idle` | 20 | Seconds on the title before the demo, from 5 to 120. |
| `watch.captions` | on | Show commentary captions. |
| `watch.level` | normal | CPU level of WATCH matches. |
| `watch.pick` | empty | Last picker choices (left fighter, right fighter, arena). |

All of them show up in the OPTIONS screen through the settings registry.

## Notes for integrators

- The demo trigger is an `update` hook that reads the engine phase and counts ticks on the title. There is no timer and no `setTimeout`.
- A WATCH match uses `game.mode = 2` with both fighters flagged as CPU when the match starts, which keeps the engine's share text on its ordinary path. The arcade stats still count a finished WATCH match, because it is a normal match as far as the BUS is concerned; the attract demo never reaches `match:end` and never counts.
- Other overlays that should stop the idle clock can register through `WATCH.guard(fn)`; the function returns true while the overlay is open. OPTIONS, the controls screen, the arcade screens, the bonus overlay and the modes2 setup screens are already covered. On the release branch the demo also waits while the screens of JUKEBOX, VAULT, OBS, GAMEPAD, MUTATORS, OKRS, TUTORIAL (lesson list), A11Y, REPLAYS and DAILY are open.
- The title menu now holds twelve entries when every feature is loaded, which is more than the screen shows comfortably. Whoever owns the title layout should look at the spacing.
- The idle clock counts game ticks, not wall time. A test that sits on the title for 20 real seconds will see the demo start. Use `hold(true)` or change `watch.idle` in such a test.

## Notes for testers

`window.WATCH` is the test hook: `screen()`, `picker`, `row()`, `state()`, `caption()`, `log()`, `lines`, `line()`, `demoPick(n)`, `levels`, `open()`, `close()`, `pointer(x, y)`, `demo(a, b, arena)`, `match(a, b, arena, level)`, `leave()`, `clear()`, `guard(fn)`, `seed` and `LIMITS`. `tools/tests/x-p-watch.mjs` covers the registration, the picker by key and pointer, a full watched match with its end-screen keys, the idle timing and every way of resetting it, leaving the demo, the level reset per round, the caption pools (every line is checked against the pixel font), priority and dwell, pixel checks of the blinking banner and the caption box, determinism for a fixed seed, and a source scan.

A synthetic `PointerEvent` needs `pointerType: 'mouse'`. Without it the engine's touch detection switches the canvas to the touch layout in the middle of the event, and the coordinates no longer match the layout that was measured.
