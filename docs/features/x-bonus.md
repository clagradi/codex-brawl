# Bonus minigames: BENCHMARK BREAK and BUG SQUASH

Owner: the bonus agent. Files: `bonus.js`, `tools/tests/x-bonus.mjs`, this note. Two one-player modes sit on the title menu next to 1 PLAYER VS CPU and 2 PLAYERS, and a small API lets the arcade ladder drop a bonus stage between two fights.

## How to play

Pick BENCHMARK BREAK or BUG SQUASH on the title menu. A lobby opens over the title: A and D choose the fighter, Enter starts, Esc goes back to the title. A short READY, 3, 2, 1, GO countdown follows, and the attack keys are ignored until it ends.

All keys are the ones the fighting game already uses. Player one's keys work (W A S D and J K L, the alternative arrows and Z X C set, or whatever the options screen rebound them to). A gamepad and the touch buttons work as well, because the minigames read the same `hit`, `held` and `tap` helpers as the fight code. On a phone the lobby shows < FIGHTER, FIGHTER >, START and BACK (a tap on a fighter icon picks it, a second tap on the chosen one starts), a running game shows the d-pad with the P, K and SP buttons next to a PAUSE button (the pause menu has RESUME and QUIT), and the result screen has AGAIN and TITLE. The lobby and result texts name P, K and SP instead of keys while `touch.on` is set.

| Screen | Keys |
|---|---|
| Lobby | A and D choose the fighter, Enter starts, Esc returns to the title |
| BENCHMARK BREAK | J and K mash, L breaks the stack, P or Esc pauses |
| BUG SQUASH | A and D turn the fighter around, J punch, K kick, L special, P or Esc pauses |
| Pause | P or Enter resumes, Q quits to the title (the run is not saved) |
| Result | Enter plays again (or continues, when the stage was started with `BONUS.run`), Esc returns to the title |

### BENCHMARK BREAK

The fighter faces a stack of hardware. Five stacks, one per level, and each level lasts twelve seconds. Mash J and K to fill the power meter; the meter drains all the time, faster on the later stacks. Alternating J and K pays a bonus (a mash is worth 30 per cent more when it follows the other key). When the meter is above the BREAK LINE, press L to break the stack. Pressing L below the line is a weak hit: the meter loses a quarter of its range and the miss is counted. A stack that is not broken in twelve seconds scores nothing and the next one comes in.

| Level | Stack | Break line | Drain per second | Base points | Sound word |
|---|---|---|---|---|---|
| 1 | WOOD CRATE | 35 | 12 | 100 | KRAK! |
| 2 | SERVER RACK | 45 | 15 | 200 | CLANG! |
| 3 | GPU TOWER | 55 | 19 | 300 | KA-ZAP! |
| 4 | QUANTUM CHIP | 65 | 24 | 500 | ZZZT! |
| 5 | AGI MONOLITH | 75 | 29 | 800 | SOON! |

The grade depends on how far above the line the meter was at the moment of the break: S from 85 per cent of the way to the top, A from 55, B from 25, C below that. The multipliers are 3, 2, 1.5 and 1. On top of the base points times the multiplier, every full second left on the clock adds 10 points. The break plays a cartoon animation (the stack falls into tiles, the sound word pops up, the grade letter lands) and the score of the whole run is the sum over the five levels.

### BUG SQUASH

Sixty seconds, five hearts. Bugs crawl in from both sides of the screen in six waves of ten seconds each, and the sixth wave is announced as LAST STAND. A bug that touches the fighter bites and costs a heart (with a short grace period afterwards). With no hearts left the run ends early on a SYSTEM CRASH screen and still scores what was squashed; a run that lasts the full minute ends on TIME UP.

| Bug | Points | Health | Notes |
|---|---|---|---|
| Small | 10 | 1 | Crawls along the floor |
| Flying | 25 | 1 | The fastest of the three; the kick cannot reach it |
| Armoured | 50 | 3 | Slow, and worth the wait |

