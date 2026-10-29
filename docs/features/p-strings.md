# Combo strings

Owner: `p-strings.js` (branch `feat/p-strings`). Checks live in `tools/tests/x-p-strings.mjs`.

Every fighter gets four named combo strings. They are listed on a STRINGS page of the move lists and announced on screen when they land. Two mechanics make the longer strings possible:

- a chase jump that follows a launcher into a juggle;
- air chains (P > K > special in the air).

Juggle damage is scaled and capped, so a juggle does no more than a good ground combo. The file wraps four engine functions (see the notes at the end) and otherwise works through `BUS`, `HOOKS` and `SETTINGS`. `game.js` has no diff.

## New inputs

P is punch, K is kick, SP is the special button. Player 2 and the touch buttons use their own keys in the same way.

| Input | What it does |
| --- | --- |
| Hold UP while a launcher lands (the third punch of P P P, or a target combo that ends in a launch) | Chase jump. The fighter jumps straight after the victim and steers under it for 40 ticks, staying 50 px in front. |
| P, then K, then SP in the air, each one after the previous hit connects | Air chain. The air kick and the air special cancel the hit before them. The air special needs some height (24 px over the floor) and a ready special. |
| `N` on the select screen | Flips both move-list panels between MOVES and STRINGS. |
| `N` on the pause screen (listed as `N STRINGS`) | Opens the MOVES screen on the STRINGS page. On that screen `N` flips between MOVES and STRINGS. Leaving the screen closes the page. |

## The strings

Tokens: `P` and `K` are the ground normals, `L` is a launcher, `jP` `jK` `jS` are the air punch, air kick and air special, and `S0` `S1` `S2` are the specials (SP, forward + SP, down + SP). A string lands when the last hits of one combo spell it. A string is announced once per combo. The longest match wins, so FORCE PUSH is announced, not the SHIP IT at its end.

| Fighter | Air string | Launcher juggle | Second juggle or cancel | Special cancel |
| --- | --- | --- | --- | --- |
| Tibo | SHIP IT `jP jK jS` | FORCE PUSH `P P L jP jK jS` | HOTFIX DEPLOY `K K L jK jS` | MERGE CONFLICT `P K S2` |
| Poteto | DEEP FRYER `jP jK jS` | SPUD ORBIT `P P L jP jK jS` | CURLY FRIES `K P L jK jS` | HASH BROWN `P P S1` |
| Dot | ELLIPSIS `jP jK jS` | CONNECT THE DOTS `P P L jP jK jS` | TYPING BUBBLE `K K S0` | READ RECEIPT `P K S2` |
| Wang | GRADIENT DESCENT `jP jK jS` | BACKPROP `P P L jP jK jS` | TRAINING RUN `P K P L jK jS` | OVERFIT `K K S0` |
| Muse | PACKET STORM `jP jK jS` | CLOUD SYNC `P P L jP jK jS` | FLUFF ORBIT `K P K L jK jS` | PING FLOOD `P P S0` |

The `K K L`, `K P L`, `P K P L` and `K P K L` openings are the target combos of `combat.js` that end in a launch.

The STRINGS page shows the chase jump and the four strings. It uses the player's own keys, for example `J>J>J>UP>J>K>L` for FORCE PUSH on P1. Player 2, the CPU and touch rows use the short names P, K and SP. Juggle strings are gold and air strings are sky blue. The page has a note column with the hit count, which is dropped on the narrow select-screen panels.

The callout is the string name in gold, with `N HIT STRING` under it, on a dark plate under the attacker's health bar (left for P1, right for P2). It lasts 96 ticks and comes with a short three-note sting.

## Juggle rules

