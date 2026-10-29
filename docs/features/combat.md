# Combat depth

Owner: `combat.js` (branch `feat/combat`). Checks live in `tools/tests/combat.mjs`.

The feature adds a layer of fighting-game depth on top of the existing normals, specials and supers: hit states, high and low guarding, counter and punish hits, a three-bar meter with EX specials, a combo breaker and a taunt, two target-combo strings per fighter, and a CPU that uses all of it at hard difficulty. It wraps `Fighter.prototype` and uses the extension layer (`BUS`, `HOOKS`), so `game.js` has no diff.

## New inputs

All of these are listed on screen (pause screen, round-1 hint strip, move lists) and work from the keyboard, both gamepads and touch, because they are built from the same button state (`held` and `hit`) as the existing buttons. SP is the special button, SU is the super button.

| Input | What it does |
| --- | --- |
| Forward + K from neutral | Standing overhead (a different move for each fighter, see below). Slow, so it can be reacted to. Must be blocked standing. |
| Hold SU, then press SP (gamepad: hold RB, press X) | EX special. Costs one bar. |
| Back + SU while in hitstun | Combo breaker. Costs two bars, 3 second cooldown. |
| Down, down + SU with less than one bar | Taunt. Adds 15 meter, long recovery, speech line. |
| K, K, P (and the other strings listed below) | Target combos. Press the next button after the previous hit connects. |

The super still needs a full meter (three bars) and the same chord as before (SU, or P + K together).

## Hit states

Each state can happen at most once per combo (the combo resets when the victim has recovered or 70 ticks pass). Every state has its own colour, sparks and a short word that floats over the victim.

| State | Word | Trigger | Effect |
| --- | --- | --- | --- |
| Launch | none (blue sparks) | A launcher normal (the third hit of the punch chain, a launching string end, an EX special that is not a projectile) | Victim goes airborne for a juggle. |
| Crumple | CRUMPLE | A heavy normal (7 or more damage) that is a counter hit, or the flagged special of each fighter (the DOWN + SP move) | Slow collapse, 56 ticks of hitstun, long juggle window. |
| Stagger | STAGGER | A counter-hit overhead | Victim wobbles in place for 44 ticks, cannot act, is not knocked down. |
| Ground bounce | BOUNCE | An air kick on an airborne victim that is less than 100 px above the floor | Victim bounces back up for a follow-up. |
| Wall bounce | WALL SPLAT | A heavy normal within 40 px of a wall | Victim is thrown back off the wall. |
| Hard knockdown | HARD DOWN | Sweep or throw | The victim stays down about 24 ticks longer than after a plain knockdown (65 ticks against 41 in the tests). |

## High, low and overhead

- A held back blocks mids, as before.
- Lows must be blocked crouching: DOWN + P, DOWN + K (the sweep), and Tibo's REVERT (DOWN + SP). Move lists mark them LOW.
- Overheads must be blocked standing: FORWARD + K (new, per fighter) and every jump attack. A crouching guard loses to them.
- A wrong guard height lets the hit through as if unblocked, flashes the fighter red and shows LOW or HIGH over their head. The `hit` payload carries `hl` (`low`, `mid` or `ovh`) so other features can read it.
- A blocked special or super still chips: the damage is raised before the normal guard reduction so at least about one point of life is lost (EX specials chip a little more).

Overheads: Tibo MERGE HAMMER, Poteto MASHER SMASH, Dot DOT DROP, Wang SCALING LAW, Muse FLUFF SLAM.

## Counter hit and punish

- Counter hit: a hit while the victim is in the startup or hit frames of their own move. 1.25 times the damage, 6 extra ticks of hitstun, a COUNTER! banner, and `counter: true` in the `hit` payload.
- Punish: a hit while the victim is in the recovery of a move that whiffed or was blocked (a taunt counts). PUNISH! banner, `punish: true` in the payload, and 12 extra meter for the attacker. A move that already landed is not punishable.

## Meter: three bars

The meter is the same 0 to 100 meter as before, shown as three bars (the HUD shows the bar count, and the bar has two marks).