- J punch hits the nearest bug in front of the fighter, on the ground or in the air.
- K kick sweeps every ground bug in front of the fighter for 2 damage.
- L special hits every bug within a wide ring, flying ones included, for 3 damage and then needs five seconds to recharge. The HUD says L SPECIAL READY when it is available.
- Each squash within two and a half seconds of the previous one raises the combo. The score multiplier is 1 plus one step for every five combo points, up to times 8.

## Scores

Both modes keep a top-five list per mode: score and the fighter who earned it. It lives in the `bonus.scores` setting, which `settings.js` stores inside `brawl.settings` in localStorage as `{ benchmark: [{ s, f }], squash: [{ s, f }] }` (`s` the score, `f` the fighter's index in `ROSTER`), best first. A score of zero is never saved, and a run that is quit from the pause menu does not save either. The older `brawl.bonus` key is read once through the setting's `legacy` option, so a list saved by an earlier build carries over. Clearing site data clears the lists; nothing leaves the browser.

## For other features

`BONUS` is a global (bonus.js is a classic script):

- `BONUS.run(id, onDone, opts)` starts a bonus stage without the lobby. `id` is `'benchmark'` or `'squash'`. `opts.fighter` is a roster id (`'tibo'`) or an index; without it the fighter currently picked on the select screen is used. It returns `true` when the stage started and `false` when it could not: another stage is already running, the id is unknown, or a fight or the pause menu is on screen. `onDone(result)` is called after the player presses Enter on the result screen. When the player quits from the pause menu, `onDone(null)` is called instead. The previous `game.modeId` and `game.mode` are put back before the callback runs.
- `BONUS.open(id)` and `BONUS.close()` open the lobby and force the stage closed.
- `BONUS.active()` tells whether a stage is on screen. `BONUS.state()` returns a small snapshot (screen, tick, meter or bug list, score), which the tests use.
- `BONUS.best(id)` gives the best score, `BONUS.board(id)` the stored top five.
- `BONUS.last` holds the most recent result: `{ id, score, who, reason, rank, t, finished, ... }` with `grades`, `miss` and `mash` for the benchmark, and `kills`, `maxCombo` and `hp` for the bug hunt.
- `BONUS.seed` seeds the bug spawns, and `BONUS.STACKS` is the table above, so a later level can be added with one entry and its art.

How the arcade ladder could use it:

```js
// after the fight that ended the current rung, before the next one is built
if (!BONUS.run('benchmark', result => { if (result) ladder.bonus += result.score; nextFight(); }, { fighter: me.id })) nextFight();
```

## How it works

The minigames are a self-contained overlay. While one runs, `game.phase` stays `'title'` because the engine resets a custom phase that has no fighters. The `update` hook (order -50) runs before the title code, steps the minigame by one tick, and then clears the pressed keys so the title menu underneath sees nothing. The `drawTop` hook draws the opaque overlay over the title and repaints the touch buttons. The `musicTheme` hook asks for a track while a stage runs. Everything is tick based and seeded, so tests drive it with `hold(true)` and `step(n)`; no wall clock is used. All art is drawn with the existing sprites, `ptext` and canvas primitives, and all sound comes from `beep` and `thud`.

## Tests

`tools/tests/x-bonus.mjs`, run by `node tools/headless.mjs --test`. It checks that both modes are on the title menu and one player only, the lobby, a full scripted BENCHMARK BREAK (mash, a weak hit, a break with a grade, the end of the run with a score and a saved best that survives a reload, a timeout, pause and quit), a scripted BUG SQUASH (a bot that squashes bugs, the combo, pause, the end of the run, an idle run that crashes with no score, play again), the migration of the old `brawl.bonus` key, and `BONUS.run` (no lobby, callback timing, null on quit, refusal during a fight, `BONUS.close`).

## Known limits

- The title menu fits six entries with its two-column layout; with both bonus modes there are four on a plain build, and the features of other agents add more. Whoever merges the branches should look at the title once.
- Touch and gamepad play use the generic input layer. The touch flows are tested in the headless phone emulation (`tools/test-match.mjs`), not on a real device.
- Sound is limited to short synthesised effects and a borrowed music theme; there is no dedicated bonus music yet.
- Only five stacks and three bug types exist. More of either are a table entry plus a draw routine in `bonus.js`.
