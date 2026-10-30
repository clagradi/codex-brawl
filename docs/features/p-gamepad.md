# p-gamepad: rumble, button glyphs, remapping and the hot-plug toast

Owner: the p-gamepad agent. Code: `p-gamepad.js`. Tests: `tools/tests/x-p-gamepad.mjs`. Shared edits: one script line in `dev.html`, rows in `docs/ARCHITECTURE.md`, one line in `README.md`, and two small hook points in `game.js` (listed at the end).

Everything here only does something while a gamepad is connected. With no pad the game is exactly what it was: no title entry, no pause key, no strip, no toast.

## What the player sees

**Rumble.** A human fighter's pad rumbles through `vibrationActuator.playEffect('dual-rumble', ...)` when it is there, and through the older `hapticActuators[0].pulse()` when only that exists. Nothing happens on a pad with neither. The events and their strength (strong motor / weak motor / milliseconds):

| Event | Who rumbles | Strength |
| --- | --- | --- |
| a hit taken | the victim | `0.25 + 0.6 r` / `0.15 + 0.5 r` / `60 + 160 r` ms, where r = damage / max HP * 5, capped at 1 |
| a hit landed | the attacker | a light tap, 0.05 / 0.22 / 40 ms |
| a block | the blocker | 0.1 / 0.25 / 45 ms |
| a knockdown | the one who fell | 0.85 / 0.5 / 220 ms |
| a throw | the one thrown | 0.7 / 0.4 / 200 ms |
| a super | its owner | 0.45 / 0.8 / 300 ms |
| the KO | the loser, and a little for the winner | 1 / 0.9 / 650 ms, and 0.25 / 0.3 / 200 ms |

A CPU fighter has no pad, so nothing rumbles for it. An effect that is still playing is not cut off by an equal or weaker one; a stronger one takes over. Switching the setting off calls `reset()` on every actuator, so a running effect stops at once.

**Button glyphs.** While the last thing the player touched was a pad, a strip of glyphs replaces the key hints at the foot of the title, select and end screens, and a small pill in the top-left corner of the pause screen offers the setup. A key press hands the hints back to the keyboard; touching the pad brings the strip back. The glyphs follow the remapping, so PICK shows whatever button PUNCH is on now.

| Controller | Glyphs |
| --- | --- |
| standard layout (Xbox style, the default) | A B X Y, LB RB LT RT, SEL START, arrows on the d-pad |
| id with vendor `054c` (PlayStation style) | CROSS CIRCLE SQUARE TRIANGLE, L1 R1 L2 R2 |
| id with vendor `057e` (Switch style) | B A Y X (the A and B positions are swapped) |
| no standard mapping | plain button numbers, B0, B1, ... |

The `gamepad.glyphs` setting can force one of these sets (`letters`, `swapped`, `shapes`) instead of picking from the controller id.

**Remapping.** The GAMEPAD SETUP screen binds the ten pad actions (LEFT, RIGHT, UP, DOWN, PUNCH, KICK, SPECIAL, SUPER, START, BACK) to buttons. Open it from the GAMEPAD entry at the end of the title menu, with H on the pause screen, or with the super button on the pause screen. Move with the d-pad, the stick, or W and S; A, Start, Enter or Space picks a row; B, Back or Esc closes. On an action row A waits for the next button pressed (Esc or about ten seconds of silence gives up). Binding a button that another action has swaps: that action takes the old buttons of the one being changed. SUPER starts on two buttons (Y and RB on the standard layout); binding it replaces both. The same screen switches RUMBLE, GLYPHS and MENU HINTS, shows the buttons that are held, and has RESET THIS GAMEPAD. With two pads connected the first row (GAMEPAD) picks which one is being set up, and that pad is the one that drives the screen.

Maps are stored per controller id, so two different pads keep their own layouts, and the same model comes back the way it was set. A layout equal to the default stores nothing. Only the six newest pads are kept.

While the screen is open it swallows every key and every pad button, so nothing reaches the fight, the options menu or the pause screen behind it. When it closes the pad stays quiet until its buttons are let go, so the A that closed it does not also pick something on the title menu or hit in the fight.

