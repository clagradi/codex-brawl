# Match mutators (p-mutators.js)

Six optional modifiers for a versus match, picked on the select screen before the fight. All six are off by default, so a match without any of them is the normal game. The ones that are on show as coloured tags on the VS screen and under the round timer during the fight, and the choice is remembered between visits.

## The six mutators

| Mutator | Tag | What it does |
| --- | --- | --- |
| BIG HEADS | BIG HEADS | Every head and face is drawn about a third larger (the human heads also sink a little into the shoulders). Plush fighters get a larger hood opening and face. It shows in the fight, the versus screen and everywhere else a fighter sprite is drawn during a match. |
| LOW GRAVITY | LOW GRAV | Fighters in the air keep only 60 percent of the engine's gravity: a jump goes about 1.7 times higher and the air time is about 1.7 times longer. Grabbed fighters and fighters on the ground are untouched. |
| TURBO 1.5X | TURBO | The fight simulates 1.5 ticks for every tick of real time: movement, attacks, cooldowns, projectiles and the round clock all run 1.5 times as fast. The VS screen, the round intro and the end screens run at normal speed. |
| RATE LIMITED | RATE LIMIT | After each special a fighter's special stays on cooldown for 210 ticks (3.5 seconds at 60 ticks per second). While it recharges a small amber bar over the fighter fills up. The CPU respects it too, because it uses the same cooldown the engine already checks. Supers, attacks and throws are not limited. |
| LEGACY MODE | LEGACY | The whole frame is turned into a green-screen look: grey, tinted phosphor green, blacks lifted to dark green, with scanlines over it. Menus, the VS screen and the fight all get it. |
| GLASS CANNON | GLASS | Every hit does double damage, so rounds end fast. Block and shield reductions apply after the doubling, as for any damage. |

## How to use it

On the select screen of the 1 PLAYER VS CPU and 2 PLAYERS modes, a small hint at the top right says `G MUTATORS` (and how many are on). Press `G` to open the panel:

- `W` / `S` or up / down move the highlighted row
- `Enter`, `Space`, `J`, `A`, `D` or left / right toggle the highlighted row
- `1` to `6` toggle a row directly
- `X` or `Backspace` switch everything off
- `G`, `Esc` or `K` close the panel

While the panel is open the select screen behind it ignores all keys, so nothing gets confirmed by accident. Choose the fighters and arena as usual after closing it. The mutators apply to the next match that starts and stay on for the whole match, including rematches.

Mutators are keyboard only for now: there is no touch or gamepad way to open the panel. A phone user can still play with mutators that were saved from a keyboard session, because the choice is stored with the other settings.

## Which modes

Mutators apply in the `versus` and `versus2` modes and in any mode whose definition sets `mutators: true` (a mode can opt in with `MODES.register({ id, ..., mutators: true })`). Every other mode (arcade, survival, training, team, tournament, king of the hill and the bonus games) plays as normal even when the saved choice has some mutators on, and the select-screen hint is not shown there.

## Notes for the other features

- Key `G` is the panel key on the select screen. It is not one of the default bindings, but the options screen lets a player rebind a control to `G`; the panel then wins on the select screen only (it runs first and clears the key press for the screen behind it).
- RATE LIMITED, TURBO and LOW GRAVITY use the engine's own state (`f.cool`, `f.vy`, `f.y`, the `update` function) and add no engine hook. TURBO runs `window.update()` once more from an `update` hook on every other tick of a fight, guarded against re-entry. Because of that, every `update` handler of every feature runs twice in that real tick (see "HOOKS points" in `docs/ARCHITECTURE.md`).
- BIG HEADS builds a second sheet and extra-pose sheet per fighter the first time it is needed (a few milliseconds per fighter, once) by calling the sprite code with `H_`, `plushHood` and `drawHead` wrapped to a larger scale, then puts those canvases into `SHEETS` and `XSHEETS` while it is live and puts the classic ones back otherwise. Alternate colourways (`palettes.js`) recolour from whichever sheet is current, so the two features work together. A feature that caches something from `SHEETS` should key it on the canvas identity, as `palettes.js` does.
- LEGACY MODE paints with canvas blend modes (saturation, multiply, lighter) and reads no pixels, so it costs three full-screen fills and one scanline blit per frame.
- Damage comes through the `damage` filter before the engine's guard and shield reductions, so a blocked hit under GLASS CANNON is still 2 times a normal blocked hit.

## Public API

`window.MUTATORS` (marker `window.STUB_MUTATORS = 1`):

| Member | Meaning |
| --- | --- |
| `ids`, `list()` | the six ids in their fixed order (`bigheads`, `lowgrav`, `turbo`, `rate`, `legacy`, `glass`) and `{ id, name, desc, on }` for each |
| `isOn(id)`, `active()`, `count()` | what is switched on |
| `live(id)` | on, and the game is in a match phase of a mode in scope right now |
| `set(id, on)`, `toggle(id)`, `clear()` | change the choice (saved to `SETTINGS` key `mutators.on`) |
| `open()`, `close()`, `isOpen`, `sel` | the select-screen panel |
| `bigSheets(id)`, `bigLive(id)` | the BIG HEADS sheets of a fighter (null until built) and whether they are swapped in now |
| `scope()` | whether the current mode is in scope |
| `K` | the tuning numbers (`HEAD_K`, `HEAD_DY`, `GRAV_K`, `TURBO_EVERY`, `RATE_COOL`, `GLASS_K`) |

## Settings key

| Key | Type | Meaning |
| --- | --- | --- |
| `mutators.on` | any, `{}` | `{ mutatorId: true }` for each mutator that is on; anything else stored there (a number, an unknown id) is ignored |

## How it is built

No engine file is edited. The file plugs in through `HOOKS` `update` (TURBO's extra tick, the BIG HEADS sheet swap, the panel keys), `fighterUpdate` (LOW GRAVITY, RATE LIMITED), `damage` (GLASS CANNON), `drawFighter` (the recharge bar), `drawHud` (tags under the timer) and `drawTop` (the select hint and panel, the VS tags, the LEGACY filter), plus `BUS` `match:start`, `round:start`, `phase` and `settings`.

## How to test it

`node build.mjs`, then `node tools/headless.mjs --test`. The checks are in `tools/tests/x-p-mutators.mjs`. They drive the panel with real key events, measure a jump (height and air time), the tick and clock counts under TURBO, the cooldown of a special for a human fighter and for a seeded CPU, the damage of a punch and a super, the pixels of the LEGACY frame, the sheets and draw calls of BIG HEADS, the tags on the VS screen and the HUD, the mode scope, the saved choice, a corrupt stored value and that there are no console errors.