- EX special: one bar. Each special gets an EX variant: melee specials do 1.35 times the damage, absorb one hit during their startup (60 percent damage, no interruption) and launch if they do not already knock down; the projectile special throws a second shot 9 ticks later and both shots do 1.35 times the damage. EX shows an EX word, a cyan outline and fires the `ex` event. With less than one bar the plain special comes out and nothing is spent.
- Super: three bars, unchanged.
- Combo breaker: two bars. Needs back held while in hitstun and at least one hit already landed on you. Pushes the attacker away, ends the combo, flashes the screen, fires `breaker`, and cannot be used again for 3 seconds (180 ticks). While it is available the HUD flashes BREAK! BACK + SU.
- Taunt: below one bar, down, down + SU on the ground. +15 meter, 72 ticks of recovery, a speech line per fighter, `taunt` event. A taunting fighter can be punished.

## Target combos

Two strings per fighter. The first letter is the plain normal; every later press must come after the previous hit connects (the existing cancel window). Middle hits are light and step forward so the next one reaches. The last hit deals 9: a string ending in P launches, one ending in K is a hard knockdown. A string press replaces the ordinary chain move for the same input; special cancels keep priority.

| Fighter | String | Name |
| --- | --- | --- |
| Tibo | K, K, P | HOTFIX CHAIN |
| Tibo | P, K, K | ROLLBACK |
| Poteto | K, P, P | DOUBLE MASH |
| Poteto | P, K, P | FRY CYCLE |
| Dot | K, K, K | DOT DASH |
| Dot | K, P, K | ROUND TRIP |
| Wang | K, K, P, K | SCALING PLAN |
| Wang | P, K, P, P | LAB RETREAT |
| Muse | K, P, K, P | FLUFF FLURRY |
| Muse | P, K, K, K | PAW SHUFFLE |

## CPU

- Easy: no strings, no breaker.
- Normal: keeps going along a string after a landed normal about half of the time. No breaker.
- Hard: strings 85 percent of the time. Throws the overhead at crouching guards, a low (down + attack) at standing guards, pays for EX when it presses special with a bar, reads incoming overheads by standing up to guard, and breaks combos of three or more hits when it has two bars (a tenth of a chance per tick of hitstun).

## Move lists and hints

Move lists (pause screen, select screen) now hold up to 12 rows: the overhead row (FWD + K, marked OVERHEAD), the two target-combo rows, a LOW mark on the sweep and on lows, and the finisher folded into the SU row as a note (`FIN <name>`). The pause screen has two extra lines about overheads, EX, the breaker and the taunt. The first round shows a hint strip at the bottom for the first seconds. The HUD shows the bar count under each meter and the BREAK! cue.

## Events and hooks

New `BUS` events: `hitstate {src, victim, state}`, `ex {fighter, foe, move}`, `breaker {fighter, foe, combo}`, `taunt {fighter, foe}`. The `hit` payload gains `counter`, `punish`, `hl`, `state`, and when set `ex` and `armour`; the `block` payload gains `hl`. Handlers registered after `combat.js` see these fields. No new `SETTINGS` keys and no new hook points.

Hooks used: `input`, `fighterUpdate`, `damage`, `drawFighter`, `drawWorld`, `drawHud`, `drawTop`. Wrapped methods: `Fighter.prototype.takeHit`, `startAtk`, `startMove`, `tryCancel`, `frame`, `reset`, and `window.moveRows`. Per-fighter state lives in `fighter.cb`, created by `reset()`.

## Tuning

Constants at the top of `combat.js`: `BAR`, `BREAKER_CD`, `TAUNT_LEN`, `HARD_EXTRA`, `WALL_ZONE`. Data tables: `OVH` (overheads), `TCS` (strings), `SPEC` (flagged specials), `TAUNTS` (speech lines), `STY` (state look and feel).

## Notes for the integrator

- Edits outside this feature's files: `hud.js` (the super bar marks now split the bar into three sections) and `tools/test-match.mjs` (the move-list row cap went from 10 to 12; the matching comment next to `moveRows` in `game.js` still says 10).
- Not done: damage scaling per hit state, an air throw, a juggle gravity tweak.
- Suggested README text: "Forward + K is an overhead (guard standing). Down attacks are lows (guard crouching). Hold SU and press SP for an EX special (one bar). Press back + SU while being hit to break a combo (two bars). Fill three bars for the super."