**Hot-plug toast.** A short banner, GAMEPAD CONNECTED and GAMEPAD DISCONNECTED, with the player it belongs to (P1, P2, or SPARE for a third pad). It lasts about three seconds (170 ticks). A pad the browser already reports on the first frame produces no toast. Browsers usually report a pad only after its first button press, so the CONNECTED toast then shows up with that press.

## Settings

All four live in the SETTINGS store under the `gamepad.` prefix.

| Key | Default | Effect |
| --- | --- | --- |
| `gamepad.rumble` | on | rumble on hits, blocks, throws, knockdowns, supers and the KO; off also stops what is running |
| `gamepad.hints` | on | the glyph strip on the menus and the pause screen pill |
| `gamepad.glyphs` | `auto` | `auto`, `letters`, `swapped` or `shapes` |
| `gamepad.maps` | none | `{ controllerId: { l, r, u, d, p, k, s, x, st, bk: [button numbers] } }`, written by the setup screen |

## How it plugs in

`p-gamepad.js` is loaded last, after `vfx.js`, and uses these points of the extension layer:

- `HOOKS` `pad` (filter, new in `game.js`): called in `pollPads()` for each of the first two pads. With no saved map it returns the very same pad object, so the engine reads the real pad. With a map it returns a virtual pad (17 buttons, the pad's axes) in which the engine's button numbers are filled from the mapped ones. While the setup screen is open, or until the buttons are let go after it closed, it returns a blank pad.
- `HOOKS` `menuHint` (run, new in `game.js`): called from the title, select and end screens at the spot of the old key hint line; draws the strip.
- `HOOKS` `update` (order -10, before options.js and the engine): connect and disconnect detection, toast timers, the setup screen's input, the pause screen's super-button shortcut.
- `HOOKS` `titleItems`, `pauseItems`: the GAMEPAD title entry (order 905, last) and the H pause key, both only with a pad connected.
- `HOOKS` `drawTop` (order 50): the setup screen or the pause pill, then the toasts.
- `BUS` `hit`, `block`, `knockdown`, `throw`, `super`, `ko`, `settings` for the rumble.
- `SETTINGS` for the four keys above.

## Layout

| What | Where |
| --- | --- |
| title strip | full-width band, y 494 to 520 |
| select strip | full-width band, y 518 to 540 |
| end screen strip | full-width band, y 507 to 537 |
| pause pill | top-left corner, x 12, y 6 to 34 |
| toast | y 6 on the menus, y 118 in a fight (under the names, clear of the timer and bars), y 486 stacking upward on the setup screen |

## Test API

`window.GAMEPAD` (used by `tools/tests/x-p-gamepad.mjs`): `open(from)`, `close()`, `isOpen()`, `rumble(side, strong, weak, ms)` (true when an effect started), `assign(id, act, button)`, `mapFor(id)`, `effective(id)`, `reset(id)`, `styleOf(pad)`, `active()`, `hint(phase)` (the strip as `[{ text, glyphs }]`), `glyph(button, pad)` and `state()`.

The tests feed a fake `navigator.getGamepads()` with a recording actuator and drive the fight with `hold(true)` and `step(n)`, so they are deterministic. They look at the real fighters (a remapped button punches, the old one does not), the recorded rumble calls, the glyph labels, and the pixels of the strips and toasts.

## Engine edits

Two additive hook points in `game.js`, nothing else:

- `pollPads()`: the first line of the per-pad callback is `gp = HOOKS.filter('pad', gp, side);`.
- `drawTitle()`, `drawSelect()` and `drawOver()`: one `HOOKS.run('menuHint', ctx, game);` each, where the key hint line is drawn.

## Known limits

- The title menu already overflowed with its 11 entries before this feature; with a pad connected the GAMEPAD entry makes it one longer.
- The CONTROLS screen in `options.js` has a read-only text panel that describes the pad as the default layout. It does not follow a remap.
- The browser decides when a pad exists and whether it can rumble. Where a pad has no actuator the rumble setting does nothing, and where a pad is only reported after a button press the toast comes with that press.