- A launch (the `launch` hit state of `combat.js`, or any hit that throws a grounded victim up at 9 px per tick or faster) starts a juggle owned by the attacker. Small gold pips over the victim count the juggle hits.
- Each juggle hit by the owner on the airborne victim deals 0.9, 0.8, 0.7, then 0.6 of its damage. Its knockback is capped at 3, so the victim stays in reach.
- The whole combo (launcher included) stops at 35 percent of the victim's life bar. The engine's own long-combo scaling is counted in, and a hit that would go over the cap is cut down to the room left.
- After 4 juggle hits, or when a hit reaches the cap, the juggle is locked. The victim cannot be hit until it lands, and the pips turn red.
- The juggle ends when the victim lands or leaves the hurt state.
- A super that ends a juggle is scaled but not capped.
- Blocked hits, other attackers and ground hits are not touched.

With real inputs the juggle strings deal 27 to 35 damage. HOTFIX DEPLOY, TRAINING RUN and FLUFF ORBIT reach the cap exactly.

## CPU

When a CPU launcher lands, the CPU chases with probability `clamp((cpuLevel - 0.3) * 1.4, 0, 0.9)`. That is never on easy (0.2), about 0.2 on normal (0.45) and about 0.56 on hard (0.7). During the chase it presses P near the victim, then K after the air punch connects, then SP after the air kick connects.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `strings.on` | `true` | The whole feature: chase jump, air chains, juggle rules, string detection and the STRINGS page. Off gives the game as it was. |
| `strings.callouts` | `true` | The on-screen name and the sting. Detection and the `strings:land` event stay on when this is off. |

## Events and hooks

- Emits `strings:land` `{ fighter, foe, name, hits, kind, combo }`, where `kind` is `'AIR'`, `'JUGGLE'` or `'CANCEL'`.
- Emits `strings:chase` `{ fighter, foe }` and `strings:juggle` `{ src, victim }`.
- Listens to `hit`, `hitstate`, `special`, `phase` and `round:start`.
- Hooks:
  - `update` at order -10 (the `N` key and the callout clock);
  - `input` at order 5 (the CPU chase and air chain);
  - `fighterUpdate` (chase steering, juggle end and lock);
  - `damage` at order 20 (juggle scaling, after `combat.js`);
  - `drawFighter` (pips), `drawHud` (callouts), `drawTop` (the `N` hints) and `pauseItems` (`N STRINGS`).
- `window.STRINGS` exposes `list(id)`, `rows`, `tokenOf`, `feed(fighter, token)`, `state(fighter)`, `page`, `toggle()`, the counters `COUNT` and the constants `JUG`, `CHASE` and `AIR_WIN`, for tests and other feature files.

## Tuning

All tuning is at the top of `p-strings.js`:

- `JUG_MAX`, `JUG_SCALE`, `JUG_CAP` and `JUG_KB` for the juggle;
- `CHASE_V` (take-off speed), `CHASE_T` (steering ticks) and `CHASE_GAP` for the chase jump;
- `AIR_WIN`, the air-chain window after contact, in ticks;
- `CALL_T`, how long the callout stays.

## Testing

`tools/tests/x-p-strings.mjs` runs inside `node tools/headless.mjs --test`. It covers:

- the table rules;
- all 20 strings landed by real key input for every fighter, with the callout, the event and the damage under the cap;
- the juggle rules with scripted hits: scaling, knockback, lock, landing, cap, super and off;
- both settings;
- the callout pixels on the canvas;
- the CPU chase by difficulty;
- the pause item and the pause MOVES screen;
- the select-screen page.

To try it by hand, pick Tibo, press P P P next to the opponent while holding W, then press J, K, L in the air.

## Notes for the integrator

- Wrapped engine functions, nothing in `game.js` edited:
  - `Fighter.prototype.tryCancel` (outermost, since this file loads last): chase jump and air chains;
  - `Fighter.prototype.reset`: `fighter.strs`, the per-fighter state;
  - `window.moveRows`: the STRINGS rows;
  - `window.drawMoveList`: the page title, and the narrow-panel rows without notes.
- A later feature file that wraps the same functions should call through to the previous version, as this file does.
- Touch players can see the strings only from the pause item. There is no on-screen `N` button on the select screen.
- Seen while testing, not caused by this feature: on the pause MOVES screen, the help lines at the bottom (from other features) overlap a little.
- Suggested README line (added): combo strings, the chase jump, air chains, the juggle cap and the `N` key.
