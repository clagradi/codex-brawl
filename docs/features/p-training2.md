# Training mode (p-training2)

Owner: the p-training2 agent. Code: `p-training2.js`. Tests: `tools/tests/x-p-training2.mjs`.

`training.js` is still the stub from the original plan. This file registers the `training` mode that the stub describes and builds the practice room. It loads after every other feature file, so its registration wins if the stub ever registers the same id. It makes no engine edits. Everything plugs in through `MODES`, `SETTINGS`, `BUS` and `HOOKS`.

## How to play it

Pick TRAINING on the title menu (after ARCADE and SURVIVAL). Then pick your fighter and the dummy's fighter on the normal 1P select screen. The round never ends:

- Nobody can be knocked out: a hit stops at 1 health.
- The clock never runs down.
- Health refills after a quiet moment (40 ticks in which the fighter is free).
- Player 1 always has a full super meter.

Leave from the pause screen with `Q`.

| Key | What it does |
| --- | --- |
| `1` | cycle the dummy: STAND, CROUCH, JUMP, BLOCK ALL, BLOCK AFTER HIT |
| `2` | start or stop a recording: for up to 5 seconds (300 ticks) your keys drive the dummy and player 1 stands still; it stops by itself |
| `3` | play the recording on the dummy in a loop, or stop the playback |
| `4` | hitbox overlay on or off |
| `5` | input display on or off |
| `R` | reset both fighters to their start positions with full health; with left or right held, the dummy goes to that corner and player 1 stands in front of it |

`1`, `4` and `5` also work on the pause screen, which lists them. If a player binds one of these keys to a fighting action in OPTIONS, the training feature leaves that key alone. The keys need a keyboard: touch play gets the endless round and the HUD, but it cannot switch the dummy.

## What the screen shows

- **INPUTS (left):** player 1's last 12 inputs, newest at the bottom. Each row shows the direction as an arrow relative to the facing (forward always points right), the button chips (P, K, SP, SU), and how many ticks the input was held.
- **FRAMES (right):** the frame advantage after the last hit or block between the two fighters, labelled ON HIT or ON BLOCK (prefixed DUMMY when the dummy attacked). The number is green when the attacker can act first and red when the defender can.
- Under the advantage: the hit count and damage of player 1's last combo, then the dummy state (or REC with the seconds left, or PLAYBACK), then a key legend.
- **Hitbox overlay:** blue boxes are hurtboxes (white while invulnerable). The attack box is orange during startup, red while active and grey during recovery. Projectiles show as circles.

## How it works

- **Dummy control.** The dummy has `cpu = false`. An `input` hook (order -1000) replaces its whole input every tick, so neither the CPU AI nor the keys can move it. `combat.js` and `defense.js` still see that input, and defense's block stun still applies.
  - BLOCK ALL holds back and decides the height from the attack that is coming. It holds down for lows (`hl: 'low'`, low specials and low projectiles) and for mids. It stands only for overheads (`hl: 'ovh'`) and air attacks.
  - BLOCK AFTER HIT guards the same way for 60 free ticks after the dummy is hit.
- **Recording.** Player 1's input is copied during the hook, player 1 gets a blank input, and the copy drives the dummy. Each frame is stored relative to the dummy's facing, so a recording plays back correctly from either side.
- **Frame advantage.** This uses the definition in `docs/FRAMEDATA.md`. From the hit or block, it counts the simulated ticks (not the hit stop) until each fighter is free: not busy, on the ground and out of the defense block stun. The result is the defender's count minus the attacker's.
  - The tests check that a punch on hit reads the FRAMEDATA value (+6 for player 1).
  - FRAMEDATA lists the base game without block stun. `defense.js` adds block stun, so on block the readout is closer to zero than the table (a punch reads -1 against -8 in the table).
- **Endless round.** A `damage` filter at order 1e9 runs last and caps damage at the victim's health minus 1. The `update` hook skips the clock past each whole second, so `game.timer` never drops and the match never ends on time.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `training2.dummy` | `'stand'` | `stand`, `crouch`, `jump`, `block` (BLOCK ALL), `after` (BLOCK AFTER HIT) |
| `training2.hitbox` | `false` | hitbox overlay |
| `training2.inputs` | `true` | input display |
| `training2.refill` | `true` | health refill and full P1 meter |

## Limits

- The engine has no separate crouch: holding down is the guard state. So CROUCH blocks lows and mids, and only overheads and air attacks hit it.
- The title menu now has 12 entries, which is more than `titleSlot` lays out cleanly (about 8). The release branch has since made the title menu page six entries at a time (`titlePager` in `game.js`), which fixes this.

## Tests

Run `tools/tests/x-p-training2.mjs` with `node tools/headless.mjs --test`. It covers:

- the registration, and that the title order of the first two entries is unchanged;
- the input display, including the cap of 12 and directions relative to the facing;
- the frame advantage, checked against FRAMEDATA and against a separate tick count;
- every dummy behaviour, including blocks against a mid, a low and an air kick;
- record, auto stop and looped playback with no drift in position;
- the hitbox and input toggles, the reset and corner resets, and the pause keys;
- that bound keys are left alone, and the endless round;
- that versus still ends rounds and still runs its clock.
