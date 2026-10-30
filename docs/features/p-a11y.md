# p-a11y: accessibility options

Owner: the a11y agent. Code: `p-a11y.js`. Tests: `tools/tests/x-p-a11y.mjs`. Shared edits: one script line in `dev.html`, rows in `docs/ARCHITECTURE.md` and one line in `README.md` (see the end of this file).

The feature uses only the extension layer (BUS events, HOOKS points, SETTINGS) and a few wrappers around global drawing functions. `game.js` is not touched. Every option defaults to off except the screen reader announcements, which are silent unless assistive technology is running. Two options follow the operating system the first time the game runs: high contrast follows `prefers-contrast: more` and reduced motion follows `prefers-reduced-motion: reduce`. With everything off the game draws and plays exactly as before.

## What the player sees

**The ACCESSIBILITY screen.** It opens from the ACCESSIBILITY entry next to OPTIONS in the title menu, from `Y` on the title, or from `Y` on the pause screen. `Y` on the title does nothing while a screen of another feature (the sound test, the vault, the watch picker, the arcade or mode screens and the like) is open over it. It is a panel with six rows and BACK. `W`/`S` or up/down choose a row. `A`/`D`, left/right, `Enter`, `Space` or punch change the value. `Esc`, `Backspace`, `Y` or kick go back, and `P` also goes back when the screen was opened from pause. A help line under the rows says what the highlighted option does. On a touch screen you tap a row to change it and tap outside the panel to close it. The screen closes by itself if the game leaves the title or the pause screen.

**Color filter (OFF, PROTAN, DEUTAN, TRITAN).** The finished frame, menus included, goes through a daltonize filter for red-weak, green-weak or blue-weak vision. The filter moves the colour differences a viewer with that vision cannot see onto channels they can see. Greys stay grey. The simulation matrices are from Machado, Oliveira and Fernandes (2009) at full severity. The filter is an SVG `feColorMatrix` applied with the canvas `filter` property through one buffer copy per frame. A browser without canvas filters gets the same filter as a CSS filter on the canvas element.

**High contrast HUD.** During the fight the health bars, name tags, super meters and timer are redrawn on top of the normal HUD. They use solid black boxes with 3-pixel white outlines, a solid yellow bar for P1 and a solid cyan bar for P2 with quarter marks, a SUPER NN% or SUPER READY label, and a bigger timer that turns its border red under 10 seconds. The HUD is hidden during the instant replay.

**Larger text.** Menu, hint and help text drawn with `uiText` grows by a quarter when it is 28 pixels or smaller, and `ptext` text at sizes 2 and 3 grows one size. Text only grows when it still fits on the screen, so nothing is pushed off an edge. Big headings and banners keep their size.

**Reduced motion.** There is no screen shake, no white flash and no KO slow motion. The engine's own short hit-stop stays, so hits still read. The instant replay keeps playing at normal speed. The vfx impact frames switch to their soft tint.

**Screen reader.** A visually hidden live region (`role="status"`, `aria-live="polite"`) announces the title menu entry and its position, the fighter under the cursor on the select screen, the versus card, each round, "Fight!", each round result with the score, the match winner, the pause screen and the options under the cursor on the pause and options screens. The attract demo is not announced, since the listener did not start it; the way back to the title is. Messages of one tick are joined into one announcement. A message that repeats the last one gets a non-breaking space so it is read again. The canvas also gets an `aria-label`.

**Simple specials.** For human players the special button uses the direction instead of the motion and the facing. `L` alone is the first special, `L` + left or right is the second special whichever way the fighter faces, and `L` + down is the third. A direction pressed up to 6 ticks before `L`, or while the special is still buffered, also counts. The move lists show LEFT / RIGHT + in place of FWD + for the second special. The CPU is not affected.

## Settings

All six options live in the SETTINGS store under the `a11y.` prefix.

