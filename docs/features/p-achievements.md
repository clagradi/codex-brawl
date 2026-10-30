# p-achievements: OKRS

Owner: the p-achievements agent. Code: `p-achievements.js`. Tests: `tools/tests/x-p-achievements.mjs`. Shared edits: one script line at the end of `dev.html`, rows in `docs/ARCHITECTURE.md` (load order, `okr:unlock`, the `okrs` setting, the hooks note) and one README section.

Everything is built on the extension layer (BUS events, HOOKS points, SETTINGS). `game.js` is not touched and no other feature file is read or required: if a feature that emits one of the events below is missing, the matching objectives simply never move.

## What the player sees

**Thirty objectives.** Parody names for things a fighter can do: win matches, land hits, chain combos, block, throw, use supers, survive. Each one has a goal, a progress bar and a line of text on the OKRS screen.

**A toast.** When an objective is reached a panel drops in from the top of the screen, centred under the HUD (on the end screen it glides to the free left side, below the colourways unlock note and clear of the share button), and stays for 210 ticks (3.5 seconds) with a three-note jingle. Reaching several at once queues the toasts one after the other. The toast is not drawn, and does not run down, while the OKRS screen is open.

**The OKRS screen.** Opens from the OKRS entry of the title menu, from the "G OKRS n/30" button in the top left corner of the title (tap, click or the `G` key), or with `G` on the pause screen. Two pages of 15 rows, an overall bar ("n/30 ACHIEVED") and, for the selected row, the full text of the objective.

| Input | Effect |
| --- | --- |
| `W` / up, `S` / down | move the selection |
| `A` / left | previous page |
| `D` / right, Enter, Space, punch | next page |
| Escape, `G`, kick | close (`P` also closes it from the pause screen) |
| tap or click a row | select it |
| tap or click the PAGE label | next page |
| tap or click BACK | close |

While the screen is open every pressed key is cleared each tick, so the title menu and the options pause menu underneath never see the input (a tap on OKRS does not start a match). Closing it restores the title selection.

## The objectives

Only human fighters count (`cpu === false` when the event arrives); in a 2 player match both players count. Training mode (`game.modeId === 'training'`) never counts, and neither does an automated fuzz match: `tools/fuzz.mjs` sets `window.__qa.cur` while it plays, and while that is set no event is counted, so replaying a seed keeps giving the same events whatever progress is saved.

| Id | Name | Goal |
| --- | --- | --- |
| `ship` | SHIP IT | win your first match |
| `cd` | CONTINUOUS DELIVERY | win 10 matches |
| `unicorn` | UNICORN STATUS | win 50 matches |
| `fullstack` | FULL STACK | win a match with each of the 5 fighters |
| `debt` | TECH DEBT | lose 10 matches |
| `sprint` | SPRINT VELOCITY | win 5 matches in a row |
| `cloud` | MULTI CLOUD | win in 5 different arenas |
| `pivot` | PIVOT | play 3 different modes |
| `hello` | HELLO WORLD | land 1 hit |
| `commit` | COMMIT HISTORY | land 200 hits |
| `mono` | MONOREPO | land 1000 hits |
| `pipeline` | BUILD PIPELINE | a 5 hit combo |
| `tenx` | 10X ENGINEER | a 10 hit combo |
| `firewall` | FIREWALL | block 50 hits |
| `ratelimit` | RATE LIMITER | 5 perfect defenses |
| `fork` | HARD FORK | 10 throws |
| `sudo` | SUDO | 10 supers |
| `flags` | FEATURE FLAGS | 50 specials |
| `reload` | HOT RELOAD | 5 EX moves |
| `glass` | BREAK GLASS | 1 combo breaker |
| `ooo` | OUT OF OFFICE | 10 taunts |
| `rc` | RELEASE CANDIDATE | 1 finisher |
| `chaos` | CHAOS ENGINEERING | 5 arena hazards |
| `postmortem` | POSTMORTEM | 1 stage finish |
| `zero` | ZERO DOWNTIME | win a round without taking damage |
| `rollback` | ROLLBACK KING | win a round with 10% health or less |
| `hotfix` | HOTFIX | win a round by KO in under 20 seconds |
| `oncall` | ON CALL | win a round in sudden death |
| `freeze` | CODE FREEZE | win a round on the clock |
| `nines` | FIVE NINES | win 5 matches without losing a round |

