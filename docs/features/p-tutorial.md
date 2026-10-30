# Tutorial (p-tutorial)

Owner: the p-tutorial agent. Code: `p-tutorial.js`. Tests: `tools/tests/x-p-tutorial.mjs`.

TUTORIAL is an onboarding mode for new players. It has ten short lessons, played against a practice dummy. Each lesson shows what to press, checks that the player really did it, and gives a hint when a try goes wrong. Progress is saved, so a cleared lesson stays cleared between visits.

## How it is reached

TUTORIAL is a mode on the title menu (`MODES` id `tutorial`, order 28, one player). It comes after ARCADE and SURVIVAL. Picking it does not open the select screen. It opens a lesson list on the title screen instead:

| Key | Action |
| --- | --- |
| `W` / `S` (or up / down) | choose a lesson; the first lesson not yet cleared is selected when the list opens |
| `A` / `D` (or left / right) | choose the fighter you play (any of the five; the dummy is the next one in the roster) |
| punch, `Enter` or `Space` | start the lesson |
| kick, `Esc` or `Backspace` | back to the title menu |
| mouse or touch | tap a row to select it and tap it again to start; the arrows change the fighter; the START and BACK buttons |

The list shows OK next to each cleared lesson, a portrait of the chosen fighter, the three lines of explanation for the selected lesson and the overall progress.

## The lessons

Each lesson has two or three steps. A panel under the health bars lists them, and the current step is marked. A counter appears when a step needs several tries. The keys in the text follow the way you face: "HOLD D" when the dummy is to your right and "HOLD A" when it is to your left. Special and super names are the real names of the moves of the fighter you chose.

| # | Lesson | Steps | The dummy |
| --- | --- | --- | --- |
| 1 | MOVE | walk up to the dummy, back away, jump twice | stands still |
| 2 | ATTACK | punch it, kick it, sweep it (down + K) | stands still |
| 3 | BLOCK | block three attacks holding away; block two low kicks crouching | walks in and punches or kicks, then kicks low |
| 4 | CHAIN | land a 3 hit chain (J J J); cancel a punch into a special (L as the hit lands) | stands still |
| 5 | THROW | throw it (toward + J up close); break its throw (J the moment it grabs) | walks in, shows a "!" warning, then grabs |
| 6 | SPECIAL | L, toward + L, down + L: each must be the named move | stands still |
| 7 | SUPER | fill the bar with hits (it starts at 60%), then press I | stands still |
| 8 | DASH | dash in, backdash, hit within 45 ticks of a dash | stands still |
| 9 | AIR | jump in and kick in the air; hit the dummy while it jumps at you | stands, then keeps jumping in from a distance |
| 10 | GET UP | quick rise (J on landing); roll (a direction + J on landing) | walks in and sweeps |

The hints, in red under the steps, include "HOLD A BEFORE IT HITS" (a hit was taken while learning to block), "LOW ATTACK: HOLD S (CROUCH) TO BLOCK", "PRESS L RIGHT AFTER THE HIT LANDS", "TOO LATE: PRESS J THE MOMENT IT GRABS", "OTHER MOVE: HOLD D WHILE YOU PRESS L", "DASH FIRST (TAP D TWICE), THEN HIT", "JUMP FIRST (W), THEN PRESS K", "TOO LATE: HIT IT BEFORE IT LANDS" and "DO NOT BLOCK: LET THE SWEEP LAND".

When the last step is done, LESSON CLEAR is shown and the next lesson starts by itself about two seconds later. After lesson 10 the game returns to the lesson list.

The GET UP lesson checks the quick rise and the roll through the `defense:rise` and `defense:roll` events of `defense.js`. If that feature is not loaded or is turned off, the lesson accepts any way of getting up after a knockdown instead.

## Rules inside a lesson

- Nobody is knocked out: a `damage` filter (order 1000, so it runs after every other filter) never takes the last point of health. Health comes back whenever a fighter is standing or walking.
- The round clock never counts down, and the dummy never builds super meter or quick-rises.
- The dummy is driven by an `input` hook at order 1000. It runs after every CPU brain, so no other feature changes what the dummy does.
- The pause screen gets two extra keys through `pauseItems`: `R` RESTART LESSON and `T` NEXT LESSON. `Q` (quit) goes back to the lesson list on the current lesson. A skipped lesson does not count as cleared.

## Saved progress and events

- `SETTINGS` key `tutorial.done`: a bit mask of the cleared lessons (bit k is lesson k + 1, 0 to 1023).
- BUS `tutorial:step` `{ lesson, id, step }` fires when a step is done.
- BUS `tutorial:done` `{ lesson, id, cleared, total }` fires when a lesson is cleared.

## Script API

`window.TUTORIAL` exposes:

- `lessons`: the id, name and number of steps of each lesson.
- `state()`: the screen, the current lesson and step, the selection, the hint text and the dummy behaviour.
- `open(sel)`: opens the list.
- `start(k, pid)`: starts lesson k with fighter pid.
- `isDone(k)`, `progress()` and `reset()`: read or clear the saved progress.

## Testing

`node build.mjs`, then `node tools/headless.mjs --test`. The `x-p-tutorial` checks cover the following:

- the title entry and the list keys;
- each of the ten lessons, played to the end with real key presses (including one wrong try per hint where it can be set up);
- the automatic advance and the two events;
- no KO, the frozen clock and the pause keys;
- the progress kept after a page load.

The tests set the keys directly and advance time with `step()`, so they are deterministic.