| Key | Label | Default | Effect when on |
| --- | --- | --- | --- |
| `a11y.cb` | COLOR FILTER | `'off'` | `'protan'`, `'deutan'` or `'tritan'` filters the whole frame |
| `a11y.contrast` | HIGH CONTRAST HUD | `prefers-contrast: more` | the solid HUD described above |
| `a11y.bigText` | LARGER TEXT | `false` | bigger menu and hint text where it fits |
| `a11y.motion` | REDUCED MOTION | `prefers-reduced-motion: reduce` | no shake, flash or slow motion |
| `a11y.live` | SCREEN READER | `true` | announcements in the live region; off empties it |
| `a11y.simpleSp` | SIMPLE SPECIALS | `false` | direction plus `L` for specials, for human players |

## Hooks and wrappers

- `update` at order -20: reduced motion clears `game.shake`, `game.flash` and `game.slow`, the screen reads its keys, and menu announcements are polled.
- `update` at orders 49 and 51: these sit on both sides of the vfx.js KO slow motion (order 50), which sets a 1-tick hit-stop on three ticks out of four. With reduced motion that extra hit-stop is removed. An engine hit-stop that was already running is never touched.
- `update` at order 1000: the live region is written once per tick.
- `input` at order -10: simple specials.
- `drawTop` at 8000 draws the high contrast HUD, at 9000 the ACCESSIBILITY screen, and at 10000 the colour filter, so the filter sees everything.
- `titleItems` adds ACCESSIBILITY with order 890, just before OPTIONS (900), so OPTIONS stays the last entry and wrapping up from the first entry still lands on it. `pauseItems` adds `Y` ACCESSIBILITY.
- BUS: `phase`, `match:start`, `round:start`, `round:end`, `match:end` and `settings`.
- Wrapped globals: `uiText` and `ptext` (larger text), `drawWorld` (shake) and `drawPost` (flash) for reduced motion, and `moveRows` for the simple specials label (the STRINGS page of p-strings is passed through as it is, with its flag and cache). `SETTINGS.get('reducedFlash')` reads true while reduced motion is on. vfx.js checks that key, no file defines it, so no stored value changes.

## Public API

`window.A11Y` exposes `keys` (the six setting keys), `open()`, `close()`, `rows` (the screen rows), `announce(text)`, `matrix(mode)` (the 3x3 filter matrix), `mix(mode, r, g, b)` (one colour through the filter), `applyFilter(ctx, mode)`, `canFilter`, `text` (the larger text helpers) and `state()`. `state()` returns the screen state, the current settings and the counters: frames filtered, slow motion ticks removed, the last flash passed to `drawPost`, and the last announcements.

## How to test

```
node build.mjs
node tools/headless.mjs --test
```

`tools/tests/x-p-a11y.mjs` runs after `core.mjs` and covers each option:

- **Settings and wiring.** The six settings, their labels and defaults, the live region attributes, the SVG filters, and the title and pause entries.
- **Color filter.** Greys stay unchanged. Red and blue each move by more than 25 levels in the right mode. The canvas output matches the matrix within 3 levels, and one whole frame is filtered.
- **Larger text.** It grows by about a quarter, it is held back at the screen edge, and big headings keep their size.
- **High contrast HUD.** The bar, meter and timer pixels have the expected colours.
- **Reduced motion.** A KO with reduced motion has no shake, flash or slow motion, passes no flash to `drawPost` and runs at full speed. With reduced motion off the slow motion is still there.
- **Screen reader.** The announcements for the title menu, the match start, a KO and the match win, muting, a repeated message, and the silent attract demo.
- **Simple specials.** Back plus `L` and forward plus `L` both give the second special, a late down gives the third, and the move list label changes (the STRINGS page keeps its own list).
- **The screen.** Keyboard navigation on the title and from pause, touch on a row and outside the panel, and the auto-close.
- **Full match.** A full CPU match with every option on reaches the end screen with no shake, flash or slow motion.

At the end the file resets every `a11y.` key to its default.

## Known limits

Text drawn directly with `ctx.fillText` by other features does not grow. Only `uiText` and `ptext` do. The colour filter costs one full-frame copy per frame while it is on. The live region needs a screen reader to be heard, and how the announcements are read depends on the browser and the screen reader.

## Shared edits

- `dev.html`: `<script src="p-a11y.js"></script>` after `vfx.js`.
- `docs/ARCHITECTURE.md`: the load order, file ownership and SETTINGS rows, plus a note on the update hook orders.
- `README.md`: one Controls line about the ACCESSIBILITY screen.
