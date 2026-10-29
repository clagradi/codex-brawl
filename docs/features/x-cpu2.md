# Smarter CPU opponents (x-cpu2)

Owner: the x-cpu2 agent. Code: `cpu2.js`. Tests: `tools/tests/x-cpu2.mjs`.

The computer opponent now has a personality per fighter, learns what you keep doing during a match, and plays at one of four levels. It all runs through the `input` hook of the extension layer, so the engine's own CPU is untouched underneath and takes over again if the new brain ever fails.

## What you will notice

### Personalities

Every fighter plays in a recognisable style. The style tag shows up under the level on the VS screen (for example `GRAPPLER STYLE`).

| Fighter | Tag | How it plays |
| --- | --- | --- |
| Tibo | SHIPPER | Mid range, quick pokes, dashes in and out, leans on its second special. |
| Poteto | ZONER | Stays far away, spams its first special from range, rarely jumps, rarely throws. |
| Dot | RUSHDOWN | Close range all the time, jumps in a lot, dashes in, throws a lot, guards little. |
| Wang | PUNISHER | Patient mid-far range, guards more than anyone else, hits back when you whiff. |
| Muse | GRAPPLER | Walks you down to throw range and throws far more than anyone else. |

Each profile sets how aggressive the fighter is, the range it likes, which special it prefers, how often it jumps in, guards, throws, dashes and taunts, and which pokes it mixes in. Taunts are short caps lines (`SHIPPED IT`, `HOT TAKE`, `LOW LOSS`, `TASK COMPLETE`, and so on); they are rare, only happen while you are far away, and never at NIGHTMARE.

### Adaptation

The CPU keeps a short memory of your habits during a match: jump-ins, jump attacks, low attacks, throws, special spam, projectiles, holding block, and whiffed attacks. The counters decay with time, so an old habit fades if you stop doing it. At higher levels the CPU leans on what it has seen:

- you jump in a lot: more anti-airs, and it stays back to let you land;
- you block a lot: more throws;
- you poke low or sweep: it guards low attacks more often;
- you throw a lot: it techs throws more often;
- you spam specials or projectiles: it closes the gap, jumps the projectile or guards it;
- you whiff attacks: it punishes the recovery.

The first time it has really read one of your habits, a small popup appears over the CPU fighter: `READ ANTI-AIR`, `READ THROWS`, `READ LOW GUARD`, `READ TECHS`, `READ CLOSES IN` or `READ PUNISHES`. Change your habit and it forgets.

Easy does not adapt at all, normal adapts a little, hard a lot, nightmare fully.

### Difficulty and NIGHTMARE

Difficulty is the `DIFFICULTY` row of the OPTIONS screen (the same row as before). It now has four values: EASY, NORMAL, HARD and NIGHTMARE. There is no new key and no new menu; NIGHTMARE is simply the fourth value of that row.

The level changes how the CPU plays, not only how hard it hits:

| Level | Reaction delay (ticks) | Blunders (random whiffs and bad calls) | Anti-air | Guard | Punish | Throw tech |
| --- | --- | --- | --- | --- | --- | --- |
| EASY | 18 | 30% | 14% | 16% | 7% | 5% |
| NORMAL | 10 | 17% | 38% | 46% | 25% | 22% |
| HARD | 6 | 8% | 62% | 74% | 52% | 50% |
| NIGHTMARE | 3 | 2% | 88% | 95% | 90% | 85% |

The percentages are the base chance per opportunity, before the personality and what the CPU has read about you move them. The reaction delay is real: the CPU sees you as you were a few ticks ago, so a slow, telegraphed move is easy to dodge on EASY and hard to beat on NIGHTMARE. Between the four anchors the skill is interpolated: the engine raises the CPU level a little after every round (`game.cpuLevel`, the ramp of the chosen difficulty), and the new brain follows that number, so the CPU plays a bit sharper the longer a match runs.

### The VS screen

In a one player match the VS screen shows a plate at the top centre: `CPU LEVEL EASY`, `CPU LEVEL NORMAL`, `CPU LEVEL HARD` or `CPU LEVEL NIGHTMARE` (NIGHTMARE pulses red), with the personality tag under it. Two player matches show nothing extra.

### CPU vs CPU (`#demo`)

When both fighters are CPUs (the attract demo, `#demo=i,j`) each side shows `TAG / LEVEL` under its health bar plus a small label with what the brain is doing right now (`ZONING`, `ANTI-AIR`, `GUARD`, `PRESSURE`, `TAUNT`, and so on). The demo uses two different personalities because the fighters are different. In a test or from the console you can give each side its own level with `CPU2.levels = ['hard', 'nightmare']`.

## Inputs

None. No new keys, chords or menu entries: the difficulty row on the OPTIONS screen already existed, and NIGHTMARE is its new fourth value.

## Where it does not apply

- Training, tutorial, practice and sandbox modes (any `game.modeId` matching `train|tutorial|practice|dummy|sandbox`) keep the engine's own dummy behaviour, so the training agent stays in control of its dummy.
- A fighter with `fighter.cpu2off = true` keeps the engine CPU. The tests use this to pit the new brain against the old one.
- Human fighters and the finisher phase are never touched.

## For other features and tests

`window.CPU2` is the public surface:

- `CPU2.enabled` turns the layer off (the engine CPU plays) or on.
- `CPU2.levels = [a, b]` overrides the level per side with a name (`'easy'`, `'normal'`, `'hard'`, `'nightmare'`) or a number from 0 to 1; `null` means the current setting.
- `CPU2.params(skill)` returns the interpolated numbers for a skill; `CPU2.TABLE`, `CPU2.ANCHORS` and `CPU2.PROFILES` hold the raw tuning tables and can be edited at runtime to tune.
- `CPU2.skillOf(fighter)`, `CPU2.levelName(skill)`, `CPU2.profileOf(fighter)` read the current level and personality.
- `CPU2.habits(side)` and `CPU2.reads(side)` return what has been counted about a side and how strongly the CPU has read it (0 to 1). `CPU2.intent(side)` returns the label of the CPU's current plan. `CPU2.reset()` clears the memory.

The layer also adds `DIFFICULTY.nightmare = [0.95, 0.05]` (CPU level and ramp) and the `nightmare` value of the `difficulty` setting at load time, in `cpu2.js`, without touching `game.js` or `settings.js`.

The brain replaces the CPU's input before the other `input` hooks run (order -50), so later hooks still see and can adjust the result. The input has no high/low guard yet: guarding against low attacks is modelled as a higher chance to hold block (down-back) when a low attack is coming. If a defense feature adds real high and low guards, the guard choice in `reactions()` is the place to adapt.

## Tests

`tools/tests/x-cpu2.mjs` checks: the four levels and a monotone skill curve; one distinct personality per fighter; that the hook never touches a human and steps aside in training and when disabled; a seeded CPU vs CPU match for every fighter that runs to the end and repeats exactly with the same seed; NIGHTMARE beating EASY over eight seeded fast matches with the sides swapped; a scripted jump-in and low-poke player being counted, read and answered with anti-airs and a `READ` popup; and the VS screen level plate and the `#demo` overlay.
