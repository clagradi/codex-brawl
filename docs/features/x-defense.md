# Defense options (x-defense)

Owner: the x-defense agent. Code: `defense.js`. Tests: `tools/tests/x-defense.mjs`.

Blocking in the base game is just holding back. This feature adds three layers that make defending a skill instead of a waiting state: a perfect guard for good timing, a guard pushback that spends meter to break pressure, and three ways to get up from a knockdown. Two smaller options (air recovery and a wake-up reversal) sit on top.

## Inputs

No new global keys and no new menu entries were needed: everything is built from the buttons you already have (move, punch, kick, special), so it works the same on keyboard, on two gamepads and on touch. The inputs are listed on screen: two extra lines above the move strip during the first seconds of round 1, and two extra lines at the bottom of the pause screen.

| Situation | Input | Result |
| --- | --- | --- |
| A hit is about to land | Press back on the tick the hit lands, or up to 4 ticks before | Perfect guard |
| Blocking (in blockstun) | Special (L, or the special button) | Guard pushback, costs meter |
| Knocked down, first 10 ticks on the floor | Punch or kick | Quick rise |
| Same, with a direction held | Punch or kick plus forward or back | Tech roll that way |
| Knocked down, at the end of the lie time | Hold down | Stay down 20 ticks longer |
| Reeling in the air for more than 30 ticks | Any attack button | Air recovery (once per combo) |
| First free tick after standing up | Special | Wake-up reversal |

A press made in the last 3 ticks of the fall also counts for the quick rise and the roll, so mashing a button while you fall works.

## Perfect guard

* The window is the tick the hit lands plus the 4 ticks before it (5 ticks in all). Only a fresh press of back counts: holding back from long before does not, and pressing again within 10 ticks of the previous press does not either (anti-mash).
* The hit does no damage at all (a normal block still takes about 15 percent chip damage), pushes the defender no further than 1 pixel per tick, and leaves 4 ticks of blockstun.
* Feedback: a blue screen flash for 12 ticks, sparks and two rings, a "PERFECT GUARD" label, a two-note chime, a short extra hitstop, and a small meter reward (6 percent of the bar).
* The base game has no blockstun, so the feature adds its own: after an ordinary block the defender is held in the guard for about 55 percent of the hit's own stun (6 to 14 ticks, 16 for a super). A perfect guard cuts that to 4. The lock is released at once when a hit lands, and it can be switched off with `DEFENSE.ownBlockstun = false` if the combat feature supplies its own.

## Guard pushback

* While in blockstun, pressing the special button spends one bar when the meter has three bars, otherwise half of the meter (50 of 100 in the shipped game). `DEFENSE.meter()` reads the meter layout from the combat feature when it exists, and falls back to 100 with half as the cost.
* The attacker is staggered and thrown back about 80 pixels, the defender is invulnerable for 12 ticks and locked in the guard for 8, and the screen shakes briefly.
* Without enough meter the press shows "NEED METER" and does nothing. If the attacker is more than 240 pixels away it shows "TOO FAR". Only humans can use it.

## Knockdown options

* Quick rise: punch or kick within 10 ticks of landing skips most of the lie time (about 17 ticks shorter) and uses the base game's usual invulnerable get-up.
* Tech roll: the same press with forward or back held rolls that way instead. The roll is 14 ticks of invulnerable travel (the fighter slips through the opponent), drawn as a tucked, spinning sprite with two trailing ghosts.
* Stay down: holding down at the end of the lie time keeps the fighter on the floor for 20 more ticks (useful to wait out a safe jump or a projectile). The window for rising early has to be unused.
* A fighter flagged `noTech` (a hard knockdown, for example from a future finisher) ignores all of this.
* Air recovery: after more than 30 ticks reeling in the air, any attack button flips the victim up and away with 12 invulnerable ticks. The counter keeps running through extra hits, and the escape is used up until the fighter stands in a neutral state again.
* Wake-up reversal: a special pressed (or buffered) for the first tick after standing up adds 6 invulnerable ticks on top of the get-up ones and shows "REVERSAL".

## CPU behavior

The CPU follows the `difficulty` setting:

| Difficulty | Perfect guard chance per blocked hit | Quick rise chance per knockdown |
| --- | --- | --- |
| Easy | about 6 percent | 12 percent |
| Normal | about 16 percent | 30 percent |
| Hard | about 29 percent | 55 percent |

The perfect guard chance is also scaled by the CPU level that ramps during a match (a factor from 0.7 to 1.3). When the CPU decides to rise it presses 2 to 6 ticks after landing and rolls about a third of the time. The CPU never uses the pushback, air recovery or reversal, and its own random button presses are ignored while it lies on the floor.

## Interface for other features

* `window.DEFENSE`: `on` (set false to disable everything), `ownBlockstun`, `rec` (per-side records), `count` (how often each option fired this page load), `meter()`, `rates()`, `reset()` and the constants `WIN`, `RISE_WIN`, `STAY_EXTRA`, `PG_STUN`.
* BUS events: `defense:perfect`, `defense:pushback`, `defense:rise`, `defense:roll`, `defense:air` and `defense:reversal`, each with the fighters involved.
* Hooks used: `damage` (decides the perfect guard, late), `input` (back-press tracking, blockstun, knockdown options, pushback), `update`, `fighterUpdate`, `drawFighter` (the roll), `drawWorld`, `drawHud` (round 1 hint) and `drawTop` (flash and pause panel). BUS listeners: `block`, `hit`, `match:start`, `round:start`.
* No `SETTINGS` key is defined, so nothing changes in the options menu.

## Tests

`tools/tests/x-defense.mjs` is deterministic: the real-time loop is frozen with `hold(true)`, only `step(n)` advances time and the keys are set directly. It checks the window edges (hit tick and 4 ticks early work, 5 ticks early is an ordinary block with chip damage), no chip damage and blockstun 4, the flash and chime, the pushback (meter spent, fighters separated, defender invulnerable, nothing without meter), quick rise with P and K and its window edges, the pre-landing press, rolls in both directions with invulnerability, stay down, air recovery (once per combo, not early), the reversal, the CPU rates and dice, and that the hints are drawn in round 1 and on the pause screen.

## Shared files touched

* `dev.html`: one line, `<script src="defense.js"></script>` right after `touch.js`.
* `tools/tests/core.mjs`: the exact script-order check ignores `defense.js`, because that check is a fixed list of the first batch of files.

## Known limits

* Two taps of back within 14 ticks are the base game's back dash, so a second perfect guard attempt right after a first tap needs a short pause between the taps.
* The ten-row move list on the pause screen is untouched; the new inputs have their own lines instead, to avoid a conflict-prone edit of `game.js`.
* The timing numbers (window of 4 ticks, lockout of 10, 20 extra ticks down) are constants at the top of `defense.js` and easy to tune.
