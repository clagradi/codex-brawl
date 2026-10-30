# p-vault: the EXTRAS screen

Owner: the p-vault agent. Code: `p-vault.js`. Tests: `tools/tests/x-p-vault.mjs`. Shared edits: one script line at the end of `dev.html`, three rows in `docs/ARCHITECTURE.md` (load order, file ownership, the `vault.stats` setting) and an Extras paragraph in `README.md`. `game.js` is not touched: the vault talks to the engine only through `BUS`, `HOOKS` and `SETTINGS`.

## What the player sees

EXTRAS is a title menu entry (order 850, between the game entries and OPTIONS), and `V` on the title opens it too. It opens a screen with four tabs. The engine stays in the `title` phase the whole time; the screen is drawn by a `drawTop` hook over an opaque backdrop and reads its own input in an `update` hook.

| Tab | What it shows |
| --- | --- |
| FIGHTERS | A big viewer (the sprite at three times its size, feet on a lit floor) with arrows to browse the five fighters, a picker for all eleven animations (idle, walk, jump, punch, kick, special, super, block, hit, ko, win) that plays the chosen one in a loop, a flip button, the fighter's name, tag line, bio and SPEED, POWER and HEALTH bars, and a row of colourway chips. |
| ARENAS | The arena thumbnail at 560 by 315 with its name, tag line and how often you played it, next to a scrolling list of every arena. Click the picture for the next arena. |
| COLOURWAYS | A fighter selector and five cards per fighter: the classic look, three alternates and the star colourway. A colourway that is still locked shows a question mark and a hint (WIN A MATCH AS the fighter). |
| STATS | A table with matches, wins, losses, win rate and best combo per fighter, a totals panel (matches, rounds, KOs, specials, supers, finishers, longest combo and who made it, arcade badges, ladder clears, best survival score) and the most played arenas as bars. |

## Controls

| Input | Effect |
| --- | --- |
| arrows or `W` `A` `S` `D` | FIGHTERS: left and right browse fighters, up and down pick the animation. ARENAS: any direction steps through the arenas. COLOURWAYS: up and down pick the fighter, left and right the card. |
| `Enter`, `Space`, `J`, `Z`, `C` | FIGHTERS: cycle the colourway of the fighter on show (locked ones are skipped). |
| `F` | FIGHTERS: flip the sprite. |
| `Q` / `E`, `PageUp` / `PageDown`, `Tab`, `1` to `4` | Previous or next tab, or a tab by number. |
| `Esc`, `Backspace`, `K`, `X` | Back to the title menu, which keeps the selection it had. |
| mouse or touch | Every tab, arrow, animation row, colourway chip, arena row and the BACK button is a hit rectangle. A touch also turns the touch controls on. |

While the screen is open it clears the pressed keys after reading them, so the title menu underneath never sees them, and a capture-phase pointer handler keeps the click from reaching the game. If anything else changes the phase the screen closes by itself.

## Lifetime stats

Counted from `BUS` events and kept in the setting `vault.stats` (type `any`, default `{}`). The stored record is

```js
{ v: 1, m, r, ko, sp, su, fi, combo, comboBy, f: { <fighterId>: { w, l, c } }, ar: { <arenaId>: plays } }
```

`m` matches, `r` rounds, `ko`, `sp`, `su` and `fi` the KOs, specials, supers and finishers a human fighter landed, `combo` the longest chain a human made with `comboBy` the fighter id, `f` the wins, losses and best combo per roster fighter and `ar` the plays per arena id.

- Only human fighters (not `cpu`) count for the combo, KO, special, super and finisher numbers. Training counts for nothing. The overclocked mirror boss is not a roster fighter and gets no wins or losses.
- Wins and losses are credited to the fighters of every finished match, whoever controlled them. Arena plays are counted when a match starts.
- Nothing is written per hit, per round or while a match is on. Saving fires a `settings` event on the bus and the engine events test counts those during a match, so the record is saved when the game leaves the end screen, pauses, goes back to the title or the selection, and when the page is hidden or closed. The numbers of a match are therefore on disk by the time the next one starts, and a crash in the middle of the end screen is the only way to lose them.
- Whatever is stored is cleaned on load and on every outside write: whole numbers capped at a billion, the five roster ids only, arena ids matching `[a-z0-9_-]` (at most 64 of them), unknown keys dropped. `SETTINGS.reset('vault.stats')` zeroes the live record.
- The STATS tab shows our record raised to the arcade record where that is higher (matches, longest combo, wins and losses per fighter): both count the same matches, so the larger value is used, never the sum. The arcade badges, ladder clears and survival score are read from `ARCADE.stats()` when `arcade.js` is loaded.

## Optional dependencies

None are required. If `palettes.js` is missing the colourway screens show the classic look only. If `arcade.js` is missing the arcade block of the STATS tab is left out. Colourway sheets are made at most one new recolour per frame, so a first look at an unseen colourway never stalls a frame.

## Test API

`window.VAULT`: `TABS`, `state` (the live screen state: `open`, `tab`, `fi`, `an`, `ai`, `cf`, `cc`, `flip`, `cws`, `st`), `open()`, `close()`, `setTab(i)`, `view()` (the merged stats), `flush()`, `ways(id)` (the colourways with their `locked` flag), `stats()` (the raw record), `isOpen()`, `click(x, y)` (a canvas-space tap), `hits()` (the rectangles drawn last frame, with ids such as `tab:2`, `back`, `fighter:1`, `anim:5`, `way:3`, `arena:7`, `arena:next`, `flip`), `anims()` and `reset()`. `window.STUB_VAULT === 1` marks the file as loaded.

`tools/tests/x-p-vault.mjs` freezes the loop with `hold(true)`, sends real key events followed by `step(1)`, dispatches real `PointerEvent`s on the canvas at the rectangles `VAULT.hits()` reports, and compares the screen as pixels (it renders and hashes a canvas region, so a different fighter, animation, flip, colourway, arena or set of numbers must give a different picture). The stats are driven by fabricated `BUS` events on real `Fighter` objects and by one complete match started with `startMatch()`.

## Notes

- The `#demo=i,j` debug route starts its match while `game.js` loads, before the feature files are there to listen, so that one match is not counted. Matches started from the menus are.
- The title menu holds twelve entries on a full build and `titleSlot()` in `game.js` has room for six, so the lower entries (EXTRAS and OPTIONS among them) are drawn below the bottom of the canvas. That was already true before this feature (eleven entries, two columns of six); it needs a scrolling or paged title menu in the engine. Until then `V` opens EXTRAS from the title, and so does moving the selection onto it with `W` and `S` and pressing `Enter`.
