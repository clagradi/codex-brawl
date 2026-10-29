# x-vfx: presentation and game feel

Owner: the vfx agent. Code: `vfx.js`. Tests: `tools/tests/x-vfx.mjs`. Shared edits: one script line in `dev.html` and four small relaxations in `tools/tests/core.mjs` (see the end of this file).

Everything here is built on the extension layer only (BUS events, HOOKS points, SETTINGS). `game.js` is not touched. The 60 Hz simulation stays deterministic: every effect is driven by the tick counter, never by wall-clock time, so `step(n)` reproduces it exactly.

## What the player sees

**Super cut-in.** When a super starts the whole game freezes for 40 ticks. A diagonal band slides across the screen with the fighter portrait, the move name in big pixel capitals and speed lines. After 40 ticks the move plays. A finisher gets the same treatment with the label FINISHER. The camera also punches in on the two fighters while the super plays.

**Hit-stop tiers.** The freeze on impact depends on the hit: 3 ticks for a light hit, 5 for a medium one, 8 for a heavy one, 12 for a super. A counter hit (hitting a fighter in the middle of their own attack) counts one tier up, up to heavy. The engine's own freeze is never shortened, so a longer engine freeze still wins.

**Hit sparks.** Each hit spawns a pixel spark whose shape follows the hit kind: small cross for light hits, star burst for medium, big ring and rays for heavy and supers. Blocks get a small cyan spark.

**Impact frames.** Heavy hits, counters and supers flash 2 frames of dark silhouettes on a flat bright background with radial lines. A short cooldown stops two impacts in a row from strobing.

**KO slow motion.** The round-ending hit plays at quarter speed for about 45 ticks (after the engine hit-stop) with a camera zoom on the point of impact.

**Instant replay.** After the hit that decides the match the last 120 ticks are replayed from a ring buffer of fighter positions, states, frames and effects, with a REPLAY label, letterbox bars, a blinking red dot, a progress bar and a different zoom. Any button skips the replay (after a 20-tick grace period so a mashed button does not skip it by accident). Rounds that do not decide the match are not replayed. The replay stops 18 ticks after the killing blow, so it never shows the finisher.

## Settings

All three live in the SETTINGS store under the `vfx.` prefix and default to on. They show up in the options screen wherever it lists the settings.

| Key | Label | Effect when off |
| --- | --- | --- |
| `vfx.replay` | INSTANT REPLAY | the deciding KO goes straight to the winner call |
| `vfx.cutin` | SUPER CUT-IN | no 40-tick freeze or banner; the engine's short super freeze stays |
| `vfx.impact` | IMPACT FRAMES | no silhouette flash frames |

Hit-stop tiers, sparks, KO slow motion and the camera effects are part of the game feel and have no switch of their own.

## Accessibility

`game.shake` and `game.flash` (screen shake and white flash) are scaled by the accessibility settings when the options file defines `shake` and `flash`. The scaling only affects values being raised, so decrements and `Math.max` reads in the engine behave as before. With reduced flashing the impact frames swap the inverted silhouettes for a soft tint. If those settings are not defined the values pass through unchanged.

## Inputs

No new keys and no new menu screen. The replay is skipped with any button (any key or pad button, after the grace period). The three settings above are the only controls.

## Public API

`window.VFX` exposes constants and helpers for tests and other features: `tiers`, `cutLen`, `slowLen`, `replayLen`, `tail`, `grace`, `hold`, `impactLen`, `tierOf(kind, dmg, opt, counter)`, `skipReplay()`, `levels()` and `state()` (the live cut-in, impact, spark count, replay progress and counters).

## How to test

```
node build.mjs
node tools/headless.mjs --test
```

`tools/tests/x-vfx.mjs` runs after `core.mjs`. It checks that the three settings exist and default to on; that forced hits give hit-stop 3 / 5 / 8 / 12 and that counters bump a tier; that impact frames start on heavy hits, counters and supers and last 2 frames; that a super freezes for exactly 40 ticks and then plays; that the KO plays at quarter speed and traces identically on two runs; that the replay starts at the deciding KO, ignores the grace period, skips on any button, ends by itself, and does not start when `vfx.replay` is off; that a full CPU match still reaches the end screen with every effect on; and that the shake and flash scaling leaves normal values untouched.

## Known limits

The gentle zoom-out when the fighters are far apart was not built: a zoom below 1 would show the arena edges, and the camera API has no clamp for that yet. The replay shows effects recorded as simple draw views, so effects added by other features that draw with closures over live state may look slightly different in the replay (they are drawn inside a guard, so a failure never breaks the match).

## Shared edits

- `dev.html`: `<script src="vfx.js"></script>` after `touch.js`.
- `tools/tests/core.mjs`: four small relaxations so feature files can join the scaffold checks: the load-order check compares only the scaffold's own prefix; the settings-key list and the settings round-trip ignore dotted keys (feature keys such as `vfx.replay`, which are checked by their own test file and documented here).