The word that the engine's `flawless` flag carries is not used anywhere on screen; the untouched round is read from `winner.dmgTaken === 0`.

## BUS events used

| Event | Counts |
| --- | --- |
| `hit` | `hits` and the best `combo` when `src` is human |
| `block` | `blocks` when `victim` is human |
| `defense:perfect` | `perfect` when `victim` is human |
| `throw` | `throws` when `src` is human |
| `special`, `super`, `ex`, `breaker`, `taunt` | `specials`, `supers`, `ex`, `breakers`, `taunts` when `fighter` is human |
| `hazard` | `hazards` when `user` is human |
| `stagefinish`, `finisher` | `stagefinish`, `finishers` when `winner` is human |
| `match:start` | the mode id goes into `md` if any fighter is human |
| `round:end` | untouched, comeback, quick, clock and sudden-death rounds when the winner is human and the reason is `ko` or `time` |
| `match:end` | wins, losses, win streak, fighters and arenas won with, matches won without losing a round |

Handlers are defensive: a missing payload or a missing field never throws. After each event the objectives are checked and any newly reached one is unlocked.

## New BUS event

`okr:unlock` with `{ id, name, desc, count, total }`, emitted once per objective at the moment it is reached (`count` is how many are done including this one). Other features may listen to it.

## SETTINGS

One key, `okrs` (type `any`, default `null`). The value is the object `{ v, got, n, best, cur, fx, ar, md }`:

- `got`: `{ id: order }` for each reached objective (the order it was reached in);
- `n`: the counters named in the table above;
- `best`: `{ combo, streak }`;
- `cur`: the current win streak;
- `fx`: fighter ids a match was won with; `ar`: arena indices won in; `md`: mode ids played.

`clean()` rebuilds a valid object from anything that is stored (null, an array, wrong types, huge numbers, unknown fighters), so a hand-edited or old save never breaks the screen. The state object is the stored value itself, so counting only sets a dirty flag. It is written when an objective is reached, when a match ends, when the screen closes, on `pagehide`, and every 120 ticks while something changed. The live object is stored once when the script loads (the setting reads `null` only until then), so every later write puts the same reference back and `SETTINGS.set` emits no `settings` event in the middle of a match. If another part of the game replaces the key (a `SETTINGS.reset('okrs')` or a `set`), the new value is adopted. "RESET TO DEFAULTS" in the options screen only resets its own list of keys (`OWN` in `options.js`), so it leaves the OKRS progress alone.

## HOOKS used

| Hook | Order | Use |
| --- | --- | --- |
| `update` | -20 | runs the toast, flushes the save, opens the screen on `G` at the title, and while the screen is open reads the navigation keys and clears all pressed keys |
| `drawTop` | 100 | draws the screen when open, otherwise the title corner button and the toast |
| `titleItems` | 880 | the OKRS entry of the title menu |
| `pauseItems` | key `KeyG` | opens the screen from the pause screen |

`window.drawTouch` is wrapped so the touch buttons are hidden while the screen is open (the same approach as the options screen).

## The window.OKRS API

Meant for tests and for other features: `defs`, `total`, `count`, `state`, `dirty`, `progress(id)` (`{ val, goal, done }`), `unlocked()`, `screen`, `selected`, `page`, `pages`, `perPage`, `toast`, `queued`, `toastLength`, `open()`, `close()`, `flush()`, `clean(raw)`, `human(fighter)` and `reset()`.

## Adding an objective

Add one `D(id, name, desc, goal, val)` line to the list at the top of `p-achievements.js`, where `val(state)` reads the progress from the saved counters. If it needs a new counter, add its name to `NKEYS` and count it in the matching `listen(...)` handler. Names and texts use only the pixel font glyphs and capital letters, and the `PAGES` constant grows by itself. Update the table above and the count in `tools/tests/x-p-achievements.mjs`.

## Notes for the integrator

- The title menu already holds many entries before OKRS (1 PLAYER VS CPU, 2 PLAYERS and the mode registry entries, then OPTIONS). The layout in `titleSlot` (`game.js`) fits about six, so with the shipped modes the last rows already run past the bottom of the canvas and the OKRS entry (order 880, next to last) is not visible there. For that reason the screen also has the corner button and the `G` key on the title, which do not depend on the menu layout. The release branch has since made the title menu page six entries at a time (`titlePager` in `game.js`), so the OKRS entry is reachable there as well.
- Nothing else is needed from the engine: no hook was added.
